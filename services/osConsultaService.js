const pool = require("../db/db");

const COLUNAS_DATA_RELATORIO = Object.freeze({
  criacao: "os.data_criacao",
  inicio: "os.data_inicio",
  conclusao: "os.data_conclusao",
  cancelamento: "os.data_cancelamento"
});

const CAMPOS_PAUSAS_JSON = `
  COALESCE(
    (
      SELECT json_agg(
        json_build_object(
          'id', op.id,
          'tipo_pausa', op.tipo_pausa,
          'motivo', op.motivo,
          'pausado_por_id', op.pausado_por_id,
          'pausado_por_nome', op.pausado_por_nome,
          'data_inicio_pausa', op.data_inicio_pausa,
          'data_fim_pausa', op.data_fim_pausa,
          'retomado_por_id', op.retomado_por_id,
          'retomado_por_nome', op.retomado_por_nome
        )
        ORDER BY op.data_inicio_pausa ASC
      )
      FROM os_pausas op
      WHERE op.ordem_servico_id = os.id
    ),
    '[]'::json
  ) AS pausas
`;

async function buscarOSCompletaPorId(id) {
  const resultado = await pool.query(
    `
      SELECT
        os.*,
        ${CAMPOS_PAUSAS_JSON}
      FROM ordens_servico os
      WHERE os.id = $1
      LIMIT 1
    `,
    [id]
  );

  return resultado.rows[0] || null;
}

async function buscarOSParaRelatorio(filtros) {
  const colunaData = COLUNAS_DATA_RELATORIO[filtros.dataReferencia];

  if (!colunaData) {
    throw new Error("Data de referência inválida para a consulta.");
  }

  const valores = [filtros.status];
  let query = `
    SELECT os.*
    FROM ordens_servico os
    WHERE os.status = ANY($1::text[])
      AND ${colunaData} IS NOT NULL
  `;

  if (filtros.prioridade !== "Todas") {
    valores.push(filtros.prioridade);
    query += ` AND os.prioridade = $${valores.length}`;
  }

  if (filtros.busca) {
    valores.push(`%${filtros.busca.replace(/[\\%_]/g, "\\$&")}%`);
    const parametroBusca = `$${valores.length}`;
    query += ` AND (
      os.id::text ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.maquina ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.maquina_id ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.setor ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.solicitante ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.manutentor_responsavel_nome ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.concluido_por_nome ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.cancelado_por_nome ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.problema ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.solucao ILIKE ${parametroBusca} ESCAPE '\\'
      OR os.motivo_cancelamento ILIKE ${parametroBusca} ESCAPE '\\'
    )`;
  }

  if (filtros.dataInicio) {
    valores.push(filtros.dataInicio);
    query += ` AND ${colunaData}::date >= $${valores.length}::date`;
  }

  if (filtros.dataFim) {
    valores.push(filtros.dataFim);
    query += ` AND ${colunaData}::date <= $${valores.length}::date`;
  }

  query += ` ORDER BY ${colunaData} DESC NULLS LAST, os.id DESC`;
  const resultado = await pool.query(query, valores);
  return resultado.rows;
}

async function buscarOSCompletasPorIds(ids) {
  if (!Array.isArray(ids) || ids.length === 0) {
    return [];
  }

  const resultado = await pool.query(
    `
      SELECT
        os.*,
        ${CAMPOS_PAUSAS_JSON}
      FROM ordens_servico os
      WHERE os.id = ANY($1::int[])
      ORDER BY array_position($1::int[], os.id)
    `,
    [ids]
  );

  return resultado.rows;
}

module.exports = {
  buscarOSCompletaPorId,
  buscarOSCompletasPorIds,
  buscarOSParaRelatorio,
  CAMPOS_PAUSAS_JSON
};
