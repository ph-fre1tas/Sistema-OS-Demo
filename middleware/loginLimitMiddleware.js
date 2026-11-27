const { createHash } = require("node:crypto");
const { isIP } = require("node:net");

const JANELA_SEGUNDOS = 15 * 60;
const LIMITE_CONTA = 10;
const LIMITE_IP = 50;

function normalizarIP(valor) {
  if (typeof valor !== "string") return null;
  const ip = valor.trim();
  if (isIP(ip) === 4) return ip;
  if (isIP(ip) !== 6 || ip.includes("%")) return null;

  // URL normaliza IPv6 comprimido e IPv4 mapeado para uma representação única.
  const canonico = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
  const [inicio, fim = ""] = canonico.split("::");
  const esquerda = inicio ? inicio.split(":") : [];
  const direita = fim ? fim.split(":") : [];
  const grupos = canonico.includes("::")
    ? [...esquerda, ...Array(8 - esquerda.length - direita.length).fill("0"), ...direita]
    : esquerda;
  const numeros = grupos.map((grupo) => parseInt(grupo, 16));
  if (numeros.slice(0, 5).every((numero) => numero === 0) && numeros[5] === 65535) {
    return [numeros[6] >> 8, numeros[6] & 255, numeros[7] >> 8, numeros[7] & 255].join(".");
  }
  // Agrupa a rede /64 para evitar contornar o limite alternando endereços IPv6.
  return numeros.slice(0, 4).map((numero) => numero.toString(16)).join(":") + "::/64";
}

function obterIP(req, ambienteVercel) {
  // Somente a infraestrutura Vercel pode fornecer este cabeçalho confiável.
  // Fora dela usamos o socket, sem confiar em X-Forwarded-For enviado pelo cliente.
  const valor = ambienteVercel
    ? req.headers["x-vercel-forwarded-for"]
    : req.socket?.remoteAddress;
  return normalizarIP(valor);
}

function chaveLimite(tipo, valor) {
  return `${tipo}:${createHash("sha256").update(valor).digest("hex")}`;
}

function criarLimitadorLogin(armazenamento, { ambienteVercel = process.env.VERCEL === "1" } = {}) {
  return async (req, res, next) => {
    try {
      const ip = obterIP(req, ambienteVercel);
      if (!ip) {
        return res.status(503).json({ erro: "Não foi possível validar o acesso. Tente novamente mais tarde." });
      }

      // O limite de IP é consumido primeiro, inclusive para corpos inválidos.
      const limites = [[chaveLimite("ip", ip), LIMITE_IP]];
      const usuario = typeof req.body?.usuario === "string" ? req.body.usuario.trim() : "";
      // Preserva maiúsculas/minúsculas, como a consulta de login no banco.
      if (usuario) limites.push([chaveLimite("conta", usuario), LIMITE_CONTA]);

      for (const [chave, limite] of limites) {
        const resultado = await armazenamento.consumir(chave, limite, JANELA_SEGUNDOS);
        if (!resultado.permitido) {
          res.setHeader("Retry-After", String(resultado.espera));
          res.setHeader("Cache-Control", "no-store");
          return res.status(429).json({
            erro: `Muitas tentativas de login. Tente novamente em ${Math.ceil(resultado.espera / 60)} minuto(s).`,
            tentarNovamenteEmSegundos: resultado.espera
          });
        }
      }

      return next();
    } catch (erro) {
      console.error("Erro ao verificar limites de login:", erro);
      // Uma falha no armazenamento não pode liberar tentativas ilimitadas.
      return res.status(503).json({ erro: "Não foi possível validar o acesso. Tente novamente mais tarde." });
    }
  };
}

module.exports = { criarLimitadorLogin, normalizarIP, obterIP };
