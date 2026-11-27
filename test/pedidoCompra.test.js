const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");
const ExcelJS = require("exceljs");
const { prepararPedidoCompra } = require("../services/pedidoCompraDataService");
const { gerarPedidoCompraExcel } = require("../services/pedidoCompraExcelService");
const { gerarPedidoCompraPdf } = require("../services/pedidoCompraPdfService");

function pedidoComItens(total) {
  return {
    fornecedor: "Fornecedor de teste",
    itens: Array.from({ length: total }, (_, indice) => ({
      produto: `Produto ${indice + 1}`, quantidade: indice + 0.25
    }))
  };
}

test("Excel tem somente as linhas selecionadas e estende o estilo além de 48 itens", async () => {
  for (const total of [1, 4, 49, 120]) {
    const pedido = pedidoComItens(total);
    const { buffer } = await gerarPedidoCompraExcel(pedido);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const sheet = workbook.getWorksheet("Fornecedor");
    assert.equal(sheet.rowCount, total + 2);
    assert.equal(sheet.pageSetup.printArea, `A1:C${total + 2}`);
    assert.equal(sheet.pageSetup.printTitlesRow, "1:2");
    assert.equal(sheet.pageSetup.fitToHeight, 0);
    assert.deepEqual(sheet.model.merges, ["A1:C1"]);
    pedido.itens.forEach((item, indice) => {
      const row = indice + 3;
      assert.deepEqual(sheet.getRow(row).values.slice(1), [indice + 1, item.produto, item.quantidade]);
      for (const coluna of [1, 2, 3]) {
        assert.equal(sheet.getCell(row, coluna).border.bottom.style, "thin");
        assert.deepEqual(sheet.getCell(row, coluna).style, sheet.getCell(3, coluna).style);
      }
    });
  }
});

test("Excel preserva textos literais e expande descrições longas", async () => {
  const entrada = {
    fornecedor: "=Fornecedor/teste",
    itens: [
      { produto: "=PRODUTO\n" + "Peça longa ".repeat(20), quantidade: 1.75 },
      { produto: "|DDE!A1", quantidade: 2 },
      { produto: "\t+1+1", quantidade: 3 },
      { produto: "\r@SUM(A1:A2)", quantidade: 4 }
    ]
  };
  const arquivo = await gerarPedidoCompraExcel(entrada);
  assert.equal(arquivo.buffer.subarray(0, 4).toString("latin1"), "PK\x03\x04");
  assert.match(arquivo.fileName, /\.xlsx$/);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(arquivo.buffer);
  const sheet = workbook.worksheets[0];
  assert.equal(sheet.getCell("A1").value, "'=Fornecedor/teste");
  assert.equal(sheet.getCell("B3").value, "'" + entrada.itens[0].produto.trim());
  assert.equal(sheet.getCell("B3").type, ExcelJS.ValueType.String);
  assert.equal(sheet.getCell("B4").value, "'|DDE!A1");
  assert.equal(sheet.getCell("B5").value, "'+1+1");
  assert.equal(sheet.getCell("B6").value, "'@SUM(A1:A2)");
  assert.ok(sheet.getRow(3).height > 30);
  assert.ok(!arquivo.fileName.includes("/"));
});

test("Excel e PDF rejeitam as mesmas quantidades inválidas, preservando zero e decimais", async () => {
  for (const quantidade of [-1, null, "", "  ", "abc", false, Infinity]) {
    const pedido = pedidoComItens(1);
    pedido.itens[0].quantidade = quantidade;
    for (const gerar of [gerarPedidoCompraExcel, gerarPedidoCompraPdf]) {
      await assert.rejects(gerar(pedido), (erro) => erro.statusCode === 400);
    }
  }
  const pedido = pedidoComItens(2);
  pedido.itens[0].quantidade = 0;
  assert.deepEqual(prepararPedidoCompra(pedido).itens.map(item => item.quantidade), [0, 1.25]);
});

