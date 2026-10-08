# Chamados de Maqueiros · Casa de Saúde São Lucas

Sistema web para registrar e acompanhar o transporte interno de pacientes pelos maqueiros.
Substitui o livro da Central de Telefonistas sem aumentar o trabalho da telefonista
(**NOVO CHAMADO → INFORMAR MAQUEIRO → ENCERRAR**, registro em menos de 30 s) e dá à gestão
os indicadores de volume, pico, carga por maqueiro, tempos, atrasos e capacidade.

- **Front:** React 18 + TypeScript + Vite, React Router, TanStack Query, Tailwind, Recharts,
  React Hook Form + Zod, date-fns (pt-BR, fuso `America/Fortaleza`).
- **Back:** Supabase (PostgreSQL, Auth, RLS, Realtime, funções RPC, Edge Function).
- Toda regra de integridade e segurança está **no banco**. O front não faz `INSERT`/`UPDATE`
  em chamados: tudo passa por funções que validam permissão e gravam auditoria.

---

## 1. Estrutura

```
supabase/
  migrations/              SQL versionado (aplicar em ordem)
    …0100_schema.sql        tabelas e constraints
    …0200_seguranca.sql     papel_atual(), setor_atual(), auditoria (triggers), bloqueio de exclusão, RLS
    …0300_escala_…sql       turnos, disponibilidade, painel dos maqueiros, capacidade, RPCs da escala
    …0400_chamados_rpc.sql  abrir, acionar, mudar status, encerrar, cancelar, corrigir
    …0500_views_grants.sql  vw_chamados_metricas, vw_demanda_hora, vw_historico, permissões, Realtime
  seed.sql                 setores, maqueiros e configurações iniciais
  seed_escala_exemplo_out2026.sql   escala de EXEMPLO (só homologação)
  functions/admin-usuarios Edge Function: criar login, nova senha, bloquear (somente gestão)
  tests/rls_e_regras.sql   testes de RLS e regras (um usuário de cada papel)
scripts/
  criar-usuarios.mjs       cria gestao, telefonista e um login por setor (service_role)
  test-db-local.sh         aplica tudo num PostgreSQL local e roda os testes do banco
src/
  features/                auth, chamados, central, enfermagem, maqueiros, escala,
                           dashboard, capacidade, relatorios, historico, config
  lib/                     supabase.ts, regras.ts, metricas.ts, exportar.ts, tempo.ts, importarEscala.ts
  components/              ui (botões, campos, modal, KPI…), graficos, Layout
  hooks/dados.ts           consultas e sincronização em tempo real
  types/database.ts        tipos do banco (formato do `supabase gen types`)
e2e/                       testes Playwright (fluxo da Central e do setor)
docs/ROTEIRO_TESTE_CENTRAL.md   roteiro de homologação com a Central
```

---

## 2. Implantação

### 2.1 Criar o projeto Supabase

1. Crie o projeto em <https://supabase.com> (região São Paulo).
2. Em **Authentication → Providers → Email**: deixe o e-mail habilitado e **desligue**
   "Confirm email" e "Allow new users to sign up" (os logins são criados só pela gestão).
3. Em **Authentication → Sessions** (se disponível no plano): defina tempo de inatividade, por
   exemplo 12 h, para que computadores compartilhados não fiquem logados indefinidamente.

### 2.2 Aplicar o banco

