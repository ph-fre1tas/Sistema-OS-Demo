/*
    manutentor.js
    --------------------------------------------------
    Controla o painel do manutentor:

    - Busca OS abertas;
    - Atualiza os cards de resumo;
    - Renderiza os cards das OS;
    - Permite dar andamento;
    - Colocar como aguardando peça;
    - Concluir;
    - Cancelar;
    - Atualiza a lista automaticamente.
*/

// A página do líder reutiliza os cards em modo de acompanhamento.
const minhasOS = document.body.dataset.minhasOs === "true";
const listaOS = document.getElementById("lista-os-abertas");
const formFiltrosPainel = document.getElementById("form-filtros-painel");
const btnLimparFiltrosPainel = document.getElementById("btn-limpar-filtros-painel");
const paginacaoPainel = document.getElementById("paginacao-painel");
const paginasPainel = document.getElementById("painel-paginas");
const LIMITE_PAGINA_PAINEL = 25;
let paginaPainel = 1;
let carregamentoOSAbertasEmAndamento = false;
let recargaOSAbertasPendente = false;
let assinaturaListaOSAbertas = null;
const FUSO_HORARIO_SISTEMA = "America/Sao_Paulo";
const MARCADOR_UTC = "Z";
const formatadorDataISOSistema = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_HORARIO_SISTEMA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
});

function obterPaginasPainel(totalPaginas, paginaAtual) {
    if (totalPaginas <= 7) {
        return Array.from({ length: totalPaginas }, (_, indice) => indice + 1);
    }

    const paginas = new Set([1, totalPaginas]);
    const paginaCentral = Math.ceil(totalPaginas / 2);

    if (paginaAtual <= 5) {
        for (let pagina = 1; pagina <= 5; pagina += 1) paginas.add(pagina);
        paginas.add(paginaCentral);
    } else if (paginaAtual >= totalPaginas - 4) {
        for (let pagina = totalPaginas - 4; pagina <= totalPaginas; pagina += 1) paginas.add(pagina);
        paginas.add(paginaCentral);
    } else {
        for (let pagina = paginaAtual - 1; pagina <= paginaAtual + 1; pagina += 1) paginas.add(pagina);
    }

    return [...paginas].sort((a, b) => a - b);
}

function renderizarPaginacaoPainel(totalRegistros) {
    if (!paginacaoPainel || !paginasPainel) return;

    const totalPaginas = Math.ceil(totalRegistros / LIMITE_PAGINA_PAINEL);
    paginacaoPainel.hidden = totalRegistros === 0;
    paginasPainel.replaceChildren();

    if (paginacaoPainel.hidden) return;

    obterPaginasPainel(totalPaginas, paginaPainel).forEach((pagina, indice, paginas) => {
        if (indice > 0 && pagina - paginas[indice - 1] > 1) {
            const reticencias = document.createElement("span");
            reticencias.className = "historico-pagina-reticencias";
            reticencias.textContent = "...";
            reticencias.setAttribute("aria-hidden", "true");
            paginasPainel.appendChild(reticencias);
        }

        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "historico-pagina-botao";
        botao.dataset.pagina = pagina;
        botao.textContent = pagina;
        botao.setAttribute("aria-label", `Ir para a página ${pagina}`);

        if (pagina === paginaPainel) {
            botao.classList.add("ativo");
            botao.setAttribute("aria-current", "page");
        }

        paginasPainel.appendChild(botao);
    });

    const anterior = document.getElementById("painel-anterior");
    const proxima = document.getElementById("painel-proxima");
    const paginaUnica = totalPaginas === 1;

    anterior.hidden = paginaUnica || paginaPainel <= 1;
    proxima.hidden = !paginaUnica && paginaPainel >= totalPaginas;
    anterior.disabled = paginaUnica;
    proxima.disabled = paginaUnica;
    paginasPainel.querySelectorAll("button[data-pagina]").forEach((botao) => {
        botao.disabled = paginaUnica;
    });
}

function formatarData(data) {
    const dataConvertida = converterParaData(data);

    if (!dataConvertida) {
        return "Não informado";
    }

    return dataConvertida.toLocaleString("pt-BR", {
        timeZone: FUSO_HORARIO_SISTEMA
    });
}

function limitarMilissegundos(textoData) {
    return textoData.replace(/(\.\d{3})\d+/, "$1");
}

function prepararTextoData(data) {
    if (typeof data !== "string") {
        return data;
    }

    const textoData = limitarMilissegundos(data.trim())
        .replace(/^(\d{4}-\d{2}-\d{2})\s+/, "$1T");
    const dataSemFusoHorario = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(textoData);

    if (dataSemFusoHorario) {
        return `${textoData}${MARCADOR_UTC}`;
    }

    return textoData;
}