test("PDF compacto não cria linhas vazias e pagina pedidos grandes e descrições extensas", async () => {
  for (const total of [4, 120]) {
    const { buffer } = await gerarPedidoCompraPdf(pedidoComItens(total));
    assert.equal(buffer.subarray(0, 5).toString(), "%PDF-");
    const paginas = (buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length;
    assert.ok(total === 4 ? paginas === 1 : paginas > 1);
  }
  const pedido = pedidoComItens(2);
  pedido.itens[0].produto = "Descrição extensa de uma peça para compra. ".repeat(350);
  const { buffer } = await gerarPedidoCompraPdf(pedido);
  assert.ok((buffer.toString("latin1").match(/\/Type\s*\/Page\b/g) || []).length > 2);
});

test("quantidade editada no Pedido Atual sincroniza a tabela e exporta inclusive itens filtrados", async () => {
  const elementos = new Map();
  function elemento(id) {
    if (!elementos.has(id)) elementos.set(id, {
      value: "", innerHTML: "", dataset: {}, validity: { badInput: false }, atributos: {},
      addEventListener() {}, replaceChildren() {}, appendChild() {},
      setAttribute(nome, valor) { this.atributos[nome] = valor; },
      getAttribute(nome) { return this.atributos[nome]; }
    });
    return elementos.get(id);
  }
  const contexto = vm.createContext({
    document: { getElementById: elemento, querySelector: () => elemento("descricao"), createElement: () => elemento("opcao"), createDocumentFragment: () => elemento("fragmento") },
    localStorage: { getItem: () => null },
    requisicaoEstoque: async () => [{ id: 1, descricao: "Rolamento", unidade: "UN", estoque_minimo: 10, estoque_atual: 1 }],
    escapar: String, numero: String, console
  });
  vm.runInContext(fs.readFileSync(require.resolve("../public/js/pedido-compra.js"), "utf8"), contexto);
  await new Promise(resolve => setImmediate(resolve));
  vm.runInContext("itensPedido.set(1, 9); atualizarPainelPedido();", contexto);
  const campo = elemento("pedido-comprar-1");
  const tabela = elemento("comprar-1");
  campo.value = "2.75";
  contexto.alterarQuantidade({ dataset: { produtoId: "1" }, querySelector: () => campo });
  assert.equal(tabela.value, "2.75");
  assert.equal(contexto.itensParaExportacao()[0].quantidade, 2.75);
  elemento("buscaPedido").value = "não encontrado";
  contexto.renderizarProdutosPedido();
  assert.equal(contexto.produtosVisiveisPedido().length, 0);
  campo.value = "4";
  contexto.alterarQuantidade({ dataset: { produtoId: "1" }, querySelector: () => campo });
  assert.equal(contexto.itensParaExportacao()[0].quantidade, 4);
  tabela.value = "0";
  contexto.alterarQuantidade({ dataset: { produtoId: "1" }, querySelector: () => tabela });
  assert.equal(campo.value, "0");
  campo.value = "";
  contexto.alterarQuantidade({ dataset: { produtoId: "1" }, querySelector: () => campo });
  assert.equal(campo.getAttribute("aria-invalid"), "true");
  assert.ok(Number.isNaN(contexto.itensParaExportacao()[0].quantidade));
});

test("filtro de itens em falta exibe somente produtos abaixo do estoque mínimo", async () => {
  const elementos = new Map();
  function elemento(id) {
    if (!elementos.has(id)) elementos.set(id, {
      value: "", innerHTML: "", dataset: {}, validity: { badInput: false }, atributos: {},
      addEventListener() {}, replaceChildren() {}, appendChild() {},
      setAttribute(nome, valor) { this.atributos[nome] = valor; },
      getAttribute(nome) { return this.atributos[nome]; }
    });
    return elementos.get(id);
  }
  const contexto = vm.createContext({
    document: { getElementById: elemento, querySelector: () => elemento("descricao"), createElement: () => elemento("opcao"), createDocumentFragment: () => elemento("fragmento") },
    localStorage: { getItem: () => null },
    requisicaoEstoque: async () => [
      { id: 1, descricao: "Abaixo", unidade: "UN", estoque_minimo: 10, estoque_atual: 9 },
      { id: 2, descricao: "No mínimo", unidade: "UN", estoque_minimo: 10, estoque_atual: 10 },
      { id: 3, descricao: "Acima", unidade: "UN", estoque_minimo: 10, estoque_atual: 11 }
    ],
    escapar: String, numero: String, console
  });
  vm.runInContext(fs.readFileSync(require.resolve("../public/js/pedido-compra.js"), "utf8"), contexto);
  await new Promise(resolve => setImmediate(resolve));

  assert.deepEqual(
    Array.from(contexto.produtosVisiveisPedido()).map((produto) => produto.descricao),
    ["Abaixo"]
  );

  const htmlTabelaInicial = elemento("listaProdutosCompra").innerHTML;
  let marcado = false;
  const classes = new Set();
  const campoLinha = {
    value: "3",
    validity: { badInput: false },
    atributos: {},
    setAttribute(n, v) { this.atributos[n] = v; },
    getAttribute(n) { return this.atributos[n]; }
  };
  const seletorLinha = { checked: false };
  const linha = {
    dataset: { produtoId: "1" },
    classList: {
      toggle(nome, forcar) {
        if (forcar) classes.add(nome);
        else classes.delete(nome);
      }
    },
    querySelector(seletor) {
      if (seletor === "[data-campo-comprar]") return campoLinha;
      if (seletor === "[data-seletor-produto]") return seletorLinha;
      return null;
    }
  };
  contexto.selecionarProduto(linha, true);
  assert.equal(elemento("listaProdutosCompra").innerHTML, htmlTabelaInicial, "Não reconstrói a tabela inteira ao selecionar");
  assert.equal(classes.has("selecionado"), true);
  assert.equal(seletorLinha.checked, true);
  assert.equal(contexto.itensParaExportacao()[0].quantidade, 3);
  contexto.selecionarProduto(linha, false);
  assert.equal(classes.has("selecionado"), false);
  assert.equal(seletorLinha.checked, false);
  assert.equal(campoLinha.value, "1");
  assert.equal(contexto.itensParaExportacao().length, 0);
});
