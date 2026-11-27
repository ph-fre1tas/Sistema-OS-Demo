const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const {
  ErroValidacaoRelatorio,
  normalizarFiltrosRelatorio,
  normalizarFormatoRelatorio,
  normalizarIdsResultado,
  prepararDadosRelatorioParaPdf,
  prepararResultadoRelatorio,
  resumirOrdens
} = require("../services/osRelatorioService");
const { gerarPdfRelatorio } = require("../services/osRelatorioPdfService");
const { textoQuantidadePausas } = require("../services/osRelatorioPdfLayout");

const DATA_GERACAO = new Date("2026-09-15T17:32:00.000Z");

function criarOS(id, sobrescritas = {}) {
  return {
    id,
    solicitante: `Solicitante ${id}`,
    setor: "Produção",
    maquina: `Máquina ${id}`,
    maquina_id: String(id),
    problema: `Problema registrado na OS ${id}.`,
    prioridade: "Normal",
    status: "Concluída",
    data_criacao: "2026-09-01T11:00:00.000Z",
    data_inicio: "2026-09-01T12:00:00.000Z",
    data_conclusao: "2026-09-01T13:00:00.000Z",
    data_cancelamento: null,
    concluido_por_nome: "Administrador",
    manutentor_responsavel_nome: "João",
    solucao: `Serviço executado na OS ${id}.`,
    pausas: [],
    ...sobrescritas
  };
}

function filtrosPadrao(sobrescritas = {}) {
  return normalizarFiltrosRelatorio({
    status: "Todas",
    data_referencia: "criacao",
    prioridade: "Todas",
    ...sobrescritas
  });
}

