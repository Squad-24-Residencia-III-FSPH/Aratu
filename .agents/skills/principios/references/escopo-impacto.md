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
   dado (categoria do serviço, estado da solicitação, setor da FSPH), condicione pelo dado.
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
| **Condição pelo Dado (Padrão)** | Colunas no PostgreSQL (`state`, `category`, `sector_id`, `service_id`, `requires_triage`) | Diferenciar comportamentos com base nas características reais da entidade (ex: serviço com `requires_triage = true` exige confirmação de triagem antes de aprovar) |
| **Perfil de Acesso (RBAC)** | Middleware de autenticação/autorização no backend (`role`) e proteção de rotas no React | Controlar quem pode criar, visualizar, aprovar ou despachar viagens e registros do SVO |
| **Variáveis de Ambiente (`.env`)** | `backend/.env`, `docker-compose.yml` | Configurações de infraestrutura (conexão com o PostgreSQL, portas, segredos de tokens, URLs de serviços) |
| **Feature Flags / Chaves** | Não usar sem autorização expressa | Feature flags só entram sob demanda explícita da Squad para isolar entregas parciais |

---

### Os perfis reais do Sistema Aratu

Use os valores existentes em `auth.users.role`; aliases de outros sistemas ou perfis genéricos não fazem parte do contrato:

1. **`ADMINISTRADOR`:** mantém contas enquanto não há integração com o diretório corporativo e tem acesso amplo para manutenção/supervisão. Não é aprovador substituto nem etapa necessária das rotinas de frota ou SVO.
2. **`GESTOR`:** responde pela operação da frota e do SVO: veículos, motoristas, equipes e plantões, aprovação/alocação institucional, despacho e resolução da fila sem recurso.
3. **`SOLICITANTE`:** cria e acompanha pedidos institucionais próprios; corrige e reenvia pedidos devolvidos com observação, preservando versões e histórico.
4. **`MOTORISTA`:** consulta e executa viagens atribuídas à sua conta ativa, registrando início, hodômetro e conclusão.
5. **`ATENDENTE_SVO`:** recebe solicitações SVO da população, verifica informações e conclui a triagem administrativa; não mantém equipes, plantões ou viaturas.
6. **`EQUIPE_SVO`:** recebe e executa as ordens atribuídas à equipe, sem assumir a triagem de entrada nem a gestão da escala.

---

### Árvore de decisão para o Aratu

```
A diferença já está no dado que chega (state, category, sector_id, service_id)?
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

- **Criar chaves de configuração para regras triviais de UI:** Se um serviço exige triagem,
  valide pela coluna `requires_triage` no domínio, não crie uma flag `enable_triage_validation`.
- **Esquecer de validar o perfil no backend:** Proteger apenas a rota visual no React
  é falha de segurança; a autorização deve ser conferida obrigatoriamente no middleware do Express.
- **Assumir permissões de usuário:** Se a tarefa não deixa claro se um `REQUESTER`
  pode cancelar uma solicitação após ser aprovada, pergunte antes de implementar.
