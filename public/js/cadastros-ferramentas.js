(() => {
    const perfil = verificarLogin()?.perfil;
    if (!["admin", "almoxarifado"].includes(perfil)) return;
    const el = id => document.getElementById(id);
    const api = FerramentasAPI;
    let ferramentas = [];
    let salvando = false;

    function desenhar() {
        const busca = el("buscaFerramenta").value.trim().toLocaleLowerCase("pt-BR");
        const filtradas = ferramentas.filter(f => api.nome(f).toLocaleLowerCase("pt-BR").includes(busca));
        el("listaFerramentas").innerHTML = filtradas.map(f => `<tr>
            <td>${api.numero(f.id)}</td><td>${escaparTexto(f.tipo)}</td><td>${escaparTexto(f.marca)}</td>
            <td><span class="ferramentas-situacao ${f.disponivel ? "disponivel" : "emprestada"}">${f.disponivel ? "Disponível" : "Emprestada"}</span></td>
            <td><button type="button" class="btn-secundario" data-editar="${f.id}" ${salvando ? "disabled" : ""}>Editar</button></td>
        </tr>`).join("") || '<tr><td colspan="5" class="estado-tabela">Nenhuma ferramenta encontrada.</td></tr>';
    }

    async function carregar() {
        ferramentas = await api.requisicao();
        desenhar();
    }

    function limpar() {
        el("formFerramenta").reset();
        el("numeroFerramenta").value = "Gerado ao cadastrar";
    }

    el("formFerramenta").addEventListener("submit", async evento => {
        evento.preventDefault();
        if (salvando) return;
        const tipo = el("tipoFerramenta").value.trim();
        const marca = el("marcaFerramenta").value.trim();
        if (!tipo || !marca) return api.mensagem("Preencha o tipo e a marca.", true);
        salvando = true;
        for (const campo of el("formFerramenta").elements) campo.disabled = true;
        desenhar();
        api.mensagem("");
        try {
            const { ferramenta } = await api.requisicao("", {
                method: "POST", body: JSON.stringify({ tipo, marca })
            });
            limpar();
            api.mensagem(`Ferramenta ${api.numero(ferramenta.id)} cadastrada com sucesso.`);
            try { await carregar(); } catch { api.mensagem("Cadastro salvo. Não foi possível atualizar a lista; recarregue a página.", true); }
        } catch (erro) { api.mensagem(erro.message, true); }
        finally {
            salvando = false;
            for (const campo of el("formFerramenta").elements) campo.disabled = false;
            desenhar();
        }
    });

    el("listaFerramentas").addEventListener("click", evento => {
        const botao = evento.target.closest("[data-editar]");
        if (!botao || salvando) return;
        const ferramenta = ferramentas.find(f => String(f.id) === botao.dataset.editar);
        if (!ferramenta) return;
        editarFerramenta(ferramenta);
    });

    function editarFerramenta(ferramenta) {
        if (el("modalEditarFerramenta")) return;
        const overlay = document.createElement("div");
        overlay.id = "modalEditarFerramenta";
        overlay.className = "os-modal-overlay";
        overlay.innerHTML = `
            <form class="os-modal estoque-modal-editar" role="dialog" aria-modal="true" aria-labelledby="tituloEditarFerramenta">
                <div class="os-modal-topo"><h2 id="tituloEditarFerramenta">Editar ferramenta</h2><button type="button" class="os-modal-fechar" aria-label="Fechar">&times;</button></div>
                <div class="form-group"><label for="editarNumeroFerramenta">Número de identificação</label><input id="editarNumeroFerramenta" class="os-modal-campo" readonly></div>
                <div class="form-group"><label for="editarTipoFerramenta">Tipo</label><input id="editarTipoFerramenta" class="os-modal-campo" maxlength="100" required></div>
                <div class="form-group"><label for="editarMarcaFerramenta">Marca</label><input id="editarMarcaFerramenta" class="os-modal-campo" maxlength="100" required></div>
                <p class="os-modal-erro" role="alert"></p>
                <div class="os-modal-acoes"><button type="button" class="os-modal-btn os-modal-btn-secundario">Cancelar</button><button type="submit" class="os-modal-btn os-modal-btn-principal">Salvar alterações</button></div>
            </form>`;
        const form = overlay.querySelector("form");
        const tipo = overlay.querySelector("#editarTipoFerramenta");
        const marca = overlay.querySelector("#editarMarcaFerramenta");
        const erroCampo = overlay.querySelector(".os-modal-erro");
        const salvar = overlay.querySelector('[type="submit"]');
        overlay.querySelector("#editarNumeroFerramenta").value = api.numero(ferramenta.id);
        tipo.value = ferramenta.tipo;
        marca.value = ferramenta.marca;
        let enviando = false;
        let fechado = false;
        function fechar() {
            if (enviando || fechado) return;
            fechado = true;
            document.removeEventListener("keydown", teclado);
            overlay.remove();
            (document.querySelector(`[data-editar="${ferramenta.id}"]`) || el("buscaFerramenta")).focus();
        }
        function teclado(evento) {
            if (evento.key === "Escape") { evento.preventDefault(); fechar(); }
            if (evento.key !== "Tab") return;
            const controles = [...form.elements].filter(campo => !campo.disabled);
            const primeiro = controles[0];
            const ultimo = controles[controles.length - 1];
            if (!primeiro) { evento.preventDefault(); return; }
            if (evento.shiftKey && document.activeElement === primeiro) {
                evento.preventDefault(); ultimo.focus();
            } else if (!evento.shiftKey && document.activeElement === ultimo) {
                evento.preventDefault(); primeiro.focus();
            }
        }
        form.addEventListener("submit", async evento => {
            evento.preventDefault();
            if (enviando || fechado) return;
            erroCampo.textContent = "";
            if (!tipo.value.trim() || !marca.value.trim()) {
                erroCampo.textContent = "Preencha o tipo e a marca.";
                (!tipo.value.trim() ? tipo : marca).focus();
                return;
            }
            enviando = true;
            for (const campo of form.elements) campo.disabled = true;
            salvar.textContent = "Salvando...";
            form.setAttribute("aria-busy", "true");
            try {
                const { ferramenta: atualizada } = await api.requisicao(`/${ferramenta.id}`, {
                    method: "PUT", body: JSON.stringify({ tipo: tipo.value.trim(), marca: marca.value.trim() })
                });
                ferramentas = ferramentas.map(item => item.id === ferramenta.id ? { ...item, ...atualizada } : item);
                desenhar();
                api.mensagem(`Ferramenta ${api.numero(ferramenta.id)} atualizada com sucesso.`);
                enviando = false;
                fechar();
            } catch (erro) {
                erroCampo.textContent = erro.message;
            } finally {
                enviando = false;
                for (const campo of form.elements) campo.disabled = false;
                salvar.textContent = "Salvar alterações";
                form.removeAttribute("aria-busy");
                if (!fechado) tipo.focus();
            }
        });
        overlay.querySelector(".os-modal-fechar").addEventListener("click", fechar);
        overlay.querySelector(".os-modal-btn-secundario").addEventListener("click", fechar);
        overlay.addEventListener("click", evento => { if (evento.target === overlay) fechar(); });
        document.addEventListener("keydown", teclado);
        document.body.appendChild(overlay);
        overlay.classList.add("os-modal-visivel");
        tipo.focus();
    }
    el("buscaFerramenta").addEventListener("input", desenhar);
    carregar().catch(erro => {
        el("listaFerramentas").innerHTML = '<tr><td colspan="5" class="estado-tabela">Não foi possível carregar. Recarregue a página para tentar novamente.</td></tr>';
        api.mensagem(erro.message, true);
    });
})();
