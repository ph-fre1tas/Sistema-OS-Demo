/*
    admin.js
    --------------------------------------------------
    Controla o painel do administrador:

    - Lista usuários cadastrados;
    - Atualiza os cards de resumo;
    - Cria novos usuários;
    - Altera perfil;
    - Altera senha;
    - Ativa ou desativa usuários.
*/

const formUsuario = document.getElementById("formUsuario");
const listaUsuarios = document.getElementById("listaUsuarios");
const mensagem = document.getElementById("mensagem");
let usuariosCarregados = [];

function pegarToken() {
    return localStorage.getItem("token");
}

async function carregarUsuarios() {
    try {
        const resposta = await fetch("/api/usuarios", {
            headers: {
                "Authorization": `Bearer ${pegarToken()}`
            }
        });

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            const erro = await resposta.json();
            throw new Error(erro.erro || "Erro ao carregar usuários.");
        }

        const usuarios = await resposta.json();
        usuariosCarregados = usuarios;

        atualizarResumoUsuarios(usuarios);

        if (usuarios.length === 0) {
            listaUsuarios.innerHTML = "<p>Nenhum usuário cadastrado.</p>";
            return;
        }

        // Monta os cards dos usuários dinamicamente.
        listaUsuarios.innerHTML = usuarios.map(usuario => {
            const statusTexto = usuario.ativo ? "Ativo" : "Inativo";
            const textoBotao = usuario.ativo ? "Desativar" : "Ativar";
            const acao = usuario.ativo ? "desativar" : "ativar";
            const classeStatus = usuario.ativo ? "status-ativo" : "status-inativo";
            const classeCard = usuario.ativo ? "usuario-card" : "usuario-card inativo";

            return `
                <div class="${classeCard}">
                    <div class="usuario-card-topo">
                        <div>
                            <h3>${escaparTexto(usuario.nome)}</h3>
                            <p>${escaparTexto(usuario.usuario)}</p>
                            <p>${escaparTexto(usuario.email || "Sem e-mail cadastrado")}</p>
                            <p><strong>Recebe OS por e-mail:</strong> ${escaparTexto(resumirAreasEmail(usuario.areas_notificacao_email))}</p>
                        </div>

                        <span class="${classeStatus}">
                            ${statusTexto}
                        </span>
                    </div>

                    <div class="usuario-info-grid">
                        <p>
                            <strong>Perfil atual</strong>
                            <span>${escaparTexto(usuario.perfil)}</span>
                        </p>

                        <p>
                            <strong>Status</strong>
                            <span>${statusTexto}</span>
                        </p>
                    </div>

                    <label for="perfil-${usuario.id}">Alterar perfil</label>
                    <select id="perfil-${usuario.id}">
                        <option value="admin" ${usuario.perfil === "admin" ? "selected" : ""}>Admin</option>
                        <option value="lider" ${usuario.perfil === "lider" ? "selected" : ""}>Líder</option>
                        <option value="manutentor" ${usuario.perfil === "manutentor" ? "selected" : ""}>Manutentor</option>
                        <option value="compras" ${usuario.perfil === "compras" ? "selected" : ""}>Compras</option>
                        <option value="almoxarifado" ${usuario.perfil === "almoxarifado" ? "selected" : ""}>Almoxarifado</option>
                    </select>

                    <div class="usuario-acoes">
                        <button onclick="alterarPerfilUsuario(${usuario.id})">
                            Alterar perfil
                        </button>

                        <button onclick="alterarSenhaUsuario(${usuario.id})">
                            Alterar senha
                        </button>

                        <button onclick="alterarEmailUsuario(${usuario.id})">
                            Alterar e-mail
                        </button>

                        <button onclick="configurarEmailUsuario(${usuario.id})">
                            Configurar notificações
                        </button>

                        <button onclick="alterarStatusUsuario(${usuario.id}, '${acao}')" class="${usuario.ativo ? "btn-perigo" : "btn-sucesso"}">
                            ${textoBotao}
                        </button>
                    </div>
                </div>
            `;
        }).join("");

    } catch (error) {
        const paragrafo = document.createElement("p");
        paragrafo.textContent = error.message;
        listaUsuarios.replaceChildren(paragrafo);
    }
}

const areasEmailOS = ["Máquinas", "Máquinas de costura", "Manutenção Civil", "Metalúrgica"];

function resumirAreasEmail(areas) {
    if (!Array.isArray(areas) || areas.length === 0) return "Nenhuma área";
    return areas.length === areasEmailOS.length ? "Todas as áreas" : areas.join(", ");
}

