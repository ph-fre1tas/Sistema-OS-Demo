const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const express = require('express');
const jwt = require('jsonwebtoken');
const auth = require('../middleware/authmiddleware');

function carregarRota(nome, pool) {
    const modulo = { exports: {} };
    const dependencias = {
        express,
        bcryptjs: { hash: async () => 'hash-teste' },
        '../db/db': pool,
        '../services/estoqueRelatorioService': require('../services/estoqueRelatorioService'),
        '../middleware/authmiddleware': auth,
        '../db/errosBanco': { responderErroDoBanco: res => res.sendStatus(418) },
        '../services/pedidoCompraExcelService': {
            gerarPedidoCompraExcel: async () => ({ fileName: 'pedido.xlsx', buffer: Buffer.from('planilha-teste') })
        },
        '../services/pedidoCompraPdfService': {
            gerarPedidoCompraPdf: async () => ({ fileName: 'pedido.pdf', buffer: Buffer.from('%PDF-teste') })
        }
    };
    vm.runInNewContext(fs.readFileSync(require.resolve('../routes/' + nome), 'utf8'), {
        require: nome => dependencias[nome] || {}, module: modulo, console: { error() {} }
    });
    return modulo.exports;
}

test('Compras acessa todas as operações do estoque e Excel, mas não OS, relatórios ou usuários', async () => {
    // O sentinela 418 confirma que a operação passou pela autorização e chegou ao banco simulado.
    const pool = {
        async query(sql) {
            if (sql.includes('ALTER TABLE') || sql.includes('CREATE TABLE')) return { rows: [] };
            throw new Error('Banco simulado');
        },
        async connect() { throw new Error('Banco simulado'); }
    };
    const app = express();
    app.use(express.json());
    const rotas = {};
    for (const [prefixo, arquivo] of Object.entries({ estoque: 'estoqueRoutes', compras: 'pedidoCompraRoutes', os: 'osRoutes', usuarios: 'usuarioRoutes', relatorios: 'relatorioRoutes' })) {
        rotas[prefixo] = carregarRota(arquivo, pool);
        app.use('/' + prefixo, rotas[prefixo]);
    }
    const anterior = process.env.JWT_SECRET;
    process.env.JWT_SECRET = 'teste-compras';
    const servidor = app.listen(0, '127.0.0.1');
    await new Promise(resolve => servidor.once('listening', resolve));
    async function chamar(path, method, perfil, body = {}) {
        const headers = { 'Content-Type': 'application/json' };
        if (perfil) headers.Authorization = 'Bearer ' + jwt.sign({ id: 1, nome: 'Teste', perfil }, process.env.JWT_SECRET);
        return fetch(`http://127.0.0.1:${servidor.address().port}${path}`, {
            method: method.toUpperCase(), headers, ...(method === 'get' ? {} : { body: JSON.stringify(body) })
        });
    }
    try {
        for (const camada of rotas.estoque.stack.filter(c => c.route)) {
            const path = '/estoque' + camada.route.path.replace(':id', '1');
            const method = Object.keys(camada.route.methods)[0];
            for (const perfil of ['compras', 'admin', 'almoxarifado']) {
                const resposta = await chamar(path, method, perfil, { descricao: 'Peça', unidade: 'UN', estoqueMinimo: 1, tipo: 'ENTRADA', quantidade: 1 });
                assert.equal(resposta.status, 418, `${perfil} ${method} ${path}`);
            }
            assert.equal((await chamar(path, method, 'lider')).status, 403);
            assert.equal((await chamar(path, method)).status, 401);
        }
        assert.equal((await chamar('/compras/excel', 'post', 'compras')).status, 200);
        assert.equal((await chamar('/compras/excel', 'post', 'manutentor')).status, 403);
        for (const perfil of ['admin', 'compras', 'almoxarifado']) {
            const pdf = await chamar('/compras/pdf', 'post', perfil);
            assert.equal(pdf.status, 200);
            assert.equal(pdf.headers.get('content-type'), 'application/pdf');
        }
        for (const perfil of ['manutentor', 'lider']) {
            assert.equal((await chamar('/compras/pdf', 'post', perfil)).status, 403);
        }
        assert.equal((await chamar('/compras/pdf', 'post')).status, 401);
        for (const prefixo of ['os', 'usuarios', 'relatorios']) {
            for (const camada of rotas[prefixo].stack.filter(c => c.route)) {
                const path = '/' + prefixo + camada.route.path.replace(':id', '2');
                const method = Object.keys(camada.route.methods)[0];
                assert.equal((await chamar(path, method, 'compras')).status, 403, `${method} ${path}`);
            }
        }
        const gravacoes = [];
        pool.query = async (sql, valores) => {
            if (sql.includes('INSERT INTO usuarios') || sql.includes('UPDATE usuarios')) {
                gravacoes.push({ sql, valores });
                return { rows: [{ id: 2, perfil: 'compras' }] };
            }
            return { rows: sql.includes('SELECT id, email') ? [{ id: 2, email: null }] : [] };
        };
        assert.equal((await chamar('/usuarios', 'post', 'admin', {
            nome: 'Comprador', usuario: 'comprador', senha: 'teste123', perfil: 'compras'
        })).status, 201);
        assert.equal(gravacoes[0].valores[3], 'compras');
        assert.equal((await chamar('/usuarios/2/perfil', 'put', 'admin', { perfil: 'compras' })).status, 200);
        assert.equal(gravacoes[1].valores[0], 'compras');
        assert.equal((await chamar('/usuarios/2/perfil', 'put', 'admin', { perfil: 'invalido' })).status, 400);
        assert.equal((await chamar('/usuarios', 'post', 'admin', {
            nome: 'Almoxarife', usuario: 'almoxarife', senha: 'teste123', perfil: 'almoxarifado'
        })).status, 201);
        assert.equal(gravacoes[2].valores[3], 'almoxarifado');
        assert.equal((await chamar('/usuarios/2/perfil', 'put', 'admin', { perfil: 'almoxarifado' })).status, 200);
        assert.equal(gravacoes[3].valores[0], 'almoxarifado');
        assert.equal((await chamar('/usuarios/2/email', 'put', 'admin', { email: 'novo@teste.local' })).status, 200);
        assert.equal((await chamar('/usuarios/abc/perfil', 'put', 'admin', { perfil: 'compras' })).status, 400);
        assert.equal((await chamar('/usuarios/2147483648/email', 'put', 'admin', { email: 'novo@teste.local' })).status, 400);
        assert.equal((await chamar('/usuarios', 'post', 'admin', { nome: 123, usuario: 'u', senha: '1234', perfil: 'lider' })).status, 400);
        assert.equal((await chamar('/estoque/produtos/abc', 'put', 'admin', { estoqueMinimo: 1 })).status, 400);
        assert.equal((await chamar('/estoque/produtos', 'post', 'admin', { descricao: {}, unidade: 'UN', estoqueMinimo: 1 })).status, 400);
        for (const camada of rotas.usuarios.stack.filter(c => c.route)) {
            const path = '/usuarios' + camada.route.path.replace(':id', '2');
            const method = Object.keys(camada.route.methods)[0];
            assert.equal((await chamar(path, method, 'almoxarifado')).status, 403, path);
        }
    } finally {
        if (anterior === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = anterior;
        servidor.closeAllConnections();
        await new Promise(resolve => servidor.close(resolve));
    }
});

test('Compras entra em Estoque e vê os três módulos permitidos', async () => {
    const usuario = { perfil: 'compras' };
    const contexto = {
        window: { fetch() {}, addEventListener() {}, location: { href: '' } },
        document: { addEventListener() {}, getElementById: () => ({ addEventListener() {} }) },
        localStorage: { getItem: chave => chave === 'token' ? 'token' : JSON.stringify(usuario) },
        alert() {}
    };
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/auth.js'), 'utf8'), contexto);
    vm.runInContext('verificarLogin = () => ({perfil: "compras"}); tokenExpirou = () => false;', contexto);
    contexto.redirecionarSeJaLogado();
    assert.equal(contexto.window.location.href, '/pages/estoque.html');
    contexto.permitirPagina(['admin']);
    assert.equal(contexto.window.location.href, '../pages/estoque.html');
    assert.equal(contexto.nomeDoPerfil('compras'), 'Compras');
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/login.js'), 'utf8'), contexto);
    await contexto.redirecionarUsuario(usuario);
    assert.equal(contexto.window.location.href, '/pages/estoque.html');
    for (const pagina of fs.readdirSync('public/pages').filter(p => p.endsWith('.html') && p !== 'login.html')) {
        const html = fs.readFileSync('public/pages/' + pagina, 'utf8');
        const links = [...html.matchAll(/href="([^"]+)" data-perfis="([^"]+)"/g)]
            .map(([, href, perfis]) => ({ href, dataset: { perfis }, style: {} }));
        contexto.document.querySelectorAll = () => links;
        vm.runInContext('ordenarMenuLateral = () => {}; prepararInterfaceUsuario = () => {};', contexto);
        contexto.ajustarMenuPorPerfil();
        assert.deepEqual(links.filter(l => l.style.display !== 'none').map(l => l.href).sort(), ['estoque.html', 'pedido-compra.html', 'relatorios.html'], pagina);
        const permitidos = JSON.parse(html.match(/permitirPagina\((\[[^)]*\])\)/)[1]);
        assert.equal(permitidos.includes('compras'), ['estoque.html', 'pedido-compra.html', 'relatorios.html'].includes(pagina), pagina);
    }
});
