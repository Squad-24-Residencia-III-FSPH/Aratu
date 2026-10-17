# Planejamento de tarefas e funcionalidades — Sistema Aratu

Lido pela skill `principios` quando invocada para planejar uma tarefa (`/principios planejar`,
`/plano` ou pedido explícito de planejar uma funcionalidade, arquitetura ou refatoração).

Quando a `principios` for invocada para **planejar**, ela estabelece os princípios
técnicos deste arquivo e orienta a elaboração do plano técnico (SDD / Plano de Implementação)
em total conformidade com o processo da Squad 24 no projeto Aratu.

---

## O Fluxo de Trabalho do Projeto Aratu (Gitflow)

O projeto adota **Gitflow** (conforme `README.md`), **Conventional Commits** e Pull Requests estruturados:

1. **Branches Principais:**
   - `main`: Versões estáveis e entregas validadas.
   - `develop`: Integração das funcionalidades em desenvolvimento.
2. **Branches de Trabalho (por tarefa, criadas a partir de `develop`):**
   - `feat/<nome-da-tarefa>` ou `feature/<nome-da-tarefa>`: Nova funcionalidade (ex: `feat/controle-sessao-token`, `feature/login`).
   - `fix/<nome-da-tarefa>`: Correção de defeito (ex: `fix/vehicle-validation`).
   - `hotfix/<nome-da-tarefa>`: Correção urgente em produção/versão estável.
   - `release/<versao>`: Preparação de uma entrega.
3. **Padrão de Commits (Conventional Commits):**
   - Formato: `tipo(escopo): descrição curta (FROTA-XX)`
   - Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`.
   - Exemplos: `feat(auth): implementar controle de sessao e token (FROTA-27)`, `feat(frota): adicionar cadastro de veiculos`, `fix(viagens): corrigir validacao de status`.
4. **Estrutura do Pull Request (`<branch-da-tarefa>` → `develop`):**
   - Título claro e objetivo;
   - Descrição da tarefa / história de usuário atendida;
   - Explicação técnica do que foi implementado;
   - Passo a passo detalhado de como testar (rotas de API, telas React, dados no PostgreSQL);
   - Limitações conhecidas e capturas de tela (quando houver mudanças visuais).

---

## Estrutura Obrigatória do Plano Técnico (SDD)

Todo plano de implementação desenvolvido no Aratu deve cobrir os seguintes tópicos:

### 1. Objetivo e Escopo
- Frase clara do objetivo no domínio da saúde/frotas (FSPH / SVO): o que a pessoa usuária
  (solicitante, motorista, gestor de frota ou operador SVO) passa a conseguir fazer.
- O que entra no escopo e o que fica explicitamente fora dele (YAGNI).

### 2. Regras de Negócio e Casos de Borda
- Cenários principais e caminhos alternativos no formato *Dado / Quando / Então*.
- Transições de estado permitidas em inglês (`UPPER_SNAKE_CASE`, ex: `DRAFT` → `SUBMITTED` → `APPROVED` → `IN_EXECUTION` → `COMPLETED` ou `CANCELED`; viagem: `PLANNED` → `IN_PROGRESS` → `COMPLETED` ou `CANCELED`).
- Validações de domínio: regras de disponibilidade de veículo e motorista, conflitos de agenda,
  capacidade de assentos/corpos e protocolos operacionais do SVO.
- Resolução antecipada de dúvidas: se houver pontos ambíguos, pergunte ao usuário antes de redigir o plano definitivo.

### 3. Contrato de API REST (Backend Express / Node.js)
- Mapeamento das rotas em inglês no plural (`kebab-case`) em `backend/src/routes/` e métodos HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- Payload de requisição (JSON) com tipagem TypeScript em inglês (`camelCase` sem prefixo SQL) e validação de schema.
- Resposta de sucesso (status code semântico `200`, `201`, `204`) e estrutura JSON.
- Códigos e mensagens de erro esperados (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`).

