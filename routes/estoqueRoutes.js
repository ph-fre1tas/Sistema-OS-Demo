/* Rotas do controle de estoque. Os produtos e suas movimentações são
   compartilhados por toda a equipe e ficam vinculados ao usuário logado. */

const express = require("express");
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
// A estrutura e criada sob demanda e reutilizada nas requisicoes seguintes do processo.
let estruturaPronta;

async function garantirEstrutura() {
  if (!estruturaPronta) {
    estruturaPronta = pool.query(`
      CREATE TABLE IF NOT EXISTS estoque_produtos (
        id SERIAL PRIMARY KEY,
        descricao VARCHAR(160) NOT NULL,
        unidade VARCHAR(40) NOT NULL,
        estoque_atual NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estoque_atual >= 0),
        estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX IF NOT EXISTS estoque_produtos_descricao_unica
        ON estoque_produtos (LOWER(descricao));
      CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
        id SERIAL PRIMARY KEY,
        produto_id INTEGER NOT NULL REFERENCES estoque_produtos(id),
        tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
        quantidade NUMERIC(12,2) NOT NULL CHECK (quantidade > 0),
        usuario_id INTEGER REFERENCES usuarios(id),
        usuario_nome VARCHAR(120) NOT NULL,
        criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        cancelada_em TIMESTAMP,
        cancelada_por_id INTEGER REFERENCES usuarios(id),
        cancelada_por_nome VARCHAR(120)
      );
      ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS cancelada_em TIMESTAMP;
      ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS cancelada_por_id INTEGER REFERENCES usuarios(id);
      ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS cancelada_por_nome VARCHAR(120);
      ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS recebedor_tipo VARCHAR(10);
      ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS recebedor_nome VARCHAR(120);
      ALTER TABLE estoque_movimentacoes ADD COLUMN IF NOT EXISTS recebedor_usuario_id INTEGER REFERENCES usuarios(id);
      CREATE INDEX IF NOT EXISTS estoque_movimentacoes_produto_data
        ON estoque_movimentacoes (produto_id, criado_em DESC);
    `).catch((erro) => {
      estruturaPronta = null;
      throw erro;
    });
  }
  return estruturaPronta;
}

router.use(autenticarToken, permitirPerfis("admin", "almoxarifado", "manutentor", "compras"));
router.use(async (req, res, next) => {
  try {
    await garantirEstrutura();
    next();
  } catch (erro) {
    console.error("Erro ao preparar tabelas de estoque:", erro);
    responderErroDoBanco(res, erro, "Não foi possível preparar o controle de estoque.");
  }
});

router.get("/produtos", async (req, res) => {
  try {
    const resultado = await pool.query(`
      -- Consumo mensal usa as saidas dos ultimos 180 dias, conforme a previsao da tela.
      WITH consumo AS (
        SELECT produto_id,
          COALESCE(SUM(quantidade) FILTER (
            WHERE tipo = 'SAIDA'
              AND cancelada_em IS NULL
              AND criado_em >= CURRENT_TIMESTAMP - INTERVAL '180 days'
          ), 0) / 6 AS consumo_mensal
        FROM estoque_movimentacoes
        GROUP BY produto_id
      )
      SELECT p.id, p.descricao, p.unidade, p.estoque_atual, p.estoque_minimo, p.criado_em,
        COALESCE(c.consumo_mensal, 0) AS consumo_mensal,
        CASE WHEN COALESCE(c.consumo_mensal, 0) > 0
          THEN FLOOR(p.estoque_atual / (c.consumo_mensal / 30))
          ELSE NULL END AS dias_restantes
      FROM estoque_produtos p
      LEFT JOIN consumo c ON c.produto_id = p.id
      ORDER BY LOWER(p.descricao)
    `);
    res.json(resultado.rows);
  } catch (erro) {
    console.error("Erro ao listar produtos:", erro);
    responderErroDoBanco(res, erro, "Erro ao listar produtos.");
  }
});

router.get("/retiradas", permitirPerfis("admin", "almoxarifado", "compras"), async (req, res) => {
  const { prepararConsultaRetiradas, ErroConsultaRetiradas } = require("../services/estoqueRelatorioService");
  try {
    const consulta = prepararConsultaRetiradas(req.query);
    const resultado = await pool.query(consulta.sql, consulta.valores);
    res.json({ retiradas: resultado.rows.slice(0, consulta.limite), pagina: consulta.pagina,
      temProxima: resultado.rows.length > consulta.limite });
  } catch (erro) {
    if (erro instanceof ErroConsultaRetiradas) return res.status(400).json({ erro: erro.message });
    responderErroDoBanco(res, erro, "Erro ao consultar retiradas do estoque.");
  }
});

