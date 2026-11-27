const {
  CORES,
  PAGINA,
  corStatus,
  criarDocumentoBase,
  desenharPill,
  desenharRodapes,
  quebrarTextoEmLinhas,
  larguraConteudo,
  renderizarConteudoOS,
  resolverLogoPdf
} = require("./osPdfLayout");

const STATUS_CORES = Object.freeze({
  "Concluída": { fundo: CORES.verdeClaro, borda: "#A8DDBD", texto: CORES.verde },
  "Em andamento": { fundo: CORES.azulClaro, borda: CORES.azulBorda, texto: CORES.azulVivo },
  "Pausada": { fundo: CORES.laranjaClaro, borda: "#F2C391", texto: CORES.laranja },
  "Aguardando peça": { fundo: CORES.amareloClaro, borda: "#E8CF83", texto: CORES.amarelo },
  "Aberta": { fundo: CORES.azulClaro, borda: CORES.azulBorda, texto: CORES.azulVivo },
  "Cancelada": { fundo: CORES.vermelhoClaro, borda: "#F2B8B5", texto: CORES.vermelho }
});

function criarDocumentoRelatorio(dados) {
  return criarDocumentoBase({
    titulo: "Relatório de Ordens de Serviço",
    assunto: dados.formato === "detalhado"
      ? "Relatório detalhado de Ordens de Serviço"
      : "Relatório resumido de Ordens de Serviço"
  });
}

function desenharLinhaSeparadora(doc, y) {
  doc.moveTo(PAGINA.margemEsquerda, y)
    .lineTo(doc.page.width - PAGINA.margemDireita, y)
    .lineWidth(0.8)
    .strokeColor(CORES.azulBorda)
    .stroke();
}

function desenharCabecalhoRelatorio(doc, dados, logoPath, opcoes = {}) {
  const compacto = Boolean(opcoes.compacto);
  const subtitulo = opcoes.subtitulo || "Resumo gerencial";
  const esquerda = PAGINA.margemEsquerda;
  const direita = doc.page.width - PAGINA.margemDireita;
  const larguraDireita = compacto ? 326 : 322;
  const xDireita = direita - larguraDireita;
  const yLogo = compacto ? 34 : 36;
  const tamanhoLogo = compacto ? [132, 38] : [184, 52];

  doc.image(resolverLogoPdf(logoPath), esquerda, yLogo, {
    cover: tamanhoLogo,
    align: "center",
    valign: "center"
  });

  doc.font("Helvetica-Bold")
    .fontSize(compacto ? 13 : 15)
    .fillColor(CORES.azul)
    .text("RELATÓRIO DE ORDENS DE SERVIÇO", xDireita, compacto ? 36 : 39, {
      width: larguraDireita,
      align: "right",
      lineBreak: false
    });

  const ySubtitulo = compacto ? 57 : 65;
  const alturaSubtitulo = compacto ? 24 : 30;
  doc.roundedRect(xDireita, ySubtitulo, larguraDireita, alturaSubtitulo, 6).fill(CORES.azulClaro);
  doc.font("Helvetica-Bold")
    .fontSize(compacto ? 11 : 13)
    .fillColor(CORES.azulVivo)
    .text(subtitulo, xDireita, ySubtitulo + (compacto ? 7 : 9), {
      width: larguraDireita,
      align: "center",
      lineBreak: false
    });

  const yMetadados = compacto ? 88 : 105;
  doc.font("Helvetica")
    .fontSize(compacto ? 8 : 8.5)
    .fillColor(CORES.texto)
    .text(`Período: ${dados.apresentacao.periodo}`, xDireita, yMetadados, {
      width: larguraDireita,
      align: "right",
      lineBreak: false
    });
  doc.text(`Data de referência: ${dados.apresentacao.dataReferencia}`, xDireita, yMetadados + 13, {
    width: larguraDireita,
    align: "right",
    lineBreak: false
  });

  if (!compacto) {
    doc.text(`Gerado em: ${dados.geradoEm}`, xDireita, yMetadados + 26, {
      width: larguraDireita,
      align: "right",
      lineBreak: false
    });
  }

  const yFiltros = compacto ? 121 : 148;
  doc.font("Helvetica-Bold").fontSize(8.5).fillColor(CORES.azul);
  const prefixo = "Filtros: ";
  const larguraPrefixo = doc.widthOfString(prefixo);
  doc.text(prefixo, esquerda, yFiltros, { lineBreak: false });
  doc.font("Helvetica").fillColor(CORES.textoSuave).text(
    dados.apresentacao.resumo,
    esquerda + larguraPrefixo,
    yFiltros,
    { width: larguraConteudo(doc) - larguraPrefixo, align: "left" }
  );

  const alturaFiltros = doc.heightOfString(dados.apresentacao.resumo, {
    width: larguraConteudo(doc) - larguraPrefixo
  });
  const yLinha = yFiltros + Math.max(alturaFiltros, 11) + 9;
  desenharLinhaSeparadora(doc, yLinha);
  return yLinha + 14;
}

