const express = require("express");
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");
const { gerarPedidoCompraExcel } = require("../services/pedidoCompraExcelService");
const { gerarPedidoCompraPdf } = require("../services/pedidoCompraPdfService");

const router = express.Router();

function registrarExportacao(caminho, gerarArquivo, contentType, formato) {
  router.post(
    caminho,
    autenticarToken,
    permitirPerfis("admin", "almoxarifado", "compras"),
    async (req, res) => {
      try {
        const arquivo = await gerarArquivo(req.body);
        const nomeAscii = arquivo.fileName.normalize("NFD").replace(/[^\x20-\x7E]/g, "");
        res.setHeader("Content-Type", contentType);
        res.setHeader("Content-Disposition", `attachment; filename="${nomeAscii}"; filename*=UTF-8''${encodeURIComponent(arquivo.fileName)}`);
        res.send(arquivo.buffer);
      } catch (erro) {
        if (erro.statusCode === 400) return res.status(400).json({ erro: erro.message });
        console.error("Erro ao gerar pedido de compra:", erro);
        return res.status(500).json({ erro: `Não foi possível gerar o arquivo ${formato}.` });
      }
    }
  );
}

registrarExportacao("/excel", gerarPedidoCompraExcel, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Excel");
registrarExportacao("/pdf", gerarPedidoCompraPdf, "application/pdf", "PDF");

module.exports = router;
