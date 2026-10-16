# Ambiente de Desenvolvimento — Sistema Aratu

Este documento descreve a configuração e operação do ambiente local de desenvolvimento do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

---

## 1. Pré-requisitos

- **Git** instalado e configurado (`user.name` e `user.email`).
- **Docker** e **Docker Compose** (no Windows, utilizar Docker Desktop com backend WSL 2).
- **Node.js 22+ (LTS)** (opcional no host para suporte de IDE/LSP; a execução principal ocorre em containers).

---

## 2. Arquitetura em Containers (`docker-compose.yml`)

O ambiente local roda integralmente em containers orquestrados pelo `docker-compose.yml` na raiz do repositório:

| Serviço | Imagem / Contexto | Porta Local | Descrição |
|---|---|---|---|
| `db` | `postgres:18-alpine` | `5432` | Banco de dados relacional **PostgreSQL 18** com volume persistente (`pgdata`). |
| `backend` | `./backend` (Node.js + Express 5 + TypeScript via `tsx`) | `3000` | API REST conectada ao PostgreSQL via variável `DATABASE_URL`. |
| `frontend` | `./frontend` (React 19 + TypeScript + Vite) | `5173` | Interface web SPA com Hot Module Replacement (HMR). |

### Subindo e gerenciando os serviços

```bash
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

As credenciais padrão de desenvolvimento estão declaradas no `docker-compose.yml`:

- **Host (interno na rede Docker):** `db`
- **Host (a partir da máquina local):** `localhost`
- **Porta:** `5432`
- **Usuário:** `admin`
- **Senha:** `adminpassword`
- **Database:** `meubanco`
- **Connection String (`DATABASE_URL`):** `postgresql://admin:adminpassword@db:5432/meubanco`

### Introspecção e acesso via CLI

Para inspecionar tabelas, índices ou planos de execução (`EXPLAIN (ANALYZE, BUFFERS)`) diretamente no container do PostgreSQL 18:

```bash
# Abrir sessão interativa do psql
docker compose exec db psql -U admin -d meubanco

# Listar tabelas existentes sem abrir sessão interativa
docker compose exec db psql -U admin -d meubanco -c "\dt"
```

---

## 4. Acesso Local e URLs

- **Frontend (React + Vite):** `http://localhost:5173`
- **Backend (API REST Express):** `http://localhost:3000`

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
