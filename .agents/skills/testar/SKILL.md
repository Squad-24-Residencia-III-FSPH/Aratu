---
name: testar
description: >
  Executa e valida a bateria de testes funcionais, responsividade multi-dispositivo (monitores
  antigos 4:3 e 16:10, e celulares/tablets), acessibilidade WCAG 2.2 Nível AA e casos de borda de uma tarefa
  do Sistema Aratu, percorrendo o fluxo operacional em navegador real (React 19 em localhost:5173),
  na API REST (Express 5 em localhost:3000) e no PostgreSQL 18, auditando perfis RBAC,
  5 estados visuais, resiliência de entrada e dados 100% fictícios (LGPD).
  Use quando o usuário pedir /testar ou solicitar a verificação prática de uma funcionalidade.
argument-hint: "[nome da branch, chave da issue no Jira ou vazio para testar a branch atual]"
license: MIT
---

# Testar Tarefa no Ambiente Local — Sistema Aratu

Obtém o contexto da tarefa (plano SDD em `docs/plans/` ou dados do Jira via `.agents/skills/buscar-tarefa/SKILL.md`), verifica a saúde dos containers Docker (`db`, `backend`, `frontend`), executa os cenários de teste de ponta a ponta, auditoria mandatória de **responsividade multi-dispositivo** (monitores legados 4:3 e 16:10, e dispositivos móveis/celulares) e casos de borda obrigatórios (interface React 19 em `http://localhost:5173` operada com a ferramenta de navegador disponível, API Express 5 em `http://localhost:3000` e persistência no **PostgreSQL 18**), auditando rigorosamente os critérios de acessibilidade (**WCAG 2.2 Nível AA**) e controle de acesso (**RBAC**).

---

## Argumentos (`$ARGUMENTS`)

`$ARGUMENTS` pode ser:
- A chave ou URL da tarefa no Jira (ex: `FROTA-27` ou `https://squad24.atlassian.net/browse/FROTA-27`);
- O nome da branch da tarefa (ex: `feat/controle-sessao-token` ou `feature/login`);
- Vazio: utiliza a branch atual (`git branch --show-current`).

---

## Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Carregar e Obedecer a Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** Antes de executar a bateria de testes ou julgar o comportamento de uma tela/endpoint, leia e aplique obrigatoriamente **`.agents/skills/principios/SKILL.md`** e as referências `.agents/skills/principios/references/acessibilidade.md`, `ui-componentes.md`, `ux-fluxo.md`, `escopo-impacto.md` e `dados.md`. Aplique a **Regra da Dúvida** (nunca assuma credenciais ou regras não documentadas em silêncio) e a **Proteção LGPD/SVO** (dados 100% fictícios).

---

### Passo 1 — Levantar Contexto, Plano SDD e Rodar Suíte Automatizada (`aratu-check.mjs`)

1. Execute o verificador estático (inclui tipos e testes frontend):
   ```bash
   node docs/scripts/aratu-check.mjs
   ```
   O auditor não executa a suíte backend. Confira que o banco dedicado de testes é distinto do banco da aplicação antes de executar, na pasta `backend`, `npm run test:integration` e `npm test`. Cumpra também as repetições e verificações adicionais exigidas pelo SDD.
2. Se existir plano técnico em `docs/plans/<nome-do-plano>.html`, leia as seções **2 (Requisitos)**, **5 (Contratos REST)**, **6 (Front-end e 5 Estados Visuais)**, **7 (Acessibilidade WCAG 2.2 AA)** e **9 (Casos de Teste)**.
3. Caso não haja plano local e tenha sido informada uma chave do Jira, execute `.agents/skills/buscar-tarefa/SKILL.md`.

---

### Passo 2 — Verificar Saúde do Ambiente Docker (`docker-compose.yml`)

Confirme se os três serviços essenciais estão em execução:

```bash
docker compose ps
```

Serviços esperados:
- **`db` (`postgres:18-alpine`):** porta `5432`
- **`backend` (Node.js / Express 5 / TS):** `http://localhost:3000`
- **`frontend` (React 19 / Vite):** `http://localhost:5173`

Se algum serviço estiver parado, avise o desenvolvedor antes de subir ou reiniciar containers.

---

### Passo 3 — Credenciais e Perfis de Teste (RBAC e LGPD)

