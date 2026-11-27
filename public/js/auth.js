/*
    auth.js
    --------------------------------------------------
    Este arquivo concentra funções usadas em várias páginas:

    - Mostrar mensagem no login quando a sessão expira;
    - Redirecionar o usuário para a tela de login;
    - Ler e validar o token salvo no localStorage;
    - Bloquear páginas de acordo com o perfil do usuário;
    - Esconder links do menu conforme o perfil;
    - Fazer logout;
    - Abrir e fechar o menu mobile.

 Ele deve ser carregado antes dos JS específicos das páginas.
*/

const MENSAGEM_SEM_CONEXAO =
    "Não foi possível comunicar com o sistema. Verifique sua conexão com a internet e tente novamente.";

// Todas as telas carregam este arquivo antes dos scripts que fazem chamadas à API.
// Assim, uma falha de rede deixa de exibir o texto técnico "Failed to fetch".
const fetchOriginal = window.fetch.bind(window);
window.fetch = async (...args) => {
    try {
        return await fetchOriginal(...args);
    } catch (erro) {
        if (erro?.name === "AbortError") {
            throw erro;
        }
        const erroDeConexao = new Error(MENSAGEM_SEM_CONEXAO);
        erroDeConexao.name = "ErroDeConexao";
        erroDeConexao.cause = erro;
        throw erroDeConexao;
    }
};

function mostrarMensagemNoLogin() {
    // Busca uma mensagem temporária salva antes do redirecionamento para o login.
    // Exemplo: "Sua sessão expirou. Faça login novamente."
    const mensagem = sessionStorage.getItem("mensagemLogin");

    if (!mensagem) {
        return;
    }

    sessionStorage.removeItem("mensagemLogin");

    if (typeof mostrarAlerta === "function") {
        mostrarAlerta("Aviso de sessão", mensagem, "perigo");
        return;
    }

    alert(mensagem);
}

function redirecionarParaLogin(mensagem) {
    // Remove os dados da sessão atual.
    localStorage.removeItem("token");
    localStorage.removeItem("usuarioLogado");

    // Guarda uma mensagem temporária para ser exibida na tela de login.
    if (mensagem) {
        sessionStorage.setItem("mensagemLogin", mensagem);
    }

    window.location.href = "../pages/login.html";
}

// Centraliza o tratamento das respostas que indicam que a sessão não é mais válida.
// As páginas que usam auth.js podem chamar esta função após qualquer requisição à API.
function respostaSessaoExpirada(resposta) {
    if (resposta.status !== 401 && resposta.status !== 403) {
        return false;
    }

    redirecionarParaLogin("Sua sessão expirou. Faça login novamente.");
    return true;
}

function decodificarToken(token) {
    try {
        // Um JWT tem 3 partes separadas por ponto:
        // header.payload.signature
        // Aqui pegamos a parte do payload, que contém dados como expiração.
        const payload = token.split(".")[1];

        if (!payload) {
            return null;
        }

        // Corrige caracteres usados no padrão Base64URL do JWT e completa o padding.
        const base64 = payload
            .replace(/-/g, "+")
            .replace(/_/g, "/");
        const payloadCorrigido = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
        const binario = atob(payloadCorrigido);
        const bytes = Uint8Array.from(binario, (caractere) => caractere.charCodeAt(0));
        const jsonTexto = typeof TextDecoder === "function"
            ? new TextDecoder("utf-8").decode(bytes)
            : decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""));

        // Decodifica o payload em UTF-8 e transforma em objeto JavaScript.
        return JSON.parse(jsonTexto);
    } catch (erro) {
        return null;
    }
}

function tokenExpirou(token) {
    const dadosToken = decodificarToken(token);

    // Se o token não puder ser lido ou não tiver expiração, consideramos inválido.
    if (!dadosToken || !dadosToken.exp) {
        return true;
    }

    // Date.now() retorna milissegundos, por isso dividimos por 1000.
    const agora = Math.floor(Date.now() / 1000);

    return dadosToken.exp <= agora;
}

function verificarLogin() {
    const token = localStorage.getItem("token");
    const usuarioLogado = localStorage.getItem("usuarioLogado");

    // Sem token ou sem dados do usuário, não deixa acessar o sistema.
    if (!token || !usuarioLogado) {
        redirecionarParaLogin("Faça login para acessar o sistema.");
        return null;
    }

    // Se o token passou do tempo de validade, força novo login.
    if (tokenExpirou(token)) {
        redirecionarParaLogin("Sua sessão expirou. Faça login novamente.");
        return null;
    }

    try {
        // usuarioLogado foi salvo como JSON no login.js.
        return JSON.parse(usuarioLogado);
    } catch (erro) {
        redirecionarParaLogin("Erro na sessão. Faça login novamente.");
        return null;
    }
}