function desenharTituloQuadro(doc, titulo, x, y, largura) {
  doc.roundedRect(x, y, largura, 28, 7).fill(CORES.azulClaro);
  doc.font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(CORES.azul)
    .text(titulo, x + 12, y + 8, { width: largura - 24, lineBreak: false });
}

function desenharPaginaResumo(doc, dados, logoPath) {
  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  let y = desenharCabecalhoRelatorio(doc, dados, logoPath, { subtitulo: "Resumo gerencial" });

  const alturaTotal = 116;
  doc.roundedRect(x, y, largura, alturaTotal, 8)
    .fillAndStroke(CORES.azulClaro, CORES.azulBorda);
  doc.font("Helvetica-Bold")
    .fontSize(50)
    .fillColor(CORES.azul)
    .text(String(dados.resumo.total), x, y + 18, { width: largura, align: "center", lineBreak: false });
  doc.font("Helvetica-Bold")
    .fontSize(13)
    .fillColor(CORES.textoSuave)
    .text("ORDENS DE SERVIÇO", x, y + 78, { width: largura, align: "center", lineBreak: false });
  y += alturaTotal + 16;

  const alturaStatus = 190;
  doc.roundedRect(x, y, largura, alturaStatus, 8)
    .fillAndStroke(CORES.branco, CORES.azulBorda);
  desenharTituloQuadro(doc, "RESUMO POR STATUS", x, y, largura);

  const gap = 8;
  const larguraCard = (largura - 36 - gap * 2) / 3;
  const alturaCard = 64;
  dados.resumo.porStatus.forEach((item, indice) => {
    const coluna = indice % 3;
    const linha = Math.floor(indice / 3);
    const xCard = x + 10 + coluna * (larguraCard + gap);
    const yCard = y + 38 + linha * (alturaCard + gap);
    const cores = STATUS_CORES[item.status] || {
      fundo: CORES.cinzaFundo,
      borda: CORES.cinzaBorda,
      texto: CORES.azul
    };
    doc.roundedRect(xCard, yCard, larguraCard, alturaCard, 7)
      .fillAndStroke(cores.fundo, cores.borda);
    doc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(CORES.texto)
      .text(item.rotulo, xCard + 7, yCard + 11, { width: larguraCard - 14, align: "center" });
    doc.font("Helvetica-Bold")
      .fontSize(22)
      .fillColor(cores.texto)
      .text(String(item.total), xCard + 7, yCard + 34, {
        width: larguraCard - 14,
        align: "center",
        lineBreak: false
      });
  });
  y += alturaStatus + 16;

  const alturaPrioridades = 112;
  doc.roundedRect(x, y, largura, alturaPrioridades, 8)
    .fillAndStroke(CORES.branco, CORES.azulBorda);
  desenharTituloQuadro(doc, "PRIORIDADES", x, y, largura);
  const larguraPrioridade = (largura - 28) / 2;
  const prioridades = [
    {
      rotulo: "Urgentes",
      total: dados.resumo.porPrioridade.urgentes,
      fundo: CORES.vermelhoClaro,
      borda: "#F2B8B5",
      texto: CORES.vermelho
    },
    {
      rotulo: "Normais",
      total: dados.resumo.porPrioridade.normais,
      fundo: CORES.azulClaro,
      borda: CORES.azulBorda,
      texto: CORES.azulVivo
    }
  ];
  prioridades.forEach((item, indice) => {
    const xCard = x + 10 + indice * (larguraPrioridade + 8);
    doc.roundedRect(xCard, y + 38, larguraPrioridade, 64, 7)
      .fillAndStroke(item.fundo, item.borda);
    doc.font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(CORES.texto)
      .text(item.rotulo, xCard, y + 48, { width: larguraPrioridade, align: "center", lineBreak: false });
    doc.font("Helvetica-Bold")
      .fontSize(23)
      .fillColor(item.texto)
      .text(String(item.total), xCard, y + 70, { width: larguraPrioridade, align: "center", lineBreak: false });
  });
}

