const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const vm = require('node:vm');
const { permitirPerfis } = require('../middleware/authmiddleware');

test('Almoxarifado tem permissões operacionais de admin e não administra usuários', async () => {
    for (const arquivo of ['osRoutes', 'estoqueRoutes', 'pedidoCompraRoutes', 'relatorioRoutes', 'usuarioRoutes', 'ferramentasRoutes']) {
        const permissoes = [];
        const router = new Proxy({}, { get: () => () => {} });
        vm.runInNewContext(fs.readFileSync(require.resolve('../routes/' + arquivo), 'utf8'), {
            module: { exports: {} },
            require: nome => nome === 'express' ? { Router: () => router } :
                nome === '../middleware/authmiddleware' ? {
                    autenticarToken() {},
                    permitirPerfis: (...perfis) => { permissoes.push(perfis); return permitirPerfis(...perfis); }
                } : {}
        });
        assert.ok(permissoes.length > 0);
        for (const perfis of permissoes) {
            let permitido = false;
            let status;
            permitirPerfis(...perfis)({ usuario: { perfil: 'almoxarifado' } }, {
                status(valor) { status = valor; return this; }, json() {}
            }, () => { permitido = true; });
            const esperado = arquivo !== 'usuarioRoutes' && perfis.includes('admin');
            assert.equal(permitido, esperado, `${arquivo}: ${perfis}`);
            if (!esperado) assert.equal(status, 403);
        }
    }
    const api = fs.readFileSync(require.resolve('../api/index.js'), 'utf8');
    assert.match(api, /"\/api\/teste-banco",\s*autenticarToken,\s*permitirPerfis\("admin"\)/);
    assert.ok(api.indexOf('app.get("/api"') < api.indexOf('garantirEstruturaDeNotificacoes()'));

    let configSmtp;
    let ultimoEmailEnviado;
    const moduloEmail = { exports: {} };
    vm.runInNewContext(fs.readFileSync(require.resolve('../services/emailService.js'), 'utf8'), {
        module: moduloEmail,
        process: { env: { EMAIL_USER: 'sistema@teste.local', EMAIL_PASS: 'segredo' } },
        console: { log() {}, error() {} },
        Intl,
        Date,
        require: nome => nome === 'nodemailer'
            ? { createTransport: opcoes => { configSmtp = opcoes; return { sendMail: async (mail) => { ultimoEmailEnviado = mail; return { messageId: '1' }; } }; } }
            : assert.fail(`Dependência inesperada em emailService: ${nome}`)
    });
    await moduloEmail.exports.enviarEmailNovaOS({
        os: { id: 1, prioridade: 'Normal', maquina: 'Prensa\r\nBcc: invasor@teste', setor: 'Corte\n2', solicitante: 'Ana', criado_por_nome: 'Ana', criado_por_perfil: 'lider', problema: 'Teste' },
        emailsDestino: ['destino@teste.local']
    });
    assert.equal(configSmtp.connectionTimeout, 4000);
    assert.equal(configSmtp.greetingTimeout, 4000);
    assert.equal(configSmtp.socketTimeout, 5000);
    assert.doesNotMatch(ultimoEmailEnviado.subject, /[\r\n]/);

    let handlerLida;
    let consultasNotificacao = 0;
    vm.runInNewContext(fs.readFileSync(require.resolve('../routes/notificacaoRoutes.js'), 'utf8'), {
        module: { exports: {} },
        console,
        require: nome => nome === 'express'
            ? { Router: () => ({ use() {}, get() {}, put: (rota, fn) => { if (rota === '/:id/lida') handlerLida = fn; } }) }
            : nome === '../db/db'
                ? { query: async () => { consultasNotificacao++; return { rows: [{ id: 1 }] }; } }
                : nome === '../middleware/authmiddleware'
                    ? { autenticarToken() {} }
                    : {}
    });
    for (const idInvalido of ['abc', '0', '2147483648']) {
        let codigo = 200;
        await handlerLida({ params: { id: idInvalido }, usuario: { id: 1 } }, { status(c) { codigo = c; return this; }, json() {} });
        assert.equal(codigo, 400);
    }
    assert.equal(consultasNotificacao, 0);
});

