/*
    osRoutes.js
    --------------------------------------------------
    Rotas relacionadas às Ordens de Serviço.

    Este arquivo controla o fluxo principal do sistema:

    - Criar nova OS;
    - Listar OS abertas;
    - Listar OS concluídas e canceladas;
    - Colocar OS como aguardando peça;
    - Dar andamento na OS;
    - Concluir OS;
    - Cancelar OS.

    Todas as rotas usam:
    - autenticarToken: verifica se o usuário está logado;
    - permitirPerfis: controla quais perfis podem acessar cada ação.
*/

const express = require("express");
const pool = require("../db/db");
const { responderErroDoBanco } = require("../db/errosBanco");
const { criarNotificacoesParaPerfis } = require("../services/notificacaoService");
const { enviarEmailNovaOS } = require("../services/emailService");
const { buscarOSCompletaPorId, CAMPOS_PAUSAS_JSON } = require("../services/osConsultaService");
const { calcularTemposOS, formatarTemposOS } = require("../services/osTempoService");
const { prepararDadosOSParaPdf } = require("../services/osPdfDataService");
const { gerarPdfOS } = require("../services/osPdfService");
const {
  idValido = (valor) => ["string", "number"].includes(typeof valor)
    && /^(?:[1-9]\d*)$/.test(String(valor))
    && Number.isSafeInteger(Number(valor))
    && Number(valor) <= 2147483647
} = require("../services/ferramentasService") || {};
const { autenticarToken, permitirPerfis } = require("../middleware/authmiddleware");

const router = express.Router();
let estruturaOSPronta;

function obterBody(req) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body : {};
}

function garantirEstruturaDeOS() {
  if (!estruturaOSPronta) {
    estruturaOSPronta = pool.query(`
      ALTER TABLE ordens_servico
      ADD COLUMN IF NOT EXISTS manutentor_responsavel_nome TEXT,
      ADD COLUMN IF NOT EXISTS area_manutencao VARCHAR(40);
      ALTER TABLE ordens_servico
      ALTER COLUMN manutentor_responsavel_nome TYPE TEXT;
      UPDATE ordens_servico
      SET area_manutencao = 'Máquinas'
      WHERE area_manutencao = 'Maquinaria';
    `).catch((erro) => {
      estruturaOSPronta = null;
      throw erro;
    });
  }

  return estruturaOSPronta;
}

router.use(async (req, res, next) => {
  try {
    await garantirEstruturaDeOS();
    next();
  } catch (erro) {
    console.error("Erro ao preparar estrutura de OS:", erro);
    responderErroDoBanco(res, erro, "Não foi possível preparar as ordens de serviço.");
  }
});

