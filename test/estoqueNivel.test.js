const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const vm = require("node:vm");

test("estoque igual ao mínimo não é contado nem sinalizado como baixo", () => {
  const elementos = new Map();
  function elemento(id) {
    if (!elementos.has(id)) elementos.set(id, {
      textContent: "", innerHTML: "", hidden: false, style: { removeProperty() {}, setProperty() {} },
      addEventListener() {}, setAttribute() {}, querySelectorAll: () => []
    });
    return elementos.get(id);
  }
  const contexto = vm.createContext({
    document: { getElementById: elemento },
    window: { addEventListener() {} },
    verificarLogin: () => ({ perfil: "admin" }),
    requisicaoEstoque: () => new Promise(() => {}),
    numero: String,
    cancelarAnimationFrame() {},
    requestAnimationFrame() {},
    console
  });
  vm.runInContext(fs.readFileSync(require.resolve("../public/js/estoque.js"), "utf8"), contexto);
  vm.runInContext(`
    produtosEstoque.splice(0, produtosEstoque.length,
      { estoque_atual: 9, estoque_minimo: 10 },
      { estoque_atual: 10, estoque_minimo: 10 }
    );
    atualizarResumo();
  `, contexto);

  assert.equal(elemento("produtosBaixos").textContent, 1);
  assert.match(elemento("alertaEstoque").innerHTML, /1 produto está abaixo do estoque mínimo/);
  assert.equal(vm.runInContext("classeSaldo({ estoque_atual: 9, estoque_minimo: 10 })", contexto), "baixo");
  assert.equal(vm.runInContext("classeSaldo({ estoque_atual: 10, estoque_minimo: 10 })", contexto), "atencao");
});
