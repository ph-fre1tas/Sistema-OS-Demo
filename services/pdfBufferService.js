function gerarBufferPdf(documento, desenhar) {
  return new Promise((resolve, reject) => {
    const partes = [];

    documento.on("data", (parte) => partes.push(parte));
    documento.on("end", () => resolve(Buffer.concat(partes)));
    documento.on("error", reject);

    try {
      desenhar(documento);
      documento.end();
    } catch (erro) {
      documento.removeAllListeners();
      reject(erro);
    }
  });
}

module.exports = { gerarBufferPdf };