/*
    POST /api/os
    --------------------------------------------------
    Cria uma nova Ordem de Serviço

    Campos esperados no body:
    - solicitante
    - setor
    - maquina
    - maquina_id
    - problema
    - prioridade
    - area_manutencao

    Observação:
    - maquina_id pode ser vazio.
    - status inicial sempre será "Aberta".
*/
router.post(
  "/",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "lider", "manutentor"),
  async (req, res) => {
    let client;
    try {
      const { solicitante, setor, setor_outro, maquina, maquina_id, problema, prioridade, area_manutencao } = obterBody(req);

      // Validação dos campos obrigatórios.
      // Mesmo que o frontend valide, o backend também precisa validar.
      if (
        typeof solicitante !== "string"
        || typeof setor !== "string"
        || typeof maquina !== "string"
        || typeof problema !== "string"
        || typeof prioridade !== "string"
        || typeof area_manutencao !== "string"
        || !solicitante
        || !setor
        || !maquina
        || !problema
        || !prioridade
        || !area_manutencao
      ) {
        return res.status(400).json({
          erro: "Solicitante, setor, máquina, problema, prioridade e área da manutenção são obrigatórios."
        });
      }

      if (maquina_id !== undefined && maquina_id !== null && typeof maquina_id !== "string") {
        return res.status(400).json({
          erro: "ID da máquina inválido."
        });
      }

      // Remove espaços extras antes e depois.
      const solicitanteLimpo = solicitante.trim();
      const setorLimpo = setor.trim();
      const maquinaLimpa = maquina.trim();
      const maquinaIdLimpo = typeof maquina_id === "string" && maquina_id.trim() !== "" ? maquina_id.trim() : null;
      const problemaLimpo = problema.trim();

      if (!solicitanteLimpo || !setorLimpo || !maquinaLimpa || !problemaLimpo) {
        return res.status(400).json({
          erro: "Solicitante, setor, máquina e problema não podem ficar vazios."
        });
      }

      if (solicitanteLimpo.length > 120) {
        return res.status(400).json({ erro: "O solicitante deve ter no máximo 120 caracteres." });
      }

      if (maquinaLimpa.length > 160) {
        return res.status(400).json({ erro: "A máquina deve ter no máximo 160 caracteres." });
      }

      if (maquinaIdLimpo && maquinaIdLimpo.length > 60) {
        return res.status(400).json({ erro: "O ID da máquina deve ter no máximo 60 caracteres." });
      }

      if (problemaLimpo.length > 4000) {
        return res.status(400).json({ erro: "A descrição do problema deve ter no máximo 4000 caracteres." });
      }

      const setoresPermitidos = ["Serraria", "Espumação", "Bordado", "Almofada", "Colchão", "Laminação", "Tapeçaria", "Corte", "Costura"];
      const setorPredefinido = setoresPermitidos.includes(setorLimpo);
      const setorOutroValido = setor_outro === true && setorLimpo.length <= 120;
      if (!setorPredefinido && !setorOutroValido && setorLimpo !== "Outro") {
        return res.status(400).json({ erro: "Setor inválido." });
      }

      // Garante que a prioridade enviada seja uma das opções aceitas pelo sistema.
      const prioridadesPermitidas = ["Normal", "Urgente"];

      if (!prioridadesPermitidas.includes(prioridade)) {
        return res.status(400).json({
          erro: "Prioridade inválida."
        });
      }

      const areasManutencaoPermitidas = ["Máquinas", "Máquinas de costura", "Manutenção Civil", "Metalúrgica"];

      if (typeof area_manutencao !== "string" || !areasManutencaoPermitidas.includes(area_manutencao.trim())) {
        return res.status(400).json({ erro: "Área da manutenção inválida." });
      }
      const areaManutencaoLimpa = area_manutencao.trim();

      client = await pool.connect();
      await client.query("BEGIN");

      const resultado = await client.query(
        `
        INSERT INTO ordens_servico
        (
          solicitante,
          setor,
          maquina,
          maquina_id,
          problema,
          prioridade,
          area_manutencao,
          status,
          criado_por_id,
          criado_por_nome,
          criado_por_perfil,
          data_atualizacao
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'Aberta', $8, $9, $10, CURRENT_TIMESTAMP)
        RETURNING *
        `,
        [
          solicitanteLimpo,
          setorLimpo,
          maquinaLimpa,
          maquinaIdLimpo || null,
          problemaLimpo,
          prioridade,
          areaManutencaoLimpa,
          req.usuario.id,
          req.usuario.nome,
          req.usuario.perfil
        ]
      );

      const osCriada = resultado.rows[0];
      await criarNotificacoesParaPerfis(client, ["admin", "almoxarifado", "manutentor"], {
        tipo: "OS_CRIADA",
        titulo: `Nova OS #${osCriada.id}`,
        mensagem: `${osCriada.criado_por_nome} registrou uma OS para ${osCriada.maquina}.`,
        url: "/pages/painel-manutentor.html"
      });
      await client.query("COMMIT");

      // Aguarda o envio antes de finalizar a função. Em ambientes serverless,
      // tarefas iniciadas após a resposta podem ser interrompidas pela plataforma.
      try {
        const resDestinatarios = await pool.query(
          `SELECT email FROM usuarios
           WHERE ativo = true
             AND email IS NOT NULL
             AND email <> ''
             AND $1 = ANY(areas_notificacao_email)`,
          [osCriada.area_manutencao]
        );
        const emailsDestino = resDestinatarios.rows.map((row) => row.email);
        await enviarEmailNovaOS({ os: osCriada, emailsDestino });
      } catch (erroEmail) {
        // O e-mail não deve desfazer uma OS já confirmada no banco.
        console.error(`Erro ao buscar destinatários ou enviar e-mail da OS #${osCriada.id}:`, erroEmail);
      }

      res.status(201).json({
        mensagem: "OS criada com sucesso!",
        os: osCriada
      });
    } catch (erro) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      console.error("Erro ao criar OS:", erro);
      responderErroDoBanco(res, erro, "Erro ao criar OS.");
    } finally {
      if (client) client.release();
    }
  }
);

