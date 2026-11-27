const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const { autenticarToken, permitirPerfis } = require('../middleware/authmiddleware');

test('Minhas OS exige líder autenticado e filtra a autoria pelo token inclusive com barra final', async () => {
    const consultas = [];
    const pool = { async query(sql, valores) {
        if (sql.includes('ALTER TABLE')) return { rows: [] };
        if (sql.includes('COUNT(*)::int AS total')) return { rows: [{ total: 0, concluidas: 0, canceladas: 0, urgentes: 0 }] };
        consultas.push({ sql, valores });
        return { rows: valores?.[0] ? [{ id: 7, criado_por_id: valores[0] }] : [] };
    } };
    const modulo = { exports: {} };
    const dependencias = {
        express,
        '../db/db': pool,
        '../middleware/authmiddleware': { autenticarToken, permitirPerfis },
        '../services/osConsultaService': { CAMPOS_PAUSAS_JSON: "'[]'::json AS pausas" },
        '../services/osTempoService': { calcularTemposOS: () => ({}), formatarTemposOS: () => ({}) },
        '../db/errosBanco': { responderErroDoBanco: (res) => res.status(500).json({ erro: 'Banco indisponível' }) }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../routes/osRoutes'), 'utf8'), {
        require: nome => dependencias[nome] || {}, module: modulo, console
    });
    const app = express();
    app.use(express.json());
    app.use('/api/os', modulo.exports);
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise(resolve => servidor.once('listening', resolve));
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'segredo-exclusivo-do-teste';
    const base = `http://127.0.0.1:${servidor.address().port}/api/os`;
    async function buscar(rota, perfil, id = 11) {
        const headers = perfil ? { Authorization: `Bearer ${jwt.sign({ id, perfil }, process.env.JWT_SECRET)}` } : {};
        return fetch(base + rota, { headers });
    }
    try {
        assert.equal((await buscar('/minhas')).status, 401);
        const tokenHs384 = jwt.sign({ id: 11, perfil: 'lider' }, process.env.JWT_SECRET, { algorithm: 'HS384' });
        assert.equal((await fetch(base + '/minhas', { headers: { Authorization: `Bearer ${tokenHs384}` } })).status, 403);
        const tokenValido = jwt.sign({ id: 11, perfil: 'lider' }, process.env.JWT_SECRET, { algorithm: 'HS256' });
        delete process.env.JWT_SECRET;
        assert.equal((await fetch(base + '/minhas', { headers: { Authorization: `Bearer ${tokenValido}` } })).status, 500);
        process.env.JWT_SECRET = 'segredo-exclusivo-do-teste';
        for (const perfil of ['admin', 'manutentor']) assert.equal((await buscar('/minhas', perfil)).status, 403);
        assert.equal(consultas.length, 0);
        for (const rota of ['/minhas?criado_por_id=999', '/minhas/', '/MINHAS']) {
            const res = await buscar(rota, 'lider');
            assert.equal(res.status, 200);
            assert.equal((await res.json())[0].criado_por_id, 11);
            const consulta = consultas.at(-1);
            assert.deepEqual(Array.from(consulta.valores), [11]);
            assert.match(consulta.sql, /AND os.criado_por_id = \$1/);
            assert.match(consulta.sql, /IN \('Aberta', 'Em andamento', 'Aguardando peça', 'Pausada'\)/);
            assert.match(consulta.sql, /WHEN os.prioridade = 'Urgente' THEN 1/);
        }
        await buscar('/minhas', 'lider', 22);
        assert.deepEqual(Array.from(consultas.at(-1).valores), [22]);
        assert.equal((await buscar('/abertas', 'manutentor')).status, 200);
        assert.doesNotMatch(consultas.at(-1).sql, /AND os.criado_por_id/);
        assert.equal((await buscar('/concluidas?busca=' + encodeURIComponent('MAQ_01\\100%'), 'manutentor')).status, 200);
        assert.equal(consultas.at(-1).valores[0], '%MAQ\\_01\\\\100\\%%');
        assert.match(consultas.at(-1).sql, /ILIKE \$1 ESCAPE '\\'/);

        const cabecalhoManutentor = {
            Authorization: `Bearer ${jwt.sign({ id: 5, nome: 'Carlos', perfil: 'manutentor' }, process.env.JWT_SECRET)}`
        };
        const antesValidacao = consultas.length;
        // Corpo ausente (sem Content-Type) e tipos inválidos retornam 400 sem acessar o banco
        assert.equal((await fetch(base + '/', { method: 'POST', headers: cabecalhoManutentor })).status, 400);
        assert.equal((await fetch(base + '/', {
            method: 'POST',
            headers: { ...cabecalhoManutentor, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                solicitante: 'Ana', setor: 'Serraria', maquina: 'Serra', maquina_id: 15,
                problema: 'Ruído', prioridade: 'Normal', area_manutencao: 'Máquinas'
            })
        })).status, 400);
        assert.equal((await fetch(base + '/', {
            method: 'POST',
            headers: { ...cabecalhoManutentor, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                solicitante: 'Ana', setor: 'Serraria', maquina: 'Serra',
                problema: 'x'.repeat(4001), prioridade: 'Normal', area_manutencao: 'Máquinas'
            })
        })).status, 400);
        for (const sufixo of ['pdf', 'aguardando-peca', 'pausar', 'retomar', 'andamento', 'concluir', 'cancelar']) {
            const metodo = sufixo === 'pdf' ? 'GET' : 'PUT';
            for (const idInvalido of ['abc', '2147483648']) {
                assert.equal((await fetch(`${base}/${idInvalido}/${sufixo}`, { method: metodo, headers: cabecalhoManutentor })).status, 400);
            }
        }
        assert.equal((await fetch(`${base}/1/pausar`, { method: 'PUT', headers: cabecalhoManutentor })).status, 400);
        assert.equal((await fetch(`${base}/1/concluir`, {
            method: 'PUT',
            headers: { ...cabecalhoManutentor, 'Content-Type': 'application/json' },
            body: JSON.stringify({ solucao: 123 })
        })).status, 400);
        assert.equal(consultas.length, antesValidacao);
    } finally {
        if (anterior === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = anterior;
        servidor.closeAllConnections();
        await new Promise(resolve => servidor.close(resolve));
    }
});

