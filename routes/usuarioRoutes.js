/*
    usuarioRoutes.js
    --------------------------------------------------
    Rotas relacionadas ao gerenciamento de usuários.

    Este arquivo é usado pelo painel do administrador para:

    - Listar usuários cadastrados;
    - Criar novos usuários;
    - Desativar usuários;
    - Reativar usuários;
    - Alterar senha;
    - Alterar perfil.

    Todas as rotas deste arquivo exigem:
    - Token válido;
    - Perfil de administrador.
*/

const express = require("express");
const bcrypt = require("bcryptjs");
const pool = require("../db/db");
const { responderErroDoBanco } = require("../db/errosBanco");
const {
  idValido = (valor) => ["string", "number"].includes(typeof valor)
    && /^(?:[1-9]\d*)$/.test(String(valor))
    && Number.isSafeInteger(Number(valor))
    && Number(valor) <= 2147483647
} = require("../services/ferramentasService") || {};
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");

const router = express.Router();

function obterBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

/*
    GET /api/usuarios
    --------------------------------------------------
    Lista todos os usuários cadastrados.

    Não retorna senha_hash por segurança.
*/
router.get(
  "/",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      const resultado = await pool.query(
        `
        SELECT id, nome, usuario, email, perfil, ativo, areas_notificacao_email
        FROM usuarios
        ORDER BY id ASC
        `
      );

      res.json(resultado.rows);
    } catch (error) {
      console.error("Erro ao listar usuários:", error);
      responderErroDoBanco(res, error, "Erro ao listar usuários.");
    }
  }
);

router.put(
  "/:id/notificacoes-email",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ erro: "ID de usuário inválido." });
    }

    const areasPermitidas = ["Máquinas", "Máquinas de costura", "Manutenção Civil", "Metalúrgica"];
    const { areas } = obterBody(req);

    if (!Array.isArray(areas) || areas.some((area) => typeof area !== "string" || !areasPermitidas.includes(area))) {
      return res.status(400).json({ erro: "Seleção de áreas inválida." });
    }

    try {
      const resultado = await pool.query(
        `UPDATE usuarios
         SET areas_notificacao_email = $1::text[]
         WHERE id = $2
         RETURNING id, nome, email, areas_notificacao_email`,
        [Array.from(new Set(areas)), req.params.id]
      );

      if (!resultado.rows.length) return res.status(404).json({ erro: "Usuário não encontrado." });
      res.json({ mensagem: "Preferências de e-mail atualizadas.", usuario: resultado.rows[0] });
    } catch (error) {
      console.error("Erro ao alterar preferências de e-mail:", error);
      responderErroDoBanco(res, error, "Erro ao alterar preferências de e-mail.");
    }
  }
);

router.put(
  "/:id/email",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      if (!idValido(req.params.id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      const body = obterBody(req);
      if (body.email !== undefined && body.email !== null && typeof body.email !== "string") {
        return res.status(400).json({ erro: "Informe um e-mail válido." });
      }

      const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
      if (email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254)) {
        return res.status(400).json({ erro: "Informe um e-mail válido." });
      }

      if (email) {
        const emailExistente = await pool.query("SELECT id FROM usuarios WHERE LOWER(email) = $1 AND id <> $2", [email, req.params.id]);
        if (emailExistente.rows.length) return res.status(400).json({ erro: "Já existe um usuário com esse e-mail." });
      }

      const resultado = await pool.query(
        "UPDATE usuarios SET email = $1 WHERE id = $2 RETURNING id, nome, usuario, email, perfil, ativo",
        [email || null, req.params.id]
      );
      if (!resultado.rows.length) return res.status(404).json({ erro: "Usuário não encontrado." });
      res.json({ mensagem: "E-mail atualizado com sucesso.", usuario: resultado.rows[0] });
    } catch (error) {
      console.error("Erro ao alterar e-mail:", error);
      responderErroDoBanco(res, error, "Erro ao alterar e-mail.");
    }
  }
);