function permitirPagina(perfisPermitidos) {
    const usuario = verificarLogin();

    if (!usuario) {
        return;
    }

    // Bloqueia acesso quando o perfil do usuário não está na lista permitida.
    if (!perfisPermitidos.includes(usuario.perfil)) {
        alert("Você não tem permissão pra acessar esta página.");

        // Redireciona cada perfil para a página principal mais adequada.
        if (usuario.perfil === "admin" || usuario.perfil === "lider") {
            window.location.href = "../pages/criar-os.html";
        } else if (["compras", "almoxarifado"].includes(usuario.perfil)) {
            window.location.href = "../pages/estoque.html";
        } else if (usuario.perfil === "manutentor") {
            window.location.href = "../pages/painel-manutentor.html";
        } else {
            redirecionarParaLogin("Faça login novamente.");
        }
    }
}

const ORDEM_MENU_LATERAL = [
    'a[href="criar-os.html"]',
    'a[href="minhas-os.html"]',
    'a[href="painel-manutentor.html"]',
    'a[href="os-concluidas.html"]',
    'a[href="relatorios.html"]',
    'a[href="estoque.html"]',
    'a[href="pedido-compra.html"]',
    'a[href="ferramentas.html"]',
    'a[data-perfis="admin,almoxarifado"][href="cadastros.html"]',
    'a[href="admin.html"]',
    'a[data-ordem-menu="maquinas"]'
];

function ordenarMenuLateral(usuario) {
    const menu = document.querySelector(".sidebar-menu");
    if (!menu) return;

    ORDEM_MENU_LATERAL.forEach((seletor) => {
        const link = menu.querySelector(seletor);
        if (link) menu.appendChild(link);
    });

    preservarRolagemMenu(menu, usuario);
}

function preservarRolagemMenu(menu, usuario) {
    if (menu.dataset.rolagemPreparada) return;
    menu.dataset.rolagemPreparada = "true";
    const chave = `rolagemMenu:${usuario?.id ?? "usuario"}:${usuario?.perfil ?? ""}`;
    function salvar() {
        try { sessionStorage.setItem(chave, String(menu.scrollTop)); } catch {}
    }
    function restaurar() {
        try {
            const posicao = Number(sessionStorage.getItem(chave));
            if (Number.isFinite(posicao) && posicao >= 0) menu.scrollTop = posicao;
        } catch {}
    }
    // Restaura depois de aplicar permissões e ordenar os links.
    restaurar();
    menu.addEventListener("scroll", salvar, { passive: true });
    menu.addEventListener("click", salvar);
    window.addEventListener("pagehide", salvar);
    window.addEventListener("pageshow", restaurar);
}

function ajustarMenuPorPerfil() {
    const usuario = verificarLogin();

    if (!usuario) {
        return;
    }

    const perfilUsuario = usuario.perfil;

    // Busca todos os links que possuem a propriedade data-perfis.
    // Exemplo no HTML:
    // <a data-perfis="admin,lider">Nova OS</a>
    const linksProtegidos = document.querySelectorAll("[data-perfis]");

    linksProtegidos.forEach((link) => {
        const perfisPermitidos = link.dataset.perfis.split(",").map((perfil) => perfil.trim());

        // Esconde o link se o perfil atual não tiver acesso.
        if (!perfisPermitidos.includes(perfilUsuario)) {
            link.style.display = "none";
        }
    });

    ordenarMenuLateral(usuario);
    prepararInterfaceUsuario(usuario);
}

function nomeDoPerfil(perfil) {
    return ({ admin: "Administrador", lider: "Líder", manutentor: "Manutentor", compras: "Compras", almoxarifado: "Almoxarifado" })[perfil] || "Usuário";
}

function escaparTexto(texto) {
    const elemento = document.createElement("div");
    elemento.textContent = texto || "";
    return elemento.innerHTML;
}

function formatarDataNotificacao(data) {
    if (typeof data !== "string") {
        return "Data não informada";
    }

    const textoData = data.trim()
        .replace(/(\.\d{3})\d+/, "$1")
        .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    const dataSemFusoHorario = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(textoData);
    const dataConvertida = new Date(dataSemFusoHorario ? `${textoData}Z` : textoData);

    if (Number.isNaN(dataConvertida.getTime())) {
        return "Data não informada";
    }

    return dataConvertida.toLocaleString("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo"
    });
}

