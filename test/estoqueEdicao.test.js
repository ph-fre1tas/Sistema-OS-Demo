const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

function preparar({ rows = [{ id: 1 }], erro } = {}) {
    let atualizar;
    const consultas = [];
    const router = { use() {}, get() {}, post() {}, delete() {}, patch() {},
        put(caminho, permissao, handler) {
            assert.equal(caminho, "/produtos/:id");
            assert.equal(permissao, "admin,almoxarifado,compras");
            atualizar = handler;
        }
    };
    const dependencias = {
        express: { Router: () => router },
        "../db/db": { async query(sql, valores) {
            consultas.push({ sql, valores: Array.from(valores) });
            if (erro) throw erro;
            return { rows };
        } },
        "../middleware/authmiddleware": { autenticarToken() {}, permitirPerfis: (...perfis) => perfis.join(",") },
        "../db/errosBanco": { responderErroDoBanco: res => res.status(500).json({ erro: "Erro no banco" }) }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve("../routes/estoqueRoutes"), "utf8"), {
        require: nome => dependencias[nome], module: { exports: {} }, console
    });
    return { consultas, async executar(body) {
        const res = { codigo: 200, status(codigo) { this.codigo = codigo; return this; },
            json(dados) { this.dados = dados; return this; } };
        await atualizar({ body, params: { id: "1" } }, res);
        return res;
    } };
}

test("edição salva nome, mínimo e unidade sem modificar o saldo", async () => {
    const contexto = preparar();
    const resposta = await contexto.executar({ descricao: " Correia ", estoqueMinimo: 3, unidade: "metro" });
    assert.equal(resposta.codigo, 200);
    assert.deepEqual(contexto.consultas[0].valores, [3, "1", "Correia", "METRO"]);
    assert.doesNotMatch(contexto.consultas[0].sql, /estoque_atual\s*=/);
});

test("edição preserva compatibilidade com atualização somente do mínimo", async () => {
    const contexto = preparar();
    assert.equal((await contexto.executar({ estoqueMinimo: 0 })).codigo, 200);
    assert.deepEqual(contexto.consultas[0].valores, [0, "1", null, null]);
});

test("edição rejeita dados inválidos antes de acessar o banco", async () => {
    for (const dados of [
        { descricao: " " }, { descricao: "x".repeat(161) }, { unidade: "" },
        { unidade: "x".repeat(41) }, { estoqueMinimo: -1 }, { estoqueMinimo: 2.5 }, { estoqueMinimo: "" },
        { estoqueMinimo: null }, { estoqueMinimo: "abc" }, { estoqueMinimo: 1e10 }
    ]) {
        const contexto = preparar();
        const resposta = await contexto.executar({ descricao: "Correia", unidade: "METRO", estoqueMinimo: 0, ...dados });
        assert.equal(resposta.codigo, 400);
        assert.equal(contexto.consultas.length, 0);
    }
});

test("edição informa produto inexistente e nome duplicado", async () => {
    const dados = { descricao: "Correia", unidade: "METRO", estoqueMinimo: 0 };
    assert.equal((await preparar({ rows: [] }).executar(dados)).codigo, 404);
    const resposta = await preparar({ erro: { code: "23505" } }).executar(dados);
    assert.equal(resposta.codigo, 400);
    assert.match(resposta.dados.erro, /Já existe/);
});
