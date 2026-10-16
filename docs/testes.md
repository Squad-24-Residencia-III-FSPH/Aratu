# QA, Qualidade de Código e Testes — Sistema Aratu

Este documento descreve as ferramentas de verificação estática, padrões de qualidade, testes automatizados e auditoria de acessibilidade (**WCAG 2.2 Nível AA**) utilizados no **Sistema Aratu**.

---

## 1. Visão Geral das Ferramentas de Qualidade

| Ferramenta | Onde atua | Objetivo |
|---|---|---|
| **TypeScript (`tsc`)** | `backend/` e `frontend/` | Verificação estática estrita de tipos, contratos de funções, DTOs e props de componentes React 19. |
| **ESLint (`eslint`)** | `frontend/` e `backend/` | Detecção de padrões problemáticos, variáveis não utilizadas, regras de React Hooks e padronização de estilo. |
| **Testes Unitários e de Integração** | `backend/` e `frontend/` | Validação isolada das regras de negócio em `services/` e dos fluxos de API/repositórios com banco de teste. |
| **Auditoria WCAG 2.2 AA** | `frontend/` | Garantia de operação integral por teclado, contraste mínimo de 4.5:1, uso de `useId()` e alvos de toque de 44×44px. |

---

## 2. Executando as Verificações Localmente

Os comandos podem ser executados diretamente nos diretórios `frontend/` e `backend/` ou via `docker compose exec`:

### No Frontend (`./frontend`)

```bash
# Rodar o linter (ESLint) em todo o código React/TypeScript
docker compose exec frontend npm run lint

# Validar tipagem estrita e compilação de produção (tsc -b && vite build)
docker compose exec frontend npm run build
```

### No Backend (`./backend`)

```bash
# Validar tipagem TypeScript sem emitir arquivos JS
docker compose exec backend npx tsc --noEmit

# Executar a suíte de testes automatizados
docker compose exec backend npm test
```

---

## 3. Estratégia de Testes no Sistema Aratu

### 3.1 Testes Unitários da Camada de Domínio (`backend/src/services/`)
- Como os `Services` do Aratu não dependem de `Request`/`Response` do Express nem de SQL direto, eles devem ser testados unitariamente injetando repositórios falsos (*fakes/mocks*).
- **O que cobrir obrigatoriamente:**
  - Transições de status de solicitações e viagens (`pendente` → `aprovada` → `em_andamento` → `concluida` / `cancelada`);
  - Bloqueio de alocação de veículos em manutenção ou já em viagem no mesmo intervalo;
  - Validação de CNH vencida ou categoria incompatível do motorista;
  - Regras de acionamento, custódia e liberação formal de chamados do SVO;
  - Cálculo de quilometragem percorrida (impedindo km final menor que km inicial).

### 3.2 Testes de Integração com PostgreSQL 18 (`backend/src/repositories/`)
- Devem ser executados contra um banco de teste isolado no container `db` (`postgres:18-alpine`).
- **Isolamento por transação:** inicie uma transação (`BEGIN`) antes de cada teste (`beforeEach`) e execute `ROLLBACK` ao final (`afterEach`) para manter o banco limpo e os testes rápidos.
- **Teste de concorrência:** valide que chamadas concorrentes de alocação da mesma viatura respeitam o lock `SELECT ... FOR UPDATE`, permitindo apenas uma alocação válida.

### 3.3 Proteção de Dados nos Testes (LGPD e Sigilo SVO)
- **Regra inegociável:** todos os dados utilizados em fixtures, mocks e seeds de teste devem ser **100% fictícios e sintéticos** (ex: placas fictícias, CPFs gerados apenas para validação matemática, nomes fictícios).
- É terminantemente proibido copiar registros reais de servidores da FSPH, motoristas ou falecidos atendidos pelo SVO para dentro dos arquivos de teste.

---

## 4. Roteiro de QA de Interface e Acessibilidade (WCAG 2.2 AA)

Antes de aprovar qualquer tarefa que crie ou altere telas no `frontend/`, execute os 5 passos de verificação prática:

1. **Teste de Teclado Exclusivo (`Tab`, `Shift+Tab`, `Enter`, `Espaço`, `Esc`):**
   - Percorra toda a tela sem usar o mouse. Todos os campos, filtros, ações de tabela e modais devem ser alcançáveis em ordem lógica, com contorno de foco (`:focus-visible`) nítido e sem ser encoberto por barras fixas (Critério 2.4.11).
2. **Inspeção de Formulários e Erros:**
   - Clique no texto de cada `<label>` e confirme que o cursor foca o `<input>` correspondente (vínculo `htmlFor` + `id` via `useId()`).
   - Submeta o formulário com dados inválidos e verifique se o erro descreve claramente como corrigir, utilizando `aria-invalid="true"` e `role="alert"`.
3. **Verificação dos 5 Estados Visuais:**
   - Confirme o comportamento da tela nos estados *Carregando*, *Vazio*, *Erro*, *Parcial* e *Ideal*.
4. **Teste de Zoom 200% e Responsividade Mobile (320px):**
   - Aplique zoom de 200% no navegador e simule tela móvel para validar que não há corte de texto ou sobreposição de botões, e que os alvos de toque para motoristas possuem ao menos **44×44px**.
5. **Verificação de Contraste e Semântica Visual:**
   - Confirme que nenhum status de veículo, viagem ou chamado do SVO depende exclusivamente de cor.