function exibirBannerDemoSeNecessario() {
    const token = localStorage.getItem("token");
    const dadosToken = token ? decodificarToken(token) : null;
    if (!dadosToken?.demo) return;

    const conteudo = document.querySelector(".app-content");
    if (!conteudo || conteudo.querySelector(".demo-banner")) return;

    const banner = document.createElement("div");
    banner.className = "demo-banner";
    banner.setAttribute("role", "status");
    banner.innerHTML = `<i class="fa-solid fa-eye"></i> <span><strong>Modo Demonstração (Somente leitura):</strong> consultas, filtros e exportações PDF/Excel funcionam normalmente; alterações não são salvas no banco.</span>`;
    conteudo.prepend(banner);
}

function prepararInterfaceUsuario(usuario) {
    exibirBannerDemoSeNecessario();
    const topbar = document.querySelector(".topbar");
    const informacaoUsuario = topbar?.querySelector(".topbar-user");
    if (!topbar || !informacaoUsuario || topbar.querySelector(".topbar-acoes")) return;

    informacaoUsuario.innerHTML = `
        <span><i class="fa-solid fa-user"></i></span>
        <div><strong>${escaparTexto(usuario.nome)}</strong><small>${nomeDoPerfil(usuario.perfil)}</small></div>
    `;

    const acoes = document.createElement("div");
    acoes.className = "topbar-acoes";
    acoes.innerHTML = `
        <div class="notificacoes-topbar">
            <button type="button" class="btn-notificacoes" aria-label="Abrir notificações" aria-expanded="false">
                <i class="fa-regular fa-bell"></i><span class="notificacoes-contador" hidden>0</span>
            </button>
            <section class="painel-notificacoes" hidden>
                <div class="painel-notificacoes-topo"><strong>Notificações</strong><button type="button" class="btn-marcar-notificacoes">Marcar todas como lidas</button></div>
                <div class="lista-notificacoes"><p class="notificacoes-vazia">Carregando notificações...</p></div>
            </section>
        </div>
    `;
    informacaoUsuario.replaceWith(acoes);
    acoes.appendChild(informacaoUsuario);

    const botao = acoes.querySelector(".btn-notificacoes");
    const painel = acoes.querySelector(".painel-notificacoes");
    const lista = acoes.querySelector(".lista-notificacoes");
    const contador = acoes.querySelector(".notificacoes-contador");

    botao.addEventListener("click", () => {
        const aberto = !painel.hidden;
        painel.hidden = aberto;
        botao.setAttribute("aria-expanded", String(!aberto));
    });

    document.addEventListener("click", (evento) => {
        if (!acoes.contains(evento.target)) {
            painel.hidden = true;
            botao.setAttribute("aria-expanded", "false");
        }
    });

    lista.addEventListener("click", async (evento) => {
        const item = evento.target.closest("[data-notificacao-id]");
        if (!item) return;
        const id = item.dataset.notificacaoId;
        const url = item.dataset.url;
        try {
            await fetch(`/api/notificacoes/${id}/lida`, { method: "PUT", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        } finally {
            if (url && /^\/(?!\/)/.test(url)) window.location.href = url;
        }
    });

    acoes.querySelector(".btn-marcar-notificacoes").addEventListener("click", async () => {
        try {
            const resposta = await fetch("/api/notificacoes/ler-todas", { method: "PUT", headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
            if (!resposta.ok) throw new Error("Não foi possível atualizar as notificações.");
            await carregarNotificacoes(lista, contador);
        } catch (erro) {
            if (typeof mostrarAlerta === "function") mostrarAlerta("Notificações", erro.message, "perigo");
        }
    });

    carregarNotificacoes(lista, contador);
}

async function carregarNotificacoes(lista, contador) {
    try {
        const resposta = await fetch("/api/notificacoes", { headers: { Authorization: `Bearer ${localStorage.getItem("token")}` } });
        const notificacoes = await resposta.json();
        if (!resposta.ok) throw new Error(notificacoes.erro || "Não foi possível carregar as notificações.");

        const naoLidas = notificacoes.filter((notificacao) => !notificacao.lida).length;
        contador.hidden = naoLidas === 0;
        contador.textContent = naoLidas > 99 ? "99+" : naoLidas;
        lista.innerHTML = notificacoes.length
            ? notificacoes.map((notificacao) => `
                <button type="button" class="notificacao-item ${notificacao.lida ? "lida" : ""}" data-notificacao-id="${notificacao.id}" data-url="${escaparTexto(notificacao.url || "")}">
                    <strong>${escaparTexto(notificacao.titulo)}</strong>
                    <span>${escaparTexto(notificacao.mensagem)}</span>
                    <small>${formatarDataNotificacao(notificacao.criada_em)}</small>
                </button>
            `).join("")
            : '<p class="notificacoes-vazia">Você não possui notificações.</p>';
    } catch (erro) {
        lista.innerHTML = `<p class="notificacoes-vazia">${escaparTexto(erro.message)}</p>`;
    }
}

function sair() {
    // Logout simples: remove os dados salvos e volta para o login.
    localStorage.removeItem("token");
    localStorage.removeItem("usuarioLogado");
    window.location.href = "../pages/login.html";
}

/*
    Controle do menu mobile
    --------------------------------------------------
    - Abre e fecha a sidebar no celular;
    - Bloqueia a rolagem do fundo quando o menu está aberto;
    - Corrige bugs ao girar o celular;
    - Remove rolagem horizontal acidental.
*/

function abrirMenuMobile() {
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".menu-mobile-overlay");

    if (sidebar) {
        sidebar.classList.add("sidebar-aberta");
    }

    if (overlay) {
        overlay.classList.add("overlay-ativo");
    }

    document.body.classList.add("menu-mobile-aberto");
    document.documentElement.classList.add("menu-mobile-aberto");
}

function fecharMenuMobile() {
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.querySelector(".menu-mobile-overlay");

    if (sidebar) {
        sidebar.classList.remove("sidebar-aberta");
    }

    if (overlay) {
        overlay.classList.remove("overlay-ativo");
    }

    document.body.classList.remove("menu-mobile-aberto");
    document.documentElement.classList.remove("menu-mobile-aberto");
}

function resetarMenuMobile() {
    fecharMenuMobile();
    corrigirRolagemHorizontal();
}

function corrigirRolagemHorizontal() {
    document.documentElement.scrollLeft = 0;
    document.body.scrollLeft = 0;

    const appContent = document.querySelector(".app-content");

    if (appContent) {
        appContent.scrollLeft = 0;
    }
}

function bloquearRolagemComMenuAberto(event) {
    const menuAberto = document.body.classList.contains("menu-mobile-aberto");

    if (!menuAberto) {
        return;
    }

    const tocouNaSidebar = event.target.closest(".sidebar");

    if (!tocouNaSidebar) {
        event.preventDefault();
    }
}

document.addEventListener("touchmove", bloquearRolagemComMenuAberto, {
    passive: false
});

document.addEventListener("wheel", bloquearRolagemComMenuAberto, {
    passive: false
});

let timerResizeMenuMobile = null;
let ultimaLarguraMenuMobile = typeof window.innerWidth === "number" ? window.innerWidth : 0;

window.addEventListener("orientationchange", () => {
    clearTimeout(timerResizeMenuMobile);
    timerResizeMenuMobile = setTimeout(() => {
        ultimaLarguraMenuMobile = typeof window.innerWidth === "number" ? window.innerWidth : ultimaLarguraMenuMobile;
        resetarMenuMobile();
    }, 300);
});

window.addEventListener("resize", () => {
    const larguraAtual = typeof window.innerWidth === "number" ? window.innerWidth : ultimaLarguraMenuMobile;
    const cruzouDesktop = larguraAtual > 900;
    const mudouLargura = Math.abs(larguraAtual - ultimaLarguraMenuMobile) > 20;

    if (!cruzouDesktop && !mudouLargura) {
        return;
    }

    clearTimeout(timerResizeMenuMobile);
    timerResizeMenuMobile = setTimeout(() => {
        ultimaLarguraMenuMobile = typeof window.innerWidth === "number" ? window.innerWidth : larguraAtual;
        resetarMenuMobile();
    }, 300);
});

window.addEventListener("pageshow", () => {
    resetarMenuMobile();
});

/*

Identificar se o Usuário já está logado para redirecionar para uma página.

*/

function redirecionarSeJaLogado() {
    const token = localStorage.getItem("token");
    const usuarioLogado = localStorage.getItem("usuarioLogado");

    if (!token || !usuarioLogado) {
        return;
    }

    if (tokenExpirou(token)) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuarioLogado");
        sessionStorage.setItem("mensagemLogin", "Sua sessão expirou. Faça login novamente.");
        return;
    }

    try {
        const usuario = JSON.parse(usuarioLogado);

        if (usuario.perfil === "admin" || usuario.perfil === "lider") {
            window.location.href = "/pages/criar-os.html";
            return;
        }

        if (["compras", "almoxarifado"].includes(usuario.perfil)) {
            window.location.href = "/pages/estoque.html";
            return;
        }

        if (usuario.perfil === "manutentor") {
            window.location.href = "/pages/painel-manutentor.html";
            return;
        }

        localStorage.removeItem("token");
        localStorage.removeItem("usuarioLogado");
    } catch (erro) {
        localStorage.removeItem("token");
        localStorage.removeItem("usuarioLogado");
    }
}
