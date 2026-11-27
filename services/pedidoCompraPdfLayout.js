const {
  CORES, PAGINA, criarDocumentoBase, quebrarTextoEmLinhas, larguraConteudo, resolverLogoPdf
} = require("./osPdfLayout");

const ALTURA_LINHA = 14;
const PADDING = 9;

function criarDocumentoPedido() {
  return criarDocumentoBase({ titulo: "Pedido de Compra", assunto: "Itens para compra" });
}

function desenharPedidoCompra(doc, pedido, logoPath) {
  const x = PAGINA.margemEsquerda;
  const largura = larguraConteudo(doc);
  const larguras = [46, largura - 154, 108];
  const limite = PAGINA.limiteConteudoInferior;
  let y;
  let inicioTabela;

  function desenharCelulas(colunas, altura, cabecalho = false, alternada = false) {
    let colunaX = x;
    colunas.forEach((linhas, indice) => {
      doc.rect(colunaX, y, larguras[indice], altura)
        .fillAndStroke(cabecalho ? CORES.azul : alternada ? CORES.cinzaFundo : CORES.branco, CORES.cinzaBorda);
      doc.font(cabecalho ? "Helvetica-Bold" : "Helvetica")
        .fontSize(cabecalho ? 9 : 10)
        .fillColor(cabecalho ? CORES.branco : CORES.texto);
      linhas.forEach((linha, posicao) => {
        doc.text(linha, colunaX + PADDING, y + PADDING + posicao * ALTURA_LINHA, {
          width: larguras[indice] - PADDING * 2,
          align: indice === 0 ? "center" : indice === 2 ? "right" : "left",
          lineBreak: false
        });
      });
      colunaX += larguras[indice];
    });
    y += altura;
  }

  function iniciarPagina(nova = false) {
    if (nova) doc.addPage();
    // A imagem original tem margens brancas; o recorte de exibição preserva a logo.
    doc.save().rect(x, 35, 126, 42).clip();
    doc.image(resolverLogoPdf(logoPath), x, 35, { cover: [126, 42], align: "center", valign: "center" });
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(18).fillColor(CORES.azul)
      .text("PEDIDO DE COMPRA", x + 150, 44, { width: largura - 150, align: "right", lineBreak: false });
    doc.font("Helvetica").fontSize(10).fillColor(CORES.texto);
    const fornecedor = quebrarTextoEmLinhas(doc, `Fornecedor: ${pedido.fornecedor}`, largura);
    y = 92;
    fornecedor.forEach((linha) => {
      doc.text(linha, x, y, { width: largura, lineBreak: false });
      y += ALTURA_LINHA;
    });
    y += 12;
    desenharCelulas([["ITEM"], ["PRODUTO"], ["QUANTIDADE"]], 32, true);
    inicioTabela = y;
  }

  iniciarPagina();
  pedido.itens.forEach((item, indice) => {
    doc.font("Helvetica").fontSize(10);
    const linhasProduto = quebrarTextoEmLinhas(doc, item.produto, larguras[1] - PADDING * 2);
    const linhasQuantidade = quebrarTextoEmLinhas(
      doc, item.quantidade.toLocaleString("pt-BR", { maximumFractionDigits: 20 }), larguras[2] - PADDING * 2
    );
    const totalLinhas = Math.max(linhasProduto.length, linhasQuantidade.length);
    const alturaTotal = totalLinhas * ALTURA_LINHA + PADDING * 2;
    // Uma linha que cabe inteira em uma página não é dividida entre páginas.
    if (y + alturaTotal > limite && y > inicioTabela) iniciarPagina(true);
    let deslocamento = 0;
    while (deslocamento < totalLinhas) {
      const continuacao = deslocamento > 0;
      const linhasExtras = continuacao ? 1 : 0;
      const capacidade = Math.floor((limite - y - PADDING * 2) / ALTURA_LINHA) - linhasExtras;
      if (capacidade < 1) {
        iniciarPagina(true);
        continue;
      }
      const quantidade = Math.min(capacidade, totalLinhas - deslocamento);
      const produto = linhasProduto.slice(deslocamento, deslocamento + quantidade);
      if (continuacao) produto.unshift("(continuação)");
      desenharCelulas([
        [String(indice + 1)],
        produto,
        linhasQuantidade.slice(deslocamento, deslocamento + quantidade)
      ], (quantidade + linhasExtras) * ALTURA_LINHA + PADDING * 2, false, indice % 2 === 1);
      deslocamento += quantidade;
      if (deslocamento < totalLinhas) iniciarPagina(true);
    }
  });

  const paginas = doc.bufferedPageRange();
  for (let pagina = 0; pagina < paginas.count; pagina += 1) {
    doc.switchToPage(paginas.start + pagina);
    doc.page.margins.bottom = 0;
    doc.moveTo(x, 793).lineTo(x + largura, 793).strokeColor(CORES.azulBorda).stroke();
    doc.font("Helvetica").fontSize(8).fillColor(CORES.textoSuave)
      .text("Pedido de Compra", x, 804, { lineBreak: false });
    doc.text(`Página ${pagina + 1} de ${paginas.count}`, x, 804, { width: largura, align: "right", lineBreak: false });
  }
}

module.exports = { criarDocumentoPedido, desenharPedidoCompra };
