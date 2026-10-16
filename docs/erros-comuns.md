# Erros Comuns de Codificação a Evitar — Sistema Aratu

Este guia reúne os antipadrões técnicos e de domínio mais frequentes e como preveni-los no **Sistema Aratu**, alinhado aos princípios **DRY, SOLID, KISS, YAGNI, Clean Code** e **WCAG 2.2 Nível AA**.

---

## 1. Arquitetura e Camadas

- **Colocar regra de negócio em Controllers do Express ou Componentes React:**
  - *Erro:* Calcular disponibilidade de viatura, validar vencimento de CNH ou decidir transição de status do SVO dentro de `src/controllers/` ou `src/pages/`.
  - *Como fazer:* A borda apenas traduz HTTP/UI. Toda regra de domínio mora exclusivamente em `backend/src/services/`.
- **Acessar o banco de dados fora da camada de Repositório:**
  - *Erro:* Importar o `pool` do `pg` e rodar SQL diretamente em um controller ou service.
  - *Como fazer:* Encapsule todas as queries SQL em `backend/src/repositories/` (ou `src/database/`).
- **Validação crítica apenas no Frontend:**
  - *Erro:* Confiar apenas no atributo `required` do HTML ou na validação do estado React para bloquear ações inválidas ou restritas por perfil.
  - *Como fazer:* O frontend guia o usuário; o backend **obrigatoriamente** revalida payloads, regras de domínio e permissões RBAC no middleware/service.
- **Criar ciclos de dependência entre módulos:**
  - *Erro:* `ViagemService` importa `VeiculoService` e `VeiculoService` importa `ViagemService`.
  - *Como fazer:* Extraia a regra coordenada para um serviço orquestrador ou compartilhe apenas tipos/contratos em `src/types/`.

---

## 2. TypeScript e Clean Code

- **Usar valores mágicos (strings ou números soltos):**
  - *Erro:* `if (veiculo.status === '1')` ou `if (chamado.prioridade === 'alta')` espalhados pelo código.
  - *Como fazer:* Defina tipos literais, `as const` ou `enum` em `src/types/` (ex: `StatusVeiculo`, `StatusSolicitacaoViagem`, `PerfilUsuario`).
- **Usar `any` ou desativar o verificador de tipos (`@ts-ignore`):**
  - *Erro:* Tipar parâmetros, payloads HTTP ou retornos de banco como `any`.
  - *Como fazer:* Defina interfaces explícitas para DTOs de entrada, entidades de domínio e linhas retornadas pelo PostgreSQL (`QueryResultRow`).
- **Funções com comportamento duplo ou parâmetros booleanos de controle (Flag Arguments):**
  - *Erro:* `listarViagens(incluirCanceladas = true, apenasSvo = false)` que muda radicalmente a consulta.
  - *Como fazer:* Crie métodos coesos e com nomes explícitos no domínio (`listarViagensAtivas()`, `listarChamadosSvo()`).
- **Deixar código morto ou logs de depuração:**
  - *Erro:* Esquecer blocos comentados ou `console.log(req.body)` no código enviado para Pull Request — especialmente perigoso por expor dados sensíveis da FSPH/SVO nos logs.
  - *Como fazer:* Remova todo log de debug antes do commit.

---

## 3. Banco de Dados (PostgreSQL 18 e driver `pg`)

- **Interpolar variáveis em strings SQL (risco grave de SQL Injection):**
  - *Erro:* ``pool.query(`SELECT id, placa FROM veiculos WHERE placa = '${placa}'`)``.
  - *Como fazer:* Use **sempre** queries parametrizadas com placeholders posicionais (`$1, $2`):
    ```typescript
    await pool.query('SELECT id, placa FROM veiculos WHERE placa = $1', [placa]);
    ```
- **Usar `SELECT *` em consultas:**
  - *Erro:* `SELECT * FROM solicitacoes_viagem`.
  - *Como fazer:* Liste explicitamente todas as colunas necessárias para reduzir tráfego de rede, habilitar *Index Only Scan* e proteger contratos.
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
  - *Como fazer:* Use transação com trava pessimista (`SELECT ... FROM veiculos WHERE id = $1 FOR UPDATE`).

---

## 4. Interface React 19 e Acessibilidade (WCAG 2.2 AA)

- **Criar inputs sem `<label>` associado ou com `id` fixo duplicado:**
  - *Erro:* `<input placeholder="Placa" />` ou `<input id="placa" />` dentro de componente reutilizável.
  - *Como fazer:* Use sempre o hook `useId()` do React para vincular `<label htmlFor={id}>` ao `<input id={id}>` e `aria-describedby` às mensagens de erro.
- **Botões contendo apenas ícone sem nome acessível:**
  - *Erro:* `<button onClick={editar}><EditIcon /></button>`.
  - *Como fazer:* Acompanhe o ícone com texto visível ou adicione `aria-label` contextualizando o registro (ex: `aria-label="Editar veículo placa ABC-1234"`).
- **Remover o contorno de foco (`outline: none`) sem substituto:**
  - *Erro:* Apagar o indicador de foco no CSS, impedindo operadores da central e do SVO de navegarem por teclado (`Tab`).
  - *Como fazer:* Preserve ou estilize explicitamente o estado `:focus-visible` com alto contraste.
- **Depender exclusivamente de cor para transmitir status:**
  - *Erro:* Exibir apenas um círculo verde/vermelho para indicar se o veículo está disponível ou em manutenção.
  - *Como fazer:* Combine cor com rótulo textual claro e ícone semântico (`StatusBadge`).
- **Omitir tratamento dos estados assíncronos da tela:**
  - *Erro:* Renderizar apenas o estado de sucesso, deixando a tela em branco durante o carregamento ou quando a lista vem vazia.
  - *Como fazer:* Trate sempre os 5 estados: *Ideal*, *Carregando (`aria-busy="true"`)*, *Vazio*, *Erro* e *Parcial*.
