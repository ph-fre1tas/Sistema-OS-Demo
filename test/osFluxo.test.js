const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

function criarAmbienteOS({ responderQueryPool, responderQueryClient, erroEmail = false } = {}) {
  const rotas = new Map();
  const middlewares = [];
  const consultasPool = [];
  const consultasClient = [];
  const notificacoes = [];
  let emailsEnviados = 0;
  let releases = 0;

  const router = {
    use(fn) { middlewares.push(fn); },
    get(caminho, ...handlers) { rotas.set(`GET ${caminho}`, handlers); },
    post(caminho, ...handlers) { rotas.set(`POST ${caminho}`, handlers); },
    put(caminho, ...handlers) { rotas.set(`PUT ${caminho}`, handlers); }
  };

  const client = {
    release() { releases += 1; },
    async query(sql, valores) {
      consultasClient.push({ sql, valores: valores && Array.from(valores) });
      if (responderQueryClient) {
        return responderQueryClient(sql, valores, consultasClient);
      }
      return { rows: [] };
    }
  };

  const pool = {
    async connect() { return client; },
    async query(sql, valores) {
      consultasPool.push({ sql, valores: valores && Array.from(valores) });
      if (sql.includes("ALTER TABLE")) return { rows: [] };
      if (responderQueryPool) {
        return responderQueryPool(sql, valores, consultasPool);
      }
      return { rows: [] };
    }
  };

  const dependencias = {
    express: { Router: () => router },
    "../db/db": pool,
    "../db/errosBanco": { responderErroDoBanco: (res, _erro, msg) => res.status(500).json({ erro: msg }) },
    "../services/notificacaoService": {
      criarNotificacoesParaPerfis: async (_cli, perfis, dados) => {
        notificacoes.push({ perfis: Array.from(perfis), dados });
      }
    },
    "../services/emailService": {
      enviarEmailNovaOS: async () => {
        emailsEnviados += 1;
        if (erroEmail) throw new Error("Falha SMTP simulada");
      }
    },
    "../services/osConsultaService": { CAMPOS_PAUSAS_JSON: "'[]'::json AS pausas", buscarOSCompletaPorId: async () => null },
    "../services/osTempoService": { calcularTemposOS: () => ({}), formatarTemposOS: () => ({}) },
    "../services/osPdfDataService": { prepararDadosOSParaPdf: (os) => os },
    "../services/osPdfService": { gerarPdfOS: async () => Buffer.from("%PDF-1.4") },
    "../services/ferramentasService": require("../services/ferramentasService"),
    "../middleware/authmiddleware": {
      autenticarToken: (_req, _res, next) => next(),
      permitirPerfis: (...perfis) => (req, res, next) => (
        perfis.includes(req.usuario?.perfil)
          ? next()
          : res.status(403).json({ erro: "Sem permissão." })
      )
    }
  };

  vm.runInNewContext(fs.readFileSync(require.resolve("../routes/osRoutes"), "utf8"), {
    require: (nome) => dependencias[nome],
    module: { exports: {} },
    console: { log() {}, error() {} }
  });

  async function executar(chaveRota, { params = {}, body, query = {}, usuario = { id: 4, nome: "Pedro", perfil: "manutentor" } } = {}) {
    const req = { params, body, query, usuario };
    const res = {
      codigo: 200,
      dados: null,
      status(codigo) { this.codigo = codigo; return this; },
      json(dados) { this.dados = dados; return this; }
    };

    const cadeia = [...middlewares, ...(rotas.get(chaveRota) || [])];
    let indice = 0;
    let avancou = true;
    while (avancou && indice < cadeia.length) {
      avancou = false;
      const fn = cadeia[indice++];
      await fn(req, res, () => { avancou = true; });
    }
    return res;
  }

  return { executar, consultasPool, consultasClient, notificacoes, obterReleases: () => releases, obterEmails: () => emailsEnviados };
}

