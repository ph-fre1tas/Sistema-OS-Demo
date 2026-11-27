const FerramentasAPI = (() => {
    async function requisicao(caminho = "", opcoes = {}) {
        const resposta = await fetch(`/api/ferramentas${caminho}`, {
            ...opcoes,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        if (respostaSessaoExpirada(resposta)) throw new Error("Sessão inválida.");
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a operação.");
        return dados;
    }
    function mensagem(texto, erro = false) {
        const elemento = document.getElementById("mensagemFerramentas");
        elemento.textContent = texto;
        elemento.classList.toggle("erro", erro);
        elemento.hidden = !texto;
    }
    const numero = id => String(id).padStart(3, "0");
    const nome = ferramenta => `${numero(ferramenta.ferramenta_id ?? ferramenta.id)} — ${ferramenta.tipo} ${ferramenta.marca}`;
    const data = valor => new Date(valor).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short", timeZone: "America/Sao_Paulo" });
    return { requisicao, mensagem, numero, nome, data };
})();
