/*
    demoMiddleware.js
    --------------------------------------------------
    Controla o modo demonstração (somente leitura) para portfólio.

    Quando DEMO_MODE=true:
    - Permite leitura (GET/HEAD/OPTIONS);
    - Permite login, demo-login e exportações PDF/Excel que não alteram o banco;
    - Bloqueia operações de escrita (POST/PUT/PATCH/DELETE) retornando HTTP 423.
*/

const METODOS_LEITURA = new Set(["GET", "HEAD", "OPTIONS"]);

const ROTAS_POST_PERMITIDAS = new Set([
  "/login",
  "/api/login",
  "/demo-login",
  "/api/demo-login",
  "/pedidos-compra/excel",
  "/api/pedidos-compra/excel",
  "/pedidos-compra/pdf",
  "/api/pedidos-compra/pdf",
  "/relatorios/os/pdf",
  "/api/relatorios/os/pdf"
]);

function isDemoMode() {
  return String(process.env.DEMO_MODE || "").trim().toLowerCase() === "true";
}

function normalizarCaminho(req) {
  const bruto = (req.path || req.originalUrl || "").split("?")[0];
  if (bruto.length > 1 && bruto.endsWith("/")) {
    return bruto.slice(0, -1);
  }
  return bruto;
}

function bloquearEscritaEmModoDemo(req, res, next) {
  if (!isDemoMode()) {
    return next();
  }

  const metodo = String(req.method || "GET").toUpperCase();
  if (METODOS_LEITURA.has(metodo)) {
    return next();
  }

  const caminho = normalizarCaminho(req);
  if (metodo === "POST" && ROTAS_POST_PERMITIDAS.has(caminho)) {
    return next();
  }

  return res.status(423).json({
    erro: "Modo demonstração (somente leitura): alterações não são gravadas no banco de dados.",
    demoReadOnly: true
  });
}

module.exports = {
  isDemoMode,
  bloquearEscritaEmModoDemo
};
