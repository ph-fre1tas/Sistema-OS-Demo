const { prepararPedidoCompra } = require("./pedidoCompraDataService");
const { criarDocumentoPedido, desenharPedidoCompra } = require("./pedidoCompraPdfLayout");
const { gerarBufferPdf } = require("./pdfBufferService");
const { LOGO_OFICIAL_PATH } = require("./osPdfService");

async function gerarPedidoCompraPdf(entrada) {
  const pedido = prepararPedidoCompra(entrada);
  const buffer = await gerarBufferPdf(criarDocumentoPedido(), (doc) => {
    desenharPedidoCompra(doc, pedido, LOGO_OFICIAL_PATH);
  });
  return { buffer, fileName: `${pedido.nomeArquivo}.pdf` };
}

module.exports = { gerarPedidoCompraPdf };
