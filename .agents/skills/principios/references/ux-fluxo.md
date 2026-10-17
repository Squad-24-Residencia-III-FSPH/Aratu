# UX — decisão de fluxo, antes de codar

Material de consulta da skill `principios`, par de `ui-componentes.md`. A
divisão entre os dois é por **momento**, não por assunto:

- **este arquivo:** decisão. Quem usa, para quê, em que ordem, como descobre o
  que fazer, como sabe que deu certo, o que confirma e **quais palavras a tela diz**.
  Serve ao *plano*: leia antes de escrever código e quando o pedido envolver fluxo novo ou alterado.
- **`ui-componentes.md`:** execução. Qual componente React, quais props, estrutura
  acessível e tratamento de eventos. Leia na hora de implementar a tela.

Na dúvida sobre qual ler: se a pergunta começa com *"deveria"*, é este. Se
começa com *"como"*, é o outro. Cada arquivo tem a sua lista. **Não repita a do outro**.

Acessibilidade tem arquivo próprio, `references/acessibilidade.md` (WCAG 2.2 nível AA),
porque atravessa os dois momentos. Três critérios são **decisão de fluxo** e entram
no plano junto com o desenho: **3.3.7 Entrada Redundante (A)** (não pedir de novo dado já
informado no fluxo); **3.2.6 Ajuda Consistente (A)** (ajuda no mesmo lugar em todas as telas);
e **3.3.8 Autenticação Acessível (AA)** (login sem testes cognitivos ou bloqueio de colar senha).

A primeira seção descreve as diretrizes universais de IHC e design de interação.
A segunda detalha os fluxos operacionais e perfis do **Sistema Aratu** (FSPH e SVO).

---

## Quando este arquivo é obrigatório

- Tela nova, ou fluxo novo em tela existente;
- Mudança na ordem dos passos, nos campos obrigatórios ou no que o usuário confirma;
- Ação crítica, destrutiva ou de impacto operacional (cancelamento de viagem, baixa de veículo, registro de óbito no SVO);
- Listagem, filtros combinados, relatórios operacionais ou exportações;
- Definição de textos visuais de botões, confirmações, mensagens de erro ou sucesso.

Não é obrigatório em tarefas de backend puro sem impacto no fluxo de uso.

---

## De fora para dentro

O fluxo deve ser concebido a partir da tarefa real que a pessoa executa, e não a
partir da estrutura das tabelas do banco de dados:

1. **O objetivo da pessoa usuária:** em uma frase clara no domínio da saúde e frotas.
   Exemplo: *"O solicitante quer pedir um transporte para levar medicamentos do Lacen ao HUSE às 14h."*
   (Nunca: *"Inserir registro na tabela req_request com estado SUBMITTED"*).
2. **Os cenários de uso:** o caminho principal (fluxo feliz) e os desvios operacionais,
   no formato *Dado / Quando / Então*.
3. **A tela e os passos:** o que aparece em cada etapa, os textos de orientação,
   a affordance dos botões e a resposta imediata de cada ação.
4. **O contrato com a API REST:** quais dados o frontend envia, quais recebe e
   quais códigos de erro precisa tratar visualmente.
5. **A regra de negócio e a persistência:** por último, desenhadas para atender ao contrato.

**Sinais de desenho incorreto (de dentro para fora):**
- A tela é uma cópia literal das colunas da tabela SQL;
- As mensagens de erro exibem jargões técnicos ou nomes de campos do banco;
- Um botão de ação existe apenas porque existe um método no backend, sem fazer sentido na rotina do usuário.

---

## Requisitos de IHC — o que definir antes da tela

