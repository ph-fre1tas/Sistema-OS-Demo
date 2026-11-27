/*
    seed-demo.js
    --------------------------------------------------
    Cria a estrutura completa do banco PostgreSQL (se ainda não existir)
    e popula dados fictícios para o ambiente de demonstração.

    Uso:
      node scripts/seed-demo.js          # Cria tabelas e popula se estiver vazio
      node scripts/seed-demo.js --reset  # Limpa e recria os dados fictícios
*/

require("dotenv").config();

const bcrypt = require("bcryptjs");
const pool = require("../db/db");

async function criarEstrutura(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      nome VARCHAR(120) NOT NULL,
      usuario VARCHAR(60) NOT NULL UNIQUE,
      senha_hash VARCHAR(255) NOT NULL,
      perfil VARCHAR(30) NOT NULL,
      ativo BOOLEAN NOT NULL DEFAULT true,
      email VARCHAR(254),
      areas_notificacao_email TEXT[] NOT NULL DEFAULT '{}'
    );
    CREATE UNIQUE INDEX IF NOT EXISTS usuarios_email_unico
      ON usuarios (LOWER(email))
      WHERE email IS NOT NULL;

    CREATE TABLE IF NOT EXISTS maquinas (
      id SERIAL PRIMARY KEY,
      codigo VARCHAR(60) NOT NULL CHECK (LENGTH(TRIM(codigo)) > 0),
      nome VARCHAR(160) NOT NULL CHECK (LENGTH(TRIM(nome)) > 0),
      setor VARCHAR(120) NOT NULL DEFAULT '',
      marca VARCHAR(100) NOT NULL DEFAULT '',
      modelo VARCHAR(100) NOT NULL DEFAULT '',
      observacoes TEXT NOT NULL DEFAULT '',
      foto VARCHAR(500),
      criado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS maquinas_codigo_unico
      ON maquinas (LOWER(codigo));

    CREATE TABLE IF NOT EXISTS ordens_servico (
      id SERIAL PRIMARY KEY,
      solicitante VARCHAR(120) NOT NULL,
      setor VARCHAR(120) NOT NULL,
      maquina VARCHAR(160) NOT NULL,
      maquina_id VARCHAR(60),
      problema TEXT NOT NULL,
      prioridade VARCHAR(30) NOT NULL DEFAULT 'Normal',
      area_manutencao VARCHAR(60) NOT NULL DEFAULT 'Mecânica',
      status VARCHAR(40) NOT NULL DEFAULT 'Aberta',
      solucao TEXT,
      peca_faltante VARCHAR(255),
      motivo_pausa TEXT,
      motivo_pausa_atual TEXT,
      motivo_cancelamento TEXT,
      criado_por_id INTEGER REFERENCES usuarios(id),
      criado_por_nome VARCHAR(120),
      criado_por_perfil VARCHAR(30),
      iniciado_por_id INTEGER REFERENCES usuarios(id),
      iniciado_por_nome VARCHAR(120),
      pausado_por_id INTEGER REFERENCES usuarios(id),
      pausado_por_nome VARCHAR(120),
      concluido_por_id INTEGER REFERENCES usuarios(id),
      concluido_por_nome VARCHAR(120),
      cancelado_por_id INTEGER REFERENCES usuarios(id),
      cancelado_por_nome VARCHAR(120),
      manutentor_responsavel_nome VARCHAR(255),
      data_criacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      data_inicio TIMESTAMP,
      data_pausa TIMESTAMP,
      data_pausa_atual TIMESTAMP,
      data_aguardando_peca TIMESTAMP,
      data_conclusao TIMESTAMP,
      data_cancelamento TIMESTAMP,
      data_atualizacao TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS os_pausas (
      id SERIAL PRIMARY KEY,
      ordem_servico_id INTEGER NOT NULL REFERENCES ordens_servico(id) ON DELETE CASCADE,
      tipo_pausa VARCHAR(40) NOT NULL,
      motivo TEXT,
      pausado_por_id INTEGER REFERENCES usuarios(id),
      pausado_por_nome VARCHAR(120),
      data_inicio_pausa TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      data_fim_pausa TIMESTAMP,
      retomado_por_id INTEGER REFERENCES usuarios(id),
      retomado_por_nome VARCHAR(120)
    );

    CREATE TABLE IF NOT EXISTS estoque_produtos (
      id SERIAL PRIMARY KEY,
      descricao VARCHAR(160) NOT NULL,
      unidade VARCHAR(40) NOT NULL,
      estoque_atual NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estoque_atual >= 0),
      estoque_minimo NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      atualizado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS estoque_produtos_descricao_unica
      ON estoque_produtos (LOWER(descricao));

    CREATE TABLE IF NOT EXISTS estoque_movimentacoes (
      id SERIAL PRIMARY KEY,
      produto_id INTEGER NOT NULL REFERENCES estoque_produtos(id),
      tipo VARCHAR(10) NOT NULL CHECK (tipo IN ('ENTRADA', 'SAIDA')),
      quantidade NUMERIC(12,2) NOT NULL CHECK (quantidade > 0),
      usuario_id INTEGER REFERENCES usuarios(id),
      usuario_nome VARCHAR(120) NOT NULL,
      criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cancelada_em TIMESTAMP,
      cancelada_por_id INTEGER REFERENCES usuarios(id),
      cancelada_por_nome VARCHAR(120),
      recebedor_tipo VARCHAR(10),
      recebedor_nome VARCHAR(120),
      recebedor_usuario_id INTEGER REFERENCES usuarios(id)
    );
    CREATE INDEX IF NOT EXISTS estoque_movimentacoes_produto_data
      ON estoque_movimentacoes (produto_id, criado_em DESC);

    CREATE TABLE IF NOT EXISTS ferramentas (
      id SERIAL PRIMARY KEY,
      tipo VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(tipo)) > 0),
      marca VARCHAR(100) NOT NULL CHECK (LENGTH(TRIM(marca)) > 0)
    );

    CREATE TABLE IF NOT EXISTS ferramentas_emprestimos (
      id SERIAL PRIMARY KEY,
      ferramenta_id INTEGER NOT NULL REFERENCES ferramentas(id),
      tipo VARCHAR(100) NOT NULL,
      marca VARCHAR(100) NOT NULL,
      funcionario_id INTEGER REFERENCES usuarios(id),
      funcionario_nome VARCHAR(255) NOT NULL,
      retirado_em TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      registrado_por INTEGER NOT NULL REFERENCES usuarios(id),
      devolvido_em TIMESTAMPTZ,
      devolvido_por INTEGER REFERENCES usuarios(id),
      CHECK ((devolvido_em IS NULL) = (devolvido_por IS NULL))
    );
    CREATE UNIQUE INDEX IF NOT EXISTS ferramentas_um_emprestimo_aberto
      ON ferramentas_emprestimos(ferramenta_id) WHERE devolvido_em IS NULL;
    CREATE INDEX IF NOT EXISTS ferramentas_historico_data
      ON ferramentas_emprestimos(devolvido_em DESC, id DESC) WHERE devolvido_em IS NOT NULL;

    CREATE TABLE IF NOT EXISTS notificacoes (
      id SERIAL PRIMARY KEY,
      usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
      tipo VARCHAR(40) NOT NULL,
      titulo VARCHAR(160) NOT NULL,
      mensagem TEXT NOT NULL,
      url VARCHAR(255),
      lida BOOLEAN NOT NULL DEFAULT false,
      criada_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS notificacoes_usuario_data
      ON notificacoes (usuario_id, lida, criada_em DESC);

    CREATE TABLE IF NOT EXISTS login_limites (
      chave VARCHAR(200) PRIMARY KEY,
      tentativas INTEGER NOT NULL DEFAULT 0,
      janela_inicio TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      bloqueado_ate TIMESTAMPTZ
    );
  `);
}

async function popularDados(client, resetar) {
  if (resetar) {
    await client.query(`
      TRUNCATE TABLE
        notificacoes,
        ferramentas_emprestimos,
        ferramentas,
        estoque_movimentacoes,
        estoque_produtos,
        os_pausas,
        ordens_servico,
        maquinas,
        login_limites,
        usuarios
      RESTART IDENTITY CASCADE;
    `);
  } else {
    const existente = await client.query("SELECT COUNT(*)::int AS total FROM ordens_servico");
    if (existente.rows[0].total > 0) {
      console.log("Banco já possui dados de demonstração. Use --reset para recriar.");
      return;
    }
  }

  const senhaHash = await bcrypt.hash("demo123", 10);

  const usuariosRes = await client.query(
    `
    INSERT INTO usuarios (nome, usuario, senha_hash, perfil, ativo, email)
    VALUES
      ('Carlos Almeida', 'admin', $1, 'admin', true, 'admin@exemplo.local'),
      ('Rafael Santos', 'manutentor', $1, 'manutentor', true, 'manutentor@exemplo.local'),
      ('Fernanda Lima', 'lider', $1, 'lider', true, 'lider@exemplo.local'),
      ('Marcos Oliveira', 'almoxarifado', $1, 'almoxarifado', true, 'almoxarifado@exemplo.local'),
      ('Juliana Costa', 'compras', $1, 'compras', true, 'compras@exemplo.local')
    ON CONFLICT (usuario) DO UPDATE SET nome = EXCLUDED.nome
    RETURNING id, nome, usuario, perfil;
    `,
    [senhaHash]
  );

  const porPerfil = Object.fromEntries(usuariosRes.rows.map((u) => [u.perfil, u]));
  const admin = porPerfil.admin;
  const manutentor = porPerfil.manutentor;
  const lider = porPerfil.lider;
  const almox = porPerfil.almoxarifado;

  await client.query(`
    INSERT INTO maquinas (codigo, nome, setor, marca, modelo, observacoes)
    VALUES
      ('PRE-01', 'Prensa Hidráulica 80T', 'Estamparia', 'HidraMax', 'HM-80', 'Revisão preventiva a cada 500h'),
      ('TOR-02', 'Torno CNC', 'Usinagem', 'Romi', 'Centur 30D', 'Lubrificação automática verificada'),
      ('COM-01', 'Compressor Parafuso 40HP', 'Utilidades', 'Atlas Copco', 'GA 30', 'Troca de filtro separador trimestral'),
      ('EST-04', 'Esteira Transportadora Linha B', 'Embalagem', 'FlexMove', 'FM-400', 'Sensor óptico na saída'),
      ('SOL-03', 'Máquina de Solda MIG', 'Serralheria', 'ESAB', 'Smashweld 318', 'Uso contínuo no turno A'),
      ('EMP-02', 'Empilhadeira Elétrica', 'Logística', 'Toyota', '8FBE18', 'Bateria tracionária 48V'),
      ('CAL-01', 'Seladora Térmica Automática', 'Embalagem', 'Selapack', 'SP-220', 'Resistência de teflon 220V'),
      ('FRE-01', 'Fresadora Universal', 'Usinagem', 'Nardini', 'FU-320', 'Eixo X com folga monitorada')
    ON CONFLICT (LOWER(codigo)) DO NOTHING;
  `);

  const osRes = await client.query(
    `
    INSERT INTO ordens_servico (
      solicitante, setor, maquina, maquina_id, problema, prioridade, area_manutencao,
      status, solucao, peca_faltante, motivo_pausa, motivo_pausa_atual, motivo_cancelamento,
      criado_por_id, criado_por_nome, criado_por_perfil,
      iniciado_por_id, iniciado_por_nome,
      pausado_por_id, pausado_por_nome,
      concluido_por_id, concluido_por_nome,
      cancelado_por_id, cancelado_por_nome,
      manutentor_responsavel_nome,
      data_criacao, data_inicio, data_pausa, data_pausa_atual,
      data_aguardando_peca, data_conclusao, data_cancelamento, data_atualizacao
    )
    VALUES
      (
        'Fernanda Lima', 'Estamparia', 'Prensa Hidráulica 80T', 'PRE-01',
        'Vazamento de óleo no bloco distribuidor próximo ao manômetro principal.',
        'Urgente', 'Hidráulica', 'Aberta',
        NULL, NULL, NULL, NULL, NULL,
        $1, $2, 'lider',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NOW() - INTERVAL '2 hours', NULL, NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 hours'
      ),
      (
        'Fernanda Lima', 'Embalagem', 'Esteira Transportadora Linha B', 'EST-04',
        'Sensor fotoelétrico intermitente causando paradas na contagem de caixas.',
        'Normal', 'Elétrica', 'Aberta',
        NULL, NULL, NULL, NULL, NULL,
        $1, $2, 'lider',
        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
        NOW() - INTERVAL '5 hours', NULL, NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '5 hours'
      ),
      (
        'Carlos Almeida', 'Usinagem', 'Torno CNC', 'TOR-02',
        'Ruído anormal no rolamento do eixo árvore acima de 2000 RPM.',
        'Urgente', 'Mecânica', 'Em andamento',
        NULL, NULL, NULL, NULL, NULL,
        $3, $4, 'admin',
        $5, $6, NULL, NULL, NULL, NULL, NULL, NULL, $6,
        NOW() - INTERVAL '6 hours', NOW() - INTERVAL '4 hours', NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '4 hours'
      ),
      (
        'Fernanda Lima', 'Utilidades', 'Compressor Parafuso 40HP', 'COM-01',
        'Alarme de alta temperatura na saída de ar comprimido.',
        'Urgente', 'Mecânica', 'Aguardando peça',
        NULL, 'Kit filtro separador e válvula termostática', 'Aguardando chegada do kit do fornecedor', 'Aguardando chegada do kit do fornecedor', NULL,
        $1, $2, 'lider',
        $5, $6, $5, $6, NULL, NULL, NULL, NULL, $6,
        NOW() - INTERVAL '2 days', NOW() - INTERVAL '1 day 20 hours', NOW() - INTERVAL '1 day 18 hours', NOW() - INTERVAL '1 day 18 hours',
        NOW() - INTERVAL '1 day 18 hours', NULL, NULL, NOW() - INTERVAL '1 day 18 hours'
      ),
      (
        'Fernanda Lima', 'Usinagem', 'Fresadora Universal', 'FRE-01',
        'Ajuste de folga no fuso do eixo X e revisão da bomba de refrigeração.',
        'Normal', 'Mecânica', 'Pausada',
        NULL, NULL, 'Atendimento priorizado para linha urgente', 'Atendimento priorizado para linha urgente', NULL,
        $1, $2, 'lider',
        $5, $6, $5, $6, NULL, NULL, NULL, NULL, $6,
        NOW() - INTERVAL '1 day', NOW() - INTERVAL '20 hours', NOW() - INTERVAL '16 hours', NOW() - INTERVAL '16 hours',
        NULL, NULL, NULL, NOW() - INTERVAL '16 hours'
      ),
      (
        'Fernanda Lima', 'Embalagem', 'Seladora Térmica Automática', 'CAL-01',
        'Resistência não atinge temperatura nominal de 180°C.',
        'Urgente', 'Elétrica', 'Concluída',
        'Substituída a resistência tubular 220V e reaperto dos bornes do termostato.',
        NULL, NULL, NULL, NULL,
        $1, $2, 'lider',
        $5, $6, NULL, NULL, $5, $6, NULL, NULL, $6,
        NOW() - INTERVAL '4 days', NOW() - INTERVAL '3 days 22 hours', NULL, NULL, NULL, NOW() - INTERVAL '3 days 19 hours', NULL, NOW() - INTERVAL '3 days 19 hours'
      ),
      (
        'Carlos Almeida', 'Logística', 'Empilhadeira Elétrica', 'EMP-02',
        'Falha intermitente no contator de elevação dos garfos.',
        'Normal', 'Elétrica', 'Concluída',
        'Limpeza dos contatos principais, troca do relé auxiliar e testes com carga.',
        NULL, NULL, NULL, NULL,
        $3, $4, 'admin',
        $5, $6, NULL, NULL, $5, $6, NULL, NULL, $6,
        NOW() - INTERVAL '7 days', NOW() - INTERVAL '6 days 21 hours', NULL, NULL, NULL, NOW() - INTERVAL '6 days 17 hours', NULL, NOW() - INTERVAL '6 days 17 hours'
      ),
      (
        'Fernanda Lima', 'Serralheria', 'Máquina de Solda MIG', 'SOL-03',
        'Alimentador de arame patinando durante cordão contínuo.',
        'Normal', 'Mecânica', 'Concluída',
        'Substituída a roldana tracionadora 0.8mm e regulada a pressão do gatilho.',
        NULL, NULL, NULL, NULL,
        $1, $2, 'lider',
        $5, $6, NULL, NULL, $5, $6, NULL, NULL, $6,
        NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days 22 hours', NULL, NULL, NULL, NOW() - INTERVAL '9 days 19 hours', NULL, NOW() - INTERVAL '9 days 19 hours'
      ),
      (
        'Fernanda Lima', 'Estamparia', 'Prensa Hidráulica 80T', 'PRE-01',
        'Solicitação duplicada referente ao ajuste de fim de curso.',
        'Normal', 'Elétrica', 'Cancelada',
        NULL, NULL, NULL, NULL, 'OS aberta em duplicidade pelo turno anterior.',
        $1, $2, 'lider',
        NULL, NULL, NULL, NULL, NULL, NULL, $3, $4, NULL,
        NOW() - INTERVAL '12 days', NULL, NULL, NULL, NULL, NULL, NOW() - INTERVAL '11 days 20 hours', NOW() - INTERVAL '11 days 20 hours'
      )
    RETURNING id, status;
    `,
    [lider.id, lider.nome, admin.id, admin.nome, manutentor.id, manutentor.nome]
  );

  const osAguardando = osRes.rows.find((r) => r.status === "Aguardando peça");
  const osPausada = osRes.rows.find((r) => r.status === "Pausada");
  const osConcluida = osRes.rows.find((r) => r.status === "Concluída");

  if (osAguardando) {
    await client.query(
      `
      INSERT INTO os_pausas (ordem_servico_id, tipo_pausa, motivo, pausado_por_id, pausado_por_nome, data_inicio_pausa)
      VALUES ($1, 'Aguardando peça', 'Kit filtro separador e válvula termostática', $2, $3, NOW() - INTERVAL '1 day 18 hours')
      `,
      [osAguardando.id, manutentor.id, manutentor.nome]
    );
  }
  if (osPausada) {
    await client.query(
      `
      INSERT INTO os_pausas (ordem_servico_id, tipo_pausa, motivo, pausado_por_id, pausado_por_nome, data_inicio_pausa)
      VALUES ($1, 'Pausada', 'Atendimento priorizado para linha urgente', $2, $3, NOW() - INTERVAL '16 hours')
      `,
      [osPausada.id, manutentor.id, manutentor.nome]
    );
  }
  if (osConcluida) {
    await client.query(
      `
      INSERT INTO os_pausas (
        ordem_servico_id, tipo_pausa, motivo, pausado_por_id, pausado_por_nome,
        data_inicio_pausa, data_fim_pausa, retomado_por_id, retomado_por_nome
      )
      VALUES (
        $1, 'Pausada', 'Aguardando resfriamento da câmara térmica', $2, $3,
        NOW() - INTERVAL '3 days 21 hours', NOW() - INTERVAL '3 days 20 hours', $2, $3
      )
      `,
      [osConcluida.id, manutentor.id, manutentor.nome]
    );
  }

  const produtosRes = await client.query(`
    INSERT INTO estoque_produtos (descricao, unidade, estoque_atual, estoque_minimo)
    VALUES
      ('Rolamento 6205-2RS SKF', 'UN', 12.00, 6.00),
      ('Óleo Hidráulico ISO VG 68', 'L', 18.00, 40.00),
      ('Contator Tripolar 25A 220V', 'UN', 2.00, 4.00),
      ('Sensor Fotoelétrico Difuso NPN', 'UN', 1.00, 3.00),
      ('Correia em V A-42', 'UN', 8.00, 4.00),
      ('Fusível NH 63A Retardado', 'UN', 15.00, 6.00),
      ('Resistência Tubular 1500W 220V', 'UN', 3.00, 3.00),
      ('Graxa Lítio EP-2 (Balde 1kg)', 'UN', 5.00, 2.00)
    RETURNING id, descricao;
  `);

  const prodRolamento = produtosRes.rows[0];
  const prodOleo = produtosRes.rows[1];
  const prodSensor = produtosRes.rows[3];

  await client.query(
    `
    INSERT INTO estoque_movimentacoes (
      produto_id, tipo, quantidade, usuario_id, usuario_nome,
      criado_em, recebedor_tipo, recebedor_nome, recebedor_usuario_id
    )
    VALUES
      ($1, 'ENTRADA', 15.00, $4, $5, NOW() - INTERVAL '8 days', NULL, NULL, NULL),
      ($1, 'SAIDA', 3.00, $4, $5, NOW() - INTERVAL '3 days', 'usuario', $6, $7),
      ($2, 'ENTRADA', 40.00, $4, $5, NOW() - INTERVAL '10 days', NULL, NULL, NULL),
      ($2, 'SAIDA', 22.00, $4, $5, NOW() - INTERVAL '2 days', 'usuario', $6, $7),
      ($3, 'SAIDA', 2.00, $4, $5, NOW() - INTERVAL '1 day', 'outro', 'Equipe Turno B', NULL)
    `,
    [prodRolamento.id, prodOleo.id, prodSensor.id, almox.id, almox.nome, manutentor.nome, manutentor.id]
  );

  const ferrRes = await client.query(`
    INSERT INTO ferramentas (tipo, marca)
    VALUES
      ('Parafusadeira de Impacto 20V', 'DeWalt'),
      ('Multímetro Digital True RMS', 'Fluke'),
      ('Torquímetro de Estalo 1/2"', 'Gedore'),
      ('Alicate Amperímetro', 'Minipa'),
      ('Esmerilhadeira Angular 4.1/2"', 'Bosch'),
      ('Termômetro Infravermelho Laser', 'Hikari')
    RETURNING id, tipo, marca;
  `);

  await client.query(
    `
    INSERT INTO ferramentas_emprestimos (
      ferramenta_id, tipo, marca, funcionario_id, funcionario_nome,
      retirado_em, registrado_por, devolvido_em, devolvido_por
    )
    VALUES
      ($1, $2, $3, $10, $11, NOW() - INTERVAL '3 hours', $12, NULL, NULL),
      ($4, $5, $6, $10, $11, NOW() - INTERVAL '1 day', $12, NULL, NULL),
      ($7, $8, $9, $10, $11, NOW() - INTERVAL '5 days', $12, NOW() - INTERVAL '4 days', $12)
    `,
    [
      ferrRes.rows[0].id, ferrRes.rows[0].tipo, ferrRes.rows[0].marca,
      ferrRes.rows[1].id, ferrRes.rows[1].tipo, ferrRes.rows[1].marca,
      ferrRes.rows[2].id, ferrRes.rows[2].tipo, ferrRes.rows[2].marca,
      manutentor.id, manutentor.nome, almox.id
    ]
  );

  await client.query(
    `
    INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, url, lida, criada_em)
    VALUES
      ($1, 'OS_CRIADA', 'Nova OS Urgente #1', 'Prensa Hidráulica 80T (Estamparia) — Vazamento de óleo no bloco distribuidor.', '/pages/painel-manutentor.html', false, NOW() - INTERVAL '2 hours'),
      ($1, 'ESTOQUE_BAIXO', 'Estoque abaixo do mínimo', '3 itens estão abaixo do estoque mínimo e prontos para pedido de compra.', '/pages/pedido-compra.html', false, NOW() - INTERVAL '1 day'),
      ($2, 'OS_CRIADA', 'Nova OS Urgente #1', 'Prensa Hidráulica 80T (Estamparia) — Vazamento de óleo no bloco distribuidor.', '/pages/painel-manutentor.html', false, NOW() - INTERVAL '2 hours'),
      ($2, 'OS_ATUALIZADA', 'OS #3 em andamento', 'Torno CNC em atendimento na Usinagem.', '/pages/painel-manutentor.html', true, NOW() - INTERVAL '4 hours')
    `,
    [admin.id, manutentor.id]
  );

  console.log("Seed de demonstração concluído com sucesso!");
}

async function executar() {
  if (!process.env.DATABASE_URL) {
    console.error("Configure DATABASE_URL no .env antes de executar o seed.");
    process.exit(1);
  }

  const resetar = process.argv.includes("--reset");
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await criarEstrutura(client);
    await popularDados(client, resetar);
    await client.query("COMMIT");
  } catch (erro) {
    await client.query("ROLLBACK");
    console.error("Erro ao executar seed de demonstração:", erro);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

executar();
