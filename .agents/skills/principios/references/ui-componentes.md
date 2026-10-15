# UI — execução de tela e componentes em React 19

Material de consulta da skill `principios`, par de `ux-fluxo.md`. A divisão
entre os dois é por **momento**:

- **`ux-fluxo.md`:** decisão — quem usa, em que ordem, o que confirma, quais
  palavras e prevenção de erros operacionais. Leia antes de codar.
- **este arquivo:** execução — qual componente React, quais props, estrutura acessível,
  estados visuais e tratamento de eventos. Leia ao escrever ou alterar telas.

Pergunta que começa com *"como"* é deste arquivo; *"deveria"* é do outro. Cada
um tem a sua lista — **não repita a do outro**.

Acessibilidade atravessa os dois momentos e fica em `references/acessibilidade.md`
(WCAG 2.2 nível AA). Este arquivo cita o que é inegociável na execução e direciona para lá.

A primeira seção descreve os princípios universais de UI. A segunda detalha
a biblioteca de componentes e padrões em **React 19 + TypeScript** do **Sistema Aratu**.

---

## Quando este arquivo é obrigatório

- Campo, botão, aba, coluna, card, filtro ou modal novo em qualquer tela;
- Texto visível novo ou alterado em componentes de interface;
- Refatoração de front-end (reorganização de componentes, hooks, estados);
- Tela nova — aqui **junto** com `ux-fluxo.md`.

Não é obrigatório em tarefas estritamente de backend sem impacto visual.

---

## Os princípios, na ordem em que valem

1. **Componente reutilizável antes de marcação avulsa.**
   Botões, inputs, modais, selects e tabelas devem ser extraídos ou reaproveitados de
   `frontend/src/components/`. Elemento HTML estilizado avulso gera inconsistência visual,
   falhas de acessibilidade e duplicação de esforço de manutenção. É o DRY na interface.
2. **Consistência visual vence preferência estética momentânea.**
   Mesma posição para ações de formulário, mesmos padrões de cores e espaçamento,
   mesmo vocabulário operacional para os setores da FSPH e SVO. Tela diferente
   sem motivo cobra aprendizado desnecessário do usuário.
3. **Acessibilidade não cede a prazo (WCAG 2.2 nível AA).**
   Todo campo de formulário possui rótulo programático (usar `useId` do React para amarrar
   `htmlFor` ao `id`), botões com apenas ícone exigem `aria-label`, foco visível é mantido
   e todo controle é acionável por teclado.
4. **Entrada guiada no front, validada no back.**
   Máscaras de placa, CPF, quilometragem e validações em tempo real melhoram a experiência,
   mas a segurança e a integridade de dados são obrigatoriamente garantidas no backend Express.
5. **Feedback explícito para todos os estados visuais:**
   Toda tela ou componente assíncrono deve tratar os cinco estados fundamentais:
   - *Ideal:* Dados renderizados;
   - *Carregando (Loading):* Skeleton ou indicador de progresso com `aria-busy="true"`;
   - *Vazio (Empty state):* Mensagem explicativa e ação sugerida ("Nenhum veículo disponível");
   - *Erro:* Mensagem compreensível com alternativa de recuperação (botão "Tentar novamente");
   - *Parcial:* Informação clara do que deu certo e do que falhou em operações compostas.
6. **Confirmação de ação destrutiva diz o quê e quais.**
   Modais de confirmação (ex: cancelamento de viagem, exclusão de agendamento) devem
   apresentar claramente a entidade e a consequência da ação.
7. **Localização correta do código:**
   Componentes globais em `src/components/`, telas em `src/pages/`, hooks compartilhados
   em `src/hooks/` e chamadas de API encapsuladas em `src/services/`.

---

## Aratu — inventário de componentes em React 19 + TypeScript

### 1. Formulários Acessíveis (`useId`)
Utilize sempre o hook nativo `useId()` do React para gerar identificadores únicos estáveis:

```tsx
import { useId } from 'react';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  error?: string;
  helperText?: string;
}

export function TextInput({ label, value, onChange, error, helperText }: TextInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className="input-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={!!error}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
      />
      {error && <span id={errorId} role="alert" className="error-text">{error}</span>}
      {!error && helperText && <span id={helperId} className="helper-text">{helperText}</span>}
    </div>
  );
}
```

### 2. Botões e Ações (`Button`)
- Variantes semânticas: `primary` (ação principal da tela), `secondary` (ações secundárias),
  `danger` (ações destrutivas como cancelar ou excluir) e `outline`.
- Suporte nativo a estado de carregamento (`isLoading`), desabilitando cliques concorrentes
  e anunciando o processamento para tecnologias assistivas.
- Área de clique mínima de 44×44px para telas que operam em smartphones por motoristas
  ou no pátio da FSPH.

### 3. Tags de Situação (`StatusBadge`)
- O status de veículos (`Disponível`, `Em Viagem`, `Manutenção`) e de solicitações
  (`Pendente`, `Aprovada`, `Recusada`, `Concluída`) nunca deve depender unicamente da cor.
- Use texto explícito e ícones complementares, garantindo contraste mínimo de 4.5:1.

### 4. Tabelas de Gestão Operacional
- Elementos semânticos `<table>`, `<thead>`, `<tbody>`, `<tr>` e `<th>` com atributo `scope="col"`.
- Ações por linha (ex: "Visualizar viagem", "Editar veículo") devem ter nome acessível individualizado:
  ```tsx
  <button
    type="button"
    aria-label={`Ver detalhes do veículo placa ${veiculo.placa}`}
    onClick={() => handleVisualizar(veiculo.id)}
  >
    <EyeIcon aria-hidden="true" />
    <span className="sr-only">Ver detalhes</span>
  </button>
  ```

### 5. Diálogos e Modais Acessíveis (`Modal`)
- Utilizar a tag `<dialog>` ou container com `role="dialog"` e `aria-modal="true"`.
- Ao abrir, posicionar o foco no elemento inicial lógico (ou botão de fechar);
- Fechar ao pressionar a tecla `Esc`;
- Retornar o foco ao botão que disparou a abertura ao fechar o diálogo.

---

## Refatoração de Front-End no Aratu

**Paridade visual e comportamental é condição de aceite:**
- Ao refatorar uma tela ou componente em React, a aparência, os textos, a ordem de tabulação
  e o fluxo operacional devem ser rigorosamente preservados.
- Qualquer alteração visual que não seja estritamente necessária para corrigir um bug reportado
  constitui escopo novo e deve ser apresentada como proposta separada.
