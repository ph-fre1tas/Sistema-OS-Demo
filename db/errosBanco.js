/*
  Centraliza a identificação de falhas temporárias de conexão com o PostgreSQL.
  A mensagem enviada ao navegador não expõe detalhes da infraestrutura.
*/

const CODIGOS_DE_CONEXAO = new Set([
  "08000", "08001", "08003", "08004", "08006", "08007", "08P01",
  "57P01", "57P02", "57P03",
  "ECONNABORTED", "ECONNREFUSED", "ECONNRESET", "EAI_AGAIN",
  "ENETDOWN", "ENETUNREACH", "EHOSTUNREACH", "ENOTFOUND", "ETIMEDOUT"
]);

const MENSAGEM_BANCO_INDISPONIVEL =
  "Não foi possível acessar os dados no momento. Verifique sua conexão com a internet e tente novamente.";

function erroDeConexaoComBanco(erro) {
  if (!erro) return false;

  const codigo = String(erro.code || "").toUpperCase();
  if (CODIGOS_DE_CONEXAO.has(codigo)) return true;

  const mensagem = String(erro.message || "");
  return /connection (terminated|timeout|refused)|connect econn|network|socket (closed|hang up|timeout)|database .*unavailable/i.test(mensagem);
}

function responderErroDoBanco(res, erro, mensagemPadrao) {
  if (erroDeConexaoComBanco(erro)) {
    return res.status(503).json({
      erro: MENSAGEM_BANCO_INDISPONIVEL,
      codigo: "BANCO_INDISPONIVEL"
    });
  }

  return res.status(500).json({ erro: mensagemPadrao });
}

module.exports = {
  responderErroDoBanco
};
