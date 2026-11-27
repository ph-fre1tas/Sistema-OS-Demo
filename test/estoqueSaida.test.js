const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

function preparar({ usuario = { id: 9, nome: "João Silva" } } = {}) {
    let movimentar;
    const consultas = [];
    const router = { use() {}, get() {}, put() {}, delete() {}, patch() {},
        post(caminho, ...handlers) {
            if (caminho === "/produtos/:id/movimentacoes") movimentar = handlers.at(-1);
        }
    };
    const cliente = { release() {}, async query(sql, valores) {
        consultas.push({ sql, valores: valores && Array.from(valores) });
        if (sql.includes("FROM usuarios")) return { rows: usuario ? [usuario] : [] };
        return { rows: [{ id: 1, estoque_atual: 10 }] };
    } };
    const dependencias = {
        express: { Router: () => router },
        "../db/db": { connect: async () => cliente },
        "../middleware/authmiddleware": { autenticarToken() {}, permitirPerfis: () => () => {} },
        "../db/errosBanco": { responderErroDoBanco: res => res.status(500).json({ erro: "Erro no banco" }) }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../routes/estoqueRoutes"), "utf8"), {
        require: nome => dependencias[nome], module: { exports: {} }, console
    });
    return { consultas, async executar(body) {
        const res = { codigo: 200, status(codigo) { this.codigo = codigo; return this; }, json(dados) { this.dados = dados; return this; } };
        await movimentar({ body, params: { id: "1" }, usuario: { id: 7, nome: "Maria" } }, res);
        return res;
    } };
}

test("saída para si usa a identidade autenticada e ignora nome enviado", async () => {
    const contexto = preparar();
    const resposta = await contexto.executar({ tipo: "SAIDA", quantidade: 2, recebedorTipo: "EU_MESMO", recebedorNome: "Nome forjado" });
    assert.equal(resposta.codigo, 201);
    const registro = contexto.consultas.find(c => c.sql.includes("INSERT INTO estoque_movimentacoes"));
    assert.deepEqual(registro.valores, ["1", "SAIDA", 2, 7, "Maria", "EU_MESMO", "Maria", 7]);
    assert.equal(contexto.consultas.at(-1).sql, "COMMIT");
});

test("saída para outra pessoa preserva responsável e salva nome sem espaços nas pontas", async () => {
    const contexto = preparar();
    assert.equal((await contexto.executar({ tipo: "SAIDA", quantidade: 2, recebedorTipo: "OUTRA", recebedorNome: " João Silva " })).codigo, 201);
    assert.deepEqual(contexto.consultas.find(c => c.sql.includes("INSERT INTO estoque_movimentacoes")).valores,
        ["1", "SAIDA", 2, 7, "Maria", "OUTRA", "João Silva", null]);
});

test("saída exige escolha válida e nome válido de outra pessoa antes de alterar saldo", async () => {
    for (const dados of [{}, { recebedorTipo: "INVALIDO" },
        ...[undefined, "", "  ", "x".repeat(121), 123, {}].map(recebedorNome => ({ recebedorTipo: "OUTRA", recebedorNome }))]) {
        const contexto = preparar();
        assert.equal((await contexto.executar({ tipo: "SAIDA", quantidade: 2, ...dados })).codigo, 400);
        assert.equal(contexto.consultas.length, 0);
    }
});

test("entrada continua sem recebedor e saída acima do saldo não grava movimentação", async () => {
    const entrada = preparar();
    assert.equal((await entrada.executar({ tipo: "ENTRADA", quantidade: 2 })).codigo, 201);
    assert.deepEqual(entrada.consultas.find(c => c.sql.includes("INSERT INTO estoque_movimentacoes")).valores.slice(5), [null, null, null]);
    const saida = preparar();
    assert.equal((await saida.executar({ tipo: "SAIDA", quantidade: 11, recebedorTipo: "EU_MESMO" })).codigo, 400);
    assert.equal(saida.consultas.at(-1).sql, "ROLLBACK");
    assert.equal(saida.consultas.some(c => c.sql.includes("INSERT INTO")), false);
});

