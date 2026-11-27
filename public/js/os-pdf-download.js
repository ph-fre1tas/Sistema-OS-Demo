(function disponibilizarDownloadPdfOS() {
    function obterNomeArquivoPdf(resposta, nomePadrao) {
        const disposicao = resposta.headers.get("Content-Disposition") || "";
        const correspondencia = disposicao.match(/filename="?([^";]+)"?/i);
        return correspondencia?.[1] || nomePadrao;
    }

    function restaurarAtributo(elemento, atributo, valor) {
        if (valor === null || valor === undefined || valor === "") {
            elemento.removeAttribute(atributo);
        } else {
            elemento.setAttribute(atributo, valor);
        }
    }

    async function baixarArquivo({
        url,
        opcoes = {},
        botao,
        nomePadrao = "relatorio.pdf",
        mensagemSemSessao = "Faça login para baixar o PDF.",
        mensagemErro = "Não foi possível gerar o PDF."
    }) {
        const token = localStorage.getItem("token");

        if (!token) {
            if (typeof redirecionarParaLogin === "function") {
                redirecionarParaLogin(mensagemSemSessao);
                return;
            }

            window.location.href = "login.html";
            return;
        }

        const textoOriginal = botao?.innerHTML;
        const rotuloOriginal = botao?.getAttribute("aria-label");
        const tituloOriginal = botao?.getAttribute("title");
        if (botao) {
            botao.disabled = true;
            botao.innerHTML = '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i>';
            botao.setAttribute("aria-label", "Gerando PDF");
            botao.title = "Gerando PDF";
        }

        try {
            const resposta = await fetch(url, {
                ...opcoes,
                headers: {
                    ...(opcoes.headers || {}),
                    "Authorization": `Bearer ${token}`
                }
            });

            if (!resposta.ok) {
                const tipoConteudo = resposta.headers.get("Content-Type") || "";
                const erro = tipoConteudo.includes("application/json")
                    ? await resposta.json()
                    : null;
                throw new Error(erro?.erro || mensagemErro);
            }

            const arquivo = await resposta.blob();
            const urlTemporaria = URL.createObjectURL(arquivo);
            const link = document.createElement("a");
            link.href = urlTemporaria;
            link.download = obterNomeArquivoPdf(resposta, nomePadrao);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.setTimeout(() => URL.revokeObjectURL(urlTemporaria), 1000);
        } catch (erro) {
            console.error("Erro ao baixar PDF:", erro);

            if (typeof mostrarAlerta === "function") {
                await mostrarAlerta("Erro ao gerar PDF", erro.message, "perigo");
            } else {
                alert(erro.message);
            }
        } finally {
            if (botao) {
                botao.disabled = false;
                botao.innerHTML = textoOriginal;
                restaurarAtributo(botao, "aria-label", rotuloOriginal);
                restaurarAtributo(botao, "title", tituloOriginal);
            }
        }
    }

    async function baixar(id, botao) {
        return baixarArquivo({
            url: `/api/os/${id}/pdf`,
            botao,
            nomePadrao: `OS_${id}.pdf`,
            mensagemSemSessao: "Faça login para baixar o PDF da OS.",
            mensagemErro: "Não foi possível gerar o PDF desta OS."
        });
    }

    function criarAcao(id) {
        const botao = document.createElement("button");
        const icone = document.createElement("i");

        botao.type = "button";
        botao.className = "btn-download-pdf";
        botao.setAttribute("aria-label", "Baixar PDF");
        botao.title = "Baixar PDF";
        icone.className = "fa-solid fa-file-arrow-down";
        icone.setAttribute("aria-hidden", "true");
        botao.appendChild(icone);
        botao.addEventListener("click", () => baixar(id, botao));

        return botao;
    }

    function adicionarAoCard(card, id) {
        const acao = criarAcao(id);
        const grupoBadges = card.querySelector(".os-badges");

        if (grupoBadges) {
            grupoBadges.appendChild(acao);
        }
    }

    window.OSPdfDownload = Object.freeze({
        adicionarAoCard,
        baixar,
        baixarArquivo
    });
})();