- **Perfil:** Quem é a pessoa usuária (solicitante da FSPH, motorista, gestor de frota, equipe do SVO)?
- **Contexto de uso:**
  - O motorista opera em smartphone ou tablet no pátio ou em trânsito, muitas vezes sob sol forte
    ou em iluminação precária. Exige alvos de toque grandes (mínimo 44×44px), alto contraste e passos rápidos.
  - O gestor na central opera em desktop com teclado e mouse, necessitando de tabelas densas,
    filtros ágeis e visão ampla da frota.
  - A equipe do SVO lida com situações delicadas de acolhimento e liberação de corpos, exigindo
    máxima clareza, respeito e prevenção rigorosa de erros em laudos e identificação.
- **Qualidade de uso prioritária:**
  - *Segurança no uso:* Ações irreversíveis (ex: cancelar chamado em andamento, liberar corpo,
    registrar avaria crítica) exigem confirmação explícita com o resumo do impacto.
  - *Eficiência:* Rotinas diárias de despacho exigem o menor número de cliques e foco rápido por teclado.
  - *Facilidade de aprendizado:* Telas de solicitação esporádica de viagens por servidores devem
    ser autoexplicativas, sem necessidade de treinamento complexo.

---

## Affordance e UX Writing

### Affordance dos Controles
- **Explícita:** Botões com texto claro informando verbo e objeto: `"Solicitar Viagem"`, `"Aprovar Alocação"`, `"Registrar Saída"`.
- **Prevenção de cliques acidentais:** Botões de ações perigosas (ex: `"Cancelar Viagem"`)
  devem ter estilo visual secundário ou de perigo, posicionados de forma distanciada
  do botão de salvar/confirmar.
- **Ícones sozinhos são proibidos:** Sempre acompanhe ícones com texto descritivo
  ou forneça `aria-label` inequívoco para tecnologias assistivas.

### Textos de Mensagens e Confirmações
- **Mensagem de sucesso informativa:** Deve dizer **o quê** foi feito e **onde** acompanhar.
  Exemplo: *"Viagem #1042 solicitada com sucesso. O acompanhamento está disponível em Minhas Solicitações."*
  (Evite apenas: *"Operação realizada"*).
- **Mensagem de erro orientadora:** Diga qual foi o problema e **qual o próximo passo**.
  Exemplo: *"A viatura selecionada já possui uma viagem agendada para este horário. Escolha outro veículo ou ajuste o horário."*
- **Confirmação de ação destrutiva:** A pergunta deve declarar o objeto afetado:
  *"Tem certeza que deseja cancelar a solicitação de viagem para o HUSE? Essa ação não pode ser desfeita."*
  Botões: `[Sim, cancelar viagem]` e `[Manter solicitação]` (nunca botões ambíguos como `[OK]` e `[Cancelar]`).

---

## Aratu — os três fluxos operacionais centrais

### 1. Gestão de Viagens Institucionais (FSPH)
1. **Solicitação:** Setor solicitante cadastra destino, justificativa, número de passageiros e data/hora.
2. **Análise e Alocação:** Gestor de frota verifica disponibilidade, aloca viatura e motorista, e aprova.
3. **Execução:** Motorista confere checklist inicial, registra km de saída e, no retorno, informa km final e intercorrências.
4. **Finalização:** Registro do encerramento da viagem e liberação da viatura para a frota.

### 2. Operações do SVO (Serviço de Verificação de Óbito)
1. **Acionamento:** Registro do chamado de óbito, local de remoção e dados preliminares.
2. **Despacho:** Envio de viatura de remoção cadavérica e equipe técnica.
3. **Custódia e Procedimentos:** Entrada do corpo na unidade, registro de pertences, realização do laudo/necropsia.
4. **Liberação Formal:** Liberação do corpo para a família ou serviço funerário com protocolo assinado e absoluto sigilo.

### 3. Gestão e Manutenção da Frota
1. **Cadastro e Monitoramento:** Consulta de veículos por placa, modelo, status e quilometragem atual.
2. **Manutenção:** Abertura de ordens de serviço (preventiva ou corretiva), bloqueando temporariamente o veículo para novas viagens.
3. **Retorno à Operação:** Registro de conclusão da manutenção e liberação do veículo para a frota ativa.
