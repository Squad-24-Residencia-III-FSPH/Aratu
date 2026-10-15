# Acessibilidade — WCAG 2.2 nível AA no Sistema Aratu

Material de consulta da skill `principios`, terceiro documento do trio de interface
junto com `ux-fluxo.md` (decisão) e `ui-componentes.md` (execução). Acessibilidade
atravessa tanto o desenho de fluxos quanto a marcação de componentes em React.

**Alvo adotado: WCAG 2.2 nível AA como piso inegociável.**
Se algum edital, convênio ou normativa exigir nível diferente (ex: AAA), isso é
**pergunta ao usuário** — nunca premissa deduzida.

---

## Quando ler este arquivo

**Leia sempre que o resultado da tarefa for lido ou operado por uma pessoa**,
inclusive quando o código alterado for no backend Express:

- Qualquer tela, campo, botão, modal, card ou formulário em React;
- **Mensagens de erro e validações originadas no backend:** são lidas pelo usuário
  em momentos críticos;
- **Relatórios operacionais e exportações (PDF/planilhas):** contraste, tamanho de
  fonte e não depender exclusivamente de cores valem também no papel e em telas gerenciais;
- **Tempo de sessão e autenticação:** expiração de token que apaga dados de formulário
  já preenchidos viola o critério 2.2.1;
- **Login e recuperação de acesso:** exigências que bloqueiem colar senha ou que imponham
  testes cognitivos complexos violam o critério 3.3.8.

Não é necessário ler em: refatorações internas sem impacto no usuário, ajustes de performance
em queries SQL, migrations sem saída visual ou configuração de Docker.

---

## O contexto operacional real da FSPH e do SVO

O Aratu atende aos servidores da **Fundação de Saúde Parreiras Horta (FSPH)** e às
equipes do **Serviço de Verificação de Óbito (SVO)**. Isso impõe requisitos concretos de acessibilidade:

1. **Uso em campo e no pátio por motoristas:**
   - Telas operadas em smartphones ou tablets sob incidência direta de luz solar ou durante
     remoções noturnas em locais com iluminação precária.
   - Alvos de clique/toque de no mínimo **44×44px** (recomendação de toque seguro para evitar cliques errôneos);
   - Contraste reforçado: mirar além de 4.5:1 para garantir legibilidade sob o sol;
   - Informações críticas de rota e status nunca dependem exclusivamente de cor.
2. **Uso intensivo na central de operações e no SVO:**
   - Longos plantões gerando fadiga visual;
   - Necessidade de navegação ágil inteiramente por teclado (`Tab`, `Enter`, `Espaço`, `Esc`)
     para operadores experientes sem exigir uso contínuo de mouse;
   - Prevenção rigorosa de erros em ações críticas (liberação de corpos, alocação de veículos).
3. **Servidores públicos e diversidade funcional:**
   - Pessoas idosas, profissionais com baixa visão, daltonismo ou usuários de tecnologia assistiva
     (leitores de tela como NVDA e TalkBack).

---

## Critérios essenciais da WCAG 2.2 (Nível AA)

### 1. Formulários
- **1.3.1 Informações e Relações (A):** Todo `<input>`, `<select>` ou `<textarea>` deve ter um
  `<label>` associado programaticamente por `id` e `htmlFor` (utilizar `useId()` do React).
- **3.3.1 Identificação de Erros (A):** O erro deve identificar o campo e descrever o problema
  em texto (`role="alert"` e `aria-invalid="true"`). Borda vermelha sozinha não basta (1.4.1).
- **3.3.2 Rótulos ou Instruções (A):** Formatos esperados (ex: formato de placa `ABC-1234` ou
  quilometragem) devem ser informados de antemão.
- **4.1.2 Nome, Papel, Valor (A):** Todo elemento interativo deve ter nome acessível.
  Botões contendo apenas ícone exigem `aria-label` descritivo.

### 2. Teclado e Foco
- **2.1.1 Teclado (A):** Todo elemento acionável por mouse deve ser acionável por teclado.
- **2.1.2 Sem Bloqueio de Teclado (A):** Modais e diálogos não podem prender o foco; tecla `Esc` deve fechar.
- **2.4.3 Ordem de Foco (A):** A ordem de navegação por `Tab` segue a sequência lógica visual.
- **2.4.7 Foco Visível (AA):** É **terminantemente proibido** remover o contorno de foco
  (`outline: none`) sem fornecer substituto visual explícito via `:focus-visible`.
