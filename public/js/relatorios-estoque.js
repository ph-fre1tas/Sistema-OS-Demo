(() => {
    const el = id => document.getElementById(id);
    const seletor = document.querySelector(".relatorios-seletor");
    const abas = [el("aba-relatorios-os"), el("aba-relatorios-estoque")];
    const somenteEstoque = verificarLogin()?.perfil === "compras";
    function selecionarAba(indice) {
        if (somenteEstoque) indice = 1;
        seletor.dataset.aba = indice ? "estoque" : "os";
        abas.forEach((aba, i) => {
            aba.setAttribute("aria-selected", String(i === indice));
            aba.tabIndex = i === indice ? 0 : -1;
        });
        el("painel-filtros-os").hidden = Boolean(indice);
        el("conteudo-resultados-os").hidden = Boolean(indice);
        el("painel-filtros-estoque").hidden = !indice;
        el("conteudo-resultados-estoque").hidden = !indice;
    }
    abas.forEach((aba, indice) => {
        aba.addEventListener("click", () => selecionarAba(indice));
        aba.addEventListener("keydown", evento => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
            evento.preventDefault();
            const destino = evento.key === "Home" ? 0 : evento.key === "End" ? 1 : 1 - indice;
            selecionarAba(destino);
            abas[destino].focus();
        });
    });

    seletor.hidden = somenteEstoque;
    selecionarAba(somenteEstoque ? 1 : 0);
    if (somenteEstoque) {
        document.querySelector(".relatorios-topbar p").textContent = "Consulte as retiradas do estoque.";
        el("painel-filtros-estoque").setAttribute("aria-label", "Retiradas do estoque");
        el("painel-filtros-estoque").removeAttribute("aria-labelledby");
    }

    const form = el("form-retiradas");
    const botao = el("btn-consultar-retiradas");
    const mensagem = el("mensagem-retiradas");
    const anterior = el("retiradas-anterior");
    const proxima = el("retiradas-proxima");
    const botaoPdf = el("btn-gerar-retiradas-pdf");
    let gerandoPdf = false;
    let temResultados = false;
    let filtrosAtuais = null;
    let paginaAtual = 1;
    let temProxima = false;
    let versao = 0;
    let requisicao = null;
    function informar(texto, erro = false, sucesso = false) {
        mensagem.textContent = texto;
        mensagem.className = `relatorios-mensagem${erro ? " erro" : sucesso ? " sucesso" : ""}`;
    }
    function dataHora(valor) {
        const iso = valor.replace(" ", "T");
        return new Date(/[Zz]|[+-]\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`).toLocaleString("pt-BR", {
            timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short"
        });
    }
    function renderizar(dados) {
        const lista = el("lista-retiradas");
        lista.replaceChildren();
        for (const retirada of dados.retiradas) {
            const linha = document.createElement("tr");
            const valores = [retirada.produto_descricao,
                `${new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2 }).format(Number(retirada.quantidade))} ${retirada.unidade}`,
                retirada.usuario_nome, retirada.recebedor_nome, dataHora(retirada.criado_em),
                retirada.cancelada_em ? "Cancelada" : "Confirmada"];
            valores.forEach((valor, indice) => {
                const celula = document.createElement("td");
                celula.textContent = valor;
                if (indice === 5 && retirada.cancelada_em) {
                    celula.className = "retirada-cancelada";
                    celula.title = `Cancelada por ${retirada.cancelada_por_nome || "—"} em ${dataHora(retirada.cancelada_em)}`;
                }
                linha.appendChild(celula);
            });
            lista.appendChild(linha);
        }
        if (!dados.retiradas.length) {
            const linha = document.createElement("tr");
            const celula = document.createElement("td");
            celula.colSpan = 6;
            celula.className = "estado-tabela";
            celula.textContent = "Nenhuma retirada corresponde aos filtros selecionados.";
            linha.appendChild(celula);
            lista.appendChild(linha);
        }
        paginaAtual = dados.pagina;
        temProxima = dados.temProxima;
        temResultados = dados.retiradas.length > 0;
        el("descricao-retiradas").textContent = `${dados.retiradas.length} registro(s) nesta página. O PDF inclui todos os registros dos filtros consultados.`;
        el("pagina-retiradas").textContent = `Página ${paginaAtual}`;
        el("paginacao-retiradas").hidden = paginaAtual === 1 && !temProxima;
        el("resultado-retiradas").hidden = false;
    }
    async function consultar(filtros, pagina = 1) {
        if (gerandoPdf) return;
        requisicao?.abort();
        requisicao = new AbortController();
        const atual = ++versao;
        botao.disabled = anterior.disabled = proxima.disabled = true;
        botaoPdf.disabled = true;
        informar("Consultando retiradas do estoque...");
        try {
            const parametros = new URLSearchParams({ ...filtros, pagina });
            const resposta = await fetch(`/api/estoque/retiradas?${parametros}`, {
                headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }, signal: requisicao.signal
            });
            const dados = await resposta.json();
            if (!resposta.ok) throw new Error(dados.erro || "Não foi possível consultar as retiradas.");
            if (atual !== versao) return;
            filtrosAtuais = filtros;
            renderizar(dados);
            informar(dados.retiradas.length ? "Consulta concluída." : "A consulta não encontrou retiradas.", false, dados.retiradas.length > 0);
        } catch (erro) {
            if (atual !== versao || erro.name === "AbortError") return;
            filtrosAtuais = null;
            el("resultado-retiradas").hidden = true;
            informar(erro.message, true);
        } finally {
            if (atual === versao) {
                botao.disabled = false;
                anterior.disabled = !filtrosAtuais || paginaAtual === 1;
                proxima.disabled = !filtrosAtuais || !temProxima;
                botaoPdf.disabled = !filtrosAtuais || !temResultados;
            }
        }
    }
    form.addEventListener("submit", evento => {
        evento.preventDefault();
        const filtros = { busca: el("busca-retiradas").value.trim(),
            data_inicio: el("data-inicio-retiradas").value, data_fim: el("data-fim-retiradas").value,
            situacao: el("situacao-retiradas").value };
        if (filtros.data_inicio && filtros.data_fim && filtros.data_inicio > filtros.data_fim) {
            informar("A data inicial não pode ser posterior à data final.", true);
            return;
        }
        consultar(filtros);
    });
    form.addEventListener("input", () => {
        ++versao;
        requisicao?.abort();
        filtrosAtuais = null;
        botao.disabled = false;
        anterior.disabled = proxima.disabled = true;
        botaoPdf.disabled = true;
        el("resultado-retiradas").hidden = true;
        informar("Consulte para exibir os resultados dos filtros selecionados.");
    });
    anterior.addEventListener("click", () => { if (filtrosAtuais && paginaAtual > 1) consultar(filtrosAtuais, paginaAtual - 1); });
    proxima.addEventListener("click", () => { if (filtrosAtuais && temProxima) consultar(filtrosAtuais, paginaAtual + 1); });
    botaoPdf.addEventListener("click", async () => {
        if (gerandoPdf || !filtrosAtuais || botaoPdf.disabled) return;
        gerandoPdf = true;
        const controles = Array.from(form.elements).map(controle => [controle, controle.disabled]);
        controles.forEach(([controle]) => { controle.disabled = true; });
        anterior.disabled = proxima.disabled = true;
        try {
            await window.OSPdfDownload.baixarArquivo({
                url: `/api/estoque/retiradas/pdf?${new URLSearchParams(filtrosAtuais)}`,
                botao: botaoPdf,
                nomePadrao: "Relatorio_Retiradas_Estoque.pdf",
                mensagemErro: "Não foi possível gerar o PDF de retiradas do estoque."
            });
        } finally {
            gerandoPdf = false;
            controles.forEach(([controle, desabilitado]) => { controle.disabled = desabilitado; });
            anterior.disabled = !filtrosAtuais || paginaAtual === 1;
            proxima.disabled = !filtrosAtuais || !temProxima;
            botaoPdf.disabled = !filtrosAtuais || !temResultados;
        }
    });
})();
