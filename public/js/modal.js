/*
    modal.js
    --------------------------------------------------
    Modais personalizados do sistema.

    Substitui:
    - alert()
    - confirm()
    - prompt()

    Funções disponíveis:
    - mostrarAlerta(titulo, mensagem)
    - mostrarConfirmacao(titulo, mensagem)
    - pedirTexto(opcoes)
*/

function abrirModalPersonalizado(opcoes) {
    return new Promise((resolve) => {
        const {
            titulo = "Mensagem",
            mensagem = "",
            tipo = "alerta",
            campo = "nenhum",
            placeholder = "",
            valorInicial = "",
            textoConfirmar = "OK",
            textoCancelar = "Cancelar",
            obrigatorio = false,
            mostrarCancelar = true
        } = opcoes;

        const overlay = document.createElement("div");
        overlay.className = "os-modal-overlay";

        const modal = document.createElement("div");
        modal.className = "os-modal";

        const modalTopo = document.createElement("div");
        modalTopo.className = "os-modal-topo";

        const modalTitulo = document.createElement("h2");
        modalTitulo.textContent = titulo;

        const botaoFechar = document.createElement("button");
        botaoFechar.type = "button";
        botaoFechar.className = "os-modal-fechar";
        botaoFechar.innerHTML = "&times;";
        botaoFechar.setAttribute("aria-label", "Fechar");

        const modalTexto = document.createElement("p");
        modalTexto.className = "os-modal-texto";
        modalTexto.textContent = mensagem;

        const campoErro = document.createElement("p");
        campoErro.className = "os-modal-erro";
        campoErro.textContent = "";

        let campoEntrada = null;

        if (campo === "input") {
            campoEntrada = document.createElement("input");
            campoEntrada.className = "os-modal-campo";
            campoEntrada.type = "text";
            campoEntrada.placeholder = placeholder;
            campoEntrada.value = valorInicial;
        }

        if (campo === "textarea") {
            campoEntrada = document.createElement("textarea");
            campoEntrada.className = "os-modal-campo";
            campoEntrada.placeholder = placeholder;
            campoEntrada.value = valorInicial;
            campoEntrada.rows = 5;
        }

        const modalAcoes = document.createElement("div");
        modalAcoes.className = "os-modal-acoes";

        const botaoCancelar = document.createElement("button");
        botaoCancelar.type = "button";
        botaoCancelar.className = "os-modal-btn os-modal-btn-secundario";
        botaoCancelar.textContent = textoCancelar;

        const botaoConfirmar = document.createElement("button");
        botaoConfirmar.type = "button";
        botaoConfirmar.className = "os-modal-btn os-modal-btn-principal";
        botaoConfirmar.textContent = textoConfirmar;

        if (tipo === "perigo") {
            botaoConfirmar.classList.add("os-modal-btn-perigo");
        }

        if (tipo === "sucesso") {
            botaoConfirmar.classList.add("os-modal-btn-sucesso");
        }

        if (!mostrarCancelar) {
            botaoCancelar.style.display = "none";
        }

        modalTopo.appendChild(modalTitulo);
        modalTopo.appendChild(botaoFechar);

        modal.appendChild(modalTopo);
        modal.appendChild(modalTexto);

        if (campoEntrada) {
            modal.appendChild(campoEntrada);
        }

        modal.appendChild(campoErro);

        modalAcoes.appendChild(botaoCancelar);
        modalAcoes.appendChild(botaoConfirmar);

        modal.appendChild(modalAcoes);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        setTimeout(() => {
            overlay.classList.add("os-modal-visivel");

            if (campoEntrada) {
                campoEntrada.focus();
            } else {
                botaoConfirmar.focus();
            }
        }, 10);

        function fecharModal(valor) {
            overlay.classList.remove("os-modal-visivel");

            document.removeEventListener("keydown", aoPressionarTecla);

            setTimeout(() => {
                overlay.remove();
                resolve(valor);
            }, 180);
        }

        function confirmarModal() {
            if (campoEntrada) {
                const valor = campoEntrada.value.trim();

                if (obrigatorio && valor === "") {
                    campoErro.textContent = "Este campo é obrigatório.";
                    campoEntrada.focus();
                    return;
                }

                fecharModal(valor);
                return;
            }

            fecharModal(true);
        }

        function cancelarModal() {
            if (!mostrarCancelar) {
                fecharModal(true);
                return;
            }

            fecharModal(null);
        }

        function aoPressionarTecla(event) {
            if (event.key === "Escape") {
                cancelarModal();
            }

            if (event.key === "Enter" && campo !== "textarea") {
                confirmarModal();
            }
        }

        botaoConfirmar.addEventListener("click", confirmarModal);
        botaoCancelar.addEventListener("click", cancelarModal);
        botaoFechar.addEventListener("click", cancelarModal);

        overlay.addEventListener("click", (event) => {
            if (event.target === overlay) {
                cancelarModal();
            }
        });

        document.addEventListener("keydown", aoPressionarTecla);
    });
}

function mostrarAlerta(titulo, mensagem, tipo = "alerta") {
    return abrirModalPersonalizado({
        titulo,
        mensagem,
        tipo,
        textoConfirmar: "Entendi",
        mostrarCancelar: false
    });
}

async function mostrarConfirmacao(titulo, mensagem, tipo = "padrao") {
    const resposta = await abrirModalPersonalizado({
        titulo,
        mensagem,
        tipo,
        textoConfirmar: "Confirmar",
        textoCancelar: "Cancelar"
    });

    return resposta === true;
}

function pedirTexto({
    titulo,
    mensagem,
    placeholder = "",
    valorInicial = "",
    obrigatorio = false,
    campo = "textarea",
    textoConfirmar = "Salvar",
    textoCancelar = "Cancelar",
    tipo = "padrao"
}) {
    return abrirModalPersonalizado({
        titulo,
        mensagem,
        campo,
        placeholder,
        valorInicial,
        obrigatorio,
        textoConfirmar,
        textoCancelar,
        tipo
    });
}