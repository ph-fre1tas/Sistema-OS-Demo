const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const { isDemoMode, bloquearEscritaEmModoDemo } = require("../middleware/demoMiddleware");

function criarRespostaMock() {
  return {
    statusCode: 200,
    body: null,
    status(codigo) {
      this.statusCode = codigo;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    }
  };
}

test("demoMiddleware permite escrita quando DEMO_MODE não está ativo", () => {
  const anterior = process.env.DEMO_MODE;
  delete process.env.DEMO_MODE;

  try {
    assert.equal(isDemoMode(), false);
    let passou = false;
    bloquearEscritaEmModoDemo(
      { method: "POST", path: "/os" },
      criarRespostaMock(),
      () => { passou = true; }
    );
    assert.equal(passou, true);
  } finally {
    if (anterior !== undefined) process.env.DEMO_MODE = anterior;
  }
});

test("demoMiddleware em DEMO_MODE=true libera GET e exportações/login e bloqueia escrita com 423", () => {
  const anterior = process.env.DEMO_MODE;
  process.env.DEMO_MODE = "true";

  try {
    assert.equal(isDemoMode(), true);

    for (const req of [
      { method: "GET", path: "/os/abertas" },
      { method: "POST", path: "/login" },
      { method: "POST", path: "/demo-login" },
      { method: "POST", path: "/pedidos-compra/excel" },
      { method: "POST", path: "/pedidos-compra/pdf" },
      { method: "POST", path: "/relatorios/os/pdf" }
    ]) {
      let passou = false;
      bloquearEscritaEmModoDemo(req, criarRespostaMock(), () => { passou = true; });
      assert.equal(passou, true, `Deveria permitir ${req.method} ${req.path}`);
    }

    for (const req of [
      { method: "POST", path: "/os" },
      { method: "PUT", path: "/os/1/andamento" },
      { method: "DELETE", path: "/estoque/produtos/1" },
      { method: "PATCH", path: "/estoque/movimentacoes/1/cancelar" }
    ]) {
      let passou = false;
      const res = criarRespostaMock();
      bloquearEscritaEmModoDemo(req, res, () => { passou = true; });
      assert.equal(passou, false, `Deveria bloquear ${req.method} ${req.path}`);
      assert.equal(res.statusCode, 423);
      assert.equal(res.body.demoReadOnly, true);
    }
  } finally {
    if (anterior === undefined) delete process.env.DEMO_MODE;
    else process.env.DEMO_MODE = anterior;
  }
});

test("emailService ignora envio real de e-mail quando DEMO_MODE=true", async () => {
  let criouTransporter = false;
  const moduloEmail = { exports: {} };

  vm.runInNewContext(fs.readFileSync(require.resolve("../services/emailService.js"), "utf8"), {
    module: moduloEmail,
    process: { env: { DEMO_MODE: "true", EMAIL_USER: "a@b.com", EMAIL_PASS: "123" } },
    console: { log() {}, error() {} },
    Intl,
    Date,
    require: () => ({
      createTransport: () => {
        criouTransporter = true;
        return { sendMail: async () => ({ messageId: "1" }) };
      }
    })
  });

  const retorno = await moduloEmail.exports.enviarEmailNovaOS({
    os: { id: 42 },
    emailsDestino: ["destino@teste.local"]
  });

  assert.equal(criouTransporter, false);
  assert.equal(retorno?.demoSkipped, true);
});
