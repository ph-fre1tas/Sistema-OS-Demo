const { buscarOSParaRelatorio } = require("./osConsultaService");
const {
  formatarData,
  prepararDadosOSParaPdf,
  tornarNomeArquivoSeguro
} = require("./osPdfDataService");

const STATUS_RELATORIO = Object.freeze([
  { valor: "Concluída", rotulo: "Concluídas" },
  { valor: "Em andamento", rotulo: "Em andamento" },
  { valor: "Pausada", rotulo: "Pausadas" },
  { valor: "Aguardando peça", rotulo: "Aguardando peça" },
  { valor: "Aberta", rotulo: "Abertas" },
  { valor: "Cancelada", rotulo: "Canceladas" }
]);

const DATAS_REFERENCIA = Object.freeze({
  criacao: { rotulo: "Criação", campo: "data_criacao" },
  inicio: { rotulo: "Início", campo: "data_inicio" },
  conclusao: { rotulo: "Conclusão", campo: "data_conclusao" },
  cancelamento: { rotulo: "Cancelamento", campo: "data_cancelamento" }
});

const PRIORIDADES = Object.freeze(["Todas", "Normal", "Urgente"]);
const FORMATOS_RELATORIO = Object.freeze(["resumido", "detalhado"]);
const LIMITE_BUSCA_RELATORIO = 120;
const LIMITE_IDS_RELATORIO_PDF = 1000;

class ErroValidacaoRelatorio extends Error {
  constructor(mensagem) {
    super(mensagem);
    this.name = "ErroValidacaoRelatorio";
  }
}

function listaStatusRecebida(valor) {
  if (Array.isArray(valor)) {
    return valor.flatMap((item) => String(item).split(","));
  }

  if (valor === null || valor === undefined || valor === "") {
    return [];
  }

  return String(valor).split(",");
}

function normalizarStatus(valor) {
  const recebidos = listaStatusRecebida(valor)
    .map((item) => item.trim())
    .filter(Boolean);
  const todos = STATUS_RELATORIO.map((item) => item.valor);

  if (recebidos.length === 0 || recebidos.includes("Todas")) {
    return todos;
  }

  const invalidos = recebidos.filter((status) => !todos.includes(status));
  if (invalidos.length) {
    throw new ErroValidacaoRelatorio("Um ou mais status informados são inválidos.");
  }

  const selecionados = new Set(recebidos);
  return todos.filter((status) => selecionados.has(status));
}

function dataIsoValida(valor) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) {
    return false;
  }

  const [ano, mes, dia] = valor.split("-").map(Number);
  const data = new Date(Date.UTC(ano, mes - 1, dia));
  return data.getUTCFullYear() === ano
    && data.getUTCMonth() === mes - 1
    && data.getUTCDate() === dia;
}

function normalizarData(valor, rotulo) {
  if (valor === null || valor === undefined || String(valor).trim() === "") {
    return null;
  }

  const data = String(valor).trim();
  if (!dataIsoValida(data)) {
    throw new ErroValidacaoRelatorio(`${rotulo} inválida.`);
  }

  return data;
}

function normalizarBuscaRelatorio(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const busca = String(valor).trim().replace(/\s+/g, " ");
  if (!busca) {
    return null;
  }

  if (busca.length > LIMITE_BUSCA_RELATORIO) {
    throw new ErroValidacaoRelatorio(
      `A pesquisa deve ter no máximo ${LIMITE_BUSCA_RELATORIO} caracteres.`
    );
  }

  return busca;
}

function normalizarFiltrosRelatorio(entrada = {}) {
  const dataReferencia = String(entrada.dataReferencia || entrada.data_referencia || "criacao").trim();
  if (!DATAS_REFERENCIA[dataReferencia]) {
    throw new ErroValidacaoRelatorio("Data de referência inválida.");
  }

  const prioridade = String(entrada.prioridade || "Todas").trim();
  if (!PRIORIDADES.includes(prioridade)) {
    throw new ErroValidacaoRelatorio("Prioridade inválida.");
  }

  const dataInicio = normalizarData(entrada.dataInicio ?? entrada.data_inicio, "Data inicial");
  const dataFim = normalizarData(entrada.dataFim ?? entrada.data_fim, "Data final");
  if (dataInicio && dataFim && dataInicio > dataFim) {
    throw new ErroValidacaoRelatorio("A data inicial não pode ser posterior à data final.");
  }

  return {
    status: normalizarStatus(entrada.status),
    dataReferencia,
    dataInicio,
    dataFim,
    prioridade,
    busca: normalizarBuscaRelatorio(entrada.busca)
  };
}

function normalizarFormatoRelatorio(valor) {
  const formato = String(valor || "resumido").trim().toLowerCase();
  if (!FORMATOS_RELATORIO.includes(formato)) {
    throw new ErroValidacaoRelatorio("Formato de relatório inválido.");
  }
  return formato;
}

function normalizarIdsResultado(ids) {
  if (!Array.isArray(ids)) {
    throw new ErroValidacaoRelatorio("A lista de OS da consulta é inválida.");
  }

  const normalizados = ids.map(Number);
  if (normalizados.some((id) => !Number.isInteger(id) || id <= 0 || id > 2147483647)) {
    throw new ErroValidacaoRelatorio("A lista de OS da consulta contém um número inválido.");
  }

  const unicos = [...new Set(normalizados)];
  if (unicos.length > LIMITE_IDS_RELATORIO_PDF) {
    throw new ErroValidacaoRelatorio(
      `O relatório em PDF permite exportar no máximo ${LIMITE_IDS_RELATORIO_PDF} Ordens de Serviço por vez. Refine o período ou os filtros da consulta.`
    );
  }

  return unicos;
}

