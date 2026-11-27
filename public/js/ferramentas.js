(() => {
    const el = id => document.getElementById(id);
    const api = FerramentasAPI;
    let emprestimos = [];
    let ocupada = false;
    let pagina = 1;
    let consultaAtual = 0;
    let filtros = {};
    const seletorFerramenta = configurarSeletorFerramentas("ferramentaRetirada");
    const seletorFuncionario = configurarSeletorFerramentas("funcionarioRetirada", {
        outro: true,
        aoSelecionar(valor) {
            const outro = valor === "OUTRO";
            el("grupoOutroFuncionario").hidden = !outro;
            el("outroFuncionarioNome").disabled = !outro;
            el("outroFuncionarioNome").required = outro;
            if (!outro) el("outroFuncionarioNome").value = "";
        }
    });

    async function carregarOperacao() {
        el("registrarRetirada").disabled = true;
        seletorFerramenta.bloquear();
        seletorFuncionario.bloquear();
        el("tentarNovamenteFerramentas").hidden = true;
        const [ferramentas, funcionarios, registros] = await Promise.all([
            api.requisicao(), api.requisicao("/funcionarios"), api.requisicao("/emprestimos")
        ]);
        emprestimos = registros;
        const disponiveis = ferramentas.filter(f => f.disponivel);
        seletorFerramenta.definirOpcoes(disponiveis.map(f => ({ valor: f.id, nome: api.nome(f) })), "Nenhuma ferramenta disponível");
        seletorFuncionario.definirOpcoes(funcionarios.map(f => ({ valor: f.id, nome: f.nome })), "Nenhum funcionário ativo");
        el("registrarRetirada").disabled = !disponiveis.length;
        el("listaEmprestimos").innerHTML = registros.map(r => `<tr>
            <td>${escaparTexto(api.nome(r))}</td><td>${escaparTexto(r.funcionario_nome)}</td><td>${api.data(r.retirado_em)}</td>
            <td><button type="button" class="btn-secundario" data-devolver="${r.id}">Devolver</button></td>
        </tr>`).join("") || '<tr><td colspan="4" class="estado-tabela">Nenhuma ferramenta emprestada.</td></tr>';
    }

    async function atualizar() {
        try { await carregarOperacao(); }
        catch (erro) {
            el("listaEmprestimos").innerHTML = '<tr><td colspan="4" class="estado-tabela">Não foi possível carregar os empréstimos.</td></tr>';
            el("tentarNovamenteFerramentas").hidden = false;
            api.mensagem(erro.message, true);
        }
    }

    el("formRetirada").addEventListener("submit", async evento => {
        evento.preventDefault();
        if (ocupada || el("registrarRetirada").disabled) return;
        const ferramentaId = el("ferramentaRetirada").value;
        const funcionarioId = el("funcionarioRetirada").value;
        const funcionarioNome = el("outroFuncionarioNome").value.trim();
        if (!ferramentaId || !funcionarioId) return api.mensagem("Selecione a ferramenta e o funcionário.", true);
        if (funcionarioId === "OUTRO" && !funcionarioNome) return api.mensagem("Informe o nome de quem retirou.", true);
        ocupada = true;
        el("registrarRetirada").disabled = true;
        seletorFerramenta.bloquear();
        seletorFuncionario.bloquear();
        api.mensagem("");
        try {
            await api.requisicao("/emprestimos", { method: "POST", body: JSON.stringify({
                ferramentaId, funcionarioId, ...(funcionarioId === "OUTRO" ? { funcionarioNome } : {})
            }) });
            el("formRetirada").reset();
            seletorFerramenta.limpar();
            seletorFuncionario.limpar();
            api.mensagem("Retirada registrada com sucesso.");
        } catch (erro) { api.mensagem(erro.message, true); }
        finally { await atualizar(); ocupada = false; }
    });

    el("listaEmprestimos").addEventListener("click", async evento => {
        const botao = evento.target.closest("[data-devolver]");
        if (!botao || ocupada) return;
        const registro = emprestimos.find(r => String(r.id) === botao.dataset.devolver);
        if (!registro) return;
        ocupada = true;
        botao.disabled = true;
        try {
            if (!await mostrarConfirmacao("Confirmar devolução", `Confirmar o retorno de ${api.nome(registro)}, retirada por ${registro.funcionario_nome}?`)) return;
            await api.requisicao(`/emprestimos/${registro.id}/devolver`, { method: "PUT" });
            api.mensagem("Devolução registrada. O empréstimo está disponível no Histórico.");
            await atualizar();
        } catch (erro) { api.mensagem(erro.message, true); await atualizar(); }
        finally { ocupada = false; botao.disabled = false; }
    });

    el("tentarNovamenteFerramentas").addEventListener("click", async () => {
        if (ocupada) return;
        ocupada = true;
        el("tentarNovamenteFerramentas").disabled = true;
        api.mensagem("");
        await atualizar();
        ocupada = false;
        el("tentarNovamenteFerramentas").disabled = false;
    });

    async function carregarHistorico(destino = 1) {
        const consulta = ++consultaAtual;
        el("historicoAnterior").disabled = true;
        el("historicoProxima").disabled = true;
        el("paginaHistorico").textContent = "";
        el("listaHistorico").innerHTML = '<tr><td colspan="4" class="estado-tabela">Carregando histórico...</td></tr>';
        try {
            const dados = await api.requisicao(`/historico?${new URLSearchParams({ ...filtros, pagina: destino })}`);
            if (consulta !== consultaAtual) return;
            pagina = dados.pagina;
            el("listaHistorico").innerHTML = dados.registros.map(r => `<tr>
                <td>${escaparTexto(api.nome(r))}</td><td>${escaparTexto(r.funcionario_nome)}</td>
                <td>${api.data(r.retirado_em)}</td><td>${api.data(r.devolvido_em)}</td>
            </tr>`).join("") || '<tr><td colspan="4" class="estado-tabela">Nenhum empréstimo concluído encontrado.</td></tr>';
            el("paginaHistorico").textContent = `Página ${pagina}`;
            el("historicoAnterior").disabled = pagina <= 1;
            el("historicoProxima").disabled = !dados.temProxima;
        } catch (erro) {
            if (consulta !== consultaAtual) return;
            el("listaHistorico").innerHTML = '<tr><td colspan="4" class="estado-tabela">Não foi possível carregar. Clique em Pesquisar para tentar novamente.</td></tr>';
            api.mensagem(erro.message, true);
        }
    }

    const abas = [el("abaRetiradas"), el("abaHistorico")];
    function selecionarAba(indice) {
        abas.forEach((aba, i) => {
            aba.setAttribute("aria-selected", String(i === indice));
            aba.tabIndex = i === indice ? 0 : -1;
        });
        document.querySelector(".relatorios-seletor").dataset.aba = indice ? "historico" : "retiradas";
        el("painelRetiradas").hidden = indice !== 0;
        el("painelHistorico").hidden = indice !== 1;
        api.mensagem("");
        if (indice === 1) carregarHistorico(1);
    }
    abas.forEach((aba, i) => {
        aba.addEventListener("click", () => selecionarAba(i));
        aba.addEventListener("keydown", evento => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(evento.key)) return;
            evento.preventDefault();
            const indice = evento.key === "Home" ? 0 : evento.key === "End" ? 1 : 1 - i;
            abas[indice].focus();
            selecionarAba(indice);
        });
    });
    el("formHistorico").addEventListener("submit", evento => {
        evento.preventDefault();
        const inicio = el("inicioHistorico").value;
        const fim = el("fimHistorico").value;
        if (inicio && fim && inicio > fim) return api.mensagem("A data inicial não pode ser posterior à final.", true);
        api.mensagem("");
        filtros = { busca: el("buscaHistorico").value.trim(), inicio, fim };
        carregarHistorico(1);
    });
    el("historicoAnterior").addEventListener("click", () => carregarHistorico(pagina - 1));
    el("historicoProxima").addEventListener("click", () => carregarHistorico(pagina + 1));
    atualizar();
})();
