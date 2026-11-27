/*
    db.js
    --------------------------------------------------
    Arquivo de conexão com o banco de dados PostgreSQL.

    Responsabilidades:
    - Carregar as variáveis de ambiente do .env;
    - Criar uma conexão com o banco usando pg.Pool;
    - Exportar o pool para ser usado nas rotas da API.

    A variável DATABASE_URL deve estar configurada no .env
    e também nas variáveis de ambiente da Vercel.
*/

require("dotenv").config();

const { Pool, types } = require("pg");

// OID 1114 = timestamp without time zone.
// Mantém os horários como texto bruto para evitar diferença entre localhost e Vercel.
types.setTypeParser(1114, (valor) => valor);

// Verificação simples para evitar erro confuso caso a variável não exista.
if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL não configurada no ambiente.");
}

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,

    // Evita que uma operação fique aguardando indefinidamente quando o banco remoto não puder ser alcançado.
    connectionTimeoutMillis: 8000,

    // Necessário em muitos bancos hospedados, como Neon/PostgreSQL em produção.
    ssl: {
        rejectUnauthorized: false
    }
});

// Sem este listener, uma queda de uma conexão ociosa pode encerrar o processo Node.
pool.on("error", (erro) => {
    console.error("Erro em conexão ociosa com o banco de dados:", erro);
});

module.exports = pool;