router.get("/retiradas/pdf", permitirPerfis("admin", "almoxarifado", "compras"), async (req, res) => {
  const { prepararConsultaRetiradas, ErroConsultaRetiradas } = require("../services/estoqueRelatorioService");
  const { gerarEstoqueRelatorioPdf } = require("../services/estoqueRelatorioPdfService");
  try {
    // Uma consulta única mantém resumo e listagem consistentes, incluindo todas as páginas.
    const consulta = prepararConsultaRetiradas(req.query, { paginar: false });
    const resultado = await pool.query(consulta.sql, consulta.valores);
    const buffer = await gerarEstoqueRelatorioPdf(resultado.rows, consulta.filtros);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="Relatorio_Retiradas_Estoque.pdf"');
    res.setHeader("Cache-Control", "no-store");
    res.send(buffer);
  } catch (erro) {
    if (erro instanceof ErroConsultaRetiradas) return res.status(400).json({ erro: erro.message });
    responderErroDoBanco(res, erro, "Não foi possível gerar o PDF de retiradas do estoque.");
  }
});

router.get("/recebedores", async (req, res) => {
  try {
    const perfil = req.query.perfil === "manutentor" ? "manutentor" : null;
    const resultado = await pool.query(
      `SELECT id, nome FROM usuarios
       WHERE ativo = true AND (
         $1::text IS NULL
         OR perfil = $1
         OR ($1 = 'manutentor' AND id = 2)
       )
       ORDER BY LOWER(nome), id`,
      [perfil]
    );
    res.json(resultado.rows);
  } catch (erro) {
    responderErroDoBanco(res, erro, "Erro ao listar recebedores.");
  }
});

router.get("/movimentacoes", async (req, res) => {
  try {
    const resultado = await pool.query(`
      SELECT m.id, m.tipo, m.quantidade, m.usuario_nome, m.criado_em,
        m.recebedor_tipo, m.recebedor_nome, m.recebedor_usuario_id,
        m.cancelada_em, m.cancelada_por_id, m.cancelada_por_nome,
        p.descricao AS produto_descricao, p.unidade
      FROM estoque_movimentacoes m
      JOIN estoque_produtos p ON p.id = m.produto_id
      ORDER BY COALESCE(m.cancelada_em, m.criado_em) DESC, m.id DESC
      LIMIT 20
    `);
    res.json(resultado.rows);
  } catch (erro) {
    console.error("Erro ao listar movimentações:", erro);
    responderErroDoBanco(res, erro, "Erro ao listar movimentações.");
  }
});

router.post("/produtos", permitirPerfis("admin", "almoxarifado", "compras"), async (req, res) => {
  try {
    const { descricao, unidade, estoqueMinimo = 0 } = obterBody(req);
    if (typeof descricao !== "string" || typeof unidade !== "string" || typeof estoqueMinimo === "boolean" || Array.isArray(estoqueMinimo)) {
      return res.status(400).json({ erro: "Informe descrição, unidade e estoque mínimo válidos." });
    }
    const descricaoLimpa = descricao.trim();
    const unidadeLimpa = unidade.trim().toUpperCase();
    const minimo = Number(estoqueMinimo);
    if (!descricaoLimpa || !unidadeLimpa || descricaoLimpa.length > 160 || unidadeLimpa.length > 40 || String(estoqueMinimo).trim() === "" || !Number.isFinite(minimo) || !Number.isInteger(minimo) || minimo < 0) {
      return res.status(400).json({ erro: "Informe descrição, unidade e estoque mínimo válidos." });
    }
    const resultado = await pool.query(
      `INSERT INTO estoque_produtos (descricao, unidade, estoque_minimo) VALUES ($1, $2, $3) RETURNING *`,
      [descricaoLimpa, unidadeLimpa, minimo]
    );
    res.status(201).json({ mensagem: "Produto cadastrado com sucesso.", produto: resultado.rows[0] });
  } catch (erro) {
    if (erro.code === "23505") return res.status(400).json({ erro: "Já existe um produto com essa descrição." });
    console.error("Erro ao cadastrar produto:", erro);
    responderErroDoBanco(res, erro, "Erro ao cadastrar produto.");
  }
});

