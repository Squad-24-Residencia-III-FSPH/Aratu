# Publicar o Aratu para teste do cliente

**Homologação** é uma instalação para o cliente testar o sistema com dados fictícios. Haverá uma única instalação compartilhada, gratuita. A versão publicada sai da `main`; o trabalho da equipe continua na `develop`.

```text
feature/fix ──PR──> develop ──PR──> main
                                  │
                                  └── CI → migrations → API Render → frontend Pages
                                                         │
                                                         └── banco Neon
```

Serviços: Cloudflare Pages Free, Render Web Service Free e Neon Free com PostgreSQL 18. Os subdomínios gratuitos dispensam compra de domínio. O VPS anterior não é usado pelos novos workflows.

## 1. Preparar o repositório e retirar staging

1. Integrar a infraestrutura em `develop` pelo PR da branch `fix/ci-cd-free-hosting`.
2. Em **Settings → Rules → Rulesets**, ou **Settings → Branches**, proteger `develop` e `main`: exigir Pull Request, revisão e checks `frontend-ci`, `backend-ci`, `docker-ci`, `ci-required`. Selecionar os nomes exibidos na execução real do PR. Não exigir publicação como check de PR.
3. O CI está em `.github/workflows/ci.yml`. Lint, testes, tipos e build continuam registrando diagnósticos após falhas; qualquer falha reprova o job. Os relatórios TAP ficam em Artifacts por sete dias e as contagens aparecem no resumo. Suíte vazia, testes pulados, TODO ou cancelados reprovam a validação.
4. Depois de configurar os serviços e secrets abaixo, abrir PR `develop → main`. A publicação chama o mesmo CI antes de tocar no banco compartilhado.

A remoção de `staging` foi solicitada pelo administrador em 17/11/2026. Retirar primeiro suas dependências do workflow:

1. Atualizar referências com `git fetch origin`.
2. Verificar PRs abertos com origem/destino `staging`; redirecionar os ainda necessários.
3. Conferir `git log origin/develop..origin/staging`: a saída precisa estar vazia. Na verificação de 17/11/2026, não havia commits exclusivos em `staging`; conferir novamente antes de excluir.
4. Após a mudança do workflow chegar às branches usadas, abrir **Code → Branches**, procurar `staging` e excluir somente essa branch. Alternativa: `git push origin --delete staging`.
5. Retirar regras exclusivas de `staging`. Não apagar `main`, `develop` ou tarefas em uso.

Apagar a referência não apaga commits alcançáveis pela `develop`. Não usar reset ou force push.

## 2. Criar o banco Neon

