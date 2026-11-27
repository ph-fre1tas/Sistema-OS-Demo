function configurarSeletorOS(id, opcoes, aoSelecionar = () => {}) {
    const campo = document.getElementById(id);
    const botao = document.getElementById(`${id}Botao`);
    const menu = document.getElementById(`${id}Menu`);
    const legenda = botao.querySelector("span");
    const grupo = botao.closest("[data-seletor-os]");

    function fechar() {
        menu.hidden = true;
        botao.setAttribute("aria-expanded", "false");
    }

    function selecionar(opcao) {
        campo.value = opcao.valor;
        legenda.textContent = opcao.nome;
        aoSelecionar(opcao.valor);
        menu.querySelectorAll("button").forEach(item => {
            item.setAttribute("aria-pressed", String(item.dataset.valor === opcao.valor));
        });
        fechar();
        if (id === "area_manutencao") {
            const informacao = document.getElementById("descricao-area-manutencao");
            informacao.querySelector("strong").textContent = opcao.nome;
            informacao.querySelector("p").textContent = opcao.descricao;
            informacao.hidden = false;
        }
    }

    menu.replaceChildren(...opcoes.map(opcao => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "seletor-os-opcao";
        item.textContent = opcao.nome;
        item.dataset.valor = opcao.valor;
        item.setAttribute("aria-pressed", "false");
        item.addEventListener("click", () => selecionar(opcao));
        return item;
    }));

    botao.addEventListener("click", () => {
        const abrir = menu.hidden;
        fechar();
        if (abrir) {
            menu.hidden = false;
            botao.setAttribute("aria-expanded", "true");
            menu.querySelector("button")?.focus();
        }
    });

    menu.addEventListener("keydown", evento => {
        if (evento.key === "Escape") {
            evento.preventDefault();
            fechar();
            botao.focus();
            return;
        }
        if (!["ArrowDown", "ArrowUp"].includes(evento.key)) return;
        evento.preventDefault();
        const itens = [...menu.querySelectorAll("button")];
        const indice = itens.indexOf(document.activeElement);
        const passo = evento.key === "ArrowDown" ? 1 : -1;
        itens[(indice + passo + itens.length) % itens.length].focus();
    });

    document.addEventListener("click", evento => {
        if (!grupo.contains(evento.target)) fechar();
    });

    return {
        limpar() {
            campo.value = "";
            legenda.textContent = "Selecione...";
            aoSelecionar("");
            menu.querySelectorAll("button").forEach(item => item.setAttribute("aria-pressed", "false"));
            fechar();
            if (id === "area_manutencao") {
                document.getElementById("descricao-area-manutencao").hidden = true;
            }
        }
    };
}

const seletorAreaManutencao = configurarSeletorOS("area_manutencao", [
    { valor: "Máquinas", nome: "Máquinas", descricao: "Serviços relacionados a máquinas e equipamentos, como motores, rolamentos, correias, lubrificação, ajustes e reparos." },
    { valor: "Máquinas de costura", nome: "Máquinas de costura", descricao: "Serviços relacionados a máquinas de costura, como regulagem, lubrificação, troca de peças e reparos." },
    { valor: "Manutenção Civil", nome: "Manutenção Civil", descricao: "Serviços relacionados à estrutura física da empresa, como paredes, pisos, telhados, pintura, hidráulica e instalações." },
    { valor: "Metalúrgica", nome: "Metalúrgica", descricao: "Serviços relacionados a estruturas e peças metálicas, soldagem, cortes, fabricação e reparos em componentes de metal." }
]);

const seletorSetorOS = configurarSeletorOS("setor", [
    ...["Serraria", "Espumação", "Bordado", "Almofada", "Colchão", "Laminação", "Tapeçaria", "Corte", "Costura"]
        .map(nome => ({ valor: nome, nome })),
    { valor: "OUTRO", nome: "Outro" }
], valor => {
    const outro = valor === "OUTRO";
    const grupo = document.getElementById("grupoSetorOutro");
    const campoOutro = document.getElementById("setorOutro");
    grupo.hidden = !outro;
    campoOutro.disabled = !outro;
    campoOutro.required = outro;
    if (outro) campoOutro.focus();
    else campoOutro.value = "";
});

const seletorPrioridadeOS = configurarSeletorOS("prioridade", [
    { valor: "Normal", nome: "Normal" },
    { valor: "Urgente", nome: "Urgente" }
]);