router.put("/produtos/:id", permitirPerfis("admin", "almoxarifado", "compras"), async (req, res) => {
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "Produto inválido." });
    const { descricao, unidade, estoqueMinimo } = obterBody(req);
    if (descricao !== undefined && typeof descricao !== "string") return res.status(400).json({ erro: "Informe um nome de produto com até 160 caracteres." });
    if (unidade !== undefined && typeof unidade !== "string") return res.status(400).json({ erro: "Informe uma unidade válida." });
    const descricaoLimpa = descricao === undefined ? null : descricao.trim();
    const unidadeLimpa = unidade === undefined ? null : unidade.trim().toUpperCase();
    if (descricaoLimpa !== null && (!descricaoLimpa || descricaoLimpa.length > 160)) return res.status(400).json({ erro: "Informe um nome de produto com até 160 caracteres." });
    if (unidadeLimpa !== null && (!unidadeLimpa || unidadeLimpa.length > 40)) return res.status(400).json({ erro: "Informe uma unidade válida." });
    if (typeof estoqueMinimo === "boolean" || typeof estoqueMinimo === "object") return res.status(400).json({ erro: "Estoque mínimo deve ser um número inteiro igual ou maior que zero." });
    const minimo = Number(estoqueMinimo);
    if (String(estoqueMinimo ?? "").trim() === "" || !Number.isFinite(minimo) || !Number.isInteger(minimo) || minimo < 0 || minimo > 9999999999.99) return res.status(400).json({ erro: "Estoque mínimo deve ser um número inteiro igual ou maior que zero." });
    const resultado = await pool.query(
      `UPDATE estoque_produtos SET estoque_minimo = $1, descricao = COALESCE($3, descricao), unidade = COALESCE($4, unidade), atualizado_em = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *`,
      [minimo, req.params.id, descricaoLimpa, unidadeLimpa]
    );
    if (!resultado.rows.length) return res.status(404).json({ erro: "Produto não encontrado." });
    res.json({ mensagem: "Produto atualizado com sucesso.", produto: resultado.rows[0] });
  } catch (erro) {
    if (erro.code === "23505") return res.status(400).json({ erro: "Já existe um produto com essa descrição." });
    console.error("Erro ao atualizar produto:", erro);
    responderErroDoBanco(res, erro, "Erro ao atualizar produto.");
  }
});

router.delete("/produtos/:id", permitirPerfis("admin", "almoxarifado", "compras"), async (req, res) => {
  let cliente;
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "Produto inválido." });
    cliente = await pool.connect();
    await cliente.query("BEGIN");
    await cliente.query("DELETE FROM estoque_movimentacoes WHERE produto_id = $1", [req.params.id]);
    const resultado = await cliente.query("DELETE FROM estoque_produtos WHERE id = $1 RETURNING id", [req.params.id]);
    if (!resultado.rows.length) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ erro: "Produto não encontrado." });
    }
    await cliente.query("COMMIT");
    res.json({ mensagem: "Produto excluído com sucesso." });
  } catch (erro) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    console.error("Erro ao excluir produto:", erro);
    responderErroDoBanco(res, erro, "Erro ao excluir produto.");
  } finally {
    if (cliente) cliente.release();
  }
});

