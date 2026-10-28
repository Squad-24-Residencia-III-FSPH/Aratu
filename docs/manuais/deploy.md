# Deploy e Entrega Contínua — Sistema Aratu

Este documento define as diretrizes de build, preparação de ambiente e implantação do **Sistema Aratu** (Node.js/Express 5, React 19/Vite e PostgreSQL 18).

---

## 1. Fluxo de promoção e CI

O fluxo preserva `develop` como branch de integração e promove alterações na ordem `develop` → `staging` → `main`:

1. Mudanças são integradas em `develop` por PR e promovidas para `staging` por outro PR.
2. `.github/workflows/ci-cd.yml` executa os checks para PRs em `develop`, `staging` e `main`, bem como para pushes em `staging` e `main`.
3. O workflow executa `frontend-ci` (ESLint, testes Node e build Vite) e `backend-ci` (testes, `tsc --noEmit` e build TypeScript). `docker-ci` só inicia após os dois jobs e valida/compila as imagens de produção com valores fictícios.
4. Depois de um push em `staging` com os três checks aprovados, o workflow abre um PR `staging` → `main`, ou reutiliza o PR já aberto. A equipe revisa e faz o merge manualmente.
5. Um push em `main` aciona o deploy apenas após os mesmos checks. O deploy usa o ambiente protegido `production`, atualiza o checkout para o commit validado, reconstrói os serviços e executa healthchecks e smoke checks da SPA e da API.

Não há merge automático para `main`. Um conflito entre branches deve ser resolvido pela equipe, promovendo a versão atual de `main` para `staging` por PR e validando novamente.

### Checks requeridos e proteção de branches

Configure estas regras em **Settings → Branches**. Os nomes requeridos correspondem aos nomes dos jobs no workflow:

- **`main`:** exigir PR, bloquear push direto, exigir `frontend-ci`, `backend-ci` e `docker-ci`; recomenda-se exigir revisão antes do merge.
- **`staging`:** exigir PR e exigir os três checks para o PR `develop` → `staging`.
- **`develop`:** exigir PR e exigir os três checks.

Em **Settings → Actions → General**, habilite a permissão de workflows para criar Pull Requests; o job de promoção tem somente `contents: read` e `pull-requests: write`. Não conceda permissão de escrita global ao workflow.

Crie a branch remota `staging` a partir do estado atual de `develop` antes de usar o fluxo. As configurações de regras, branches, secrets e VPS são administrativas e não são criadas pelo workflow.

### Configuração do GitHub Actions

Crie o ambiente **Settings → Environments → production**, restrinja seus deployments à branch `main` e adicione estas variáveis e secrets:

| Nome | Tipo | Uso |
|---|---|---|
| `PRODUCTION_HOST` | Environment variable | Host DNS/IPv4 do VPS, sem usuário nem protocolo. |
| `PRODUCTION_USER` | Environment variable | Usuário SSH restrito para deploy. |
| `PRODUCTION_PATH` | Environment variable | Caminho absoluto do checkout no VPS (ex.: `/srv/aratu`). |
| `SSH_PRIVATE_KEY` | Environment secret | Chave privada exclusiva para Actions → VPS. |
| `SSH_KNOWN_HOSTS` | Environment secret | Chave pública do host SSH verificada por canal confiável, no formato `known_hosts`. |

Não desative `StrictHostKeyChecking` nem confie em uma chave de servidor coletada sem verificação. A chave privada deve corresponder à chave pública adicionada ao `authorized_keys` do usuário de deploy.

### Preparação do VPS e acesso do checkout

O VPS deve ter Docker Engine, Docker Compose v2, Git e um checkout do repositório na branch `main`. O usuário SSH precisa executar Git e Docker sem prompts interativos (membro do grupo `docker` ou mecanismo equivalente) e ter permissão de escrita somente na pasta de implantação.

`SSH_PRIVATE_KEY` autentica o runner no VPS; ela **não** permite ao VPS baixar um repositório privado. Gere uma chave de deploy separada no VPS, instale sua chave pública no repositório em **Settings → Deploy keys** com acesso somente leitura e configure a URL `origin` do checkout para usar SSH. Não reutilize a chave privada do Actions.

