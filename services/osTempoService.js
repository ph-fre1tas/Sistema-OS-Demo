const MARCADOR_UTC = "Z";

function limitarMilissegundos(textoData) {
  return textoData.replace(/(\.\d{3})\d+/, "$1");
}

function prepararTextoData(data) {
  if (typeof data !== "string") {
    return data;
  }

  const textoData = limitarMilissegundos(data.trim())
    .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
  const dataSemFusoHorario = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(textoData);

  if (dataSemFusoHorario) {
    return `${textoData}${MARCADOR_UTC}`;
  }

  return textoData;
}

function converterParaData(data) {
  if (!data) {
    return null;
  }

  const dataConvertida = data instanceof Date
    ? new Date(data.getTime())
    : new Date(prepararTextoData(data));

  if (Number.isNaN(dataConvertida.getTime())) {
    return null;
  }

  return dataConvertida;
}

function calcularSegundosEntre(inicio, fim) {
  const dataInicio = converterParaData(inicio);
  const dataFim = converterParaData(fim);

  if (!dataInicio || !dataFim || dataFim < dataInicio) {
    return null;
  }

  return Math.floor((dataFim - dataInicio) / 1000);
}

function calcularTempoPausado(os, dataFinal) {
  if (!Array.isArray(os.pausas) || os.pausas.length === 0) {
    return 0;
  }

  const inicioOS = converterParaData(os.data_inicio);
  const fimOS = converterParaData(dataFinal);
  const intervalos = [];

  for (const pausa of os.pausas) {
    if (!pausa) continue;
    let inicioPausa = converterParaData(pausa.data_inicio_pausa);
    let fimPausa = converterParaData(pausa.data_fim_pausa) || fimOS;

    if (!inicioPausa || !fimPausa) {
      continue;
    }

    if (inicioOS && inicioPausa < inicioOS) {
      inicioPausa = inicioOS;
    }

    if (fimOS && fimPausa > fimOS) {
      fimPausa = fimOS;
    }

    if (fimPausa < inicioPausa) {
      continue;
    }

    intervalos.push([inicioPausa.getTime(), fimPausa.getTime()]);
  }

  if (intervalos.length === 0) {
    return 0;
  }

  intervalos.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const mesclados = [intervalos[0]];
  for (let i = 1; i < intervalos.length; i++) {
    const [inicioAtual, fimAtual] = intervalos[i];
    const ultimo = mesclados[mesclados.length - 1];
    if (inicioAtual <= ultimo[1]) {
      if (fimAtual > ultimo[1]) {
        ultimo[1] = fimAtual;
      }
    } else {
      mesclados.push([inicioAtual, fimAtual]);
    }
  }

  return mesclados.reduce(
    (total, [inicio, fim]) => total + Math.floor((fim - inicio) / 1000),
    0
  );
}

function calcularTemposOS(os) {
  const dataFinal = os.status === "Concluída"
    ? os.data_conclusao
    : os.data_cancelamento;

  const segundosAteFinalizar = calcularSegundosEntre(os.data_inicio, dataFinal);

  if (segundosAteFinalizar === null) {
    return {
      ateFinalizar: null,
      parado: null,
      andamentoReal: null
    };
  }

  const segundosParados = Math.min(
    calcularTempoPausado(os, dataFinal),
    segundosAteFinalizar
  );

  return {
    ateFinalizar: segundosAteFinalizar,
    parado: segundosParados,
    andamentoReal: Math.max(segundosAteFinalizar - segundosParados, 0)
  };
}

function formatarDuracao(segundos) {
  if (segundos === null || segundos === undefined) {
    return "Não calculado";
  }

  const segundosInteiros = Math.max(Math.floor(segundos), 0);
  const doisDigitos = (valor) => String(valor).padStart(2, "0");
  const dias = Math.floor(segundosInteiros / 86400);
  const horas = Math.floor((segundosInteiros % 86400) / 3600);
  const minutos = Math.floor((segundosInteiros % 3600) / 60);
  const segundosRestantes = segundosInteiros % 60;
  const relogio = `${doisDigitos(horas)}:${doisDigitos(minutos)}:${doisDigitos(segundosRestantes)}`;

  if (dias === 0) {
    return relogio;
  }

  return `${dias}d ${relogio}`;
}

function formatarTemposOS(tempos) {
  return {
    ateFinalizar: formatarDuracao(tempos.ateFinalizar),
    parado: formatarDuracao(tempos.parado),
    andamentoReal: formatarDuracao(tempos.andamentoReal)
  };
}

module.exports = {
  calcularTemposOS,
  converterParaData,
  formatarTemposOS
};
