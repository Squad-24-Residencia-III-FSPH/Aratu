# Erros Comuns de Codificação a Evitar — Sistema Aratu

Este guia reúne os antipadrões técnicos e de domínio mais frequentes e como preveni-los no **Sistema Aratu**, alinhado aos princípios **DRY, SOLID, KISS, YAGNI, Clean Code** e **WCAG 2.2 Nível AA**.

---

## 1. Arquitetura e Camadas

- **Colocar regra de negócio em Controllers do Express ou Componentes React:**
  - *Erro:* Calcular disponibilidade de viatura, validar capacidade de assentos/corpos ou decidir transição de estado dentro de `src/controllers/` ou `src/pages/`.
  - *Como fazer:* A borda apenas traduz HTTP/UI. Toda regra de domínio mora exclusivamente em `backend/src/services/`.
- **Acessar o banco de dados fora da camada de Repositório:**
  - *Erro:* Importar o `pool` do `pg` e rodar SQL diretamente em um controller ou service.
  - *Como fazer:* Encapsule todas as queries SQL em `backend/src/repositories/` (ou `src/database/`).
- **Validação crítica apenas no Frontend:**
  - *Erro:* Confiar apenas no atributo `required` do HTML ou na validação do estado React para bloquear ações inválidas ou restritas por perfil.
  - *Como fazer:* O frontend guia o usuário; o backend **obrigatoriamente** revalida payloads, regras de domínio e permissões RBAC no middleware/service.
- **Criar ciclos de dependência entre módulos:**
  - *Erro:* `TripService` importa `VehicleService` e `VehicleService` importa `TripService`.
  - *Como fazer:* Extraia a regra coordenada para um serviço orquestrador ou compartilhe apenas tipos/contratos em `src/types/`.

---

## 2. TypeScript e Clean Code (Código em Inglês)

- **Misturar português e inglês em identificadores de código ou banco:**
  - *Erro:* Criar classes/métodos em português (`ViagemService`, `alocarViatura()`) ou tabelas sem o padrão de prefixo de 3 letras em inglês.
  - *Como fazer:* Todo o código (classes, métodos, funções, tipos, variáveis, constantes, hooks, componentes, arquivos `.ts`/`.tsx` e endpoints) deve ser em **inglês**, e o banco segue o padrão `<pre>_<singular_entity>` em inglês (`veh_vehicle`, `trp_trip`, `req_request`, com `veh_id AS id` no `SELECT`). Apenas TSDoc e mensagens ao usuário final ficam em português.
- **Usar valores mágicos (strings ou números soltos):**
  - *Erro:* `if (vehicle.state === '1')` ou `if (request.state === 'aprovada')` espalhados pelo código.
  - *Como fazer:* Defina union types literais em inglês em `UPPER_SNAKE_CASE` em `src/types/` (ex: `RequestState`, `TripState`, `ServiceCategory`, `UserRole`).
- **Usar `any` ou desativar o verificador de tipos (`@ts-ignore`):**
  - *Erro:* Tipar parâmetros, payloads HTTP ou retornos de banco como `any`.
  - *Como fazer:* Defina interfaces explícitas para DTOs de entrada, entidades de domínio e linhas retornadas pelo PostgreSQL (`QueryResultRow`).
- **Funções com comportamento duplo ou parâmetros booleanos de controle (Flag Arguments):**
  - *Erro:* `listTrips(includeCanceled = true, svoOnly = false)` que muda radicalmente a consulta.
  - *Como fazer:* Crie métodos coesos e com nomes explícitos em inglês no domínio (`listActiveTrips()`, `listSvoRequests()`).
- **Deixar código morto ou logs de depuração:**
  - *Erro:* Esquecer blocos comentados ou `console.log(req.body)` no código enviado para Pull Request — especialmente perigoso por expor dados sensíveis da FSPH/SVO nos logs.
  - *Como fazer:* Remova todo log de debug antes do commit.

---

## 3. Banco de Dados (PostgreSQL 18 e driver `pg`)

