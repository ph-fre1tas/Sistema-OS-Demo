const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { createRequire } = require("node:module");
const { criarLimitadorLogin, normalizarIP, obterIP } = require("../middleware/loginLimitMiddleware");
const { criarArmazenamentoLimitesLogin } = require("../services/loginLimiteService");

// Relógio controlado e armazenamento compartilhado para os testes do middleware.
function criarMemoria() {
  const registros = new Map();
  let agora = 0;
  return {
    registros,
    avancar(segundos) { agora += segundos; },
    async consumir(chave, limite, janela) {
      let registro = registros.get(chave);
      if (!registro || registro.expira <= agora) registro = { total: 0, expira: agora + janela };
      registro.total++;
      registros.set(chave, registro);
      return { permitido: registro.total <= limite, espera: registro.expira - agora };
    }
  };
}

function requisicao(usuario = "operador", ip = "192.0.2.1") {
  return { body: { usuario, senha: "1234" }, headers: {}, socket: { remoteAddress: ip } };
}

async function executar(middleware, req = requisicao()) {
  const res = {
    statusCode: 200, headers: {}, liberado: false,
    status(codigo) { this.statusCode = codigo; return this; },
    setHeader(nome, valor) { this.headers[nome] = valor; },
    json(body) { this.body = body; return this; }
  };
  await middleware(req, res, () => { res.liberado = true; });
  return res;
}

test("conta é limitada mesmo alternando IP e espaços no nome", async () => {
  const memoria = criarMemoria();
  const limitar = criarLimitadorLogin(memoria, { ambienteVercel: false });
  for (let i = 1; i <= 10; i++) {
    assert.equal((await executar(limitar, requisicao(" operador ", `192.0.2.${i}`))).liberado, true);
  }
  const bloqueio = await executar(limitar, requisicao("operador", "192.0.2.100"));
  assert.equal(bloqueio.statusCode, 429);
  assert.equal(bloqueio.liberado, false);
  assert.equal(bloqueio.headers["Retry-After"], "900");
  assert.equal(bloqueio.headers["Cache-Control"], "no-store");
  assert.equal(bloqueio.body.tentarNovamenteEmSegundos, 900);
  assert.equal((await executar(limitar, requisicao("outro", "192.0.2.101"))).liberado, true);
  assert.ok([...memoria.registros.keys()].every((chave) => /^(ip|conta):[a-f0-9]{64}$/.test(chave)));
});

test("IP é limitado mesmo alternando contas, inclusive inexistentes", async () => {
  const memoria = criarMemoria();
  const limitar = criarLimitadorLogin(memoria, { ambienteVercel: false });
  for (let i = 0; i < 50; i++) assert.equal((await executar(limitar, requisicao(`conta${i}`))).liberado, true);
  const quantidade = memoria.registros.size;
  assert.equal((await executar(limitar, requisicao("mais-uma"))).statusCode, 429);
  assert.equal(memoria.registros.size, quantidade, "IP bloqueado não cria novos contadores de conta");
  assert.equal((await executar(limitar, requisicao("mais-uma", "192.0.2.2"))).liberado, true);
});

test("requisições concorrentes em instâncias distintas compartilham o limite", async () => {
  const memoria = criarMemoria();
  const instancias = [0, 1].map(() => criarLimitadorLogin(memoria, { ambienteVercel: false }));
  const respostas = await Promise.all(Array.from({ length: 20 }, (_, i) =>
    executar(instancias[i % 2], requisicao("operador", `192.0.2.${i + 1}`))));
  assert.equal(respostas.filter((res) => res.liberado).length, 10);
  assert.equal(respostas.filter((res) => res.statusCode === 429).length, 10);
});

test("tentativas bloqueadas não prolongam o bloqueio e a janela expira", async () => {
  const memoria = criarMemoria();
  const limitar = criarLimitadorLogin(memoria, { ambienteVercel: false });
  for (let i = 0; i < 10; i++) await executar(limitar);
  memoria.avancar(840);
  assert.equal((await executar(limitar)).headers["Retry-After"], "60");
  memoria.avancar(60);
  assert.equal((await executar(limitar)).liberado, true);
});

test("corpos inválidos consomem o limite por IP sem criar conta fictícia", async () => {
  const memoria = criarMemoria();
  const limitar = criarLimitadorLogin(memoria, { ambienteVercel: false });
  for (const body of [undefined, null, {}, { usuario: [] }, { usuario: {} }, { usuario: "   " }]) {
    assert.equal((await executar(limitar, { ...requisicao(), body })).liberado, true);
  }
  assert.equal(memoria.registros.size, 1);
});

