const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function preparar(outro) {
    const doc = { handlers: {}, addEventListener(n, fn) { this.handlers[n] = fn; } };
    const criar = () => ({ value: "", hidden: true, disabled: false, children: [], handlers: {}, atributos: {},
        addEventListener(n, fn) { this.handlers[n] = fn; },
        setAttribute(n, v) { this.atributos[n] = v; },
        replaceChildren(...itens) { this.children = itens; },
        focus() { doc.activeElement = this; }, contains() { return false; }
    });
    const campo = criar(), botao = criar(), legenda = criar(), menu = criar(), busca = criar(), lista = criar(), estado = criar();
    botao.querySelector = () => legenda;
    botao.closest = () => ({ contains: target => [campo, botao, menu, busca, ...lista.children].includes(target) });
    menu.querySelector = s => s === "input" ? busca : s === "[role=status]" ? estado : lista;
    lista.querySelector = () => lista.children[0];
    lista.querySelectorAll = () => lista.children;
    doc.getElementById = id => ({ campo, campoBotao: botao, campoMenu: menu })[id];
    doc.createElement = criar;
    const contexto = { document: doc };
    vm.runInNewContext(fs.readFileSync(require.resolve("../public/js/ferramentas-seletor.js"), "utf8"), contexto);
    const escolhas = [];
    const seletor = contexto.configurarSeletorFerramentas("campo", { outro, aoSelecionar: valor => escolhas.push(valor) });
    return { doc, campo, botao, legenda, menu, busca, lista, estado, seletor, escolhas };
}

test("busca ignora acentos, mantém Outro no fim e permite selecionar por teclado", () => {
    const c = preparar(true);
    c.seletor.definirOpcoes([{ valor: 1, nome: "João Silva" }, { valor: 2, nome: "Maria Souza" }]);
    c.botao.handlers.click();
    assert.equal(c.menu.hidden, false);
    c.busca.value = "joao";
    c.busca.handlers.input();
    assert.deepEqual(Array.from(c.lista.children, item => item.textContent), ["João Silva", "Outro"]);
    c.menu.handlers.keydown({ key: "ArrowDown", preventDefault() {} });
    assert.equal(c.doc.activeElement, c.lista.children[0]);
    c.lista.children[0].handlers.click();
    assert.equal(c.campo.value, "1");
    assert.equal(c.legenda.textContent, "João Silva");
    assert.equal(c.menu.hidden, true);
    c.botao.handlers.click();
    c.busca.value = "inexistente";
    c.busca.handlers.input();
    assert.deepEqual(Array.from(c.lista.children, item => item.textContent), ["Outro"]);
    c.lista.children[0].handlers.click();
    assert.equal(c.escolhas.at(-1), "OUTRO");
    c.seletor.limpar();
    assert.equal(c.campo.value, "");
    c.botao.handlers.click();
    c.menu.handlers.keydown({ key: "Escape", preventDefault() {} });
    assert.equal(c.menu.hidden, true);
    assert.equal(c.doc.activeElement, c.botao);
});

test("ferramentas não têm Outro e perdem a seleção quando deixam de estar disponíveis", () => {
    const c = preparar(false);
    c.seletor.definirOpcoes([{ valor: 4, nome: "004 — Parafusadeira Bosch" }]);
    c.botao.handlers.click();
    c.busca.value = "bosch";
    c.busca.handlers.input();
    assert.equal(c.lista.children.length, 1);
    c.lista.children[0].handlers.click();
    assert.equal(c.campo.value, "4");
    c.seletor.bloquear();
    assert.equal(c.botao.disabled, true);
    c.seletor.definirOpcoes([], "Nenhuma ferramenta disponível");
    assert.equal(c.campo.value, "");
    assert.equal(c.legenda.textContent, "Nenhuma ferramenta disponível");
    assert.equal(c.botao.disabled, true);
    const funcionarios = preparar(true);
    funcionarios.seletor.definirOpcoes([]);
    assert.equal(funcionarios.botao.disabled, false, "Outro funciona mesmo sem funcionários cadastrados");
});
