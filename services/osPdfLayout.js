const fs = require("node:fs");
const path = require("node:path");
const PDFDocument = require("pdfkit");

const LOGO_PADRAO_PATH = path.join(
  __dirname,
  "..",
  "public",
  "assets",
  "img",
  "logo-oficial.png"
);
let logoPadraoBuffer = null;

function resolverLogoPdf(logoPath) {
  if (Buffer.isBuffer(logoPath)) {
    return logoPath;
  }
  if (!logoPath || logoPath === LOGO_PADRAO_PATH) {
    if (!logoPadraoBuffer) {
      logoPadraoBuffer = fs.readFileSync(LOGO_PADRAO_PATH);
    }
    return logoPadraoBuffer;
  }
  return logoPath;
}

const CORES = {
  azul: "#123A70",
  azulVivo: "#1664B8",
  azulClaro: "#EAF3FC",
  azulBorda: "#BBD7F1",
  texto: "#17304F",
  textoSuave: "#5B708C",
  cinzaFundo: "#F5F7FA",
  cinzaBorda: "#DCE4ED",
  branco: "#FFFFFF",
  verde: "#198754",
  verdeClaro: "#EAF7EF",
  vermelho: "#B42318",
  vermelhoClaro: "#FDECEC",
  laranja: "#A64B12",
  laranjaClaro: "#FFF7ED",
  amarelo: "#9A6700",
  amareloClaro: "#FFF4CE"
};

const PAGINA = {
  margemEsquerda: 42,
  margemDireita: 42,
  margemSuperior: 36,
  limiteConteudoInferior: 772
};

function criarDocumentoBase(info = {}) {
  return new PDFDocument({
    size: "A4",
    margins: {
      top: PAGINA.margemSuperior,
      left: PAGINA.margemEsquerda,
      right: PAGINA.margemDireita,
      bottom: 68
    },
    bufferPages: true,
    info: {
      Title: info.titulo || "Sistema de Ordem de Serviço",
      Subject: info.assunto || "Ordem de Serviço",
      Author: "Sistema de Ordem de Serviço",
      Creator: "Sistema de Ordem de Serviço"
    }
  });
}

function criarDocumento(dados) {
  return criarDocumentoBase({
    titulo: `Ordem de Serviço OS #${dados.numero}`,
    assunto: "Ordem de Serviço"
  });
}

function larguraConteudo(doc) {
  return doc.page.width - PAGINA.margemEsquerda - PAGINA.margemDireita;
}

function desenharCabecalhoContinuacao(doc, estado, dados) {
  const largura = larguraConteudo(doc);

  doc.font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(CORES.azul)
    .text("ORDEM DE SERVIÇO", PAGINA.margemEsquerda, 38, {
      width: largura / 2,
      lineBreak: false
    });
  doc.font("Helvetica")
    .fontSize(9)
    .fillColor(CORES.textoSuave)
    .text(`OS #${dados.numero}`, PAGINA.margemEsquerda + largura / 2, 38, {
      width: largura / 2,
      align: "right",
      lineBreak: false
    });
  doc.moveTo(PAGINA.margemEsquerda, 57)
    .lineTo(doc.page.width - PAGINA.margemDireita, 57)
    .lineWidth(0.8)
    .strokeColor(CORES.azulBorda)
    .stroke();
  estado.y = 70;
}

function adicionarPagina(doc, estado, dados) {
  doc.addPage();
  desenharCabecalhoContinuacao(doc, estado, dados);
}

function garantirEspaco(doc, estado, dados, altura) {
  if (estado.y + altura > PAGINA.limiteConteudoInferior) {
    adicionarPagina(doc, estado, dados);
  }
}

function corStatus(status) {
  if (status === "Concluída") {
    return { fundo: CORES.verdeClaro, texto: CORES.verde };
  }

  if (status === "Cancelada") {
    return { fundo: CORES.vermelhoClaro, texto: CORES.vermelho };
  }

  if (status === "Aguardando peça" || status === "Pausada") {
    return { fundo: CORES.amareloClaro, texto: CORES.amarelo };
  }

  return { fundo: CORES.azulClaro, texto: CORES.azulVivo };
}

