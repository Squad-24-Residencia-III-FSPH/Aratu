---
name: documentar-modulo
description: >
  Gera ou atualiza a documentação funcional e técnica em HTML de um módulo do
  Sistema Aratu em docs/modulos/<CHAVE_MODULO>.html seguindo o template
  docs/modulos/EXEMPLO_MODULO.html. Use quando o usuário pedir /documentar-modulo ou
  solicitar a criação/atualização da documentação de um módulo (FROTA, VIAGENS,
  SVO, MOTORISTAS, MANUTENCOES, AUTENTICACAO_RBAC).
argument-hint: "[chave ou nome do módulo: FROTA, VIAGENS, SVO, MOTORISTAS, MANUTENCOES, AUTENTICACAO_RBAC]"
license: MIT
---

# Documentar Módulo — Sistema Aratu

Gera ou atualiza o arquivo `docs/modulos/<CHAVE_MODULO>.html` com a documentação funcional e técnica completa de um módulo do **Aratu — Sistema de Gestão de Frota e Operações** (Squad 24 — FSPH & SVO), seguindo rigorosamente a estrutura de `docs/modulos/EXEMPLO_MODULO.html`.

> **A análise cobre Backend, Frontend e Banco de Dados.** A documentação consolida rotas e controllers do Express 5, regras de domínio nos Services, consultas e transações nos Repositories, telas e componentes acessíveis em React 19 (WCAG 2.2 Nível AA), matriz de acesso RBAC e a estrutura real das tabelas no **PostgreSQL 18**.
>
> **Formato de saída: apenas HTML.** Não gere arquivos intermediários `.md` dentro de `docs/modulos/` — o arquivo `.html` autocontido é o único entregável desta skill.

## Argumentos

`$ARGUMENTS` pode ser:
- A chave ou o nome do módulo listado em `docs/manuais/modulos.md` (ex: `FROTA`, `VIAGENS`, `SVO`, `MOTORISTAS`, `MANUTENCOES`, `AUTENTICACAO_RBAC`).
- Vazio: consulte `docs/manuais/modulos.md` e pergunte ao desenvolvedor qual módulo deseja documentar.

---

## Instruções de Execução

### Passo 0 — Pré-Condição Inegociável: Carregar e Obedecer a Skill `principios` (Bloqueante)

> **REGRA DE BLOQUEIO:** Antes de documentar qualquer módulo, leia e aplique obrigatoriamente **`.agents/skills/principios/SKILL.md`** e `.agents/skills/principios/references/camadas.md`, `escopo-impacto.md`, `dados.md` e `acessibilidade.md`. Respeite a **Regra da Dúvida** (nunca invente regras que não estejam no código ou confirmadas com o usuário) e a **Proteção LGPD/SVO** (exemplos 100% fictícios).

---

### Passo 1 — Identificar o módulo e mapear o codebase rapidamente

1. Leia `docs/manuais/modulos.md` para identificar a chave oficial do módulo correspondente a `$ARGUMENTS`.
2. Execute o mapeador estático do repositório para listar todos os arquivos, símbolos exportados, rotas e tabelas de uma só vez:
   ```bash
   node docs/scripts/mapa-codigo.mjs
   ```
3. Caso o argumento seja ambíguo ou não corresponda a um módulo mapeado, aplique a **Regra da Dúvida** e confirme com o desenvolvedor antes de prosseguir.

---

### Passo 2 — Mapear a camada Backend (`backend/src/`)

A partir do índice retornado por `mapa-codigo.mjs`, leia os arquivos do backend relacionados ao módulo:

