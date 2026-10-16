# Planejamento de tarefas e funcionalidades — Sistema Aratu

Lido pela skill `principios` quando invocada para planejar uma tarefa (`/principios planejar`,
`/plano` ou pedido explícito de planejar uma funcionalidade, arquitetura ou refatoração).

Quando a `principios` for invocada para **planejar**, ela estabelece os princípios
técnicos deste arquivo e orienta a elaboração do plano técnico (SDD / Plano de Implementação)
em total conformidade com o processo da Squad 24 no projeto Aratu.

---

## O Fluxo de Trabalho do Projeto Aratu

O projeto adota **Branch por Desenvolvedor (`dev-<nome>`)**, estágio de **QA em `develop`**, **Conventional Commits** e Pull Requests estruturados:

1. **Branch de trabalho fixa por desenvolvedor (`dev-<nome>`):**
   - Cada desenvolvedor trabalha continuamente em sua própria branch (ex: `dev-eliakim`, `dev-arthur`). **Não se criam branches `feature/...` ou `fix/...` separadas.**
   - A branch `dev-<nome>` é **somente atualizada a partir da `main`** (`git pull origin main`).
2. **Rastreabilidade por Commit (Conventional Commits):**
   - O que diferencia cada tarefa entregue na branch `dev-<nome>` é a mensagem do commit: `tipo(escopo): descrição curta (FROTA-XX)`
   - Tipos: `feat`, `fix`, `docs`, `test`, `refactor`, `chore`, `style`.
   - Exemplos: `feat(auth): implementar controle de sessao e token (FROTA-27)`, `feat(frota): adicionar cadastro de veiculos`, `fix(viagens): corrigir validacao de status`.
3. **Promoção e QA (`dev-<nome>` → `develop` → `main`):**
   - A branch `dev-<nome>` abre Pull Request para a `develop` (`dev-<nome>` → `develop`).
   - Na `develop`, a entrega passa pelo **QA (Homologação)**.
   - Após aprovação do QA, a `develop` segue via PR para a `main` (`develop` → `main`).
4. **Estrutura do Pull Request (`dev-<nome>` → `develop`):**
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
- Transições de estado permitidas (ex: status da solicitação de viagem: `pendente` → `aprovada` → `em_andamento` → `concluida` ou `cancelada`).
- Validações de domínio: regras de disponibilidade de veículo e motorista, conflitos de agenda,
  validação de CNH e protocolos operacionais do SVO.
- Resolução antecipada de dúvidas: se houver pontos ambíguos, pergunte ao usuário antes de redigir o plano definitivo.

### 3. Contrato de API REST (Backend Express / Node.js)
- Mapeamento das rotas em `backend/src/routes/` e métodos HTTP (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`).
- Payload de requisição (JSON) com tipagem TypeScript e validação de schema.
- Resposta de sucesso (status code semântico `200`, `201`, `204`) e estrutura JSON.
- Códigos e mensagens de erro esperados (`400 Bad Request`, `401 Unauthorized`, `403 Forbidden`, `404 Not Found`, `409 Conflict`, `422 Unprocessable Entity`).

### 4. Modelo de Dados e PostgreSQL 18
- Tabelas novas ou modificadas, seguindo convenções do projeto (snake_case, plural).
- Tipos de colunas explícitos (`UUID`, `TEXT`, `TIMESTAMPTZ`, `BOOLEAN`, `INTEGER`).
- Constraints declarativas: `PRIMARY KEY`, `FOREIGN KEY ... ON DELETE RESTRICT`, `CHECK`, `UNIQUE`.
- Índices necessários justificados pelas consultas reais (leia `references/consultas.md` e `references/dados.md`).
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
8. Clean Code e TypeScript estrito (sem 'any', nomes claros de domínio e TSDoc semântico conforme `docs/padroes-docblocks.md`).

- **Regra da Dúvida na Implementação:** Qualquer divergência encontrada entre este plano
  e a base de código real para o trabalho e vira pergunta ao usuário. Proibido improvisar
  ou assumir premissas.
- **Proteção de Dados:** Nenhum dado pessoal real do SVO ou motoristas entra em testes ou commits.
```
