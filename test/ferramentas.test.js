const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const express = require("express");
const jwt = require("jsonwebtoken");
const { validarCadastro, consultaHistorico, idValido } = require("../services/ferramentasService");

function criarRouter(pool) {
    const modulo = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve("../routes/ferramentasRoutes"), "utf8"), {
        module: modulo, console,
        require: nome => nome === "../db/db" ? pool : require(nome.startsWith("../") ? require.resolve(nome) : nome)
    });
    return modulo.exports;
}

test("cadastro só aceita tipo e marca válidos; números não são fornecidos pelo cliente", () => {
    assert.deepEqual(validarCadastro({ tipo: " Parafusadeira ", marca: " Bosch ", id: 99 }), ["Parafusadeira", "Bosch"]);
    for (const body of [null, {}, { tipo: " ", marca: "Bosch" }, { tipo: [], marca: "Bosch" }, { tipo: "A", marca: "x".repeat(101) }]) {
        assert.throws(() => validarCadastro(body));
    }
    for (const id of [0, -1, 1.5, "1 OR 1=1", null, [1], 2147483648]) assert.equal(idValido(id), false);
    assert.equal(idValido("123"), true);
});

test("histórico filtra concluídos, escapa pesquisa e usa período local inclusivo com paginação", () => {
    const consulta = consultaHistorico({ busca: "Bosch_%'", inicio: "2026-10-01", fim: "2026-10-08", pagina: "2" });
    assert.match(consulta.sql, /devolvido_em IS NOT NULL/);
    assert.match(consulta.sql, /America\/Sao_Paulo/);
    assert.match(consulta.sql, /::date \+ 1/);
    assert.match(consulta.sql, /LIMIT 51 OFFSET \$4/);
    assert.ok(!consulta.sql.includes("Bosch"));
    assert.deepEqual(consulta.valores, ["%Bosch\\_\\%'%", "2026-10-01", "2026-10-08", 50]);
    for (const entrada of [{ inicio: "2026-02-30" }, { inicio: "2026-10-09", fim: "2026-10-08" }, { pagina: 0 }, { busca: ["a"] }]) {
        assert.throws(() => consultaHistorico(entrada));
    }
});