function contarPaginas(pdf) {
  return (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
}

test("normaliza seleção múltipla, remove duplicatas e mantém ordem canônica", () => {
  const filtros = normalizarFiltrosRelatorio({
    status: ["Pausada", "Concluída", "Pausada"],
    data_referencia: "conclusao",
    data_inicio: "2026-09-01",
    data_fim: "2026-09-30",
    prioridade: "Urgente"
  });

  assert.deepEqual(filtros.status, ["Concluída", "Pausada"]);
  assert.equal(filtros.dataReferencia, "conclusao");
  assert.equal(filtros.prioridade, "Urgente");
});

test("Todas representa os seis status reais do sistema", () => {
  const filtros = filtrosPadrao();
  assert.deepEqual(filtros.status, [
    "Concluída",
    "Em andamento",
    "Pausada",
    "Aguardando peça",
    "Aberta",
    "Cancelada"
  ]);
});

test("normaliza a pesquisa complementar sem substituir status e prioridade", () => {
  const filtros = filtrosPadrao({
    busca: "  João   da Silva  ",
    status: "Em andamento",
    prioridade: "Urgente"
  });

  assert.equal(filtros.busca, "João da Silva");
  assert.deepEqual(filtros.status, ["Em andamento"]);
  assert.equal(filtros.prioridade, "Urgente");

  const resultado = prepararResultadoRelatorio([], filtros);
  assert.match(resultado.consulta.apresentacao.resumo, /Pesquisa: João da Silva/);
});

test("omite pesquisa vazia e limita seu tamanho", () => {
  assert.equal(filtrosPadrao({ busca: "   " }).busca, null);
  assert.throws(
    () => filtrosPadrao({ busca: "x".repeat(121) }),
    ErroValidacaoRelatorio
  );
});

test("rejeita status, referência, prioridade, formato e período inválidos", () => {
  assert.throws(
    () => normalizarFiltrosRelatorio({ status: "Inexistente" }),
    ErroValidacaoRelatorio
  );
  assert.throws(
    () => normalizarFiltrosRelatorio({ data_referencia: "os.data_criacao; DROP TABLE" }),
    ErroValidacaoRelatorio
  );
  assert.throws(
    () => normalizarFiltrosRelatorio({ prioridade: "Alta" }),
    ErroValidacaoRelatorio
  );
  assert.throws(
    () => normalizarFiltrosRelatorio({ data_inicio: "2026-09-31" }),
    ErroValidacaoRelatorio
  );
  assert.throws(
    () => normalizarFiltrosRelatorio({ data_inicio: "2026-09-20", data_fim: "2026-09-10" }),
    ErroValidacaoRelatorio
  );
  assert.throws(() => normalizarFormatoRelatorio("planilha"), ErroValidacaoRelatorio);
});

test("IDs da tela são validados, deduplicados e preservam a ordem", () => {
  assert.deepEqual(normalizarIdsResultado([8, "3", 8, 5]), [8, 3, 5]);
  assert.throws(() => normalizarIdsResultado([1, "x"]), ErroValidacaoRelatorio);
  assert.throws(() => normalizarIdsResultado([2147483648]), ErroValidacaoRelatorio);
  assert.throws(
    () => normalizarIdsResultado(Array.from({ length: 1001 }, (_, i) => i + 1)),
    ErroValidacaoRelatorio
  );
});

test("resumo sempre apresenta seis status e as duas prioridades", () => {
  const ordens = [
    criarOS(1),
    criarOS(2, { status: "Em andamento", prioridade: "Urgente" }),
    criarOS(3, { status: "Pausada", prioridade: "Urgente" }),
    criarOS(4, { status: "Aguardando peça" }),
    criarOS(5, { status: "Aberta" }),
    criarOS(6, { status: "Cancelada", data_conclusao: null, data_cancelamento: "2026-09-02T13:00:00.000Z" })
  ];
  const resumo = resumirOrdens(ordens);

  assert.equal(resumo.total, 6);
  assert.equal(resumo.porStatus.length, 6);
  assert.equal(resumo.porStatus.reduce((total, item) => total + item.total, 0), 6);
  assert.deepEqual(resumo.porPrioridade, { urgentes: 2, normais: 4 });
});

test("tabela usa exatamente a data de referência selecionada e preserva a ordem", () => {
  const filtros = filtrosPadrao({ data_referencia: "inicio" });
  const ordens = [
    criarOS(9, { data_inicio: "2026-09-05T15:30:00.000Z" }),
    criarOS(4, { data_inicio: null })
  ];
  const resultado = prepararResultadoRelatorio(ordens, filtros);

  assert.deepEqual(resultado.ordens.map((os) => os.id), [9, 4]);
  assert.match(resultado.ordens[0].dataReferencia, /05\/09\/2026/);
  assert.equal(resultado.ordens[1].dataReferencia, null);
});

test("resumido mantém somente a quantidade real de pausas e omite seus detalhes", () => {
  const os = criarOS(21, {
    pausas: [
      {
        tipo_pausa: "Aguardando peça",
        motivo: "ROLAMENTO-SENTINELA",
        pausado_por_nome: "USUARIO-SENTINELA",
        data_inicio_pausa: "2026-09-01T12:10:00.000Z",
        data_fim_pausa: "2026-09-01T12:20:00.000Z",
        retomado_por_nome: "RETOMADA-SENTINELA"
      }
    ]
  });
  const dados = prepararDadosRelatorioParaPdf([os], filtrosPadrao(), "resumido", DATA_GERACAO);

  assert.equal(dados.ordens[0].quantidadePausas, 1);
  assert.equal(Object.hasOwn(dados.ordens[0], "pausas"), false);
  assert.equal(JSON.stringify(dados.ordens).includes("ROLAMENTO-SENTINELA"), false);
  assert.equal(textoQuantidadePausas(1), "1 pausa registrada");
  assert.equal(textoQuantidadePausas(3), "3 pausas registradas");
});

test("detalhado reutiliza os dados completos preparados para o PDF individual", () => {
  const os = criarOS(21, {
    pausas: [{
      tipo_pausa: "Pausa",
      motivo: "Máquina em produção",
      data_inicio_pausa: "2026-09-01T12:10:00.000Z",
      data_fim_pausa: "2026-09-01T12:20:00.000Z"
    }]
  });
  const dados = prepararDadosRelatorioParaPdf([os], filtrosPadrao(), "detalhado", DATA_GERACAO);

  assert.equal(dados.ordens[0].pausas.length, 1);
  assert.equal(dados.ordens[0].tempos.parado, "00:10:00");
  assert.equal(dados.ordens[0].acaoFinal.titulo, "O que foi feito");
});

test("PDF resumido cria resumo exclusivo e páginas de listagem sem quantidade fixa", async () => {
  const ordens = [criarOS(1), criarOS(2), criarOS(3)];
  const dados = prepararDadosRelatorioParaPdf(ordens, filtrosPadrao(), "resumido", DATA_GERACAO);
  const pdf = await gerarPdfRelatorio(dados);

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(contarPaginas(pdf) >= 2);
});

test("PDF detalhado usa paginação única e inicia cada OS após o resumo", async () => {
  const dados = prepararDadosRelatorioParaPdf(
    [criarOS(10), criarOS(11)],
    filtrosPadrao(),
    "detalhado",
    DATA_GERACAO
  );
  const pdf = await gerarPdfRelatorio(dados);

  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.ok(contarPaginas(pdf) >= 3);
});

test("relatórios com textos longos e muitas OS avançam páginas sem limitar resultados", async () => {
  const textoLongo = "Texto longo pesquisável para validar a paginação do relatório coletivo. ".repeat(120);
  const ordens = Array.from({ length: 8 }, (_, indice) => criarOS(indice + 1, {
    problema: textoLongo,
    solucao: textoLongo
  }));
  const dados = prepararDadosRelatorioParaPdf(ordens, filtrosPadrao(), "resumido", DATA_GERACAO);
  const pdf = await gerarPdfRelatorio(dados);

  assert.ok(contarPaginas(pdf) > 8);
});

test("consulta de relatório escapa curingas %, _ e \\ no ILIKE", async () => {
  const consultas = [];
  const modulo = { exports: {} };
  vm.runInNewContext(fs.readFileSync(require.resolve("../services/osConsultaService.js"), "utf8"), {
    module: modulo,
    Object,
    Array,
    Error,
    require: (nome) => nome === "../db/db"
      ? { async query(sql, valores) { consultas.push({ sql, valores }); return { rows: [] }; } }
      : assert.fail(`Dependência inesperada: ${nome}`)
  });

  const filtros = filtrosPadrao({ busca: "MAQ_01\\50%" });
  await modulo.exports.buscarOSParaRelatorio(filtros);

  assert.equal(consultas.length, 1);
  assert.equal(consultas[0].valores[1], "%MAQ\\_01\\\\50\\%%");
  assert.match(consultas[0].sql, /os\.maquina ILIKE \$2 ESCAPE '\\'/);
});
