# Camadas — onde a regra mora

Material de consulta do princípio 1 da skill `principios`. Leia quando a
dúvida for *em que camada* uma regra, consulta ou texto deve ficar — ou quando
a mudança vai criar dependência nova entre módulos no sistema Aratu.

A primeira seção descreve os invariantes universais. A segunda detalha o mapa
real de camadas do **Sistema Aratu** (Node.js/Express 5/TypeScript e React 19).

---

## A camada é decisão do projeto, não sua

1. **O projeto tem convenção documentada?** Ela decide. Leia este mapa e o
   código vizinho antes de escolher arquivo.
2. **Não tem convenção explícita no módulo?** A camada é a do código que já resolve
   casos iguais. Procure o irmão mais próximo do que você vai escrever.
3. **Duas camadas defensáveis e nenhum precedente?** É pergunta ao usuário,
   não sorteio. Regra no lugar errado é o defeito mais caro de desfazer:
   quem for reusar não acha, duplica, e aí existem duas.

Regra de corte: **arquivo novo só quando nenhum existente é o lugar óbvio.**
Camada nova ou arquitetura complexa (ex: hexagonal/microserviços desnecessários),
nunca por iniciativa própria sem alinhamento com a Squad.

---

## Os quatro invariantes universais

Valem em qualquer arquitetura, porque não descrevem estilo — descrevem
acoplamento que sempre custa:

1. **Regra de negócio não mora na borda.**
   - Nem no controller/rota do Express, nem no componente visual do React.
   - A borda traduz: entrada HTTP → chamada de serviço, retorno de dados → apresentação JSON ou JSX.
   - Cálculo de rota, validação de regras de frotas, transição de status de viagem e
     protocolos operacionais do SVO ficam na camada de serviço (`services/`).
   - Regra presa no controller não é chamável por rotinas em lote, scripts, testes unitários ou futuros workers.
2. **A dependência aponta para dentro.**
   - A camada de regras de negócio (`services/`) não conhece `req`, `res`, Express, nem monta JSX/HTML.
   - Quem apresenta pode conhecer a regra; a regra não pode conhecer quem apresenta.
   - Se para testar uma regra de negócio você precisa simular um objeto `Request` do Express, ela está na camada errada.
3. **Sem ciclo entre módulos.**
   - Se o módulo de Viagens passa a importar Veículos e Veículos importa Viagens diretamente,
     extraia a dependência comum para um módulo compartilhado ou orquestrador.
   - Dependência cíclica dificulta refatorações e gera bugs sutis de importação.
4. **Fronteira de I/O explícita.**
   - O banco de dados PostgreSQL é acessado exclusivamente pela camada eleita para isso
     (`repositories/` ou `database/`), com pool de conexões do driver `pg`.
   - Não espalhe SQL cru dentro de controllers ou serviços de domínio.

---

## Aratu — o mapa real de camadas

### Backend (`backend/src/`)

| Camada | Diretório | Responsabilidade | O que NÃO faz |
|---|---|---|---|
| **Rotas** | `src/routes/` | Declara endpoints Express, associa middlewares e direciona para o controller | Não contém regras de negócio nem executa queries SQL |
| **Controllers** | `src/controllers/` | Recebe `Request`, valida payload/parâmetros, chama os services e responde com `Response` (status HTTP + JSON) | Não executa lógica de negócio complexa nem acessa o banco diretamente |
| **Services** | `src/services/` | Regras de negócio puras (validação de frotas, alocação de motoristas, regras do SVO, cálculo de quilometragem) | Não conhece `req`/`res`, não lida com HTTP, não formata JSON |
| **Repositories / DB** | `src/repositories/` ou `src/database/` | Conexão com o PostgreSQL 18 via `pg.Pool`, consultas parametrizadas (`$1, $2`) e transações | Não decide regras de negócio, apenas persiste e recupera dados |
| **Middlewares** | `src/middlewares/` | Autenticação, autorização de perfis (RBAC), validação de schemas e tratamento centralizado de erros | Não orquestra fluxos completos de domínio |
| **Types / DTOs** | `src/types/` | Interfaces TypeScript, tipos de entrada/saída de dados e enums de domínio | Não contém lógica executável |

### Frontend (`frontend/src/`)

| Camada | Diretório / Arquivo | Responsabilidade | O que NÃO faz |
|---|---|---|---|
| **Tema Global (MUI)** | `src/theme.ts` | Fonte única de design tokens do Material UI (`@mui/material`), paleta (`#FF6B00`), tipografia e altura mínima `44px` (WCAG 2.2 AA) | Não contém lógica de negócio ou estado de sessão |
| **Layout e Estrutura** | `src/components/layout/` | Estrutura base de tela (`AppShell` com menu RBAC e `PageHeader` padronizado) | Não executa fetches de domínio específicos de uma página |
| **Componentes UI** | `src/components/ui/` | Wrappers atômicos e reutilizáveis sobre Material UI (`FormField` com `useId()`, `DataTable`, `FilterBar`, `EntityCard`, `StatCard`, `StatusChip`, `StateFeedback`, `ConfirmDialog`) | Não consome APIs diretamente nem acopla regras de páginas específicas |
| **Páginas (Pages)** | `src/pages/` | Telas principais que orquestram hooks e componentes de `layout/` e `ui/` (CSS Modules restritos a layout estrutural em inglês `camelCase`, sem `:global(.Mui...)`) | Não monta blocos repetitivos de MUI crus nem requisições HTTP manuais |
| **Serviços de API** | `src/services/` | Comunicação com o backend Express via `fetch` tipado, centralizando base URL e cabeçalhos | Não gerencia estado visual de telas |
| **Hooks** | `src/hooks/` | Encapsulamento de lógicas reutilizáveis de estado, formulários, autenticação ou consultas | Não substitui componentes visuais |
| **Types** | `src/types/` | Tipagens TypeScript das entidades do sistema e contratos com as APIs | Não contém código de execução |

---

## Erros comuns a evitar no Aratu

1. **Colocar lógica de negócio diretamente nos manipuladores de rotas do Express.**
   Sempre extraia a regra para uma função ou classe de serviço em `services/`.
2. **Esquecer de liberar conexões do pool do `pg` em transações manuais.**
   Sempre use blocos `try ... catch ... finally` garantindo `client.release()` no `finally`.
3. **Regra de validação crítica apenas no frontend React.**
   O frontend auxilia a experiência do usuário com feedback ágil; a validação de segurança e integridade
   pertence obrigatoriamente ao backend.
4. **Acoplar componentes visuais à estrutura do banco de dados.**
   A UI deve ser desenhada para as necessidades da tarefa do usuário da FSPH/SVO, não como um espelho direto de colunas SQL.

---

## O que é sempre pergunta ao usuário, nunca dedução

- **Mover regras existentes entre camadas** durante uma correção de bug simples;
- **Introduzir uma biblioteca de ORM ou framework novo** (ex: Prisma, TypeORM, Redux) quando o projeto utiliza `pg` e React hooks nativos;
- **Decidir onde uma regra deve morar** quando houver duas camadas igualmente defensáveis e nenhum precedente no módulo.
