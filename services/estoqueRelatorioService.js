class ErroConsultaRetiradas extends Error {}

function prepararConsultaRetiradas(entrada = {}, { paginar = true } = {}) {
    const dataValida = (valor, rotulo) => {
        if (valor === undefined || valor === "") return null;
        if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw new ErroConsultaRetiradas(`${rotulo} inválida.`);
        const data = new Date(`${valor}T00:00:00Z`);
        if (!Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new ErroConsultaRetiradas(`${rotulo} inválida.`);
        return valor;
    };
    const inicio = dataValida(entrada.data_inicio, "Data inicial");
    const fim = dataValida(entrada.data_fim, "Data final");
    if (inicio && fim && inicio > fim) throw new ErroConsultaRetiradas("A data inicial não pode ser posterior à data final.");
    if (entrada.busca !== undefined && typeof entrada.busca !== "string") throw new ErroConsultaRetiradas("Pesquisa inválida.");
    const busca = (entrada.busca || "").trim();
    if (busca.length > 120) throw new ErroConsultaRetiradas("A pesquisa deve ter no máximo 120 caracteres.");
    const pagina = Number(entrada.pagina ?? 1);
    if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000000) throw new ErroConsultaRetiradas("Página inválida.");
    const valores = [];
    const parametro = valor => { valores.push(valor); return `$${valores.length}`; };
    const condicoes = ["m.tipo = 'SAIDA'", "m.recebedor_nome IS NOT NULL"];
    const situacao = entrada.situacao ?? "confirmadas";
    if (!["confirmadas", "canceladas", "todas"].includes(situacao)) throw new ErroConsultaRetiradas("Situação inválida.");
    if (situacao === "confirmadas") condicoes.push("m.cancelada_em IS NULL");
    if (situacao === "canceladas") condicoes.push("m.cancelada_em IS NOT NULL");
    if (busca) {
        const p = parametro(`%${busca.replace(/[\\%_]/g, "\\$&")}%`);
        condicoes.push(`(p.descricao ILIKE ${p} OR m.usuario_nome ILIKE ${p} OR m.recebedor_nome ILIKE ${p})`);
    }
    // O estoque interpreta os timestamps sem fuso como UTC. Os limites são dias em São Paulo.
    if (inicio) condicoes.push(`m.criado_em >= ((${parametro(inicio)}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')`);
    if (fim) condicoes.push(`m.criado_em < (((${parametro(fim)}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')`);
    const limite = 50;
    const paginacao = paginar ? ` LIMIT ${limite + 1} OFFSET ${parametro((pagina - 1) * limite)}` : "";
    const sql = `SELECT m.id, m.quantidade, m.usuario_nome, m.recebedor_nome, m.criado_em,
        m.cancelada_em, m.cancelada_por_nome, p.descricao AS produto_descricao, p.unidade
        FROM estoque_movimentacoes m JOIN estoque_produtos p ON p.id = m.produto_id
        WHERE ${condicoes.join(" AND ")}
        ORDER BY m.criado_em DESC, m.id DESC${paginacao}`;
    return { sql, valores, pagina, limite, filtros: { busca, data_inicio: inicio, data_fim: fim, situacao } };
}

module.exports = { prepararConsultaRetiradas, ErroConsultaRetiradas };
