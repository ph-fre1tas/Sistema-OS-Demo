function tokenHeaders() {
    return {
        "Content-Type": "application/json",
        Authorization: `Bearer ${localStorage.getItem("token")}`
    };
}

async function requisicaoEstoque(url, opcoes = {}) {
    const { responseType, ...opcoesFetch } = opcoes;
    const resposta = await fetch(url, {
        ...opcoesFetch,
        headers: { ...tokenHeaders(), ...(opcoes.headers || {}) }
    });

    if (resposta.status === 401 || resposta.status === 403) {
        redirecionarParaLogin("Sua sessão expirou. Faça login novamente.");
        throw new Error("Sessão inválida.");
    }

    if (!resposta.ok) {
        // APIs normalmente retornam JSON, mas respostas HTML/texto tambem precisam virar um erro legivel.
        const tipo = resposta.headers.get("content-type") || "";
        let mensagem = "";

        if (tipo.includes("application/json")) {
            const dados = await resposta.json().catch(() => ({}));
            mensagem = dados.erro || dados.message || "";
        } else {
            mensagem = (await resposta.text().catch(() => "")).trim();
        }

        const detalhe = mensagem.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
        throw new Error(detalhe.slice(0, 240) || `Erro ${resposta.status} ao concluir a operação.`);
    }

    // A geracao do pedido usa a mesma funcao, mas precisa preservar o corpo binario do XLSX.
    if (responseType === "blob") return resposta;
    return resposta.json();
}

function numero(valor, casas = 0) {
    return new Intl.NumberFormat("pt-BR", {
        minimumFractionDigits: casas,
        maximumFractionDigits: 2
    }).format(Number(valor) || 0);
}

function escapar(texto) {
    const elemento = document.createElement("div");
    elemento.textContent = texto ?? "";
    return elemento.innerHTML;
}
