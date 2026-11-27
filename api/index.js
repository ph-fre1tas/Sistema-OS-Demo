/*
    index.js
    --------------------------------------------------
    Arquivo principal do servidor Express.

    Responsabilidades:
    - Criar a aplicação Express;
    - Ativar middlewares globais;
    - Servir arquivos estáticos da pasta public;
    - Registrar as rotas da API;
    - Criar rotas de teste;
    - Redirecionar URLs antigas para a nova estrutura de páginas;
    - Exportar o app para funcionar na Vercel;
    - Rodar localmente com app.listen quando executado direto.
*/

const express = require("express");
const cors = require("cors");
require("dotenv").config();

// Conexão com o banco de dados.
// Atenção: este caminho funciona se este index.js estiver dentro da pasta api.
// Exemplo: api/index.js -> ../db/db
const pool = require("../db/db");
const { responderErroDoBanco } = require("../db/errosBanco");
const { garantirEstruturaDeNotificacoes } = require("../services/notificacaoService");

// Importação das rotas da API.
const authRoutes = require("../routes/authRoutes");
const osRoutes = require("../routes/osRoutes");
const usuarioRoutes = require("../routes/usuarioRoutes");
const estoqueRoutes = require("../routes/estoqueRoutes");
const pedidoCompraRoutes = require("../routes/pedidoCompraRoutes");
const notificacaoRoutes = require("../routes/notificacaoRoutes");
const relatorioRoutes = require("../routes/relatorioRoutes");
const ferramentasRoutes = require("../routes/ferramentasRoutes");
const maquinasRoutes = require("../routes/maquinasRoutes");

const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");
const { isDemoMode, bloquearEscritaEmModoDemo } = require("../middleware/demoMiddleware");

const app = express();

/*
    Middlewares globais
    --------------------------------------------------
*/

// Permite requisições entre origens diferentes.
// No seu caso, pode ajudar durante testes e deploy.
app.use(cors());

// Permite que o Express leia JSON enviado no body das requisições.
app.use(express.json());

// Serve arquivos estáticos da pasta public.
// Exemplo:
// public/pages/login.html
// public/css/style.css
// public/js/auth.js
app.use(express.static("public"));

/*
    Rota de teste da API
    --------------------------------------------------
    Registrada antes do middleware de inicialização do banco para responder
    rapidamente sem disparar conexões desnecessárias no PostgreSQL.
*/

app.get("/api", (req, res) => {
    res.json({
        mensagem: "API do Sistema de Manutenção funcionando!",
        demoMode: isDemoMode()
    });
});

app.use("/api", bloquearEscritaEmModoDemo);

// Mantém o banco atualizado sem exigir uma etapa manual de migração no deploy.
app.use("/api", async (req, res, next) => {
    try {
        await garantirEstruturaDeNotificacoes();
        next();
    } catch (erro) {
        console.error("Erro ao preparar notificações:", erro);
        responderErroDoBanco(res, erro, "Não foi possível preparar o sistema de notificações.");
    }
});

/*
    Rotas principais da API
    --------------------------------------------------

    authRoutes:
    - POST /api/login

    osRoutes:
    - POST /api/os
    - GET /api/os/abertas
    - GET /api/os/concluidas
    - GET /api/os/:id/pdf
    - PUT /api/os/:id/andamento
    - PUT /api/os/:id/aguardando-peca
    - PUT /api/os/:id/concluir
    - PUT /api/os/:id/cancelar

    usuarioRoutes:
    - GET /api/usuarios
    - POST /api/usuarios
    - PUT /api/usuarios/:id/desativar
    - PUT /api/usuarios/:id/ativar
    - PUT /api/usuarios/:id/senha
    - PUT /api/usuarios/:id/perfil

    pedidoCompraRoutes:
    - POST /api/pedidos-compra/excel
    - POST /api/pedidos-compra/pdf

    relatorioRoutes:
    - GET /api/relatorios/os
    - POST /api/relatorios/os/pdf
*/

app.use("/api", authRoutes);
app.use("/api/os", osRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/estoque", estoqueRoutes);
app.use("/api/pedidos-compra", pedidoCompraRoutes);
app.use("/api/notificacoes", notificacaoRoutes);
app.use("/api/relatorios", relatorioRoutes);
app.use("/api/ferramentas", ferramentasRoutes);
app.use("/api/maquinas", maquinasRoutes);

/*
    Rota de teste do banco de dados
    --------------------------------------------------
    Serve para confirmar se a conexão com o banco está funcionando.
*/

app.get(
    "/api/teste-banco",
    autenticarToken,
    permitirPerfis("admin"),
    async (req, res) => {
        try {
            const resultado = await pool.query("SELECT NOW()");

            res.json({
                mensagem: "Conexão com o banco funcionando!",
                horario_banco: resultado.rows[0].now
            });
        } catch (erro) {
            console.error("Erro ao conectar no banco:", erro);
            responderErroDoBanco(res, erro, "Erro ao conectar no banco");
        }
    }
);

/*
    Porta do servidor
    --------------------------------------------------
    Em produção, a Vercel define a porta automaticamente.
    Localmente, usa a porta 3000 se PORT não existir.
*/

const PORT = process.env.PORT || 3000;

/*
    Redirecionamentos de compatibilidade
    --------------------------------------------------
    Antes as páginas provavelmente ficavam direto na raiz, exemplo:
    /login.html

    Agora elas ficam em:
    /pages/login.html

    Esses redirects evitam erro caso alguém acesse o link antigo.
*/

app.get("/login.html", (req, res) => {
    res.redirect("/pages/login.html");
});

app.get("/criar-os.html", (req, res) => {
    res.redirect("/pages/criar-os.html");
});

app.get("/painel-manutentor.html", (req, res) => {
    res.redirect("/pages/painel-manutentor.html");
});

app.get("/os-concluidas.html", (req, res) => {
    res.redirect("/pages/os-concluidas.html");
});

app.get("/relatorios.html", (req, res) => {
    res.redirect("/pages/relatorios.html");
});

app.get("/admin.html", (req, res) => {
    res.redirect("/pages/admin.html");
});

app.get("/estoque.html", (req, res) => {
    res.redirect("/pages/estoque.html");
});

app.get("/pedido-compra.html", (req, res) => {
    res.redirect("/pages/pedido-compra.html");
});

/*
    Rota inicial
    --------------------------------------------------
    Quando alguém acessa o domínio principal, manda para o login.
*/

app.get("/", (req, res) => {
    res.redirect("/pages/login.html");
});

/*
    Middleware global de tratamento de erros
    --------------------------------------------------
    Captura qualquer erro não tratado nas rotas e retorna
    uma resposta padronizada em JSON, evitando expor detalhes internos.
*/
app.use((erro, req, res, next) => {
    console.error("Erro interno não tratado:", erro);
    responderErroDoBanco(res, erro, "Ocorreu um erro interno no servidor.");
});

/*
    Execução local
    --------------------------------------------------
    Esse if evita conflito com a Vercel.

    Quando o arquivo é executado diretamente com:
    node index.js

    Ele inicia o servidor local.

    Quando a Vercel importa o app, ela usa module.exports sem rodar app.listen.
*/

if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`Servidor rodando na porta ${PORT}`);
    });
}

module.exports = app;