- **Nunca assuma credenciais em silêncio:** verifique as seeds de desenvolvimento do projeto ou pergunte ao desenvolvedor quais credenciais de teste utilizar para cada perfil **RBAC** envolvido na tarefa:
  1. `ADMIN` (Administrador)
  2. `GESTOR_FROTA` (Gestor de Frota / Aprovador)
  3. `SOLICITANTE` (Solicitante de Viagem — FSPH)
  4. `MOTORISTA` (Motorista)
  5. `OPERADOR_SVO` (Operador / Equipe SVO)
- **Proteção de Dados (LGPD):** utilize exclusivamente dados fictícios e sintéticos ao preencher formulários durante a bateria de testes.
- Confirme que a conta existe no ambiente acessado pelo navegador. Usuários de fixtures em `aratu_test` não são automaticamente contas da aplicação em `localhost:5173`. Use os nomes de perfil definidos no código e nas seeds atuais; não crie contas nem redefina senhas para contornar uma falha de acesso sem autorização.

---

### Passo 4 — Executar Bateria de Testes (API, Banco e Navegador)

Monte e execute a lista de cenários cobrindo:

#### 4.1 Validação de Contratos da API e Segurança RBAC (`http://localhost:3000`)
- **Caminho Feliz:** envie payload válido e confirme status HTTP (`200`/`201`) e formato JSON retornado.
- **Validação de Domínio e Entrada Inválida:** envie campos obrigatórios vazios, formatos inválidos (ex: placa fora do padrão, km final menor que km inicial, CNH vencida) e confirme retorno `400` ou `422` com mensagem orientadora em português (sem expor stack trace do banco).
- **Controle de Acesso (RBAC):** teste o endpoint sem autenticação (`401 Unauthorized`) e autenticado com um perfil sem permissão para aquela rota (`403 Forbidden`).
- **Concorrência / Idempotência (quando aplicável):** verifique que a repetição ou envio concorrente de uma alocação não duplica registros no PostgreSQL 18.

#### 4.2 Validação na Interface Web React 19 (`http://localhost:5173`) em Navegador Real
**Todo `/testar` deve verificar no navegador se o fluxo solicitado está disponível e, quando estiver, percorrê-lo pela interface até o resultado final.** A classificação da issue como backend/QA, um SDD que atribua a tela a outra tarefa ou a aprovação dos testes automatizados não dispensam essa verificação. Use Playwright MCP, `/browser` ou a ferramenta de navegador/computer use disponível na sessão, respeitando suas instruções.

Requisições HTTP, `fetch` no console, testes com servidor em porta efêmera, inspeção do código e capturas de uma tela sem interação não comprovam um fluxo percorrido na interface. São evidências das respectivas camadas.

1. **Abertura e Conexão no Navegador:**
   - Navegue até `http://localhost:5173` (ou `http://127.0.0.1:5173`) e inspecione a tela e a navegação disponíveis com o perfil apropriado.
   - Se Playwright MCP não estiver disponível, descubra e use outra ferramenta de navegador/computer use habilitada antes de pedir uma ação ao desenvolvedor. Se nenhuma permitir o ensaio, registre a limitação como pendência de UI.
   - Se a tela, ação ou integração ainda não existir, registre a URL, o perfil e a evidência observada. Marque o fluxo como **⚠️ não executado/bloqueado**, indicando a dependência concreta. Continue os testes independentes de API/banco; não implemente a tela para contornar o bloqueio sem solicitação.
2. **Inspeção de Console e Erros de Rede:**
   - Monitore console e rede com as capacidades disponíveis. Registre exceções JavaScript não tratadas e requisições quebradas (404/500). Se a ferramenta não expuser console ou rede, marque essa inspeção como não conclusiva; não declare ausência de erros sem observação.
3. **Exercício do Fluxo Operacional (RBAC):**
   - Realize login e navegação pelo menu com o perfil indicado, usando contas de desenvolvimento confirmadas e dados fictícios;
   - Percorra as ações previstas na tarefa: preencher, validar entradas inválidas, salvar, consultar, filtrar, editar, confirmar/cancelar e encerrar, conforme aplicável. Acione os controles pela interface e confira os feedbacks; não substitua etapas visuais por chamadas diretas à API;
   - Verifique o resultado final visível e recarregue/reabra o registro para comprovar persistência. Nas operações que mudam disponibilidade, confira também a situação do veículo antes, durante e após o fluxo;
   - Para manutenções, quando a interface oferecer as ações: abrir preventiva/corretiva, conferir orçamento, testar impeditiva e bloqueio da viatura, consultar histórico/filtros, editar e encerrar com custo final, verificando a liberação correspondente;
   - Registre por cenário o perfil, a URL, as ações efetivamente realizadas, o resultado esperado, o observado e a captura/DOM que demonstra o resultado. Comprove também a restrição visual com perfil sem permissão, sem presumir que o RBAC da API garante o comportamento da tela.
