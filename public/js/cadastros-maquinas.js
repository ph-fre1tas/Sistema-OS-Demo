(() => {
    const el = id => document.getElementById(id);
    const perfil = verificarLogin()?.perfil;
    const podeEditar = ["admin", "almoxarifado"].includes(perfil);
    const seletor = document.querySelector(".cadastros-seletor");
    const abaFerramentas = el("abaCadastroFerramentas");
    const abaMaquinas = el("abaCadastroMaquinas");
    const painelFerramentas = el("painelCadastroFerramentas");
    const painelMaquinas = el("painelCadastroMaquinas");
    const lista = el("listaMaquinas");
    const form = el("formMaquina");
    let maquinas = [];
    let carregando = false;
    let editandoCodigo = null;

    async function requisicao(caminho = "", opcoes = {}) {
        const resposta = await fetch(`/api/maquinas${caminho}`, {
            ...opcoes,
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${localStorage.getItem("token")}` }
        });
        if (respostaSessaoExpirada(resposta)) throw new Error("Sessão inválida.");
        const dados = await resposta.json().catch(() => ({}));
        if (!resposta.ok) throw new Error(dados.erro || "Não foi possível concluir a operação.");
        return dados;
    }

    function mensagem(texto, erro = false) {
        const elemento = el("mensagemMaquinas");
        elemento.textContent = texto;
        elemento.classList.toggle("erro", erro);
        elemento.hidden = !texto;
    }

    function selecionarAba(nome) {
        const ferramentasAtiva = nome === "ferramentas";
        seletor.dataset.aba = ferramentasAtiva ? "ferramentas" : "maquinas";
        abaFerramentas.setAttribute("aria-selected", String(ferramentasAtiva));
        abaMaquinas.setAttribute("aria-selected", String(!ferramentasAtiva));
        abaFerramentas.tabIndex = ferramentasAtiva ? 0 : -1;
        abaMaquinas.tabIndex = ferramentasAtiva ? -1 : 0;
        painelFerramentas.hidden = !ferramentasAtiva;
        painelMaquinas.hidden = ferramentasAtiva;
        el("descricaoAbaCadastro").textContent = ferramentasAtiva ? "Ferramentas" : "Máquinas";
        if (!ferramentasAtiva) carregar().catch(erro => mensagem(erro.message, true));
    }

    function desenhar() {
        const busca = el("buscaMaquina").value.trim().toLocaleLowerCase("pt-BR");
        const filtradas = maquinas.filter(maquina =>
            [maquina.codigo, maquina.nome, maquina.modelo, maquina.marca]
                .some(valor => String(valor || "").toLocaleLowerCase("pt-BR").includes(busca))
        );
        lista.innerHTML = filtradas.map(maquina => `<tr>
            <td>${escaparTexto(maquina.codigo)}</td><td>${escaparTexto(maquina.nome)}</td>
            <td>${escaparTexto(maquina.modelo || "—")}</td><td>${escaparTexto(maquina.marca || "—")}</td>
            <td><div class="ferramentas-acoes"><button type="button" class="btn-secundario" data-ver-maquina="${escaparTexto(maquina.codigo)}">Ver mais</button></div></td>
        </tr>`).join("") || '<tr><td colspan="5" class="estado-tabela">Nenhuma máquina encontrada.</td></tr>';
    }

    async function carregar() {
        carregando = true;
        lista.innerHTML = '<tr><td colspan="5" class="estado-tabela">Carregando máquinas...</td></tr>';
        try {
            maquinas = await requisicao();
            desenhar();
        } finally { carregando = false; }
    }

    function mostrarFormulario(maquina = null) {
        editandoCodigo = maquina?.codigo ?? null;
        el("tituloFormularioMaquina").textContent = maquina ? "Editar máquina" : "Cadastrar máquina";
        el("salvarMaquina").textContent = maquina ? "Salvar alterações" : "Cadastrar máquina";
        el("codigoMaquina").value = maquina?.codigo || "";
        el("codigoMaquina").readOnly = Boolean(maquina);
        el("nomeMaquina").value = maquina?.nome || "";
        el("setorMaquina").value = maquina?.setor || "";
        el("marcaMaquina").value = maquina?.marca || "";
        el("modeloMaquina").value = maquina?.modelo || "";
        el("fotoMaquina").value = nomeArquivoFoto(maquina?.foto || "");
        el("observacoesMaquina").value = maquina?.observacoes || "";
        el("formularioMaquinaPainel").hidden = false;
        el("codigoMaquina").focus();
        el("formularioMaquinaPainel").scrollIntoView({ behavior: "smooth", block: "start" });
    }

    function limparFormulario() {
        form.reset();
        editandoCodigo = null;
        el("codigoMaquina").readOnly = false;
        el("tituloFormularioMaquina").textContent = "Cadastrar máquina";
        el("salvarMaquina").textContent = "Cadastrar máquina";
        el("formularioMaquinaPainel").hidden = true;
    }

    async function abrirDetalhes(codigo) {
        const maquina = await requisicao(`/${encodeURIComponent(codigo)}`);
        const nomeFoto = nomeArquivoFoto(maquina.foto || "");
        const overlay = document.createElement("div");
        overlay.className = "os-modal-overlay";
        overlay.id = "modalDetalhesMaquina";
        const foto = nomeFoto
            ? `<img class="maquinas-foto-detalhe" src="/assets/maquinas/${encodeURIComponent(nomeFoto)}" alt="Foto de ${escaparTexto(maquina.nome)}" onerror="this.hidden=true; this.nextElementSibling.hidden=false"><p class="maquinas-foto-ausente" hidden>Foto não encontrada.</p>`
            : '<div class="maquinas-foto-vazia">Foto não cadastrada</div>';
        overlay.innerHTML = `<section class="os-modal maquinas-modal-detalhe" role="dialog" aria-modal="true" aria-labelledby="tituloDetalhesMaquina">
            <div class="os-modal-topo"><h2 id="tituloDetalhesMaquina">${escaparTexto(maquina.nome)}</h2><button type="button" class="os-modal-fechar" aria-label="Fechar">&times;</button></div>
            ${foto}
            <dl class="maquinas-detalhes-grid">
                <div><dt>ID</dt><dd>${escaparTexto(maquina.codigo)}</dd></div>
                <div><dt>Setor</dt><dd>${escaparTexto(maquina.setor || "—")}</dd></div>
                <div><dt>Marca</dt><dd>${escaparTexto(maquina.marca || "—")}</dd></div>
                <div><dt>Modelo</dt><dd>${escaparTexto(maquina.modelo || "—")}</dd></div>
            </dl>
            <div class="maquinas-observacoes"><h3>Observações</h3><p>${escaparTexto(maquina.observacoes || "Nenhuma observação cadastrada.")}</p></div>
            <div class="maquinas-historico"><h3>OS vinculadas</h3><p>Nenhuma OS vinculada até o momento.</p></div>
            <div class="os-modal-acoes"><button type="button" class="os-modal-btn os-modal-btn-secundario" data-fechar>Fechar</button>${podeEditar ? '<button type="button" class="os-modal-btn os-modal-btn-principal" data-editar-maquina>Editar cadastro</button>' : ""}</div>
        </section>`;
        const fechar = () => { document.removeEventListener("keydown", teclado); overlay.remove(); };
        const teclado = evento => { if (evento.key === "Escape") fechar(); };
        overlay.querySelectorAll(".os-modal-fechar, [data-fechar]").forEach(botao => botao.addEventListener("click", fechar));
        overlay.querySelector("[data-editar-maquina]")?.addEventListener("click", () => { fechar(); mostrarFormulario(maquina); });
        overlay.addEventListener("click", evento => { if (evento.target === overlay) fechar(); });
        document.addEventListener("keydown", teclado);
        document.body.appendChild(overlay);
        overlay.classList.add("os-modal-visivel");
        overlay.querySelector(".os-modal-fechar").focus();
    }

    function nomeArquivoFoto(valor) {
        return String(valor || "").split(/[\\/]/).pop();
    }

    abaFerramentas.addEventListener("click", () => selecionarAba("ferramentas"));
    abaMaquinas.addEventListener("click", () => selecionarAba("maquinas"));
    abaFerramentas.addEventListener("keydown", evento => {
        if (evento.key === "ArrowRight") { evento.preventDefault(); abaMaquinas.focus(); selecionarAba("maquinas"); }
    });
    abaMaquinas.addEventListener("keydown", evento => {
        if (evento.key === "ArrowLeft") { evento.preventDefault(); abaFerramentas.focus(); selecionarAba("ferramentas"); }
    });
    el("novaMaquina").addEventListener("click", () => mostrarFormulario());
    el("cancelarMaquina").addEventListener("click", limparFormulario);
    el("buscaMaquina").addEventListener("input", desenhar);
    lista.addEventListener("click", evento => {
        const botao = evento.target.closest("[data-ver-maquina]");
        if (!botao || carregando) return;
        abrirDetalhes(botao.dataset.verMaquina).catch(erro => mensagem(erro.message, true));
    });

    form.addEventListener("submit", async evento => {
        evento.preventDefault();
        const body = {
            codigo: el("codigoMaquina").value.trim(), nome: el("nomeMaquina").value.trim(),
            setor: el("setorMaquina").value.trim(), marca: el("marcaMaquina").value.trim(),
            modelo: el("modeloMaquina").value.trim(), foto: el("fotoMaquina").value.trim(),
            observacoes: el("observacoesMaquina").value.trim()
        };
        const botao = el("salvarMaquina");
        botao.disabled = true;
        mensagem("");
        try {
            if (editandoCodigo) {
                await requisicao(`/${encodeURIComponent(editandoCodigo)}`, { method: "PUT", body: JSON.stringify(body) });
                mensagem("Máquina atualizada com sucesso.");
            } else {
                await requisicao("", { method: "POST", body: JSON.stringify(body) });
                mensagem("Máquina cadastrada com sucesso.");
            }
            limparFormulario();
            await carregar();
        } catch (erro) { mensagem(erro.message, true); }
        finally { botao.disabled = false; }
    });

    el("novaMaquina").hidden = !podeEditar;
    abaFerramentas.hidden = !podeEditar;
    if (!podeEditar) {
        painelFerramentas.hidden = true;
        painelMaquinas.hidden = false;
        seletor.hidden = true;
        el("descricaoAbaCadastro").textContent = "Máquinas";
    }
    if (podeEditar) carregar().catch(erro => {
        lista.innerHTML = '<tr><td colspan="5" class="estado-tabela">Não foi possível carregar máquinas. Tente novamente.</td></tr>';
        mensagem(erro.message, true);
    });
    if (!podeEditar) carregar().catch(erro => {
        lista.innerHTML = '<tr><td colspan="5" class="estado-tabela">Não foi possível carregar máquinas. Tente novamente.</td></tr>';
        mensagem(erro.message, true);
    });
})();
