/*
    concluidas.js
    --------------------------------------------------
    Controla a página de histórico:

    - Busca OS concluídas e canceladas;
    - Aplica filtros de busca, status, área e datas;
    - Atualiza os cards de resumo;
    - Renderiza os cards do histórico na tela.
*/

const listaConcluidas = document.getElementById("lista-os-concluidas");
const formFiltrosHistorico = document.getElementById("form-filtros-historico");
const btnLimparFiltros = document.getElementById("btn-limpar-filtros");
const paginacaoHistorico = document.getElementById("historico-paginacao");
const paginasHistorico = document.getElementById("historico-paginas");
let paginaHistorico = 1;
const FUSO_HORARIO_SISTEMA = "America/Sao_Paulo";
const MARCADOR_UTC = "Z";

function obterPaginasHistorico(totalPaginas, paginaAtual) {
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

function renderizarPaginacaoHistorico(totalPaginas, totalRegistros) {
    if (!paginacaoHistorico || !paginasHistorico) return;

    const quantidadePaginas = Number(totalPaginas) || 0;
    const haResultados = Number(totalRegistros) > 0;
    paginacaoHistorico.hidden = !haResultados || quantidadePaginas <= 1;
    paginasHistorico.replaceChildren();

    if (paginacaoHistorico.hidden) return;

    obterPaginasHistorico(quantidadePaginas, paginaHistorico).forEach((pagina, indice, paginas) => {
        if (indice > 0 && pagina - paginas[indice - 1] > 1) {
            const reticencias = document.createElement("span");
            reticencias.className = "historico-pagina-reticencias";
            reticencias.textContent = "...";
            reticencias.setAttribute("aria-hidden", "true");
            paginasHistorico.appendChild(reticencias);
        }

        const botao = document.createElement("button");
        botao.type = "button";
        botao.className = "historico-pagina-botao";
        botao.dataset.pagina = pagina;
        botao.textContent = pagina;
        botao.setAttribute("aria-label", `Ir para a página ${pagina}`);

        if (pagina === paginaHistorico) {
            botao.classList.add("ativo");
            botao.setAttribute("aria-current", "page");
        }

        paginasHistorico.appendChild(botao);
    });

    const anterior = document.getElementById("historico-anterior");
    const proxima = document.getElementById("historico-proxima");
    anterior.hidden = paginaHistorico <= 1;
    proxima.hidden = paginaHistorico >= quantidadePaginas;
}

function formatarData(data) {
    const dataConvertida = converterParaData(data);

    if (!dataConvertida) {
        return "Não informada";
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

function formatarMotivoPausa(pausa) {
    if (!pausa) {
        return "Não informado";
    }

    if (pausa.tipo_pausa === "Aguardando peça") {
        if (pausa.motivo && pausa.motivo !== "Aguardando peça") {
            return `Faltando: ${pausa.motivo}`;
        }

        return "Aguardando peça";
    }

    return pausa.motivo || "Não informado";
}

function classePrioridade(prioridade) {
    return prioridade === "Urgente" ? "prioridade-urgente" : "prioridade-normal";
}

function classeStatusHistorico(status) {
    if (status === "Concluída") {
        return "status-concluida";
    }

    if (status === "Cancelada") {
        return "status-cancelada";
    }

    return "";
}

function preencherTexto(card, seletor, valor) {
    card.querySelectorAll(seletor).forEach((elemento) => {
        elemento.textContent = valor;
    });
}

function criarLinhaPausa(rotulo, valor) {
    const linha = document.createElement("p");
    const destaque = document.createElement("strong");
    destaque.textContent = rotulo;
    linha.appendChild(destaque);
    if (valor) linha.appendChild(document.createTextNode(` ${valor}`));
    return linha;
}

function preencherPausas(card, pausas) {
    const listaPausas = card.querySelector("[data-os-pausas]");
    if (!listaPausas || !Array.isArray(pausas)) return;

    pausas.forEach((pausa, indice) => {
        const item = document.createElement("div");
        item.className = "historico-pausa-item";
        item.append(
            criarLinhaPausa(`Pausa ${indice + 1}`, ""),
            criarLinhaPausa("Tipo:", pausa.tipo_pausa || "Não informado"),
            criarLinhaPausa("Motivo:", formatarMotivoPausa(pausa)),
            criarLinhaPausa("Pausada em:", pausa.data_inicio_pausa ? formatarData(pausa.data_inicio_pausa) : "Não informado"),
            criarLinhaPausa("Pausada por:", pausa.pausado_por_nome || "Não informado"),
            criarLinhaPausa("Retomada em:", pausa.data_fim_pausa ? formatarData(pausa.data_fim_pausa) : "Não retomada"),
            criarLinhaPausa("Retomada por:", pausa.retomado_por_nome || "Não informado")
        );
        listaPausas.appendChild(item);
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
    listaConcluidas.replaceChildren(estado);
}

function atualizarResumoHistorico(ordens, resumo) {
    const totalHistorico = document.getElementById("totalHistorico");
    const totalConcluidas = document.getElementById("totalConcluidas");
    const totalCanceladas = document.getElementById("totalCanceladas");
    const totalUrgentesHistorico = document.getElementById("totalUrgentesHistorico");

    // Se os cards de resumo não existirem, não faz nada.
    if (!totalHistorico) {
        return;
    }


    totalHistorico.textContent = resumo?.total ?? ordens.length;
    totalConcluidas.textContent = resumo?.concluidas ?? ordens.filter(os => os.status === "Concluída").length;
    totalCanceladas.textContent = resumo?.canceladas ?? ordens.filter(os => os.status === "Cancelada").length;
    totalUrgentesHistorico.textContent = resumo?.urgentes ?? ordens.filter(os => os.prioridade === "Urgente").length;
}

async function carregarOSConcluidas() {
    try {
        const token = localStorage.getItem("token");

        // Lê os filtros preenchidos pelo usuário.
        const busca = document.getElementById("busca-historico")?.value.trim() || "";
        const status = document.getElementById("status-historico")?.value || "Todos";
        const area = document.getElementById("area-historico")?.value || "Todas";
        const dataInicio = document.getElementById("data-inicio-historico")?.value || "";
        const dataFim = document.getElementById("data-fim-historico")?.value || "";

        const parametros = new URLSearchParams();
        parametros.set("pagina", paginaHistorico);

        if (busca) {
            parametros.append("busca", busca);
        }

        if (status && status !== "Todos") {
            parametros.append("status", status);
        }

        if (area && area !== "Todas") {
            parametros.append("area_manutencao", area);
        }

        if (dataInicio) {
            parametros.append("data_inicio", dataInicio);
        }

        if (dataFim) {
            parametros.append("data_fim", dataFim);
        }

        // Monta a URL com ou sem filtros.
        const url = parametros.toString()
            ? `/api/os/concluidas?${parametros.toString()}`
            : "/api/os/concluidas";

        if (!token) {
            if (typeof redirecionarParaLogin === "function") {
                redirecionarParaLogin("Faça login para acessar o histórico.");
                return;
            }

            window.location.href = "login.html";
            return;
        }

        listaConcluidas.innerHTML = `
            <div class="estado-vazio historico-carregando" role="status" aria-live="polite">
                <span class="loading-bolinha" aria-hidden="true"></span>
                <span>Carregando histórico... Aguarde enquanto buscamos as ordens de serviço.</span>
            </div>
        `;

        const resposta = await fetch(url, {
            headers: {
                "Authorization": `Bearer ${token}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (resposta.status === 401 || resposta.status === 403) {
                if (typeof redirecionarParaLogin === "function") {
                    redirecionarParaLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }
            }

            throw new Error(dados.erro || "Erro ao carregar OS concluídas.");
        }

        // Garante que a API realmente devolveu uma lista.
        const ordens = Array.isArray(dados) ? dados : dados.ordens;
        if (!Array.isArray(ordens)) throw new Error("A API retornou um formato inesperado.");
        paginaHistorico = dados.pagina || paginaHistorico;
        const totalPaginas = dados.totalPaginas ?? 0;
        const totalRegistros = dados.total ?? ordens.length;
        renderizarPaginacaoHistorico(totalPaginas, totalRegistros);

        atualizarResumoHistorico(ordens, dados.resumo);
        // O resumo representa todos os resultados filtrados, não só os 25 desta página.
        const totalHistorico = document.getElementById("totalHistorico");
        if (totalHistorico && !Array.isArray(dados)) {
            totalHistorico.textContent = dados.total ?? ordens.length;
        }

        window.OSCardDetalhes.preservar(listaConcluidas);
        listaConcluidas.innerHTML = "";

        if (ordens.length === 0) {
            listaConcluidas.innerHTML = `
                <div class="estado-vazio">
                    <h3>Nenhuma OS encontrada</h3>
                    <p>Tente alterar os filtros ou pesquisar por outro termo.</p>
                </div>
            `;
            return;
        }

        // Cria um card para cada OS do histórico.
        ordens.forEach((os) => {
            const card = document.createElement("article");
            card.className = `os-dashboard-card historico-card ${classePrioridade(os.prioridade)}`;
            const idSeguro = Number.isInteger(Number(os.id)) ? Number(os.id) : 0;

            const dataFinal = os.status === "Concluída"
                ? formatarData(os.data_conclusao)
                : formatarData(os.data_cancelamento);

            const responsavelFinal = os.status === "Concluída"
                ? os.concluido_por_nome || "Não informado"
                : os.cancelado_por_nome || "Não informado";

            const manutentorResponsavel = os.status === "Concluída"
                ? os.manutentor_responsavel_nome || "Não informado"
                : "Não se aplica";

            const tituloAcao = os.status === "Concluída"
                ? "O que foi feito"
                : "Motivo do cancelamento";

            const textoAcao = os.status === "Concluída"
                ? os.solucao || "Não informado"
                : os.motivo_cancelamento || "Não informado";

            const temposOS = os.tempos_formatados || {
                ateFinalizar: "Não calculado",
                parado: "Não calculado",
                andamentoReal: "Não calculado"
            };
            const tituloTempoFinal = os.status === "Concluída"
                ? "Até concluir"
                : "Até cancelar";

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

                        <span class="badge-status ${classeStatusHistorico(os.status)}" data-os-texto="status"></span>
                    </div>
                </div>

                <p class="os-card-data">Criada em <span data-os-texto="data-criacao"></span></p>
                ${window.OSCardDetalhes.abrir(idSeguro)}
                <div class="os-dashboard-grid historico-grid">
                    <p>
                        <strong>Solicitante</strong>
                        <span data-os-texto="solicitante"></span>
                    </p>

                    <p>
                        <strong>ID da máquina</strong>
                        <span data-os-texto="maquina-id"></span>
                    </p>

                    <p>
                        <strong>Responsável</strong>
                        <span data-os-texto="responsavel-final"></span>
                    </p>

                    <p>
                        <strong>Manutentor</strong>
                        <span data-os-texto="manutentor-responsavel"></span>
                    </p>

                    <p>
                        <strong>Data final</strong>
                        <span data-os-texto="data-final"></span>
                    </p>
                </div>

                <div class="historico-tempos">
                    <p>
                        <strong>${tituloTempoFinal}</strong>
                        <span data-os-texto="tempo-final"></span>
                    </p>

                    <p>
                        <strong>Tempo em pausa</strong>
                        <span data-os-texto="tempo-pausa"></span>
                    </p>

                    <p>
                        <strong>Tempo em andamento</strong>
                        <span data-os-texto="tempo-andamento"></span>
                    </p>
                </div>
                
                
                <div class="os-problema">
                    <strong>Problema relatado</strong>
                    <p data-os-texto="problema"></p>
                </div>

                <div class="${os.status === "Cancelada" ? "historico-acao cancelada" : "historico-acao concluida"}">
                    <strong>${tituloAcao}</strong>
                    <p data-os-texto="texto-acao"></p>
                </div>

                ${Array.isArray(os.pausas) && os.pausas.length > 0 ? `
                    <div class="historico-pausas" data-os-pausas>
                        <strong>Histórico de pausas</strong>
                    </div>
                ` : ""}

                </div>
                </details>
            `;

            preencherTexto(card, '[data-os-texto="numero"]', `OS #${idSeguro}`);
            preencherTexto(card, '[data-os-texto="maquina"]', os.maquina || "Não informado");
            preencherTexto(card, '[data-os-texto="setor"]', os.setor || "Não informado");
            preencherTexto(card, '[data-os-texto="area-manutencao"]', os.area_manutencao || "");
            preencherTexto(card, '[data-os-texto="prioridade"]', os.prioridade || "Normal");
            preencherTexto(card, '[data-os-texto="status"]', os.status || "Não informado");
            preencherTexto(card, '[data-os-texto="solicitante"]', os.solicitante || "Não informado");
            preencherTexto(card, '[data-os-texto="maquina-id"]', os.maquina_id || "Não informado");
            preencherTexto(card, '[data-os-texto="responsavel-final"]', responsavelFinal);
            preencherTexto(card, '[data-os-texto="manutentor-responsavel"]', manutentorResponsavel);
            preencherTexto(card, '[data-os-texto="data-final"]', dataFinal);
            preencherTexto(card, '[data-os-texto="data-criacao"]', formatarData(os.data_criacao));
            preencherTexto(card, '[data-os-texto="tempo-final"]', temposOS.ateFinalizar);
            preencherTexto(card, '[data-os-texto="tempo-pausa"]', temposOS.parado);
            preencherTexto(card, '[data-os-texto="tempo-andamento"]', temposOS.andamentoReal);
            preencherTexto(card, '[data-os-texto="problema"]', os.problema || "Não informado");
            preencherTexto(card, '[data-os-texto="texto-acao"]', textoAcao);
            preencherPausas(card, os.pausas);
            window.OSPdfDownload.adicionarAoCard(card, idSeguro);

            listaConcluidas.appendChild(card);
        });
    } catch (erro) {
        console.error("Erro ao carregar OS concluídas:", erro);

        exibirErroNaLista("Erro ao carregar histórico", erro.message);
    }
}

// Quando o usuário enviar o formulário de filtros, recarrega o histórico.
if (formFiltrosHistorico) {
    formFiltrosHistorico.addEventListener("submit", (event) => {
        event.preventDefault();
        paginaHistorico = 1;
        carregarOSConcluidas();
    });
}

// Limpa todos os filtros e recarrega o histórico completo.
if (btnLimparFiltros) {
    btnLimparFiltros.addEventListener("click", () => {
        document.getElementById("busca-historico").value = "";
        document.getElementById("status-historico").value = "Todos";
        document.getElementById("area-historico").value = "Todas";
        document.getElementById("data-inicio-historico").value = "";
        document.getElementById("data-fim-historico").value = "";
        paginaHistorico = 1;

        carregarOSConcluidas();
    });
}

document.getElementById("historico-anterior").addEventListener("click", () => {
    if (paginaHistorico > 1) {
        paginaHistorico -= 1;
        carregarOSConcluidas();
    }
});

document.getElementById("historico-proxima").addEventListener("click", () => {
    paginaHistorico += 1;
    carregarOSConcluidas();
});

paginasHistorico.addEventListener("click", (event) => {
    const botao = event.target.closest("button[data-pagina]");
    if (!botao) return;

    const paginaSelecionada = Number(botao.dataset.pagina);
    if (paginaSelecionada !== paginaHistorico) {
        paginaHistorico = paginaSelecionada;
        carregarOSConcluidas();
    }
});

// Carrega o histórico assim que a página abre.
carregarOSConcluidas();
