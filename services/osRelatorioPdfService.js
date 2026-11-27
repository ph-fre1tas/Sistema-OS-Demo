const { LOGO_OFICIAL_PATH } = require("./osPdfService");
const {
  criarDocumentoRelatorio,
  desenharPdfRelatorio
} = require("./osRelatorioPdfLayout");
const { gerarBufferPdf } = require("./pdfBufferService");

function gerarPdfRelatorio(dados, opcoes = {}) {
  const logoPath = opcoes.logoPath || LOGO_OFICIAL_PATH;
  const documento = criarDocumentoRelatorio(dados);
  return gerarBufferPdf(documento, (doc) => desenharPdfRelatorio(doc, dados, logoPath));
}

module.exports = { gerarPdfRelatorio };
