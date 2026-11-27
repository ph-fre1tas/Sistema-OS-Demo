const { quebrarTextoEmLinhas, resolverLogoPdf } = require("./osPdfLayout");

const FUSO = "America/Sao_Paulo";
const C = { titulo: "#071B78", texto: "#344568", suave: "#60759B", borda: "#DCEAF7", azul: "#087CFA", verde: "#00894E", vermelho: "#E52E3A" };

function dataUtc(valor) {
    if (valor instanceof Date) return valor;
    const iso = String(valor).replace(" ", "T");
    return new Date(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(iso) ? iso : `${iso}Z`);
}

function dataLocal(valor) {
    return dataUtc(valor).toLocaleDateString("pt-BR", { timeZone: FUSO });
}

function desenharRelatorioRetiradas(doc, retiradas, filtros, geradoEm, logoPath) {
    const x = 24;
    const largura = doc.page.width - 2 * x;
    const limite = 774;
    const colunas = [largura * .31, largura * .14, largura * .16, largura * .16, largura * .09, largura * .14];
    const entrelinha = 11;
    let y;
    function texto(valor, px, py, width, tamanho = 9, cor = C.texto, negrito = false, align = "left") {
        doc.font(negrito ? "Helvetica-Bold" : "Helvetica").fontSize(tamanho).fillColor(cor)
            .text(String(valor), px, py, { width, lineBreak: false, align });
    }
    function linhas(valor, width, tamanho = 9) {
        doc.font("Helvetica").fontSize(tamanho);
        return quebrarTextoEmLinhas(doc, String(valor || "-"), width);
    }
    function cabecalho(completo) {
        if (completo) {
            doc.save().rect(x, 23, 183, 54).clip();
            doc.image(resolverLogoPdf(logoPath), x, 23, { cover: [183, 54], align: "center", valign: "center" });
            doc.restore();
            texto("RELATÓRIO DE RETIRADAS DE ESTOQUE", x + 198, 32, largura - 198, 13, C.titulo, true, "right");
            texto("Detalhamento das retiradas", x + 198, 53, largura - 198, 11, C.suave, false, "right");
            y = 88;
        } else {
            texto("RELATÓRIO DE RETIRADAS DE ESTOQUE", x, 29, largura, 12, C.titulo, true);
            y = 51;
        }
        doc.moveTo(x, y).lineTo(x + largura, y).lineWidth(.7).strokeColor("#8BB8F5").stroke();
        y += 18;
    }
    function novaPagina() { doc.addPage(); cabecalho(false); }
    function campo(rotulo, valor, px, py, width) {
        const larguraRotulo = Math.max(58, doc.font("Helvetica-Bold").fontSize(10).widthOfString(rotulo) + 8);
        const linhasValor = linhas(String(valor).replace(/\s+/g, " ").trim(), width - larguraRotulo, 10);
        texto(rotulo, px, py, larguraRotulo, 10, C.titulo, true);
        linhasValor.forEach((linha, i) => texto(linha, px + larguraRotulo, py + i * 13, width - larguraRotulo, 10, C.suave));
        return linhasValor.length * 13;
    }
    function icone(px, py, cor, tipo) {
        doc.save().lineWidth(1.8).strokeColor(cor);
        if (tipo === 0) {
            doc.roundedRect(px + 3, py, 16, 22, 2).stroke();
            for (let i = 0; i < 3; i++) doc.moveTo(px + 7, py + 7 + i * 4).lineTo(px + 15, py + 7 + i * 4).stroke();
        } else {
            doc.circle(px + 11, py + 11, 11).fill(cor).strokeColor("#FFFFFF");
            if (tipo === 1) doc.moveTo(px + 5, py + 11).lineTo(px + 9, py + 15).lineTo(px + 17, py + 7).stroke();
            else {
                doc.moveTo(px + 7, py + 7).lineTo(px + 15, py + 15).stroke();
                doc.moveTo(px + 15, py + 7).lineTo(px + 7, py + 15).stroke();
            }
        }
        doc.restore();
    }
    cabecalho(true);
    const formatarDia = valor => valor.split("-").reverse().join("/");
    const periodo = filtros.data_inicio && filtros.data_fim
        ? `${formatarDia(filtros.data_inicio)} a ${formatarDia(filtros.data_fim)}`
        : filtros.data_inicio ? `A partir de ${formatarDia(filtros.data_inicio)}`
            : filtros.data_fim ? `Até ${formatarDia(filtros.data_fim)}` : "Todo o período";
    const metade = (largura - 18) / 2;
    const alturaCampos = Math.max(campo("Período:", periodo, x + 3, y, metade),
        campo("Busca:", filtros.busca || "Todos os registros", x + metade + 18, y, metade));
    y += alturaCampos + 8;
    campo("Situação:", { confirmadas: "Confirmadas", canceladas: "Canceladas", todas: "Todas" }[filtros.situacao], x + 3, y, metade);
    campo("Gerado em:", dataUtc(geradoEm).toLocaleString("pt-BR", { timeZone: FUSO }), x + metade + 18, y, metade);
    y += 34;
    const canceladas = retiradas.filter(r => r.cancelada_em).length;
    const cards = [
        ["Total de saídas", retiradas.length, C.azul, "#EBF5FF", "#CCE3FF"],
        ["Confirmadas", retiradas.length - canceladas, C.verde, "#EEFBF4", "#CEF0DF"],
        ["Canceladas", canceladas, C.vermelho, "#FFF2F3", "#F9DADD"]
    ];
    const cardWidth = (largura - 20) / 3;
    cards.forEach(([rotulo, total, cor, fundo, borda], i) => {
        const px = x + i * (cardWidth + 10);
        doc.roundedRect(px, y, cardWidth, 70, 6).fillAndStroke(fundo, borda);
        doc.roundedRect(px + 14, y + 17, 40, 40, 10).fill(borda);
        icone(px + 23, y + 26, cor, i);
        texto(rotulo, px + 66, y + 16, cardWidth - 70, 10, cor);
        texto(total.toLocaleString("pt-BR"), px + 66, y + 34, cardWidth - 70, total > 99999 ? 19 : 25, cor, true);
    });
    y += 99;
    texto("RETIRADAS POR DATA", x, y, largura, 15, C.titulo, true);
    y += 28;

    function cabecalhoGrupo(dia, continuacao = false) {
        doc.rect(x, y, largura, 31).fill("#E1F2FF");
        texto(`${dia}${continuacao ? " (continuação)" : ""}`, x + 10, y + 9, largura - 20, 12, C.titulo, true);
        y += 31;
        doc.rect(x, y, largura, 29).fill("#F4F7FB");
        let px = x;
        ["Produto", "Quantidade", "Registrado por", "Recebido por", "Horário", "Situação"].forEach((rotulo, i) => {
            texto(rotulo, px + 8, y + 10, colunas[i] - 16, 8, C.suave, true);
            px += colunas[i];
        });
        y += 29;
    }
    let diaAtual = null;
    for (const retirada of retiradas) {
        const dia = dataLocal(retirada.criado_em);
        const valores = [retirada.produto_descricao,
            `${Number(retirada.quantidade).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${retirada.unidade}`,
            retirada.usuario_nome, retirada.recebedor_nome,
            dataUtc(retirada.criado_em).toLocaleTimeString("pt-BR", { timeZone: FUSO, hour: "2-digit", minute: "2-digit" }),
            retirada.cancelada_em ? "Cancelada" : "Confirmada"];
        const celulas = valores.map((valor, i) => linhas(valor, colunas[i] - 16, 8.5));
        const totalLinhas = Math.max(...celulas.map(c => c.length));
        const altura = totalLinhas * entrelinha + 15;
        if (dia !== diaAtual) {
            if (diaAtual) y += 22;
            if (y + 60 + Math.min(altura, 120) > limite) novaPagina();
            cabecalhoGrupo(dia);
            diaAtual = dia;
        } else if (y + altura > limite && altura <= limite - 129) {
            novaPagina();
            cabecalhoGrupo(dia, true);
        }
        let deslocamento = 0;
        while (deslocamento < totalLinhas) {
            const capacidade = Math.floor((limite - y - 15) / entrelinha);
            if (capacidade < 1) { novaPagina(); cabecalhoGrupo(dia, true); continue; }
            const quantidade = Math.min(capacidade, totalLinhas - deslocamento);
            const alturaParte = quantidade * entrelinha + 15;
            doc.rect(x, y, largura, alturaParte).lineWidth(.5).strokeColor(C.borda).stroke();
            let px = x;
            celulas.forEach((celula, i) => {
                celula.slice(deslocamento, deslocamento + quantidade).forEach((linha, j) => {
                    texto(linha, px + 8, y + 8 + j * entrelinha, colunas[i] - 16, 8.5,
                        i === 5 && retirada.cancelada_em ? C.vermelho : C.texto);
                });
                px += colunas[i];
            });
            y += alturaParte;
            deslocamento += quantidade;
            if (deslocamento < totalLinhas) { novaPagina(); cabecalhoGrupo(dia, true); }
        }
    }
    if (!retiradas.length) texto("Nenhuma retirada corresponde aos filtros selecionados.", x, y, largura, 10, C.suave);
    const paginas = doc.bufferedPageRange();
    for (let i = 0; i < paginas.count; i++) {
        doc.switchToPage(paginas.start + i);
        doc.page.margins.bottom = 0;
        doc.moveTo(x, 798).lineTo(x + largura, 798).lineWidth(.7).strokeColor("#8BB8F5").stroke();
        texto("Sistema de Ordem de Serviço", x, 810, largura, 8, C.suave);
        texto(`Página ${i + 1} de ${paginas.count}`, x, 810, largura, 8, C.suave, false, "right");
    }
}

module.exports = { desenharRelatorioRetiradas, dataLocal };
