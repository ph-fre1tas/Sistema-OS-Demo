const formRelatorios = document.getElementById("form-relatorios");
const resultadoRelatorios = document.getElementById("resultado-relatorios");
const mensagemRelatorios = document.getElementById("mensagem-relatorios");
const btnConsultarRelatorio = document.getElementById("btn-consultar-relatorio");
const btnGerarRelatorioPdf = document.getElementById("btn-gerar-relatorio-pdf");
const listaRelatorios = document.getElementById("lista-relatorios");
const caixasStatusRelatorio = [...document.querySelectorAll('[name="status-relatorio"]')];
let consultaAtual = null;

function classeStatusRelatorio(status) {
    return ({
        "Concluída": "status-concluida",
        "Em andamento": "status-andamento",
        "Pausada": "status-pausada",
        "Aguardando peça": "status-aguardando",
        "Aberta": "status-aberta",
        "Cancelada": "status-cancelada"
    })[status] || "";
}

function classePrioridadeRelatorio(prioridade) {
    return prioridade === "Urgente" ? "prioridade-urgente" : "prioridade-normal";
}

function exibirMensagemRelatorios(texto = "", tipo = "") {
    mensagemRelatorios.textContent = texto;
    mensagemRelatorios.className = `relatorios-mensagem ${tipo}`.trim();
}

function obterStatusSelecionados() {
    const todas = caixasStatusRelatorio.find((caixa) => caixa.value === "Todas");
    if (todas?.checked) return ["Todas"];
    return caixasStatusRelatorio
        .filter((caixa) => caixa.value !== "Todas" && caixa.checked)
        .map((caixa) => caixa.value);
}

function obterFiltrosFormulario() {
    return {
        status: obterStatusSelecionados(),
        dataReferencia: document.getElementById("data-referencia-relatorio").value,
        dataInicio: document.getElementById("data-inicio-relatorio").value || null,
        dataFim: document.getElementById("data-fim-relatorio").value || null,
        prioridade: document.getElementById("prioridade-relatorio").value,
        busca: document.getElementById("busca-relatorio").value.trim() || null
    };
}

function validarFiltrosFormulario(filtros) {
    if (!filtros.status.length) {
        throw new Error("Selecione pelo menos um status.");
    }
    if (filtros.dataInicio && filtros.dataFim && filtros.dataInicio > filtros.dataFim) {
        throw new Error("A data inicial não pode ser posterior à data final.");
    }
}

function criarParametrosConsulta(filtros) {
    const parametros = new URLSearchParams();
    filtros.status.forEach((status) => parametros.append("status", status));
    parametros.set("data_referencia", filtros.dataReferencia);
    parametros.set("prioridade", filtros.prioridade);
    if (filtros.dataInicio) parametros.set("data_inicio", filtros.dataInicio);
    if (filtros.dataFim) parametros.set("data_fim", filtros.dataFim);
    if (filtros.busca) parametros.set("busca", filtros.busca);
    return parametros;
}

function criarCelula(texto, classe = "") {
    const celula = document.createElement("td");
    if (classe) celula.className = classe;
    celula.textContent = texto || "";
    return celula;
}

function renderizarTabela(ordens, apresentacao) {
    listaRelatorios.innerHTML = "";
    document.getElementById("cabecalho-data-relatorio").textContent = `Data (${apresentacao.dataReferencia})`;

    if (!ordens.length) {
        const linha = document.createElement("tr");
        const celula = criarCelula("Nenhuma ordem corresponde aos filtros selecionados.", "estado-tabela");
        celula.colSpan = 6;
        linha.appendChild(celula);
        listaRelatorios.appendChild(linha);
        return;
    }

    ordens.forEach((os) => {
        const linha = document.createElement("tr");
        linha.appendChild(criarCelula(`OS #${os.numero}`, "relatorios-numero-os"));
        linha.appendChild(criarCelula(os.maquina));
        linha.appendChild(criarCelula(os.setor));

        const celulaPrioridade = document.createElement("td");
        const prioridade = document.createElement("span");
        prioridade.className = `badge-prioridade ${classePrioridadeRelatorio(os.prioridade)}`;
        prioridade.textContent = os.prioridade || "";
        celulaPrioridade.appendChild(prioridade);
        linha.appendChild(celulaPrioridade);

        const celulaStatus = document.createElement("td");
        const status = document.createElement("span");
        status.className = `badge-status ${classeStatusRelatorio(os.status)}`;
        status.textContent = os.status || "";
        celulaStatus.appendChild(status);
        linha.appendChild(celulaStatus);

        linha.appendChild(criarCelula(os.dataReferencia));
        listaRelatorios.appendChild(linha);
    });
}

