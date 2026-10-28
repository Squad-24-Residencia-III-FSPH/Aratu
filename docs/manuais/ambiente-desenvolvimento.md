# Ambiente de Desenvolvimento — Sistema Aratu

Este documento descreve a configuração e operação do ambiente local de desenvolvimento do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

---

## 1. Pré-requisitos

- **Git** instalado e configurado (`user.name` e `user.email`).
- **Docker** e **Docker Compose** (no Windows, utilizar Docker Desktop com backend WSL 2).
- **Node.js 22+ (LTS)** (necessário apenas para executar `npm run dev` no host; não é necessário ao usar somente Docker Compose).

---

## 2. Arquitetura em Containers (`docker-compose.yml`)

O ambiente local roda integralmente em containers orquestrados pelo `docker-compose.yml` na raiz do repositório:

| Serviço | Imagem / Contexto | Porta Local | Descrição |
|---|---|---|---|
| `db` | `postgres:18-alpine` | `5432` | Banco de dados relacional **PostgreSQL 18** com volume persistente (`pgdata`). |
| `backend` | `./backend` (Node.js + Express 5 + TypeScript via `tsx`) | `3000` | API REST conectada ao PostgreSQL via variável `DATABASE_URL`. |
| `frontend` | `./frontend` (React 19 + TypeScript + Vite) | `5173` | Interface web SPA com Hot Module Replacement (HMR). |

### Configuração local

Copie `.env.example` para `.env` e substitua os placeholders. Use a mesma senha configurada em `POSTGRES_PASSWORD` e na URL `DATABASE_URL`; mantenha a senha em formato hexadecimal para evitar caracteres que precisem de escape na connection string. `JWT_SECRET` deve ser um segredo aleatório local, não o placeholder do exemplo.

No host, `DATABASE_URL` aponta para `localhost`. O Compose configura o backend para conectar ao serviço `db` dentro da rede Docker, reutilizando as credenciais `POSTGRES_*` do `.env`.

### Variáveis de ambiente

O backend e os scripts (`db:migrate`, `db:seed`, testes) carregam o `.env` da raiz do repositório. O frontend lê apenas `frontend/.env` (modelo em `frontend/.env.example`).

| Variável | Obrigatória | Padrão / uso |
|---|---|---|
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT` | Sim (Compose) | Credenciais do container `db`. |
| `DATABASE_URL` | Sim (API e scripts) | `localhost` no host; host `db` dentro do container. |
| `NODE_ENV` | Não | Ausente equivale a desenvolvimento; `production` desabilita `/docs`. |
| `PORT` | Não | `3000`. |
| `JWT_SECRET` | Sim | Segredo exclusivo por ambiente. |
| `JWT_EXPIRES_IN` | Não | `8h` (sufixos `s`, `m`, `h`, `d`). |
| `INITIAL_ADMIN_EMAIL`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_ADMIN_NAME` | Sim para `db:seed` | Nome tem padrão `Administrador do Sistema`. |
| `POSTGRES_DB_TEST` | Não | `aratu_test`. |
| `DATABASE_URL_TEST` | Não | Se omitida, é derivada de `DATABASE_URL` com `POSTGRES_DB_TEST`. |
| `VITE_API_BASE_URL` | Não | `/api`. |
| `API_PROXY_TARGET` | Não | `http://localhost:3000` no host; `http://backend:3000` no Compose. |
| `FRONTEND_PORT` | Não | `8080`; usada apenas no Compose de produção. |

### Subindo e gerenciando os serviços

```bash
# Preparar configuração (uma vez por ambiente)
cp .env.example .env

# Construir e iniciar todos os serviços em segundo plano
docker compose up -d --build

# Verificar status dos containers em execução
docker compose ps

# Acompanhar logs em tempo real (todos ou de um serviço específico)
docker compose logs -f
docker compose logs -f backend

# Parar os containers mantendo os dados do banco
docker compose down
```

---

## 3. Banco de Dados Local (PostgreSQL 18)

As credenciais de desenvolvimento são definidas no `.env` e não ficam hardcoded no Compose:

- **Host (interno na rede Docker):** `db`
- **Host (a partir da máquina local):** `localhost`
- **Porta, usuário, senha e database:** `POSTGRES_PORT`, `POSTGRES_USER`, `POSTGRES_PASSWORD` e `POSTGRES_DB`
- **Connection String (`DATABASE_URL`):** use o valor local com host `localhost`; no container backend, o Compose usa host `db`.

Para executar o backend diretamente no host, instale as dependências e inicie o modo watch:

```bash
npm --prefix backend install
npm --prefix backend run dev
```

### Introspecção e acesso via CLI

Para inspecionar tabelas, índices ou planos de execução (`EXPLAIN (ANALYZE, BUFFERS)`) diretamente no container do PostgreSQL 18:

```bash
# Abrir sessão interativa do psql
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'

# Listar tabelas existentes sem abrir sessão interativa
docker compose exec db sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -c "\dt"'
```

---

## 4. Acesso Local e URLs

- **Frontend (React + Vite):** `http://localhost:5173`
- **Backend (API REST Express):** `http://localhost:3000`
- **Documentação interativa da API (Swagger UI):** `http://localhost:3000/docs`
- **Contrato OpenAPI bruto:** `http://localhost:3000/docs/openapi.json`

### Documentação e teste manual da API

O contrato fica em [`backend/docs/openapi.yaml`](../../backend/docs/openapi.yaml) e é servido pelo Swagger UI apenas fora de produção (`NODE_ENV !== 'production'`). Para testar rotas protegidas:

1. Faça `POST /auth/login` com o Administrador do seed e copie o `token` retornado.
2. No Swagger UI, clique em **Authorize** e informe o token no esquema `bearerAuth`.
3. Use **Try it out** nas operações de `/profiles` e `/vehicles`.

Ao adicionar ou alterar dependências do backend, recrie o volume anônimo de `node_modules` para que o container de desenvolvimento instale os novos pacotes:

```bash
docker compose up -d --build -V backend
```

### Diretrizes para testes locais e automação

- Não assuma credenciais de usuários ou perfis de acesso sem verificar as seeds de desenvolvimento ou consultar o usuário.
- Ao testar fluxos por perfil de acesso (**RBAC**), valide os 5 perfis do sistema:
  1. **Administrador**
  2. **Gestor de Frota / Aprovador**
  3. **Solicitante de Viagem (FSPH)**
  4. **Motorista**
  5. **Operador / Equipe SVO**
- **Proteção de Dados (LGPD e Sigilo SVO):** É terminantemente proibido cadastrar ou utilizar dados pessoais reais de motoristas (CPF, CNH), servidores da FSPH ou falecidos/familiares atendidos pelo SVO no banco local. Utilize exclusivamente dados fictícios.

---

## 5. Configuração Recomendada de IDE (VS Code)

Extensões recomendadas para manter a padronização de código e acessibilidade:

- **ESLint** (`dbaeumer.vscode-eslint`) — validação estática de regras TypeScript e React Hooks.
- **Prettier** (`esbenp.prettier-vscode`) — formatação padronizada de código.
- **Docker** (`ms-azuretools.vscode-docker`) — inspeção de containers e logs.
- **PostgreSQL / Database Client** — consulta e inspeção do schema local.
- **axe Accessibility Linter** (`deque-systems.vscode-axe-linter`) — verificação antecipada de critérios WCAG 2.2 Nível AA no JSX/TSX.
