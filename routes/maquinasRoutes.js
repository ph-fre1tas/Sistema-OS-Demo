const express = require("express");
const pool = require("../db/db");
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");
const { responderErroDoBanco } = require("../db/errosBanco");
const { ErroMaquinas, validarCadastro } = require("../services/maquinasService");

const router = express.Router();
let estruturaPronta;

function garantirEstrutura() {
    if (!estruturaPronta) {
        estruturaPronta = pool.query(`
            CREATE TABLE IF NOT EXISTS maquinas (
                id SERIAL PRIMARY KEY,
                codigo VARCHAR(60) NOT NULL CHECK (LENGTH(TRIM(codigo)) > 0),
                nome VARCHAR(160) NOT NULL CHECK (LENGTH(TRIM(nome)) > 0),
                setor VARCHAR(120) NOT NULL DEFAULT '',
                marca VARCHAR(100) NOT NULL DEFAULT '',
                modelo VARCHAR(100) NOT NULL DEFAULT '',
                observacoes TEXT NOT NULL DEFAULT '',
                foto VARCHAR(500),
                criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
            CREATE UNIQUE INDEX IF NOT EXISTS maquinas_codigo_unico
                ON maquinas (LOWER(codigo));
        `).catch(erro => { estruturaPronta = null; throw erro; });
    }
    return estruturaPronta;
}

function tratarErro(res, erro) {
    if (erro instanceof ErroMaquinas) return res.status(400).json({ erro: erro.message });
    if (erro.code === "23505") return res.status(409).json({ erro: "Já existe uma máquina com esse ID." });
    console.error("Erro no cadastro de máquinas:", erro);
    return responderErroDoBanco(res, erro, "Não foi possível concluir a operação de máquinas.");
}

router.use(autenticarToken);
router.use(async (req, res, next) => {
    try { await garantirEstrutura(); next(); } catch (erro) { tratarErro(res, erro); }
});

router.get("/", permitirPerfis("admin", "almoxarifado", "manutentor"), async (_req, res) => {
    try {
        const resultado = await pool.query(`SELECT id, codigo, nome, setor, marca, modelo, foto
            FROM maquinas ORDER BY LOWER(nome), LOWER(codigo)`);
        res.json(resultado.rows);
    } catch (erro) { tratarErro(res, erro); }
});

router.get("/:codigo", permitirPerfis("admin", "almoxarifado", "manutentor"), async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM maquinas WHERE LOWER(codigo) = LOWER($1)", [req.params.codigo]);
        if (!resultado.rows.length) return res.status(404).json({ erro: "Máquina não encontrada." });
        res.json(resultado.rows[0]);
    } catch (erro) { tratarErro(res, erro); }
});

router.post("/", permitirPerfis("admin", "almoxarifado"), async (req, res) => {
    try {
        const valores = validarCadastro(req.body);
        const resultado = await pool.query(`INSERT INTO maquinas
            (codigo, nome, setor, marca, modelo, observacoes, foto)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`, valores);
        res.status(201).json({ maquina: resultado.rows[0] });
    } catch (erro) { tratarErro(res, erro); }
});

router.put("/:codigo", permitirPerfis("admin", "almoxarifado"), async (req, res) => {
    try {
        const valores = validarCadastro(req.body);
        const resultado = await pool.query(`UPDATE maquinas SET
            codigo = $1, nome = $2, setor = $3, marca = $4, modelo = $5,
            observacoes = $6, foto = $7, atualizado_em = CURRENT_TIMESTAMP
            WHERE LOWER(codigo) = LOWER($8) RETURNING *`, [...valores, req.params.codigo]);
        if (!resultado.rows.length) return res.status(404).json({ erro: "Máquina não encontrada." });
        res.json({ maquina: resultado.rows[0] });
    } catch (erro) { tratarErro(res, erro); }
});

module.exports = router;
