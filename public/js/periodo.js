/* Seletor compartilhado: preserva os campos originais usados pelas consultas. */
(() => {
    const pares = [
        ['data-inicio-painel', 'data-fim-painel', 'Período de criação'],
        ['data-inicio-historico', 'data-fim-historico', 'Período'],
        ['data-inicio-relatorio', 'data-fim-relatorio', 'Período'],
        ['data-inicio-retiradas', 'data-fim-retiradas', 'Período de retirada'],
        ['inicioHistorico', 'fimHistorico', 'Período de retirada']
    ];
    const iso = data => `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, '0')}-${String(data.getDate()).padStart(2, '0')}`;
    const dataLocal = valor => new Date(`${valor}T12:00:00`);
    const curta = valor => valor.split('-').reverse().join('/');
    const meses = Array.from({ length: 12 }, (_, mes) => new Date(2026, mes, 1).toLocaleDateString('pt-BR', { month: 'long' }));

    for (const [idInicio, idFim, titulo] of pares) {
        const inicio = document.getElementById(idInicio);
        const fim = document.getElementById(idFim);
        if (!inicio || !fim) continue;
        const grupo = document.createElement('div');
        grupo.className = 'form-group periodo-campo';
        grupo.innerHTML = `<label id="${idInicio}-rotulo" for="${idInicio}-abrir">${titulo}</label><button type="button" class="periodo-abrir" id="${idInicio}-abrir" aria-haspopup="dialog"><span aria-hidden="true">▦</span><span class="periodo-valor"></span><span aria-hidden="true">⌄</span></button>`;
        inicio.closest('.form-group').before(grupo);
        for (const campo of [inicio, fim]) campo.closest('.form-group').hidden = true;
        const abrir = grupo.querySelector('button');
        const atualizar = () => {
            grupo.querySelector('.periodo-valor').textContent = inicio.value && fim.value ? `${curta(inicio.value)} → ${curta(fim.value)}` : inicio.value ? `A partir de ${curta(inicio.value)}` : fim.value ? `Até ${curta(fim.value)}` : 'Todos os períodos';
        };
        const dialogo = document.createElement('dialog');
        dialogo.className = 'periodo-menu';
        dialogo.setAttribute('aria-labelledby', `${idInicio}-titulo`);
        dialogo.innerHTML = `<div class="periodo-topo"><strong id="${idInicio}-titulo">${titulo}</strong><button type="button" data-fechar aria-label="Fechar calendário">×</button></div>
            <div class="periodo-atalhos">${['Hoje', 'Últimos 7 dias', 'Últimos 30 dias', 'Este mês', 'Mês passado'].map((nome, i) => `<button type="button" data-atalho="${i}">${nome}</button>`).join('')}</div>
            <div class="periodo-navegacao"><button type="button" data-anterior aria-label="Mês anterior">‹</button><select aria-label="Mês">${meses.map((mes, i) => `<option value="${i}">${mes}</option>`).join('')}</select><input type="number" min="1" max="9999" aria-label="Ano"><button type="button" data-proximo aria-label="Próximo mês">›</button></div>
            <div class="periodo-semana" aria-hidden="true">${['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(dia => `<span>${dia}</span>`).join('')}</div>
            <div class="periodo-dias" role="group" aria-label="Dias do mês"></div>
            <p class="periodo-ajuda" aria-live="polite"></p>
            <div class="periodo-rodape"><button type="button" data-limpar>Limpar</button><button type="button" data-aplicar>Aplicar</button></div>`;
        document.body.append(dialogo);
        let primeiro = '', ultimo = '', mesVisivel;
        const mes = dialogo.querySelector('select');
        const ano = dialogo.querySelector('input');
        const dias = dialogo.querySelector('.periodo-dias');
        const aplicar = dialogo.querySelector('[data-aplicar]');
        function renderizar() {
            mes.value = mesVisivel.getMonth();
            ano.value = mesVisivel.getFullYear();
            dias.replaceChildren();
            const base = new Date(mesVisivel);
            base.setDate(1 - base.getDay());
            for (let i = 0; i < 42; i++) {
                const data = new Date(base);
                data.setDate(base.getDate() + i);
                const valor = iso(data);
                const botao = document.createElement('button');
                botao.type = 'button';
                botao.textContent = data.getDate();
                botao.dataset.data = valor;
                botao.className = [data.getMonth() !== mesVisivel.getMonth() ? 'outro-mes' : '', valor === primeiro || valor === ultimo ? 'selecionado' : '', primeiro && ultimo && valor > primeiro && valor < ultimo ? 'no-intervalo' : ''].join(' ');
                botao.setAttribute('aria-label', data.toLocaleDateString('pt-BR', { dateStyle: 'full' }));
                botao.setAttribute('aria-pressed', String(valor === primeiro || valor === ultimo || !!(primeiro && ultimo && valor > primeiro && valor < ultimo)));
                if (valor === iso(new Date())) botao.setAttribute('aria-current', 'date');
                dias.append(botao);
            }
            dialogo.querySelector('.periodo-ajuda').textContent = primeiro && ultimo ? `${curta(primeiro)} → ${curta(ultimo)}` : primeiro ? `${curta(primeiro)} — selecione a data final` : 'Selecione a data inicial e depois a final.';
            aplicar.disabled = !(primeiro && ultimo);
        }
        function salvar(a, b) {
            inicio.value = a;
            fim.value = b;
            atualizar();
            for (const campo of [inicio, fim]) {
                campo.dispatchEvent(new Event('input', { bubbles: true }));
                campo.dispatchEvent(new Event('change', { bubbles: true }));
            }
            dialogo.close();
        }
        abrir.addEventListener('click', () => {
            primeiro = inicio.value;
            ultimo = fim.value;
            mesVisivel = primeiro ? dataLocal(primeiro) : new Date();
            mesVisivel.setDate(1);
            renderizar();
            dialogo.showModal();
        });
        dialogo.querySelector('[data-fechar]').addEventListener('click', () => dialogo.close());
        dialogo.addEventListener('click', evento => {
            if (evento.target === dialogo) {
                const r = dialogo.getBoundingClientRect();
                if (evento.clientX < r.left || evento.clientX > r.right || evento.clientY < r.top || evento.clientY > r.bottom) dialogo.close();
            }
        });
        dialogo.addEventListener('close', () => abrir.focus());
        dias.addEventListener('click', evento => {
            const valor = evento.target.dataset.data;
            if (!valor) return;
            if (!primeiro || ultimo) { primeiro = valor; ultimo = ''; }
            else if (valor < primeiro) { ultimo = primeiro; primeiro = valor; }
            else ultimo = valor;
            renderizar();
            dias.querySelector(`[data-data="${valor}"]`)?.focus();
        });
        dias.addEventListener('keydown', evento => {
            const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
            if (!(evento.key in passos) || !evento.target.dataset.data) return;
            evento.preventDefault();
            const data = dataLocal(evento.target.dataset.data);
            data.setDate(data.getDate() + passos[evento.key]);
            mesVisivel = new Date(data); mesVisivel.setDate(1);
            renderizar();
            dias.querySelector(`[data-data="${iso(data)}"]`)?.focus();
        });
        for (const [seletor, passo] of [['[data-anterior]', -1], ['[data-proximo]', 1]]) {
            dialogo.querySelector(seletor).addEventListener('click', () => {
                const proximo = new Date(mesVisivel); proximo.setMonth(proximo.getMonth() + passo);
                if (proximo.getFullYear() < 1 || proximo.getFullYear() > 9999) return;
                mesVisivel = proximo; renderizar();
            });
        }
        mes.addEventListener('change', () => { mesVisivel.setMonth(Number(mes.value)); renderizar(); });
        ano.addEventListener('change', () => {
            if (!ano.checkValidity() || !ano.value) { ano.value = mesVisivel.getFullYear(); return; }
            mesVisivel.setFullYear(Number(ano.value)); renderizar();
        });
        dialogo.querySelectorAll('[data-atalho]').forEach(botao => botao.addEventListener('click', () => {
            const a = new Date(), b = new Date();
            const atalho = Number(botao.dataset.atalho);
            if (atalho === 1) a.setDate(a.getDate() - 6);
            if (atalho === 2) a.setDate(a.getDate() - 29);
            if (atalho === 3) { a.setDate(1); b.setMonth(b.getMonth() + 1, 0); }
            if (atalho === 4) { a.setDate(1); a.setMonth(a.getMonth() - 1); b.setDate(0); }
            primeiro = iso(a); ultimo = iso(b); mesVisivel = new Date(a); mesVisivel.setDate(1); renderizar();
        }));
        aplicar.addEventListener('click', () => salvar(primeiro, ultimo));
        dialogo.querySelector('[data-limpar]').addEventListener('click', () => salvar('', ''));
        for (const campo of [inicio, fim]) campo.addEventListener('change', atualizar);
        inicio.form?.addEventListener('reset', () => setTimeout(atualizar, 0));
        inicio.form?.addEventListener('click', evento => {
            if (evento.target.closest('[id^="btn-limpar-filtros"]')) setTimeout(atualizar, 0);
        });
        atualizar();
    }
})();
