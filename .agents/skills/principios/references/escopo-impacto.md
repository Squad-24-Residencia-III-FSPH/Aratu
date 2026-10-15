# Escopo de impacto — árvore de decisão

Material de consulta do princípio 2 da skill `principios`. Leia quando a tarefa
mudar comportamento que mais de um perfil de usuário, setor da FSPH ou chamador
enxerga — e a pergunta for *por qual mecanismo a diferença deve ser expressa*.

A primeira seção descreve as quatro perguntas universais. A segunda detalha
os mecanismos de impacto e os perfis do **Sistema Aratu** (FSPH e SVO).

---

## As quatro perguntas, antes de escolher qualquer mecanismo

1. **Quem vê o comportamento novo?** Todos os usuários, apenas gestores de frota,
   motoristas, equipe do SVO ou solicitantes? Se o pedido não disser, isso é
   **pergunta ao usuário**.
2. **A diferença é de dado ou de regra?** Se o que separa os casos já está no
   dado (tipo de veículo, status da solicitação, setor da FSPH), condicione pelo dado.
   Não existe mecanismo de configuração melhor do que a informação já existente no domínio.
3. **O projeto já tem mecanismo para essa diferença?** Use o que existe (ex: controle
   de acesso RBAC por perfis, variáveis de ambiente `.env`). Mecanismo novo para um
   único caso é complexidade desnecessária.
4. **Quem liga e desliga isso depois?** Se a resposta for "ninguém, é definitivo",
   não crie chave ou interruptor.

Regra de corte: **comportamento que deveria valer para todos não ganha chave.**
Correção de bug vale para todo o sistema. Chave de configuração para esconder
correção é débito técnico.

---

## Aratu — mecanismos de impacto e perfis de acesso

O Aratu atende às necessidades operacionais da **Fundação de Saúde Parreiras Horta (FSPH)**
e do **Serviço de Verificação de Óbito (SVO)**.

| Mecanismo | Onde reside | Para que serve |
|---|---|---|
| **Condição pelo Dado (Padrão)** | Colunas no PostgreSQL (`status`, `tipo_veiculo`, `unidade_solicitante`, `tipo_servico`) | Diferenciar comportamentos com base nas características reais da entidade (ex: ambulância exige checklist específico; veículo administrativo não) |
| **Perfil de Acesso (RBAC)** | Middleware de autenticação/autorização no backend e proteção de rotas no React | Controlar quem pode criar, visualizar, aprovar ou despachar viagens e registros do SVO |
| **Variáveis de Ambiente (`.env`)** | `backend/.env`, `docker-compose.yml` | Configurações de infraestrutura (conexão com o PostgreSQL, portas, segredos de tokens, URLs de serviços) |
| **Feature Flags / Chaves** | Não usar sem autorização expressa | Feature flags só entram sob demanda explícita da Squad para isolar entregas parciais |

---

### Os perfis de usuário do sistema

1. **Administrador:** Acesso global para parametrização do sistema, cadastro de unidades e usuários.
2. **Gestor de Frota / Aprovador:** Avalia solicitações de viagem, aprova/recusa, aloca veículos e motoristas, monitora manutenções e indicadores operacionais.
3. **Solicitante de Viagem (FSPH):** Cria e acompanha pedidos de transporte institucional para sua respectiva unidade/setor.
4. **Motorista:** Acessa escala de viagens atribuídas, registra quilometragem inicial/final, realiza checklists de saída/chegada e informa abastecimentos/intercorrências.
5. **Operador / Equipe SVO:** Gerencia chamados de verificação de óbito, despacho de viaturas de remoção cadavérica, laudos e liberação de corpos com sigilo absoluto.

---

### Árvore de decisão para o Aratu

```
A diferença já está no dado que chega (status, tipo de veículo, setor)?
├─ SIM → Condicione pelo dado no Service. Fim. Nenhum mecanismo novo.
└─ NÃO
   ├─ É uma restrição de quem pode executar a ação?
   │  └─ Utilize a verificação de Perfil (RBAC) no middleware de autorização.
   ├─ É um parâmetro de infraestrutura/ambiente (porta, URL, segredo)?
   │  └─ Configure via variável de ambiente (.env e docker-compose.yml).
   └─ É uma funcionalidade experimental ou entrega faseada?
      └─ PARE. Pergunte ao usuário e confirme se uma feature flag é necessária.
```

---

## Erros comuns já evitados

- **Criar chaves de configuração para regras triviais de UI:** Se um campo precisa
  de validação de CNH válida para motoristas, valide no domínio, não crie uma flag
  `habilitar_validacao_cnh`.
- **Esquecer de validar o perfil no backend:** Proteger apenas a rota visual no React
  é falha de segurança; a autorização deve ser conferida obrigatoriamente no middleware do Express.
- **Assumir permissões de usuário:** Se a tarefa não deixa claro se um Solicitante
  pode cancelar uma viagem após ser aprovada, pergunte antes de implementar.
