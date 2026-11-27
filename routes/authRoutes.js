/*
    authRoutes.js
    --------------------------------------------------
    Rotas relacionadas à autenticação.

    Atualmente este arquivo possui a rota de login:

    POST /api/login

    Responsabilidades:
    - Receber usuário e senha;
    - Validar se os campos foram preenchidos;
    - Buscar o usuário no banco;
    - Verificar se o usuário existe;
    - Verificar se está ativo;
    - Comparar a senha digitada com a senha criptografada;
    - Gerar um token JWT;
    - Retornar os dados básicos do usuário logado.
*/

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const pool = require("../db/db");
const { responderErroDoBanco } = require("../db/errosBanco");
const { criarArmazenamentoLimitesLogin } = require("../services/loginLimiteService");
const { criarLimitadorLogin } = require("../middleware/loginLimitMiddleware");
const { isDemoMode } = require("../middleware/demoMiddleware");

const router = express.Router();
const limitarLogin = criarLimitadorLogin(criarArmazenamentoLimitesLogin(pool));

router.post("/login", limitarLogin, async (req, res) => {
  try {
    const { usuario, senha } = req.body || {};

    // Validação básica dos campos recebidos.
    if (typeof usuario !== "string" || typeof senha !== "string" || !usuario || !senha) {
      return res.status(400).json({
        erro: "Usuário e senha são obrigatórios."
      });
    }

    // Remove espaços extras antes e depois.
    // Exemplo: " admin " vira "admin".
    const usuarioLimpo = usuario.trim();
    const senhaLimpa = senha.trim();

    if (!usuarioLimpo || !senhaLimpa) {
      return res.status(400).json({
        erro: "Usuário e senha são obrigatórios."
      });
    }

    // Verifica se a chave secreta do JWT existe no .env.
    // Sem ela, o sistema não consegue gerar tokens com segurança.
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET não configurado no .env.");

      return res.status(500).json({
        erro: "Erro de configuração do servidor."
      });
    }

    // Busca o usuário pelo login informado.
    // O uso de $1 evita SQL Injection.
    const resultado = await pool.query(
      `
      SELECT id, nome, usuario, senha_hash, perfil, ativo
      FROM usuarios
      WHERE usuario = $1
      `,
      [usuarioLimpo]
    );

    // Se não encontrou usuário, retorna erro genérico.
    // Não é bom dizer "usuário não existe", para não facilitar tentativa de invasão.
    if (resultado.rows.length === 0) {
      return res.status(401).json({
        erro: "Usuário ou senha inválidos."
      });
    }

    const usuarioEncontrado = resultado.rows[0];

    // Compara a senha digitada com a senha_hash salva no banco.
    const senhaCorreta = await bcrypt.compare(
      senhaLimpa,
      usuarioEncontrado.senha_hash
    );

    if (!senhaCorreta) {
      return res.status(401).json({
        erro: "Usuário ou senha inválidos."
      });
    }

    // Bloqueia login de usuário desativado após conferir a senha.
    if (!usuarioEncontrado.ativo) {
      return res.status(403).json({
        erro: "Usuário inativo. Entre em contato com o administrador."
      });
    }

    // Gera o token JWT com os dados necessários do usuário.
    // Não colocamos senha_hash dentro do token.
    const token = jwt.sign(
      {
        id: usuarioEncontrado.id,
        nome: usuarioEncontrado.nome,
        usuario: usuarioEncontrado.usuario,
        perfil: usuarioEncontrado.perfil
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "12h"
      }
    );

    // Retorna o token e dados básicos do usuário para o frontend.
    res.json({
      mensagem: "Login realizado com sucesso.",
      token,
      usuario: {
        id: usuarioEncontrado.id,
        nome: usuarioEncontrado.nome,
        usuario: usuarioEncontrado.usuario,
        perfil: usuarioEncontrado.perfil
      }
    });
  } catch (error) {
    console.error("Erro no login:", error);
    responderErroDoBanco(res, error, "Erro interno no servidor.");
  }
});

const PERFIS_DEMO = {
  admin: "Administrador (Demo)",
  manutentor: "Manutentor (Demo)",
  lider: "Líder (Demo)",
  almoxarifado: "Almoxarifado (Demo)",
  compras: "Compras (Demo)"
};

router.post("/demo-login", async (req, res) => {
  if (!isDemoMode()) {
    return res.status(404).json({ erro: "Rota indisponível." });
  }

  try {
    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET não configurado no .env.");
      return res.status(500).json({ erro: "Erro de configuração do servidor." });
    }

    const perfilSolicitado = typeof req.body?.perfil === "string"
      ? req.body.perfil.trim().toLowerCase()
      : "admin";
    const perfil = PERFIS_DEMO[perfilSolicitado] ? perfilSolicitado : "admin";

    let usuarioDemo = {
      id: 1,
      nome: PERFIS_DEMO[perfil],
      usuario: `demo_${perfil}`,
      perfil
    };

    try {
      const resultado = await pool.query(
        `
        SELECT id, nome, usuario, perfil
        FROM usuarios
        WHERE ativo = true AND perfil = $1
        ORDER BY id ASC
        LIMIT 1
        `,
        [perfil]
      );
      if (resultado.rows.length > 0) {
        usuarioDemo = resultado.rows[0];
      }
    } catch (erroConsulta) {
      console.warn("Aviso no demo-login ao consultar usuário no banco:", erroConsulta.message);
    }

    const token = jwt.sign(
      {
        id: usuarioDemo.id,
        nome: usuarioDemo.nome,
        usuario: usuarioDemo.usuario,
        perfil: usuarioDemo.perfil,
        demo: true
      },
      process.env.JWT_SECRET,
      {
        algorithm: "HS256",
        expiresIn: "12h"
      }
    );

    return res.json({
      mensagem: "Login de demonstração realizado.",
      token,
      demo: true,
      usuario: {
        id: usuarioDemo.id,
        nome: usuarioDemo.nome,
        usuario: usuarioDemo.usuario,
        perfil: usuarioDemo.perfil
      }
    });
  } catch (error) {
    console.error("Erro no demo-login:", error);
    return responderErroDoBanco(res, error, "Erro interno no servidor.");
  }
});

module.exports = router;