No [painel Neon](https://console.neon.tech), criar um projeto **Free**, nome sugerido `aratu-homologacao`, com **PostgreSQL 18**. Preferir uma região também disponível no Render.

Em **Connect**, copiar a conexão **direta**, desmarcando pooling e mantendo TLS (`sslmode=require` ou `verify-full`). O hostname direto não contém `-pooler`. Guardar no gerenciador de secrets: não enviar na conversa, fazer commit ou imprimir em logs.

O pipeline aplica as migrations existentes. Não criar tabelas manualmente nem executar helpers de testes nessa base: eles usam limpeza destrutiva. O CI tem PostgreSQL 18 descartável próprio.

Recuperar dados antigos exige acesso e inventário separados. O banco novo não contém automaticamente o histórico do VPS.

## 3. Criar o Cloudflare Pages

No [painel Cloudflare](https://dash.cloudflare.com), abrir **Workers & Pages → Create application → Pages → Direct Upload**. Escolher o projeto Pages de envio de arquivos; o Actions publicará o `dist`.

Nome sugerido `aratu-homologacao`, ou outro disponível. Registrar nome e URL `https://<projeto>.pages.dev`, sem barra final. A branch de publicação será `main`. Não configurar outro deploy automático por Git.

Se o painel solicitar arquivos para concluir o projeto, usar `frontend/dist`, gerado com `npm ci` e `npm run build` dentro de `frontend`. Essa publicação inicial reserva o projeto; considerar a instalação pronta somente após a versão verificada pelo Actions.

Anotar o **Account ID**. Em **My Profile → API Tokens → Create Token**, criar um token com **Account → Cloudflare Pages → Edit**, restrito à conta usada. Guardá-lo diretamente no secret GitHub descrito abaixo.

## 4. Criar a API Render

No [painel Render](https://dashboard.render.com), escolher **New → Web Service** e conectar o repositório. Como administrador, aprovar a integração da organização somente para os repositórios necessários.

| Campo | Valor |
|---|---|
| Nome | `aratu-api-homologacao`, ou nome disponível |
| Branch | `main` |
| Runtime | Docker |
| Root directory | `backend` |
| Dockerfile path | `./Dockerfile.prod`, relativo ao root directory |
| Docker build context | `.`, relativo ao root directory |
| Instance type | **Free** |
| Health check path | `/health/live` |
| Auto-Deploy | **Off** |

O processo escuta em `0.0.0.0` e aceita `PORT` do Render. O build não conecta ao banco. O deploy inicial da criação pode ocorrer antes de o código novo chegar à `main`; aguardar a publicação verificada pelo Actions.

Em **Environment** do serviço:

| Nome | Valor |
|---|---|
| `DATABASE_URL` | Conexão direta TLS do Neon |
| `JWT_SECRET` | Segredo aleatório exclusivo, estável entre deploys |
| `JWT_EXPIRES_IN` | `8h` |
| `NODE_ENV` | `production` |
| `CORS_ALLOWED_ORIGIN` | URL exata do Pages, sem barra final |

`NODE_ENV=production` ativa o pacote otimizado e validações de segurança do Node; o uso continua sendo homologação.

Gerar segredo localmente, se necessário:

```bash
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))"
```

Guardar o resultado somente no painel protegido. Anotar URL HTTPS da API e **Service ID** (`srv-...`). Nas configurações da conta Render, criar uma API Key para o Actions e guardá-la em secret. Manter Auto-Deploy desligado: o pipeline publica o SHA aprovado e acompanha seu deploy até `live`.

## 5. Configurar o GitHub Environment

Abrir **Settings → Environments → New environment**, nome **`homologation`**. Em **Deployment branches and tags**, permitir somente a branch `main`.

### Environment secrets

| Nome | Conteúdo privado |
|---|---|
| `NEON_DATABASE_URL` | Conexão direta TLS do Neon para migrations |
| `RENDER_API_KEY` | API Key da conta Render |
| `CLOUDFLARE_API_TOKEN` | Token Pages Edit da conta Cloudflare |
| `DEMO_PASSWORD` | Senha fictícia privada com pelo menos 12 caracteres e até 72 bytes |

### Environment variables

| Nome | Conteúdo sem credencial |
|---|---|
| `RENDER_SERVICE_ID` | `srv-...` |
| `API_BASE_URL` | `https://<api>.onrender.com`, sem `/api` ou barra final |
| `CLOUDFLARE_ACCOUNT_ID` | Account ID de 32 caracteres hexadecimais |
| `CLOUDFLARE_PAGES_PROJECT` | Nome exato do projeto Pages |
| `FRONTEND_URL` | `https://<projeto>.pages.dev`, sem barra final |

Não colocar secrets em `VITE_*`. O workflow define somente `VITE_API_BASE_URL`, que é pública, durante o build.

O Environment antigo `production` pode permanecer como histórico enquanto a equipe inventaria acessos. A nova publicação não usa host ou chave SSH do VPS. Revogar credenciais antigas depois de conferir quem ainda as utiliza.

## 6. Primeira publicação e contas fictícias

1. Fazer merge do PR `develop → main`. O push chama **Publish homologation**: CI → build → migrations → API → frontend → verificações públicas.
2. Em **Actions → Publish homologation → Run workflow**, selecionar **main** e marcar **bootstrap_demo**. Executar para provisionar as contas. A operação também valida e republica a versão.
3. Conferir no resumo SHA, ID do deploy, URLs, prontidão e logins. Um pedido aceito pela plataforma só é sucesso depois do deploy `live` no SHA esperado.

| Perfil | Conta fictícia |
|---|---|
| Administrador | `administrador.demo@example.test` |
| Gestor | `gestor.demo@example.test` |
| Solicitante | `solicitante.demo@example.test` |
| Motorista | `motorista.demo@example.test` |
| Atendente SVO | `atendente_svo.demo@example.test` |
| Equipe SVO | `equipe_svo.demo@example.test` |

As contas inicialmente usam `DEMO_PASSWORD`. Cada uma tem apenas seu perfil; sair e entrar para trocar de papel. Não existe bypass de RBAC. O seed reaproveita também os cenários fictícios de frota/equipe SVO existentes.

Reexecutar preserva senhas, perfis e registros. Alterar o secret não troca senhas já cadastradas. Após o primeiro acesso, administrar contas pela tela de usuários. Conta existente inativa ou com perfil divergente faz o bootstrap falhar, exigindo ajuste explícito.

Compartilhar URL e senha por canal privado autorizado. Não publicar senha no README, bundle ou PR. Usar dados fictícios na homologação.

## 7. Publicações seguintes

1. Criar feature/fix da `develop` atualizada.
2. Integrar na `develop` por PR com checks verdes.
3. Quando quiser liberar ao cliente, revisar e mesclar PR **develop → main**.
4. Acompanhar **Publish homologation** até o último passo. Não precisa operar servidor nem aplicar SQL manualmente.

Não solicitar bootstrap em cada release. Para reexecutar após corrigir configuração, usar **Run workflow**, main, sem bootstrap.

A publicação serializa migrations e serviços por ambiente. Se a main avançar enquanto uma execução aguarda, a versão antiga falha antes de alterar o banco; executar a versão mais recente.

## 8. Suspensão e custo zero

Render Free dorme após 15 minutos sem tráfego; a retomada pode levar cerca de um minuto. O login mostra preparação com espera limitada e cancelamento. Somente sondagens GET são repetidas; gravações não têm retry automático.

Neon Free também suspende o compute inativo. O healthcheck periódico usa `/health/live`, sem banco. `/health/ready` verifica banco/migrations durante publicação ou retomada de sessão. Não criar pings artificiais para manter o serviço ligado.

Conferir franquias nos painéis; usar subdomínios gratuitos e não habilitar plano/adicional pago. Disco local Render é efêmero; registros ficam no Neon. Render Postgres Free não foi escolhido porque expira.

Fontes: [Render Free](https://render.com/docs/free), [Neon Free](https://neon.com/docs/introduction/plans), [Pages e CI](https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/).

## 9. Diagnóstico e recuperação

| Sintoma | Verificação |
|---|---|
| Docker pulado | Falha anterior de frontend/backend; gate geral reprovado. |
| Testes pulados/TODO | Resumo e artefato TAP; corrigir a causa. |
| Configuração ausente | Secret/variable cadastrado no Environment `homologation`, com o nome correto. |
| Migration falhou | Schema e logs; API e frontend novos ainda não foram publicados. |
| Login demora após intervalo | Retomada gratuita, acompanhada pela mensagem de preparação. |
| Login falha entre domínios | URL API sem `/api`; CORS exatamente igual à origem Pages. |
| API viva, readiness 503 | Banco indisponível ou migrations faltantes. |

Antes de alterações futuras de schema, guardar exportação lógica protegida fora do Git e testar restauração numa base autorizada. A janela gratuita de restore é curta. Não publicar dumps em artifacts públicos.

Para recuperar a aplicação, publicar commit estável por PR de reversão na main, preservando compatibilidade do schema. Se necessário, selecionar deploy anterior no Render e rollback correspondente no Pages; conferir os dois serviços.

Rollback da aplicação não executa `.down.sql`, remove banco ou apaga histórico. Migration aplicada pode permanecer quando o deploy falha: a aplicação anterior precisa aceitar o schema expandido.

## 10. Responsáveis e entrega

Registrar no documento operacional da equipe, sem credenciais:

- Administrador titular e substituto do GitHub e das três contas.
- Projetos, IDs, regiões e URLs.
- Recuperação de acesso e local protegido das credenciais.
- Último SHA e procedimento de backup/restauração.

Entregar depois de testar os seis logins, uma ação permitida/negada por perfil, rota profunda, retomada após inatividade e persistência após redeploy.