Crie no diretório do checkout um `.env` de produção, legível apenas pelo usuário de deploy (`chmod 600`), contendo valores exclusivos do servidor:

```dotenv
POSTGRES_USER=usuario_do_banco
POSTGRES_PASSWORD=senha_segura
POSTGRES_DB=aratu
DATABASE_URL=postgresql://usuario_do_banco:senha_segura@db:5432/aratu
JWT_SECRET=segredo_aleatorio_longo
JWT_EXPIRES_IN=8h
INITIAL_ADMIN_EMAIL=admin@aratu.fsph.se.gov.br
INITIAL_ADMIN_PASSWORD=senha_inicial_forte
INITIAL_ADMIN_NAME=Administrador do Sistema
FRONTEND_PORT=8080
```

As variáveis `INITIAL_ADMIN_*` são exigidas por `npm run db:seed` para provisionar o primeiro Administrador; em produção a senha não pode ser o placeholder nem ter menos de 8 caracteres. `NODE_ENV` não precisa constar neste arquivo: o `backend/Dockerfile.prod` define `production` e o `docker-compose.prod.yml` reforça o valor explicitamente.

Codifique caracteres reservados da senha do banco como URL encoding em `DATABASE_URL`. Não versione esse arquivo ou seus valores. A porta `8080` é publicada somente em `127.0.0.1`; configure um proxy reverso HTTPS existente no VPS para encaminhar tráfego público à porta local. A configuração de TLS/firewall desse proxy é responsabilidade do ambiente de hospedagem.

O workflow executa `git pull --ff-only origin main`, verifica que o checkout está exatamente no SHA validado e então executa:

```bash
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans --wait --wait-timeout 180
```

O Compose de produção usa os Dockerfiles `backend/Dockerfile.prod` e `frontend/Dockerfile.prod`, expõe apenas o frontend em localhost e mantém os dados do PostgreSQL no volume `aratu_prod_pgdata`. O Nginx serve a SPA e encaminha `/api/` ao backend, removendo o prefixo para preservar o contrato do cliente. Um reinício breve durante a substituição de contêineres é esperado; esta configuração não garante zero downtime.

**Pré-requisito de banco:** o workflow não aplica migrations. Antes de ativar uma versão que exija schema novo, aplique a migration aprovada no banco persistente de forma coordenada e com plano de rollback; não remova o volume do banco durante deploy ou rollback.

## 2. Checklist pré-deploy

- [ ] Os PRs e checks exigidos passaram; a promoção para `main` foi revisada e mesclada.
- [ ] Migrations estão transacionais e há plano de reversão compatível com os registros existentes.
- [ ] Contratos da API e frontend permanecem compatíveis.
- [ ] Secrets, chave do host e variável do servidor foram provisionados no ambiente `production`.
- [ ] Checkout `main`, deploy key read-only, `.env`, Docker/Compose e proxy HTTPS estão prontos no VPS.
- [ ] Nenhum segredo ou dado pessoal real da FSPH/SVO está versionado ou exibido em logs.

## 3. Deploy manual e diagnóstico

Para operar fora do workflow, execute no VPS como usuário de deploy:

```bash
cd /srv/aratu
git switch main
git pull --ff-only origin main
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans --wait --wait-timeout 180
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=50 backend frontend db
```

O deploy automatizado também consulta `/` e `/api/` através do contêiner frontend. Em falha de build, SSH ou healthcheck, o workflow fica com status falho; não há notificação externa nem rollback automático configurados.

## 4. Rollback

O método preferido é reverter a alteração por PR em `main`; o merge executará os mesmos checks e fará novo deploy da versão revertida. Para recuperação emergencial, um operador autorizado pode selecionar um commit estável anterior no checkout e reconstruir os serviços:

```bash
git switch --detach <commit-estavel>
docker compose -f docker-compose.prod.yml up -d --build --remove-orphans --wait --wait-timeout 180
```

Em seguida, reverta também a alteração em `main` para evitar que um deploy posterior restaure a versão com falha. Não remova `aratu_prod_pgdata`.

Rollback de aplicação não reverte automaticamente migrations. Reverter o schema exige avaliação de compatibilidade com os registros gravados e execução explícita da migration de rollback aprovada.
