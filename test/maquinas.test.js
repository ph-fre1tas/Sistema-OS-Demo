const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const jwt = require("jsonwebtoken");
const { ErroMaquinas, validarCadastro } = require("../services/maquinasService");
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");

function criarAmbienteMaquinas() {
  const middlewares = [];
  const rotas = new Map();
  const consultas = [];
  let responderBanco = () => ({ rows: [] });
  let falharDDL = false;

  const router = {
    use(fn) { middlewares.push(fn); },
    get(caminho, ...handlers) { rotas.set(`GET ${caminho}`, handlers); },
    post(caminho, ...handlers) { rotas.set(`POST ${caminho}`, handlers); },
    put(caminho, ...handlers) { rotas.set(`PUT ${caminho}`, handlers); }
  };

  const pool = {
    async query(sql, valores) {
      consultas.push({ sql, valores: valores && Array.from(valores) });
      if (sql.includes("CREATE TABLE")) {
        if (falharDDL) {
          falharDDL = false;
          throw new Error("Banco temporariamente indisponível");
        }
        return { rows: [] };
      }
      return responderBanco(sql, valores);
    }
  };

  const dependencias = {
    express: { Router: () => router },
    "../db/db": pool,
    "../middleware/authmiddleware": { autenticarToken, permitirPerfis },
    "../db/errosBanco": { responderErroDoBanco: (res, _e, msg) => res.status(500).json({ erro: msg }) },
    "../services/maquinasService": { ErroMaquinas, validarCadastro }
  };

  vm.runInNewContext(fs.readFileSync(require.resolve("../routes/maquinasRoutes"), "utf8"), {
    require: (nome) => dependencias[nome],
    module: { exports: {} },
    console: { error() {} }
  });

  async function requisitar(chaveRota, { perfil, params = {}, body } = {}) {
    const headers = {};
    if (perfil) {
      const token = jwt.sign({ id: 7, nome: "Usuário", perfil }, process.env.JWT_SECRET, {
        algorithm: "HS256",
        expiresIn: "1h"
      });
      headers.authorization = `Bearer ${token}`;
    }

    const req = { headers, params, body };
    const res = {
      codigo: 200,
      dados: null,
      enviado: false,
      status(c) { this.codigo = c; return this; },
      json(d) { this.dados = d; this.enviado = true; return this; }
    };

    const cadeia = [...middlewares, ...(rotas.get(chaveRota) || [])];
    let indice = 0;
    let avancou = true;
    while (avancou && !res.enviado && indice < cadeia.length) {
      avancou = false;
      const fn = cadeia[indice++];
      await fn(req, res, () => { avancou = true; });
    }
    return res;
  }

  return {
    requisitar,
    consultas,
    definirResposta(fn) { responderBanco = fn; },
    simularFalhaInicialDDL() { falharDDL = true; }
  };
}

test("validarCadastro aceita dados limpos e bloqueia tamanhos inválidos ou nomes de foto inseguros", () => {
  assert.deepEqual(
    validarCadastro({
      codigo: " MAQ-01 ",
      nome: " Serra Circular ",
      setor: " Serraria ",
      marca: " Baldan ",
      modelo: " SC-300 ",
      observacoes: " Revisada ",
      foto: " serra_principal-01.WEBP "
    }),
    ["MAQ-01", "Serra Circular", "Serraria", "Baldan", "SC-300", "Revisada", "serra_principal-01.WEBP"]
  );

  assert.equal(validarCadastro({ codigo: "1", nome: "Prensa" })[6], null);

  for (const invalido of [
    null,
    {},
    { codigo: " ", nome: "Prensa" },
    { codigo: "1", nome: " " },
    { codigo: "x".repeat(61), nome: "Prensa" },
    { codigo: "1", nome: "x".repeat(161) },
    { codigo: "1", nome: "Prensa", observacoes: "x".repeat(4001) },
    { codigo: "1", nome: "Prensa", foto: "../segredo.png" },
    { codigo: "1", nome: "Prensa", foto: "subpasta/foto.jpg" },
    { codigo: "1", nome: "Prensa", foto: "script.svg" }
  ]) {
    assert.throws(() => validarCadastro(invalido), ErroMaquinas);
  }
});

test("rotas de máquinas respeitam permissões por perfil, unicidade de código e recuperação de DDL", async () => {
  const segredoAnterior = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "segredo-maquinas-teste";

  try {
    const env = criarAmbienteMaquinas();

    // Sem token retorna 401 antes de consultar o banco
    assert.equal((await env.requisitar("GET /")).codigo, 401);
    assert.equal(env.consultas.length, 0);

    // Se o CREATE TABLE falhar na primeira chamada, a próxima requisição consegue reinicializar
    env.simularFalhaInicialDDL();
    assert.equal((await env.requisitar("GET /", { perfil: "manutentor" })).codigo, 500);
    env.definirResposta(() => ({ rows: [{ id: 1, codigo: "M-01", nome: "Plaina" }] }));
    const listagem = await env.requisitar("GET /", { perfil: "manutentor" });
    assert.equal(listagem.codigo, 200);
    assert.equal(listagem.dados.length, 1);

    // Líder e compras não acessam máquinas; manutentor apenas consulta
    for (const perfilSemAcesso of ["lider", "compras"]) {
      assert.equal((await env.requisitar("GET /", { perfil: perfilSemAcesso })).codigo, 403);
      assert.equal((await env.requisitar("POST /", { perfil: perfilSemAcesso, body: { codigo: "M-02", nome: "Serra" } })).codigo, 403);
    }
    assert.equal((await env.requisitar("GET /:codigo", { perfil: "manutentor", params: { codigo: "M-01" } })).codigo, 200);
    assert.equal((await env.requisitar("POST /", { perfil: "manutentor", body: { codigo: "M-02", nome: "Serra" } })).codigo, 403);
    assert.equal((await env.requisitar("PUT /:codigo", { perfil: "manutentor", params: { codigo: "M-01" }, body: { codigo: "M-01", nome: "Plaina" } })).codigo, 403);

    // Admin e almoxarifado cadastram, editam e recebem 404/409 coerentes
    env.definirResposta((_sql, valores) => ({ rows: [{ id: 2, codigo: valores[0], nome: valores[1] }] }));
    for (const perfilGestao of ["admin", "almoxarifado"]) {
      const criado = await env.requisitar("POST /", {
        perfil: perfilGestao,
        body: { codigo: " M-02 ", nome: " Costura Reta ", foto: "costura.jpg" }
      });
      assert.equal(criado.codigo, 201);
      assert.equal(criado.dados.maquina.codigo, "M-02");
    }

    // Conflito de código único (23505) retorna 409
    env.definirResposta(() => {
      const erro = new Error("duplicate key");
      erro.code = "23505";
      throw erro;
    });
    assert.equal((await env.requisitar("POST /", {
      perfil: "admin",
      body: { codigo: "M-02", nome: "Duplicada" }
    })).codigo, 409);

    // Máquina não encontrada em GET /:codigo e PUT /:codigo retorna 404
    env.definirResposta(() => ({ rows: [] }));
    assert.equal((await env.requisitar("GET /:codigo", { perfil: "almoxarifado", params: { codigo: "INEXISTENTE" } })).codigo, 404);
    assert.equal((await env.requisitar("PUT /:codigo", {
      perfil: "almoxarifado",
      params: { codigo: "INEXISTENTE" },
      body: { codigo: "INEXISTENTE", nome: "Teste" }
    })).codigo, 404);
  } finally {
    if (segredoAnterior === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = segredoAnterior;
  }
});
