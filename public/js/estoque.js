const usuarioEstoque = verificarLogin();
// A permissao abaixo controla apenas os controles de cadastro na tela; a API tambem valida o perfil.
const podeGerenciarProdutos = usuarioEstoque && ["admin", "compras", "almoxarifado"].includes(usuarioEstoque.perfil);
let produtosEstoque = [];
let produtosEstoqueExpandidos = false;

const LIMITE_PRODUTOS_RECOLHIDO = 12;
const LIMITE_PRODUTOS_SEM_EXPANSAO = 15;
const LIMITE_MOVIMENTACOES_VISIVEIS = 6;
let redimensionamentoMovimentacoesPendente;

function medirRolagemMovimentacoes() {
    const lista = document.getElementById("listaMovimentacoes");
    if (!lista) return;
    const itens = Array.from(lista.querySelectorAll(":scope > .movimentacao-item"));
    const precisaRolagem = itens.length > LIMITE_MOVIMENTACOES_VISIVEIS;

    lista.classList.toggle("com-rolagem", precisaRolagem);
    if (!precisaRolagem) {
        lista.style.removeProperty("--altura-movimentacoes-visiveis");
        return;
    }

    // A altura e calculada pelas linhas reais para comportar textos maiores e registros cancelados.
    const alturaVisivel = itens
        .slice(0, LIMITE_MOVIMENTACOES_VISIVEIS)
        .reduce((total, item) => total + item.getBoundingClientRect().height, 0);
    lista.style.setProperty("--altura-movimentacoes-visiveis", `${Math.ceil(alturaVisivel)}px`);
}

function ajustarRolagemMovimentacoes() {
    if (typeof requestAnimationFrame !== "function") {
        medirRolagemMovimentacoes();
        return;
    }
    if (typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(redimensionamentoMovimentacoesPendente);
    }
    redimensionamentoMovimentacoesPendente = requestAnimationFrame(medirRolagemMovimentacoes);
}

function atualizarBotaoProdutosEstoque(podeExpandir) {
    const botao = document.getElementById("alternarProdutosEstoque");
    if (!botao) return;
    botao.hidden = !podeExpandir;
    botao.textContent = produtosEstoqueExpandidos ? "Ver menos produtos" : "Ver mais produtos";
    botao.setAttribute("aria-expanded", String(produtosEstoqueExpandidos));
}

function atualizarResumo() {
    // Somente saldos abaixo do minimo sao considerados baixos e exigem reposicao.
    const baixos = produtosEstoque.filter((produto) => Number(produto.estoque_atual) < Number(produto.estoque_minimo));
    document.getElementById("totalProdutos").textContent = produtosEstoque.length;
    document.getElementById("produtosComSaldo").textContent = produtosEstoque.filter((produto) => Number(produto.estoque_atual) > 0).length;
    document.getElementById("produtosBaixos").textContent = baixos.length;
    document.getElementById("saldoTotal").textContent = numero(produtosEstoque.reduce((total, produto) => total + Number(produto.estoque_atual), 0));
    const alerta = document.getElementById("alertaEstoque");
    alerta.hidden = baixos.length === 0;
    alerta.innerHTML = baixos.length ? `<i class="fa-solid fa-triangle-exclamation"></i> ${baixos.length} ${baixos.length === 1 ? "produto está" : "produtos estão"} abaixo do estoque mínimo.` : "";
}

function classeSaldo(produto) {
    const saldo = Number(produto.estoque_atual);
    const minimo = Number(produto.estoque_minimo);
    if (saldo < minimo) return "baixo";
    if (minimo > 0 && saldo <= minimo * 1.5) return "atencao";
    return "adequado";
}

