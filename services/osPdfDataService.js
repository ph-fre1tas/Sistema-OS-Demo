const {
  calcularTemposOS,
  converterParaData,
  formatarTemposOS
} = require("./osTempoService");

const FUSO_HORARIO_SISTEMA = "America/Sao_Paulo";

function textoPreenchido(valor) {
  if (valor === null || valor === undefined) {
    return null;
  }

  const texto = String(valor).trim();
  return texto || null;
}

function formatarData(data) {
  const dataConvertida = converterParaData(data);

  if (!dataConvertida) {
    return null;
  }

  return dataConvertida.toLocaleString("pt-BR", {
    timeZone: FUSO_HORARIO_SISTEMA
  });
}

function obterDataFinal(os) {
  if (os.status === "Concluída") {
    return os.data_conclusao;
  }

  if (os.status === "Cancelada") {
    return os.data_cancelamento;
  }

  return null;
}

function obterResponsavelFinal(os) {
  if (os.status === "Concluída") {
    return textoPreenchido(os.concluido_por_nome);
  }

  if (os.status === "Cancelada") {
    return textoPreenchido(os.cancelado_por_nome);
  }

  return null;
}

function formatarMotivoPausa(pausa) {
  const motivo = textoPreenchido(pausa.motivo);

  if (pausa.tipo_pausa === "Aguardando peça") {
    if (motivo && motivo !== "Aguardando peça") {
      return `Faltando: ${motivo}`;
    }

    return motivo || "Aguardando peça";
  }

  return motivo;
}

function adicionarCampo(lista, rotulo, valor) {
  const texto = textoPreenchido(valor);

  if (texto) {
    lista.push({ rotulo, valor: texto });
  }
}

function prepararPausas(pausas) {
  if (!Array.isArray(pausas)) {
    return [];
  }

  return pausas.map((pausa, indice) => {
    const campos = [];
    adicionarCampo(campos, "Tipo", pausa.tipo_pausa);
    adicionarCampo(campos, "Motivo", formatarMotivoPausa(pausa));
    adicionarCampo(campos, "Pausada em", formatarData(pausa.data_inicio_pausa));
    adicionarCampo(campos, "Pausada por", pausa.pausado_por_nome);
    adicionarCampo(campos, "Retomada em", formatarData(pausa.data_fim_pausa));
    adicionarCampo(campos, "Retomada por", pausa.retomado_por_nome);

    return {
      sequencia: indice + 1,
      campos
    };
  });
}

function prepararAcaoFinal(os) {
  if (os.status === "Concluída" && textoPreenchido(os.solucao)) {
    return {
      titulo: "O que foi feito",
      texto: textoPreenchido(os.solucao),
      tipo: "conclusao"
    };
  }

  if (os.status === "Cancelada" && textoPreenchido(os.motivo_cancelamento)) {
    return {
      titulo: "Motivo do cancelamento",
      texto: textoPreenchido(os.motivo_cancelamento),
      tipo: "cancelamento"
    };
  }

  return null;
}

function formatarDataArquivo(data) {
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_HORARIO_SISTEMA,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(data);
  const mapa = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
  return `${mapa.day}-${mapa.month}-${mapa.year}`;
}

function tornarNomeArquivoSeguro(valor) {
  return String(valor || "OS")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, " ")
    .replace(/[^a-zA-Z0-9._ -]/g, " ")
    .trim()
    .replace(/[ .]+$/g, "")
    .replace(/\s+/g, "_")
    .slice(0, 70) || "OS";
}

function prepararDadosOSParaPdf(os, dataGeracao = new Date()) {
  const detalhes = [];
  const dataFinal = obterDataFinal(os);
  const tempos = calcularTemposOS(os);
  const possuiTempos = Object.values(tempos).every((valor) => valor !== null);

  adicionarCampo(detalhes, "Solicitante", os.solicitante);
  adicionarCampo(detalhes, "Área da manutenção", os.area_manutencao);
  adicionarCampo(detalhes, "Data inicial", formatarData(os.data_criacao));
  adicionarCampo(detalhes, "ID da máquina", os.maquina_id);
  adicionarCampo(detalhes, "Responsável", obterResponsavelFinal(os));
  adicionarCampo(detalhes, "Manutentor", os.manutentor_responsavel_nome);
  adicionarCampo(detalhes, "Data final", formatarData(dataFinal));

  const numero = Number.isInteger(Number(os.id)) ? Number(os.id) : os.id;
  const maquina = textoPreenchido(os.maquina) || "Ordem de Serviço";
  const nomeArquivo = `OS_${tornarNomeArquivoSeguro(numero)}_${tornarNomeArquivoSeguro(maquina)}_${formatarDataArquivo(dataGeracao)}.pdf`;

  return {
    numero,
    maquina,
    setor: textoPreenchido(os.setor),
    prioridade: textoPreenchido(os.prioridade),
    status: textoPreenchido(os.status),
    geradoEm: formatarData(dataGeracao),
    detalhes,
    tempos: possuiTempos
      ? {
          tituloFinal: os.status === "Cancelada" ? "Até cancelar" : "Até concluir",
          ...formatarTemposOS(tempos)
        }
      : null,
    problema: textoPreenchido(os.problema),
    acaoFinal: prepararAcaoFinal(os),
    pausas: prepararPausas(os.pausas),
    nomeArquivo
  };
}

module.exports = {
  formatarData,
  prepararDadosOSParaPdf,
  tornarNomeArquivoSeguro
};
