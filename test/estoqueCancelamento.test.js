const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

function prepararCancelamento({ movimentacao, erroNaAtualizacao = false } = {}) {
  let cancelarHandler;
  let liberado = 0;
  const consultas = [];

  const router = {
    use() {}, get() {}, post() {}, put() {}, delete() {},
    patch(caminho, ...handlers) {
      if (caminho === "/movimentacoes/:id/cancelar") {
        cancelarHandler = handlers.at(-1);
      }
    }
  };

  const cliente = {
    release() { liberado += 1; },
    async query(sql, valores) {
      consultas.push({ sql, valores: valores && Array.from(valores) });
      if (sql.includes("FOR UPDATE OF m, p")) {
        return { rows: movimentacao ? [movimentacao] : [] };
      }
      if (erroNaAtualizacao && sql.includes("UPDATE estoque_movimentacoes")) {
        throw new Error("Falha ao gravar cancelamento");
      }
      return { rows: [] };
    }
  };

  const dependencias = {
    express: { Router: () => router },
    "../db/db": { connect: async () => cliente },
    "../services/ferramentasService": require("../services/ferramentasService"),
    "../middleware/authmiddleware": { autenticarToken() {}, permitirPerfis: () => () => {} },
    "../db/errosBanco": { responderErroDoBanco: (res, _e, msg) => res.status(500).json({ erro: msg }) }
  };

  vm.runInNewContext(fs.readFileSync(require.resolve("../routes/estoqueRoutes"), "utf8"), {
    require: (nome) => dependencias[nome],
    module: { exports: {} },
    console: { error() {} }
  });

  async function executar(id = "12", usuario = { id: 1, nome: "Admin" }) {
    const res = {
      codigo: 200,
      dados: null,
      status(c) { this.codigo = c; return this; },
      json(d) { this.dados = d; return this; }
    };
    await cancelarHandler({ params: { id }, usuario }, res);
    return res;
  }

  return { executar, consultas, obterLiberacoes: () => liberado };
}

test("cancelamento de SAIDA devolve saldo atomicamente e registra autor", async () => {
  const ctx = prepararCancelamento({
    movimentacao: {
      id: 12,
      produto_id: 5,
      tipo: "SAIDA",
      quantidade: "4",
      cancelada_em: null,
      estoque_atual: "10",
      descricao: "Correia dentada"
    }
  });

  const res = await ctx.executar("12", { id: 3, nome: "Almoxarife" });
  assert.equal(res.codigo, 200);
  assert.equal(ctx.consultas[0].sql, "BEGIN");
  const updateSaldo = ctx.consultas.find((c) => c.sql.includes("UPDATE estoque_produtos"));
  assert.deepEqual(updateSaldo.valores, [4, 5]);
  const updateMov = ctx.consultas.find((c) => c.sql.includes("UPDATE estoque_movimentacoes"));
  assert.deepEqual(updateMov.valores, [3, "Almoxarife", 12]);
  assert.equal(ctx.consultas.at(-1).sql, "COMMIT");
  assert.equal(ctx.obterLiberacoes(), 1);
});

test("cancelamento de ENTRADA subtrai saldo quando há estoque suficiente e bloqueia saldo negativo com 409", async () => {
  const permitido = prepararCancelamento({
    movimentacao: {
      id: 15,
      produto_id: 8,
      tipo: "ENTRADA",
      quantidade: "6",
      cancelada_em: null,
      estoque_atual: "6",
      descricao: "Rolamento"
    }
  });
  assert.equal((await permitido.executar("15")).codigo, 200);
  assert.deepEqual(permitido.consultas.find((c) => c.sql.includes("UPDATE estoque_produtos")).valores, [-6, 8]);
  assert.equal(permitido.consultas.at(-1).sql, "COMMIT");

  const insuficiente = prepararCancelamento({
    movimentacao: {
      id: 16,
      produto_id: 8,
      tipo: "ENTRADA",
      quantidade: "7",
      cancelada_em: null,
      estoque_atual: "6",
      descricao: "Rolamento"
    }
  });
  const resInsuficiente = await insuficiente.executar("16");
  assert.equal(resInsuficiente.codigo, 409);
  assert.equal(insuficiente.consultas.some((c) => c.sql.includes("UPDATE estoque_produtos")), false);
  assert.equal(insuficiente.consultas.at(-1).sql, "ROLLBACK");
  assert.equal(insuficiente.obterLiberacoes(), 1);
});

test("cancelamento rejeita ID inválido (400), movimentação inexistente (404), duplicada (409) e faz ROLLBACK em falha", async () => {
  for (const idInvalido of ["0", "-3", "abc", "2147483648"]) {
    const invalido = prepararCancelamento();
    assert.equal((await invalido.executar(idInvalido)).codigo, 400);
    assert.equal(invalido.consultas.length, 0);
    assert.equal(invalido.obterLiberacoes(), 0);
  }

  const inexistente = prepararCancelamento({ movimentacao: null });
  assert.equal((await inexistente.executar("99")).codigo, 404);
  assert.equal(inexistente.consultas.at(-1).sql, "ROLLBACK");
  assert.equal(inexistente.obterLiberacoes(), 1);

  const jaCancelada = prepararCancelamento({
    movimentacao: {
      id: 18,
      produto_id: 2,
      tipo: "SAIDA",
      quantidade: "1",
      cancelada_em: "2026-10-10 12:00:00",
      estoque_atual: "5",
      descricao: "Parafuso"
    }
  });
  assert.equal((await jaCancelada.executar("18")).codigo, 409);
  assert.equal(jaCancelada.consultas.at(-1).sql, "ROLLBACK");

  const falha = prepararCancelamento({
    movimentacao: {
      id: 19,
      produto_id: 2,
      tipo: "SAIDA",
      quantidade: "1",
      cancelada_em: null,
      estoque_atual: "5",
      descricao: "Parafuso"
    },
    erroNaAtualizacao: true
  });
  assert.equal((await falha.executar("19")).codigo, 500);
  assert.equal(falha.consultas.at(-1).sql, "ROLLBACK");
  assert.equal(falha.obterLiberacoes(), 1);
});
