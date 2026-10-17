# Checklist de Revisão de Código (Code Review) — Sistema Aratu

Este documento serve como guia rápido para autores e revisores da **Squad 24** antes de aprovar qualquer Pull Request para a branch `develop` no **Sistema Aratu**.

---

## 1. Escopo, Fluxo Git (Gitflow) e Tamanho do PR

- [ ] A branch de trabalho segue o padrão Gitflow (`feat/<nome-da-tarefa>`, `feature/<nome-da-tarefa>`, `fix/<nome-da-tarefa>` ou `hotfix/<nome-da-tarefa>`), criada a partir de `develop` atualizada, com Pull Request direcionado para `develop`.
- [ ] Os commits seguem **Conventional Commits** (`tipo(escopo): descrição curta`) identificando claramente a tarefa entregue.
- [ ] O PR tem menos de **400 linhas** novas/alteradas (ou possui justificativa explícita na descrição).
- [ ] **O diff muda comportamento OU estrutura, nunca os dois ao mesmo tempo.**

---

## 2. Clean Code, SOLID e Tipagem TypeScript

- [ ] Nenhum uso de `any` ou `@ts-ignore` foi introduzido; parâmetros, retornos e payloads possuem interfaces explícitas em `src/types/`.
- [ ] Não existem valores mágicos (strings/números soltos) para status de viagens, tipos de veículo ou perfis de usuário.
- [ ] Nomes de variáveis, funções e classes refletem com clareza o domínio da **FSPH** e do **SVO**.
- [ ] Funções são curtas, possuem responsabilidade única (**SRP**) e utilizam *early return* para evitar aninhamento profundo.
- [ ] Métodos públicos de Services, Middlewares e Props de componentes visuais possuem documentação TSDoc semântica conforme [`docs/manuais/padroes-docblocks.md`](padroes-docblocks.md) (com foco no "porquê", `@throws` mapeados e sem duplicar tipos).
- [ ] Não há código comentado (código morto) nem `console.log` de depuração esquecidos.

---

## 3. Arquitetura em Camadas (Backend e Frontend)

- [ ] **Regra de negócio mora no `Service`:** controllers do Express e componentes do React não contêm cálculos, validações de domínio complexas nem regras de transição de status.
- [ ] **Fronteira de I/O respeitada:** apenas os `Repositories` executam queries no PostgreSQL 18; no frontend, apenas `frontend/src/services/` realiza chamadas `fetch` à API.
- [ ] **Padrões de Projeto respeitados:** conformidade com [`docs/manuais/padroes-projeto.md`](padroes-projeto.md) (Repository, State/FSM para transições de status, Strategy para exportações e Chain of Responsibility em middlewares).
- [ ] Não foram criados ciclos de importação entre módulos nem feature flags não solicitadas (**YAGNI**).

---

## 4. Banco de Dados (PostgreSQL 18) e Segurança

- [ ] Todas as queries SQL usam parâmetros posicionais (`$1, $2, ...`) — zero interpolação de strings.
- [ ] Nenhuma consulta utiliza `SELECT *`.
- [ ] Operações compostas ou de alocação concorrente usam transação (`BEGIN ... COMMIT / ROLLBACK`) com `SELECT ... FOR UPDATE` e liberam a conexão no bloco `finally { client.release(); }`.
- [ ] Rotas restritas validam o perfil **RBAC** no middleware do backend (não apenas ocultando botões no frontend).
- [ ] **LGPD e Sigilo SVO:** nenhum dado pessoal real consta em testes, seeds, mocks, commits ou logs.

---

## 5. Interface React 19 e Acessibilidade (WCAG 2.2 Nível AA)

- [ ] Componentes visuais existentes em `frontend/src/components/ui/` foram reutilizados (**DRY**).
- [ ] Todos os campos de formulário usam `useId()` vinculando `<label htmlFor>` ao `<input id>`, além de `aria-invalid` e `role="alert"` para erros.
- [ ] A tela trata os **5 estados visuais**: *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial*.
- [ ] Toda interação funciona 100% via teclado (`Tab`, `Enter`, `Espaço`, `Esc`) com foco visível (`:focus-visible`) e alvos de toque mínimos de **44×44px** para fluxos móveis.
- [ ] Status e alertas não dependem exclusivamente de cor.