test('Almoxarifado entra no estoque, acessa módulos operacionais e não vê Admin', async () => {
    const usuario = { perfil: 'almoxarifado' };
    const contexto = {
        window: { fetch() {}, addEventListener() {}, location: { href: '' } },
        document: { addEventListener() {}, getElementById: () => ({ addEventListener() {} }) },
        localStorage: { getItem: chave => chave === 'token' ? 'token' : JSON.stringify(usuario) },
        alert() {}
    };
    vm.createContext(contexto);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/auth.js'), 'utf8'), contexto);
    vm.runInContext('verificarLogin = () => ({perfil: "almoxarifado"}); tokenExpirou = () => false;', contexto);
    contexto.redirecionarSeJaLogado();
    assert.equal(contexto.window.location.href, '/pages/estoque.html');
    contexto.permitirPagina(['admin']);
    assert.equal(contexto.window.location.href, '../pages/estoque.html');
    assert.equal(contexto.nomeDoPerfil('almoxarifado'), 'Almoxarifado');
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
        assert.deepEqual(links.filter(l => l.style.display !== 'none').map(l => l.href).sort(), [
            'cadastros.html', 'criar-os.html', 'estoque.html', 'ferramentas.html', 'os-concluidas.html', 'painel-manutentor.html', 'pedido-compra.html', 'relatorios.html'
        ], pagina);
        const permitidos = JSON.parse(html.match(/permitirPagina\((\[[^)]*\])\)/)[1]);
        assert.equal(permitidos.includes('almoxarifado'), !['admin.html', 'minhas-os.html'].includes(pagina), pagina);
        assert.match(html, /<script defer src="https:\/\/kit\.fontawesome\.com\/70b94fa0ad\.js"/, pagina);
    }
});

