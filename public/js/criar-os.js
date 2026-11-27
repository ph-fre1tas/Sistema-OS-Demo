/*
    criar-os.js
    --------------------------------------------------
    Controla a página de criação de OS:

    - Captura os dados do formulário;
    - Valida os campos obrigatórios;
    - Envia a nova OS para a API;
    - Exibe mensagem na tela;
    - Exibe popup moderno de sucesso ou erro.
*/

const form = document.getElementById("form-os");

async function exibirPopup(titulo, texto, tipo = "alerta") {
    /*
        Usa o modal moderno se o modal.js estiver carregado.
        Se por algum motivo não estiver, usa alert() como segurança.
    */
    if (typeof mostrarAlerta === "function") {
        await mostrarAlerta(titulo, texto, tipo);
        return;
    }

    alert(texto);
}

function validarCamposObrigatorios(dadosOS) {
    if (!dadosOS.solicitante) {
        return {
            campo: "solicitante",
            mensagem: "Informe o nome do solicitante."
        };
    }

    if (!dadosOS.setor) {
        return {
            campo: dadosOS.setor_outro ? "setorOutro" : "setor",
            mensagem: "Informe o setor da solicitação."
        };
    }

    if (dadosOS.setor.length > 120) {
        return { campo: "setorOutro", mensagem: "O setor deve ter no máximo 120 caracteres." };
    }

    if (!dadosOS.maquina) {
        return {
            campo: "maquina",
            mensagem: "Informe a máquina relacionada à OS."
        };
    }

    if (!dadosOS.problema) {
        return {
            campo: "problema",
            mensagem: "Descreva o problema encontrado."
        };
    }

    if (!dadosOS.area_manutencao) {
        return {
            campo: "area_manutencao",
            mensagem: "Selecione a área da manutenção."
        };
    }

    if (!dadosOS.prioridade) {
        return {
            campo: "prioridade",
            mensagem: "Selecione a prioridade da OS."
        };
    }

    return null;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const botaoEnviar = form.querySelector("button[type='submit']");
    const setorSelecionado = document.getElementById("setor").value;
    const setorOutro = setorSelecionado === "OUTRO";

    const dadosOS = {
        solicitante: document.getElementById("solicitante").value.trim(),
        setor: setorOutro
            ? document.getElementById("setorOutro").value.trim()
            : setorSelecionado.trim(),
        setor_outro: setorOutro,
        maquina: document.getElementById("maquina").value.trim(),
        maquina_id: document.getElementById("maquina_id").value.trim(),
        problema: document.getElementById("problema").value.trim(),
        area_manutencao: document.getElementById("area_manutencao").value,
        prioridade: document.getElementById("prioridade").value
    };

    const erroValidacao = validarCamposObrigatorios(dadosOS);

    if (erroValidacao) {
        await exibirPopup(
            "Campo obrigatório",
            erroValidacao.mensagem,
            "perigo"
        );

        const campo = document.getElementById(erroValidacao.campo);
        document.getElementById(`${erroValidacao.campo}Botao`)?.focus();
        if (campo.type !== "hidden") campo.focus();

        return;
    }

    try {
        const token = localStorage.getItem("token");

        if (!token) {
            await exibirPopup(
                "Sessão expirada",
                "Faça login para criar uma OS.",
                "perigo"
            );

            if (typeof redirecionarParaLogin === "function") {
                redirecionarParaLogin("Faça login para criar uma OS.");
                return;
            }

            window.location.href = "login.html";
            return;
        }

        botaoEnviar.disabled = true;
        botaoEnviar.textContent = "Criando OS...";

        const resposta = await fetch("/api/os", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${token}`
            },
            body: JSON.stringify(dadosOS)
        });

        const resultado = await resposta.json();

        if (!resposta.ok) {
            if (resposta.status === 401 || resposta.status === 403) {
                await exibirPopup(
                    "Sessão expirada",
                    "Sua sessão expirou. Faça login novamente.",
                    "perigo"
                );

                if (typeof redirecionarParaLogin === "function") {
                    redirecionarParaLogin("Sua sessão expirou. Faça login novamente.");
                    return;
                }
            }

            const textoErro =
                resultado.erro ||
                resultado.mensagem ||
                "Erro ao criar OS.";

            await exibirPopup(
                "Erro ao criar OS",
                textoErro,
                "perigo"
            );

            return;
        }

        await exibirPopup(
            "OS criada",
            "A ordem de serviço foi criada com sucesso e já está disponível no painel.",
            "sucesso"
        );

        form.reset();
        seletorSetorOS.limpar();
        seletorAreaManutencao.limpar();
        seletorPrioridadeOS.limpar();
        document.getElementById("solicitante").focus();

    } catch (erro) {
        console.error("Erro:", erro);

        const textoErro = "Erro ao conectar com a API.";

        await exibirPopup(
            "Erro de conexão",
            textoErro,
            "perigo"
        );
    } finally {
        botaoEnviar.disabled = false;
        botaoEnviar.textContent = "Criar OS";
    }
});
