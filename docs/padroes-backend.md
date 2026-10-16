# Padrões de Implementação Backend — Sistema Aratu

Este documento descreve as diretrizes práticas para implementação no **Backend** do **Sistema Aratu** (**Node.js, Express 5, TypeScript e PostgreSQL 18 via driver `pg`**).

---

## 1. Separação de Responsabilidades por Camada

| Camada | Localização | O que faz | O que é proibido |
|---|---|---|---|
| **Routes** | `backend/src/routes/` | Registra endpoints REST, associa middlewares de autenticação/RBAC e delega ao Controller | Conter lógica de validação, regras de domínio ou SQL |
| **Controllers** | `backend/src/controllers/` | Lê `req.params`, `req.query` e `req.body`, chama o Service e formata a resposta HTTP (`res.status().json()`) | Acessar o banco ou implementar regras de negócio |
| **Services** | `backend/src/services/` | Executa regras de negócio puras (disponibilidade de frota, validação de CNH, fluxos do SVO, cálculo de km) | Importar `Request`/`Response` do Express ou montar SQL cru |
| **Repositories** | `backend/src/repositories/` | Executa queries parametrizadas (`$1, $2`) no PostgreSQL 18 via `pg.Pool` ou `PoolClient` | Tomar decisões de negócio ou retornar status HTTP |
| **Middlewares** | `backend/src/middlewares/` | Autenticação, verificação de perfil RBAC, validação de schema de entrada e handler global de erros | Conter fluxos completos de domínio |
| **Types** | `backend/src/types/` | Interfaces, DTOs, union types e constantes de domínio | Conter lógica executável |

---

## 2. Acesso a Dados e Transações no PostgreSQL 18 (`pg`)

### 2.1 Regras obrigatórias em consultas SQL

1. **Parâmetros posicionais (`$1, $2, ...`) sempre:** nunca concatene nem interpole variáveis dentro da string SQL.
2. **Proibido `SELECT *`:** declare explicitamente as colunas retornadas (utilizando constantes reutilizáveis no Repository e aliases para `camelCase` quando apropriado).
3. **Filtro e ordenação no banco:** nunca busque tabelas inteiras para filtrar com `.filter()` ou ordenar com `.sort()` em memória no Node.js.
4. **Prevenção de N+1:** em listagens que exigem dados relacionados (ex: viagens com dados do veículo e motorista), utilize `JOIN` explícito no SQL.

### 2.2 Transações atômicas e controle de concorrência

Operações que alteram múltiplas tabelas ou que **leem, decidem e gravam** (como aprovar uma solicitação de viagem e alocar uma viatura, ou despachar uma equipe do SVO) devem rodar dentro de uma transação atômica com trava pessimista (`SELECT ... FOR UPDATE`):

```typescript
import { Pool } from 'pg';

export async function alocarViaturaEmTransacao(
  pool: Pool,
  solicitacaoId: string,
  veiculoId: string,
  motoristaId: string
): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 1. Trava a linha do veículo para evitar alocação concorrente
    const veiculoRes = await client.query<{ id: string; status: string }>(
      'SELECT id, status FROM veiculos WHERE id = $1 FOR UPDATE;',
      [veiculoId]
    );

    const veiculo = veiculoRes.rows[0];
    if (!veiculo || veiculo.status !== 'disponivel') {
      throw new Error('A viatura selecionada não está disponível para alocação neste momento.');
    }

    // 2. Registra a viagem e atualiza o status do veículo atomicamente
    await client.query(
      `INSERT INTO viagens (solicitacao_id, veiculo_id, motorista_id, status)
       VALUES ($1, $2, $3, 'agendada');`,
      [solicitacaoId, veiculoId, motoristaId]
    );

    await client.query(
      `UPDATE veiculos
       SET status = 'em_viagem', updated_at = clock_timestamp()
       WHERE id = $1;`,
      [veiculoId]
    );

    await client.query(
      `UPDATE solicitacoes_viagem
       SET status = 'aprovada', updated_at = clock_timestamp()
       WHERE id = $1;`,
      [solicitacaoId]
    );

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    // Obrigatório: garante devolução da conexão ao pool em qualquer cenário
    client.release();
  }
}
```

---

## 3. Controle de Acesso Baseado em Perfis (RBAC)

A proteção visual de rotas no React **não substitui** a validação de segurança no backend. Todo endpoint restrito deve validar o perfil do usuário autenticado via middleware no Express:

- **Perfis oficiais do domínio:**
  - `ADMIN` (Administrador)
  - `GESTOR_FROTA` (Gestor de Frota / Aprovador)
  - `SOLICITANTE` (Solicitante de Viagem — FSPH)
  - `MOTORISTA` (Motorista)
  - `OPERADOR_SVO` (Operador / Equipe SVO)

- **Árvore de decisão de comportamento:**
  1. Se a diferença de comportamento depende do dado da entidade (`tipo_veiculo`, `status`, `unidade_solicitante`), condicione pelo dado no `Service`.
  2. Se a diferença é sobre *quem* tem permissão para executar a ação, aplique o middleware de RBAC na rota.
  3. Não crie feature flags sem solicitação explícita do usuário.

---

## 4. Contratos HTTP e Mensagens de Erro

As respostas de erro originadas no backend são lidas por pessoas na interface e devem respeitar a acessibilidade e a clareza operacional:

- Utilize códigos de status HTTP semânticos:
  - `200 OK` / `201 Created` / `204 No Content`
  - `400 Bad Request` (formato de entrada inválido)
  - `401 Unauthorized` (não autenticado / sessão expirada)
  - `403 Forbidden` (perfil RBAC sem permissão para a operação)
  - `404 Not Found` (recurso não encontrado)
  - `409 Conflict` (conflito de estado ou concorrência, ex: veículo já alocado no horário)
  - `422 Unprocessable Entity` (violação de regra de negócio, ex: CNH vencida)
- **Mensagens orientadoras:** nunca exponha stack traces ou erros internos do PostgreSQL na resposta JSON. Retorne uma mensagem em português claro dizendo o que ocorreu e como o usuário pode resolver.