function obterDataReferencia(os, dataReferencia) {
  return os[DATAS_REFERENCIA[dataReferencia].campo] || null;
}

function resumirOrdens(ordens) {
  const contagemStatus = new Map(STATUS_RELATORIO.map(({ valor }) => [valor, 0]));
  let urgentes = 0;
  let normais = 0;

  for (const os of ordens) {
    if (contagemStatus.has(os.status)) {
      contagemStatus.set(os.status, contagemStatus.get(os.status) + 1);
    }
    if (os.prioridade === "Urgente") {
      urgentes++;
    } else if (os.prioridade === "Normal") {
      normais++;
    }
  }

  const porStatus = STATUS_RELATORIO.map(({ valor, rotulo }) => ({
    status: valor,
    rotulo,
    total: contagemStatus.get(valor)
  }));

  return {
    total: ordens.length,
    porStatus,
    porPrioridade: {
      urgentes,
      normais
    }
  };
}

function formatarDataCurta(dataIso) {
  if (!dataIso) return null;
  const [ano, mes, dia] = dataIso.split("-");
  return `${dia}/${mes}/${ano}`;
}

function apresentarFiltros(filtros) {
  const todosSelecionados = filtros.status.length === STATUS_RELATORIO.length;
  const rotulosSelecionados = STATUS_RELATORIO
    .filter((item) => filtros.status.includes(item.valor))
    .map((item) => item.rotulo);
  let periodo = "Todo o período";

  if (filtros.dataInicio && filtros.dataFim) {
    periodo = `${formatarDataCurta(filtros.dataInicio)} a ${formatarDataCurta(filtros.dataFim)}`;
  } else if (filtros.dataInicio) {
    periodo = `A partir de ${formatarDataCurta(filtros.dataInicio)}`;
  } else if (filtros.dataFim) {
    periodo = `Até ${formatarDataCurta(filtros.dataFim)}`;
  }

  const status = todosSelecionados ? "Todos os status" : rotulosSelecionados.join(", ");
  const prioridade = filtros.prioridade === "Todas"
    ? "Todas as prioridades"
    : filtros.prioridade;
  const partesResumo = [
    status,
    filtros.prioridade === "Todas"
      ? prioridade
      : `Prioridade ${filtros.prioridade.toLowerCase()}`
  ];

  if (filtros.busca) {
    partesResumo.push(`Pesquisa: ${filtros.busca}`);
  }

  return {
    status,
    prioridade,
    busca: filtros.busca,
    dataReferencia: DATAS_REFERENCIA[filtros.dataReferencia].rotulo,
    periodo,
    resumo: partesResumo.join(" | ")
  };
}

function prepararResultadoRelatorio(ordens, filtros) {
  return {
    consulta: {
      filtros,
      apresentacao: apresentarFiltros(filtros)
    },
    resumo: resumirOrdens(ordens),
    ordens: ordens.map((os) => ({
      id: os.id,
      numero: os.id,
      maquina: os.maquina,
      setor: os.setor,
      prioridade: os.prioridade,
      status: os.status,
      dataReferencia: formatarData(obterDataReferencia(os, filtros.dataReferencia))
    }))
  };
}

async function consultarRelatorio(entrada) {
  const filtros = normalizarFiltrosRelatorio(entrada);
  const ordens = await buscarOSParaRelatorio(filtros);
  return prepararResultadoRelatorio(ordens, filtros);
}

function prepararOSResumida(dados) {
  const detalhesPermitidos = new Set(["Solicitante", "Área da manutenção", "Data inicial", "ID da máquina", "Responsável", "Manutentor"]);
  return {
    numero: dados.numero,
    maquina: dados.maquina,
    setor: dados.setor,
    prioridade: dados.prioridade,
    status: dados.status,
    detalhes: dados.detalhes.filter((campo) => detalhesPermitidos.has(campo.rotulo)),
    tempos: dados.tempos,
    problema: dados.problema,
    acaoFinal: dados.acaoFinal,
    quantidadePausas: dados.pausas.length
  };
}

function prepararDadosRelatorioParaPdf(ordens, filtros, formato, dataGeracao = new Date()) {
  const formatoNormalizado = normalizarFormatoRelatorio(formato);
  const ordensPreparadas = ordens.map((os) => prepararDadosOSParaPdf(os, dataGeracao));
  const dataArquivo = tornarNomeArquivoSeguro(
    formatarData(dataGeracao)?.split(",")[0] || "data"
  );

  return {
    geradoEm: formatarData(dataGeracao),
    formato: formatoNormalizado,
    filtros,
    apresentacao: apresentarFiltros(filtros),
    resumo: resumirOrdens(ordens),
    ordens: formatoNormalizado === "detalhado"
      ? ordensPreparadas
      : ordensPreparadas.map(prepararOSResumida),
    nomeArquivo: `Relatorio_OS_${filtros.dataReferencia}_${dataArquivo}_${formatoNormalizado}.pdf`
  };
}

module.exports = {
  ErroValidacaoRelatorio,
  consultarRelatorio,
  normalizarFiltrosRelatorio,
  normalizarFormatoRelatorio,
  normalizarIdsResultado,
  prepararDadosRelatorioParaPdf,
  prepararResultadoRelatorio,
  resumirOrdens
};