async function configurarEmailUsuario(id) {
    const usuario = usuariosCarregados.find((item) => item.id === id);
    if (!usuario) return;

    const overlay = document.createElement("div");
    overlay.className = "os-modal-overlay os-modal-visivel";
    overlay.innerHTML = `
        <form class="os-modal estoque-modal-editar" role="dialog" aria-modal="true" aria-labelledby="tituloPreferenciasEmail">
            <div class="os-modal-topo"><h2 id="tituloPreferenciasEmail">Notificações de ${escaparTexto(usuario.nome)}</h2><button type="button" class="os-modal-fechar" aria-label="Fechar">&times;</button></div>
            <p class="os-modal-texto">Selecione as áreas das OS que este usuário receberá por e-mail. A opção Todas seleciona todas as áreas.</p>
            <label class="preferencia-email-opcao"><input type="checkbox" data-todas> Todas as áreas</label>
            ${areasEmailOS.map((area, indice) => `<label class="preferencia-email-opcao"><input type="checkbox" data-area="${indice}" value="${escaparTexto(area)}"> ${escaparTexto(area)}</label>`).join("")}
            ${usuario.email ? "" : '<p class="os-modal-texto">Este usuário ainda não tem e-mail cadastrado. As preferências serão salvas e usadas quando um e-mail for informado.</p>'}
            <p class="os-modal-erro" role="alert"></p>
            <div class="os-modal-acoes"><button type="button" class="os-modal-btn os-modal-btn-secundario">Cancelar</button><button type="submit" class="os-modal-btn os-modal-btn-principal">Salvar</button></div>
        </form>`;
    document.body.appendChild(overlay);

    const formulario = overlay.querySelector("form");
    const checksAreas = [...overlay.querySelectorAll("[data-area]")];
    const checkTodas = overlay.querySelector("[data-todas]");
    const atuais = Array.isArray(usuario.areas_notificacao_email) ? usuario.areas_notificacao_email : [];
    checksAreas.forEach((check) => { check.checked = atuais.includes(check.value); });
    checkTodas.checked = checksAreas.every((check) => check.checked);
    checkTodas.addEventListener("change", () => checksAreas.forEach((check) => { check.checked = checkTodas.checked; }));
    checksAreas.forEach((check) => check.addEventListener("change", () => {
        checkTodas.checked = checksAreas.every((item) => item.checked);
    }));

    const fechar = () => overlay.remove();
    overlay.querySelector(".os-modal-fechar").addEventListener("click", fechar);
    overlay.querySelector(".os-modal-btn-secundario").addEventListener("click", fechar);
    formulario.addEventListener("submit", async (evento) => {
        evento.preventDefault();
        const botao = formulario.querySelector('[type="submit"]');
        botao.disabled = true;
        try {
            const resposta = await fetch(`/api/usuarios/${id}/notificacoes-email`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "Authorization": `Bearer ${pegarToken()}` },
                body: JSON.stringify({ areas: checksAreas.filter((check) => check.checked).map((check) => check.value) })
            });
            const dados = await resposta.json();
            if (!resposta.ok) {
                if (respostaSessaoExpirada(resposta)) return;
                throw new Error(dados.erro || "Erro ao salvar preferências.");
            }
            mensagem.textContent = dados.mensagem;
            fechar();
            await carregarUsuarios();
        } catch (error) {
            overlay.querySelector(".os-modal-erro").textContent = error.message;
            botao.disabled = false;
        }
    });
}

formUsuario.addEventListener("submit", async (evento) => {
    evento.preventDefault();

    const nome = document.getElementById("nome").value.trim();
    const usuario = document.getElementById("usuario").value.trim();
    const senha = document.getElementById("senha").value.trim();
    const perfil = document.getElementById("perfil").value;
    const email = document.getElementById("email").value.trim();

    mensagem.textContent = "";

    if (!nome || !usuario || !senha || !perfil) {
        mensagem.textContent = "Preencha todos os campos.";
        return;
    }

    try {
        const resposta = await fetch("/api/usuarios", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${pegarToken()}`
            },
            body: JSON.stringify({
                nome,
                usuario,
                senha,
                perfil,
                email
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            throw new Error(dados.erro || "Erro ao criar usuário.");
        }

        mensagem.textContent = dados.mensagem || "Usuário criado com sucesso.";

        formUsuario.reset();
        carregarUsuarios();

    } catch (error) {
        mensagem.textContent = error.message;
    }
});

async function alterarEmailUsuario(id) {
    const usuario = usuariosCarregados.find((item) => item.id === id);
    if (!usuario) return;

    const email = await pedirTexto({
        titulo: "Alterar e-mail",
        mensagem: `Informe o e-mail de ${usuario.nome}. Deixe em branco para remover o e-mail cadastrado.`,
        valorInicial: usuario.email || "",
        placeholder: "nome@empresa.com",
        campo: "input",
        obrigatorio: false,
        textoConfirmar: "Salvar"
    });

    if (email === null) return;

    try {
        const resposta = await fetch(`/api/usuarios/${id}/email`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${pegarToken()}`
            },
            body: JSON.stringify({ email })
        });
        const dados = await resposta.json();
        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            throw new Error(dados.erro || "Erro ao alterar e-mail.");
        }
        mensagem.textContent = dados.mensagem;
        carregarUsuarios();
    } catch (error) {
        mensagem.textContent = error.message;
    }
}