function adicionarPaginaListagem(doc, estado, dados, osContinuacao = null) {
  doc.addPage();
  estado.y = desenharCabecalhoRelatorio(doc, dados, estado.logoPath, {
    compacto: true,
    subtitulo: "Listagem resumida"
  });

  if (osContinuacao) {
    doc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(CORES.azul)
      .text(`OS #${osContinuacao.numero} - continuação`, PAGINA.margemEsquerda, estado.y, {
        width: larguraConteudo(doc),
        lineBreak: false
      });
    estado.y += 20;
  }
}

function garantirEspacoListagem(doc, estado, dados, altura, osContinuacao = null) {
  if (estado.y + altura > PAGINA.limiteConteudoInferior) {
    adicionarPaginaListagem(doc, estado, dados, osContinuacao);
  }
}

function alturaTexto(doc, texto, largura, fonte = 9, alturaLinha = 12) {
  doc.font("Helvetica").fontSize(fonte);
  return quebrarTextoEmLinhas(doc, texto, largura).length * alturaLinha;
}

function dadosCabecalhoOS(doc, os) {
  const larguraMaquina = 258;
  doc.font("Helvetica-Bold").fontSize(13);
  const linhasMaquina = quebrarTextoEmLinhas(doc, os.maquina, larguraMaquina);
  const maquinaLonga = linhasMaquina.length > 4;
  return {
    larguraMaquina,
    linhasMaquina: maquinaLonga ? [] : linhasMaquina,
    maquinaLonga,
    altura: maquinaLonga ? 49 : Math.max(49, 21 + linhasMaquina.length * 15)
  };
}

function desenharCabecalhoOSResumida(doc, estado, dados, os) {
  const info = dadosCabecalhoOS(doc, os);
  garantirEspacoListagem(doc, estado, dados, info.altura + 8);
  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const y = estado.y;

  doc.roundedRect(x, y, largura, info.altura, 8)
    .fillAndStroke(CORES.azulClaro, CORES.azulBorda);
  doc.font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(CORES.azulVivo)
    .text(`OS #${os.numero}`, x + 12, y + 15, { width: 78, lineBreak: false });

  if (!info.maquinaLonga) {
    doc.font("Helvetica-Bold")
      .fontSize(13)
      .fillColor(CORES.azul)
      .text(info.linhasMaquina.join("\n"), x + 94, y + 9, {
        width: info.larguraMaquina,
        lineGap: 1
      });
    if (os.setor) {
      doc.font("Helvetica")
        .fontSize(8.5)
        .fillColor(CORES.textoSuave)
        .text(os.setor, x + 94, y + info.altura - 15, {
          width: info.larguraMaquina,
          lineBreak: false,
          ellipsis: true
        });
    }
  }

  let cursor = x + largura - 10;
  const pills = [];
  if (os.status) pills.push({ texto: os.status, estilo: corStatus(os.status) });
  if (os.prioridade) {
    pills.push({
      texto: os.prioridade,
      estilo: os.prioridade === "Urgente"
        ? { fundo: CORES.vermelhoClaro, texto: CORES.vermelho }
        : { fundo: CORES.azulClaro, texto: CORES.azulVivo }
    });
  }
  pills.forEach((pill) => {
    const larguraPill = Math.max(doc.font("Helvetica-Bold").fontSize(8).widthOfString(pill.texto) + 20, 56);
    cursor -= larguraPill;
    desenharPill(doc, pill.texto, cursor, y + 13, pill.estilo);
    cursor -= 6;
  });

  estado.y += info.altura + 7;
  if (info.maquinaLonga) {
    desenharTextoCompacto(doc, estado, dados, os, "Máquina ou equipamento", os.maquina);
    if (os.setor) desenharTextoCompacto(doc, estado, dados, os, "Setor", os.setor);
  }
}

