# Módulos do Sistema — Aratu

Este documento apresenta o índice dos módulos funcionais do **Aratu — Sistema de Gestão de Frota e Operações**, desenvolvido pela **Squad 24** para a **Fundação de Saúde Parreiras Horta (FSPH)** e o **Serviço de Verificação de Óbito (SVO)**.

---

## 1. Mapa de Módulos Previstos

| # | Chave do Módulo | Nome Funcional | Perfis Operadores (RBAC) | Responsabilidade Principal |
|---|---|---|---|---|
| 1 | `AUTENTICACAO_RBAC` | Autenticação, Usuários e Perfis | Administrador (gestão) / Todos os perfis (acesso) | Controle de sessão acessível, cadastro de servidores/setores e autorização baseada em perfis (RBAC). |
| 2 | `FROTA` | Gestão de Frota e Veículos | Gestor de Frota, Administrador, Motorista (consulta) | Cadastro de viaturas administrativas, ambulâncias e veículos de remoção do SVO; controle de status, capacidade e hodômetro. |
| 3 | `MOTORISTAS` | Gestão de Motoristas e Escalas | Gestor de Frota, Motorista, Administrador | Cadastro de condutores, validação de categoria e vencimento de CNH, controle de disponibilidade e escala operacional. |
| 4 | `VIAGENS` | Solicitações e Viagens Institucionais | Solicitante FSPH, Gestor de Frota, Motorista | Fluxo completo de pedido de transporte institucional, aprovação, alocação concorrente de viatura/motorista, checklist e registro de quilometragem de saída/retorno. |
| 5 | `SVO` | Operações do Serviço de Verificação de Óbito | Equipe SVO, Motorista (remoção), Administrador | Registro de chamados de óbito, despacho prioritário de viatura de remoção cadavérica, custódia, procedimentos/laudos e liberação formal com sigilo. |
| 6 | `MANUTENCOES` | Manutenção Preventiva e Corretiva | Gestor de Frota, Administrador | Abertura e acompanhamento de ordens de serviço de manutenção, bloqueio automático de veículos indisponíveis e retorno à frota ativa. |

---

## 2. Documentação Detalhada por Módulo (`docs/modulos/`)

A documentação técnica e funcional aprofundada de cada módulo é mantida em formato HTML estático dentro do diretório `docs/modulos/`.

Atualmente, o repositório dispõe de um **documento genérico de referência e template** que deve ser utilizado como base sempre que um módulo do Aratu for documentado:

- 📄 **[`docs/modulos/EXEMPLO_MODULO.html`](modulos/EXEMPLO_MODULO.html)** — Template padrão de documentação de módulo do Sistema Aratu.

### O que a documentação HTML de cada módulo deve cobrir

1. **Metadados do Módulo:** chave, diretórios no backend (`routes`, `controllers`, `services`, `repositories`) e no frontend (`pages`, `components`), perfis RBAC envolvidos e banco de dados (`PostgreSQL 18`).
2. **Visão Geral:** objetivo operacional no contexto da FSPH e do SVO.
3. **Regras de Negócio e Transições de Estado:** validações de domínio, invariantes de concorrência e referência aos métodos de `Service`.
4. **Escopo de Impacto e Matriz RBAC:** o que cada perfil pode visualizar ou executar no módulo.
5. **Tabelas do Banco de Dados (PostgreSQL 18):** estrutura das tabelas (`snake_case` plural), chaves primárias, chaves estrangeiras (`ON DELETE RESTRICT`) e índices.
6. **Contratos de API REST (Backend Express 5):** endpoints, métodos HTTP, payloads e códigos de resposta.
7. **Interface e Acessibilidade (Frontend React 19):** páginas, componentes reutilizados, tratamento dos 5 estados visuais e critérios da **WCAG 2.2 Nível AA**.
8. **Dependências, Integrações e Proteção de Dados (LGPD / Sigilo SVO).**
