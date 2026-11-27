// Guarda a expansão durante filtros e atualizações da lista, somente nesta página.
window.OSCardDetalhes = (() => {
    const expandidas = new Set();

    function preservar(lista) {
        lista.querySelectorAll('details[data-os-detalhes]').forEach(detalhes => {
            const id = detalhes.dataset.osDetalhes;
            if (detalhes.open) expandidas.add(id);
            else expandidas.delete(id);
        });
    }

    function abrir(id) {
        const idSeguro = Number.isInteger(Number(id)) ? Number(id) : 0;
        return `<details class="os-detalhes" data-os-detalhes="${idSeguro}" ${expandidas.has(String(idSeguro)) ? 'open' : ''}>
            <summary class="os-detalhes-botao">
                <span class="os-exibir-mais">Exibir mais</span>
                <span class="os-exibir-menos">Exibir menos</span>
            </summary>
            <div class="os-detalhes-conteudo">`;
    }

    return Object.freeze({ preservar, abrir });
})();