/*
    GET /api/os/abertas
    --------------------------------------------------
    Lista as OS que ainda estão em andamento no fluxo.

    Status retornados:
    - Aberta;
    - Em andamento;
    - Aguardando peça.

    Ordenação:
    - Urgentes primeiro;
    - Mais recentes primeiro.
*/
async function listarOSAbertas(req, res, somenteMinhas = false) {
    try {
      const resultado = await pool.query(
        `
        SELECT
          os.*,
          pausa_aberta.id AS pausa_atual_id,
          pausa_aberta.tipo_pausa AS pausa_atual_tipo,
          pausa_aberta.motivo AS pausa_atual_motivo,
          pausa_aberta.pausado_por_id AS pausa_atual_pausado_por_id,
          pausa_aberta.pausado_por_nome AS pausa_atual_pausado_por_nome,
          pausa_aberta.data_inicio_pausa AS pausa_atual_inicio
        FROM ordens_servico os
        LEFT JOIN LATERAL (
          SELECT
            op.id,
            op.tipo_pausa,
            op.motivo,
            op.pausado_por_id,
            op.pausado_por_nome,
            op.data_inicio_pausa
          FROM os_pausas op
          WHERE op.ordem_servico_id = os.id
            AND op.data_fim_pausa IS NULL
          ORDER BY op.data_inicio_pausa DESC
          LIMIT 1
        ) pausa_aberta ON true
        WHERE os.status IN ('Aberta', 'Em andamento', 'Aguardando peça', 'Pausada')
          ${somenteMinhas ? 'AND os.criado_por_id = $1' : ''}
        ORDER BY 
          CASE
            WHEN os.prioridade = 'Urgente' THEN 1
            ELSE 2
          END,
          os.data_criacao DESC, os.id DESC
        `,
        somenteMinhas ? [req.usuario.id] : []
      );

      res.json(resultado.rows);
    } catch (erro) {
      console.error("Erro ao buscar OS abertas:", erro);
      responderErroDoBanco(res, erro, "Erro ao buscar OS abertas.");
    }
}

router.get("/abertas", autenticarToken, permitirPerfis("admin", "almoxarifado", "lider", "manutentor"), (req, res) => listarOSAbertas(req, res));

// A autoria vem exclusivamente do token, nunca de parâmetros enviados pelo cliente.
router.get("/minhas", autenticarToken, permitirPerfis("lider"), (req, res) => listarOSAbertas(req, res, true));

