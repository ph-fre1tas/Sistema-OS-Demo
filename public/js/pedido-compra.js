// Mantemos todos os produtos em memoria; a visualizacao em falta e aplicada somente ao renderizar.
const produtosPedido = [];
// O mapa guarda a selecao e a quantidade mesmo quando o produto fica oculto por um filtro.
const itensPedido = new Map();
let gerandoPedido = false;
const chaveFornecedores = "fornecedoresPedidoCompra";
const valoresFornecedoresPadrao = new Set(["principal", "alternativo"]);
const elementosPedido = {
    fornecedor: document.getElementById("fornecedorPedido"),
    novoFornecedor: document.getElementById("novoFornecedor"),
    mensagemFornecedor: document.getElementById("mensagemFornecedor"),
    busca: document.getElementById("buscaPedido"),
    visualizacao: document.getElementById("visualizacaoPedido"),
    adicionarFornecedor: document.getElementById("adicionarFornecedor"),
    listaProdutos: document.getElementById("listaProdutosCompra"),
    pedidoAtualLista: document.getElementById("pedidoAtualLista"),
    totalItens: document.getElementById("totalItensPedido"),
    limparPedido: document.getElementById("limparPedido"),
    gerarExcel: document.getElementById("gerarExcel"),
    gerarPdf: document.getElementById("gerarPdfPedido"),
    descricaoProdutos: document.querySelector(".pedido-produtos-panel .section-title p")
};

function fornecedorValido(fornecedor) {
    return fornecedor
        && fornecedor.value
        && fornecedor.label
        && !valoresFornecedoresPadrao.has(fornecedor.value);
}

function lerFornecedores() {
    try {
        const fornecedoresSalvos = JSON.parse(localStorage.getItem(chaveFornecedores) || "[]");
        if (Array.isArray(fornecedoresSalvos)) {
            // Remove registros antigos ou invalidos sem apagar fornecedores personalizados validos.
            const fornecedoresValidos = fornecedoresSalvos.filter(fornecedorValido);
            if (fornecedoresValidos.length !== fornecedoresSalvos.length) salvarFornecedores(fornecedoresValidos);
            return fornecedoresValidos;
        }
    } catch (erro) {
        console.warn("Não foi possível carregar fornecedores salvos.", erro);
    }
    return [];
}

function salvarFornecedores(fornecedores) {
    try {
        localStorage.setItem(chaveFornecedores, JSON.stringify(fornecedores));
    } catch (erro) {
        console.warn("Não foi possível salvar o fornecedor.", erro);
    }
}

function exibirFornecedores(valorSelecionado = "") {
    const fornecedores = lerFornecedores();
    const fragmento = document.createDocumentFragment();
    const opcaoInicial = document.createElement("option");
    opcaoInicial.value = "";
    opcaoInicial.textContent = "Selecione um fornecedor";
    fragmento.appendChild(opcaoInicial);

    fornecedores.forEach((fornecedor) => {
        const opcao = document.createElement("option");
        opcao.value = fornecedor.value;
        opcao.textContent = fornecedor.label;
        opcao.selected = fornecedor.value === valorSelecionado;
        fragmento.appendChild(opcao);
    });

    elementosPedido.fornecedor.replaceChildren(fragmento);
}

function informarFornecedor(mensagem = "") {
    elementosPedido.mensagemFornecedor.textContent = mensagem;
}

