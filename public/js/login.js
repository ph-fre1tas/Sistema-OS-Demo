/*
    login.js
    --------------------------------------------------
    Controla a tela de login:

    - Captura usuário e senha;
    - Envia os dados para a API;
    - Salva token e usuário no localStorage;
    - Redireciona o usuário conforme o perfil.
*/

const formLogin = document.getElementById("form-login");

async function exibirPopupLogin(titulo, texto, tipo = "perigo") {
  if (typeof mostrarAlerta === "function") {
    await mostrarAlerta(titulo, texto, tipo);
    return;
  }

  alert(texto);
}

async function redirecionarUsuario(usuario) {
  // Define a tela inicial de cada perfil após o login.
  if (usuario.perfil === "admin") {
    window.location.href = "/pages/criar-os.html";
    return;
  }

  if (usuario.perfil === "lider") {
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

  await exibirPopupLogin(
    "Perfil inválido",
    "Perfil de usuário inválido.",
    "perigo"
  );
}

formLogin.addEventListener("submit", async (event) => {
  event.preventDefault();

  const usuario = document.getElementById("usuario").value.trim();
  const senha = document.getElementById("senha").value.trim();
  const botaoEntrar = formLogin.querySelector("button[type='submit']");

  // Validação simples antes de chamar a API.
  if (!usuario || !senha) {
    await exibirPopupLogin(
      "Campos obrigatórios",
      "Informe usuário e senha.",
      "perigo"
    );
    return;
  }

  try {
    // Desativa o botão para evitar vários cliques durante o login.
    botaoEntrar.disabled = true;
    botaoEntrar.textContent = "Entrando...";

    const resposta = await fetch("/api/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        usuario,
        senha
      })
    });

    // Lê como texto primeiro para tratar caso o servidor devolva algo que não seja JSON.
    const textoResposta = await resposta.text();

    let dados;

    try {
      dados = JSON.parse(textoResposta);
    } catch {
      throw new Error("Resposta inválida do servidor.");
    }

    if (!resposta.ok) {
      await exibirPopupLogin(
        "Erro no login",
        dados.erro || "Erro ao fazer login.",
        "perigo"
      );
      return;
    }

    // Salva os dados de sessão no navegador.
    localStorage.setItem("token", dados.token);
    localStorage.setItem("usuarioLogado", JSON.stringify(dados.usuario));

    await redirecionarUsuario(dados.usuario);

  } catch (error) {
    console.error("Erro no login:", error);
    await exibirPopupLogin(
      "Erro de conexão",
      "Erro ao conectar com o servidor.",
      "perigo"
    );
  } finally {
    // Garante que o botão volte ao normal mesmo se ocorrer erro.
    botaoEntrar.disabled = false;
    botaoEntrar.textContent = "Entrar";
  }
});

async function inicializarAcessoDemo() {
  const blocoDemo = document.getElementById("demo-acesso");
  if (!blocoDemo) return;

  try {
    const resposta = await fetch("/api");
    if (!resposta.ok) return;
    const dados = await resposta.json();
    if (!dados?.demoMode) return;
    blocoDemo.hidden = false;
  } catch {
    return;
  }

  const botoes = blocoDemo.querySelectorAll("[data-demo-perfil]");
  botoes.forEach((botao) => {
    botao.addEventListener("click", async () => {
      const perfil = botao.dataset.demoPerfil;
      botoes.forEach((b) => { b.disabled = true; });
      const textoOriginal = botao.textContent;
      botao.textContent = "Entrando...";

      try {
        const resposta = await fetch("/api/demo-login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ perfil })
        });
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) {
          await exibirPopupLogin("Erro na demo", dados.erro || "Não foi possível entrar no modo demonstração.");
          return;
        }

        localStorage.setItem("token", dados.token);
        localStorage.setItem("usuarioLogado", JSON.stringify(dados.usuario));
        await redirecionarUsuario(dados.usuario);
      } catch (error) {
        console.error("Erro no demo-login:", error);
        await exibirPopupLogin("Erro de conexão", "Erro ao conectar com o servidor.");
      } finally {
        botoes.forEach((b) => { b.disabled = false; });
        botao.textContent = textoOriginal;
      }
    });
  });
}

inicializarAcessoDemo();