function desenharPill(doc, texto, x, y, estilo) {
  const largura = Math.max(doc.font("Helvetica-Bold").fontSize(8).widthOfString(texto) + 20, 56);
  doc.roundedRect(x, y, largura, 22, 11).fill(estilo.fundo);
  doc.font("Helvetica-Bold")
    .fontSize(8)
    .fillColor(estilo.texto)
    .text(texto, x, y + 7, { width: largura, align: "center", lineBreak: false });
  return largura;
}

function desenharCabecalhoPrincipal(doc, estado, dados, logoPath) {
  const esquerda = PAGINA.margemEsquerda;
  const direita = doc.page.width - PAGINA.margemDireita;
  const larguraDireita = 224;
  const xDireita = direita - larguraDireita;

  doc.image(resolverLogoPdf(logoPath), esquerda, 36, {
    cover: [168, 48],
    align: "center",
    valign: "center"
  });

  const yMaquina = 92;
  doc.font("Helvetica-Bold")
    .fontSize(20)
    .fillColor(CORES.azul)
    .text(dados.maquina, esquerda, yMaquina, { width: 275 });
  let fimEsquerda = yMaquina + doc.heightOfString(dados.maquina, { width: 275 });

  if (dados.setor) {
    doc.font("Helvetica-Bold")
      .fontSize(11)
      .fillColor(CORES.textoSuave)
      .text(dados.setor, esquerda, fimEsquerda + 3, { width: 275 });
    fimEsquerda += doc.heightOfString(dados.setor, { width: 275 }) + 3;
  }

  doc.font("Helvetica-Bold")
    .fontSize(18)
    .fillColor(CORES.azul)
    .text("ORDEM DE SERVIÇO", xDireita, 39, {
      width: larguraDireita,
      align: "right",
      lineBreak: false
    });

  doc.roundedRect(xDireita, 67, larguraDireita, 34, 7).fill(CORES.azulClaro);
  doc.font("Helvetica-Bold")
    .fontSize(16)
    .fillColor(CORES.azulVivo)
    .text(`OS #${dados.numero}`, xDireita, 77, {
      width: larguraDireita,
      align: "center",
      lineBreak: false
    });

  let cursorPills = direita;
  const estilos = [];
  if (dados.status) estilos.push({ texto: dados.status, estilo: corStatus(dados.status) });
  if (dados.prioridade) {
    estilos.push({
      texto: dados.prioridade,
      estilo: dados.prioridade === "Urgente"
        ? { fundo: CORES.vermelhoClaro, texto: CORES.vermelho }
        : { fundo: CORES.azulClaro, texto: CORES.azulVivo }
    });
  }

  estilos.forEach((item) => {
    const largura = Math.max(doc.font("Helvetica-Bold").fontSize(8).widthOfString(item.texto) + 20, 56);
    cursorPills -= largura;
    desenharPill(doc, item.texto, cursorPills, 109, item.estilo);
    cursorPills -= 7;
  });

  doc.font("Helvetica")
    .fontSize(8.5)
    .fillColor(CORES.textoSuave)
    .text(`Gerado em: ${dados.geradoEm}`, xDireita, 142, {
      width: larguraDireita,
      align: "right",
      lineBreak: false
    });

  const fimCabecalho = Math.max(fimEsquerda + 9, 156);
  doc.moveTo(esquerda, fimCabecalho)
    .lineTo(direita, fimCabecalho)
    .lineWidth(0.9)
    .strokeColor(CORES.azulBorda)
    .stroke();
  estado.y = fimCabecalho + 14;
}

