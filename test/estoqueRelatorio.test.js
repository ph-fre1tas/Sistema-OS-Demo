const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { prepararConsultaRetiradas, ErroConsultaRetiradas } = require("../services/estoqueRelatorioService");

test("consulta busca produto, responsável e recebedor com parâmetros e paginação", () => {
    const consulta = prepararConsultaRetiradas({ busca: "João 10%_", data_inicio: "2026-10-01", data_fim: "2026-10-06", pagina: "2", situacao: "todas" });
    assert.deepEqual(consulta.valores, ["%João 10\\%\\_%", "2026-10-01", "2026-10-06", 50]);
    assert.match(consulta.sql, /p.descricao ILIKE \$1 OR m.usuario_nome ILIKE \$1 OR m.recebedor_nome ILIKE \$1/);
    assert.match(consulta.sql, /m.tipo = 'SAIDA'/);
    assert.match(consulta.sql, /recebedor_nome IS NOT NULL/);
    assert.doesNotMatch(consulta.sql, /cancelada_em IS NULL/);
    assert.match(consulta.sql, /America\/Sao_Paulo/);
    assert.match(consulta.sql, /::date \+ 1/);
    assert.match(consulta.sql, /ORDER BY m.criado_em DESC, m.id DESC LIMIT 51 OFFSET \$4/);
});

test("consulta rejeita datas impossíveis, intervalo invertido e parâmetros inválidos", () => {
    for (const filtros of [{ data_inicio: "2026-02-30" }, { data_fim: "ontem" },
        { data_inicio: "2026-10-06", data_fim: "2026-10-01" }, { busca: ["João"] },
        { busca: "x".repeat(121) }, { pagina: 0 }, { pagina: 1.5 }, { pagina: "abc" }]) {
        assert.throws(() => prepararConsultaRetiradas(filtros), ErroConsultaRetiradas);
    }
    assert.deepEqual(prepararConsultaRetiradas({}).valores, [0]);
    assert.doesNotThrow(() => prepararConsultaRetiradas({ data_inicio: "2024-02-29" }));
});

test("rota de retiradas retorna 50 registros e indica próxima página sem gerar PDF", async () => {
    let handler;
    const router = { use() {}, post() {}, put() {}, delete() {}, patch() {}, get(caminho, ...handlers) {
        if (caminho === "/retiradas") handler = handlers.at(-1);
    } };
    const dependencias = { express: { Router: () => router },
        "../db/db": { query: async () => ({ rows: Array.from({ length: 51 }, (_, id) => ({ id })) }) },
        "../middleware/authmiddleware": { autenticarToken() {}, permitirPerfis: () => () => {} },
        "../db/errosBanco": {}, "../services/estoqueRelatorioService": { prepararConsultaRetiradas, ErroConsultaRetiradas } };
    vm.runInNewContext(fs.readFileSync(require.resolve("../routes/estoqueRoutes"), "utf8"), {
        require: nome => dependencias[nome], module: { exports: {} }, console
    });
    const res = { status(codigo) { this.codigo = codigo; return this; }, json(dados) { this.dados = dados; } };
    await handler({ query: {} }, res);
    assert.equal(res.dados.retiradas.length, 50);
    assert.equal(res.dados.temProxima, true);
    assert.equal(res.dados.pagina, 1);
    await handler({ query: { data_inicio: "invalida" } }, res);
    assert.equal(res.codigo, 400);
});

test("seletor alterna filtros e resultados sem misturar OS e estoque e suporta teclado", () => {
    const elementos = {};
    const el = id => elementos[id] ||= { handlers: {}, dataset: {}, attrs: {}, addEventListener(n, h) { this.handlers[n] = h; },
        setAttribute(n, v) { this.attrs[n] = v; }, focus() { this.focado = true; } };
    vm.runInNewContext(fs.readFileSync(require.resolve("../public/js/relatorios-estoque"), "utf8"), {
        verificarLogin: () => ({ perfil: "admin" }), document: { getElementById: el, querySelector: el }
    });
    el("aba-relatorios-estoque").handlers.click();
    assert.equal(el("painel-filtros-os").hidden, true);
    assert.equal(el("conteudo-resultados-os").hidden, true);
    assert.equal(el("conteudo-resultados-estoque").hidden, false);
    assert.equal(el("aba-relatorios-estoque").attrs["aria-selected"], "true");
    assert.equal(el(".relatorios-seletor").dataset.aba, "estoque");
    el("aba-relatorios-estoque").handlers.keydown({ key: "ArrowLeft", preventDefault() {} });
    assert.equal(el("conteudo-resultados-estoque").hidden, true);
    assert.equal(el("painel-filtros-os").hidden, false);
    assert.equal(el("aba-relatorios-os").focado, true);
});

test("situação inicia em confirmadas e permite canceladas ou todas", () => {
    assert.match(prepararConsultaRetiradas({}).sql, /m.cancelada_em IS NULL/);
    assert.match(prepararConsultaRetiradas({ situacao: "canceladas" }).sql, /m.cancelada_em IS NOT NULL/);
    assert.doesNotMatch(prepararConsultaRetiradas({ situacao: "todas" }).sql, /m.cancelada_em IS/);
    assert.throws(() => prepararConsultaRetiradas({ situacao: "invalida" }), ErroConsultaRetiradas);
});

test("compras abre estoque sem seletor e almoxarifado pode alternar os dois relatórios", () => {
    for (const perfil of ["compras", "almoxarifado"]) {
        const elementos = {};
        const el = id => elementos[id] ||= { handlers: {}, dataset: {}, attrs: {}, addEventListener(n, h) { this.handlers[n] = h; },
            setAttribute(n, v) { this.attrs[n] = v; }, removeAttribute(n) { delete this.attrs[n]; }, focus() {} };
        vm.runInNewContext(fs.readFileSync(require.resolve("../public/js/relatorios-estoque"), "utf8"), {
            verificarLogin: () => ({ perfil }), document: { getElementById: el, querySelector: el }
        });
        assert.equal(el(".relatorios-seletor").hidden, perfil === "compras");
        assert.equal(el("painel-filtros-os").hidden, perfil === "compras");
        el("aba-relatorios-os").handlers.click();
        assert.equal(el("painel-filtros-os").hidden, perfil === "compras");
        el("aba-relatorios-estoque").handlers.click();
        assert.equal(el("painel-filtros-estoque").hidden, false);
    }
});