/*
    POST /api/usuarios
    --------------------------------------------------
    Cria um novo usuário.

    Campos esperados:
    - nome
    - usuario
    - senha
    - perfil
*/
router.post(
  "/",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      const { nome, usuario, senha, perfil, email } = obterBody(req);

      // Validação inicial: todos os campos são obrigatórios.
      if (
        typeof nome !== "string"
        || typeof usuario !== "string"
        || typeof senha !== "string"
        || typeof perfil !== "string"
        || !nome
        || !usuario
        || !senha
        || !perfil
      ) {
        return res.status(400).json({
          erro: "Nome, usuário, senha e perfil são obrigatórios."
        });
      }

      if (email !== undefined && email !== null && typeof email !== "string") {
        return res.status(400).json({ erro: "Informe um e-mail válido." });
      }

      // Remove espaços extras antes e depois dos textos.
      const nomeLimpo = nome.trim();
      const usuarioLimpo = usuario.trim();
      const senhaLimpa = senha.trim();
      const emailLimpo = typeof email === "string" ? email.trim().toLowerCase() : "";

      if (!nomeLimpo || !usuarioLimpo || !senhaLimpa || !perfil) {
        return res.status(400).json({
          erro: "Nome, usuário, senha e perfil são obrigatórios."
        });
      }

      // Mantém a senha mínima igual à rota de alteração de senha.
      if (senhaLimpa.length < 4) {
        return res.status(400).json({
          erro: "A senha precisa ter pelo menos 4 caracteres."
        });
      }

      const perfisPermitidos = ["admin", "lider", "manutentor", "compras", "almoxarifado"];

      if (!perfisPermitidos.includes(perfil)) {
        return res.status(400).json({
          erro: "Perfil inválido."
        });
      }

      if (emailLimpo && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLimpo) || emailLimpo.length > 254)) {
        return res.status(400).json({ erro: "Informe um e-mail válido." });
      }

      // Verifica se já existe outro usuário com o mesmo login.
      const usuarioExistente = await pool.query(
        `
        SELECT id
        FROM usuarios
        WHERE usuario = $1
        `,
        [usuarioLimpo]
      );

      if (usuarioExistente.rows.length > 0) {
        return res.status(400).json({
          erro: "Já existe um usuário com esse login."
        });
      }

      if (emailLimpo) {
        const emailExistente = await pool.query("SELECT id FROM usuarios WHERE LOWER(email) = $1", [emailLimpo]);
        if (emailExistente.rows.length > 0) {
          return res.status(400).json({ erro: "Já existe um usuário com esse e-mail." });
        }
      }

      // Criptografa a senha antes de salvar no banco.
      const senhaHash = await bcrypt.hash(senhaLimpa, 10);

      const resultado = await pool.query(
        `
        INSERT INTO usuarios (nome, usuario, senha_hash, perfil, email, ativo)
        VALUES ($1, $2, $3, $4, $5, true)
        RETURNING id, nome, usuario, email, perfil, ativo
        `,
        [nomeLimpo, usuarioLimpo, senhaHash, perfil, emailLimpo || null]
      );

      res.status(201).json({
        mensagem: "Usuário criado com sucesso.",
        usuario: resultado.rows[0]
      });
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      responderErroDoBanco(res, error, "Erro ao criar usuário.");
    }
  }
);

/*
    PUT /api/usuarios/:id/desativar
    --------------------------------------------------
    Desativa um usuário.

    A rota impede que o administrador desative o próprio usuário.
*/
router.put(
  "/:id/desativar",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      // Evita que o admin bloqueie o próprio acesso.
      if (Number(id) === Number(req.usuario.id)) {
        return res.status(400).json({
          erro: "Você não pode desativar seu próprio usuário."
        });
      }

      const resultado = await pool.query(
        `
        UPDATE usuarios
        SET ativo = false
        WHERE id = $1
        RETURNING id, nome, usuario, perfil, ativo
        `,
        [id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({
          erro: "Usuário não encontrado."
        });
      }

      res.json({
        mensagem: "Usuário desativado com sucesso.",
        usuario: resultado.rows[0]
      });
    } catch (error) {
      console.error("Erro ao desativar usuário:", error);
      responderErroDoBanco(res, error, "Erro ao desativar usuário.");
    }
  }
);