function desenharTituloSecao(doc, titulo, x, y, largura, cores = {}) {
  const fundo = cores.fundo || CORES.azulClaro;
  const texto = cores.texto || CORES.azul;
  doc.roundedRect(x, y, largura, 28, 7).fill(fundo);
  doc.font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(texto)
    .text(titulo, x + 13, y + 8, { width: largura - 26, lineBreak: false });
}

function desenharDetalhes(doc, estado, dados) {
  if (!dados.detalhes.length) {
    return;
  }

  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const gap = 8;
  const colunas = 3;
  const larguraCelula = (largura - gap * (colunas - 1)) / colunas;
  const linhas = [];

  for (let i = 0; i < dados.detalhes.length; i += colunas) {
    linhas.push(dados.detalhes.slice(i, i + colunas));
  }

  const alturasLinhas = linhas.map((linha) => Math.max(...linha.map((campo) => {
    doc.font("Helvetica-Bold").fontSize(8);
    const alturaRotulo = doc.heightOfString(campo.rotulo, { width: larguraCelula - 20 });
    doc.font("Helvetica-Bold").fontSize(10);
    const alturaValor = doc.heightOfString(campo.valor, { width: larguraCelula - 20 });
    return Math.max(39, alturaRotulo + alturaValor + 15);
  })));
  const alturaTotal = 28 + 8 + alturasLinhas.reduce((soma, altura) => soma + altura, 0) + gap * (linhas.length - 1) + 8;

  garantirEspaco(doc, estado, dados, alturaTotal + 12);
  doc.roundedRect(x, estado.y, largura, alturaTotal, 8)
    .fillAndStroke(CORES.branco, CORES.azulBorda);
  desenharTituloSecao(doc, "Informações da OS", x, estado.y, largura);

  let yLinha = estado.y + 36;
  linhas.forEach((linha, indiceLinha) => {
    linha.forEach((campo, indiceColuna) => {
      const xCelula = x + indiceColuna * (larguraCelula + gap);
      const altura = alturasLinhas[indiceLinha];
      doc.roundedRect(xCelula + 9, yLinha, larguraCelula - 9, altura, 5).fill(CORES.cinzaFundo);
      doc.font("Helvetica-Bold")
        .fontSize(8)
        .fillColor(CORES.textoSuave)
        .text(campo.rotulo, xCelula + 18, yLinha + 6, { width: larguraCelula - 27 });
      const yValor = doc.y + 1;
      doc.font("Helvetica-Bold")
        .fontSize(10)
        .fillColor(CORES.texto)
        .text(campo.valor, xCelula + 18, yValor, { width: larguraCelula - 27 });
    });
    yLinha += alturasLinhas[indiceLinha] + gap;
  });
  estado.y += alturaTotal + 13;
}

function desenharTempos(doc, estado, dados) {
  if (!dados.tempos) {
    return;
  }

  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const gap = 8;
  const larguraCard = (largura - gap * 2) / 3;
  const itens = [
    [dados.tempos.tituloFinal, dados.tempos.ateFinalizar],
    ["Tempo em pausa", dados.tempos.parado],
    ["Tempo em andamento", dados.tempos.andamentoReal]
  ];

  garantirEspaco(doc, estado, dados, 60);
  itens.forEach(([rotulo, valor], indice) => {
    const xCard = x + indice * (larguraCard + gap);
    doc.roundedRect(xCard, estado.y, larguraCard, 51, 7)
      .fillAndStroke(CORES.azulClaro, CORES.azulBorda);
    doc.font("Helvetica-Bold")
      .fontSize(8.5)
      .fillColor(CORES.textoSuave)
      .text(rotulo, xCard + 10, estado.y + 8, { width: larguraCard - 20, align: "center" });
    doc.font("Helvetica-Bold")
      .fontSize(15)
      .fillColor(CORES.azul)
      .text(valor, xCard + 10, estado.y + 26, { width: larguraCard - 20, align: "center", lineBreak: false });
  });
  estado.y += 61;
}

