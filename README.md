# Sistema OS — Gestão de Manutenção Industrial

Sistema web completo para controle de **Ordens de Serviço (OS)**, manutenção preventiva/corretiva, estoque de peças, pedidos de compra, empréstimo de ferramentas e emissão de relatórios em **PDF** e **Excel**.

> **Nota de Portfólio:** Esta é a versão de demonstração pública do sistema, executando em **Modo Demonstração (Somente leitura)** com dados fictícios e acesso rápido em 1 clique por perfil.

---

## Demonstração Online

* **Link da Demo:** `https://sistema-os-demo.vercel.app/pages/login` *(atualizar após deploy na Vercel)*
* **Acesso rápido:** Na tela de login, utilize os botões de **Modo Demonstração** para entrar como **Administrador**, **Manutentor**, **Líder** ou **Almoxarifado** sem precisar de senha.

---

## Principais Funcionalidades

* **Gestão de Ordens de Serviço (OS):**
  * Abertura de OS por máquina/setor com prioridade (`Normal` / `Urgente`) e área de manutenção.
  * Ciclo completo de atendimento: *Aberta → Em andamento → Pausada / Aguardando peça → Concluída / Cancelada*.
  * Histórico de pausas (`os_pausas`) e cálculo automático de tempo em atendimento vs. tempo parado.
  * Geração de PDF individual da OS com layout padronizado.
* **Relatórios Gerenciais:**
  * Filtros por período, status, prioridade e busca textual.
  * Exportação de relatórios resumidos e detalhados em **PDF**.
* **Estoque e Pedidos de Compra:**
  * Controle de entradas, saídas e cancelamento atômico de movimentações.
  * Alerta automático de itens abaixo do estoque mínimo.
  * Montagem de pedido de compra com exportação em **Excel (.xlsx)** e **PDF**.
* **Ferramentas e Máquinas:**
  * Controle de retirada e devolução de ferramentas com histórico por colaborador.
  * Cadastro de máquinas com código, setor, marca, modelo e observações.
* **Segurança e Controle de Acesso:**
  * Autenticação via **JWT** (`HS256`) com senhas criptografadas (`bcryptjs`).
  * Permissões granulares por perfil (`admin`, `manutentor`, `lider`, `almoxarifado`, `compras`).
  * Proteção contra força bruta no login (`login_limites` por IP e conta).
  * Notificações internas no painel e notificações por e-mail (`nodemailer`).

---

## Tecnologias Utilizadas

* **Backend:** Node.js, Express 5
* **Banco de Dados:** PostgreSQL (hospedado no Neon)
* **Autenticação & Segurança:** JSON Web Token (`jsonwebtoken`), `bcryptjs`, `cors`
* **Geração de Documentos:** `pdfkit` (PDF) e `exceljs` (Excel)
* **E-mail:** `nodemailer`
* **Frontend:** HTML5, CSS3 e JavaScript Vanilla (PWA-ready com `manifest.webmanifest`)
* **Testes:** `node:test` (suíte nativa do Node.js)
* **Deploy:** Vercel (`vercel.json` serverless)

---

## Modo Demonstração (`DEMO_MODE=true`)

Para manter o ambiente público seguro contra alterações indevidas:
* Todas as consultas (`GET`), filtros e exportações (**PDF** e **Excel**) funcionam normalmente.
* O endpoint `/api/demo-login` autentica o visitante com um token JWT de demonstração.
* Qualquer operação de escrita (`POST`, `PUT`, `PATCH`, `DELETE`) que alteraria o banco é bloqueada pelo middleware (`HTTP 423`), mantendo os dados de exemplo intactos.
* O envio real de e-mails é desativado automaticamente.

---

## Como Rodar Localmente

### Pré-requisitos
* Node.js `>= 18`
* Banco de dados PostgreSQL (ex.: [Neon](https://neon.tech))

### Passo a passo

1. **Instale as dependências:**
   ```bash
   npm install
   ```

2. **Configure as variáveis de ambiente:**
   Copie o arquivo `.env.example` para `.env` e preencha os valores:
   ```bash
   cp .env.example .env
   ```
   Variáveis principais:
   * `DATABASE_URL`: string de conexão do PostgreSQL/Neon
   * `JWT_SECRET`: chave secreta para assinatura dos tokens JWT
   * `DEMO_MODE`: `true` para ativar o modo demonstração somente leitura

3. **Crie as tabelas e popule os dados fictícios:**
   ```bash
   npm run seed:demo
   ```
   *(Para limpar e recriar os dados do zero: `node scripts/seed-demo.js --reset`)*

4. **Inicie o servidor:**
   ```bash
   npm start
   ```
   Acesse `http://localhost:3000`.

5. **Execute os testes automatizados:**
   ```bash
   npm test
   ```

---

## Autor

Desenvolvido por **Paulo Henrique** — Licença [MIT](LICENSE).
