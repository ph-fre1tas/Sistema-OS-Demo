const fs = require("node:fs/promises");
const path = require("node:path");
const ExcelJS = require("exceljs");
const { prepararPedidoCompra } = require("./pedidoCompraDataService");

const TEMPLATE_PATH = path.join(__dirname, "..", "public", "assets", "templates", "template.xlsx");
const WORKSHEET_NAME = "Fornecedor";
const FIRST_DATA_ROW = 3;

const PREFIXO_FORMULA_PLANILHA = /^[=+\-@|\t\r]/;
let templateBufferPromise;

function obterTemplateBuffer() {
  if (!templateBufferPromise) {
    templateBufferPromise = fs.readFile(TEMPLATE_PATH).catch((erro) => {
      templateBufferPromise = null;
      throw erro;
    });
  }
  return templateBufferPromise;
}

function sanitizarTextoPlanilha(valor) {
  const textoBruto = String(valor || "");
  const texto = textoBruto.trim();
  if (!texto) {
    return "";
  }
  if (PREFIXO_FORMULA_PLANILHA.test(textoBruto) || PREFIXO_FORMULA_PLANILHA.test(texto)) {
    return `'${texto}`;
  }
  return texto;
}

async function gerarPedidoCompraExcel(entrada) {
  const pedido = prepararPedidoCompra(entrada);
  const templateBuffer = await obterTemplateBuffer();
  const workbook = new ExcelJS.Workbook();
  // O template em memória preserva estilos, bordas e mesclagens sem releitura de disco.
  await workbook.xlsx.load(templateBuffer);

  const worksheet = workbook.getWorksheet(WORKSHEET_NAME) || workbook.worksheets[0];
  if (!worksheet) throw new Error("A aba do template não foi encontrada.");

  // Guardamos o estilo da linha modelo antes de remover os espaços reservados.
  const estilos = [1, 2, 3].map((coluna) => structuredClone(worksheet.getCell(FIRST_DATA_ROW, coluna).style));
  const alturaModelo = worksheet.getRow(FIRST_DATA_ROW).height || worksheet.properties.defaultRowHeight || 15;
  const modelo = worksheet.model;
  // A remoção do bloco final via spliceRows não elimina suas linhas formatadas no ExcelJS.
  modelo.merges.forEach((intervalo) => worksheet.unMergeCells(intervalo));
  worksheet.model = {
    ...modelo,
    mergeCells: modelo.merges,
    rows: modelo.rows.filter((linha) => linha.number < FIRST_DATA_ROW)
  };
  worksheet.getCell("A1").value = sanitizarTextoPlanilha(pedido.fornecedor);
  worksheet.getCell("A1").alignment = { ...worksheet.getCell("A1").alignment, wrapText: true };
  const larguraTitulo = worksheet.columns.reduce((total, coluna) => total + (coluna.width || 8), 0);
  worksheet.getRow(1).height = Math.max(20, Math.ceil(pedido.fornecedor.length / (larguraTitulo * 0.85)) * 16 + 4);

  pedido.itens.forEach((item, index) => {
    const rowNumber = FIRST_DATA_ROW + index;
    const linha = worksheet.getRow(rowNumber);
    linha.values = [index + 1, sanitizarTextoPlanilha(item.produto), item.quantidade];
    estilos.forEach((estilo, coluna) => {
      const celula = linha.getCell(coluna + 1);
      celula.style = structuredClone(estilo);
      celula.alignment = { ...celula.alignment, vertical: "middle", wrapText: true };
    });
    // Altura proporcional para descrições extensas, incluindo quebras explícitas.
    const caracteresPorLinha = Math.max(10, Math.floor((worksheet.getColumn(2).width || 40) * 0.85));
    const linhasTexto = item.produto.split(/\r?\n/).reduce(
      (total, texto) => total + Math.max(1, Math.ceil(texto.length / caracteresPorLinha)), 0
    );
    linha.height = Math.min(409, Math.max(alturaModelo, linhasTexto * alturaModelo + 6));
  });

  worksheet.pageSetup = {
    ...worksheet.pageSetup,
    paperSize: 9,
    fitToPage: true,
    fitToWidth: 1,
    fitToHeight: 0,
    printArea: `A1:C${FIRST_DATA_ROW + pedido.itens.length - 1}`,
    printTitlesRow: "1:2"
  };
  const buffer = await workbook.xlsx.writeBuffer();
  return {
    buffer,
    fileName: `${pedido.nomeArquivo}.xlsx`
  };
}

module.exports = {
  gerarPedidoCompraExcel
};
