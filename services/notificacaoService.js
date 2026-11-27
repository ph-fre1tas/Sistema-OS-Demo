/* Estrutura e operações compartilhadas das notificações do sistema. */

const pool = require("../db/db");

let estruturaPronta;

function garantirEstruturaDeNotificacoes() {
  if (!estruturaPronta) {
    estruturaPronta = pool.query(`
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS email VARCHAR(254);
      ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS areas_notificacao_email TEXT[] NOT NULL DEFAULT '{}';
      CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico
        ON usuarios (LOWER(email))
        WHERE email IS NOT NULL;

      CREATE TABLE IF NOT EXISTS notificacoes (
        id SERIAL PRIMARY KEY,
        usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
        tipo VARCHAR(40) NOT NULL,
        titulo VARCHAR(160) NOT NULL,
        mensagem TEXT NOT NULL,
        url VARCHAR(255),
        lida BOOLEAN NOT NULL DEFAULT false,
        criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS notificacoes_usuario_data
        ON notificacoes (usuario_id, lida, criada_em DESC);
    `).catch((erro) => {
      estruturaPronta = null;
      throw erro;
    });
  }

  return estruturaPronta;
}

async function criarNotificacoesParaPerfis(executor, perfis, notificacao) {
  const { tipo, titulo, mensagem, url = null } = notificacao;

  await executor.query(
    `
      INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, url)
      SELECT id, $2, $3, $4, $5
      FROM usuarios
      WHERE ativo = true
        AND perfil = ANY($1::text[])
    `,
    [perfis, tipo, titulo, mensagem, url]
  );
}

module.exports = {
  garantirEstruturaDeNotificacoes,
  criarNotificacoesParaPerfis
};