/*
    GET /api/os/concluidas
    --------------------------------------------------
    Lista OS concluídas e canceladas.

    Também permite filtros por query string:

    - busca
    - status
    - area_manutencao
    - data_inicio
    - data_fim

    Exemplo:
    /api/os/concluidas?busca=serraria&status=Concluída
*/
router.get(
  "/concluidas",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "lider", "manutentor"),
  async (req, res) => {
    try {
      const { busca, status, area_manutencao, data_inicio, data_fim } = req.query;
      const pagina = Math.max(1, Number.parseInt(req.query.pagina, 10) || 1);
      const limiteSolicitado = Number.parseInt(req.query.limite, 10);
      const limite = Number.isInteger(limiteSolicitado) && limiteSolicitado > 0
        ? Math.min(limiteSolicitado, 100)
        : 25;

      let query = `
        SELECT 
          os.*,
          ${CAMPOS_PAUSAS_JSON}
        FROM ordens_servico os
        WHERE os.status IN ('Concluída', 'Cancelada')
      `;

      const valores = [];

      // Filtro de busca textual.
      // Usa ILIKE para ignorar diferença entre maiúsculas e minúsculas.
      if (busca !== undefined && typeof busca !== "string") {
        return res.status(400).json({ erro: "Pesquisa inválida." });
      }

      if (busca && busca.trim() !== "") {
        valores.push(`%${busca.trim().replace(/[\\%_]/g, "\\$&")}%`);
        const parametroBusca = `$${valores.length}`;

        query += `
          AND (
            os.id::text ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.solicitante ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.setor ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.maquina ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.maquina_id ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.problema ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.solucao ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.manutentor_responsavel_nome ILIKE ${parametroBusca} ESCAPE '\\'
            OR os.motivo_cancelamento ILIKE ${parametroBusca} ESCAPE '\\'
          )
        `;
      }

      // Filtro por status.
      // Aceita somente os status usados no histórico.
      if (status && status !== "Todos") {
        const statusPermitidos = ["Concluída", "Cancelada"];

        if (!statusPermitidos.includes(status)) {
          return res.status(400).json({
            erro: "Status inválido."
          });
        }

        valores.push(status);

        query += `
          AND os.status = $${valores.length}
        `;
      }

      if (area_manutencao && area_manutencao !== "Todas") {
        const areasPermitidas = ["Máquinas", "Máquinas de costura", "Manutenção Civil", "Metalúrgica"];
        if (!areasPermitidas.includes(area_manutencao)) {
          return res.status(400).json({ erro: "Área da manutenção inválida." });
        }
        valores.push(area_manutencao);
        query += ` AND os.area_manutencao = $${valores.length}`;
      }

      // Filtro por data inicial.
      // Usa data_atualizacao porque ela é atualizada ao concluir ou cancelar.
      if (data_inicio) {
        valores.push(data_inicio);

        query += `
          AND os.data_atualizacao::date >= $${valores.length}
        `;
      }

      // Filtro por data final.
      if (data_fim) {
        valores.push(data_fim);

        query += `
          AND os.data_atualizacao::date <= $${valores.length}
        `;
      }

      query += `
        ORDER BY os.data_atualizacao DESC, os.id DESC
      `;

      const resumoResultado = await pool.query(
        `SELECT
          COUNT(*)::int AS total,
          COUNT(*) FILTER (WHERE status = 'Concluída')::int AS concluidas,
          COUNT(*) FILTER (WHERE status = 'Cancelada')::int AS canceladas,
          COUNT(*) FILTER (WHERE prioridade = 'Urgente')::int AS urgentes
         FROM (${query}) AS historico_filtrado`,
        valores
      );
      const resumo = resumoResultado.rows[0];
      const total = resumo.total;
      const totalPaginas = Math.ceil(total / limite);
      const paginaAtual = Math.min(pagina, Math.max(totalPaginas, 1));
      valores.push(limite, (paginaAtual - 1) * limite);
      query += ` LIMIT $${valores.length - 1} OFFSET $${valores.length}`;
      const resultado = await pool.query(query, valores);
      const ordens = resultado.rows.map((os) => {
        const tempos = calcularTemposOS(os);
        return {
          ...os,
          tempos,
          tempos_formatados: formatarTemposOS(tempos)
        };
      });

      res.json({ ordens, total, resumo, pagina: paginaAtual, totalPaginas, limite });
    } catch (error) {
      console.error("Erro ao buscar OS concluídas:", error);
      responderErroDoBanco(res, error, "Erro ao buscar OS concluídas.");
    }
  }
);