async function alterarStatusUsuario(id, acao) {
    const confirmar = await mostrarConfirmacao(
        "Confirmar ação",
        `Tem certeza que deseja ${acao} este usuário?`,
        acao === "desativar" ? "perigo" : "padrao"
    );

    if (!confirmar) {
        return;
    }

    try {
        const resposta = await fetch(`/api/usuarios/${id}/${acao}`, {
            method: "PUT",
            headers: {
                "Authorization": `Bearer ${pegarToken()}`
            }
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            throw new Error(dados.erro || `Erro ao ${acao} usuário.`);
        }

        mensagem.textContent = dados.mensagem || "Usuário atualizado com sucesso.";

        carregarUsuarios();

    } catch (error) {
        mensagem.textContent = error.message;
    }
}

async function alterarSenhaUsuario(id) {
    const usuario = usuariosCarregados.find((item) => item.id === id);
    const nome = usuario ? usuario.nome : "usuário";

    const novaSenha = await pedirTexto({
        titulo: "Alterar senha",
        mensagem: `Digite a nova senha para ${nome}.`,
        placeholder: "Nova senha",
        campo: "input",
        obrigatorio: true,
        textoConfirmar: "Alterar senha"
    });

    if (novaSenha === null) {
        return;
    }

    try {
        const resposta = await fetch(`/api/usuarios/${id}/senha`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${pegarToken()}`
            },
            body: JSON.stringify({
                novaSenha
            })
        });

        const texto = await resposta.text();

        let dados;

        try {
            dados = JSON.parse(texto);
        } catch {
            throw new Error("A rota de alterar senha não foi encontrada no servidor.");
        }

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            throw new Error(dados.erro || "Erro ao alterar senha.");
        }

        mensagem.textContent = dados.mensagem || "Senha alterada com sucesso.";

        await mostrarAlerta(
            "Senha alterada",
            "A senha do usuário foi alterada com sucesso.",
            "sucesso"
        );

    } catch (error) {
        mensagem.textContent = error.message;

        await mostrarAlerta(
            "Erro ao alterar senha",
            error.message,
            "perigo"
        );
    }
}
//
async function alterarPerfilUsuario(id) {
    const selectPerfil = document.getElementById(`perfil-${id}`);
    const novoPerfil = selectPerfil.value;

    const confirmar = await mostrarConfirmacao(
        "Alterar perfil",
        `Tem certeza que deseja alterar o perfil para ${novoPerfil}?`
    );

    if (!confirmar) {
        return;
    }

    try {
        const resposta = await fetch(`/api/usuarios/${id}/perfil`, {
            method: "PUT",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${pegarToken()}`
            },
            body: JSON.stringify({
                perfil: novoPerfil
            })
        });

        const dados = await resposta.json();

        if (!resposta.ok) {
            if (respostaSessaoExpirada(resposta)) return;
            throw new Error(dados.erro || "Erro ao alterar perfil.");
        }

        mensagem.textContent = dados.mensagem || "Perfil alterado com sucesso.";

        carregarUsuarios();

    } catch (error) {
        mensagem.textContent = error.message;
    }
}

function atualizarResumoUsuarios(usuarios) {
    const totalUsuarios = document.getElementById("totalUsuarios");
    const totalAdmins = document.getElementById("totalAdmins");
    const totalLideres = document.getElementById("totalLideres");
    const totalManutentores = document.getElementById("totalManutentores");
    const totalInativos = document.getElementById("totalInativos");

    // Se os cards de resumo não existirem na página, não faz nada.
    if (!totalUsuarios) {
        return;
    }

    totalUsuarios.textContent = usuarios.length;
    totalAdmins.textContent = usuarios.filter(usuario => usuario.perfil === "admin").length;
    totalLideres.textContent = usuarios.filter(usuario => usuario.perfil === "lider").length;
    totalManutentores.textContent = usuarios.filter(usuario => usuario.perfil === "manutentor").length;
    totalInativos.textContent = usuarios.filter(usuario => !usuario.ativo).length;
}

// Carrega os usuários assim que a página abre.
carregarUsuarios();