function converterParaData(data) {
    if (!data) {
        return null;
    }

    const dataConvertida = new Date(prepararTextoData(data));

    if (Number.isNaN(dataConvertida.getTime())) {
        return null;
    }

    return dataConvertida;
}

function dataPausaAtual(os) {
    return os.pausa_atual_inicio || os.data_pausa_atual || os.data_aguardando_peca;
}

function nomePausadoPor(os) {
    return os.pausa_atual_pausado_por_nome || os.aguardando_peca_por_nome || "Não informado";
}

function formatarMotivoPausaAtual(os) {
    const tipoPausa = os.pausa_atual_tipo || os.tipo_pausa_atual;
    const motivo = os.pausa_atual_motivo || os.motivo_pausa_atual || os.peca_faltante || "";

    if (tipoPausa === "Aguardando peça" || os.status === "Aguardando peça") {
        if (os.peca_faltante) {
            return `Faltando: ${os.peca_faltante}`;
        }

        if (motivo && motivo !== "Aguardando peça") {
            return `Faltando: ${motivo}`;
        }

        return "Aguardando peça";
    }

    return motivo || "Não informado";
}

function atualizarResumoOS(ordens) {
    const totalOSAbertas = document.getElementById("totalOSAbertas");
    const totalUrgentes = document.getElementById("totalUrgentes");
    const totalAbertas = document.getElementById("totalAbertas");
    const totalAndamento = document.getElementById("totalAndamento");
    const totalAguardando = document.getElementById("totalAguardando");

    if (!totalOSAbertas) {
        return;
    }

    totalOSAbertas.textContent = ordens.length;
    totalUrgentes.textContent = ordens.filter(os => os.prioridade === "Urgente").length;
    totalAbertas.textContent = ordens.filter(os => os.status === "Aberta").length;
    totalAndamento.textContent = ordens.filter(os => os.status === "Em andamento").length;

    totalAguardando.textContent = ordens.filter(os => 
        os.status === "Aguardando peça"
    ).length;

    // O card de pausadas existe apenas em Minhas OS; o Painel do Manutentor não exibe esse card.
    if (minhasOS) {
        const totalPausadas = document.getElementById("totalPausadas");
        if (totalPausadas) totalPausadas.textContent = ordens.filter(os => os.status === "Pausada").length;
    }
}

function classePrioridade(prioridade) {
    return prioridade === "Urgente" ? "prioridade-urgente" : "prioridade-normal";
}

function classeStatus(status) {
    if (status === "Aberta") {
        return "status-aberta";
    }

    if (status === "Em andamento") {
        return "status-andamento";
    }

    if (status === "Aguardando peça") {
        return "status-aguardando";
    }

    if (status === "Pausada") {
        return "status-pausada";
    }

    return "";
}

function preencherTexto(card, seletor, valor) {
    card.querySelectorAll(seletor).forEach((elemento) => {
        elemento.textContent = valor;
    });
}

function textoBuscaOS(os) {
    return [
        os.id,
        os.solicitante,
        os.setor,
        os.maquina,
        os.maquina_id,
        os.problema,
        os.prioridade,
        os.status,
        os.iniciado_por_nome,
        os.peca_faltante,
        os.motivo_pausa_atual,
        os.pausa_atual_motivo
    ].join(" ").toLocaleLowerCase("pt-BR");
}

function dataISO(data) {
    const dataConvertida = converterParaData(data);
    if (!dataConvertida) return "";
    const partes = formatadorDataISOSistema.formatToParts(dataConvertida);
    const mapa = Object.fromEntries(partes.map(({ type, value }) => [type, value]));
    return `${mapa.year}-${mapa.month}-${mapa.day}`;
}

function prepararOSParaFiltro(os) {
    if (os && typeof os._buscaNormalizada !== "string") {
        Object.defineProperty(os, "_buscaNormalizada", {
            value: textoBuscaOS(os),
            enumerable: false,
            configurable: true
        });
    }
    if (os && typeof os._dataCriacaoISO !== "string") {
        Object.defineProperty(os, "_dataCriacaoISO", {
            value: dataISO(os.data_criacao),
            enumerable: false,
            configurable: true
        });
    }
    return os;
}

function gerarAssinaturaListaOS(ordensFiltradas, pagina) {
    const itens = ordensFiltradas.map((os) => [
        os.id,
        os.status,
        os.prioridade,
        os.data_atualizacao || "",
        os.data_inicio || "",
        os.pausa_atual_id || "",
        os.pausa_atual_inicio || "",
        os.pausa_atual_motivo || os.motivo_pausa_atual || os.peca_faltante || ""
    ].join(":")).join("|");
    return `${pagina}#${ordensFiltradas.length}#${itens}`;
}

function filtrosPainelAtivos() {
    return Boolean(
        document.getElementById("busca-painel")?.value.trim() ||
        (document.getElementById("status-painel")?.value || "Todos") !== "Todos" ||
        (document.getElementById("area-painel")?.value || "Todas") !== "Todas" ||
        document.getElementById("data-inicio-painel")?.value ||
        document.getElementById("data-fim-painel")?.value
    );
}