test("API protege todas as rotas e valida cadastro, retirada, conflitos e devolução", async t => {
    process.env.JWT_SECRET = "ferramentas-test-secret";
    const consultas = [];
    let resultado = { rows: [] };
    let erroBanco;
    const pool = { async query(sql, valores) {
        consultas.push({ sql, valores });
        if (sql.includes("CREATE TABLE")) return { rows: [] };
        if (erroBanco) throw erroBanco;
        return resultado;
    } };
    const app = express();
    app.use(express.json());
    app.use("/api/ferramentas", criarRouter(pool));
    const servidor = app.listen(0, "127.0.0.1");
    await new Promise(resolve => servidor.once("listening", resolve));
    t.after(() => new Promise(resolve => servidor.close(resolve)));
    const url = `http://127.0.0.1:${servidor.address().port}/api/ferramentas`;
    async function requisicao(path = "", method = "GET", body, perfil = "almoxarifado") {
        const token = jwt.sign({ id: 7, perfil }, process.env.JWT_SECRET, { expiresIn: "1h" });
        const res = await fetch(url + path, { method,
            headers: { "Content-Type": "application/json", ...(perfil ? { Authorization: `Bearer ${token}` } : {}) },
            body: body === undefined ? undefined : JSON.stringify(body) });
        return { status: res.status, dados: await res.json() };
    }
    for (const [path, method] of [["", "GET"], ["", "POST"], ["/1", "PUT"], ["/funcionarios", "GET"],
        ["/emprestimos", "GET"], ["/emprestimos", "POST"], ["/emprestimos/1/devolver", "PUT"], ["/historico", "GET"]]) {
        for (const perfil of ["lider", "manutentor", "compras"]) {
            assert.equal((await requisicao(path, method, undefined, perfil)).status, 403);
        }
    }
    assert.equal(consultas.length, 0, "Acesso negado não prepara nem consulta o banco");
    assert.equal((await requisicao("", "GET", undefined, null)).status, 401);
    for (const perfil of ["admin", "almoxarifado"]) assert.equal((await requisicao("", "GET", undefined, perfil)).status, 200);
    const ddl = consultas.find(c => c.sql.includes("CREATE TABLE")).sql;
    assert.match(ddl, /CREATE UNIQUE INDEX[\s\S]*ferramenta_id\) WHERE devolvido_em IS NULL/);
    assert.match(ddl, /TIMESTAMPTZ/);
    assert.match(ddl, /ALTER COLUMN funcionario_id DROP NOT NULL/);

    let antes = consultas.length;
    assert.equal((await requisicao("", "POST", { tipo: "", marca: "Bosch" })).status, 400);
    assert.equal(consultas.length, antes);
    resultado = { rows: [{ id: 4, tipo: "Parafusadeira", marca: "Bosch" }] };
    assert.equal((await requisicao("", "POST", { id: 100, tipo: " Parafusadeira ", marca: "Bosch" })).status, 201);
    assert.deepEqual(Array.from(consultas.at(-1).valores), ["Parafusadeira", "Bosch"]);
    assert.equal((await requisicao("/4", "PUT", { tipo: "Furadeira", marca: "Bosch" })).status, 200);
    assert.doesNotMatch(consultas.at(-1).sql, /UPDATE ferramentas_emprestimos/);
    assert.doesNotMatch(consultas.at(-1).sql, /SET id/);
    resultado = { rows: [] };
    assert.equal((await requisicao("/99", "PUT", { tipo: "A", marca: "B" })).status, 404);

    antes = consultas.length;
    assert.equal((await requisicao("/emprestimos", "POST", { ferramentaId: -1, funcionarioId: 1 })).status, 400);
    assert.equal(consultas.length, antes);
    const retirada = { ferramentaId: 4, funcionarioId: 8 };
    assert.equal((await requisicao("/emprestimos", "POST", retirada)).status, 400, "Rejeita ferramenta inexistente/funcionário inativo");
    resultado = { rows: [{ id: 12 }] };
    assert.equal((await requisicao("/emprestimos", "POST", retirada)).status, 201);
    assert.deepEqual(Array.from(consultas.at(-1).valores), [4, 8, 7]);
    assert.match(consultas.at(-1).sql, /u.ativo = true/);
    // Um nome enviado junto com usuário cadastrado não substitui o nome do banco.
    await requisicao("/emprestimos", "POST", { ...retirada, funcionarioNome: "Nome forjado" });
    assert.deepEqual(Array.from(consultas.at(-1).valores), [4, 8, 7]);
    for (const funcionarioNome of [undefined, "", "  ", [], "x".repeat(121)]) {
        antes = consultas.length;
        assert.equal((await requisicao("/emprestimos", "POST", { ferramentaId: 4, funcionarioId: "OUTRO", funcionarioNome })).status, 400);
        assert.equal(consultas.length, antes);
    }
    assert.equal((await requisicao("/emprestimos", "POST", { ferramentaId: 4, funcionarioId: "OUTRO", funcionarioNome: "  Maria Silva  " })).status, 201);
    assert.deepEqual(Array.from(consultas.at(-1).valores), [4, "Maria Silva", 7]);
    assert.match(consultas.at(-1).sql, /NULL, \$2, \$3/);
    resultado = { rows: [] };
    assert.equal((await requisicao("/emprestimos", "POST", { ferramentaId: 99, funcionarioId: "OUTRO", funcionarioNome: "Maria Silva" })).status, 400);
    resultado = { rows: [{ id: 12 }] };
    erroBanco = { code: "23505" };
    assert.equal((await requisicao("/emprestimos", "POST", retirada)).status, 409);
    erroBanco = null;

    assert.equal((await requisicao("/emprestimos/12/devolver", "PUT")).status, 200);
    assert.match(consultas.at(-1).sql, /WHERE id = \$1 AND devolvido_em IS NULL/);
    assert.deepEqual(Array.from(consultas.at(-1).valores), ["12", 7]);
    resultado = { rows: [] };
    assert.equal((await requisicao("/emprestimos/12/devolver", "PUT")).status, 409, "Repetição não sobrescreve data e responsável");
    resultado = { rows: Array.from({ length: 51 }, (_, id) => ({ id })) };
    const historico = await requisicao("/historico?pagina=2");
    assert.equal(historico.dados.registros.length, 50);
    assert.equal(historico.dados.temProxima, true);
    assert.equal(historico.dados.pagina, 2);
    assert.equal((await requisicao("/historico?inicio=2026-02-30")).status, 400);
});