function dividirPalavra(doc, palavra, larguraMaxima) {
  const partes = [];
  let atual = "";

  for (const caractere of palavra) {
    const candidato = atual + caractere;
    if (atual && doc.widthOfString(candidato) > larguraMaxima) {
      partes.push(atual);
      atual = caractere;
    } else {
      atual = candidato;
    }
  }

  if (atual) partes.push(atual);
  return partes;
}

function quebrarTextoEmLinhas(doc, texto, larguraMaxima) {
  const linhas = [];
  const paragrafos = String(texto).replace(/\r/g, "").split("\n");

  paragrafos.forEach((paragrafo, indiceParagrafo) => {
    const palavrasOriginais = paragrafo.trim() ? paragrafo.trim().split(/\s+/) : [];
    const palavras = palavrasOriginais.flatMap((palavra) => (
      doc.widthOfString(palavra) > larguraMaxima
        ? dividirPalavra(doc, palavra, larguraMaxima)
        : [palavra]
    ));
    let linha = "";

    palavras.forEach((palavra) => {
      const candidata = linha ? `${linha} ${palavra}` : palavra;
      if (linha && doc.widthOfString(candidata) > larguraMaxima) {
        linhas.push(linha);
        linha = palavra;
      } else {
        linha = candidata;
      }
    });

    linhas.push(linha);
    if (indiceParagrafo < paragrafos.length - 1) linhas.push("");
  });

  return linhas.length ? linhas : [""];
}

function quebrarValorComPrimeiraLinha(doc, texto, larguraPrimeiraLinha, larguraDemaisLinhas) {
  const palavras = String(texto).trim().split(/\s+/).flatMap((palavra) => (
    doc.widthOfString(palavra) > larguraDemaisLinhas
      ? dividirPalavra(doc, palavra, larguraDemaisLinhas)
      : [palavra]
  ));
  const linhas = [];
  let linha = "";

  palavras.forEach((palavra) => {
    const limite = linhas.length === 0 ? larguraPrimeiraLinha : larguraDemaisLinhas;
    const candidata = linha ? `${linha} ${palavra}` : palavra;

    if (linha && doc.widthOfString(candidata) > limite) {
      linhas.push(linha);
      linha = palavra;
    } else if (!linha && doc.widthOfString(palavra) > limite) {
      linhas.push("");
      linha = palavra;
    } else {
      linha = candidata;
    }
  });

  if (linha || linhas.length === 0) linhas.push(linha);
  return linhas;
}

function desenharSecaoTexto(doc, estado, dados, titulo, texto, estilo = {}) {
  if (!texto) {
    return;
  }

  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const padding = 10;
  const alturaTitulo = 28;
  const tamanhoFonte = 10;
  const alturaLinha = 13;
  const fundo = estilo.fundo || CORES.branco;
  const borda = estilo.borda || CORES.azulBorda;
  const fundoTitulo = estilo.fundoTitulo || CORES.azulClaro;
  const textoTitulo = estilo.textoTitulo || CORES.azul;

  doc.font("Helvetica").fontSize(tamanhoFonte);
  const linhas = quebrarTextoEmLinhas(doc, texto, largura - padding * 2);
  let indiceLinha = 0;
  let continuacao = false;

  while (indiceLinha < linhas.length) {
    const minimo = alturaTitulo + padding * 2 + alturaLinha;
    garantirEspaco(doc, estado, dados, minimo);
    const alturaDisponivel = PAGINA.limiteConteudoInferior - estado.y;
    const maximoLinhas = Math.max(1, Math.floor((alturaDisponivel - alturaTitulo - padding * 2) / alturaLinha));
    const quantidade = Math.min(maximoLinhas, linhas.length - indiceLinha);
    const alturaBloco = alturaTitulo + padding * 2 + quantidade * alturaLinha;
    const tituloAtual = continuacao ? `${titulo} (continuação)` : titulo;

    doc.roundedRect(x, estado.y, largura, alturaBloco, 8).fillAndStroke(fundo, borda);
    desenharTituloSecao(doc, tituloAtual, x, estado.y, largura, {
      fundo: fundoTitulo,
      texto: textoTitulo
    });

    doc.font("Helvetica").fontSize(tamanhoFonte).fillColor(CORES.texto);
    const yTexto = estado.y + alturaTitulo + padding;
    linhas.slice(indiceLinha, indiceLinha + quantidade).forEach((linha, indice) => {
      doc.text(linha || " ", x + padding, yTexto + indice * alturaLinha, {
        width: largura - padding * 2,
        lineBreak: false
      });
    });

    indiceLinha += quantidade;
    estado.y += alturaBloco + 13;
    continuacao = true;

    if (indiceLinha < linhas.length) {
      adicionarPagina(doc, estado, dados);
    }
  }
}

