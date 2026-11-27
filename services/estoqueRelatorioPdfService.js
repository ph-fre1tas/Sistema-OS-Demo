const { criarDocumentoBase } = require("./osPdfLayout");
const { gerarBufferPdf } = require("./pdfBufferService");
const { LOGO_OFICIAL_PATH } = require("./osPdfService");
const { desenharRelatorioRetiradas } = require("./estoqueRelatorioPdfLayout");

function gerarEstoqueRelatorioPdf(retiradas, filtros, { geradoEm = new Date() } = {}) {
    const doc = criarDocumentoBase({ titulo: "Relatório de retiradas de estoque", assunto: "Detalhamento das retiradas" });
    return gerarBufferPdf(doc, documento => desenharRelatorioRetiradas(documento, retiradas, filtros, geradoEm, LOGO_OFICIAL_PATH));
}

module.exports = { gerarEstoqueRelatorioPdf };
