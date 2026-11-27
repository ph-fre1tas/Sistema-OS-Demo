const express = require("express");
const pool = require("../db/db");
const { responderErroDoBanco } = require("../db/errosBanco");
const {
  idValido = (valor) => ["string", "number"].includes(typeof valor)
    && /^(?:[1-9]\d*)$/.test(String(valor))
    && Number.isSafeInteger(Number(valor))
    && Number(valor) <= 2147483647
} = require("../services/ferramentasService") || {};
const { autenticarToken } = require("../middleware/authmiddleware");

const router = express.Router();

router.use(autenticarToken);

router.get("/", async (req, res) => {
  try {
    const resultado = await pool.query(
      `
        SELECT id, tipo, titulo, mensagem, url, lida, criada_em
        FROM notificacoes
        WHERE usuario_id = $1
        ORDER BY lida ASC, criada_em DESC
        LIMIT 30
      `,
      [req.usuario.id]
    );
    res.json(resultado.rows);
  } catch (erro) {
    console.error("Erro ao listar notificações:", erro);
    responderErroDoBanco(res, erro, "Não foi possível carregar as notificações.");
  }
});

router.put("/:id/lida", async (req, res) => {
  try {
    if (!idValido(req.params.id)) {
      return res.status(400).json({ erro: "Notificação inválida." });
    }
    const resultado = await pool.query(
      "UPDATE notificacoes SET lida = true WHERE id = $1 AND usuario_id = $2 RETURNING id",
      [req.params.id, req.usuario.id]
    );
    if (!resultado.rows.length) return res.status(404).json({ erro: "Notificação não encontrada." });
    res.json({ mensagem: "Notificação marcada como lida." });
  } catch (erro) {
    console.error("Erro ao atualizar notificação:", erro);
    responderErroDoBanco(res, erro, "Não foi possível atualizar a notificação.");
  }
});

router.put("/ler-todas", async (req, res) => {
  try {
    await pool.query("UPDATE notificacoes SET lida = true WHERE usuario_id = $1 AND lida = false", [req.usuario.id]);
    res.json({ mensagem: "Notificações marcadas como lidas." });
  } catch (erro) {
    console.error("Erro ao marcar notificações como lidas:", erro);
    responderErroDoBanco(res, erro, "Não foi possível atualizar as notificações.");
  }
});

module.exports = router;