function renderizarProdutos() {
    const busca = document.getElementById("buscaProduto").value.trim().toLocaleLowerCase("pt-BR");
    const produtos = produtosEstoque.filter((produto) => `${produto.descricao} ${produto.unidade}`.toLocaleLowerCase("pt-BR").includes(busca));
    const lista = document.getElementById("listaProdutos");
    // Evita esconder apenas um ou poucos resultados, inclusive durante a pesquisa.
    const podeExpandir = produtos.length > LIMITE_PRODUTOS_SEM_EXPANSAO;
    const produtosExibidos = !podeExpandir || produtosEstoqueExpandidos ? produtos : produtos.slice(0, LIMITE_PRODUTOS_RECOLHIDO);
    atualizarBotaoProdutosEstoque(podeExpandir);
    atualizarResumo();
    if (!produtos.length) {
        lista.innerHTML = `<tr><td colspan="7" class="estado-tabela">${busca ? "Nenhum produto encontrado para a busca." : "Nenhum produto cadastrado."}</td></tr>`;
        return;
    }
    lista.innerHTML = produtosExibidos.map((produto) => {
        const dias = produto.dias_restantes === null ? "—" : `${numero(produto.dias_restantes)} dias`;
        const acoesCadastro = podeGerenciarProdutos ? `<button type="button" class="btn-tabela btn-editar" data-acao="editar" data-id="${produto.id}" title="Editar produto"><i class="fa-solid fa-pen"></i><span> Editar</span></button><button type="button" class="btn-tabela btn-excluir" data-acao="excluir" data-id="${produto.id}" title="Excluir produto"><i class="fa-solid fa-trash"></i></button>` : "";
        return `<tr><td><strong>${escapar(produto.descricao)}</strong></td><td>${escapar(produto.unidade)}</td><td><span class="saldo-badge ${classeSaldo(produto)}">${numero(produto.estoque_atual)}</span></td><td>${numero(produto.estoque_minimo)}</td><td>${numero(produto.consumo_mensal, 2)}</td><td>${dias}</td><td><div class="estoque-acoes"><button type="button" class="btn-tabela btn-entrada" data-acao="entrada" data-id="${produto.id}"><i class="fa-solid fa-arrow-down"></i> Entrada</button><button type="button" class="btn-tabela btn-saida" data-acao="saida" data-id="${produto.id}"><i class="fa-solid fa-arrow-up"></i> Saída</button>${acoesCadastro}</div></td></tr>`;
    }).join("");
}

function formatarDataMovimentacao(valor) {
    const dataString = valor.includes("Z") ? valor : valor.replace(" ", "T") + "Z";
    return new Date(dataString).toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
    });
}

function renderizarMovimentacoes(movimentacoes) {
    const lista = document.getElementById("listaMovimentacoes");
    if (!movimentacoes.length) {
        lista.innerHTML = '<p class="estado-tabela">Ainda não há movimentações registradas.</p>';
        ajustarRolagemMovimentacoes();
        return;
    }
    lista.innerHTML = movimentacoes.map((movimento) => {
        const data = formatarDataMovimentacao(movimento.criado_em);
        const classe = movimento.tipo === "ENTRADA" ? "entrada" : "saida";
        const cancelada = Boolean(movimento.cancelada_em);
        const dataCancelamento = cancelada ? formatarDataMovimentacao(movimento.cancelada_em) : "";
        const detalhesCancelamento = cancelada
            ? `<p class="movimentacao-cancelada-texto"><i class="fa-solid fa-ban"></i> Cancelada por ${escapar(movimento.cancelada_por_nome || "Administrador")} em ${dataCancelamento}</p>`
            : "";
        const acaoCancelar = podeGerenciarProdutos && !cancelada
            ? `<button type="button" class="btn-cancelar-movimentacao" data-cancelar-movimentacao="${movimento.id}"><i class="fa-solid fa-ban"></i> Cancelar</button>`
            : "";
        const destinatario = movimento.tipo === "SAIDA" && movimento.recebedor_nome
            ? ` para ${escapar(movimento.recebedor_nome)}` : "";
        return `<article class="movimentacao-item ${cancelada ? "movimentacao-cancelada" : ""}"><span class="movimentacao-icone ${classe}"><i class="fa-solid fa-arrow-${classe === "entrada" ? "down" : "up"}"></i></span><div class="movimentacao-info"><strong>${escapar(movimento.produto_descricao)}</strong><p>${movimento.tipo === "ENTRADA" ? "Entrada" : "Saída"} de ${numero(movimento.quantidade)} ${escapar(movimento.unidade)} por ${escapar(movimento.usuario_nome)}${destinatario}</p>${detalhesCancelamento}</div><div class="movimentacao-meta"><time>${data}</time>${acaoCancelar}</div></article>`;
    }).join("");
    ajustarRolagemMovimentacoes();
}

