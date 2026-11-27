const path = require("path");
const { criarDocumento, desenharPdfOS } = require("./osPdfLayout");
const { gerarBufferPdf } = require("./pdfBufferService");

const LOGO_OFICIAL_PATH = path.join(
  __dirname,
  "..",
  "public",
  "assets",
  "img",
  "logo-oficial.png"
);

function gerarPdfOS(dados, opcoes = {}) {
  const logoPath = opcoes.logoPath || LOGO_OFICIAL_PATH;
  const documento = criarDocumento(dados);
  return gerarBufferPdf(documento, (doc) => desenharPdfOS(doc, dados, logoPath));
}

module.exports = {
  gerarPdfOS,
  LOGO_OFICIAL_PATH
};
