function erroDeValidacao(mensagem) {
  const erro = new Error(mensagem);
  erro.statusCode = 400;
  return erro;
}

function normalizarNomeArquivo(nome) {
  return nome
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "Fornecedor";
}

function prepararPedidoCompra(entrada = {}) {
  const fornecedor = String(entrada?.fornecedor || "").trim();
  if (!fornecedor) throw erroDeValidacao("Selecione um fornecedor antes de gerar o pedido.");
  if (fornecedor.length > 120) throw erroDeValidacao("O fornecedor deve ter no máximo 120 caracteres.");
  if (!Array.isArray(entrada?.itens) || entrada.itens.length === 0) {
    throw erroDeValidacao("Selecione pelo menos um produto para gerar o pedido.");
  }

  const itens = entrada.itens.map((item) => {
    const produto = String(item?.produto || "").trim();
    const valor = item?.quantidade;
    const quantidade = Number(valor);
    if (!produto || !["number", "string"].includes(typeof valor)
      || String(valor).trim() === "" || !Number.isFinite(quantidade) || quantidade < 0) {
      throw erroDeValidacao("Existe um produto com nome ou quantidade inválida.");
    }
    return { produto, quantidade };
  });

  return { fornecedor, itens, nomeArquivo: `Pedido - ${normalizarNomeArquivo(fornecedor)}` };
}

module.exports = { prepararPedidoCompra };