function adicionarFornecedor() {
    const campo = elementosPedido.novoFornecedor;
    const nome = campo.value.trim();
    if (!nome) {
        informarFornecedor("Digite o nome do fornecedor.");
        campo.focus();
        return;
    }

    const fornecedores = lerFornecedores();
    const existente = fornecedores.find((fornecedor) => fornecedor.label.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"));
    if (existente) {
        exibirFornecedores(existente.value);
        campo.value = "";
        informarFornecedor("Fornecedor já adicionado e selecionado.");
        return;
    }

    const novoFornecedor = { value: `fornecedor-${Date.now()}`, label: nome };
    fornecedores.push(novoFornecedor);
    salvarFornecedores(fornecedores);
    exibirFornecedores(novoFornecedor.value);
    campo.value = "";
    informarFornecedor("Fornecedor adicionado e selecionado.");
}

function quantidadeSugerida(produto) {
    return Math.max(0, Number(produto.estoque_minimo) - Number(produto.estoque_atual));
}

function produtoPorId(id) {
    return produtosPedido.find((produto) => Number(produto.id) === Number(id));
}

function filtrosPedidoAtuais() {
    return {
        busca: elementosPedido.busca.value.trim().toLocaleLowerCase("pt-BR"),
        modo: elementosPedido.visualizacao.value || "falta"
    };
}

function produtosVisiveisPedido(filtros = filtrosPedidoAtuais()) {
    const { busca, modo } = filtros;

    // O filtro de texto e aplicado depois do filtro de estoque para respeitar o modo selecionado.
    return produtosPedido.filter((produto) => {
        const estoqueAtende = modo === "todos" || Number(produto.estoque_atual) < Number(produto.estoque_minimo);
        const buscaAtende = produto.descricao.toLocaleLowerCase("pt-BR").includes(busca);
        return estoqueAtende && buscaAtende;
    });
}

function atualizarDescricaoVisualizacao(modo) {
    elementosPedido.descricaoProdutos.textContent = modo === "todos"
        ? "Exibindo todos os produtos cadastrados."
        : "Exibindo apenas itens abaixo do estoque mínimo.";
}

function atualizarPainelPedido() {
    elementosPedido.totalItens.textContent = itensPedido.size;
    atualizarEstadoBotaoGerar();

    if (!itensPedido.size) {
        elementosPedido.pedidoAtualLista.innerHTML = '<p class="estado-tabela">Nenhum produto selecionado.</p>';
        return;
    }

    elementosPedido.pedidoAtualLista.innerHTML = Array.from(itensPedido.entries()).map(([id, quantidade]) => {
        const produto = produtoPorId(id);
        if (!produto) return "";
        return `<article class="pedido-atual-item" data-produto-id="${id}"><strong>${escapar(produto.descricao)}</strong><div class="pedido-atual-quantidade"><label class="sr-only" for="pedido-comprar-${id}">Quantidade a comprar de ${escapar(produto.descricao)}</label><input id="pedido-comprar-${id}" class="pedido-quantidade" data-campo-comprar type="number" min="0" step="any" inputmode="decimal" aria-invalid="${!Number.isFinite(quantidade)}" value="${Number.isFinite(quantidade) ? quantidade : ""}"><span>${escapar(produto.unidade)}</span></div></article>`;
    }).join("");
}

function valorDoCampoComprar(linha) {
    const campo = linha.querySelector("[data-campo-comprar]");
    const valor = Number(String(campo.value).replace(",", "."));
    const valido = campo.value.trim() !== "" && !campo.validity.badInput && Number.isFinite(valor) && valor >= 0;
    campo.setAttribute("aria-invalid", String(!valido));
    return valido ? valor : NaN;
}

function estadoVazioProdutosPedido(filtros) {
    const titulo = filtros.busca
        ? "Nenhum produto encontrado para esta pesquisa."
        : filtros.modo === "falta"
            ? "Nenhum produto em falta encontrado."
            : "Nenhum produto cadastrado.";
    const mensagem = filtros.busca ? "Tente pesquisar por outro nome." : "A lista será atualizada quando houver produtos correspondentes.";
    const icone = filtros.busca ? "fa-magnifying-glass" : "fa-circle-check";

    return `<tr><td colspan="5" class="estado-tabela pedido-estado"><div class="pedido-estado-conteudo"><i class="fa-solid ${icone}" aria-hidden="true"></i><strong>${titulo}</strong><span>${mensagem}</span></div></td></tr>`;
}

function renderizarLinhaProdutoPedido(produto) {
    const selecionado = itensPedido.has(Number(produto.id));
    const quantidade = selecionado ? itensPedido.get(Number(produto.id)) : quantidadeSugerida(produto);
    return `<tr class="${selecionado ? "selecionado" : ""}" data-produto-id="${produto.id}"><td><input type="checkbox" data-seletor-produto aria-label="Selecionar ${escapar(produto.descricao)}" ${selecionado ? "checked" : ""}></td><td><strong>${escapar(produto.descricao)}</strong></td><td>${numero(produto.estoque_atual)} ${escapar(produto.unidade)}</td><td>${numero(produto.estoque_minimo)} ${escapar(produto.unidade)}</td><td><label class="sr-only" for="comprar-${produto.id}">Quantidade a comprar de ${escapar(produto.descricao)}</label><input id="comprar-${produto.id}" class="pedido-quantidade" data-campo-comprar type="number" min="0" step="any" inputmode="decimal" aria-invalid="${!Number.isFinite(quantidade)}" value="${Number.isFinite(quantidade) ? quantidade : ""}"></td></tr>`;
}

function renderizarProdutosPedido() {
    const filtros = filtrosPedidoAtuais();
    const produtos = produtosVisiveisPedido(filtros);
    atualizarDescricaoVisualizacao(filtros.modo);

    if (!produtos.length) {
        elementosPedido.listaProdutos.innerHTML = estadoVazioProdutosPedido(filtros);
        return;
    }

    elementosPedido.listaProdutos.innerHTML = produtos.map(renderizarLinhaProdutoPedido).join("");
}

function selecionarProduto(linha, selecionado) {
    const produto = produtoPorId(linha.dataset.produtoId);
    if (!produto) return;

    if (selecionado) {
        itensPedido.set(Number(produto.id), valorDoCampoComprar(linha));
    } else {
        itensPedido.delete(Number(produto.id));
        const campo = linha.querySelector?.("[data-campo-comprar]");
        if (campo) {
            const sugerida = quantidadeSugerida(produto);
            campo.value = Number.isFinite(sugerida) ? String(sugerida) : "";
            campo.setAttribute("aria-invalid", "false");
        }
    }

    linha.classList?.toggle("selecionado", Boolean(selecionado));
    const seletor = linha.querySelector?.("[data-seletor-produto]");
    if (seletor) seletor.checked = Boolean(selecionado);
    atualizarPainelPedido();
}

function alterarQuantidade(linha) {
    const produto = produtoPorId(linha.dataset.produtoId);
    if (!produto || !itensPedido.has(Number(produto.id))) return;
    itensPedido.set(Number(produto.id), valorDoCampoComprar(linha));
    // Atualiza somente o campo espelhado, preservando o foco e a digitação.
    const origem = linha.querySelector("[data-campo-comprar]");
    for (const idCampo of [`comprar-${produto.id}`, `pedido-comprar-${produto.id}`]) {
        const campo = document.getElementById(idCampo);
        if (campo && campo !== origem) {
            campo.value = origem.value;
            campo.setAttribute("aria-invalid", origem.getAttribute("aria-invalid"));
        }
    }
}

async function carregarProdutosPedido() {
    try {
        const produtos = await requisicaoEstoque("/api/estoque/produtos");
        // A lista completa e necessaria para alternar entre "falta" e "todos" sem nova requisicao.
        produtosPedido.splice(0, produtosPedido.length, ...produtos);
        for (const id of itensPedido.keys()) {
            if (!produtoPorId(id)) itensPedido.delete(id);
        }
        renderizarProdutosPedido();
        atualizarPainelPedido();
    } catch (erro) {
        elementosPedido.listaProdutos.innerHTML = `<tr><td colspan="5" class="estado-tabela erro-tabela">${escapar(erro.message)}</td></tr>`;
    }
}

function limparPedido() {
    itensPedido.clear();
    renderizarProdutosPedido();
    atualizarPainelPedido();
}

function atualizarEstadoBotaoGerar() {
    const desabilitado = itensPedido.size === 0 || gerandoPedido;
    for (const botao of [elementosPedido.gerarExcel, elementosPedido.gerarPdf]) {
        botao.disabled = desabilitado;
        botao.setAttribute("aria-disabled", String(desabilitado));
    }
}

function nomeFornecedorSelecionado() {
    const opcao = elementosPedido.fornecedor.options[elementosPedido.fornecedor.selectedIndex];
    return elementosPedido.fornecedor.value ? opcao.textContent.trim() : "";
}

function itensParaExportacao() {
    return Array.from(itensPedido.entries()).map(([id, quantidade]) => {
        const produto = produtoPorId(id);
        return { produto: produto.descricao, quantidade };
    });
}

function nomeArquivoDoCabecalho(cabecalho, fornecedor, extensao) {
    const nomeUtf8 = cabecalho?.match(/filename\*=UTF-8''([^;]+)/i);
    if (nomeUtf8) {
        try { return decodeURIComponent(nomeUtf8[1]); } catch { /* Usa o nome simples abaixo. */ }
    }
    const correspondencia = cabecalho?.match(/filename="([^"]+)"/i);
    const nomeSeguro = fornecedor.replace(/[<>:"/\\|?*\u0000-\u001F]/g, "");
    return correspondencia?.[1] || `Pedido - ${nomeSeguro}.${extensao}`;
}

async function gerarArquivoPedido(formato) {
    if (gerandoPedido) return;
    const pdf = formato === "pdf";
    const rotulo = pdf ? "PDF" : "Excel";
    const botao = pdf ? elementosPedido.gerarPdf : elementosPedido.gerarExcel;
    const fornecedor = nomeFornecedorSelecionado();
    if (!fornecedor) {
        await mostrarAlerta("Fornecedor obrigatório", "Selecione um fornecedor antes de gerar o pedido.", "perigo");
        return;
    }

    if (!itensPedido.size) {
        await mostrarAlerta("Pedido vazio", "Selecione pelo menos um produto para gerar o pedido.", "perigo");
        return;
    }

    if ([...itensPedido.values()].some((quantidade) => !Number.isFinite(quantidade) || quantidade < 0)) {
        await mostrarAlerta("Quantidade inválida", "Preencha a quantidade de cada item com um número igual ou maior que zero.", "perigo");
        elementosPedido.pedidoAtualLista.querySelector('[aria-invalid="true"]')?.focus();
        return;
    }

    const pedido = { fornecedor, itens: itensParaExportacao() };
    const conteudoBotao = botao.innerHTML;
    gerandoPedido = true;
    atualizarEstadoBotaoGerar();
    try {
        const confirmar = await mostrarConfirmacao(
            "Confirmar geração",
            `Gerar ${rotulo} para ${fornecedor} com ${pedido.itens.length} ${pedido.itens.length === 1 ? "item" : "itens"}?`
        );
        if (!confirmar) return;
        botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Gerando...';
        // O pedido permanece no mapa apos o download para permitir conferencias ou nova geracao.
        const resposta = await requisicaoEstoque(`/api/pedidos-compra/${formato}`, {
            method: "POST",
            body: JSON.stringify(pedido),
            responseType: "blob"
        });
        const arquivo = await resposta.blob();
        const url = URL.createObjectURL(arquivo);
        const link = document.createElement("a");
        link.href = url;
        link.download = nomeArquivoDoCabecalho(resposta.headers.get("Content-Disposition"), fornecedor, pdf ? "pdf" : "xlsx");
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        await mostrarAlerta(`${rotulo} gerado`, "O pedido foi gerado e o download foi iniciado.", "sucesso");
    } catch (erro) {
        await mostrarAlerta(`Não foi possível gerar o ${rotulo}`, erro.message, "perigo");
    } finally {
        gerandoPedido = false;
        atualizarEstadoBotaoGerar();
        botao.innerHTML = conteudoBotao;
    }
}

elementosPedido.busca.addEventListener("input", renderizarProdutosPedido);
elementosPedido.visualizacao.addEventListener("change", renderizarProdutosPedido);
elementosPedido.limparPedido.addEventListener("click", limparPedido);
elementosPedido.gerarExcel.addEventListener("click", () => gerarArquivoPedido("excel"));
elementosPedido.gerarPdf.addEventListener("click", () => gerarArquivoPedido("pdf"));
elementosPedido.adicionarFornecedor.addEventListener("click", adicionarFornecedor);
elementosPedido.novoFornecedor.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
        evento.preventDefault();
        adicionarFornecedor();
    }
});
elementosPedido.listaProdutos.addEventListener("change", (evento) => {
    if (!evento.target.matches("[data-seletor-produto]")) return;
    selecionarProduto(evento.target.closest("tr"), evento.target.checked);
});
elementosPedido.listaProdutos.addEventListener("click", (evento) => {
    if (evento.target.matches("[data-seletor-produto], [data-campo-comprar]") || evento.target.closest("[data-campo-comprar]")) return;
    const linha = evento.target.closest("tr[data-produto-id]");
    const seletor = linha?.querySelector("[data-seletor-produto]");
    if (!linha || !seletor) return;
    seletor.checked = !seletor.checked;
    selecionarProduto(linha, seletor.checked);
});
elementosPedido.listaProdutos.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-campo-comprar]")) return;
    alterarQuantidade(evento.target.closest("tr"));
});

elementosPedido.pedidoAtualLista.addEventListener("input", (evento) => {
    if (!evento.target.matches("[data-campo-comprar]")) return;
    alterarQuantidade(evento.target.closest("[data-produto-id]"));
});

exibirFornecedores();
carregarProdutosPedido();