1. **Rotas e Middlewares (`backend/src/routes/` e `backend/src/middlewares/`):**
   - Identifique todos os endpoints REST (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`), os caminhos de URL e os middlewares de autenticação e autorização por perfil (**RBAC**).
2. **Controllers (`backend/src/controllers/`):**
   - Registre os métodos expostos, validações de parâmetros/payloads e códigos de status HTTP retornados (`200`, `201`, `204`, `400`, `401`, `403`, `404`, `409`, `422`).
3. **Services (`backend/src/services/`):**
   - Extraia todas as **regras de negócio puras**: validações de domínio, transições de status permitidas, cálculos (ex: quilometragem), bloqueios operacionais e orquestração de transações.
   - Anote o nome da classe e do método onde cada regra mora (ex: `ViagemService::alocarViatura`).
4. **Repositories (`backend/src/repositories/` e `backend/src/database/`):**
   - Identifique todas as tabelas consultadas ou alteradas, verificando o uso de queries parametrizadas (`$1, $2`), projeções explícitas (sem `SELECT *`) e travas de concorrência (`SELECT ... FOR UPDATE`).
5. **Types e DTOs (`backend/src/types/`):**
   - Mapeie as interfaces TypeScript, union types de status e contratos de entrada/saída.

---

### Passo 3 — Mapear a camada Frontend (`frontend/src/`)

Explore os arquivos do frontend React 19 + TypeScript associados ao módulo:

1. **Páginas (`frontend/src/pages/`):**
   - Identifique quais telas compõem o fluxo do módulo e como cada tela trata os **5 estados visuais obrigatórios** (*Ideal*, *Carregando com `aria-busy="true"`*, *Vazio*, *Erro* e *Parcial*).
2. **Componentes Reutilizados (`frontend/src/components/` e `components/ui/`):**
   - Verifique os componentes compartilhados utilizados (formulários com `useId()`, `Button` com `isLoading`, `StatusBadge`, tabelas com `<th scope="col">` e modais `<dialog>`).
3. **Clientes de API (`frontend/src/services/`) e Hooks (`frontend/src/hooks/`):**
   - Mapeie as funções que consomem os endpoints REST do módulo.
4. **Critérios de Acessibilidade (WCAG 2.2 Nível AA):**
   - Registre como a tela atende aos requisitos de operação por teclado, foco visível (`:focus-visible`), alvos de toque de no mínimo 44×44px (especialmente para motoristas em campo) e regiões `role="status"` / `aria-live`.

---

### Passo 4 — Introspecção no Banco de Dados (PostgreSQL 18)

1. **Verificar se o container `db` está em execução:**
   ```bash
   docker compose ps db
   ```
   Se o container não estiver rodando, avise o desenvolvedor e documente a estrutura a partir das migrations/repositórios, registrando a observação.
2. **Inspecionar tabelas, colunas, constraints e índices (somente leitura):**
   ```bash
   docker compose exec db psql -U admin -d meubanco -c "\d+ <nome_tabela>"
   ```
   Para cada tabela do módulo, levante:
   - Grão funcional (o que uma linha representa);
   - Colunas-chave e tipos (`UUID`, `TEXT`, `TIMESTAMPTZ`, `DATE`, `BOOLEAN`, `INTEGER`);
   - Chaves estrangeiras (`<tabela_singular>_id` e regra `ON DELETE RESTRICT`), `CHECK` constraints e índices B-tree ou parciais.
3. **Proibição de DDL/DML:** execute apenas comandos de inspeção (`\dt`, `\d+`, consultas a `information_schema`). Nunca altere dados ou estrutura durante a documentação.

---

### Passo 5 — Gerar o Esqueleto e Atualizar `docs/modulos/<CHAVE_MODULO>.html`

1. Se o arquivo `docs/modulos/<CHAVE_MODULO>.html` ainda não existir, gere o esqueleto HTML pré-preenchido (com o CSS oficial de `EXEMPLO_MODULO.html`, índice de seções e cabeçalho de tabelas):
   ```bash
   node docs/scripts/gerar-esqueleto.mjs modulo <CHAVE_MODULO>
   ```
2. Preencha ou atualize as seções do documento HTML:

1. **Bloco de Metadados (`.meta-block`):** Módulo (chave), índice de referência (`docs/manuais/modulos.md`), camadas Backend, camadas Frontend, banco de dados (`PostgreSQL 18`) e data de atualização (`YYYY-MM-DD`).
2. **Seção 1 — Visão Geral:** propósito operacional para a FSPH e/ou SVO.
3. **Seção 2 — Regras de Negócio e Transições de Estado:** invariantes de domínio e concorrência citando `Classe::metodo`.
4. **Seção 3 — Escopo de Impacto e Matriz de Acesso (RBAC):** tabela detalhando as ações e restrições para `ADMIN`, `GESTOR_FROTA`, `SOLICITANTE`, `MOTORISTA` e `OPERADOR_SVO`.
5. **Seção 4 — Tabelas do Banco de Dados (PostgreSQL 18):** tabela com nome, grão funcional, colunas-chave e constraints/índices.
6. **Seção 5 — Contratos de API REST (Backend Express 5):** tabela com método HTTP, endpoint, controller, perfis autorizados e resumo do contrato.
7. **Seção 6 — Camadas de Negócio e Persistência (Backend):** `Services`, `Repositories` e `Types/DTOs`.
8. **Seção 7 — Interface e Acessibilidade (Frontend React 19 + WCAG 2.2 AA):** páginas, 5 estados visuais, componentes reutilizados e critérios de acessibilidade.
9. **Seção 8 — Arquivos Principais (Referência Rápida):** tabela consolidada de arquivos por camada.
10. **Seção 9 — Dependências, Integrações e Proteção de Dados (LGPD / Sigilo SVO).**

> **Proteção de Dados (LGPD):** Jamais inclua nomes reais, CPFs, CNHs, placas reais ou dados de óbito do SVO nos exemplos da documentação.

---

### Passo 6 — Confirmar Entrega

Ao concluir a geração do arquivo, informe de forma concisa:
- Caminho do arquivo gerado (`docs/modulos/<CHAVE_MODULO>.html`);
- Quantidade de regras de negócio, endpoints REST, telas React e tabelas do PostgreSQL 18 documentadas;
- Eventuais lacunas ou dúvidas identificadas no módulo.
