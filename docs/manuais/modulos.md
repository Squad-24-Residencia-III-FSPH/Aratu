# Módulos do Sistema — Aratu

Este documento apresenta o índice dos módulos funcionais do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

---

## 1. Mapa de Módulos Previstos

| # | Chave do Módulo | Nome Funcional | Perfis Operadores (RBAC) | Tabelas Principais (PostgreSQL 18) | Responsabilidade Principal |
|---|---|---|---|---|---|
| 1 | `AUTENTICACAO_RBAC` | Autenticação, Usuários e Setores | `ADMINISTRADOR` (gestão) / Todos os perfis (acesso) | `auth.users`, `auth.sectors`, `audit.logs` | Controle de sessão acessível, cadastro de servidores/setores e autorização baseada em papéis (`ADMINISTRADOR`, `GESTOR`, `SOLICITANTE`, `MOTORISTA`, `ATENDENTE_SVO`, `EQUIPE_SVO`). |
| 2 | `FROTA` | Gestão de Frota, Veículos e Serviços | `GESTOR`, `ADMINISTRADOR`, `ATENDENTE_SVO` | `fleet.vehicles`, `fleet.services`, `fleet.vehicle_services` | Cadastro de viaturas administrativas, ambulâncias e veículos de remoção do SVO; vínculo veículo × serviço, capacidade de assentos, limite de corpos e peso. |
| 3 | `MOTORISTAS` | Gestão de Motoristas e Escalas | `GESTOR`, `MOTORISTA`, `ADMINISTRADOR` | `fleet.drivers` | Cadastro de condutores, controle de ativação/revisão, disponibilidade e escala operacional. |
| 4 | `VIAGENS` | Solicitações, Políticas e Viagens Institucionais | `SOLICITANTE`, `GESTOR`, `MOTORISTA` | `trip.requests`, `trip.approval_policies`, `trip.trips`, `trip.allocations` | Fluxo completo de pedido de transporte institucional, versionamento, aprovação manual/automática, alocação concorrente em viagens, par ida e volta e registro de hodômetro. |
| 5 | `SVO` | Operações do Serviço de Verificação de Óbito | `ATENDENTE_SVO`, `EQUIPE_SVO`, `GESTOR`, `ADMINISTRADOR` | `svo.occurrences`, `svo.custody_records`, `svo.release_orders` | Triagem obrigatória, despacho prioritário de viatura de remoção cadavérica, eventos de atendimento (coleta, custódia, laudo, liberação) e sigilo operacional estrito. |
| 6 | `MANUTENCOES` | Manutenção Preventiva e Corretiva | `GESTOR`, `ADMINISTRADOR` | `fleet.maintenance_orders`, `fleet.vehicles` | Abertura e acompanhamento de ordens de serviço de manutenção, bloqueio automático de veículos indisponíveis e retorno à frota ativa. |

---

## 2. Documentação Detalhada por Módulo (`docs/modulos/`)

A documentação técnica e funcional aprofundada de cada módulo é mantida em formato HTML estático dentro do diretório `docs/modulos/`.

Atualmente, o repositório dispõe de um **documento genérico de referência e template** que deve ser utilizado como base sempre que um módulo do Aratu for documentado:

- 📄 **[`docs/modulos/EXEMPLO_MODULO.html`](../modulos/EXEMPLO_MODULO.html)** — Template padrão de documentação de módulo do Sistema Aratu.

### O que a documentação HTML de cada módulo deve cobrir

1. **Metadados do Módulo:** chave, diretórios no backend (`routes`, `controllers`, `services`, `repositories`) e no frontend (`pages`, `components`), perfis RBAC envolvidos e banco de dados (`PostgreSQL 18`).
2. **Visão Geral:** objetivo operacional no contexto da FSPH e do SVO.
3. **Regras de Negócio e Transições de Estado:** validações de domínio, invariantes de concorrência e referência aos métodos de `Service` em inglês (`ClassName::methodName`).
4. **Escopo de Impacto e Matriz RBAC:** o que cada perfil pode visualizar ou executar no módulo.
5. **Tabelas do Banco de Dados (PostgreSQL 18):** estrutura das tabelas qualificadas no schema nativo em inglês no plural (`<schema>.<plural_entity>`), chaves primárias (`id`), chaves estrangeiras (`<entity>_id`) e índices (`<schema>_<table>_<purpose>`).
6. **Contratos de API REST (Backend Express 5):** endpoints em inglês (`/api/<entities>`), métodos HTTP, payloads (`camelCase` sem prefixos de banco) e códigos de resposta.
7. **Interface e Acessibilidade (Frontend React 19):** páginas, componentes reutilizados, tratamento dos 5 estados visuais e critérios da **WCAG 2.2 Nível AA**.
8. **Dependências, Integrações e Proteção de Dados (LGPD / Sigilo SVO).**

---

## 3. Criação e Extensibilidade de Novos Módulos

Para adicionar um novo módulo ao Sistema Aratu (ex: `ABASTECIMENTO`, `MULTAS`, `REGULACAO`), siga o roteiro de 7 passos e os padrões de escalabilidade e parametrização dinâmica documentados em:

👉 **[`docs/manuais/escalabilidade-extensibilidade.md`](escalabilidade-extensibilidade.md)**