async function cancelarMovimentacao(id) {
    const confirmar = await mostrarConfirmacao(
        "Cancelar movimentação",
        "O saldo será revertido e esta movimentação deixará de participar do cálculo de consumo. Deseja continuar?",
        "perigo"
    );
    if (!confirmar) return;

    try {
        await requisicaoEstoque(`/api/estoque/movimentacoes/${id}/cancelar`, { method: "PATCH" });
        await carregarEstoque();
        await mostrarAlerta("Movimentação cancelada", "O saldo e os cálculos do estoque foram atualizados.", "sucesso");
    } catch (erro) {
        await mostrarAlerta("Não foi possível cancelar", erro.message, "perigo");
    }
}

async function carregarEstoque() {
    try {
        // As duas consultas sao independentes e podem ser feitas em paralelo sem alterar a ordem da exibicao.
        const [produtos, movimentacoes] = await Promise.all([requisicaoEstoque("/api/estoque/produtos"), requisicaoEstoque("/api/estoque/movimentacoes")]);
        produtosEstoque = produtos;
        renderizarProdutos();
        renderizarMovimentacoes(movimentacoes);
    } catch (erro) {
        document.getElementById("listaProdutos").innerHTML = `<tr><td colspan="7" class="estado-tabela erro-tabela">${escapar(erro.message)}</td></tr>`;
        document.getElementById("listaMovimentacoes").innerHTML = `<p class="estado-tabela erro-tabela">${escapar(erro.message)}</p>`;
        ajustarRolagemMovimentacoes();
    }
}

async function cadastrarProduto(evento) {
    evento.preventDefault();
    try {
        await requisicaoEstoque("/api/estoque/produtos", { method: "POST", body: JSON.stringify({ descricao: document.getElementById("descricaoProduto").value, unidade: document.getElementById("unidadeProduto").value, estoqueMinimo: document.getElementById("minimoProduto").value }) });
        evento.target.reset();
        document.getElementById("minimoProduto").value = 0;
        await carregarEstoque();
        mostrarAlerta("Produto cadastrado", "O produto foi incluído no controle de estoque.", "sucesso");
    } catch (erro) { mostrarAlerta("Não foi possível cadastrar", erro.message, "perigo"); }
}

function configurarRecebedores(overlay, tipo, estaSalvando) {
    const botao = overlay.querySelector("#abrirRecebedores");
    const legenda = botao.querySelector("span");
    const menu = overlay.querySelector("#menuRecebedores");
    const busca = overlay.querySelector("#buscarRecebedor");
    const lista = overlay.querySelector("#opcoesRecebedores");
    const estado = overlay.querySelector("#estadoRecebedores");
    let usuarios = [];
    let carregando = true;
    let falhou = false;
    const normalizar = texto => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    legenda.textContent = `${usuarioEstoque.nome} (Eu mesmo)`;
    function fecharMenu() {
        menu.hidden = true;
        botao.setAttribute("aria-expanded", "false");
    }
    function renderizar() {
        const filtro = normalizar(busca.value.trim());
        const opcoes = [{ valor: "EU_MESMO", nome: `${usuarioEstoque.nome} (Eu mesmo)` },
            ...usuarios.filter(u => Number(u.id) !== Number(usuarioEstoque.id)).map(u => ({ valor: `USUARIO:${u.id}`, nome: u.nome }))]
            .filter(u => normalizar(u.nome).includes(filtro));
        estado.textContent = carregando ? "Carregando usuários..." : falhou ? "Não foi possível carregar os usuários. Feche e abra o menu para tentar novamente." : !opcoes.length ? "Nenhum usuário encontrado." : "";
        estado.hidden = !estado.textContent;
        opcoes.push({ valor: "OUTRA", nome: "Outra pessoa" });
        lista.replaceChildren(...opcoes.map(opcao => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "estoque-recebedor-opcao";
            item.textContent = opcao.nome;
            item.setAttribute("aria-pressed", String(tipo.value === opcao.valor));
            item.addEventListener("click", () => {
                if (estaSalvando()) return;
                tipo.value = opcao.valor;
                legenda.textContent = opcao.nome;
                fecharMenu();
                botao.focus();
                tipo.dispatchEvent(new Event("change"));
            });
            return item;
        }));
    }
    async function carregar() {
        carregando = true;
        falhou = false;
        renderizar();
        try { usuarios = await requisicaoEstoque("/api/estoque/recebedores"); }
        catch { falhou = true; }
        finally { carregando = false; renderizar(); }
    }
    botao.addEventListener("click", () => {
        if (estaSalvando()) return;
        if (!menu.hidden) return fecharMenu();
        menu.hidden = false;
        botao.setAttribute("aria-expanded", "true");
        busca.value = "";
        renderizar();
        busca.focus();
        if (falhou && !carregando) carregar();
    });
    busca.addEventListener("input", renderizar);
    menu.addEventListener("keydown", evento => {
        if (evento.key === "Escape") { evento.preventDefault(); fecharMenu(); botao.focus(); }
        if (evento.key === "Enter" && evento.target === busca) {
            evento.preventDefault();
            lista.querySelector("button")?.focus();
        }
        if (["ArrowDown", "ArrowUp"].includes(evento.key)) {
            evento.preventDefault();
            const itens = [busca, ...lista.querySelectorAll("button")];
            const atual = itens.indexOf(document.activeElement);
            itens[(atual + (evento.key === "ArrowDown" ? 1 : itens.length - 1)) % itens.length].focus();
        }
    });
    overlay.addEventListener("click", evento => {
        if (!menu.contains(evento.target) && !botao.contains(evento.target)) fecharMenu();
    });
    overlay.addEventListener("focusin", evento => {
        if (!menu.contains(evento.target) && !botao.contains(evento.target)) fecharMenu();
    });
    carregar();
}