function medirLinhasDetalhes(doc, campos) {
  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const gap = 6;
  const colunas = 4;
  const larguraCelula = (largura - gap * (colunas - 1)) / colunas;
  const linhas = [];
  for (let i = 0; i < campos.length; i += colunas) linhas.push(campos.slice(i, i + colunas));
  const alturas = linhas.map((linha) => Math.max(...linha.map((campo) => {
    const alturaRotulo = alturaTexto(doc, campo.rotulo, larguraCelula - 16, 7.5, 9);
    const alturaValor = alturaTexto(doc, campo.valor, larguraCelula - 16, 9, 11);
    return Math.max(39, alturaRotulo + alturaValor + 12);
  })));
  return { x, largura, gap, larguraCelula, linhas, alturas };
}

function desenharDetalhesCompactos(doc, estado, dados, os) {
  if (!os.detalhes.length) return;
  const medidas = medirLinhasDetalhes(doc, os.detalhes);
  const alturaMaxima = PAGINA.limiteConteudoInferior - 180;

  if (medidas.alturas.some((altura) => altura > alturaMaxima)) {
    os.detalhes.forEach((campo) => {
      desenharTextoCompacto(doc, estado, dados, os, campo.rotulo, campo.valor, {
        fundo: CORES.cinzaFundo,
        borda: CORES.cinzaBorda,
        fundoTitulo: CORES.cinzaFundo
      });
    });
    return;
  }

  medidas.linhas.forEach((linha, indiceLinha) => {
    const altura = medidas.alturas[indiceLinha];
    garantirEspacoListagem(doc, estado, dados, altura + 6, os);
    linha.forEach((campo, indiceColuna) => {
      const xCelula = medidas.x + indiceColuna * (medidas.larguraCelula + medidas.gap);
      doc.roundedRect(xCelula, estado.y, medidas.larguraCelula, altura, 5).fill(CORES.cinzaFundo);
      doc.font("Helvetica-Bold")
        .fontSize(7.5)
        .fillColor(CORES.textoSuave)
        .text(campo.rotulo, xCelula + 8, estado.y + 6, { width: medidas.larguraCelula - 16 });
      doc.font("Helvetica-Bold")
        .fontSize(9)
        .fillColor(CORES.texto)
        .text(campo.valor, xCelula + 8, doc.y + 1, { width: medidas.larguraCelula - 16 });
    });
    estado.y += altura + 6;
  });
}

function textoQuantidadePausas(quantidade) {
  return quantidade === 1 ? "1 pausa registrada" : `${quantidade} pausas registradas`;
}