- **2.4.11 Foco Não Obscurecido (AA, WCAG 2.2):** Cabeçalhos fixos, barras de navegação ou
  rodapés fixos não podem encobrir o elemento que está focado pelo usuário.

### 3. Conteúdo Dinâmico e Atualizações Assíncronas
- **4.1.3 Mensagens de Status (AA):** Atualizações assíncronas (resposta de salvamento,
  notificação de despacho de viatura) devem ser anunciadas para leitores de tela usando
  regiões com `role="status"` ou `aria-live="polite"`.
- **2.2.1 Tempo Ajustável (A):** Se houver expiração de sessão, avise com antecedência
  e permita que o usuário estenda o tempo sem perder o preenchimento da tela.

### 4. Tabelas e Listagens Operacionais
- **1.3.1 Informações e Relações (A):** Cabeçalhos `<th>` com atributo `scope="col"`.
- **2.4.4 Finalidade do Link/Botão no Contexto (A):** Em tabelas com múltiplas linhas,
  botões como "Visualizar" ou "Editar" devem identificar o registro alvo:
  `aria-label="Visualizar solicitação #1042 do Lacen"`.
- **2.5.8 Tamanho do Alvo (Mínimo, AA, WCAG 2.2):** Alvos interativos com no mínimo 24×24px
  (e preferencialmente 44×44px em telas móveis operacionais).

### 5. Página e Estrutura Global
- **3.1.1 Idioma da Página (A):** `<html lang="pt-BR">` declarado na raiz em `frontend/index.html`.
- **2.4.2 Título da Página (A):** O `<title>` deve indicar a tela atual (ex: `"Gestão de Frota — Aratu"`).
- **1.4.3 Contraste Mínimo (AA):** Relação de contraste de pelo menos 4.5:1 para texto normal
  e 3:1 para texto grande ou componentes visuais ativos (1.4.11).
- **1.4.4 Redimensionamento de Texto (AA) e 1.4.10 Reflow (AA):** A aplicação deve suportar zoom
  de até 200% sem perda de conteúdo e permitir largura de 320px sem scroll horizontal quebrado.

---

## Os 9 novos critérios da WCAG 2.2

| Critério | Nível | Exigência no Sistema Aratu |
|---|---|---|
| **2.4.11 Foco Não Obscurecido (Mínimo)** | AA | Menus ou barras fixas não cobrem campos focados |
| **2.5.7 Movimentos de Arrastar** | AA | Ações como reordenar prioridades devem oferecer alternativa por botões |
| **2.5.8 Tamanho do Alvo (Mínimo)** | AA | Ícones de ação em tabelas devem ter no mínimo 24×24px (44×44px no mobile) |
| **3.2.6 Ajuda Consistente** | A | Links de contato, suporte ou manual devem ficar na mesma posição em todas as páginas |
| **3.3.7 Entrada Redundante** | A | Não exigir redigitação de informações já prestadas em etapas anteriores de um mesmo fluxo |
| **3.3.8 Autenticação Acessível (Mínimo)** | AA | Não bloquear colar senha e não exigir CAPTCHAs cognitivos difíceis |

---

## Como verificar na prática

1. **Navegue apenas com o teclado (`Tab`, `Shift+Tab`, `Enter`, `Espaço`, `Esc`):**
   Se você não consegue preencher um formulário de solicitação ou fechar um modal sem o mouse, a tela está quebrada.
2. **Verifique o foco visível:**
   Certifique-se de que o contorno de foco está nítido em todos os botões e campos.
3. **Teste zoom de 200%:**
   Verifique se o layout se adapta sem sobreposição ou corte de textos.
4. **Confira o contraste de cores:**
   Assegure legibilidade para textos secundários e badges de status.
5. **Feedbacks assíncronos:**
   Confira se alertas de sucesso e erro possuem regiões com `aria-live`.

**Acessibilidade não se negocia por prazo.** Acessibilidade bem projetada na primeira
escrita custa quase zero; corrigir depois de homologado custa refatoração completa.