4. **Verificação dos 5 Estados Visuais:**
   - Audite os estados: *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial*.

#### 4.3 Auditoria Obrigatória de Responsividade Multi-Dispositivo (Monitores Antigos 4:3, 16:10 e Celulares)
Nas estações de trabalho da FSPH e no SVO coexistem computadores corporativos antigos e dispositivos móveis operados em trânsito. O agente é **obrigado** a redimensionar o viewport no navegador via Playwright MCP (`browser_resize`) e auditar o comportamento da tela nas seguintes categorias de visualização:

1. **Monitores Antigos 4:3 (XGA `1024×768` e SVGA `800×600`):**
   - Executar `browser_resize({ width: 1024, height: 768 })`;
   - Auditar: ausência de quebras de layout, cabeçalhos ou menus descolados, modais centralizados contidos na tela sem transbordar a janela e integridade das tabelas de dados (`DataTable`);
   - Salvar evidência em `.playwright-mcp/responsivo-1024x768-4x3.png`.
2. **Monitores Antigos / Notebooks 16:10 (WXGA `1280×800` e `1440×900`):**
   - Executar `browser_resize({ width: 1280, height: 800 })`;
   - Auditar: altura vertical mais compacta, confirmando que barras superiores/inferiores fixas (`AppBar` ou cabeçalhos) não comprimam excessivamente o conteúdo e **não obstruam o elemento focado** (`:focus-visible` conforme critério WCAG 2.4.11);
   - Salvar evidência em `.playwright-mcp/responsivo-1280x800-16x10.png`.
3. **Dispositivos Móveis e Celulares (Mobile Compacto `375×667`, Smartphone `390×844` e Reflow Mínimo `320×568`):**
   - Executar `browser_resize({ width: 375, height: 667 })` e opcionalmente `browser_resize({ width: 320, height: 568 })` (piso de reflow WCAG 1.4.10);
   - Auditar criticamente para telas operadas por **motoristas e equipes SVO em campo**:
     - **Ausência de Scroll Horizontal:** O corpo da página (`body`/documento) não pode apresentar rolagem lateral descontrolada (`overflow-x` indesejado);
     - **Empilhamento Fluido:** Colunas de formulários e painéis de dados devem empilhar verticalmente com fluidez (`flex-wrap` / `grid` responsivo);
     - **Menu Adaptativo:** Barras de navegação devem colapsar adequadamente em menu gaveta (*drawer*) ou hambúrguer acessível;
     - **Tamanho Mínimo de Toque (WCAG 2.5.8):** Botões, inputs e links devem manter alvo tátil de no mínimo **44×44px** (recomendado para uso tátil sob sol, luvas ou trepidação de viatura);
   - Salvar evidência em `.playwright-mcp/responsivo-375x667-mobile.png`.
4. **Desktop Widescreen 16:9 (`1920×1080` ou `1366×768`):**
   - Executar `browser_resize({ width: 1920, height: 1080 })` para confirmação da visualização padrão e salvar evidência em `.playwright-mcp/responsivo-1920x1080-desktop.png`.

#### 4.4 Auditoria Prática Aprofundada de Acessibilidade (WCAG 2.2 Nível AA)
Toda interface deve ser verificada nos 6 eixos canônicos de acessibilidade:

1. **Formulários e Rótulos (Critérios 1.3.1, 3.3.1, 3.3.2, 4.1.2):**
   - Todo campo possui rótulo programático conectando `<label htmlFor>` ao `<input id>` gerado via `useId()`;
   - Erros de validação exibem texto explícito, atribuem `aria-invalid="true"` ao campo e mensagem associada com `role="alert"`;
   - Botões que contêm apenas ícone possuem `aria-label` descritivo.
