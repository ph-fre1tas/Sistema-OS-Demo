// Validação opt-in: usa tabelas TEMP no PostgreSQL e desfaz tudo ao terminar.
// Execute com PLAYWRIGHT_MODULE apontando para o pacote Playwright instalado.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../db/db');
const auth = require('../middleware/authmiddleware');

async function executar() {
    let client, servidor, browser;
    try {
        client = await pool.connect();
        await client.query('BEGIN');
        await client.query("SET LOCAL search_path TO pg_temp; SET LOCAL TIME ZONE 'UTC'");
        await client.query(`
            CREATE TEMP TABLE usuarios (id INTEGER PRIMARY KEY, nome VARCHAR(120), ativo BOOLEAN);
            CREATE TEMP TABLE estoque_produtos (id SERIAL PRIMARY KEY, descricao VARCHAR(160), unidade VARCHAR(40), estoque_atual NUMERIC(12,2), estoque_minimo NUMERIC(12,2) DEFAULT 0, criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP, atualizado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
            CREATE TEMP TABLE estoque_movimentacoes (id SERIAL PRIMARY KEY, produto_id INTEGER, tipo VARCHAR(10), quantidade NUMERIC(12,2), usuario_id INTEGER, usuario_nome VARCHAR(120), criado_em TIMESTAMP DEFAULT CURRENT_TIMESTAMP, cancelada_em TIMESTAMP, cancelada_por_id INTEGER, cancelada_por_nome VARCHAR(120), recebedor_tipo VARCHAR(10), recebedor_nome VARCHAR(120), recebedor_usuario_id INTEGER);
            INSERT INTO usuarios VALUES (1, 'Maria Teste', true), (2, 'João Teste', true);
            INSERT INTO estoque_produtos (descricao, unidade, estoque_atual) VALUES ('Rolamento Teste', 'UNIDADE', 10);
        `);
        const clienteIsolado = { release() {}, query(sql, valores) {
            if (sql === 'BEGIN') return client.query('SAVEPOINT operacao');
            if (sql === 'COMMIT') return client.query('RELEASE SAVEPOINT operacao');
            if (sql === 'ROLLBACK') return client.query('ROLLBACK TO SAVEPOINT operacao');
            return client.query(sql, valores);
        } };
        const bancoIsolado = { connect: async () => clienteIsolado, query(sql, valores) {
            // A inicialização de produção não é executada neste ambiente isolado.
            if (sql.includes('CREATE TABLE IF NOT EXISTS')) return Promise.resolve({ rows: [] });
            return client.query(sql, valores);
        } };
        function carregar(nome) {
            const modulo = { exports: {} };
            const deps = { express, '../db/db': bancoIsolado, '../middleware/authmiddleware': auth,
                '../db/errosBanco': require('../db/errosBanco'),
                '../services/estoqueRelatorioService': require('../services/estoqueRelatorioService'),
                '../services/osConsultaService': {},
                '../services/osRelatorioService': { ErroValidacaoRelatorio: class extends Error {}, consultarRelatorio: async () => ({ autorizado: true }) },
                '../services/osRelatorioPdfService': {} };
            vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../routes', nome + '.js'), 'utf8'), {
                require: dep => deps[dep], module: modulo, console
            });
            return modulo.exports;
        }
        process.env.JWT_SECRET = 'validacao-local-temporaria';
        const app = express();
        app.use(express.json());
        app.use('/api/estoque', carregar('estoqueRoutes'));
        app.use('/api/relatorios', carregar('relatorioRoutes'));
        app.get('/api/notificacoes', (req, res) => res.json([]));
        app.use(express.static(path.join(__dirname, '../public')));
        servidor = app.listen(0, '127.0.0.1');
        await new Promise(resolve => servidor.once('listening', resolve));
        const base = `http://127.0.0.1:${servidor.address().port}`;
        const token = perfil => jwt.sign({ id: 1, nome: 'Maria Teste', perfil }, process.env.JWT_SECRET, { expiresIn: '1h' });
        async function chamada(url, perfil = 'admin', method = 'GET', body) {
            const res = await fetch(base + url, { method, headers: { Authorization: `Bearer ${token(perfil)}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
            return { status: res.status, dados: await res.json() };
        }
        for (const perfil of ['admin', 'almoxarifado', 'compras', 'lider', 'manutentor']) {
            assert.equal((await chamada('/api/estoque/retiradas', perfil)).status, ['admin', 'almoxarifado', 'compras'].includes(perfil) ? 200 : 403);
            assert.equal((await chamada('/api/relatorios/os', perfil)).status, ['admin', 'almoxarifado'].includes(perfil) ? 200 : 403);
        }
        assert.equal((await chamada('/api/estoque/produtos/1/movimentacoes', 'compras', 'POST', {
            tipo: 'SAIDA', quantidade: 2, recebedorTipo: 'USUARIO', recebedorUsuarioId: 2
        })).status, 201);
        await client.query("UPDATE estoque_movimentacoes SET criado_em = '2026-10-06 03:00:00'");
        for (const busca of ['Rolamento', 'Maria', 'João']) {
            const r = await chamada('/api/estoque/retiradas?' + new URLSearchParams({ busca, data_inicio: '2026-10-06', data_fim: '2026-10-06' }));
            assert.equal(r.dados.retiradas.length, 1);
            assert.equal(r.dados.retiradas[0].recebedor_nome, 'João Teste');
        }
        assert.equal((await chamada('/api/estoque/retiradas?data_fim=2026-10-05')).dados.retiradas.length, 0);
        await client.query("UPDATE estoque_movimentacoes SET criado_em = '2026-10-07 02:59:59'");
        assert.equal((await chamada('/api/estoque/retiradas?data_fim=2026-10-06')).dados.retiradas.length, 1);
        await client.query("UPDATE estoque_movimentacoes SET criado_em = '2026-10-07 03:00:00'");
        assert.equal((await chamada('/api/estoque/retiradas?data_fim=2026-10-06')).dados.retiradas.length, 0);
        const saldo = async () => Number((await client.query('SELECT estoque_atual FROM estoque_produtos WHERE id = 1')).rows[0].estoque_atual);
        assert.equal(await saldo(), 8);
        assert.equal((await chamada('/api/estoque/movimentacoes/1/cancelar', 'almoxarifado', 'PATCH')).status, 200);
        assert.equal(await saldo(), 10);
        assert.equal((await chamada('/api/estoque/retiradas')).dados.retiradas.length, 0);
        assert.equal((await chamada('/api/estoque/retiradas?situacao=canceladas')).dados.retiradas.length, 1);
        assert.equal((await chamada('/api/estoque/retiradas?situacao=todas')).dados.retiradas.length, 1);
        assert.equal((await chamada('/api/estoque/movimentacoes/1/cancelar', 'admin', 'PATCH')).status, 409);
        console.log('PostgreSQL + HTTP: permissões, saída, nomes, período, situação, cancelamento e saldo OK.');

        const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
        browser = await chromium.launch({ channel: 'chrome', headless: true });
        for (const perfil of ['admin', 'almoxarifado', 'compras']) {
            const contexto = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
            await contexto.addInitScript(({ token, perfil }) => {
                localStorage.setItem('token', token);
                localStorage.setItem('usuarioLogado', JSON.stringify({ id: 1, nome: 'Maria Teste', perfil }));
            }, { token: token(perfil), perfil });
            const page = await contexto.newPage();
            await page.route('https://**/*', route => route.abort());
            const erros = [];
            page.on('pageerror', erro => erros.push(erro.message));
            await page.goto(base + '/pages/relatorios.html');
            const seletor = page.locator('.relatorios-seletor');
            assert.equal(await seletor.isVisible(), perfil !== 'compras');
            if (perfil !== 'compras') await page.locator('#aba-relatorios-estoque').click();
            assert.equal(await page.locator('#painel-filtros-estoque').isVisible(), true);
            assert.equal(await page.locator('#situacao-retiradas').inputValue(), 'confirmadas');
            await page.locator('#situacao-retiradas').selectOption('canceladas');
            await page.locator('#btn-consultar-retiradas').click();
            await page.locator('#mensagem-retiradas.sucesso').waitFor();
            assert.match(await page.locator('#lista-retiradas').innerText(), /João Teste/);
            assert.match(await page.locator('#lista-retiradas').innerText(), /Cancelada/);
            assert.equal(await page.locator('#conteudo-resultados-os').isVisible(), false);
            await page.setViewportSize({ width: 390, height: 844 });
            assert.equal(await page.locator('#btn-consultar-retiradas').isVisible(), true);
            assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
            assert.deepEqual(erros, []);
            await contexto.close();
        }
        console.log('Chrome desktop/mobile: compras sem seletor; admin/almoxarifado com seletor; filtro e resultados reais OK.');
    } finally {
        if (browser) await browser.close();
        if (servidor) { servidor.closeAllConnections(); await new Promise(resolve => servidor.close(resolve)); }
        if (client) { await client.query('ROLLBACK'); client.release(); }
        await pool.end();
    }
}
executar().catch(erro => { console.error('Validação falhou:', erro.code || erro.name, erro.message); process.exitCode = 1; });
