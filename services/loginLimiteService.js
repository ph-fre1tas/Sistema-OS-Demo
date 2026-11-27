// Os contadores são compartilhados entre processos e instâncias serverless.
function criarArmazenamentoLimitesLogin(pool) {
  let estruturaPronta;

  function prepararEstrutura() {
    if (!estruturaPronta) {
      estruturaPronta = pool.query(`
        DO $$
        BEGIN
          -- Serializa a criação em cold starts simultâneos, na mesma transação.
          PERFORM pg_advisory_xact_lock(172915, 1);
          CREATE TABLE IF NOT EXISTS login_limites (
            chave VARCHAR(80) PRIMARY KEY,
            tentativas INTEGER NOT NULL,
            expira_em TIMESTAMPTZ NOT NULL
          );
          CREATE INDEX IF NOT EXISTS login_limites_expiracao ON login_limites (expira_em);
        END $$;
      `).catch((erro) => {
        estruturaPronta = null;
        throw erro;
      });
    }
    return estruturaPronta;
  }

  return {
    async consumir(chave, limite, janelaSegundos) {
      await prepararEstrutura();

      if (chave.startsWith("ip:")) {
        // Limpeza limitada por requisição; não remove uma janela renovada em paralelo.
        await pool.query(`
          DELETE FROM login_limites
          WHERE chave IN (
            SELECT chave FROM login_limites WHERE expira_em <= NOW()
            ORDER BY expira_em LIMIT 100
          ) AND expira_em <= NOW()
        `);
      }

      // O UPSERT serializa incrementos concorrentes no próprio PostgreSQL.
      // Tentativas bloqueadas não prolongam a janela nem fazem o contador transbordar.
      const resultado = await pool.query(`
        INSERT INTO login_limites (chave, tentativas, expira_em)
        VALUES ($1, 1, NOW() + $3::integer * INTERVAL '1 second')
        ON CONFLICT (chave) DO UPDATE SET
          tentativas = CASE WHEN login_limites.expira_em <= NOW() THEN 1
            ELSE LEAST(login_limites.tentativas + 1, $2::integer + 1) END,
          expira_em = CASE WHEN login_limites.expira_em <= NOW()
            THEN NOW() + $3::integer * INTERVAL '1 second'
            ELSE login_limites.expira_em END
        RETURNING tentativas <= $2::integer AS permitido,
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM (expira_em - NOW()))))::integer AS espera
      `, [chave, limite, janelaSegundos]);

      return resultado.rows[0];
    }
  };
}

module.exports = { criarArmazenamentoLimitesLogin };