function filtrarOSAbertas(ordens) {
    const busca = document.getElementById("busca-painel")?.value.trim().toLocaleLowerCase("pt-BR") || "";
    const status = document.getElementById("status-painel")?.value || "Todos";
    const area = document.getElementById("area-painel")?.value || "Todas";
    const dataInicio = document.getElementById("data-inicio-painel")?.value || "";
    const dataFim = document.getElementById("data-fim-painel")?.value || "";

    return ordens.filter((os) => {
        const dataCriacao = os._dataCriacaoISO ?? dataISO(os.data_criacao);
        const textoBusca = os._buscaNormalizada ?? textoBuscaOS(os);
        const buscaAtende = !busca || textoBusca.includes(busca);
        const statusAtende = status === "Todos" || os.status === status;
        const areaAtende = area === "Todas" || os.area_manutencao === area;
        const dataInicioAtende = !dataInicio || (dataCriacao && dataCriacao >= dataInicio);
        const dataFimAtende = !dataFim || (dataCriacao && dataCriacao <= dataFim);

        return buscaAtende && statusAtende && areaAtende && dataInicioAtende && dataFimAtende;
    });
}

function exibirErroNaLista(titulo, mensagem) {
    const estado = document.createElement("div");
    estado.className = "estado-vazio erro-lista";

    const tituloErro = document.createElement("h3");
    tituloErro.textContent = titulo;

    const mensagemErro = document.createElement("p");
    mensagemErro.textContent = mensagem;

    estado.append(tituloErro, mensagemErro);
    listaOS.replaceChildren(estado);
}