function abrirFormularioSaida(produto, tipoMovimento = "SAIDA") {
    const saida = tipoMovimento === "SAIDA";
    const titulo = saida ? "Registrar saída" : "Registrar entrada";
    if (document.getElementById("modalSaidaEstoque")) return;
    const focoAnterior = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "modalSaidaEstoque";
    overlay.className = "os-modal-overlay";
    overlay.innerHTML = `
        <form class="os-modal estoque-modal-editar" role="dialog" aria-modal="true" aria-labelledby="tituloSaidaEstoque">
            <div class="os-modal-topo"><h2 id="tituloSaidaEstoque">${titulo}</h2><button type="button" class="os-modal-fechar" aria-label="Fechar">&times;</button></div>
            <div class="form-group"><label for="saidaProduto">Produto</label><input id="saidaProduto" class="os-modal-campo" readonly></div>
            <div class="form-group"><label for="saidaSaldo">Saldo disponível</label><input id="saidaSaldo" class="os-modal-campo" readonly></div>
            <div class="form-group"><label for="saidaQuantidade">Quantidade</label><input id="saidaQuantidade" class="os-modal-campo" type="number" min="1" step="1" required></div>
            ${saida ? `<div class="form-group"><label for="saidaResponsavel">Registrado por</label><input id="saidaResponsavel" class="os-modal-campo" readonly></div>
            <div class="form-group estoque-recebedor"><label id="rotuloRecebedor" for="abrirRecebedores">Quem recebeu? (Nome e Sobrenome)</label>
                <input id="saidaRecebedorTipo" type="hidden" value="EU_MESMO">
                <button id="abrirRecebedores" class="os-modal-campo estoque-recebedor-botao" type="button" aria-expanded="false" aria-controls="menuRecebedores"><span></span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
                <div id="menuRecebedores" class="estoque-recebedor-menu" hidden>
                    <input id="buscarRecebedor" class="os-modal-campo" type="search" placeholder="Buscar por nome" aria-label="Buscar recebedor por nome" autocomplete="off">
                    <p id="estadoRecebedores" role="status">Carregando usuários...</p>
                    <div id="opcoesRecebedores" class="estoque-recebedor-opcoes" role="group" aria-labelledby="rotuloRecebedor"></div>
                </div>
            </div>
            <div class="form-group" id="grupoSaidaRecebedor" hidden><label for="saidaRecebedorNome">Nome de quem recebeu (Nome e Sobrenome)</label><input id="saidaRecebedorNome" class="os-modal-campo" maxlength="120" disabled></div>` : ""}
            <p class="os-modal-erro" role="alert"></p>
            <div class="os-modal-acoes"><button type="button" class="os-modal-btn os-modal-btn-secundario">Cancelar</button><button type="submit" class="os-modal-btn os-modal-btn-principal">${titulo}</button></div>
        </form>`;
    const formulario = overlay.querySelector("form");
    const quantidade = overlay.querySelector("#saidaQuantidade");
    const tipo = overlay.querySelector("#saidaRecebedorTipo");
    const nome = overlay.querySelector("#saidaRecebedorNome");
    const grupoNome = overlay.querySelector("#grupoSaidaRecebedor");
    const erroCampo = overlay.querySelector(".os-modal-erro");
    const salvar = overlay.querySelector('[type="submit"]');
    overlay.querySelector("#saidaProduto").value = produto.descricao;
    overlay.querySelector("#saidaSaldo").value = `${numero(produto.estoque_atual)} ${produto.unidade}`;
    if (saida) overlay.querySelector("#saidaResponsavel").value = usuarioEstoque.nome;
    if (saida) quantidade.max = produto.estoque_atual;
    let salvando = false;
    let fechado = false;
    tipo?.addEventListener("change", () => {
        const outraPessoa = tipo.value === "OUTRA";
        grupoNome.hidden = !outraPessoa;
        nome.disabled = !outraPessoa;
        nome.required = outraPessoa;
        erroCampo.textContent = "";
        if (outraPessoa) nome.focus();
        else nome.value = "";
    });
    if (saida) configurarRecebedores(overlay, tipo, () => salvando);
    function fechar() {
        if (salvando || fechado) return;
        fechado = true;
        document.removeEventListener("keydown", aoPressionarTecla);
        overlay.remove();
        const botaoAtual = document.querySelector(`[data-acao="${saida ? "saida" : "entrada"}"][data-id="${produto.id}"]`);
        (botaoAtual || (focoAnterior?.isConnected ? focoAnterior : document.getElementById("buscaProduto"))).focus();
    }
    function aoPressionarTecla(evento) {
        if (evento.key === "Escape" && !evento.defaultPrevented) { evento.preventDefault(); fechar(); }
        if (evento.key === "Tab") {
            const controles = Array.from(formulario.querySelectorAll("button, input, select")).filter(c => !c.disabled && c.type !== "hidden" && !c.closest("[hidden]"));
            const primeiro = controles[0];
            const ultimo = controles[controles.length - 1];
            if (evento.shiftKey && document.activeElement === primeiro) { evento.preventDefault(); ultimo.focus(); }
            else if (!evento.shiftKey && document.activeElement === ultimo) { evento.preventDefault(); primeiro.focus(); }
        }
    }
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (salvando || fechado) return;
        erroCampo.textContent = "";
        const valor = Number(quantidade.value);
        if (!Number.isInteger(valor) || valor <= 0 || (saida && valor > Number(produto.estoque_atual))) {
            erroCampo.textContent = saida ? "Informe uma quantidade inteira, maior que zero e dentro do saldo disponível." : "Informe uma quantidade inteira maior que zero.";
            quantidade.focus();
            return;
        }
        if (saida && tipo.value === "OUTRA" && !nome.value.trim()) {
            erroCampo.textContent = "Informe o nome de quem recebeu.";
            nome.focus();
            return;
        }
        const dados = { tipo: tipoMovimento, quantidade: valor };
        if (saida) {
            dados.recebedorTipo = tipo.value.startsWith("USUARIO:") ? "USUARIO" : tipo.value;
            if (dados.recebedorTipo === "USUARIO") dados.recebedorUsuarioId = Number(tipo.value.split(":")[1]);
            if (tipo.value === "OUTRA") dados.recebedorNome = nome.value.trim();
        }
        salvando = true;
        salvar.disabled = true;
        salvar.textContent = "Registrando...";
        formulario.setAttribute("aria-busy", "true");
        try {
            await requisicaoEstoque(`/api/estoque/produtos/${produto.id}/movimentacoes`, { method: "POST", body: JSON.stringify(dados) });
            await carregarEstoque();
            salvando = false;
            fechar();
        } catch (erro) {
            erroCampo.textContent = erro.message;
        } finally {
            salvando = false;
            salvar.disabled = false;
            salvar.textContent = titulo;
            formulario.removeAttribute("aria-busy");
        }
    });
    overlay.querySelector(".os-modal-fechar").addEventListener("click", fechar);
    overlay.querySelector(".os-modal-btn-secundario").addEventListener("click", fechar);
    overlay.addEventListener("click", evento => { if (evento.target === overlay) fechar(); });
    document.addEventListener("keydown", aoPressionarTecla);
    document.body.appendChild(overlay);
    setTimeout(() => { if (!fechado) { overlay.classList.add("os-modal-visivel"); quantidade.focus(); } }, 10);
}

