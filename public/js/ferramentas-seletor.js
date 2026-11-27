// Mesmo padrão visual do seletor de recebedores do estoque, com busca e teclado.
function configurarSeletorFerramentas(id, { outro = false, aoSelecionar = () => {} } = {}) {
    const campo = document.getElementById(id);
    const botao = document.getElementById(`${id}Botao`);
    const legenda = botao.querySelector("span");
    const menu = document.getElementById(`${id}Menu`);
    const busca = menu.querySelector("input");
    const lista = menu.querySelector(".estoque-recebedor-opcoes");
    const estado = menu.querySelector("[role=status]");
    const grupo = botao.closest(".ferramentas-seletor");
    const normalizar = texto => texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    let opcoes = [];
    let vazio = "Selecione...";

    function fechar() { menu.hidden = true; botao.setAttribute("aria-expanded", "false"); }
    function selecionar(valor) {
        campo.value = valor;
        legenda.textContent = valor === "OUTRO" && outro ? "Outro" : opcoes.find(o => o.valor === valor)?.nome || vazio;
        aoSelecionar(valor);
    }
    function desenhar() {
        const filtradas = opcoes.filter(o => normalizar(o.nome).includes(normalizar(busca.value.trim())));
        estado.textContent = filtradas.length ? "" : "Nenhum resultado encontrado.";
        estado.hidden = !!filtradas.length;
        const itens = outro ? [...filtradas, { valor: "OUTRO", nome: "Outro" }] : filtradas;
        lista.replaceChildren(...itens.map(opcao => {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "estoque-recebedor-opcao";
            item.textContent = opcao.nome;
            item.setAttribute("aria-pressed", String(campo.value === opcao.valor));
            item.addEventListener("click", () => {
                if (botao.disabled) return;
                selecionar(opcao.valor);
                fechar();
                botao.focus();
            });
            return item;
        }));
    }
    botao.addEventListener("click", () => {
        if (!menu.hidden) return fechar();
        menu.hidden = false;
        botao.setAttribute("aria-expanded", "true");
        busca.value = "";
        desenhar();
        busca.focus();
    });
    busca.addEventListener("input", desenhar);
    menu.addEventListener("keydown", evento => {
        if (evento.key === "Escape") { evento.preventDefault(); fechar(); botao.focus(); }
        if (evento.key === "Enter" && evento.target === busca) {
            evento.preventDefault(); lista.querySelector("button")?.focus();
        }
        if (["ArrowDown", "ArrowUp"].includes(evento.key)) {
            evento.preventDefault();
            const itens = [busca, ...lista.querySelectorAll("button")];
            const indice = itens.indexOf(document.activeElement);
            itens[(indice + (evento.key === "ArrowDown" ? 1 : itens.length - 1)) % itens.length].focus();
        }
    });
    document.addEventListener("click", evento => { if (!grupo.contains(evento.target)) fechar(); });
    document.addEventListener("focusin", evento => { if (!grupo.contains(evento.target)) fechar(); });
    return {
        definirOpcoes(itens, mensagemVazia) {
            opcoes = itens.map(item => ({ ...item, valor: String(item.valor) }));
            vazio = opcoes.length || outro ? "Selecione..." : mensagemVazia;
            selecionar(opcoes.some(o => o.valor === campo.value) || (outro && campo.value === "OUTRO") ? campo.value : "");
            botao.disabled = !opcoes.length && !outro;
            fechar();
        },
        bloquear() { botao.disabled = true; fechar(); },
        limpar() { selecionar(""); fechar(); }
    };
}
