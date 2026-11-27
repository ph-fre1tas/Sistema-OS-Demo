class ErroFerramentas extends Error {}

function idValido(valor) {
    return ["string", "number"].includes(typeof valor) && /^(?:[1-9]\d*)$/.test(String(valor)) && Number.isSafeInteger(Number(valor)) && Number(valor) <= 2147483647;
}

function validarCadastro(entrada = {}) {
    const { tipo, marca } = entrada || {};
    if (typeof tipo !== "string" || typeof marca !== "string" ||
        !tipo.trim() || !marca.trim() || tipo.trim().length > 100 || marca.trim().length > 100) {
        throw new ErroFerramentas("Informe tipo e marca com até 100 caracteres cada.");
    }
    return [tipo.trim(), marca.trim()];
}

function consultaHistorico(entrada = {}) {
    const valores = [];
    const parametro = valor => { valores.push(valor); return `$${valores.length}`; };
    const condicoes = ["m.devolvido_em IS NOT NULL"];
    if (entrada.busca !== undefined && typeof entrada.busca !== "string") throw new ErroFerramentas("Pesquisa inválida.");
    const busca = (entrada.busca || "").trim();
    if (busca.length > 120) throw new ErroFerramentas("A pesquisa deve ter até 120 caracteres.");
    if (busca) {
        const p = parametro(`%${busca.replace(/[\\%_]/g, "\\$&")}%`);
        condicoes.push(`(m.tipo ILIKE ${p} OR m.marca ILIKE ${p} OR m.funcionario_nome ILIKE ${p}
            OR LPAD(m.ferramenta_id::text, GREATEST(3, LENGTH(m.ferramenta_id::text)), '0') ILIKE ${p})`);
    }
    for (const campo of ["inicio", "fim"]) {
        const valor = entrada[campo];
        if (valor === undefined || valor === "") continue;
        const data = typeof valor === "string" && /^\d{4}-\d{2}-\d{2}$/.test(valor) ? new Date(`${valor}T00:00:00Z`) : null;
        if (!data || !Number.isFinite(data.getTime()) || data.toISOString().slice(0, 10) !== valor) throw new ErroFerramentas("Data inválida.");
        // O período se refere à retirada, com os limites do dia em São Paulo.
        condicoes.push(campo === "inicio"
            ? `m.retirado_em >= (${parametro(valor)}::date::timestamp AT TIME ZONE 'America/Sao_Paulo')`
            : `m.retirado_em < ((${parametro(valor)}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')`);
    }
    if (entrada.inicio && entrada.fim && entrada.inicio > entrada.fim) throw new ErroFerramentas("A data inicial não pode ser posterior à final.");
    const pagina = Number(entrada.pagina ?? 1);
    if (!Number.isSafeInteger(pagina) || pagina < 1 || pagina > 1000000) throw new ErroFerramentas("Página inválida.");
    const limite = 50;
    return {
        sql: `SELECT m.* FROM ferramentas_emprestimos m WHERE ${condicoes.join(" AND ")}
            ORDER BY m.devolvido_em DESC, m.id DESC LIMIT ${limite + 1} OFFSET ${parametro((pagina - 1) * limite)}`,
        valores, pagina, limite
    };
}

module.exports = { ErroFerramentas, idValido, validarCadastro, consultaHistorico };