test("POST / cria OS aberta em transação, notifica perfis e não falha se o SMTP oscilar", async () => {
  const env = criarAmbienteOS({
    erroEmail: true,
    responderQueryPool: (sql) => sql.includes("SELECT email FROM usuarios")
      ? { rows: [{ email: "equipe@teste.local" }] }
      : { rows: [] },
    responderQueryClient: (sql) => sql.includes("INSERT INTO ordens_servico")
      ? { rows: [{ id: 15, maquina: "Prensa 2", area_manutencao: "Máquinas", criado_por_nome: "Carla" }] }
      : { rows: [] }
  });

  const resposta = await env.executar("POST /", {
    usuario: { id: 9, nome: "Carla", perfil: "lider" },
    body: {
      solicitante: " Marcos ",
      setor: "Acabamento especial",
      setor_outro: true,
      maquina: " Prensa 2 ",
      maquina_id: " PR-02 ",
      problema: " Vazamento hidráulico ",
      prioridade: "Urgente",
      area_manutencao: "Máquinas"
    }
  });

  assert.equal(resposta.codigo, 201);
  assert.equal(resposta.dados.os.id, 15);
  assert.equal(env.consultasClient[0].sql, "BEGIN");
  assert.equal(env.consultasClient.at(-1).sql, "COMMIT");
  assert.equal(env.obterReleases(), 1);
  assert.equal(env.obterEmails(), 1);
  assert.deepEqual(env.notificacoes[0].perfis, ["admin", "almoxarifado", "manutentor"]);
});

test("POST / executa ROLLBACK e libera o cliente quando ocorre erro no banco", async () => {
  const env = criarAmbienteOS({
    responderQueryClient: (sql) => {
      if (sql.includes("INSERT INTO ordens_servico")) throw new Error("Falha ao inserir");
      return { rows: [] };
    }
  });

  const resposta = await env.executar("POST /", {
    body: {
      solicitante: "Marcos",
      setor: "Serraria",
      maquina: "Serra",
      problema: " Correia frouxa ",
      prioridade: "Normal",
      area_manutencao: "Máquinas"
    }
  });

  assert.equal(resposta.codigo, 500);
  assert.equal(env.consultasClient.some((c) => c.sql === "ROLLBACK"), true);
  assert.equal(env.obterReleases(), 1);
});

test("fluxo de andamento, pausa, aguardando peça e retomada preserva registros em os_pausas", async () => {
  let statusAtual = "Aberta";
  let pausaAberta = true;

  const env = criarAmbienteOS({
    responderQueryPool: (sql) => {
      if (sql.includes("SET \n          status = 'Em andamento'") || sql.includes("status = 'Em andamento'")) {
        if (statusAtual !== "Aberta") return { rows: [] };
        statusAtual = "Em andamento";
        return { rows: [{ id: 10, status: statusAtual }] };
      }
      return { rows: [] };
    },
    responderQueryClient: (sql) => {
      if (sql.includes("SET\n          status = 'Pausada'") || sql.includes("status = 'Pausada'")) {
        if (statusAtual !== "Em andamento") return { rows: [] };
        statusAtual = "Pausada";
        pausaAberta = true;
        return { rows: [{ id: 10, status: "Pausada" }] };
      }
      if (sql.includes("status = 'Aguardando peça'")) {
        if (statusAtual !== "Em andamento") return { rows: [] };
        statusAtual = "Aguardando peça";
        pausaAberta = true;
        return { rows: [{ id: 10, status: "Aguardando peça" }] };
      }
      if (sql.includes("WHERE id = $1\n          AND status IN ('Aguardando peça', 'Pausada')")) {
        if (!["Pausada", "Aguardando peça"].includes(statusAtual)) return { rows: [] };
        statusAtual = "Em andamento";
        return { rows: [{ id: 10, status: "Em andamento" }] };
      }
      if (sql.includes("UPDATE os_pausas")) {
        return pausaAberta ? { rows: [{ id: 99 }] } : { rows: [] };
      }
      return { rows: [] };
    }
  });

  assert.equal((await env.executar("PUT /:id/pausar", { params: { id: "10" }, body: { motivo_pausa: "Falta energia" } })).codigo, 400);
  assert.equal((await env.executar("PUT /:id/andamento", { params: { id: "10" } })).codigo, 200);
  assert.equal((await env.executar("PUT /:id/andamento", { params: { id: "10" } })).codigo, 400, "Não reinicia OS já em andamento");

  const pausada = await env.executar("PUT /:id/pausar", { params: { id: "10" }, body: { motivo_pausa: " Troca de turno " } });
  assert.equal(pausada.codigo, 200);
  const insertPausa = env.consultasClient.find((c) => c.sql.includes("INSERT INTO os_pausas"));
  assert.deepEqual(insertPausa.valores.slice(0, 3), ["10", "Pausa", "Troca de turno"]);

  assert.equal((await env.executar("PUT /:id/retomar", { params: { id: "10" } })).codigo, 200);

  const aguardando = await env.executar("PUT /:id/aguardando-peca", { params: { id: "10" }, body: { peca_faltante: " Rolamento 6205 " } });
  assert.equal(aguardando.codigo, 200);
  const insertPeca = env.consultasClient.filter((c) => c.sql.includes("INSERT INTO os_pausas")).at(-1);
  assert.deepEqual(insertPeca.valores.slice(0, 3), ["10", "Aguardando peça", "Rolamento 6205"]);

  // Se não houver pausa aberta no banco ao retomar, desfaz a transação
  pausaAberta = false;
  assert.equal((await env.executar("PUT /:id/retomar", { params: { id: "10" } })).codigo, 400);
  assert.equal(env.consultasClient.at(-1).sql, "ROLLBACK");
});