test('página de acompanhamento busca a rota exclusiva, conta os status e não mostra ações de manutenção', async () => {
    const elementos = new Map();
    function elemento() {
        return {
            value: '', textContent: '', innerHTML: '', hidden: false, disabled: false,
            dataset: {}, children: [],
            classList: { add() {}, remove() {}, toggle() {} },
            setAttribute() {},
            addEventListener() {},
            querySelectorAll() { return []; },
            append(...itens) { this.children.push(...itens); },
            appendChild(e) { this.children.push(e); },
            replaceChildren(...itens) { this.children = itens; }
        };
    }
    const ordens = ['Aberta', 'Em andamento', 'Aguardando peça', 'Pausada'].map((status, i) => ({ id: i+1, status, maquina: 'Prensa', prioridade: 'Normal' }));
    const urls = [];
    const contexto = {
        document: { body: { dataset: { minhasOs: 'true' } }, getElementById(id) { if (!elementos.has(id)) elementos.set(id, elemento()); return elementos.get(id); }, createElement: elemento },
        localStorage: { getItem: () => 'token' },
        fetch: async url => { urls.push(url); return { ok: true, json: async () => ordens }; },
        window: { OSPdfDownload: { adicionarAoCard() {} } }, setInterval() {}, console
    };
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/os-card-detalhes.js'), 'utf8'), contexto);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/manutentor.js'), 'utf8'), contexto);
    await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual(urls, ['/api/os/minhas']);
    const cards = elementos.get('lista-os-abertas').children;
    assert.equal(cards.length, 4);
    for (const card of cards) assert.doesNotMatch(card.innerHTML, /onclick="(?:darAndamento|cancelarOS|pausarOS|concluirOS|retomarOS|aguardarPeca)/);
    assert.equal(elementos.get('totalAguardando').textContent, 1);
    assert.equal(elementos.get('totalPausadas').textContent, 1);
    elementos.get('busca-painel').value = '2';
    assert.equal(vm.runInContext('filtrarOSAbertas', contexto)(ordens).length, 1);
    elementos.get('busca-painel').value = '';
    elementos.get('status-painel').value = 'Pausada';
    assert.equal(vm.runInContext('filtrarOSAbertas', contexto)(ordens)[0].status, 'Pausada');
});
