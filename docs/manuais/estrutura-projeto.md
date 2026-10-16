# Estrutura do Projeto — Sistema Aratu

O **Aratu — Sistema de Gestão de Frota e Operações** é organizado em arquitetura cliente-servidor containerizada, separando claramente o **Backend** (API REST em Node.js + Express 5 + TypeScript + PostgreSQL 18) e o **Frontend** (SPA em React 19 + TypeScript + Vite).

---

## 1. Visão Geral da Raiz do Repositório

```text
Aratu/
├── .agents/
│   └── skills/
│       └── principios/         # Skill canônica de arquitetura, Clean Code, UX, UI, SQL e WCAG 2.2 AA
├── backend/                    # API REST (Node.js, Express 5, TypeScript, driver pg)
│   ├── src/                    # Código-fonte do servidor dividido em camadas
│   ├── Dockerfile              # Imagem do container backend
│   ├── package.json            # Dependências e scripts do backend
│   └── tsconfig.json           # Configuração TypeScript estrita do backend
├── frontend/                   # Interface Web (React 19, TypeScript, Vite)
│   ├── public/                 # Ativos estáticos públicos (ícones, manifesto)
│   ├── src/                    # Código-fonte da interface dividido por responsabilidade
│   ├── index.html              # Documento HTML raiz (<html lang="pt-BR">)
│   ├── Dockerfile              # Imagem do container frontend
│   ├── package.json            # Dependências e scripts do frontend
│   └── vite.config.ts          # Configuração do bundler Vite
├── docs/                       # Documentação técnica, manuais, módulos, planos e scripts unificados
│   ├── manuais/                # Manuais de engenharia, arquitetura e convenções (.md)
│   ├── modulos/                # Documentação HTML detalhada por módulo de negócio
│   ├── plans/                  # Planos Técnicos de Implementação (SDDs em HTML)
│   └── scripts/                # Scripts utilitários de automação e integração (ex: jira-fetch.mjs)
├── docker-compose.yml          # Orquestração dos serviços: db (PostgreSQL 18), backend e frontend
├── AGENTS.md                   # Diretrizes obrigatórias para Agentes de IA
└── README.md                   # Apresentação do projeto, stack, Gitflow e Conventional Commits
```

---

## 2. Os Quatro Invariantes Arquiteturais

Toda evolução na estrutura de pastas e arquivos deve respeitar quatro invariantes universais:

1. **Regra de negócio não mora na borda:**
   - Nem nas rotas/controllers do Express, nem nos componentes visuais do React.
   - A borda apenas traduz protocolos (HTTP/JSON ou eventos de interface) para chamadas de domínio.
2. **A dependência aponta sempre para dentro:**
   - A camada `services/` do backend não importa `Request`/`Response` do Express.
   - Se para testar uma regra de negócio for necessário simular um objeto HTTP, a regra está na camada errada.
3. **Sem ciclo entre módulos:**
   - Módulos de domínio (ex: Frota e Viagens) não devem importar um ao outro circularmente. Extraia contratos para `types/` ou crie um serviço orquestrador.
4. **Fronteira de I/O explícita:**
   - O banco de dados PostgreSQL 18 é acessado exclusivamente pela camada de persistência (`repositories/` e `database/`) via pool de conexões `pg`.

---

## 3. Organização do Backend (`backend/src/`)

| Camada | Diretório | Responsabilidade | O que NÃO deve conter |
|---|---|---|---|
| **Entrada / App** | `src/index.ts` | Inicialização do Express, registro de middlewares globais e montagem de rotas | Regras de negócio ou queries SQL |
| **Rotas** | `src/routes/` | Declaração dos endpoints REST, métodos HTTP e encadeamento de middlewares de autorização | Lógica de validação de domínio ou chamadas diretas ao banco |
| **Controllers** | `src/controllers/` | Extração de `req.params`, `req.query` e `req.body`, acionamento do Service e retorno do status HTTP + JSON | Regras de negócio, cálculos ou queries SQL |
| **Services** | `src/services/` | Regras de negócio puras (alocação de veículos, fluxos do SVO, validações de CNH e transições de status) | Dependências de Express (`req`, `res`), códigos HTTP ou SQL cru |
| **Repositories** | `src/repositories/` | Consultas SQL parametrizadas (`$1, $2`) e operações atômicas no PostgreSQL 18 | Decisões de negócio ou formatação de resposta HTTP |
| **Database** | `src/database/` | Configuração do `pg.Pool`, gerenciamento de conexões, migrations e helpers de transação | Regras específicas de módulos |
| **Middlewares** | `src/middlewares/` | Autenticação, controle de acesso por perfil (RBAC), validação de entrada e tratamento global de erros | Orquestração de fluxos de domínio |
| **Types / DTOs** | `src/types/` | Interfaces TypeScript, DTOs de entrada/saída, enums e tipos literais do domínio | Código executável |

---

## 4. Organização do Frontend (`frontend/src/`)

| Camada | Diretório | Responsabilidade | O que NÃO deve conter |
|---|---|---|---|
| **Componentes UI** | `src/components/ui/` | Componentes atômicos, acessíveis e reutilizáveis (`Button`, `TextInput` com `useId`, `Modal`, `StatusBadge`, `Table`) | Chamadas diretas à API ou regras exclusivas de uma página |
| **Componentes de Domínio** | `src/components/` | Blocos visuais compostos reutilizados entre páginas de um mesmo fluxo (ex: cabeçalho operacional, filtros de frota) | Chamadas `fetch` descentralizadas |
| **Páginas (Pages)** | `src/pages/` | Telas completas associadas às rotas de navegação e orquestração dos 5 estados visuais (Ideal, Loading, Vazio, Erro, Parcial) | Marcação bruta repetitiva que deveria ser componente em `components/ui/` |
| **Serviços de API** | `src/services/` | Clientes HTTP tipados que encapsulam `fetch`, URL base, cabeçalhos de autenticação e tratamento de erros da API | Manipulação de estado visual do React |
| **Hooks** | `src/hooks/` | Lógica reutilizável de ciclo de vida, estado de formulários, paginação e sincronização de dados | Marcação JSX |
| **Types** | `src/types/` | Contratos TypeScript espelhados da API, entidades e estados de interface | Lógica executável |

---

## 5. Domínios de Negócio do Sistema Aratu

O código dentro de cada camada é organizado em torno dos domínios operacionais da **FSPH** e do **SVO**:

1. **Autenticação e Perfis (`auth` / `usuarios`):** controle de sessão e RBAC (Administrador, Gestor de Frota, Solicitante FSPH, Motorista, Equipe SVO).
2. **Gestão de Frota (`frota` / `veiculos`):** cadastro de viaturas administrativas e de remoção, controle de capacidade, hodômetro e disponibilidade.
3. **Motoristas (`motoristas`):** cadastro de condutores, controle de categoria e validade de CNH, escalas e disponibilidade.
4. **Viagens Institucionais (`viagens` / `solicitacoes`):** solicitação de transporte por unidades da FSPH, aprovação, alocação de veículo/motorista, checklist e registro de saída/retorno.
5. **Operações do SVO (`svo`):** acionamento de chamados de verificação de óbito, despacho de viatura de remoção cadavérica, custódia, laudos e liberação formal com sigilo.
6. **Manutenções (`manutencoes`):** ordens de serviço preventivas e corretivas, bloqueio automático de veículos indisponíveis e histórico de intervenções.
