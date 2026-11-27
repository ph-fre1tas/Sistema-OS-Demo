const assert = require("node:assert/strict");
const test = require("node:test");
const { calcularTemposOS } = require("../services/osTempoService");
const { prepararDadosOSParaPdf } = require("../services/osPdfDataService");
const { gerarPdfOS, LOGO_OFICIAL_PATH } = require("../services/osPdfService");
const { resolverLogoPdf } = require("../services/osPdfLayout");

const DATA_GERACAO = new Date("2026-09-11T18:47:10.000Z");

function criarOS(sobrescritas = {}) {
  return {
    id: 21,
    solicitante: "Marcos",
    setor: "Serraria",
    maquina: "Plaina",
    maquina_id: "1",
    problema: "Exemplo de OS",
    prioridade: "Urgente",
    status: "Concluída",
    data_inicio: "2026-09-11T18:46:00.000Z",
    data_conclusao: "2026-09-11T18:46:46.000Z",
    concluido_por_nome: "Administrador",
    manutentor_responsavel_nome: "João",
    solucao: "Ajuste realizado",
    pausas: [],
    ...sobrescritas
  };
}

function criarPausa(inicio, fim, sobrescritas = {}) {
  return {
    tipo_pausa: "Pausa",
    motivo: "Máquina em produção",
    pausado_por_nome: "Administrador",
    data_inicio_pausa: inicio,
    data_fim_pausa: fim,
    retomado_por_nome: "Administrador",
    ...sobrescritas
  };
}

test("OS concluída sem pausa mantém todo o período como andamento", () => {
  const tempos = calcularTemposOS(criarOS());
  assert.deepEqual(tempos, {
    ateFinalizar: 46,
    parado: 0,
    andamentoReal: 46
  });
});

test("OS concluída com uma pausa reutiliza a regra 46/11/35 do Histórico", () => {
  const os = criarOS({
    pausas: [criarPausa("2026-09-11T18:46:10.000Z", "2026-09-11T18:46:21.000Z")]
  });
  const dados = prepararDadosOSParaPdf(os, DATA_GERACAO);

  assert.equal(dados.tempos.ateFinalizar, "00:00:46");
  assert.equal(dados.tempos.parado, "00:00:11");
  assert.equal(dados.tempos.andamentoReal, "00:00:35");
  assert.equal(dados.pausas.length, 1);
});

test("OS com várias pausas soma todas as ocorrências", () => {
  const os = criarOS({
    data_conclusao: "2026-09-11T18:47:00.000Z",
    pausas: [
      criarPausa("2026-09-11T18:46:10.000Z", "2026-09-11T18:46:20.000Z"),
      criarPausa("2026-09-11T18:46:30.000Z", "2026-09-11T18:46:45.000Z"),
      criarPausa("2026-09-11T18:46:50.000Z", "2026-09-11T18:46:55.000Z")
    ]
  });

  assert.deepEqual(calcularTemposOS(os), {
    ateFinalizar: 60,
    parado: 30,
    andamentoReal: 30
  });
});

test("Aguardando peça preserva o tipo e a apresentação de motivo do sistema", () => {
  const os = criarOS({
    pausas: [criarPausa(
      "2026-09-11T18:46:10.000Z",
      "2026-09-11T18:46:20.000Z",
      { tipo_pausa: "Aguardando peça", motivo: "Rolamento 6204" }
    )]
  });
  const dados = prepararDadosOSParaPdf(os, DATA_GERACAO);
  const campos = Object.fromEntries(dados.pausas[0].campos.map((campo) => [campo.rotulo, campo.valor]));

  assert.equal(campos.Tipo, "Aguardando peça");
  assert.equal(campos.Motivo, "Faltando: Rolamento 6204");
});

test("campos opcionais inexistentes são omitidos", () => {
  const dados = prepararDadosOSParaPdf(criarOS({
    maquina: "Plaina / Corte: Nº 1?",
    maquina_id: null,
    manutentor_responsavel_nome: null,
    solucao: null
  }), DATA_GERACAO);
  const rotulos = dados.detalhes.map((campo) => campo.rotulo);

  assert.equal(rotulos.includes("ID da máquina"), false);
  assert.equal(rotulos.includes("Manutentor"), false);
  assert.equal(dados.acaoFinal, null);
  assert.equal(dados.pausas.length, 0);
  assert.equal(/[<>:"/\\|?*]/.test(dados.nomeArquivo), false);
});

test("OS sem conclusão não inventa data final, ação ou tempos", () => {
  const dados = prepararDadosOSParaPdf(criarOS({
    status: "Em andamento",
    data_conclusao: null,
    concluido_por_nome: null,
    manutentor_responsavel_nome: null,
    solucao: null
  }), DATA_GERACAO);

  assert.equal(dados.detalhes.some((campo) => campo.rotulo === "Data final"), false);
  assert.equal(dados.detalhes.some((campo) => campo.rotulo === "Responsável"), false);
  assert.equal(dados.tempos, null);
  assert.equal(dados.acaoFinal, null);
});

test("textos longos e muitas pausas geram múltiplas páginas válidas", async () => {
  const textoLongo = "Descrição detalhada do atendimento com conteúdo pesquisável. ".repeat(180);
  const pausas = Array.from({ length: 14 }, (_, indice) => criarPausa(
    `2026-09-11T18:${String(10 + indice * 2).padStart(2, "0")}:00.000Z`,
    `2026-09-11T18:${String(11 + indice * 2).padStart(2, "0")}:00.000Z`,
    { motivo: `Ocorrência ${indice + 1} registrada durante a manutenção.` }
  ));
  const dados = prepararDadosOSParaPdf(criarOS({
    data_conclusao: "2026-09-11T19:00:00.000Z",
    problema: textoLongo,
    solucao: textoLongo,
    pausas
  }), DATA_GERACAO);
  const pdf = await gerarPdfOS(dados);
  const textoPdf = pdf.toString("latin1");
  const paginas = (textoPdf.match(/\/Type\s*\/Page\b/g) || []).length;

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(paginas > 1);
});

test("pausas anteriores ao início são truncadas em data_inicio e intervalos sobrepostos são mesclados", () => {
  const os = criarOS({
    data_inicio: "2026-09-11T18:46:00.000Z",
    data_conclusao: "2026-09-11T18:47:00.000Z",
    pausas: [
      criarPausa("2026-09-11T18:45:00.000Z", "2026-09-11T18:46:10.000Z"),
      criarPausa("2026-09-11T18:46:20.000Z", "2026-09-11T18:46:40.000Z"),
      criarPausa("2026-09-11T18:46:30.000Z", "2026-09-11T18:46:50.000Z")
    ]
  });

  assert.deepEqual(calcularTemposOS(os), {
    ateFinalizar: 60,
    parado: 40,
    andamentoReal: 20
  });
});

test("logo oficial é cacheada em Buffer e logoPath customizado é preservado", () => {
  const buffer1 = resolverLogoPdf(LOGO_OFICIAL_PATH);
  const buffer2 = resolverLogoPdf();
  assert.equal(Buffer.isBuffer(buffer1), true);
  assert.equal(buffer1, buffer2);
  assert.equal(resolverLogoPdf("/tmp/logo-custom.png"), "/tmp/logo-custom.png");
});