Com a [Supabase CLI](https://supabase.com/docs/guides/cli):

```bash
supabase login
supabase link --project-ref SEU_PROJECT_REF
supabase db push                         # aplica supabase/migrations
psql "$DATABASE_URL" -f supabase/seed.sql
```

(`DATABASE_URL` está em Project Settings → Database → Connection string.)
Sem a CLI: cole cada arquivo de `supabase/migrations/` em ordem no **SQL Editor** e depois o `seed.sql`.

A última migration já adiciona `chamados`, `habilitacoes`, `indisponibilidades`, `maqueiros`,
`escala_dias` e `configuracoes` à publicação `supabase_realtime`. Confira em
**Database → Publications**.

### 2.3 Publicar a Edge Function de acessos

```bash
supabase functions deploy admin-usuarios
```

Ela usa `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`, que o Supabase já
injeta automaticamente. A **service_role nunca vai para o front**.

### 2.4 Criar os usuários iniciais

```bash
npm install
SUPABASE_URL=https://SEU.supabase.co SUPABASE_SERVICE_ROLE_KEY=... node scripts/criar-usuarios.mjs
```

Cria `gestao`, `telefonista` e um login por setor ativo (nome sem acento e sem espaço:
`uti1`, `saojose`, `santaterezinha`, `ps`…), com senhas aleatórias de 10 caracteres, e grava
`usuarios-iniciais.csv` (ignorado pelo git). **Entregue as senhas por canal seguro e apague o
arquivo.** Depois disso, a gestão cria logins e troca senhas pela tela **Configurações → Acessos**.

> O login é por usuário + senha. Internamente o Supabase usa o e-mail sintético
> `usuario@maqueiros.cssl`, que nunca aparece na tela.

### 2.4.1 Autocadastro (página "Cadastre-se")

Na tela de login há o link **Cadastre-se** (`/cadastro`). A pessoa informa nome, perfil
(setor, telefonista ou gestão), setor, usuário e senha (mínimo 8 caracteres).

- O **primeiro cadastro do sistema** vira **gestão** já aprovada (serve para começar com o banco vazio).
- Os demais ficam **aguardando aprovação**: sem acesso a nada até a gestão aprovar em
  **Configurações → Acessos**, onde é possível ajustar perfil e setor antes de aprovar, ou recusar.
- Publicar a função: `supabase functions deploy cadastro --no-verify-jwt` (ela não depende de login).

### 2.5 Publicar o front

```bash
cp .env.example .env.local      # preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY
npm run build                   # gera dist/
```

| Variável | Onde achar | Observação |
|---|---|---|
| `VITE_SUPABASE_URL` | Project Settings → API → Project URL | pública |
| `VITE_SUPABASE_ANON_KEY` | Project Settings → API → anon public | pública (a RLS protege os dados) |

- **Vercel (em uso na homologação):** projeto `chamado-maqueiros` ligado ao GitHub; cada
  atualização no `main` publica sozinha. As variáveis `VITE_SUPABASE_URL` e
  `VITE_SUPABASE_ANON_KEY` ficam em Settings → Environment Variables (Production e Preview).
  Ao mudar uma variável, é preciso publicar de novo (Deployments → ⋯ → Redeploy).
- **Netlify:** publique `dist/` (o arquivo `public/_redirects` já trata as rotas do React).
- **Vercel:** o `vercel.json` já tem o rewrite e os cabeçalhos de segurança.
- **Servidor da TI (nginx):** sirva `dist/` com `try_files $uri /index.html;`.
- **HTTPS é obrigatório.**

### 2.5.1 Rodar no próprio computador (Windows)

1. Instale o Node.js LTS (<https://nodejs.org>).
2. Crie o arquivo `.env.local` na pasta do projeto (modelo em `.env.example`).
3. Dê **duplo clique em `iniciar.cmd`**: ele instala/atualiza as bibliotecas, liga o sistema e
   abre o navegador em <http://localhost:5173>. Para desligar, feche a janela.

### 2.6 Escala

Na primeira entrada da gestão: **Escala → Importar planilha** com a escala oficial do mês
(CSV ou Excel no layout "ESCALA MAQUEIROS – CASA DE SAÚDE SÃO LUCAS": nome, horário e uma
coluna por dia com D/N/E/FÉRIAS). A tela mostra a prévia, casa os nomes com o cadastro e
permite corrigir antes de gravar. As férias do JOÃO GUILHERME (05/10 a 03/11) entram pela
planilha de cada mês.

> **Atenção:** um mês com qualquer registro de escala passa a valer só pela escala (quem não
> tem D/N/E no dia fica "fora da escala"). Mês sem nenhum registro usa o horário padrão de
> cada maqueiro todos os dias, com aviso na tela.

---

## 3. Perfis

| Papel | Telas | Pode |
|---|---|---|
| `setor` (Enfermagem) | Meus chamados | abrir chamados do próprio setor, acompanhar em tempo real, cancelar os do próprio setor |
| `telefonista` (Central) | Central, Painel, Maqueiros, Registros | abrir, distribuir maqueiros, mudar status, encerrar, cancelar; habilitar/desabilitar, indisponível, iniciar/encerrar intervalo; consultar registros com horários e linha do tempo, exportar |
| `gestao` (Gestão NIR) | todas | tudo acima + dashboard (inclui aba Intervalos), capacidade, relatórios e exportação, escala, histórico, correções, configurações e acessos |

| `maqueiro` (app no celular) | App (`/app`) | iniciar/encerrar jornada (GPS dentro do hospital e escala/habilitação), receber, aceitar ou recusar chamados, atualizar andamento, concluir, intervalo |

**App do maqueiro e distribuição automática** (migration 9):
- O maqueiro se cadastra como "Maqueiro", escolhe o próprio nome da escala e a gestão aprova. No celular,
  abre o site e usa "Adicionar à tela inicial" (vira app, abre em tela cheia).
- **Iniciar jornada** só funciona se ele estiver na escala/habilitado pela Central **e** dentro do raio do
  hospital (GPS). Local e raio: Configurações → App dos maqueiros (botão "Usar minha localização atual").
- Chamado aberto → oferecido ao maqueiro **livre há mais tempo** (fila de táxi), com **90 s** para aceitar
  (configurável). Recusa exige motivo e passa ao próximo; sem resposta também passa ao próximo.
  **Urgente** é oferecido a todos os livres ao mesmo tempo; o primeiro que aceitar leva.
- Maqueiros do **CC** recebem chamados do CC; em **sábados, domingos e feriados** também os do hospital.
  Feriados: Configurações → App dos maqueiros (os nacionais de 2026 já vêm cadastrados; inclua os de Natal/RN).
- Se ninguém aceitar ou não houver maqueiro livre no app, o card da Central avisa para direcionar
  manualmente ("Tentar de novo no app" recomeça a fila). A Central continua podendo acionar qualquer um.
- Celular pessoal: o app mostra só as iniciais do paciente (ou o nº do atendimento) e não acessa a lista de
  chamados do hospital.
- Nesta etapa o aviso de chamado (som + vibração) funciona com o app aberto na tela; a tela fica acesa
  durante a jornada. Notificação com o celular bloqueado é a próxima etapa (Web Push).
- Dados: tabelas `jornadas` e `ofertas`, views `vw_jornadas` e `vw_ofertas`; Dashboard → aba **App**.

**Intervalos:** cada "Iniciar/Encerrar intervalo" vira um registro (tabela `intervalos`, view `vw_intervalos`)
com início, fim e quem registrou. Só é possível iniciar intervalo de quem está de plantão ou habilitado.
Os dados aparecem em Maqueiros (tempo correndo e total do dia), Dashboard → Intervalos e nos Relatórios.

O campo **Seu nome** do login vai num cabeçalho (`x-ator-nome`) de todas as requisições e o
banco grava em `criado_por`, `encerrado_por`, `cancelado_por` e no histórico, no formato
`Maria (telefonista)`.

---

## 4. Regras implementadas no banco

- **Número e hora:** `CH-AAAA-NNNNNN`, reinicia por ano, gerado em `abrir_chamado` com contador
  travado na transação. Hora de abertura = `now()` do servidor; só a gestão informa outra, com
  justificativa.
- **Formulário:** Alta sem destino; Óbito com destino Necrotério; Transferência interna exige os
  dois leitos; setores com `exige_leito` exigem leito de origem em qualquer tipo; setor tem a
  origem forçada e solicitante obrigatório; opção "somente nº do atendimento" (LGPD).
- **Acionamento:** só aceita maqueiro disponível agora (escala D/N/E ou horário padrão sem
  escala, ou habilitação, sem intervalo e sem indisponibilidade aberta). Plantão N vai das 19h
  às 07h do dia seguinte.
- **Encerramento:** exige maqueiro; grava a hora do servidor; acima do SLA exige motivo de
  atraso ("Outro" exige descrição).
- **Cancelamento:** justificativa obrigatória; o setor só cancela os próprios; nunca exclui.
- **Correções:** só gestão, com justificativa; ficam no histórico com valor antigo e novo.
- **Auditoria:** triggers gravam em `chamado_eventos` cada campo alterado (chamados, maqueiros,
  escala, habilitações, indisponibilidades, setores, configurações, acessos). O histórico é
  imutável.
- **Nada é apagado:** não há política de DELETE e há triggers que bloqueiam exclusão de
  chamados, histórico, maqueiros, setores, habilitações e indisponibilidades, inclusive para a
  `service_role`.
- **Views para BI (somente leitura, respeitam RLS):** `vw_chamados_metricas`, `vw_demanda_hora`,
  `vw_historico`; funções `painel_maqueiros()`, `capacidade_dia(data)`, `turnos_periodo(de, ate)`.

---

## 5. Testes

```bash
npm test               # unitários: regras do formulário, SLA, escala (inclui plantão noturno), métricas, importação, formulário
npm run lint
npm run typecheck
npm run test:db        # PostgreSQL local: migrations + seed + testes de RLS/regras + 500 aberturas simultâneas
```

`test:db` precisa de um PostgreSQL 15+ local (`PGURL=postgres://usuario:senha@localhost:5432/postgres`).
Os mesmos testes de RLS rodam direto no Supabase de homologação:
`psql "$DATABASE_URL" -f supabase/tests/rls_e_regras.sql` (tudo roda em transação e é desfeito).

**E2E (Playwright)**, contra um Supabase de **homologação** com seed e usuários criados:

```bash
E2E_SENHA_TELEFONISTA=... E2E_SENHA_UTI1=... npm run test:e2e
```

Cobre `abrir → acionar → em atendimento → encerrar` (com tempo de registro < 30 s),
cancelamento com justificativa e `setor abre → Central aciona → setor vê o status sem recarregar
→ setor cancela`. Se nenhum maqueiro estiver de plantão no horário do teste, o próprio teste
habilita um. Os testes criam chamados reais na homologação (identificados com "E2E").

---

## 6. Backup e operação

- **Backup:** o Supabase faz backup diário automático (planos pagos; o plano Pro guarda 7 dias,
  com opção de recuperação ponto a ponto). Recomenda-se também um dump semanal fora do
  Supabase:
  `pg_dump "$DATABASE_URL" --schema=public --format=custom -f maqueiros_$(date +%F).dump`
  guardado em local seguro da TI (contém dados de pacientes: armazenar com acesso restrito).
- **Restauração:** `pg_restore --clean --no-owner -d "$DATABASE_URL" arquivo.dump`.
- **Atualizações do banco:** sempre por nova migration em `supabase/migrations` (nunca editar
  as já aplicadas). Depois rode `npm run gen:types` e compare com `src/types/database.ts`.
- **Novo setor:** Configurações → Setores (marcar "leito obrigatório" se for internação) e
  depois Configurações → Acessos para criar o login do setor.
- **Troca de senha / bloqueio de login:** Configurações → Acessos.

---

## 7. LGPD

- Campo do paciente pode ser restrito a **nº do atendimento** (Configurações → Parâmetros).
- Nenhum dado de paciente vai para URLs, logs do front ou para o histórico de cadastro; a lista
  de chamados exportada nos relatórios **não inclui o nome do paciente**.
- Cada setor só enxerga os próprios chamados (RLS, também no tempo real).
- O arquivo de senhas iniciais e os dumps de backup devem ser tratados como dado sensível.

---

## 8. Preparado para integrações

As métricas ficam em views (`vw_chamados_metricas`, `vw_demanda_hora`) que podem ser lidas por
Power BI/WeNow com um usuário somente leitura. A tabela `chamado_eventos` tem colunas
`entidade`/`entidade_id`, e a origem do chamado e o tipo já separam Centro Cirúrgico,
Hemodinâmica e exames, facilitando cruzar com mapa cirúrgico, agenda de exames e NIR.
