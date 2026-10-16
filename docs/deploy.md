# Deploy e Entrega Contínua — Sistema Aratu

Este documento define as diretrizes de build, preparação de ambiente e implantação do **Sistema Aratu** (Node.js/Express 5, React 19/Vite e PostgreSQL 18).

---

## 1. Processo de Build por Serviço

### Backend (`./backend`)
1. **Verificação de tipos TypeScript:** validação estrita sem emissão de erros (`npx tsc --noEmit`).
2. **Instalação de dependências limpas:** `npm ci --omit=dev` (em imagem de produção) para garantir reprodutibilidade a partir do `package-lock.json`.
3. **Variáveis de ambiente obrigatórias:**
   - `PORT`: porta HTTP da API (padrão `3000`).
   - `DATABASE_URL`: string de conexão com o PostgreSQL 18 (`postgresql://<usuario>:<senha>@<host>:5432/<banco>`).

### Frontend (`./frontend`)
1. **Compilação e checagem de tipos:** `npm run build` (executa `tsc -b && vite build`).
2. **Artefato gerado:** arquivos estáticos otimizados em `frontend/dist/`, prontos para serem servidos via servidor web estático (ex: Nginx) ou container dedicado.

---

## 2. Checklist Pré-Deploy

Antes de promover uma versão de `develop` (após aprovação pelo **QA**) para `main`:

- [ ] **Migrações de Banco de Dados (PostgreSQL 18):**
  - Todas as migrações DDL estão envolvidas em blocos transacionais (`BEGIN; ... COMMIT;`).
  - Existe plano de rollback documentado para qualquer alteração de schema.
  - Nenhuma constraint utiliza `ON DELETE CASCADE` sem aprovação arquitetural explícita (o padrão é `ON DELETE RESTRICT`).
- [ ] **Compatibilidade de Contratos:**
  - Alterações em payloads ou rotas da API Express estão sincronizadas com os clientes HTTP em `frontend/src/services/`.
- [ ] **Qualidade e Testes:**
  - `npm run lint` e `npm run build` executam sem erros ou avisos no frontend e no backend.
  - Nenhum `console.log` de depuração temporário ou código morto foi deixado no diff.
- [ ] **Segurança e LGPD:**
  - Nenhum segredo, token ou credencial está hardcoded no código.
  - Nenhum dado pessoal real da FSPH ou do SVO consta em seeds ou arquivos versionados.

---

## 3. Execução de Deploy via Docker Compose

```bash
# 1. Atualizar código na branch estável
git switch main
git pull origin main

# 2. Reconstruir imagens e reiniciar containers sem pacotes órfãos
docker compose up -d --build --remove-orphans

# 3. Verificar saúde dos serviços e logs de inicialização
docker compose ps
docker compose logs --tail=50 backend frontend db
```

---

## 4. Plano de Reversão (Rollback)

Caso seja identificada falha crítica após a atualização:

1. **Aplicação (Backend / Frontend):** reverter para a tag/commit estável anterior em `main` e reconstruir os containers (`docker compose up -d --build`).
2. **Banco de Dados:** executar o script de rollback correspondente à migration aplicada dentro de uma transação controlada, preservando os registros operacionais já gravados.
