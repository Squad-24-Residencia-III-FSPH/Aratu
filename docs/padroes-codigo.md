# Padrões de Codificação e Clean Code — Sistema Aratu

Este documento estabelece as convenções de escrita de código, nomenclatura, tipagem e boas práticas de engenharia para todo o código TypeScript, React 19 e SQL (PostgreSQL 18) do **Sistema Aratu**.

---

## 1. Ordem de Precedência dos Princípios

Em qualquer decisão técnica ou refatoração, os princípios do projeto valem nesta exata ordem:

1. **Padrões do Projeto Aratu:** a convenção existente na camada (`routes`, `controllers`, `services`, `repositories`, `components`, `pages`) vence preferências individuais.
2. **Escopo de Impacto (RBAC e Dados):** condicione comportamentos pelo dado de domínio existente ou pelo perfil RBAC. Não crie feature flags sem autorização expressa.
3. **Compatibilidade de Dados e Contratos:** preserve contratos JSON entre frontend e backend e respeite dados históricos já gravados no PostgreSQL.
4. **Idempotência e Atomicidade:** operações críticas não duplicam registros ao serem reenviadas e utilizam transações (`BEGIN ... COMMIT / ROLLBACK`).
5. **YAGNI (*You Aren't Gonna Need It*):** não implemente parâmetros, colunas ou abstrações especulativas.
6. **DRY (*Don't Repeat Yourself*):** cada regra de negócio mora em um único lugar (`Service`, helper ou componente UI compartilhado).
7. **SOLID com pragmatismo:** responsabilidade única e baixo acoplamento sem criar camadas artificiais (*over-engineering*).
8. **KISS (*Keep It Simple, Stupid*):** entre duas soluções corretas, escolha a mais direta e legível em manutenção sob pressão.
9. **Clean Code:** vocabulário claro do domínio de frotas e saúde (FSPH / SVO), tipagem estrita e zero código morto.

---

## 2. Convenções de Nomenclatura

Não utilizamos notação húngara (prefixos de tipo como `sNome` ou `iIdade`), pois o **TypeScript estrito** já garante a verificação estática de tipos.

| Elemento | Convenção | Exemplos no Domínio Aratu |
|---|---|---|
| **Variáveis e parâmetros** | `camelCase` (substantivos descritivos) | `veiculoDisponivel`, `quilometragemInicial`, `solicitacaoViagem` |
| **Booleanos** | `camelCase` com prefixo `is`, `has`, `can`, `should` ou equivalente em português (`esta`, `possui`, `pode`) | `isDisponivel`, `hasCnhValida`, `podeAprovarViagem` |
| **Funções e métodos** | `camelCase` (verbo + substantivo no domínio) | `alocarViatura()`, `registrarSaidaViagem()`, `liberarCorpoSvo()` |
| **Classes, Interfaces, Types e Enums** | `PascalCase` | `ViagemService`, `VeiculoRepository`, `StatusSolicitacao`, `CriarChamadoSvoInput` |
| **Componentes React** | `PascalCase` | `StatusBadge`, `TextInput`, `FormularioSolicitacaoViagem` |
| **Hooks customizados React** | `camelCase` iniciando com `use` | `useVeiculosDisponiveis`, `useAutenticacao` |
| **Constantes globais / limites** | `UPPER_SNAKE_CASE` | `TAMANHO_MINIMO_ALVO_PX`, `LIMITE_PAGINACAO_PADRAO` |
| **Arquivos Backend** | `kebab-case` ou `<entidade>.<camada>.ts` | `veiculo.service.ts`, `veiculo.controller.ts`, `veiculo.repository.ts` |
| **Arquivos de Componentes React** | `PascalCase.tsx` | `StatusBadge.tsx`, `ModalConfirmacao.tsx` |
| **Tabelas PostgreSQL** | `snake_case` no plural | `veiculos`, `solicitacoes_viagem`, `registros_svo`, `manutencoes` |
| **Colunas PostgreSQL** | `snake_case` sem prefixo de tabela; FKs como `<entidade_singular>_id` | `id`, `placa`, `veiculo_id`, `motorista_id`, `data_saida`, `created_at` |

---

## 3. Regras para Funções, Métodos e Tipagem TypeScript

- **Tipagem explícita e estrita:**
  - Declare explicitamente os tipos de todos os parâmetros e o tipo de retorno de funções/métodos públicos (`Promise<Veiculo>`, `boolean`, `void`).
  - É proibido utilizar `any`. Quando o tipo de uma entrada externa ainda não foi validado (ex: bloco `catch` ou payload bruto), utilize `unknown` e faça o estreitamento de tipo (*type narrowing*).
- **Responsabilidade Única e Tamanho:**
  - Uma função deve fazer apenas uma coisa e ter apenas um motivo para mudar.
  - Utilize *Early Return* (cláusulas de guarda no início da função) para evitar aninhamento de `if/else` com mais de 2 ou 3 níveis de indentação.
- **Sem valores mágicos:**
  - Estados de viagem (`pendente`, `aprovada`, `em_andamento`, `concluida`, `cancelada`), tipos de veículo e perfis de usuário devem ser representados por union types ou constantes tipadas.
- **Tratamento de Exceções:**
  - Nunca engula exceções com blocos `catch {}` vazios.
  - Lance erros com mensagens claras que expliquem o motivo da falha no domínio e orientem o próximo passo.

---

## 4. Comentários e Documentação no Código (TSDoc)

- **Guia oficial de DocBlocks:** siga rigorosamente as diretrizes e exemplos de [`docs/padroes-docblocks.md`](padroes-docblocks.md).
- **Código autoexplicativo primeiro:** se você precisa de um comentário para explicar *o que* uma variável ou função faz, renomeie a variável ou extraia uma função com nome melhor.
- **Comente o "porquê", não o "o quê":** use blocos TSDoc (`/** ... */`) para registrar regras de negócio não óbvias da FSPH/SVO, restrições de concorrência (ex: motivo de um `SELECT ... FOR UPDATE`), exceções lançadas (`@throws`) e critérios de acessibilidade em componentes React.
- **Não duplique tipagem:** é proibido usar `@param {tipo}` ou `@author` / `@since` (o Git já rastreia histórico e autoria).
- **Regra do Escoteiro:** ao alterar um arquivo existente, deixe-o mais limpo, bem tipado e documentado conforme [`docs/padroes-docblocks.md`](padroes-docblocks.md).