function editarProduto(produto) {
    if (document.getElementById("modalEditarProduto")) return;
    const focoAnterior = document.activeElement;
    const overlay = document.createElement("div");
    overlay.id = "modalEditarProduto";
    overlay.className = "os-modal-overlay";
    overlay.innerHTML = `
        <form class="os-modal estoque-modal-editar" role="dialog" aria-modal="true" aria-labelledby="tituloEditarProduto">
            <div class="os-modal-topo"><h2 id="tituloEditarProduto">Editar produto</h2><button type="button" class="os-modal-fechar" aria-label="Fechar">&times;</button></div>
            <p class="os-modal-texto">Atualize os dados do produto.</p>
            <div class="form-group"><label for="editarDescricaoProduto">Nome do produto</label><input id="editarDescricaoProduto" class="os-modal-campo" maxlength="160" required></div>
            <div class="form-group"><label for="editarMinimoProduto">Estoque mínimo</label><input id="editarMinimoProduto" class="os-modal-campo" type="number" min="0" max="9999999999" step="1" required></div>
            <div class="form-group"><label for="editarUnidadeProduto">Unidade</label><select id="editarUnidadeProduto" class="os-modal-campo" required></select></div>
            <p class="os-modal-erro" role="alert"></p>
            <div class="os-modal-acoes"><button type="button" class="os-modal-btn os-modal-btn-secundario">Cancelar</button><button type="submit" class="os-modal-btn os-modal-btn-principal">Salvar alterações</button></div>
        </form>`;
    const formulario = overlay.querySelector("form");
    const descricao = overlay.querySelector("#editarDescricaoProduto");
    const minimo = overlay.querySelector("#editarMinimoProduto");
    const unidade = overlay.querySelector("#editarUnidadeProduto");
    const erroCampo = overlay.querySelector(".os-modal-erro");
    const salvar = overlay.querySelector('[type="submit"]');
    descricao.value = produto.descricao;
    minimo.value = produto.estoque_minimo;
    unidade.replaceChildren(...Array.from(document.getElementById("unidadeProduto").options, (opcao) => opcao.cloneNode(true)));
    if (!Array.from(unidade.options).some((opcao) => opcao.value === produto.unidade)) {
        unidade.add(new Option(produto.unidade, produto.unidade));
    }
    unidade.value = produto.unidade;
    let salvando = false;
    let fechado = false;
    function fechar() {
        if (salvando || fechado) return;
        fechado = true;
        overlay.classList.remove("os-modal-visivel");
        document.removeEventListener("keydown", aoPressionarTecla);
        setTimeout(() => {
            overlay.remove();
            const botaoAtual = document.querySelector(`[data-acao="editar"][data-id="${produto.id}"]`);
            (botaoAtual || (focoAnterior?.isConnected ? focoAnterior : document.getElementById("buscaProduto"))).focus();
        }, 180);
    }
    function aoPressionarTecla(evento) {
        if (evento.key === "Escape") { evento.preventDefault(); fechar(); }
        if (evento.key === "Tab") {
            const controles = Array.from(formulario.querySelectorAll("button, input, select")).filter((controle) => !controle.disabled);
            const primeiro = controles[0];
            const ultimo = controles[controles.length - 1];
            if (evento.shiftKey && document.activeElement === primeiro) {
                evento.preventDefault(); ultimo.focus();
            } else if (!evento.shiftKey && document.activeElement === ultimo) {
                evento.preventDefault(); primeiro.focus();
            }
        }
    }
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        if (salvando || fechado) return;
        erroCampo.textContent = "";
        if (!descricao.value.trim()) {
            erroCampo.textContent = "Informe o nome do produto.";
            descricao.focus();
            return;
        }
        if (!Number.isInteger(Number(minimo.value)) || Number(minimo.value) < 0) {
            erroCampo.textContent = "Informe um estoque mínimo inteiro igual ou maior que zero.";
            minimo.focus();
            return;
        }
        salvando = true;
        salvar.disabled = true;
        salvar.textContent = "Salvando...";
        formulario.setAttribute("aria-busy", "true");
        try {
            await requisicaoEstoque(`/api/estoque/produtos/${produto.id}`, {
                method: "PUT",
                body: JSON.stringify({ descricao: descricao.value.trim(), estoqueMinimo: Number(minimo.value), unidade: unidade.value })
            });
            await carregarEstoque();
            salvando = false;
            fechar();
        } catch (erro) {
            erroCampo.textContent = erro.message;
        } finally {
            salvando = false;
            salvar.disabled = false;
            salvar.textContent = "Salvar alterações";
            formulario.removeAttribute("aria-busy");
        }
    });
    overlay.querySelector(".os-modal-fechar").addEventListener("click", fechar);
    overlay.querySelector(".os-modal-btn-secundario").addEventListener("click", fechar);
    overlay.addEventListener("click", (evento) => { if (evento.target === overlay) fechar(); });
    document.addEventListener("keydown", aoPressionarTecla);
    document.body.appendChild(overlay);
    setTimeout(() => {
        if (fechado) return;
        overlay.classList.add("os-modal-visivel");
        descricao.focus();
    }, 10);
}
async function excluirProduto(produto) {
    if (!await mostrarConfirmacao("Excluir produto", `Excluir “${produto.descricao}” e todo o seu histórico de movimentações?`, "perigo")) return;
    try {
        await requisicaoEstoque(`/api/estoque/produtos/${produto.id}`, { method: "DELETE" });
        await carregarEstoque();
    } catch (erro) { mostrarAlerta("Não foi possível excluir", erro.message, "perigo"); }
}

