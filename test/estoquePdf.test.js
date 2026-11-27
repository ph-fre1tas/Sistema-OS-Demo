const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { prepararConsultaRetiradas } = require("../services/estoqueRelatorioService");
const { gerarEstoqueRelatorioPdf } = require("../services/estoqueRelatorioPdfService");
const { desenharRelatorioRetiradas, dataLocal } = require("../services/estoqueRelatorioPdfLayout");
const { criarDocumentoBase } = require("../services/osPdfLayout");
const { gerarBufferPdf } = require("../services/pdfBufferService");
const { LOGO_OFICIAL_PATH } = require("../services/osPdfService");

const filtros = { busca: "", data_inicio: "2026-10-01", data_fim: "2026-10-06", situacao: "todas" };
function retirada(id, extras = {}) {
    return { id, produto_descricao: `PRODUTO-${id}`, quantidade: "12.5", unidade: "UNIDADE",
        usuario_nome: "Administrador", recebedor_nome: "João", criado_em: "2026-10-06 17:00:00",
        cancelada_em: null, ...extras };
}

test("exportação usa os mesmos filtros da tela sem LIMIT/OFFSET ou limite de 50 registros", () => {
    const entrada = { ...filtros, busca: "João 10%_", pagina: "3" };
    const tela = prepararConsultaRetiradas(entrada);
    const pdf = prepararConsultaRetiradas(entrada, { paginar: false });
    assert.equal(tela.sql.replace(/ LIMIT 51 OFFSET \$\d+$/, ""), pdf.sql);
    assert.deepEqual(tela.valores.slice(0, -1), pdf.valores);
    assert.deepEqual(pdf.filtros, { ...filtros, busca: entrada.busca });
    assert.doesNotMatch(pdf.sql, /LIMIT|OFFSET/);
});

test("agrupamento usa o dia de São Paulo para timestamps com ou sem fuso", () => {
    assert.equal(dataLocal("2026-10-06 02:59:59"), "05/10/2026");
    assert.equal(dataLocal("2026-10-06T03:00:00Z"), "06/10/2026");
    assert.equal(dataLocal("2026-10-06T00:00:00-03:00"), "06/10/2026");
});

test("PDF inclui todos os registros, totais, continuação e rodapés sem sobreposição", async () => {
    const registros = Array.from({ length: 115 }, (_, i) => retirada(i + 1, {
        cancelada_em: i < 3 ? "2026-10-06 18:00:00" : null,
        criado_em: i < 80 ? "2026-10-06 17:00:00" : "2026-10-06 02:00:00"
    }));
    const doc = criarDocumentoBase();
    const textos = [];
    const original = doc.text.bind(doc);
    doc.text = (valor, x, y, opcoes) => {
        textos.push(String(valor));
        assert.ok(y >= 0 && y <= 810, `texto fora da página: ${valor} (${y})`);
        assert.ok(doc.widthOfString(String(valor)) <= opcoes.width + .1, `texto excede coluna: ${valor}`);
        return original(valor, x, y, opcoes);
    };
    const buffer = await gerarBufferPdf(doc, d => desenharRelatorioRetiradas(d, registros, filtros, new Date("2026-10-06T18:00:00Z"), LOGO_OFICIAL_PATH));
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    for (const registro of registros) assert.equal(textos.filter(t => t === registro.produto_descricao).length, 1);
    for (const valor of ["115", "112", "3", "05/10/2026", "06/10/2026 (continuação)", "Cancelada"]) assert.ok(textos.includes(valor), valor);
    const paginas = (buffer.toString("latin1").match(/\/Type \/Page\b/g) || []).length;
    assert.ok(paginas > 3);
    for (let i = 1; i <= paginas; i++) assert.ok(textos.includes(`Página ${i} de ${paginas}`));
});

test("PDF suporta resultados vazios, busca longa e campos maiores que uma página", async () => {
    for (const registros of [[], [retirada(1, { produto_descricao: "Descrição comprida ".repeat(500), recebedor_nome: "Nome completo ".repeat(10) })]]) {
        const buffer = await gerarEstoqueRelatorioPdf(registros, { ...filtros, busca: "\n".repeat(120) });
        assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    }
});

