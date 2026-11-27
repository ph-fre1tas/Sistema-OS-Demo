const express = require("express");
const pool = require("../db/db");
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");
const { responderErroDoBanco } = require("../db/errosBanco");
const { ErroFerramentas, idValido, validarCadastro, consultaHistorico } = require("../services/ferramentasService");
const router = express.Router();
let estruturaPronta;

function garantirEstrutura() {
    if (!estruturaPronta) {
        estruturaPronta = pool.query(`
            CREATE TABLE IF NOT EXISTS ferramentas (
                id SERIAL PRIMARY KEY,
                tipo VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(tipo)) > 0),
                marca VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(marca)) > 0)
            );
            CREATE TABLE IF NOT EXISTS ferramentas_emprestimos (
                id SERIAL PRIMARY KEY,
                ferramenta_id INTEGER NOT NULL REFERENCES ferramentas(id),
                tipo VARCHAR(100) NOT NULL,
                marca VARCHAR(100) NOT NULL,
                funcionario_id INTEGER REFERENCES usuarios(id),
                funcionario_nome VARCHAR(255) NOT NULL,
                retirado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
                registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
                devolvido_em TIMESTAMPTZ,
                devolvido_por INTEGER REFERENCES usuarios(id),
                CHECK ((devolvido_em IS NULL) = (devolvido_por IS NULL))
            );
            ALTER TABLE ferramentas_emprestimos ALTER COLUMN funcionario_id DROP NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS ferramentas_um_emprestimo_aberto
                ON ferramentas_emprestimos(ferramenta_id) WHERE devolvido_em IS NULL;
            CREATE INDEX IF NOT EXISTS ferramentas_historico_data
                ON ferramentas_emprestimos(devolvido_em DESC, id DESC) WHERE devolvido_em IS NOT NULL;
        `).catch(erro => { estruturaPronta = null; throw erro; });
    }
    return estruturaPronta;
}

function tratarErro(res, erro) {
    if (erro instanceof ErroFerramentas) return res.status(400).json({ erro: erro.message });
    if (erro.code === "23505") return res.status(409).json({ erro: "Esta ferramenta já está emprestada. Atualize a lista." });
    console.error("Erro no controle de ferramentas:", erro);
    return responderErroDoBanco(res, erro, "Não foi possível concluir a operação de ferramentas.");
}

router.use(autenticarToken, permitirPerfis("admin", "almoxarifado"));
router.use(async (req, res, next) => {
    try { await garantirEstrutura(); next(); } catch (erro) { tratarErro(res, erro); }
});

router.get("/", async (req, res) => {
    try {
        const resultado = await pool.query(`SELECT f.*, NOT EXISTS (
            SELECT 1 FROM ferramentas_emprestimos m WHERE m.ferramenta_id = f.id AND m.devolvido_em IS NULL
        ) AS disponivel FROM ferramentas f ORDER BY f.id`);
        res.json(resultado.rows);
    } catch (erro) { tratarErro(res, erro); }
});

router.get("/funcionarios", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT id, nome FROM usuarios WHERE ativo = true ORDER BY LOWER(nome), id");
        res.json(resultado.rows);
    } catch (erro) { tratarErro(res, erro); }
});

router.post("/", async (req, res) => {
    try {
        const valores = validarCadastro(req.body);
        const resultado = await pool.query("INSERT INTO ferramentas (tipo, marca) VALUES ($1, $2) RETURNING *", valores);
        res.status(201).json({ ferramenta: resultado.rows[0] });
    } catch (erro) { tratarErro(res, erro); }
});

router.put("/:id", async (req, res) => {
    try {
        if (!idValido(req.params.id)) throw new ErroFerramentas("Número de identificação inválido.");
        const valores = validarCadastro(req.body);
        const resultado = await pool.query("UPDATE ferramentas SET tipo = $1, marca = $2 WHERE id = $3 RETURNING *", [...valores, req.params.id]);
        if (!resultado.rows.length) return res.status(404).json({ erro: "Ferramenta não encontrada." });
        res.json({ ferramenta: resultado.rows[0] });
    } catch (erro) { tratarErro(res, erro); }
});

router.get("/emprestimos", async (req, res) => {
    try {
        const resultado = await pool.query("SELECT * FROM ferramentas_emprestimos WHERE devolvido_em IS NULL ORDER BY retirado_em DESC, id DESC");
        res.json(resultado.rows);
    } catch (erro) { tratarErro(res, erro); }
});

router.post("/emprestimos", async (req, res) => {
    try {
        const { ferramentaId, funcionarioId, funcionarioNome } = req.body || {};
        const outro = funcionarioId === "OUTRO";
        if (!idValido(ferramentaId) || (!outro && !idValido(funcionarioId))) throw new ErroFerramentas("Selecione a ferramenta e o funcionário.");
        if (outro && (typeof funcionarioNome !== "string" || !funcionarioNome.trim() || funcionarioNome.trim().length > 120)) {
            throw new ErroFerramentas("Informe o nome de quem retirou, com até 120 caracteres.");
        }
        // Uma única instrução salva os nomes da época. O índice parcial impede retiradas simultâneas.
        const resultado = outro ? await pool.query(`INSERT INTO ferramentas_emprestimos
            (ferramenta_id, tipo, marca, funcionario_id, funcionario_nome, registrado_por)
            SELECT f.id, f.tipo, f.marca, NULL, $2, $3 FROM ferramentas f WHERE f.id = $1
            RETURNING *`, [ferramentaId, funcionarioNome.trim(), req.usuario.id]) : await pool.query(`INSERT INTO ferramentas_emprestimos
            (ferramenta_id, tipo, marca, funcionario_id, funcionario_nome, registrado_por)
            SELECT f.id, f.tipo, f.marca, u.id, u.nome, $3
            FROM ferramentas f CROSS JOIN usuarios u WHERE f.id = $1 AND u.id = $2 AND u.ativo = true
            RETURNING *`, [ferramentaId, funcionarioId, req.usuario.id]);
        if (!resultado.rows.length) return res.status(400).json({ erro: "Ferramenta inexistente ou funcionário inativo. Atualize a lista." });
        res.status(201).json({ emprestimo: resultado.rows[0] });
    } catch (erro) { tratarErro(res, erro); }
});

router.put("/emprestimos/:id/devolver", async (req, res) => {
    try {
        if (!idValido(req.params.id)) throw new ErroFerramentas("Empréstimo inválido.");
        const resultado = await pool.query(`UPDATE ferramentas_emprestimos
            SET devolvido_em = CURRENT_TIMESTAMP, devolvido_por = $2
            WHERE id = $1 AND devolvido_em IS NULL RETURNING *`, [req.params.id, req.usuario.id]);
        if (!resultado.rows.length) return res.status(409).json({ erro: "Empréstimo já devolvido ou não encontrado. Atualize a lista." });
        res.json({ emprestimo: resultado.rows[0] });
    } catch (erro) { tratarErro(res, erro); }
});

router.get("/historico", async (req, res) => {
    try {
        const consulta = consultaHistorico(req.query);
        const resultado = await pool.query(consulta.sql, consulta.valores);
        res.json({ registros: resultado.rows.slice(0, consulta.limite), pagina: consulta.pagina, temProxima: resultado.rows.length > consulta.limite });
    } catch (erro) { tratarErro(res, erro); }
});

module.exports = router;