/*
    PUT /api/usuarios/:id/ativar
    --------------------------------------------------
    Reativa um usuário inativo.
*/
router.put(
  "/:id/ativar",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      const resultado = await pool.query(
        `
        UPDATE usuarios
        SET ativo = true
        WHERE id = $1
        RETURNING id, nome, usuario, perfil, ativo
        `,
        [id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({
          erro: "Usuário não encontrado."
        });
      }

      res.json({
        mensagem: "Usuário ativado com sucesso.",
        usuario: resultado.rows[0]
      });
    } catch (error) {
      console.error("Erro ao ativar usuário:", error);
      responderErroDoBanco(res, error, "Erro ao ativar usuário.");
    }
  }
);

/*
    PUT /api/usuarios/:id/senha
    --------------------------------------------------
    Altera a senha de um usuário.

    A nova senha é criptografada antes de ser salva.
*/
router.put(
  "/:id/senha",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      const { novaSenha } = obterBody(req);

      if (typeof novaSenha !== "string" || novaSenha.trim() === "") {
        return res.status(400).json({
          erro: "A nova senha é obrigatória."
        });
      }

      const novaSenhaLimpa = novaSenha.trim();

      if (novaSenhaLimpa.length < 4) {
        return res.status(400).json({
          erro: "A senha precisa ter pelo menos 4 caracteres."
        });
      }

      const senhaHash = await bcrypt.hash(novaSenhaLimpa, 10);

      const resultado = await pool.query(
        `
        UPDATE usuarios
        SET senha_hash = $1
        WHERE id = $2
        RETURNING id, nome, usuario, perfil, ativo
        `,
        [senhaHash, id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({
          erro: "Usuário não encontrado."
        });
      }

      res.json({
        mensagem: "Senha alterada com sucesso.",
        usuario: resultado.rows[0]
      });
    } catch (error) {
      console.error("Erro ao alterar senha:", error);
      responderErroDoBanco(res, error, "Erro ao alterar senha.");
    }
  }
);

/*
    PUT /api/usuarios/:id/perfil
    --------------------------------------------------
    Altera o perfil de um usuário.

    Também impede que o admin remova o próprio perfil de administrador.
*/
router.put(
  "/:id/perfil",
  autenticarToken,
  permitirPerfis("admin"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "ID de usuário inválido." });
      }

      const { perfil } = obterBody(req);

      const perfisPermitidos = ["admin", "lider", "manutentor", "compras", "almoxarifado"];

      if (typeof perfil !== "string" || !perfisPermitidos.includes(perfil)) {
        return res.status(400).json({
          erro: "Perfil inválido."
        });
      }

      // Evita que o admin tire o próprio acesso administrativo.
      if (Number(id) === Number(req.usuario.id) && perfil !== "admin") {
        return res.status(400).json({
          erro: "Você não pode remover seu próprio perfil de admin."
        });
      }

      const resultado = await pool.query(
        `
        UPDATE usuarios
        SET perfil = $1
        WHERE id = $2
        RETURNING id, nome, usuario, email, perfil, ativo
        `,
        [perfil, id]
      );

      if (resultado.rows.length === 0) {
        return res.status(404).json({
          erro: "Usuário não encontrado."
        });
      }

      res.json({
        mensagem: "Perfil alterado com sucesso.",
        usuario: resultado.rows[0]
      });
    } catch (error) {
      console.error("Erro ao alterar perfil:", error);
      responderErroDoBanco(res, error, "Erro ao alterar perfil.");
    }
  }
);

module.exports = router;