2. **Navegação Completa por Teclado e Foco Visível (Critérios 2.1.1, 2.1.2, 2.4.3, 2.4.7, 2.4.11):**
   - 100% operável via teclado: `Tab`, `Shift+Tab`, `Enter`, `Espaço` e `Esc` para fechar modais/diálogos (`ConfirmDialog`);
   - Ordem de foco linear seguindo a hierarquia visual da tela sem armadilhas de teclado (*keyboard trap*);
   - Contorno de foco visível nítido (`:focus-visible`) em todos os elementos interativos (**proibido** `outline: none` sem alternativa de alto contraste);
   - Foco não obscurecido por cabeçalhos ou barras fixas (WCAG 2.4.11).
3. **Reflow e Redimensionamento de Texto (Critérios 1.4.4, 1.4.10):**
   - Suporte a ampliação de zoom de até 200% sem perda de conteúdo ou funcionalidade;
   - Suporte a largura de 320px sem necessidade de rolagem bidimensional no texto.
4. **Tamanho do Alvo (Critério 2.5.8):**
   - Mínimo de 24×24px em desktop e **44×44px** obrigatório nas telas operacionais móveis (motoristas, pátio e SVO).
5. **Contraste e Não Dependência Exclusiva de Cores (Critérios 1.4.1, 1.4.3, 1.4.11):**
   - Contraste de texto >= 4.5:1 para texto normal e 3:1 para texto grande e componentes visuais;
   - Status e mensagens combinam obrigatoriamente cor + texto explícito + ícone diferenciado (ex: chip com texto "Em andamento" e ícone, nunca apenas ponto colorido).
6. **Mensagens de Status e Atualizações Dinâmicas (Critério 4.1.3):**
   - Feedbacks dinâmicos anunciados para leitores de tela via `role="status"` ou `aria-live="polite"`.

#### 4.5 Validação Obrigatória de Casos de Borda (*Edge Cases*) no Navegador e na API
É **mandatório** exercitar e validar os casos de borda operacionais e de segurança, tanto na interface quanto nas rotas HTTP:
1. **Entradas Malformadas e Formatos Inválidos:** E-mails sem `@` ou sem domínio, números com caracteres alfabéticos, strings preenchidas exclusivamente com espaços em branco (`"    "`). Confirmar mensagens inline orientadoras e foco automático no primeiro campo inválido.
2. **Normalização e Resiliência (Trim / Case-Insensitive):** Valores com espaços acidentais no início/fim ou caixa alta arbitrária (ex: `"  USER@DOMINIO.BR  "`, placas em minúsculo). O sistema deve sanitizar com `trim()` e normalizar sem duplicar registros ou falhar o login.
3. **Limites de Domínio e Valores Extremos:** Hodômetro final menor ou igual ao inicial, datas retroativas em agendamentos futuros, campos opcionais omitidos vs obrigatórios vazios.
4. **Estados de Conta e Bloqueio de Acesso:** Usuários inativos/bloqueados (`active: false`) tentando autenticar — devem receber HTTP `403 Forbidden` e banner acessível de erro explícito (`"Acesso desativado"` com `role="alert"`).
5. **Segurança e Anti-Enumeração:** Tentativa de login com credencial inexistente deve responder HTTP `401 Unauthorized` com a mensagem genérica idêntica a senha incorreta (`"E-mail ou senha inválidos"`), impedindo a enumeração de servidores.
6. **Acesso Direto e Proteção de Rotas:** Tentativa de colar URLs autenticadas (ex: `/administracao/usuarios`, `/frota`, `/viagens`) diretamente na barra de navegação sem estar logado. O guardião de rota deve forçar redirecionamento imediato para `/login`.
7. **Prevenção de Duplo Envio (Concorrência na UI):** Cliques repetidos ou rápidos no botão de ação principal. O botão deve desabilitar imediatamente exibindo indicador de loading com `aria-busy="true"`, prevenindo chamadas simultâneas duplicadas.
8. **Links e Ações Secundárias:** Testar comportamentos de botões secundários, cancelamento de modais com tecla `Esc` e avisos contextuais de recursos indisponíveis (ex: *"Esqueci minha senha"*).

#### 4.6 Conferência de Persistência no PostgreSQL 18
Confirme no container `db` que os registros foram gravados corretamente (colunas de domínio, `status`, `registered_at` / `created_at` e `updated_at` com `TIMESTAMPTZ`):
```bash
docker compose exec db psql -U admin -d meubanco -c "SELECT id, status, created_at FROM <tabela> ORDER BY created_at DESC LIMIT 5;"
```