/*
    GET /api/os/:id/pdf
    --------------------------------------------------
    Gera um PDF A4 textual de uma Ordem de Serviço específica.

    A consulta inclui todas as pausas e usa a mesma regra de tempos
    enviada ao Histórico. Campos opcionais sem valor não são renderizados.
*/
router.get(
  "/:id/pdf",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "lider", "manutentor"),
  async (req, res) => {
    try {
      if (!idValido(req.params.id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      const id = Number(req.params.id);

      const os = await buscarOSCompletaPorId(id);

      if (!os) {
        return res.status(404).json({ erro: "Ordem de Serviço não encontrada." });
      }

      const dadosPdf = prepararDadosOSParaPdf(os);
      const pdf = await gerarPdfOS(dadosPdf);

      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="${dadosPdf.nomeArquivo}"`);
      res.setHeader("Content-Length", pdf.length);
      return res.send(pdf);
    } catch (erro) {
      console.error("Erro ao gerar PDF da OS:", erro);
      return responderErroDoBanco(res, erro, "Erro ao gerar PDF da Ordem de Serviço.");
    }
  }
);

/*
    PUT /api/os/:id/aguardando-peca
    --------------------------------------------------
    Marca uma OS como "Aguardando peça".

    Pode receber:
    - peca_faltante

    A peça não é obrigatória.
*/
// Aguardando peça
router.put(
  "/:id/aguardando-peca",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "manutentor"),
  async (req, res) => {
    let client;

    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      const { peca_faltante } = obterBody(req);
      if (peca_faltante !== undefined && peca_faltante !== null && typeof peca_faltante !== "string") {
        return res.status(400).json({ erro: "Peça faltante inválida." });
      }

      const pecaFaltanteLimpa =
        typeof peca_faltante === "string" && peca_faltante.trim() !== ""
          ? peca_faltante.trim()
          : null;

      if (pecaFaltanteLimpa && pecaFaltanteLimpa.length > 255) {
        return res.status(400).json({ erro: "A peça faltante deve ter no máximo 255 caracteres." });
      }

      const motivoPausa = pecaFaltanteLimpa || "Aguardando peça";

      client = await pool.connect();
      await client.query("BEGIN");

      const resultado = await client.query(
        `
        UPDATE ordens_servico
        SET
          status = 'Aguardando peça',
          peca_faltante = $1,
          data_aguardando_peca = CURRENT_TIMESTAMP,
          aguardando_peca_por_id = $2,
          aguardando_peca_por_nome = $3,
          tipo_pausa_atual = 'Aguardando peça',
          motivo_pausa_atual = $4,
          data_pausa_atual = CURRENT_TIMESTAMP,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $5
          AND status = 'Em andamento'
          AND NOT EXISTS (
            SELECT 1
            FROM os_pausas op
            WHERE op.ordem_servico_id = ordens_servico.id
              AND op.data_fim_pausa IS NULL
          )
        RETURNING *
        `,
        [
          pecaFaltanteLimpa,
          req.usuario.id,
          req.usuario.nome,
          motivoPausa,
          id
        ]
      );

      if (resultado.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          erro: "OS não encontrada, não está em andamento ou já possui pausa aberta."
        });
      }

      await client.query(
        `
        INSERT INTO os_pausas
        (
          ordem_servico_id,
          tipo_pausa,
          motivo,
          pausado_por_id,
          pausado_por_nome,
          data_inicio_pausa
        )
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `,
        [
          id,
          "Aguardando peça",
          motivoPausa,
          req.usuario.id,
          req.usuario.nome
        ]
      );

      await client.query("COMMIT");

      res.json({
        mensagem: "OS marcada como aguardando peça.",
        ordem: resultado.rows[0]
      });

    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});

      console.error("Erro ao colocar OS como aguardando peça:", error);
      responderErroDoBanco(res, error, "Erro ao colocar OS como aguardando peça.");
    } finally {
      if (client) client.release();
    }
  }
);

/*
    PUT /api/os/:id/pausar
    --------------------------------------------------
    Coloca uma OS aberta em pausa.

    Regras:
    - Só altera OS com status "Aberta";
    - Preenche data_pausa automaticamente;
    - Registra quem pausou.
*/
router.put(
  "/:id/pausar",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "manutentor"),
  async (req, res) => {
    let client;

    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      const { motivo_pausa } = obterBody(req);

      if (typeof motivo_pausa !== "string" || motivo_pausa.trim() === "") {
        return res.status(400).json({
          erro: "Informe o motivo da pausa."
        });
      }

      const motivoPausaLimpo = motivo_pausa.trim();
      if (motivoPausaLimpo.length > 4000) {
        return res.status(400).json({
          erro: "O motivo da pausa deve ter no máximo 4000 caracteres."
        });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      const resultado = await client.query(
        `
        UPDATE ordens_servico
        SET
          status = 'Pausada',
          tipo_pausa_atual = 'Pausa',
          motivo_pausa_atual = $1,
          data_pausa_atual = CURRENT_TIMESTAMP,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $2
          AND status = 'Em andamento'
          AND NOT EXISTS (
            SELECT 1
            FROM os_pausas op
            WHERE op.ordem_servico_id = ordens_servico.id
              AND op.data_fim_pausa IS NULL
          )
        RETURNING *
        `,
        [
          motivoPausaLimpo,
          id
        ]
      );

      if (resultado.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          erro: "OS não encontrada, não está em andamento ou já possui pausa aberta."
        });
      }

      await client.query(
        `
        INSERT INTO os_pausas
        (
          ordem_servico_id,
          tipo_pausa,
          motivo,
          pausado_por_id,
          pausado_por_nome,
          data_inicio_pausa
        )
        VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP)
        `,
        [
          id,
          "Pausa",
          motivoPausaLimpo,
          req.usuario.id,
          req.usuario.nome
        ]
      );

      await client.query("COMMIT");

      res.json({
        mensagem: "OS pausada com sucesso.",
        ordem: resultado.rows[0]
      });

    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});

      console.error("Erro ao pausar OS:", error);
      responderErroDoBanco(res, error, "Erro ao pausar OS.");
    } finally {
      if (client) client.release();
    }
  }
);

/*
    PUT /api/os/:id/retomar
    --------------------------------------------------
    Coloca uma OS pausada em andamento.

    Regras:
    - Só altera OS com status "pausada";
*/
router.put(
  "/:id/retomar",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "manutentor"),
  async (req, res) => {
    let client;

    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      const resultado = await client.query(
        `
        UPDATE ordens_servico
        SET
          status = 'Em andamento',
          tipo_pausa_atual = NULL,
          motivo_pausa_atual = NULL,
          data_pausa_atual = NULL,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $1
          AND status IN ('Aguardando peça', 'Pausada')
        RETURNING *
        `,
        [id]
      );

      if (resultado.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          erro: "OS não encontrada ou não está pausada."
        });
      }

      const pausaAtualizada = await client.query(
        `
        UPDATE os_pausas
        SET
          data_fim_pausa = CURRENT_TIMESTAMP,
          retomado_por_id = $2,
          retomado_por_nome = $3
        WHERE id = (
          SELECT id
          FROM os_pausas
          WHERE ordem_servico_id = $1
            AND data_fim_pausa IS NULL
          ORDER BY data_inicio_pausa DESC
          LIMIT 1
        )
        RETURNING *
        `,
        [
          id,
          req.usuario.id,
          req.usuario.nome
        ]
      );

      if (pausaAtualizada.rows.length === 0) {
        await client.query("ROLLBACK");

        return res.status(400).json({
          erro: "Nenhuma pausa aberta foi encontrada para esta OS."
        });
      }

      await client.query("COMMIT");

      res.json({
        mensagem: "OS retomada com sucesso.",
        ordem: resultado.rows[0]
      });

    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});

      console.error("Erro ao retomar OS:", error);
      responderErroDoBanco(res, error, "Erro ao retomar OS.");
    } finally {
      if (client) client.release();
    }
  }
);

/*
    PUT /api/os/:id/andamento
    --------------------------------------------------
    Coloca uma OS aberta em andamento.

    Regras:
    - Só altera OS com status "Aberta";
    - Preenche data_inicio automaticamente;
    - Registra quem iniciou.
*/
router.put(
  "/:id/andamento",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "manutentor"),
  async (req, res) => {
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      const resultado = await pool.query(
        `
        UPDATE ordens_servico
        SET 
          status = 'Em andamento',
          data_inicio = CURRENT_TIMESTAMP,
          iniciado_por_id = $1,
          iniciado_por_nome = $2,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $3
          AND status = 'Aberta'
        RETURNING *
        `,
        [
          req.usuario.id,
          req.usuario.nome,
          id
        ]
      );

      if (resultado.rows.length === 0) {
        return res.status(400).json({
          erro: "OS não encontrada ou não está aberta."
        });
      }

      res.json({
        mensagem: "OS colocada em andamento com sucesso.",
        ordem: resultado.rows[0]
      });
    } catch (error) {
      console.error("Erro ao dar andamento na OS:", error);
      responderErroDoBanco(res, error, "Erro ao dar andamento na OS.");
    }
  }
);

/*
    PUT /api/os/:id/concluir
    --------------------------------------------------
    Marca uma OS como concluída.

    Campos esperados:
    - solucao

    Regras:
    - solucao é obrigatória;
    - data_conclusao é preenchida automaticamente;
    - registra quem concluiu.
*/
router.put(
  "/:id/concluir",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "manutentor"),
  async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      const { solucao, manutentor_responsavel_nome, manutentores } = obterBody(req);

      if (typeof solucao !== "string" || solucao.trim() === "") {
        return res.status(400).json({
          erro: "Informe o que foi feito na OS."
        });
      }

      const solucaoLimpa = solucao.trim();
      if (solucaoLimpa.length > 4000) {
        return res.status(400).json({
          erro: "A descrição do que foi feito deve ter no máximo 4000 caracteres."
        });
      }

      const selecao = Array.isArray(manutentores)
        ? manutentores
        : (typeof manutentor_responsavel_nome === "string" ? [manutentor_responsavel_nome] : []);
      const itensLimpos = selecao.map((item) => typeof item === "string"
        ? { id: null, nome: item.trim() }
        : ({ id: item?.id ?? null, nome: typeof item?.nome === "string" ? item.nome.trim() : "" }))
        .filter((item) => item.nome);
      const idsManutentores = [...new Set(itensLimpos.filter((item) => item.id !== null).map((item) => Number(item.id)))];
      const nomesLimpos = itensLimpos.map((item) => item.nome);

      if (!nomesLimpos.length) {
        return res.status(400).json({
          erro: "Informe o nome do manutentor que executou a OS."
        });
      }

      if (nomesLimpos.some((nome) => nome.length > 120)) {
        return res.status(400).json({ erro: "Cada nome de manutentor deve ter no máximo 120 caracteres." });
      }
      if (itensLimpos.some((item) => item.id !== null && !idValido(item.id))) {
        return res.status(400).json({ erro: "ID de manutentor inválido." });
      }
      const manutentorResponsavelNomeLimpo = [...new Set(nomesLimpos)].join(", ");

      client = await pool.connect();
      await client.query("BEGIN");

      if (idsManutentores.length) {
        const usuariosValidos = await client.query(
          `SELECT id FROM usuarios WHERE id = ANY($1::int[]) AND (perfil = 'manutentor' OR id = 2)`,
          [idsManutentores]
        );
        if (usuariosValidos.rows.length !== idsManutentores.length) {
          await client.query("ROLLBACK");
          return res.status(400).json({ erro: "Um ou mais usuários selecionados não são manutentores válidos." });
        }
        for (const item of itensLimpos.filter((item) => item.id !== null)) {
          const usuarioId = Number(item.id);
          if (usuarioId === 2 && item.nome.toLocaleLowerCase("pt-BR") !== "marcelo") {
            await client.query("ROLLBACK");
            return res.status(400).json({ erro: "O usuário ID 2 deve ser identificado como Marcelo." });
          }
        }
      }

      const resultado = await client.query(
        `
        UPDATE ordens_servico
        SET 
          status = 'Concluída',
          data_conclusao = CURRENT_TIMESTAMP,
          solucao = $1,
          concluido_por_id = $2,
          concluido_por_nome = $3,
          manutentor_responsavel_nome = $4,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $5
          AND status = 'Em andamento'
        RETURNING *
        `,
        [
          solucaoLimpa,
          req.usuario.id,
          req.usuario.nome,
          manutentorResponsavelNomeLimpo,
          id
        ]
      );

      if (resultado.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          erro: "OS não encontrada ou não pode ser concluída."
        });
      }

      const osConcluida = resultado.rows[0];
      if (idsManutentores.length) {
        await client.query(
          `INSERT INTO ordem_servico_manutentores (ordem_servico_id, usuario_id)
           SELECT $1, unnest($2::int[]) ON CONFLICT (ordem_servico_id, usuario_id) DO NOTHING`,
          [osConcluida.id, idsManutentores]
        );
      }
      await criarNotificacoesParaPerfis(client, ["admin", "almoxarifado", "lider"], {
        tipo: "OS_CONCLUIDA",
        titulo: `OS #${osConcluida.id} concluída`,
        mensagem: `${req.usuario.nome} concluiu a OS da máquina ${osConcluida.maquina}.`,
        url: "/pages/os-concluidas.html"
      });
      await client.query("COMMIT");

      res.json({
        mensagem: "OS concluída com sucesso.",
        ordem: osConcluida
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      console.error("Erro ao concluir OS:", error);
      responderErroDoBanco(res, error, "Erro ao concluir OS.");
    } finally {
      if (client) client.release();
    }
  }
);