function medirCampoPausa(doc, campo, largura) {
  const rotulo = `${campo.rotulo}:`;
  const larguraRotulo = doc.font("Helvetica-Bold").fontSize(8.5).widthOfString(rotulo) + 4;
  doc.font("Helvetica").fontSize(9);
  const linhas = quebrarValorComPrimeiraLinha(
    doc,
    campo.valor,
    Math.max(largura - larguraRotulo, 20),
    largura
  );
  return linhas.length * 11 + 5;
}

function desenharCampoPausa(doc, campo, x, y, largura) {
  const rotulo = `${campo.rotulo}:`;
  const larguraRotulo = doc.font("Helvetica-Bold").fontSize(8.5).widthOfString(rotulo) + 4;
  doc.font("Helvetica").fontSize(9);
  const linhas = quebrarValorComPrimeiraLinha(
    doc,
    campo.valor,
    Math.max(largura - larguraRotulo, 20),
    largura
  );

  linhas.forEach((linha, indice) => {
    doc.font("Helvetica")
      .fontSize(9)
      .fillColor(CORES.texto)
      .text(linha, indice === 0 ? x + larguraRotulo : x, y + indice * 11, {
        width: indice === 0 ? largura - larguraRotulo : largura,
        lineBreak: false
      });
  });
  doc.font("Helvetica-Bold")
    .fontSize(8.5)
    .fillColor(CORES.azul)
    .text(rotulo, x, y, {
      width: largura,
      lineBreak: false
    });
}

function desenharPausa(doc, estado, dados, pausa) {
  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const gap = 18;
  const larguraColuna = (largura - 38 - gap) / 2;
  const colunaEsquerda = pausa.campos.slice(0, 3);
  const colunaDireita = pausa.campos.slice(3);
  const alturaEsquerda = colunaEsquerda.reduce((soma, campo) => soma + medirCampoPausa(doc, campo, larguraColuna), 0);
  const alturaDireita = colunaDireita.reduce((soma, campo) => soma + medirCampoPausa(doc, campo, larguraColuna), 0);
  const alturaCard = 31 + Math.max(alturaEsquerda, alturaDireita, 20) + 8;
  const alturaMaximaCard = PAGINA.limiteConteudoInferior - 70;

  if (alturaCard > alturaMaximaCard) {
    pausa.campos.forEach((campo, indice) => {
      desenharSecaoTexto(
        doc,
        estado,
        dados,
        `Pausa ${pausa.sequencia}${indice === 0 ? "" : " (continuação)"} - ${campo.rotulo}`,
        campo.valor,
        {
          fundo: CORES.branco,
          borda: "#F2C391",
          fundoTitulo: CORES.laranjaClaro,
          textoTitulo: CORES.laranja
        }
      );
    });
    return;
  }

  garantirEspaco(doc, estado, dados, alturaCard + 10);
  doc.roundedRect(x, estado.y, largura, alturaCard, 7)
    .fillAndStroke(CORES.branco, "#F2C391");
  doc.font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(CORES.azul)
    .text(`Pausa ${pausa.sequencia}`, x + 14, estado.y + 9, {
      width: largura - 28,
      lineBreak: false
    });

  const yCampos = estado.y + 29;
  let yEsquerda = yCampos;
  let yDireita = yCampos;
  colunaEsquerda.forEach((campo) => {
    desenharCampoPausa(doc, campo, x + 14, yEsquerda, larguraColuna);
    yEsquerda += medirCampoPausa(doc, campo, larguraColuna);
  });
  colunaDireita.forEach((campo) => {
    desenharCampoPausa(doc, campo, x + 14 + larguraColuna + gap, yDireita, larguraColuna);
    yDireita += medirCampoPausa(doc, campo, larguraColuna);
  });
  estado.y += alturaCard + 10;
}