router.post("/produtos/:id/movimentacoes", async (req, res) => {
  let cliente;
  try {
    if (!idValido(req.params.id)) return res.status(400).json({ erro: "Produto inválido." });
    const body = obterBody(req);
    const tipo = typeof body.tipo === "string" ? body.tipo.trim().toUpperCase() : "";
    const quantidade = typeof body.quantidade === "boolean" || Array.isArray(body.quantidade) ? NaN : Number(body.quantidade);
    if (!['ENTRADA', 'SAIDA'].includes(tipo) || String(body.quantidade ?? "").trim() === "" || !Number.isFinite(quantidade) || !Number.isInteger(quantidade) || quantidade <= 0) {
      return res.status(400).json({ erro: "Informe uma quantidade inteira maior que zero." });
    }
    let recebedorTipo = null;
    let recebedorNome = null;
    let recebedorUsuarioId = null;
    if (tipo === "SAIDA") {
      recebedorTipo = body.recebedorTipo;
      if (!["EU_MESMO", "OUTRA", "USUARIO"].includes(recebedorTipo)) {
        return res.status(400).json({ erro: "Selecione quem recebeu o material." });
      }
      // Identidade da própria conta vem exclusivamente da autenticação.
      recebedorNome = recebedorTipo === "EU_MESMO"
        ? req.usuario.nome
        : (typeof body.recebedorNome === "string" ? body.recebedorNome.trim() : "");
      if (recebedorTipo !== "USUARIO" && (!recebedorNome || recebedorNome.length > 120)) {
        return res.status(400).json({ erro: "Informe o nome de quem recebeu, com até 120 caracteres." });
      }
      recebedorUsuarioId = recebedorTipo === "EU_MESMO" ? req.usuario.id : null;
      if (recebedorTipo === "USUARIO") {
        if (!idValido(body.recebedorUsuarioId)) {
          return res.status(400).json({ erro: "Selecione um usuário válido." });
        }
        recebedorUsuarioId = Number(body.recebedorUsuarioId);
      }
    }
    cliente = await pool.connect();
    // O bloqueio da linha evita que duas movimentacoes concorrentes calculem o mesmo saldo.
    await cliente.query("BEGIN");
    if (recebedorTipo === "USUARIO") {
      const recebedor = await cliente.query("SELECT id, nome FROM usuarios WHERE id = $1 AND ativo = true FOR SHARE", [recebedorUsuarioId]);
      if (!recebedor.rows.length) {
        await cliente.query("ROLLBACK");
        return res.status(400).json({ erro: "Usuário indisponível. Selecione outro recebedor." });
      }
      recebedorNome = recebedor.rows[0].nome;
    }
    const produto = await cliente.query("SELECT * FROM estoque_produtos WHERE id = $1 FOR UPDATE", [req.params.id]);
    if (!produto.rows.length) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ erro: "Produto não encontrado." });
    }
    const saldo = Number(produto.rows[0].estoque_atual);
    if (tipo === 'SAIDA' && quantidade > saldo) {
      await cliente.query("ROLLBACK");
      return res.status(400).json({ erro: `A saída solicitada é maior que o saldo atual (${saldo}).` });
    }
    const variacao = tipo === 'ENTRADA' ? quantidade : -quantidade;
    const atualizado = await cliente.query(
      "UPDATE estoque_produtos SET estoque_atual = estoque_atual + $1, atualizado_em = CURRENT_TIMESTAMP WHERE id = $2 RETURNING *",
      [variacao, req.params.id]
    );
    await cliente.query(
      `INSERT INTO estoque_movimentacoes (produto_id, tipo, quantidade, usuario_id, usuario_nome,
        recebedor_tipo, recebedor_nome, recebedor_usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [req.params.id, tipo, quantidade, req.usuario.id, req.usuario.nome,
        recebedorTipo, recebedorNome, recebedorUsuarioId]
    );
    await cliente.query("COMMIT");
    res.status(201).json({ mensagem: "Movimentação registrada com sucesso.", produto: atualizado.rows[0] });
  } catch (erro) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    console.error("Erro ao movimentar estoque:", erro);
    responderErroDoBanco(res, erro, "Erro ao registrar movimentação.");
  } finally {
    if (cliente) cliente.release();
  }
});

router.patch("/movimentacoes/:id/cancelar", permitirPerfis("admin", "almoxarifado", "compras"), async (req, res) => {
  if (!idValido(req.params.id)) {
    return res.status(400).json({ erro: "Movimentação inválida." });
  }
  const movimentacaoId = Number(req.params.id);

  let cliente;
  try {
    cliente = await pool.connect();
    await cliente.query("BEGIN");

    // A movimentacao e o produto ficam bloqueados ate a reversao terminar, evitando saldo duplicado.
    const resultado = await cliente.query(
      `SELECT m.id, m.produto_id, m.tipo, m.quantidade, m.cancelada_em,
        p.estoque_atual, p.descricao
       FROM estoque_movimentacoes m
       JOIN estoque_produtos p ON p.id = m.produto_id
       WHERE m.id = $1
       FOR UPDATE OF m, p`,
      [movimentacaoId]
    );

    if (!resultado.rows.length) {
      await cliente.query("ROLLBACK");
      return res.status(404).json({ erro: "Movimentação não encontrada." });
    }

    const movimentacao = resultado.rows[0];
    if (movimentacao.cancelada_em) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({ erro: "Esta movimentação já foi cancelada." });
    }

    const quantidade = Number(movimentacao.quantidade);
    const saldoAtual = Number(movimentacao.estoque_atual);
    const variacao = movimentacao.tipo === "SAIDA" ? quantidade : -quantidade;

    if (movimentacao.tipo === "ENTRADA" && quantidade > saldoAtual) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({
        erro: `Não é possível cancelar esta entrada porque o saldo atual de ${movimentacao.descricao} é ${saldoAtual}.`
      });
    }

    await cliente.query(
      `UPDATE estoque_produtos
       SET estoque_atual = estoque_atual + $1, atualizado_em = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [variacao, movimentacao.produto_id]
    );

    await cliente.query(
      `UPDATE estoque_movimentacoes
       SET cancelada_em = CURRENT_TIMESTAMP,
           cancelada_por_id = $1,
           cancelada_por_nome = $2
       WHERE id = $3`,
      [req.usuario.id, req.usuario.nome, movimentacao.id]
    );

    await cliente.query("COMMIT");
    return res.json({ mensagem: "Movimentação cancelada e saldo revertido com sucesso." });
  } catch (erro) {
    if (cliente) await cliente.query("ROLLBACK").catch(() => {});
    console.error("Erro ao cancelar movimentação:", erro);
    return responderErroDoBanco(res, erro, "Erro ao cancelar movimentação.");
  } finally {
    if (cliente) cliente.release();
  }
});

module.exports = router;