/*
    PUT /api/os/:id/cancelar
    --------------------------------------------------
    Cancela uma OS.

    Campos esperados:
    - motivo_cancelamento

    Observação:
    - O motivo pode ficar vazio.
*/
router.put(
  "/:id/cancelar",
  autenticarToken,
  permitirPerfis("admin", "almoxarifado", "manutentor"),
  async (req, res) => {
    let client;
    try {
      const { id } = req.params;
      if (!idValido(id)) {
        return res.status(400).json({ erro: "Número de OS inválido." });
      }

      const { motivo_cancelamento } = obterBody(req);
      if (motivo_cancelamento !== undefined && motivo_cancelamento !== null && typeof motivo_cancelamento !== "string") {
        return res.status(400).json({ erro: "Motivo do cancelamento inválido." });
      }

      const motivoCancelamentoLimpo =
        typeof motivo_cancelamento === "string" && motivo_cancelamento.trim() !== ""
          ? motivo_cancelamento.trim()
          : null;

      if (motivoCancelamentoLimpo && motivoCancelamentoLimpo.length > 4000) {
        return res.status(400).json({ erro: "O motivo do cancelamento deve ter no máximo 4000 caracteres." });
      }

      client = await pool.connect();
      await client.query("BEGIN");

      const resultado = await client.query(
        `
        UPDATE ordens_servico
        SET
          status = 'Cancelada',
          data_cancelamento = CURRENT_TIMESTAMP,
          motivo_cancelamento = $1,
          cancelado_por_id = $2,
          cancelado_por_nome = $3,
          data_atualizacao = CURRENT_TIMESTAMP
        WHERE id = $4
          AND status IN ('Aberta', 'Em andamento', 'Aguardando peça', 'Pausada')
        RETURNING *
        `,
        [
          motivoCancelamentoLimpo,
          req.usuario.id,
          req.usuario.nome,
          id
        ]
      );

      if (resultado.rows.length === 0) {
        await client.query("ROLLBACK");
        return res.status(400).json({
          erro: "OS não encontrada ou não pode ser cancelada."
        });
      }

      // Se a OS estava em pausa ou aguardando peça, fecha a pausa aberta para integridade do histórico
      await client.query(
        `
        UPDATE os_pausas
        SET
          data_fim_pausa = CURRENT_TIMESTAMP,
          retomado_por_id = $2,
          retomado_por_nome = $3
        WHERE ordem_servico_id = $1
          AND data_fim_pausa IS NULL
        `,
        [
          id,
          req.usuario.id,
          req.usuario.nome
        ]
      );

      await client.query("COMMIT");

      res.json({
        mensagem: "OS cancelada com sucesso.",
        ordem: resultado.rows[0]
      });
    } catch (error) {
      if (client) await client.query("ROLLBACK").catch(() => {});
      console.error("Erro ao cancelar OS:", error);
      responderErroDoBanco(res, error, "Erro ao cancelar OS.");
    } finally {
      if (client) client.release();
    }
  }
);

module.exports = router;