test("conclusão grava múltiplos manutentores deduplicados e cancelamento encerra pausa aberta", async () => {
  let manutentoresValidos = [{ id: 2 }, { id: 5 }];
  const env = criarAmbienteOS({
    responderQueryClient: (sql) => {
      if (sql.includes("SELECT id FROM usuarios")) return { rows: manutentoresValidos };
      if (sql.includes("status = 'Concluída'")) {
        return { rows: [{ id: 20, maquina: "Coladeira", status: "Concluída" }] };
      }
      if (sql.includes("status = 'Cancelada'")) {
        return { rows: [{ id: 21, maquina: "Bordadeira", status: "Cancelada" }] };
      }
      return { rows: [] };
    }
  });

  // Regra do ID 2 exige nome Marcelo
  const erroMarcelo = await env.executar("PUT /:id/concluir", {
    params: { id: "20" },
    body: {
      solucao: "Troca de eixo",
      manutentores: [{ id: 2, nome: "Outro Nome" }, { id: 5, nome: "João" }]
    }
  });
  assert.equal(erroMarcelo.codigo, 400);

  const concluida = await env.executar("PUT /:id/concluir", {
    params: { id: "20" },
    body: {
      solucao: " Troca de rolamento e alinhamento ",
      manutentores: [
        { id: 2, nome: " Marcelo " },
        { id: 5, nome: " João " },
        { id: 5, nome: "João" },
        "Terceirizado"
      ]
    }
  });
  assert.equal(concluida.codigo, 200);
  const updateConclusao = env.consultasClient.find((c) => c.sql.includes("status = 'Concluída'"));
  assert.equal(updateConclusao.valores[0], "Troca de rolamento e alinhamento");
  assert.equal(updateConclusao.valores[3], "Marcelo, João, Terceirizado");
  const vinculo = env.consultasClient.find((c) => c.sql.includes("INSERT INTO ordem_servico_manutentores"));
  assert.deepEqual([vinculo.valores[0], Array.from(vinculo.valores[1])], [20, [2, 5]]);
  assert.deepEqual(env.notificacoes.at(-1).perfis, ["admin", "almoxarifado", "lider"]);

  // Usuário inexistente/inválido faz ROLLBACK
  manutentoresValidos = [{ id: 5 }];
  const invalido = await env.executar("PUT /:id/concluir", {
    params: { id: "20" },
    body: { solucao: "Ajuste", manutentores: [{ id: 2, nome: "Marcelo" }, { id: 5, nome: "João" }] }
  });
  assert.equal(invalido.codigo, 400);

  // Cancelamento fecha pausas em aberto na mesma transação
  const cancelada = await env.executar("PUT /:id/cancelar", {
    params: { id: "21" },
    body: { motivo_cancelamento: " Aberta em duplicidade " }
  });
  assert.equal(cancelada.codigo, 200);
  assert.equal(env.consultasClient.some((c) => c.sql.includes("UPDATE os_pausas") && c.sql.includes("data_fim_pausa IS NULL")), true);
  assert.equal(env.consultasClient.at(-1).sql, "COMMIT");
});