function desenharTemposCompactos(doc, estado, dados, os) {
  if (!os.tempos) {
    if (os.quantidadePausas > 0) {
      garantirEspacoListagem(doc, estado, dados, 28, os);
      doc.font("Helvetica-Bold")
        .fontSize(8.5)
        .fillColor(CORES.textoSuave)
        .text(textoQuantidadePausas(os.quantidadePausas), PAGINA.margemEsquerda + 8, estado.y + 5, {
          width: larguraConteudo(doc) - 16,
          lineBreak: false
        });
      estado.y += 27;
    }
    return;
  }

  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const gap = 7;
  const larguraCard = (largura - gap * 2) / 3;
  const altura = os.quantidadePausas > 0 ? 58 : 50;
  const itens = [
    { rotulo: os.tempos.tituloFinal, valor: os.tempos.ateFinalizar },
    {
      rotulo: "Tempo em pausa",
      valor: os.tempos.parado,
      complemento: os.quantidadePausas > 0 ? textoQuantidadePausas(os.quantidadePausas) : null
    },
    { rotulo: "Tempo em andamento", valor: os.tempos.andamentoReal }
  ];

  garantirEspacoListagem(doc, estado, dados, altura + 7, os);
  itens.forEach((item, indice) => {
    const xCard = x + indice * (larguraCard + gap);
    doc.roundedRect(xCard, estado.y, larguraCard, altura, 6)
      .fillAndStroke(CORES.azulClaro, CORES.azulBorda);
    doc.font("Helvetica-Bold")
      .fontSize(7.5)
      .fillColor(CORES.textoSuave)
      .text(item.rotulo, xCard + 7, estado.y + 7, { width: larguraCard - 14, align: "center" });
    doc.font("Helvetica-Bold")
      .fontSize(12)
      .fillColor(CORES.azul)
      .text(item.valor, xCard + 7, estado.y + 23, {
        width: larguraCard - 14,
        align: "center",
        lineBreak: false
      });
    if (item.complemento) {
      doc.font("Helvetica")
        .fontSize(7)
        .fillColor(CORES.textoSuave)
        .text(item.complemento, xCard + 5, estado.y + 43, {
          width: larguraCard - 10,
          align: "center",
          lineBreak: false
        });
    }
  });
  estado.y += altura + 7;
}

function desenharTextoCompacto(doc, estado, dados, os, titulo, texto, estilo = {}) {
  if (!texto) return;
  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const padding = 9;
  const alturaTitulo = 23;
  const alturaLinha = 11;
  const fundo = estilo.fundo || CORES.branco;
  const borda = estilo.borda || CORES.azulBorda;
  const fundoTitulo = estilo.fundoTitulo || CORES.azulClaro;
  const textoTitulo = estilo.textoTitulo || CORES.azul;

  doc.font("Helvetica").fontSize(9);
  const linhas = quebrarTextoEmLinhas(doc, texto, largura - padding * 2);
  let indice = 0;
  let continuacao = false;

  while (indice < linhas.length) {
    garantirEspacoListagem(doc, estado, dados, alturaTitulo + padding * 2 + alturaLinha, os);
    const disponivel = PAGINA.limiteConteudoInferior - estado.y;
    const maximo = Math.max(1, Math.floor((disponivel - alturaTitulo - padding * 2) / alturaLinha));
    const quantidade = Math.min(maximo, linhas.length - indice);
    const altura = alturaTitulo + padding * 2 + quantidade * alturaLinha;

    doc.roundedRect(x, estado.y, largura, altura, 6).fillAndStroke(fundo, borda);
    doc.roundedRect(x, estado.y, largura, alturaTitulo, 6).fill(fundoTitulo);
    doc.font("Helvetica-Bold")
      .fontSize(9)
      .fillColor(textoTitulo)
      .text(continuacao ? `${titulo} (continuação)` : titulo, x + 10, estado.y + 7, {
        width: largura - 20,
        lineBreak: false
      });

    doc.font("Helvetica").fontSize(9).fillColor(CORES.texto);
    const yTexto = estado.y + alturaTitulo + padding;
    linhas.slice(indice, indice + quantidade).forEach((linha, linhaIndice) => {
      doc.text(linha || " ", x + padding, yTexto + linhaIndice * alturaLinha, {
        width: largura - padding * 2,
        lineBreak: false
      });
    });

    indice += quantidade;
    estado.y += altura + 7;
    continuacao = true;
    if (indice < linhas.length) adicionarPaginaListagem(doc, estado, dados, os);
  }
}