function exportarCsv() {
    const cabecalho = ["Produto", "Unidade", "Saldo", "Estoque mínimo", "Consumo mensal", "Dias restantes"];
    const sanitizarCsv = (valor) => {
        const texto = String(valor ?? "").trim();
        const seguro = /^[=+\-@]/.test(texto) ? `'${texto}` : texto;
        return `"${seguro.replaceAll('"', '""')}"`;
    };
    const linhas = produtosEstoque.map((p) => [
        sanitizarCsv(p.descricao),
        sanitizarCsv(p.unidade),
        sanitizarCsv(p.estoque_atual),
        sanitizarCsv(p.estoque_minimo),
        sanitizarCsv(p.consumo_mensal),
        sanitizarCsv(p.dias_restantes ?? "")
    ]);
    // BOM e separador ponto-e-virgula melhoram a abertura do CSV em configuracoes regionais pt-BR.
    const csv = [cabecalho.map(sanitizarCsv).join(";"), ...linhas.map((linha) => linha.join(";"))].join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `estoque-${new Date().toISOString().slice(0, 10)}.csv`; link.click(); URL.revokeObjectURL(url);
}

document.getElementById("formProduto").addEventListener("submit", cadastrarProduto);
document.getElementById("buscaProduto").addEventListener("input", () => {
    produtosEstoqueExpandidos = false;
    renderizarProdutos();
});
document.getElementById("exportarCsv").addEventListener("click", exportarCsv);
document.getElementById("alternarProdutosEstoque").addEventListener("click", () => {
    produtosEstoqueExpandidos = !produtosEstoqueExpandidos;
    renderizarProdutos();
});
// Um unico listener trata as acoes das linhas criadas dinamicamente.
document.getElementById("listaProdutos").addEventListener("click", (evento) => {
    const botao = evento.target.closest("button[data-acao]"); if (!botao) return;
    const produto = produtosEstoque.find((item) => item.id === Number(botao.dataset.id)); if (!produto) return;
    if (botao.dataset.acao === "entrada") abrirFormularioSaida(produto, "ENTRADA");
    if (botao.dataset.acao === "saida") abrirFormularioSaida(produto, "SAIDA");
    if (botao.dataset.acao === "editar") editarProduto(produto);
    if (botao.dataset.acao === "excluir") excluirProduto(produto);
});
document.getElementById("listaMovimentacoes").addEventListener("click", (evento) => {
    const botao = evento.target.closest("[data-cancelar-movimentacao]");
    if (!botao) return;
    cancelarMovimentacao(Number(botao.dataset.cancelarMovimentacao));
});
window.addEventListener("resize", ajustarRolagemMovimentacoes);
if (!podeGerenciarProdutos) document.getElementById("painelCadastro").hidden = true;
carregarEstoque();
