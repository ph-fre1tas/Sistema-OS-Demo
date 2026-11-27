const nodemailer = require("nodemailer");

let transporter;

function obterTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      service: "gmail",
      connectionTimeout: 4000,
      greetingTimeout: 4000,
      socketTimeout: 5000,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  }
  return transporter;
}

function formatarData(data) {
  const opcoes = {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo"
  };

  if (!data) {
    return new Intl.DateTimeFormat("pt-BR", opcoes).format(new Date());
  }

  // O PostgreSQL devolve TIMESTAMP sem fuso como texto (ex.: 2026-09-09
  // 14:30:00). No banco em produção esse valor está em UTC; acrescentar o
  // indicador "Z" torna essa origem explícita antes de converter para São Paulo.
  let dataParaFormatar = data;

  if (typeof dataParaFormatar === "string") {
    const dataSemFuso = dataParaFormatar.match(/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(?:\.\d+)?$/);
    if (dataSemFuso) {
      dataParaFormatar = `${dataParaFormatar.replace(" ", "T")}Z`;
    }
  }

  return new Intl.DateTimeFormat("pt-BR", opcoes).format(new Date(dataParaFormatar));
}

function escaparHtml(str) {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function enviarEmailNovaOS({ os, emailsDestino }) {
  if (String(process.env.DEMO_MODE || "").trim().toLowerCase() === "true") {
    console.log(`Modo demo ativo: envio de e-mail da OS #${os?.id ?? "?"} ignorado.`);
    return { demoSkipped: true };
  }

  if (!emailsDestino || emailsDestino.length === 0) {
    return;
  }

  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.error("EMAIL_USER ou EMAIL_PASS não configurados no .env.");
    return;
  }

  const ehUrgente = os.prioridade === "Urgente";
  const marcadorPrioridade = ehUrgente ? "🚨 [URGENTE]" : "[Sistema OS]";
  const assunto = `${marcadorPrioridade} Nova OS #${os.id} - ${os.maquina} (Setor: ${os.setor})`
    .replace(/[\r\n]+/g, " ");

  const corPrioridade = ehUrgente ? "#d97706" : "#2563eb";
  const fundoPrioridade = ehUrgente ? "#fef3c7" : "#dbeafe";
  const textoPrioridade = ehUrgente ? "🚨 Urgente" : "Normal";

  const html = `
    <!DOCTYPE html>
    <html lang="pt-BR">
    <head>
      <meta charset="UTF-8">
      <style>
        body { font-family: Arial, sans-serif; background-color: #f3f4f6; margin: 0; padding: 20px; color: #1f2937; }
        .container { max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1); }
        .header { background-color: #052b4f; color: #ffffff; padding: 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 20px; }
        .header p { margin: 5px 0 0 0; font-size: 13px; opacity: 0.8; }
        .content { padding: 25px; }
        .badge-prioridade { display: inline-block; padding: 6px 12px; border-radius: 4px; font-weight: bold; font-size: 14px; color: ${corPrioridade}; background-color: ${fundoPrioridade}; }
        .table-info { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .table-info td { padding: 10px 12px; border-bottom: 1px solid #e5e7eb; font-size: 14px; }
        .table-info td.label { font-weight: bold; color: #4b5563; width: 35%; }
        .problema-box { background-color: #f9fafb; border-left: 4px solid #052b4f; padding: 12px 15px; margin-top: 15px; border-radius: 0 4px 4px 0; font-size: 14px; }
        .footer { background-color: #f9fafb; text-align: center; padding: 15px; font-size: 12px; color: #6b7280; border-top: 1px solid #e5e7eb; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Sistema OS — Gestão de Manutenção</h1>
          <p>Notificação Automática de Nova Ordem de Serviço</p>
        </div>
        <div class="content">
          <h2 style="margin-top: 0; color: #111827;">Nova OS Registrada #${os.id}</h2>
          <p style="margin-bottom: 15px; font-size: 14px;">Uma nova solicitação de manutenção foi cadastrada no sistema:</p>

          <div>
            <span class="badge-prioridade">${textoPrioridade}</span>
          </div>

          <table class="table-info">
            <tr>
              <td class="label">Número da OS:</td>
              <td><strong>#${os.id}</strong></td>
            </tr>
            <tr>
              <td class="label">Solicitante:</td>
              <td>${escaparHtml(os.solicitante)}</td>
            </tr>
            <tr>
              <td class="label">Setor:</td>
              <td>${escaparHtml(os.setor)}</td>
            </tr>
            <tr>
              <td class="label">Máquina / Equip.:</td>
              <td>${escaparHtml(os.maquina)} ${os.maquina_id ? `(ID: ${escaparHtml(os.maquina_id)})` : ""}</td>
            </tr>
            <tr>
              <td class="label">Criado por:</td>
              <td>${escaparHtml(os.criado_por_nome)} (${escaparHtml(os.criado_por_perfil)})</td>
            </tr>
            <tr>
              <td class="label">Data de Criação:</td>
              <td>${formatarData(os.data_criacao)}</td>
            </tr>
          </table>

          <div style="margin-top: 20px;">
            <strong style="font-size: 14px; color: #374151;">Descrição do Problema:</strong>
            <div class="problema-box">
              ${escaparHtml(os.problema).replace(/\n/g, "<br>")}
            </div>
          </div>
        </div>
        <div class="footer">
          <p>Esta é uma mensagem automática enviada pelo Sistema OS — Gestão de Manutenção.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: `"Sistema OS - Manutenção" <${process.env.EMAIL_USER}>`,
    to: emailsDestino.join(", "),
    subject: assunto,
    html: html
  };

  try {
    const info = await obterTransporter().sendMail(mailOptions);
    console.log(`E-mail da OS #${os.id} enviado com sucesso para: ${emailsDestino.join(", ")} (ID: ${info.messageId})`);
    return info;
  } catch (erro) {
    console.error(`Erro ao enviar e-mail da OS #${os.id}:`, erro.message);
  }
}

module.exports = {
  enviarEmailNovaOS
};