async function carregarOSAbertas(opcoes = {}) {
    if (opcoes.silencioso && document.querySelector?.(".os-modal-overlay")) {
        return;
    }

    if (carregamentoOSAbertasEmAndamento) {
        recargaOSAbertasPendente = true;
        return;
    }

    carregamentoOSAbertasEmAndamento = true;

    try {
        const token = localStorage.getItem("token");

        const resposta = await fetch(minhasOS ? "/api/os/minhas" : "/api/os/abertas", {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        if (!resposta.ok) {
            const erro = await resposta.json();

            if (resposta.status === 401 || resposta.status === 403) {
                if (typeof redirecionarParaLogin === "function") {
                    redirecionarParaLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }
            }

            throw new Error(erro.erro || "Erro ao carregar OS abertas.");
        }

        const todasOrdens = await resposta.json();
        if (opcoes.silencioso && document.querySelector?.(".os-modal-overlay.os-modal-visivel")) {
            return;
        }

        todasOrdens.forEach(prepararOSParaFiltro);
        const ordensFiltradas = filtrarOSAbertas(todasOrdens);

        atualizarResumoOS(minhasOS ? todasOrdens : ordensFiltradas);

        const totalPaginas = Math.ceil(ordensFiltradas.length / LIMITE_PAGINA_PAINEL);
        paginaPainel = Math.min(paginaPainel, Math.max(totalPaginas, 1));
        const inicioPagina = (paginaPainel - 1) * LIMITE_PAGINA_PAINEL;
        const ordens = ordensFiltradas.slice(inicioPagina, inicioPagina + LIMITE_PAGINA_PAINEL);
        renderizarPaginacaoPainel(ordensFiltradas.length);

        const assinaturaAtual = gerarAssinaturaListaOS(ordensFiltradas, paginaPainel);
        if (assinaturaAtual === assinaturaListaOSAbertas) {
            return;
        }

        window.OSCardDetalhes.preservar(listaOS);
        listaOS.innerHTML = "";

        if (ordens.length === 0) {
            const mensagemVazia = filtrosPainelAtivos()
                ? "Nenhuma ordem corresponde aos filtros informados."
                : minhasOS ? "Você não tem OS pendentes. As OS que você criar aparecerão aqui até serem concluídas ou canceladas."
                : "Quando uma nova ordem de serviço for criada, ela aparecerá aqui.";

            listaOS.innerHTML = `
                <div class="estado-vazio">
                    <h3>${minhasOS ? "Nenhuma OS pendente encontrada" : "Nenhuma OS aberta no momento"}</h3>
                    <p>${mensagemVazia}</p>
                </div>
            `;
            assinaturaListaOSAbertas = assinaturaAtual;
            return;
        }

        // Cria os cards das OS abertas.
        ordens.forEach((os) => {
            const card = document.createElement("article");
            card.className = `os-dashboard-card ${classePrioridade(os.prioridade)}`;
            const idSeguro = Number.isInteger(Number(os.id)) ? Number(os.id) : 0;
            const motivoPausa = formatarMotivoPausaAtual(os);
            const pausadoPor = nomePausadoPor(os);

            card.innerHTML = `
                <div class="os-dashboard-topo">
                    <div>
                        <span class="os-numero" data-os-texto="numero"></span>
                        <h3 data-os-texto="maquina"></h3>
                        <p data-os-texto="setor"></p>
                    </div>

                    <div class="os-badges">
                        ${os.area_manutencao ? `<span class="os-area-badge" data-os-texto="area-manutencao"></span>` : ""}
                        <span class="badge-prioridade ${classePrioridade(os.prioridade)}" data-os-texto="prioridade"></span>

                        <span class="badge-status ${classeStatus(os.status)}" data-os-texto="status"></span>
                    </div>
                </div>

                <p class="os-card-data">Criada em <span data-os-texto="data-criacao"></span></p>
                ${os.status === "Pausada" || os.status === "Aguardando peça" ? `<p class="os-card-impedimento"><strong>Motivo:</strong> <span data-os-texto="motivo-pausa"></span></p>` : ""}
                ${window.OSCardDetalhes.abrir(idSeguro)}
                <div class="os-dashboard-grid">
                    <p>
                        <strong>Solicitante</strong>
                        <span data-os-texto="solicitante"></span>
                    </p>

                    <p>
                        <strong>ID da Máquina</strong>
                        <span data-os-texto="maquina-id"></span>
                    </p>

                    <p>
                        <strong>Iniciada em</strong>
                        <span data-os-texto="data-inicio"></span>
                    </p>

                    ${os.status === "Aguardando peça" ? `
                        <p>
                            <strong>Aguardando desde</strong>
                            <span data-os-texto="data-pausa"></span>
                        </p>

                        <p>
                            <strong>Pausada por</strong>
                            <span data-os-texto="pausado-por"></span>
                        </p>
                    ` : ""}

                    ${os.status === "Pausada" ? `
                        <p>
                            <strong>Pausada em</strong>
                            <span data-os-texto="data-pausa"></span>
                        </p>

                        <p>
                            <strong>Motivo da pausa</strong>
                            <span data-os-texto="motivo-pausa"></span>
                        </p>

                        <p>
                            <strong>Pausada por</strong>
                            <span data-os-texto="pausado-por"></span>
                        </p>
                    ` : ""}
                </div>

                <div class="os-problema">
                    <strong>Problema relatado</strong>
                    <p data-os-texto="problema"></p>
                </div>

                ${os.status === "Aguardando peça" ? `
                    <div class="os-alerta-peca">
                        <strong>Aguardando peça</strong>
                        <p data-os-texto="motivo-pausa"></p>
                        <small>Marcado por: <span data-os-texto="pausado-por"></span></small>
                    </div>
                ` : ""}

                <div class="os-responsavel">
                    <strong>Iniciado por:</strong>
                    <span data-os-texto="iniciado-por"></span>
                </div>

                </div>
                </details>

                <div class="acoes-os acoes-dashboard">
                    ${!minhasOS && os.status === "Aberta" ? `
                        <button onclick="darAndamento(${idSeguro})">
                            Dar andamento
                        </button>

                        <button onclick="cancelarOS(${idSeguro})" class="btn-perigo">
                            Cancelar
                        </button>
                    ` : ""}

                    ${!minhasOS && os.status === "Em andamento" ? `
                        <button onclick="aguardarPeca(${idSeguro})" class="btn-secundario">
                            Aguardando peça
                        </button>

                        <button onclick="pausarOS(${idSeguro})" class="btn-secundario">
                            Pausar
                        </button>

                        <button onclick="concluirOS(${idSeguro})" class="btn-sucesso">
                            Concluir
                        </button>

                        <button onclick="cancelarOS(${idSeguro})" class="btn-perigo">
                            Cancelar
                        </button>
                    ` : ""}

                    ${!minhasOS && (os.status === "Aguardando peça" || os.status === "Pausada") ? `
                        <button onclick="retomarOS(${idSeguro})">
                            Retomar andamento
                        </button>

                        <button onclick="cancelarOS(${idSeguro})" class="btn-perigo">
                            Cancelar
                        </button>
                    ` : ""}
                </div>
            `;

            preencherTexto(card, '[data-os-texto="numero"]', `OS #${idSeguro}`);
            preencherTexto(card, '[data-os-texto="maquina"]', os.maquina || "Não informado");
            preencherTexto(card, '[data-os-texto="setor"]', os.setor || "Não informado");
            preencherTexto(card, '[data-os-texto="area-manutencao"]', os.area_manutencao || "");
            preencherTexto(card, '[data-os-texto="prioridade"]', os.prioridade || "Normal");
            preencherTexto(card, '[data-os-texto="status"]', os.status || "Não informado");
            preencherTexto(card, '[data-os-texto="solicitante"]', os.solicitante || "Não informado");
            preencherTexto(card, '[data-os-texto="maquina-id"]', os.maquina_id || "Não informado");
            preencherTexto(card, '[data-os-texto="data-criacao"]', formatarData(os.data_criacao));
            preencherTexto(card, '[data-os-texto="data-inicio"]', os.data_inicio ? formatarData(os.data_inicio) : "Ainda não iniciada");
            preencherTexto(card, '[data-os-texto="data-pausa"]', dataPausaAtual(os) ? formatarData(dataPausaAtual(os)) : "Não informado");
            preencherTexto(card, '[data-os-texto="motivo-pausa"]', motivoPausa);
            preencherTexto(card, '[data-os-texto="pausado-por"]', pausadoPor);
            preencherTexto(card, '[data-os-texto="problema"]', os.problema || "Não informado");
            preencherTexto(card, '[data-os-texto="iniciado-por"]', os.iniciado_por_nome || "Ainda não iniciado");
            window.OSPdfDownload.adicionarAoCard(card, idSeguro);

            listaOS.appendChild(card);
        });
        assinaturaListaOSAbertas = assinaturaAtual;

    } catch (erro) {
        console.error("Erro ao carregar OS abertas:", erro);

        assinaturaListaOSAbertas = null;
        exibirErroNaLista("Erro ao carregar OS abertas", erro.message);
    } finally {
        carregamentoOSAbertasEmAndamento = false;
        if (recargaOSAbertasPendente) {
            recargaOSAbertasPendente = false;
            carregarOSAbertas();
        }
    }
}

function pedirDadosConclusaoOS(manutentoresDisponiveis) {
    return new Promise(resolve => {
        const overlay = document.createElement("div");
        overlay.className = "os-modal-overlay";
        overlay.innerHTML = `
            <form class="os-modal os-modal-conclusao" role="dialog" aria-modal="true" aria-labelledby="tituloConclusaoOS">
                <div class="os-modal-topo"><h2 id="tituloConclusaoOS">Concluir OS</h2><button type="button" class="os-modal-fechar" aria-label="Fechar">&times;</button></div>
                <p class="os-modal-texto">Descreva o serviço e informe quem participou da execução.</p>
                <label class="os-modal-rotulo" for="solucaoConclusaoOS">O que foi feito?</label>
                <textarea id="solucaoConclusaoOS" class="os-modal-campo" rows="5" maxlength="5000" placeholder="Ex: Motor ajustado, correia trocada, teste realizado..."></textarea>
                <label class="os-modal-rotulo" id="rotuloManutentoresOS">Manutentores responsáveis</label>
                <div class="conclusao-manutentores-selecionados" aria-live="polite"></div>
                <div class="conclusao-seletor">
                    <button class="os-modal-campo estoque-recebedor-botao" type="button" aria-expanded="false" aria-controls="menuManutentoresOS"><span>Adicionar manutentor</span><i class="fa-solid fa-chevron-down" aria-hidden="true"></i></button>
                    <div id="menuManutentoresOS" class="estoque-recebedor-menu" hidden>
                        <input class="os-modal-campo" type="search" placeholder="Buscar manutentor" aria-label="Buscar manutentor" autocomplete="off">
                        <p class="conclusao-estado-manutentores" role="status"></p>
                        <div class="estoque-recebedor-opcoes" role="group" aria-labelledby="rotuloManutentoresOS"></div>
                    </div>
                </div>
                <div class="conclusao-outro" hidden><label class="os-modal-rotulo" for="outroManutentorOS">Nome do manutentor</label><div class="conclusao-outro-linha"><input id="outroManutentorOS" class="os-modal-campo" type="text" dir="ltr" inputmode="text" autocomplete="name" autocapitalize="words" maxlength="120" placeholder="Nome e sobrenome"><button type="button" class="os-modal-btn os-modal-btn-secundario">Adicionar</button></div></div>
                <p class="os-modal-erro" role="alert"></p>
                <div class="os-modal-acoes"><button type="button" class="os-modal-btn os-modal-btn-secundario">Cancelar</button><button type="submit" class="os-modal-btn os-modal-btn-principal os-modal-btn-sucesso">Concluir OS</button></div>
            </form>`;
        const form = overlay.querySelector("form");
        const solucao = overlay.querySelector("#solucaoConclusaoOS");
        const menu = overlay.querySelector("#menuManutentoresOS");
        const busca = menu.querySelector("input");
        const lista = menu.querySelector(".estoque-recebedor-opcoes");
        const estado = menu.querySelector(".conclusao-estado-manutentores");
        const botaoSeletor = overlay.querySelector(".conclusao-seletor > button");
        const selecionadosEl = overlay.querySelector(".conclusao-manutentores-selecionados");
        const grupoOutro = overlay.querySelector(".conclusao-outro");
        const inputOutro = overlay.querySelector("#outroManutentorOS");
        const erro = overlay.querySelector(".os-modal-erro");
        const selecionados = [];
        let fechado = false;

        function renderizarSelecionados() {
            selecionadosEl.replaceChildren();
            selecionados.forEach((item, indice) => {
                const tag = document.createElement("span");
                tag.className = "conclusao-manutentor-tag";
                const nome = document.createElement("span");
                nome.textContent = item.nome;
                const remover = document.createElement("button");
                remover.type = "button";
                remover.textContent = "×";
                remover.setAttribute("aria-label", `Remover ${item.nome}`);
                remover.addEventListener("click", () => { selecionados.splice(indice, 1); renderizarSelecionados(); renderizarOpcoes(); });
                tag.append(nome, remover);
                selecionadosEl.appendChild(tag);
            });
            selecionadosEl.hidden = selecionados.length === 0;
        }

        function renderizarOpcoes() {
            const termo = busca.value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
            const disponiveis = manutentoresDisponiveis.filter(item => !selecionados.some(sel => sel.id === item.id)
                && item.nome.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").includes(termo));
            estado.textContent = disponiveis.length ? "" : (manutentoresDisponiveis.length ? "Nenhum manutentor encontrado." : "Nenhum usuário com cargo manutentor cadastrado.");
            estado.hidden = !estado.textContent;
            const opcoes = disponiveis.map(item => ({ nome: item.nome, selecionar: () => selecionados.push(item) }));
            opcoes.push({ nome: "Outro", selecionar: () => { grupoOutro.hidden = false; inputOutro.focus(); } });
            lista.replaceChildren(...opcoes.map(opcao => {
                const botao = document.createElement("button");
                botao.type = "button";
                botao.className = "estoque-recebedor-opcao";
                botao.textContent = opcao.nome;
                botao.addEventListener("click", () => {
                    opcao.selecionar();
                    menu.hidden = true;
                    botaoSeletor.setAttribute("aria-expanded", "false");
                    if (opcao.nome !== "Outro") { renderizarSelecionados(); renderizarOpcoes(); }
                });
                return botao;
            }));
        }

        function fechar(resultado) {
            if (fechado) return;
            fechado = true;
            document.removeEventListener("keydown", aoTeclar);
            overlay.remove();
            resolve(resultado);
        }
        function aoTeclar(evento) {
            if (evento.key === "Escape") { evento.preventDefault(); fechar(null); }
            if (evento.key === "Tab") {
                const controles = Array.from(form.querySelectorAll("button, input, textarea")).filter(el => !el.disabled && !el.closest("[hidden]"));
                if (evento.shiftKey && document.activeElement === controles[0]) { evento.preventDefault(); controles.at(-1).focus(); }
                else if (!evento.shiftKey && document.activeElement === controles.at(-1)) { evento.preventDefault(); controles[0].focus(); }
            }
        }

        botaoSeletor.addEventListener("click", () => {
            menu.hidden = !menu.hidden;
            botaoSeletor.setAttribute("aria-expanded", String(!menu.hidden));
            if (!menu.hidden) { busca.value = ""; renderizarOpcoes(); busca.focus(); }
        });
        busca.addEventListener("input", renderizarOpcoes);
        overlay.querySelector(".conclusao-outro-linha button").addEventListener("click", () => {
            const nome = inputOutro.value.trim();
            if (!nome) { erro.textContent = "Informe o nome do manutentor."; inputOutro.focus(); return; }
            if (nome.length > 120) { erro.textContent = "O nome deve ter no máximo 120 caracteres."; inputOutro.focus(); return; }
            if (!selecionados.some(item => item.nome.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"))) selecionados.push({ id: null, nome });
            inputOutro.value = "";
            grupoOutro.hidden = true;
            erro.textContent = "";
            renderizarSelecionados();
            renderizarOpcoes();
        });
        form.querySelector(".os-modal-fechar").addEventListener("click", () => fechar(null));
        form.querySelector(".os-modal-acoes .os-modal-btn-secundario").addEventListener("click", () => fechar(null));
        form.addEventListener("submit", evento => {
            evento.preventDefault();
            erro.textContent = "";
            if (!solucao.value.trim()) { erro.textContent = "Descreva o que foi feito na OS."; solucao.focus(); return; }
            if (grupoOutro.hidden === false && inputOutro.value.trim()) { erro.textContent = "Adicione ou limpe o nome informado em Outro."; inputOutro.focus(); return; }
            if (!selecionados.length) { erro.textContent = "Selecione pelo menos um manutentor."; botaoSeletor.focus(); return; }
            fechar({
                solucao: solucao.value.trim(),
                manutentores: selecionados.map(item => ({ id: item.id ?? null, nome: item.nome }))
            });
        });
        overlay.addEventListener("click", evento => { if (evento.target === overlay) fechar(null); });
        document.addEventListener("keydown", aoTeclar);
        document.body.appendChild(overlay);
        renderizarOpcoes();
        requestAnimationFrame(() => { overlay.classList.add("os-modal-visivel"); solucao.focus(); });
    });
}

async function concluirOS(id) {
    const token = localStorage.getItem("token");

    if (!token) {
        await mostrarAlerta("Sessão expirada", "Você precisa estar logado.", "perigo");
        window.location.href = "login.html";
        return;
    }

    let manutentoresDisponiveis;
    try {
        const respostaManutentores = await fetch("/api/estoque/recebedores?perfil=manutentor", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (!respostaManutentores.ok) throw new Error("Não foi possível carregar os manutentores.");
        manutentoresDisponiveis = await respostaManutentores.json();
    } catch (erro) {
        await mostrarAlerta("Manutentores indisponíveis", erro.message || "Não foi possível carregar os manutentores.", "perigo");
        return;
    }

    const dadosConclusao = await pedirDadosConclusaoOS(manutentoresDisponiveis);
    if (!dadosConclusao) return;

    try {
        const resposta = await fetch(`/api/os/${id}/concluir`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                solucao: dadosConclusao.solucao,
                manutentores: dadosConclusao.manutentores
            })
        });

        const textoResposta = await resposta.text();

        let dados = {};

        if (textoResposta) {
            dados = JSON.parse(textoResposta);
        }

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            await mostrarAlerta(
                "Erro ao concluir OS",
                dados.erro || "Erro ao concluir OS.",
                "perigo"
            );
            return;
        }

        await mostrarAlerta(
            "OS concluída",
            "OS concluída com sucesso!",
            "sucesso"
        );

        carregarOSAbertas();

    } catch (error) {
        console.error("Erro real ao concluir OS:", error);

        await mostrarAlerta(
            "Erro inesperado",
            "A OS pode ter sido concluída, mas ocorreu um erro ao processar a resposta.",
            "perigo"
        );

        carregarOSAbertas();
    }
}

async function darAndamento(id) {
    const confirmar = await mostrarConfirmacao(
        "Dar andamento",
        "Deseja dar andamento nesta OS?"
    );

    if (!confirmar) {
        return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
        await mostrarAlerta("Sessão expirada", "Você precisa estar logado.", "perigo");
        window.location.href = "login.html";
        return;
    }

    try {
        const resposta = await fetch(`/api/os/${id}/andamento`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            await mostrarAlerta(
                "Erro ao dar andamento",
                dados.erro || "Erro ao dar andamento na OS.",
                "perigo"
            );
            return;
        }

        await mostrarAlerta(
            "OS em andamento",
            "OS colocada em andamento!",
            "sucesso"
        );

        carregarOSAbertas();
    } catch (error) {
        console.error("Erro ao dar andamento:", error);

        await mostrarAlerta(
            "Erro de conexão",
            "Erro ao conectar com a API.",
            "perigo"
        );
    }
}

async function aguardarPeca(id) {
    const pecaFaltante = await pedirTexto({
        titulo: "Aguardando peça",
        mensagem: "Se quiser, informe qual peça está faltando ou o motivo da espera.",
        placeholder: "Ex: Rolamento, correia, sensor...",
        campo: "input",
        obrigatorio: false,
        textoConfirmar: "Marcar como aguardando"
    });

    if (pecaFaltante === null) {
        return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
        await mostrarAlerta("Sessão expirada", "Você precisa estar logado.", "perigo");
        window.location.href = "login.html";
        return;
    }

    try {
        const resposta = await fetch(`/api/os/${id}/aguardando-peca`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                peca_faltante: pecaFaltante ? pecaFaltante.trim() : ""
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            await mostrarAlerta(
                "Erro ao alterar OS",
                dados.erro || "Erro ao colocar OS como aguardando peça.",
                "perigo"
            );
            return;
        }

        await mostrarAlerta(
            "OS atualizada",
            "OS colocada como aguardando peça!",
            "sucesso"
        );

        carregarOSAbertas();

    } catch (error) {
        console.error("Erro ao colocar como aguardando peça.", error);

        await mostrarAlerta(
            "Erro de conexão",
            "Erro ao conectar com a API.",
            "perigo"
        );
    }
}

async function cancelarOS(id) {
    const motivo = await pedirTexto({
        titulo: "Cancelar OS",
        mensagem: "Informe o motivo do cancelamento. Você pode deixar em branco.",
        placeholder: "Ex: Solicitação duplicada, máquina já funcionando...",
        campo: "textarea",
        obrigatorio: false,
        textoConfirmar: "Continuar",
        tipo: "perigo"
    });

    if (motivo === null) {
        return;
    }

    const confirmar = await mostrarConfirmacao(
        "Confirmar cancelamento",
        "Deseja realmente cancelar esta OS?",
        "perigo"
    );

    if (!confirmar) {
        return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
        await mostrarAlerta("Sessão expirada", "Você precisa estar logado.", "perigo");
        window.location.href = "login.html";
        return;
    }

    try {
        const resposta = await fetch(`/api/os/${id}/cancelar`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                motivo_cancelamento: motivo.trim()
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            await mostrarAlerta(
                "Erro ao cancelar OS",
                dados.erro || "Erro ao cancelar OS.",
                "perigo"
            );
            return;
        }

        await mostrarAlerta(
            "OS cancelada",
            "OS cancelada com sucesso!",
            "sucesso"
        );

        carregarOSAbertas();
    } catch (error) {
        console.error("Erro ao cancelar OS:", error);

        await mostrarAlerta(
            "Erro de conexão",
            "Erro ao conectar com a API.",
            "perigo"
        );
    }
}

async function pausarOS(id) {
    const motivo = await pedirTexto({
        titulo: "Pausar OS",
        mensagem: "Informe o motivo da pausa.",
        placeholder: "Ex: Máquina em produção, aguardando liberação, falta de acesso...",
        campo: "textarea",
        obrigatorio: true,
        textoConfirmar: "Pausar OS"
    });

    if (motivo === null) {
        return;
    }

    const confirmar = await mostrarConfirmacao(
        "Confirmar pausa",
        "Deseja realmente pausar esta OS?"
    );

    if (!confirmar) {
        return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
        await mostrarAlerta("Sessão expirada", "Você precisa estar logado.", "perigo");
        window.location.href = "/pages/login.html";
        return;
    }

    try {
        const resposta = await fetch(`/api/os/${id}/pausar`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify({
                motivo_pausa: motivo.trim()
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            await mostrarAlerta(
                "Erro ao pausar OS",
                dados.erro || "Erro ao pausar OS.",
                "perigo"
            );
            return;
        }

        await mostrarAlerta(
            "OS pausada",
            "OS pausada com sucesso!",
            "sucesso"
        );

        carregarOSAbertas();

    } catch (error) {
        console.error("Erro ao pausar OS:", error);

        await mostrarAlerta(
            "Erro de conexão",
            "Erro ao conectar com a API.",
            "perigo"
        );
    }
}

async function retomarOS(id) {
    const confirmar = await mostrarConfirmacao(
        "Retomar andamento",
        "Deseja retomar o andamento desta OS?"
    );

    if (!confirmar) {
        return;
    }

    const token = localStorage.getItem("token");

    if (!token) {
        await mostrarAlerta("Sessão expirada", "Você precisa estar logado.", "perigo");
        window.location.href = "/pages/login.html";
        return;
    }

    try {
        const resposta = await fetch(`/api/os/${id}/retomar`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            await mostrarAlerta(
                "Erro ao retomar OS",
                dados.erro || "Erro ao retomar OS.",
                "perigo"
            );
            return;
        }

        await mostrarAlerta(
            "OS retomada",
            "OS retomada com sucesso!",
            "sucesso"
        );

        carregarOSAbertas();

    } catch (error) {
        console.error("Erro ao retomar OS:", error);

        await mostrarAlerta(
            "Erro de conexão",
            "Erro ao conectar com a API.",
            "perigo"
        );
    }
}

// Carrega as OS assim que a página abre.
carregarOSAbertas();

if (btnLimparFiltrosPainel) {
    btnLimparFiltrosPainel.addEventListener("click", () => {
        document.getElementById("busca-painel").value = "";
        document.getElementById("status-painel").value = "Todos";
        document.getElementById("area-painel").value = "Todas";
        document.getElementById("data-inicio-painel").value = "";
        document.getElementById("data-fim-painel").value = "";
        paginaPainel = 1;
        carregarOSAbertas();
    });
}

if (formFiltrosPainel) {
    formFiltrosPainel.addEventListener("submit", (event) => {
        event.preventDefault();
        paginaPainel = 1;
        carregarOSAbertas();
    });
}

document.getElementById("painel-anterior")?.addEventListener("click", () => {
    if (paginaPainel > 1) {
        paginaPainel -= 1;
        carregarOSAbertas();
    }
});

document.getElementById("painel-proxima")?.addEventListener("click", () => {
    paginaPainel += 1;
    carregarOSAbertas();
});

paginasPainel?.addEventListener("click", (event) => {
    const botao = event.target.closest("button[data-pagina]");
    if (!botao) return;

    const paginaSelecionada = Number(botao.dataset.pagina);
    if (paginaSelecionada !== paginaPainel) {
        paginaPainel = paginaSelecionada;
        carregarOSAbertas();
    }
});

// Atualiza automaticamente a lista a cada 7,5 segundos,
// mas só quando a aba está visível e não há modal aberto.
setInterval(() => {
    if (!document.hidden && !document.querySelector?.(".os-modal-overlay")) {
        carregarOSAbertas({ silencioso: true });
    }
}, 7500);