test('Frontend preserva AbortError, valida URL de notificação, evita XSS em admin e usa verificarLogin em cadastros', async () => {
    let modoFetch = 'abort';
    const itensArmazenados = new Map([['mensagemLogin', 'Sessão encerrada']]);
    const alertas = [];
    const handlersLista = {};
    const listaNotificacoes = {
        innerHTML: '',
        addEventListener(evento, fn) { handlersLista[evento] = fn; }
    };
    const topbarUser = { innerHTML: '', replaceWith() {} };
    const acoesCriadas = {
        className: '',
        innerHTML: '',
        appendChild() {},
        contains: () => true,
        querySelector(seletor) {
            if (seletor === '.lista-notificacoes') return listaNotificacoes;
            if (seletor === '.notificacoes-contador') return { hidden: true, textContent: '' };
            return { hidden: true, setAttribute() {}, addEventListener() {} };
        }
    };
    const contextoAuth = {
        async fetch(url) {
            if (String(url).startsWith('/api/notificacoes')) {
                return { ok: true, json: async () => [] };
            }
            if (modoFetch === 'abort') {
                const erroAbort = new Error('Cancelado');
                erroAbort.name = 'AbortError';
                throw erroAbort;
            }
            throw new TypeError('Failed to fetch');
        },
        addEventListener() {},
        location: { href: '/pages/inicial.html' },
        document: {
            addEventListener() {},
            createElement(tag) {
                if (tag === 'div') {
                    return {
                        _texto: '',
                        set textContent(v) { this._texto = String(v); this.innerHTML = this._texto; },
                        get textContent() { return this._texto; },
                        innerHTML: '',
                        ...acoesCriadas
                    };
                }
                return {};
            },
            querySelector(seletor) {
                if (seletor === '.topbar') {
                    return {
                        querySelector: s => s === '.topbar-user' ? topbarUser : null
                    };
                }
                return null;
            }
        },
        localStorage: { getItem: () => 'token', removeItem() {} },
        sessionStorage: {
            getItem: chave => itensArmazenados.get(chave) ?? null,
            removeItem: chave => itensArmazenados.delete(chave),
            setItem: (chave, valor) => itensArmazenados.set(chave, valor)
        },
        mostrarAlerta: (...args) => alertas.push(args),
        alert() {}
    };
    contextoAuth.window = contextoAuth;
    vm.createContext(contextoAuth);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/auth.js'), 'utf8'), contextoAuth);

    await assert.rejects(() => contextoAuth.window.fetch('/api/estoque/retiradas'), erro => erro.name === 'AbortError');
    modoFetch = 'rede';
    await assert.rejects(() => contextoAuth.window.fetch('/api/estoque/retiradas'), erro => erro.name === 'ErroDeConexao');

    contextoAuth.mostrarMensagemNoLogin();
    assert.equal(alertas.length, 1);
    assert.equal(itensArmazenados.has('mensagemLogin'), false);

    contextoAuth.prepararInterfaceUsuario({ nome: 'Admin', perfil: 'admin' });
    for (const urlInsegura of ['javascript:alert(1)', 'https://externo.exemplo/p', '//externo.exemplo/p']) {
        await handlersLista.click({
            target: { closest: () => ({ dataset: { notificacaoId: '1', url: urlInsegura } }) }
        });
        assert.equal(contextoAuth.window.location.href, '/pages/inicial.html');
    }
    await handlersLista.click({
        target: { closest: () => ({ dataset: { notificacaoId: '1', url: '/pages/painel-manutentor.html' } }) }
    });
    assert.equal(contextoAuth.window.location.href, '/pages/painel-manutentor.html');

    let filhosLista = [];
    const listaUsuarios = {
        innerHTML: 'inicial',
        replaceChildren(...nos) { filhosLista = nos; }
    };
    const contextoAdmin = vm.createContext({
        document: {
            getElementById(id) {
                if (id === 'listaUsuarios') return listaUsuarios;
                return { addEventListener() {} };
            },
            createElement: tag => ({ tag, textContent: '' })
        },
        localStorage: { getItem: () => 'token' },
        fetch: async () => { throw new Error('<img src=x onerror=alert(1)>'); },
        respostaSessaoExpirada: () => false
    });
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/admin.js'), 'utf8'), contextoAdmin);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(listaUsuarios.innerHTML, 'inicial');
    assert.equal(filhosLista.length, 1);
    assert.equal(filhosLista[0].textContent, '<img src=x onerror=alert(1)>');

    for (const caminho of ['../public/pages/cadastros.html', '../public/js/cadastros-ferramentas.js', '../public/js/cadastros-maquinas.js']) {
        const conteudo = fs.readFileSync(require.resolve(caminho), 'utf8');
        assert.doesNotMatch(conteudo, /JSON\.parse\(localStorage\.getItem\("usuarioLogado"\)/);
        assert.match(conteudo, /verificarLogin\(\)\?\.perfil/);
    }

    const css = fs.readFileSync(require.resolve('../public/css/style.css'), 'utf8');
    assert.match(css, /\.form-group\.pedido-fornecedor\s*\{/);
    assert.doesNotMatch(css, /\.form-group\s+pedido-fornecedor\s*\{/);

    const estoqueJs = fs.readFileSync(require.resolve('../public/js/estoque.js'), 'utf8');
    assert.doesNotMatch(estoqueJs, /function movimentarProduto\b/);
    assert.match(estoqueJs, /requestAnimationFrame\(medirRolagemMovimentacoes\)/);
});

test('Frontend pacote 2: decodificarToken UTF-8, resize mobile, dataISO em Brasília, polling com modal e CSS limpo', async () => {
    const eventosJanela = {};
    let resetouMenu = 0;
    const contextoAuth = {
        innerWidth: 390,
        async fetch() { return { ok: true, json: async () => [] }; },
        addEventListener(evento, fn) { eventosJanela[evento] = fn; },
        setTimeout: fn => { fn(); return 1; },
        clearTimeout() {},
        atob: b64 => Buffer.from(b64, 'base64').toString('binary'),
        TextDecoder,
        location: { href: '' },
        document: {
            addEventListener() {},
            querySelector: () => null,
            querySelectorAll: () => [],
            documentElement: { classList: { add() {}, remove() {} }, scrollLeft: 0 },
            body: { classList: { add() {}, remove() {}, contains: () => false }, scrollLeft: 0 }
        },
        localStorage: { getItem: () => null, removeItem() {} },
        sessionStorage: { getItem: () => null, removeItem() {}, setItem() {} },
        alert() {}
    };
    contextoAuth.window = contextoAuth;
    vm.createContext(contextoAuth);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/auth.js'), 'utf8'), contextoAuth);
    vm.runInContext('const resetReal = resetarMenuMobile; resetarMenuMobile = () => { resetReal(); };', contextoAuth);

    // Payload Base64URL sem "=" e com caracteres UTF-8 acentuados
    const payloadBase64Url = Buffer.from(JSON.stringify({ id: 3, nome: 'João Conceição', exp: 9999999999 }), 'utf8')
        .toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const decodificado = contextoAuth.decodificarToken(`eyJhbGciOiJIUzI1NiJ9.${payloadBase64Url}.assinatura`);
    assert.equal(decodificado.nome, 'João Conceição');

    vm.runInContext('var __resets = 0; resetarMenuMobile = () => { __resets += 1; };', contextoAuth);
    eventosJanela.resize();
    assert.equal(contextoAuth.__resets, 0, 'Resize apenas vertical no celular não fecha o menu');
    contextoAuth.innerWidth = 1024;
    eventosJanela.resize();
    assert.equal(contextoAuth.__resets, 1, 'Cruzar para desktop reseta o menu mobile');

    assert.match(fs.readFileSync(require.resolve('../public/pages/criar-os.html'), 'utf8'), /data-ordem-menu="maquinas"/);
    assert.doesNotMatch(fs.readFileSync(require.resolve('../public/pages/pedido-compra.html'), 'utf8'), /lider,\s+manutentor/);
    assert.doesNotMatch(fs.readFileSync(require.resolve('../public/pages/painel-manutentor.html'), 'utf8'), /totalPausadas/);

    let callbackPolling;
    let chamadasFetchPainel = 0;
    let modalAberto = true;
    const elementosPainel = new Map();
    const criarNo = () => ({
        value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', dataset: {},
        classList: { add() {} }, setAttribute() {}, addEventListener() {}, appendChild() {}, replaceChildren() {}, querySelectorAll: () => []
    });
    const contextoPainel = {
        Intl,
        document: {
            hidden: false,
            body: { dataset: {} },
            getElementById(id) {
                if (!elementosPainel.has(id)) elementosPainel.set(id, criarNo());
                return elementosPainel.get(id);
            },
            querySelector: seletor => (seletor.startsWith('.os-modal-overlay') && modalAberto) ? {} : null,
            createElement: criarNo
        },
        localStorage: { getItem: () => 'token' },
        fetch: async () => { chamadasFetchPainel++; return { ok: true, json: async () => [] }; },
        window: { OSCardDetalhes: { preservar() {}, aplicar() {} }, OSPdfDownload: { adicionarAoCard() {} } },
        setInterval: fn => { callbackPolling = fn; },
        console
    };
    vm.createContext(contextoPainel);
    vm.runInContext(fs.readFileSync(require.resolve('../public/js/manutentor.js'), 'utf8'), contextoPainel);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(chamadasFetchPainel, 1);

    // 2026-10-06 01:30:00 UTC equivale a 2026-10-05 22:30:00 em America/Sao_Paulo
    assert.equal(contextoPainel.dataISO('2026-10-06 01:30:00'), '2026-10-05');
    contextoPainel.atualizarResumoOS([{ status: 'Pausada', prioridade: 'Normal' }]);
    assert.equal(elementosPainel.has('totalPausadas'), false, 'Painel do Manutentor não consulta totalPausadas');

    callbackPolling();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(chamadasFetchPainel, 1, 'Polling não busca enquanto há modal aberto');
    modalAberto = false;
    callbackPolling();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(chamadasFetchPainel, 2);

    const css = fs.readFileSync(require.resolve('../public/css/style.css'), 'utf8');
    for (const morto of ['#mensagem-login', '.login-message', '.empresa-login-mensagem', '.criar-os-resumo', 'saindo-pagina', 'saida-pagina', '--cor-primaria-escura', '.movimentacao-info small']) {
        assert.equal(css.includes(morto), false, `Seletor/variável morto ainda presente: ${morto}`);
    }
});