- **Interpolar variáveis em strings SQL (risco grave de SQL Injection):**
  - *Erro:* ``pool.query(`SELECT veh_id AS id, veh_identification AS identification FROM veh_vehicle WHERE veh_identification = '${identification}'`)``.
  - *Como fazer:* Use **sempre** queries parametrizadas com placeholders posicionais (`$1, $2`):
    ```typescript
    await pool.query(
      'SELECT veh_id AS id, veh_identification AS identification FROM veh_vehicle WHERE veh_identification = $1',
      [identification]
    );
    ```
- **Usar `SELECT *` ou vazar o prefixo de 3 letras para o JSON/TypeScript:**
  - *Erro:* `SELECT * FROM req_request` (expondo `req_id`, `req_origin` diretamente no frontend).
  - *Como fazer:* Liste explicitamente todas as colunas e projete aliases `camelCase` limpos (`req_id AS id`, `req_origin AS origin`, `usr_id_requester AS "requesterUserId"`).
- **Usar prefixos `idx_`, `uq_`, `trg_` ou `fn_` em objetos auxiliares do banco:**
  - *Erro:* Criar `idx_req_state` com o prefixo da tabela no meio.
  - *Como fazer:* Índices iniciam diretamente pelo prefixo de 3 letras da tabela (`<pre>_<descriptive_name>`, ex: `req_by_state`, `trp_vehicle_in_progress`), triggers e funções usam nomes descritivos em inglês sem `trg_`/`fn_` (`preserve`, `audit`, `_validate_trip()`, `create_trip()`), e views usam `vw_` (`vw_active_allocations`).
- **Filtrar registros em memória no Node.js:**
  - *Erro:* Buscar todas as linhas da tabela e aplicar `.filter()` no JavaScript.
  - *Como fazer:* Filtre e ordene diretamente no PostgreSQL com cláusulas `WHERE` sargáveis (que aproveitam índices) e paginação.
- **Esquecer de liberar o cliente do pool em transações manuais:**
  - *Erro:* Abrir `const client = await pool.connect()` e, após um erro no `catch`, sair da função sem liberar a conexão, esgotando o pool do PostgreSQL.
  - *Como fazer:* Sempre libere o cliente no bloco `finally`:
    ```typescript
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // operações...
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    ```
- **Ignorar concorrência ao ler, decidir e gravar:**
  - *Erro:* Fazer um `SELECT` simples para checar se a viatura está disponível e em seguida um `INSERT` de viagem sem transação/lock, permitindo alocação dupla simultânea.
  - *Como fazer:* Use transação com trava pessimista (`SELECT ... FROM veh_vehicle WHERE veh_id = $1 FOR UPDATE`) e validação de revisão (`<pre>_revision`).

---

## 4. Interface React 19 e Acessibilidade (WCAG 2.2 AA)

- **Criar inputs sem `<label>` associado ou com `id` fixo duplicado:**
  - *Erro:* `<input placeholder="Identificação" />` ou `<input id="vehicle-id" />` dentro de componente reutilizável.
  - *Como fazer:* Use sempre o hook `useId()` do React para vincular `<label htmlFor={id}>` ao `<input id={id}>` e `aria-describedby` às mensagens de erro.
- **Botões contendo apenas ícone sem nome acessível:**
  - *Erro:* `<button onClick={handleEdit}><EditIcon /></button>`.
  - *Como fazer:* Acompanhe o ícone com texto visível ou adicione `aria-label` contextualizando o registro em português (ex: `aria-label="Editar veículo de identificação VTR-01"`).
- **Remover o contorno de foco (`outline: none`) sem substituto:**
  - *Erro:* Apagar o indicador de foco no CSS, impedindo operadores da central e do SVO de navegarem por teclado (`Tab`).
  - *Como fazer:* Preserve ou estilize explicitamente o estado `:focus-visible` com alto contraste.
- **Depender exclusivamente de cor para transmitir status:**
  - *Erro:* Exibir apenas um círculo verde/vermelho para indicar o estado da viagem.
  - *Como fazer:* Combine cor com rótulo textual claro em português e ícone semântico (`StatusBadge`).
- **Omitir tratamento dos estados assíncronos da tela:**
  - *Erro:* Renderizar apenas o estado de sucesso, deixando a tela em branco durante o carregamento ou quando a lista vem vazia.
  - *Como fazer:* Trate sempre os 5 estados: *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial*.
