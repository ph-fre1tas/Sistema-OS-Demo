const express = require("express");
const { responderErroDoBanco } = require("../db/errosBanco");
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");
const { buscarOSCompletasPorIds } = require("../services/osConsultaService");
const {
  ErroValidacaoRelatorio,
  consultarRelatorio,
  normalizarFiltrosRelatorio,
  normalizarFormatoRelatorio,
  normalizarIdsResultado,
  prepararDadosRelatorioParaPdf
} = require("../services/osRelatorioService");
const { gerarPdfRelatorio } = require("../services/osRelatorioPdfService");

const router = express.Router();
const perfisRelatorios = permitirPerfis("admin", "almoxarifado");

router.get("/os", autenticarToken, perfisRelatorios, async (req, res) => {
  try {
    const resultado = await consultarRelatorio(req.query);
    return res.json(resultado);
  } catch (erro) {
    if (erro instanceof ErroValidacaoRelatorio) {
      return res.status(400).json({ erro: erro.message });
    }

    console.error("Erro ao consultar relatório de OS:", erro);
    return responderErroDoBanco(res, erro, "Erro ao consultar as Ordens de Serviço.");
  }
});

router.post("/os/pdf", autenticarToken, perfisRelatorios, async (req, res) => {
  try {
    const body = req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
    const filtrosEntrada = body.filtros && typeof body.filtros === "object" && !Array.isArray(body.filtros)
      ? body.filtros
      : {};
    const filtros = normalizarFiltrosRelatorio(filtrosEntrada);
    const formato = normalizarFormatoRelatorio(body.formato);
    const ids = normalizarIdsResultado(body.ids);
    const ordens = await buscarOSCompletasPorIds(ids);
    const dados = prepararDadosRelatorioParaPdf(ordens, filtros, formato);
    const pdf = await gerarPdfRelatorio(dados);

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${dados.nomeArquivo}"`);
    res.setHeader("Content-Length", pdf.length);
    return res.send(pdf);
  } catch (erro) {
    if (erro instanceof ErroValidacaoRelatorio) {
      return res.status(400).json({ erro: erro.message });
    }

    console.error("Erro ao gerar relatório de OS em PDF:", erro);
    return responderErroDoBanco(res, erro, "Erro ao gerar o relatório de Ordens de Serviço.");
  }
});

module.exports = router;