test("origem do IP não confia em cabeçalhos arbitrários fora da Vercel", () => {
  const req = requisicao();
  req.headers["x-forwarded-for"] = "198.51.100.1";
  req.headers["x-vercel-forwarded-for"] = "203.0.113.1";
  assert.equal(obterIP(req, false), "192.0.2.1");
  assert.equal(obterIP(req, true), "203.0.113.1");
  req.headers["x-vercel-forwarded-for"] = "203.0.113.1, 198.51.100.1";
  assert.equal(obterIP(req, true), null);
});

test("IPv4 mapeado e IPv6 equivalente não permitem trocar a chave", () => {
  assert.equal(normalizarIP("::ffff:192.0.2.1"), normalizarIP("192.0.2.1"));
  assert.equal(normalizarIP("::ffff:c000:201"), "192.0.2.1");
  assert.equal(normalizarIP("2001:db8:1:2::1"), normalizarIP("2001:0db8:0001:0002:ffff::2"));
  assert.notEqual(normalizarIP("2001:db8:1:3::1"), normalizarIP("2001:db8:1:2::1"));
  for (const ip of [undefined, "", "desconhecido", "127.0.0.1:123", "fe80::1%eth0"]) assert.equal(normalizarIP(ip), null);
});

test("ausência de IP confiável bloqueia o login sem acessar o armazenamento", async () => {
  const limitar = criarLimitadorLogin({ consumir() { assert.fail("Não deve consumir"); } }, { ambienteVercel: true });
  const res = await executar(limitar);
  assert.equal(res.statusCode, 503);
  assert.equal(res.liberado, false);
});

test("falha do armazenamento bloqueia o login sem expor detalhes", async (t) => {
  t.mock.method(console, "error", () => {});
  const limitar = criarLimitadorLogin({ async consumir() { throw new Error("detalhe interno"); } }, { ambienteVercel: false });
  const res = await executar(limitar);
  assert.equal(res.statusCode, 503);
  assert.equal(res.liberado, false);
  assert.doesNotMatch(res.body.erro, /detalhe interno/);
});

test("falha na criação da tabela permite nova tentativa de inicialização", async () => {
  let falhar = true;
  const armazenamento = criarArmazenamentoLimitesLogin({
    async query(sql) {
      if (sql.includes("CREATE TABLE") && falhar) { falhar = false; throw new Error("indisponível"); }
      return { rows: [{ permitido: true, espera: 900 }] };
    }
  });
  await assert.rejects(armazenamento.consumir("conta:teste", 10, 900));
  assert.equal((await armazenamento.consumir("conta:teste", 10, 900)).permitido, true);
});

test("rota de login aplica o limite antes de consultar senha e mantém senha curta válida", async () => {
  const arquivo = path.resolve(__dirname, "../routes/authRoutes.js");
  const requireReal = createRequire(arquivo);
  const memoria = criarMemoria();
  const rotas = [];
  let consultas = 0;
  const modulo = { exports: {} };
  const opcoesSign = [];
  const dependencias = {
    express: { Router: () => ({ post: (...args) => rotas.push(args) }) },
    "../db/db": { async query() { consultas++; return { rows: [{ id: 1, ativo: true, perfil: "admin" }] }; } },
    "../services/loginLimiteService": { criarArmazenamentoLimitesLogin: () => memoria },
    "../middleware/loginLimitMiddleware": { criarLimitadorLogin: (store) => criarLimitadorLogin(store, { ambienteVercel: false }) },
    bcryptjs: { compare: async (senha) => senha === "1234" },
    jsonwebtoken: { sign: (_payload, _segredo, opcoes) => { opcoesSign.push(opcoes); return "token-de-teste"; } }
  };
  const carregar = vm.runInNewContext(`(function(require, module, process) { ${fs.readFileSync(arquivo, "utf8")}\n})`, { console });
  carregar((nome) => dependencias[nome] || requireReal(nome), modulo, { env: { JWT_SECRET: "teste" } });
  const [rota, limitar, autenticar] = rotas[0];
  assert.equal(rota, "/login");
  for (let i = 0; i < 11; i++) {
    const req = requisicao();
    const res = await executar(limitar, req);
    if (res.liberado) await autenticar(req, res);
    assert.equal(res.statusCode, i < 10 ? 200 : 429);
    if (i < 10) assert.equal(res.body.token, "token-de-teste");
  }
  assert.equal(consultas, 10);
  assert.equal(opcoesSign[0].algorithm, "HS256");
  assert.equal(opcoesSign[0].expiresIn, "12h");
});
