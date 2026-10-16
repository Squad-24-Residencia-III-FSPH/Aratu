# Padrões de Implementação Frontend — Sistema Aratu

Este documento define as diretrizes de desenvolvimento de interface, componentes reutilizáveis, experiência do usuário (UX/IHC) e acessibilidade (**WCAG 2.2 Nível AA**) para o **Frontend** do **Sistema Aratu** (**React 19 + TypeScript + Vite**).

---

## 1. Desenho de Fluxo: De Fora para Dentro

Toda tela do Aratu é desenhada a partir da rotina operacional real dos profissionais da **FSPH** e do **SVO**, e nunca como um espelho direto das colunas do banco de dados:

1. **Identifique o perfil e o contexto de uso:**
   - **Motorista (campo/pátio):** utiliza smartphone ou tablet sob sol forte ou à noite. Exige alvos de toque de no mínimo **44×44px**, alto contraste e formulários diretos.
   - **Gestor de Frota (central):** utiliza desktop com teclado e mouse. Exige tabelas semânticas densas, filtros rápidos e visão clara de disponibilidade.
   - **Equipe SVO (plantão/acolhimento):** lida com situações sensíveis de verificação de óbito e liberação de corpos. Exige máxima prevenção de erros, confirmações explícitas e sigilo visual.
   - **Solicitante FSPH (setores/unidades):** uso esporádico. Exige telas autoexplicativas, instruções de preenchimento claras e acompanhamento simples do pedido.

---

## 2. Organização e Reuso de Componentes (`frontend/src/`)

- **Componente reutilizável antes de marcação avulsa (DRY na interface):**
  - Controles base ficam em `frontend/src/components/ui/` (`Button`, `TextInput`, `SelectField`, `Modal`, `StatusBadge`, `DataTable`).
  - Telas completas ficam em `frontend/src/pages/`.
  - Chamadas HTTP ficam centralizadas em `frontend/src/services/`.
- **Paridade em refatorações:** ao refatorar um componente ou tela existente, preserve rigorosamente o comportamento, os textos, a ordem de foco (`Tab`) e o fluxo visual. Mudança visual não solicitada é escopo novo.

---

## 3. Padrões de Componentes em React 19 + TypeScript

### 3.1 Formulários Acessíveis com `useId()`

Todo `<input>`, `<select>` ou `<textarea>` deve estar programaticamente vinculado a um `<label>` usando o hook nativo `useId()`, além de indicar formatos esperados e anunciar erros via `role="alert"`:

```tsx
import { useId } from 'react';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (valor: string) => void;
  error?: string;
  helperText?: string;
  required?: boolean;
}

export function TextInput({
  label,
  value,
  onChange,
  error,
  helperText,
  required = false,
}: TextInputProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;

  return (
    <div className="input-group">
      <label htmlFor={id}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <input
        id={id}
        type="text"
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : helperText ? helperId : undefined}
      />
      {error && (
        <span id={errorId} role="alert" className="error-text">
          {error}
        </span>
      )}
      {!error && helperText && (
        <span id={helperId} className="helper-text">
          {helperText}
        </span>
      )}
    </div>
  );
}
```

### 3.2 Botões, Affordance e Ações Destrutivas

- **Rótulos com Verbo + Objeto:** prefira `"Solicitar Viagem"`, `"Aprovar Alocação"`, `"Registrar Saída"` em vez de rótulos vagos como `"Confirmar"` ou `"OK"`.
- **Prevenção de cliques duplicados:** suporte à prop `isLoading` desabilitando submissões concorrentes e aplicando `aria-busy="true"`.
- **Ícones nunca sozinhos:** botões que exibem ícone em tabelas devem conter texto visível ou `aria-label` identificando o registro alvo:
  ```tsx
  <button
    type="button"
    aria-label={`Visualizar detalhes da viagem #${viagem.protocolo} para ${viagem.destino}`}
    onClick={() => onVisualizar(viagem.id)}
  >
    <EyeIcon aria-hidden="true" />
  </button>
  ```
- **Modais de Confirmação (`<dialog>`):** ações destrutivas ou críticas (cancelar viagem aprovada, dar baixa em manutenção, confirmar liberação no SVO) exigem modal que cite explicitamente o registro afetado, feche com a tecla `Esc` e devolva o foco ao botão de origem ao fechar.

### 3.3 Badges de Status (`StatusBadge`)

- O status de veículos (`Disponível`, `Em Viagem`, `Manutenção`) ou de solicitações (`Pendente`, `Aprovada`, `Em Andamento`, `Concluída`, `Cancelada`) **nunca deve depender apenas de cor**. Utilize sempre texto explícito + ícone auxiliar + contraste mínimo de 4.5:1.

---

## 4. Os Cinco Estados Visuais Obrigatórios

Toda tela ou listagem que consome dados assíncronos da API deve implementar explicitamente:

1. **Ideal:** dados carregados e apresentados com hierarquia clara.
2. **Carregando (*Loading*):** skeleton ou indicador visual com `aria-busy="true"` e anúncio acessível.
3. **Vazio (*Empty State*):** mensagem clara explicando que não há registros para o filtro atual e botão de ação quando cabível (ex: *"Nenhuma solicitação pendente no momento"*).
4. **Erro (*Error State*):** mensagem compreensível (sem jargão técnico) orientando o próximo passo e oferecendo ação de recuperação (`"Tentar novamente"`).
5. **Parcial (*Partial State*):** quando parte dos dados ou uma ação em lote falha parcialmente, exibindo com clareza o que foi concluído e o que precisa de atenção.

---

## 5. Checklist Inegociável de Acessibilidade (WCAG 2.2 Nível AA)

- **Idioma e Título:** `<html lang="pt-BR">` em `frontend/index.html` e `document.title` contextualizado por página (ex: `"Gestão de Frota — Aratu"`).
- **Navegação 100% por Teclado:** todo fluxo deve ser operável apenas com `Tab`, `Shift+Tab`, `Enter`, `Espaço` e `Esc`.
- **Foco Visível e Não Obscurecido (2.4.7 e 2.4.11):** proibido usar `outline: none` sem substituto em `:focus-visible`; cabeçalhos ou barras fixas não podem encobrir o elemento focado.
- **Tamanho do Alvo (2.5.8):** mínimo absoluto de **24×24px** em desktop e **44×44px** em telas móveis operacionais (motoristas e pátio).
- **Anúncio de Mensagens de Status (4.1.3):** feedbacks assíncronos (toast/alerta de sucesso ou despacho) devem utilizar `role="status"` ou `aria-live="polite"`.
- **Autenticação Acessível (3.3.8) e Entrada Não Redundante (3.3.7):** nunca bloquear colar senha nos campos de login e não exigir que o usuário redigite dados já informados no mesmo passo a passo.

---

## 6. Padrões de Projeto no Frontend (React 19)

A interface adota formalmente os padrões **Custom Hooks** (para isolamento de efeitos assíncronos e I/O de rede) e **Compound Components** (para componentes visuais acessíveis e compostos com Context). Consulte os exemplos em:
👉 **[`docs/manuais/padroes-projeto.md`](padroes-projeto.md)**