### 4. Modelo de Dados e PostgreSQL 18 (Padrão `modelo.sql` em Inglês)
- Tabelas novas ou modificadas, seguindo o padrão de prefixo único de 3 letras em inglês (`<pre>_<singular_entity>`, ex: `veh_vehicle`, `trp_trip`, `req_request`).
- Chave primária `<pre>_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY` (projetada como `<pre>_id AS id` no Repository), colunas próprias `<pre>_<col>` e FKs `<ref_pre>_id` (ou `<ref_pre>_id_<role>`).
- Tipos de colunas explícitos (`BIGINT`, `TEXT`, `TIMESTAMPTZ`, `BOOLEAN`, `INTEGER`, `NUMERIC`, `JSONB`).
- Constraints declarativas: `PRIMARY KEY`, `FOREIGN KEY ... ON DELETE RESTRICT`, `CHECK`, `UNIQUE`.
- Índices iniciando pelo prefixo de 3 letras da tabela (`<pre>_<descriptive_name>`, sem `idx_`/`uq_`), justificados pelas consultas reais (leia `references/consultas.md` e `references/dados.md`).
- Script de migração DDL e como garantir transacionalidade.

### 5. Interface e Componentes React 19 (Frontend)
- Telas em `frontend/src/pages/` e componentes reutilizáveis em `frontend/src/components/`.
- Tratamento dos cinco estados visuais:
  1. *Ideal:* dado carregado e exibido com clareza;
  2. *Carregando (Loading):* skeleton ou spinner acessível com feedback sonoro/visual;
  3. *Vazio (Empty state):* mensagem amigável e ação clara quando não houver registros;
  4. *Erro:* mensagem explicativa orientando o próximo passo;
  5. *Parcial / Intermitente:* indicação precisa de falhas em operações de lote.
- Contrato do cliente de API em `frontend/src/services/`.

### 6. Acessibilidade (WCAG 2.2 Nível AA)
- Rótulos acessíveis em todos os campos (`<label htmlFor>` associado ao `<input id>`);
- Teclado total: navegação lógica por Tab, ativação por Enter/Espaço, fechamento de modais com Esc;
- Alvos de toque de no mínimo 44×44px para telas operadas por motoristas e equipes no pátio;
- Contraste mínimo de 4.5:1 para texto normal;
- Anúncio de ações dinâmicas via regiões com `role="status"` ou `aria-live`.

### 7. Verificação e Plano de Testes
- Casos de teste automatizados ou roteiro detalhado de validação manual:
  - Cenário de teste;
  - Dados de entrada (estritamente fictícios para proteção da LGPD);
  - Resultado esperado na API, no banco PostgreSQL e na tela React.

---

## Subseção Obrigatória: Princípios de Desenvolvimento na Implementação

O plano precisa garantir que quem implementar seguirá os princípios técnicos.
Todo plano deve incluir a seguinte seção final:

```markdown
### Princípios de Desenvolvimento na Implementação

A implementação deste plano segue estritamente a ordem de precedência:
1. Padrões do Projeto Aratu (camadas Node.js/Express, componentes React 19, PostgreSQL 18);
2. Escopo de Impacto (RBAC: Solicitante, Gestor, Motorista, SVO, Admin);
3. Compatibilidade de Dados e Contratos (não quebrar schemas existentes);
4. Idempotência e Atomicidade (transações no pool pg, sem duplicações);
5. YAGNI (sem requisitos especulativos);
6. DRY (reuso de services, helpers e componentes);
7. SOLID e KISS (soluções diretas, modulares e manuteníveis);
8. Clean Code e TypeScript estrito (sem 'any', nomes claros de domínio e TSDoc semântico conforme `docs/manuais/padroes-docblocks.md`).

- **Regra da Dúvida na Implementação:** Qualquer divergência encontrada entre este plano
  e a base de código real para o trabalho e vira pergunta ao usuário. Proibido improvisar
  ou assumir premissas.
- **Proteção de Dados:** Nenhum dado pessoal real do SVO ou motoristas entra em testes ou commits.
```