test("formulário alterna nome do recebedor e envia somente os dados da escolha atual", async () => {
    const fonte = fs.readFileSync(require.resolve("../public/js/estoque.js"), "utf8");
    // Exercita o formulário isoladamente, sem carregar dados de um banco real.
    function elemento() {
        return { value: "", disabled: false, hidden: false, required: false, handlers: {},
            addEventListener(nome, handler) { this.handlers[nome] = handler; },
            focus() {}, setAttribute() {}, removeAttribute() {}, classList: { add() {} }, remove() {} };
    }
    const controles = {};
    const overlay = elemento();
    overlay.querySelector = seletor => controles[seletor] ||= elemento();
    Object.defineProperty(overlay, "innerHTML", { set(html) {
        assert.match(html, /id="grupoSaidaRecebedor" hidden/);
        assert.match(html, /value="EU_MESMO"/);
        assert.match(html, /id="saidaRecebedorNome"[^>]*disabled/);
        overlay.querySelector("#saidaRecebedorTipo").value = "EU_MESMO";
        overlay.querySelector("#grupoSaidaRecebedor").hidden = true;
        overlay.querySelector("#saidaRecebedorNome").disabled = true;
    } });
    const envios = [];
    const contexto = { document: { activeElement: null, getElementById: () => null,
        createElement: () => overlay, addEventListener() {}, removeEventListener() {},
        querySelector: () => elemento(), body: { appendChild() {} } },
        configurarRecebedores() {}, usuarioEstoque: { nome: "Maria" }, numero: String, setTimeout: fn => fn(),
        requisicaoEstoque: async (url, opcoes) => envios.push(JSON.parse(opcoes.body)), carregarEstoque: async () => {} };
    vm.runInNewContext(fonte.slice(fonte.indexOf("function abrirFormularioSaida("), fonte.indexOf("function editarProduto(")), contexto);
    contexto.abrirFormularioSaida({ id: 1, descricao: "Peça", estoque_atual: 10, unidade: "UN" });
    const tipo = controles["#saidaRecebedorTipo"];
    const nome = controles["#saidaRecebedorNome"];
    const grupo = controles["#grupoSaidaRecebedor"];
    assert.equal(grupo.hidden, true);
    assert.equal(controles["#saidaResponsavel"].value, "Maria");
    tipo.value = "OUTRA";
    tipo.handlers.change();
    assert.equal(grupo.hidden, false);
    assert.equal(nome.disabled, false);
    assert.equal(nome.required, true);
    controles["#saidaQuantidade"].value = "2";
    nome.value = "   ";
    await controles.form.handlers.submit({ preventDefault() {} });
    assert.equal(envios.length, 0);
    nome.value = "João";
    tipo.value = "EU_MESMO";
    tipo.handlers.change();
    assert.equal(grupo.hidden, true);
    assert.equal(nome.required, false);
    assert.equal(nome.disabled, true);
    assert.equal(nome.value, "");
    await controles.form.handlers.submit({ preventDefault() {} });
    assert.deepEqual(envios, [{ tipo: "SAIDA", quantidade: 2, recebedorTipo: "EU_MESMO" }]);

    contexto.abrirFormularioSaida({ id: 1, descricao: "Peça", estoque_atual: 10, unidade: "UN" });
    tipo.value = "OUTRA";
    tipo.handlers.change();
    nome.value = " João ";
    controles["#saidaQuantidade"].value = "3";
    await controles.form.handlers.submit({ preventDefault() {} });
    assert.deepEqual(envios[1], { tipo: "SAIDA", quantidade: 3, recebedorTipo: "OUTRA", recebedorNome: "João" });

    contexto.abrirFormularioSaida({ id: 1, descricao: "Peça", estoque_atual: 10, unidade: "UN" });
    tipo.value = "USUARIO:9";
    controles["#saidaQuantidade"].value = "1";
    await controles.form.handlers.submit({ preventDefault() {} });
    assert.deepEqual(envios[2], { tipo: "SAIDA", quantidade: 1, recebedorTipo: "USUARIO", recebedorUsuarioId: 9 });
});

test("usuário selecionado tem nome resolvido no banco e identidade preservada", async () => {
    const contexto = preparar();
    assert.equal((await contexto.executar({ tipo: "SAIDA", quantidade: 2, recebedorTipo: "USUARIO", recebedorUsuarioId: 9, recebedorNome: "Forjado" })).codigo, 201);
    assert.deepEqual(contexto.consultas.find(c => c.sql.includes("INSERT INTO estoque_movimentacoes")).valores,
        ["1", "SAIDA", 2, 7, "Maria", "USUARIO", "João Silva", 9]);
});