#### 4.7 Armazenamento de Evidências Visuais em Pasta Não Versionada
- Capture snapshots do DOM acessível (`browser_snapshot`) ou capturas de tela (`browser_take_screenshot`).
- Salve todos os prints **obrigatoriamente dentro da pasta não versionada `.playwright-mcp/`** (ex: `.playwright-mcp/responsivo-1024x768-4x3.png`, `.playwright-mcp/responsivo-375x667-mobile.png`, `.playwright-mcp/acessibilidade-teclado.png`).
- Referencie o caminho `.playwright-mcp/<nome-do-print>.png` na coluna de observações/evidências do relatório final.

---

### Passo 5 — Emitir Relatório de Testes

Apresente o resultado de forma estruturada e transparente (cenários que não puderam ser executados devem ser marcados como ⚠️, nunca como ✅):

**Regra de conclusão:** declare separadamente os resultados de testes automatizados, API/banco e fluxo no navegador. Só declare aprovação de ponta a ponta quando o caminho principal tiver sido percorrido na interface e seu resultado final observado. Se o navegador não foi usado ou o fluxo estiver indisponível, a conclusão deve ser “backend aprovado; validação no navegador pendente/bloqueada”, conforme os resultados reais. Responsividade e acessibilidade visual também exigem observação no navegador; não inferir conformidade a partir de testes backend. No resumo, diferencie testes únicos de repetições e subconjuntos para evitar dupla contagem.

```markdown
## Relatório de Testes — Sistema Aratu

- **Tarefa / Branch:** `{identificador / branch}`
- **Ambiente:** Frontend (`http://localhost:5173`) · Backend (`http://localhost:3000`) · DB (`PostgreSQL 18`) · Operação de UI: `{ferramenta realmente utilizada ou motivo da indisponibilidade}`
- **Perfis RBAC Testados:** `{lista de perfis}`
- **Data:** `{YYYY-MM-DD}`

### Cenários Executados

| # | Camada / Perfil | Cenário | Resultado | Observação / Evidência |
|---|---|---|---|---|
| 1 | UI + API (Playwright MCP) | Fluxo principal (caminho feliz) | ✅ / ❌ / ⚠️ | {status HTTP, feedback visual no navegador e registro no banco} |
| 2 | UI + API (Playwright MCP) | Validação de campos obrigatórios e regras de domínio | ✅ / ❌ / ⚠️ | {mensagem de erro orientadora + `role="alert"`} |
| 3 | API (`RBAC`) | Bloqueio de acesso deslogado (`401`) e perfil não autorizado (`403`) | ✅ / ❌ / ⚠️ | {resposta verificada} |
| 4 | UI (Playwright MCP — Responsividade) | Responsividade em Desktop 16:9 (`1920×1080`), Monitores Antigos 4:3 (`1024×768`), 16:10 (`1280×800`) e Celular (`375×667`/`320×568`) | ✅ / ❌ / ⚠️ | {evidência de resize, ausência de overflow horizontal, empilhamento e prints em `.playwright-mcp/`} |
| 5 | UI (Playwright MCP + WCAG 2.2 AA) | Acessibilidade completa (teclado, foco visível, `useId()`, alvos 44×44px, contraste e leitor de tela) | ✅ / ❌ / ⚠️ | {evidência de snapshot / foco visível / alvos táteis} |
| 6 | UI + API (Edge Cases) | Casos de borda (entradas malformadas, trim, conta inativa, anti-enumeração e rotas protegidas) | ✅ / ❌ / ⚠️ | {evidência de testes de borda no navegador/API} |
| 7 | Banco (PostgreSQL 18) | Persistência de dados e trilha de auditoria (`audit.logs`) | ✅ / ❌ / ⚠️ | {consulta SQL confirmando gravação com `TIMESTAMPTZ`} |

### Resumo
- ✅ Passou: {N} · ❌ Falhou: {N} · ⚠️ Não conclusivo / Pendente: {N}

### Problemas Encontrados e Próximos Passos
{Descrição objetiva de qualquer falha encontrada (rota, payload, console, query) ou confirmação de aptidão para abertura do Pull Request em `develop`}
```
