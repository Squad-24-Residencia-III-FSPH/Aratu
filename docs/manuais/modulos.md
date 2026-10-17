# Módulos do Sistema — Aratu

Este documento apresenta o índice dos módulos funcionais do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

---

## 1. Mapa de Módulos Previstos

| # | Chave do Módulo | Nome Funcional | Perfis Operadores (RBAC) | Tabelas Principais (PostgreSQL 18) | Responsabilidade Principal |
|---|---|---|---|---|---|
| 1 | `AUTENTICACAO_RBAC` | Autenticação, Usuários e Setores | `ADMIN` (gestão) / Todos os perfis (acesso) | `usr_user`, `sec_sector`, `aud_audit` | Controle de sessão acessível, cadastro de servidores/setores e autorização baseada em papéis (`REQUESTER`, `MANAGER`, `OPERATOR`, `ADMIN`, `TRIAGE`). |
| 2 | `FROTA` | Gestão de Frota, Veículos e Serviços | `MANAGER`, `ADMIN`, `OPERATOR` | `veh_vehicle`, `srv_service`, `vhs_vehicle_service` | Cadastro de viaturas administrativas, ambulâncias e veículos de remoção do SVO; vínculo veículo × serviço, capacidade de assentos, limite de corpos e peso. |
| 3 | `MOTORISTAS` | Gestão de Motoristas e Escalas | `MANAGER`, `DRIVER`, `ADMIN` | `drv_driver` | Cadastro de condutores, controle de ativação/revisão, disponibilidade e escala operacional. |
| 4 | `VIAGENS` | Solicitações, Políticas e Viagens Institucionais | `REQUESTER`, `MANAGER`, `OPERATOR`, `DRIVER` | `req_request`, `rqv_request_version`, `rqe_request_event`, `apo_approval_policy`, `ape_policy_event`, `trp_trip`, `tre_trip_event`, `ral_request_allocation`, `rte_round_trip_event` | Fluxo completo de pedido de transporte institucional, versionamento, aprovação manual/automática, alocação concorrente em viagens, par ida e volta e registro de hodômetro. |
| 5 | `SVO` | Operações do Serviço de Verificação de Óbito | `OPERATOR`, `TRIAGE`, `MANAGER`, `ADMIN` | `req_request` (`'BODY'`), `fve_fulfillment_event`, `ral_request_allocation` | Triagem obrigatória, despacho prioritário de viatura de remoção cadavérica, eventos de atendimento (coleta, entrega, devolução) e sigilo operacional. |
| 6 | `MANUTENCOES` | Manutenção Preventiva e Corretiva | `MANAGER`, `ADMIN` | `mnt_maintenance`, `veh_vehicle` | Abertura e acompanhamento de ordens de serviço de manutenção, bloqueio automático de veículos indisponíveis e retorno à frota ativa. |

---

## 2. Documentação Detalhada por Módulo (`docs/modulos/`)

A documentação técnica e funcional aprofundada de cada módulo é mantida em formato HTML estático dentro do diretório `docs/modulos/`.

Atualmente, o repositório dispõe de um **documento genérico de referência e template** que deve ser utilizado como base sempre que um módulo do Aratu for documentado:

- 📄 **[`docs/modulos/EXEMPLO_MODULO.html`](../modulos/EXEMPLO_MODULO.html)** — Template padrão de documentação de módulo do Sistema Aratu.

### O que a documentação HTML de cada módulo deve cobrir

1. **Metadados do Módulo:** chave, diretórios no backend (`routes`, `controllers`, `services`, `repositories`) e no frontend (`pages`, `components`), perfis RBAC envolvidos e banco de dados (`PostgreSQL 18`).
2. **Visão Geral:** objetivo operacional no contexto da FSPH e do SVO.
3. **Regras de Negócio e Transições de Estado:** validações de domínio, invariantes de concorrência e referência aos métodos de `Service` em inglês (`ClassName::methodName`).
4. **Escopo de Impacto e Matriz RBAC:** o que cada perfil (`ADMIN`, `MANAGER`, `OPERATOR`, `REQUESTER`, `TRIAGE`, `DRIVER`) pode visualizar ou executar no módulo.
5. **Tabelas do Banco de Dados (PostgreSQL 18):** estrutura das tabelas no padrão de prefixo de 3 letras em inglês (`<pre>_<singular_entity>`), chaves primárias (`<pre>_id`), chaves estrangeiras (`<ref_pre>_id`) e índices (`<pre>_<descriptive_name>`).
6. **Contratos de API REST (Backend Express 5):** endpoints em inglês (`/api/<entities>`), métodos HTTP, payloads (`camelCase` sem prefixo de 3 letras) e códigos de resposta.
7. **Interface e Acessibilidade (Frontend React 19):** páginas, componentes reutilizados, tratamento dos 5 estados visuais e critérios da **WCAG 2.2 Nível AA**.
8. **Dependências, Integrações e Proteção de Dados (LGPD / Sigilo SVO).**

---

## 3. Criação e Extensibilidade de Novos Módulos

Para adicionar um novo módulo ao Sistema Aratu (ex: `ABASTECIMENTO`, `MULTAS`, `REGULACAO`), siga o roteiro de 7 passos e os padrões de escalabilidade e parametrização dinâmica documentados em:

👉 **[`docs/manuais/escalabilidade-extensibilidade.md`](escalabilidade-extensibilidade.md)**