function desenharHistoricoPausas(doc, estado, dados) {
  if (!dados.pausas.length) {
    return;
  }

  garantirEspaco(doc, estado, dados, 44);
  desenharTituloSecao(
    doc,
    "Histórico de pausas",
    PAGINA.margemEsquerda,
    estado.y,
    larguraConteudo(doc),
    { fundo: CORES.laranjaClaro, texto: CORES.laranja }
  );
  estado.y += 35;
  dados.pausas.forEach((pausa) => desenharPausa(doc, estado, dados, pausa));
}

function desenharRodapes(doc, dados) {
  const intervalo = doc.bufferedPageRange();
  const largura = larguraConteudo(doc);

  for (let indice = 0; indice < intervalo.count; indice += 1) {
    doc.switchToPage(intervalo.start + indice);
    doc.page.margins.bottom = 0;
    const yLinha = doc.page.height - 51;
    const yPrimeiraLinha = doc.page.height - 39;
    const ySegundaLinha = doc.page.height - 25;

    doc.moveTo(PAGINA.margemEsquerda, yLinha)
      .lineTo(doc.page.width - PAGINA.margemDireita, yLinha)
      .lineWidth(0.7)
      .strokeColor(CORES.azulBorda)
      .stroke();
    doc.font("Helvetica-Bold")
      .fontSize(8)
      .fillColor(CORES.texto)
      .text("Sistema de Ordem de Serviço", PAGINA.margemEsquerda, yPrimeiraLinha, {
        width: largura / 2,
        lineBreak: false
      });
    doc.font("Helvetica")
      .fontSize(8)
      .fillColor(CORES.textoSuave)
      .text(`Página ${indice + 1} de ${intervalo.count}`, PAGINA.margemEsquerda + largura / 2, yPrimeiraLinha, {
        width: largura / 2,
        align: "right",
        lineBreak: false
      });
    doc.text(`Gerado em: ${dados.geradoEm}`, PAGINA.margemEsquerda + largura / 2, ySegundaLinha, {
      width: largura / 2,
      align: "right",
      lineBreak: false
    });
  }
}

function renderizarConteudoOS(doc, dados, logoPath, opcoes = {}) {
  if (opcoes.iniciarNovaPagina) {
    doc.addPage();
  }

  const estado = { y: PAGINA.margemSuperior };

  desenharCabecalhoPrincipal(doc, estado, dados, logoPath);
  desenharDetalhes(doc, estado, dados);
  desenharTempos(doc, estado, dados);
  desenharSecaoTexto(doc, estado, dados, "Problema relatado", dados.problema);

  if (dados.acaoFinal) {
    const estilo = dados.acaoFinal.tipo === "conclusao"
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
        };
    desenharSecaoTexto(doc, estado, dados, dados.acaoFinal.titulo, dados.acaoFinal.texto, estilo);
  }

  desenharHistoricoPausas(doc, estado, dados);
  return estado;
}

function desenharPdfOS(doc, dados, logoPath) {
  renderizarConteudoOS(doc, dados, logoPath);
  desenharRodapes(doc, dados);
}

module.exports = {
  CORES,
  PAGINA,
  criarDocumento,
  criarDocumentoBase,
  corStatus,
  desenharPdfOS,
  desenharPill,
  desenharRodapes,
  quebrarTextoEmLinhas,
  larguraConteudo,
  renderizarConteudoOS,
  resolverLogoPdf
};