function desenharTextosResumidos(doc, estado, dados, os) {
  desenharTextoCompacto(doc, estado, dados, os, "Problema relatado", os.problema);

  if (os.acaoFinal) {
    const conclusao = os.acaoFinal.tipo === "conclusao";
    desenharTextoCompacto(doc, estado, dados, os, os.acaoFinal.titulo, os.acaoFinal.texto, conclusao
      ? {
          fundo: CORES.branco,
          borda: "#A8DDBD",
          fundoTitulo: CORES.verdeClaro,
          textoTitulo: CORES.verde
        }
      : {
          fundo: CORES.branco,
          borda: "#F2B8B5",
          fundoTitulo: CORES.vermelhoClaro,
          textoTitulo: CORES.vermelho
        });
  }
}

function medirAlturaBlocoCurto(doc, os) {
  const cabecalho = dadosCabecalhoOS(doc, os);
  if (cabecalho.maquinaLonga) return Number.POSITIVE_INFINITY;
  const detalhes = medirLinhasDetalhes(doc, os.detalhes);
  const alturaDetalhes = detalhes.alturas.reduce((total, altura) => total + altura + 6, 0);
  const alturaTempos = os.tempos ? (os.quantidadePausas > 0 ? 65 : 57) : (os.quantidadePausas > 0 ? 27 : 0);
  const alturaProblema = os.problema
    ? 30 + 18 + alturaTexto(doc, os.problema, larguraConteudo(doc) - 18)
    : 0;
  const alturaAcao = os.acaoFinal
    ? 30 + 18 + alturaTexto(doc, os.acaoFinal.texto, larguraConteudo(doc) - 18)
    : 0;
  return cabecalho.altura + 7 + alturaDetalhes + alturaTempos + alturaProblema + alturaAcao + 28;
}

function desenharOSResumida(doc, estado, dados, os) {
  const alturaEstimada = medirAlturaBlocoCurto(doc, os);
  const capacidadePagina = PAGINA.limiteConteudoInferior - 160;

  if (alturaEstimada <= capacidadePagina) {
    garantirEspacoListagem(doc, estado, dados, alturaEstimada);
  } else if (estado.y > 185) {
    adicionarPaginaListagem(doc, estado, dados);
  }

  desenharCabecalhoOSResumida(doc, estado, dados, os);
  desenharDetalhesCompactos(doc, estado, dados, os);
  desenharTemposCompactos(doc, estado, dados, os);
  desenharTextosResumidos(doc, estado, dados, os);
  estado.y += 10;
}

function desenharRelatorioResumido(doc, dados, logoPath) {
  desenharPaginaResumo(doc, dados, logoPath);
  if (!dados.ordens.length) return;

  const estado = { y: 0, logoPath };
  adicionarPaginaListagem(doc, estado, dados);
  dados.ordens.forEach((os) => desenharOSResumida(doc, estado, dados, os));
}

function desenharRelatorioDetalhado(doc, dados, logoPath) {
  desenharPaginaResumo(doc, dados, logoPath);
  dados.ordens.forEach((os) => {
    renderizarConteudoOS(doc, os, logoPath, { iniciarNovaPagina: true });
  });
}

function desenharPdfRelatorio(doc, dados, logoPath) {
  if (dados.formato === "detalhado") {
    desenharRelatorioDetalhado(doc, dados, logoPath);
  } else {
    desenharRelatorioResumido(doc, dados, logoPath);
  }

  desenharRodapes(doc, dados);
}

module.exports = {
  criarDocumentoRelatorio,
  desenharPdfRelatorio,
  textoQuantidadePausas
};