test("rota PDF gera o arquivo completo e rejeita filtros inválidos antes do banco", async () => {
    let handler, chamadas = 0;
    const router = { use() {}, post() {}, put() {}, delete() {}, patch() {}, get(caminho, ...handlers) {
        if (caminho === "/retiradas/pdf") handler = handlers.at(-1);
    } };
    const registros = Array.from({ length: 70 }, (_, i) => retirada(i));
    const dependencias = { express: { Router: () => router },
        "../db/db": { query: async sql => { chamadas++; assert.doesNotMatch(sql, /LIMIT|OFFSET/); return { rows: registros }; } },
        "../middleware/authmiddleware": { autenticarToken() {}, permitirPerfis: () => () => {} },
        "../db/errosBanco": { responderErroDoBanco: () => assert.fail("erro inesperado") },
        "../services/estoqueRelatorioService": require("../services/estoqueRelatorioService"),
        "../services/estoqueRelatorioPdfService": { gerarEstoqueRelatorioPdf: async (dados, filtrosRecebidos) => {
            assert.equal(dados.length, 70); assert.equal(filtrosRecebidos.situacao, "todas"); return Buffer.from("%PDF-teste");
        } } };
    vm.runInNewContext(fs.readFileSync(require.resolve("../routes/estoqueRoutes"), "utf8"), {
        require: nome => dependencias[nome], module: { exports: {} }, console
    });
    const res = { headers: {}, setHeader(k, v) { this.headers[k] = v; }, send(v) { this.body = v; },
        status(v) { this.codigo = v; return this; }, json(v) { this.body = v; } };
    await handler({ query: { situacao: "todas" } }, res);
    assert.equal(res.headers["Content-Type"], "application/pdf");
    assert.match(res.headers["Content-Disposition"], /attachment/);
    assert.equal(res.body.toString(), "%PDF-teste");
    await handler({ query: { data_inicio: "2026-02-30" } }, res);
    assert.equal(res.codigo, 400);
    assert.equal(chamadas, 1);
});

test("botão exporta filtros consultados sem página, bloqueia duplicação e invalida ao editar", async () => {
    const elementos = {};
    const criarElemento = () => ({ value: "", disabled: false, handlers: {}, dataset: {}, children: [],
        addEventListener(n, h) { this.handlers[n] = h; }, setAttribute() {},
        appendChild(v) { this.children.push(v); }, replaceChildren() { this.children = []; } });
    const el = id => elementos[id] ||= criarElemento();
    el("situacao-retiradas").value = "todas";
    el("busca-retiradas").value = "João";
    el("form-retiradas").elements = [el("busca-retiradas"), el("btn-consultar-retiradas")];
    el("btn-gerar-retiradas-pdf").disabled = true;
    const downloads = [];
    let concluirDownload;
    vm.runInNewContext(fs.readFileSync(require.resolve("../public/js/relatorios-estoque"), "utf8"), {
        verificarLogin: () => ({ perfil: "admin" }),
        document: { getElementById: el, querySelector: el, createElement: criarElemento },
        localStorage: { getItem: () => "token" }, AbortController, URLSearchParams,
        fetch: async () => ({ ok: true, json: async () => ({ retiradas: [retirada(1)], pagina: 2, temProxima: true }) }),
        window: { OSPdfDownload: { baixarArquivo: opcoes => {
            downloads.push(opcoes); return new Promise(resolve => { concluirDownload = resolve; });
        } } }
    });
    await el("btn-gerar-retiradas-pdf").handlers.click();
    assert.equal(downloads.length, 0);
    el("form-retiradas").handlers.submit({ preventDefault() {} });
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(el("btn-gerar-retiradas-pdf").disabled, false);
    const pendente = el("btn-gerar-retiradas-pdf").handlers.click();
    assert.equal(el("busca-retiradas").disabled, true);
    assert.equal(el("retiradas-proxima").disabled, true);
    await el("btn-gerar-retiradas-pdf").handlers.click();
    assert.equal(downloads.length, 1);
    const url = new URL(downloads[0].url, "http://localhost");
    assert.equal(url.searchParams.get("busca"), "João");
    assert.equal(url.searchParams.get("situacao"), "todas");
    assert.equal(url.searchParams.has("pagina"), false);
    concluirDownload();
    await pendente;
    assert.equal(el("busca-retiradas").disabled, false);
    assert.equal(el("retiradas-proxima").disabled, false);
    el("form-retiradas").handlers.input();
    assert.equal(el("btn-gerar-retiradas-pdf").disabled, true);
    await el("btn-gerar-retiradas-pdf").handlers.click();
    assert.equal(downloads.length, 1);
});