test("usuário inexistente ou inativo e identificadores inválidos não alteram saldo", async () => {
    const contexto = preparar({ usuario: null });
    assert.equal((await contexto.executar({ tipo: "SAIDA", quantidade: 2, recebedorTipo: "USUARIO", recebedorUsuarioId: 9 })).codigo, 400);
    assert.equal(contexto.consultas.at(-1).sql, "ROLLBACK");
    assert.equal(contexto.consultas.some(c => c.sql.includes("UPDATE estoque_produtos")), false);
    for (const id of [0, -1, "abc", undefined, 1.5]) {
        const invalido = preparar();
        assert.equal((await invalido.executar({ tipo: "SAIDA", quantidade: 2, recebedorTipo: "USUARIO", recebedorUsuarioId: id })).codigo, 400);
        assert.equal(invalido.consultas.length, 0);
    }
});

test("formulário de entrada contém apenas produto, saldo e quantidade e permite aumentar saldo", async () => {
    const fonte = fs.readFileSync(require.resolve("../public/js/estoque.js"), "utf8");
    const controles = {};
    const criar = () => ({ value: "", handlers: {}, addEventListener(n, h) { this.handlers[n] = h; },
        focus() {}, setAttribute() {}, removeAttribute() {}, remove() {}, classList: { add() {} } });
    const overlay = criar();
    overlay.querySelector = seletor => /Recebedor|Responsavel/.test(seletor) ? null : (controles[seletor] ||= criar());
    Object.defineProperty(overlay, "innerHTML", { set(html) {
        assert.doesNotMatch(html, /Quem recebeu|Registrado por|Nome de quem recebeu/);
        assert.equal((html.match(/<input /g) || []).length, 3);
    } });
    const envios = [];
    const contexto = { document: { getElementById: () => null, createElement: () => overlay,
        addEventListener() {}, removeEventListener() {}, querySelector: criar, body: { appendChild() {} } },
        numero: String, setTimeout: fn => fn(), carregarEstoque: async () => {},
        requisicaoEstoque: async (url, opcoes) => envios.push(JSON.parse(opcoes.body)) };
    vm.runInNewContext(fonte.slice(fonte.indexOf("function abrirFormularioSaida("), fonte.indexOf("function editarProduto(")), contexto);
    contexto.abrirFormularioSaida({ id: 1, descricao: "Peça", estoque_atual: 0, unidade: "UN" }, "ENTRADA");
    controles["#saidaQuantidade"].value = "20";
    await controles.form.handlers.submit({ preventDefault() {} });
    assert.deepEqual(envios, [{ tipo: "ENTRADA", quantidade: 20 }]);
});

test("menu busca nomes sem acento, mantém Outra pessoa no final e seleciona o usuário", async () => {
    const fonte = fs.readFileSync(require.resolve("../public/js/estoque.js"), "utf8");
    const criar = () => ({ value: "", hidden: true, handlers: {}, children: [],
        addEventListener(n, h) { this.handlers[n] = h; }, setAttribute() {}, focus() {},
        replaceChildren(...itens) { this.children = itens; },
        dispatchEvent(e) { this.evento = e.type; }, contains() { return false; } });
    const controles = {};
    const overlay = criar();
    overlay.querySelector = s => controles[s] ||= criar();
    const botao = overlay.querySelector("#abrirRecebedores");
    const legenda = criar();
    botao.querySelector = () => legenda;
    const tipo = criar();
    tipo.value = "EU_MESMO";
    const contexto = { usuarioEstoque: { id: 7, nome: "Maria" }, Event: class { constructor(type) { this.type = type; } },
        document: { createElement: criar }, requisicaoEstoque: async () => [{ id: 7, nome: "Maria" }, { id: 9, nome: "João Silva" }] };
    vm.runInNewContext(fonte.slice(fonte.indexOf("function configurarRecebedores("), fonte.indexOf("function abrirFormularioSaida(")), contexto);
    contexto.configurarRecebedores(overlay, tipo, () => false);
    await new Promise(resolve => setImmediate(resolve));
    const lista = controles["#opcoesRecebedores"];
    assert.deepEqual(Array.from(lista.children, item => item.textContent), ["Maria (Eu mesmo)", "João Silva", "Outra pessoa"]);
    controles["#buscarRecebedor"].value = "joao";
    controles["#buscarRecebedor"].handlers.input();
    assert.deepEqual(Array.from(lista.children, item => item.textContent), ["João Silva", "Outra pessoa"]);
    lista.children[0].handlers.click();
    assert.equal(tipo.value, "USUARIO:9");
    assert.equal(tipo.evento, "change");
    assert.equal(legenda.textContent, "João Silva");
    assert.equal(controles["#menuRecebedores"].hidden, true);
    controles["#buscarRecebedor"].value = "inexistente";
    controles["#buscarRecebedor"].handlers.input();
    assert.deepEqual(Array.from(lista.children, item => item.textContent), ["Outra pessoa"]);
});