function renderizarResumoStatus(itens) {
    const container = document.getElementById("resumo-status-relatorios");
    container.innerHTML = "";

    itens.forEach((item) => {
        const card = document.createElement("article");
        card.className = `relatorios-indicador ${classeStatusRelatorio(item.status)}`;
        const rotulo = document.createElement("span");
        const total = document.createElement("strong");
        rotulo.textContent = item.rotulo;
        total.textContent = item.total;
        card.append(rotulo, total);
        container.appendChild(card);
    });
}

function renderizarResultado(resultado) {
    const total = resultado.resumo.total;
    const sufixo = total === 1 ? "OS encontrada" : "OS encontradas";
    document.getElementById("total-relatorios").textContent = `${total} ${sufixo}`;
    document.getElementById("descricao-consulta-relatorios").textContent = [
        `Período: ${resultado.consulta.apresentacao.periodo}`,
        `Data de referência: ${resultado.consulta.apresentacao.dataReferencia}`,
        resultado.consulta.apresentacao.resumo
    ].join(" | ");
    document.getElementById("total-urgentes-relatorio").textContent = resultado.resumo.porPrioridade.urgentes;
    document.getElementById("total-normais-relatorio").textContent = resultado.resumo.porPrioridade.normais;
    renderizarResumoStatus(resultado.resumo.porStatus);
    renderizarTabela(resultado.ordens, resultado.consulta.apresentacao);
    resultadoRelatorios.hidden = false;
    btnGerarRelatorioPdf.disabled = total === 0;
}

function invalidarConsultaAtual() {
    if (!consultaAtual) return;
    consultaAtual = null;
    btnGerarRelatorioPdf.disabled = true;
    exibirMensagemRelatorios("Os filtros foram alterados. Consulte novamente para atualizar os resultados e o PDF.");
}

async function consultarOrdens(evento) {
    evento.preventDefault();
    const filtros = obterFiltrosFormulario();

    try {
        validarFiltrosFormulario(filtros);
        btnConsultarRelatorio.disabled = true;
        btnConsultarRelatorio.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Consultando';
        exibirMensagemRelatorios("Consultando ordens de serviço...");

        const resposta = await fetch(`/api/relatorios/os?${criarParametrosConsulta(filtros)}`, {
            headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        const dados = await resposta.json();

        if (!resposta.ok) {
            throw new Error(dados.erro || "Não foi possível consultar as Ordens de Serviço.");
        }

        consultaAtual = {
            filtros: dados.consulta.filtros,
            ids: dados.ordens.map((os) => os.id)
        };
        renderizarResultado(dados);
        exibirMensagemRelatorios(
            dados.resumo.total ? "Consulta concluída." : "A consulta não encontrou Ordens de Serviço.",
            dados.resumo.total ? "sucesso" : ""
        );
    } catch (erro) {
        console.error("Erro ao consultar relatório de OS:", erro);
        consultaAtual = null;
        btnGerarRelatorioPdf.disabled = true;
        exibirMensagemRelatorios(erro.message, "erro");
    } finally {
        btnConsultarRelatorio.disabled = false;
        btnConsultarRelatorio.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Consultar';
    }
}

async function gerarPdfConsulta() {
    if (!consultaAtual) {
        exibirMensagemRelatorios("Consulte as Ordens de Serviço antes de gerar o PDF.", "erro");
        return;
    }

    const formato = document.querySelector('[name="formato-relatorio"]:checked')?.value || "resumido";
    await window.OSPdfDownload.baixarArquivo({
        url: "/api/relatorios/os/pdf",
        opcoes: {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                formato,
                filtros: consultaAtual.filtros,
                ids: consultaAtual.ids
            })
        },
        botao: btnGerarRelatorioPdf,
        nomePadrao: `Relatorio_OS_${formato}.pdf`,
        mensagemSemSessao: "Faça login para gerar o relatório de Ordens de Serviço.",
        mensagemErro: "Não foi possível gerar o relatório de Ordens de Serviço."
    });
}

caixasStatusRelatorio.forEach((caixa) => {
    caixa.addEventListener("change", () => {
        const todas = caixasStatusRelatorio.find((item) => item.value === "Todas");
        const especificas = caixasStatusRelatorio.filter((item) => item.value !== "Todas");

        if (caixa.value === "Todas" && caixa.checked) {
            especificas.forEach((item) => { item.checked = false; });
        } else if (caixa.value !== "Todas" && caixa.checked) {
            todas.checked = false;
        }

        if (!especificas.some((item) => item.checked)) {
            todas.checked = true;
        }
        invalidarConsultaAtual();
    });
});

formRelatorios.addEventListener("submit", consultarOrdens);
formRelatorios.addEventListener("input", (evento) => {
    if (evento.target.name !== "status-relatorio") invalidarConsultaAtual();
});
formRelatorios.addEventListener("change", (evento) => {
    if (evento.target.name !== "status-relatorio") invalidarConsultaAtual();
});
btnGerarRelatorioPdf.addEventListener("click", gerarPdfConsulta);
