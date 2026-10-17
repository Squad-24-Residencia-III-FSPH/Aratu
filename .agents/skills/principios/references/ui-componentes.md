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

A primeira seção descreve os princípios universais de UI. A segunda detalha a padronização de estilização (**Material UI `@mui/material` + CSS**) e o catálogo de componentes reutilizáveis em **React 19 + TypeScript** do **Sistema Aratu**.

---

## Quando este arquivo é obrigatório

- Campo, botão, aba, coluna, card, lista, filtro ou modal novo em qualquer tela;
- Texto visível novo ou alterado em componentes de interface;
- Estilização via Material UI (`theme.ts`, `sx`, `styled`) ou CSS Modules (`*.module.css`);
- Refatoração de front-end (reorganização de componentes, hooks, estados);
- Tela nova — aqui **junto** com `ux-fluxo.md`.

Não é obrigatório em tarefas estritamente de backend sem impacto visual.

---

## Os princípios, na ordem em que valem

1. **Componente reutilizável sobre Material UI antes de marcação avulsa.**
   As páginas (`src/pages/`) **não devem** montar estruturas repetitivas de Material UI cruas (como repetir `FormControl` + `FormLabel` + `OutlinedInput` + `FormHelperText` em todo formulário ou recriar tabelas e cards do zero). Componentes base ficam em `src/components/ui/` e layouts em `src/components/layout/`. É o DRY na interface.
2. **Tema centralizado (`theme.ts`) vence sobrescrita manual de CSS.**
   O arquivo `frontend/src/theme.ts` é a fonte única de verdade para design tokens (paleta institucional `#FF6B00`, tipografia, `borderRadius` e altura mínima de toque de `44px` exigida pela WCAG 2.2 AA).
3. **Acessibilidade não cede a prazo (WCAG 2.2 nível AA).**
   Todo campo de formulário possui rótulo programático (usando `useId()` do React para amarrar `htmlFor` ao `id` e `aria-describedby` ao `FormHelperText`), botões com apenas ícone exigem `aria-label`, foco visível é mantido e todo controle é acionável por teclado.
4. **Entrada guiada no front, validada no back.**
   Máscaras de placa, CPF, quilometragem e validações em tempo real melhoram a experiência, mas a segurança e a integridade de dados são obrigatoriamente garantidas no backend Express.
5. **Feedback explícito para todos os 5 estados visuais:**
   Toda tela ou componente assíncrono deve tratar os cinco estados fundamentais (via componente `StateFeedback`):
   - *Ideal:* Dados renderizados;
   - *Carregando (Loading):* `Skeleton` ou `CircularProgress` com `aria-busy="true"`;
   - *Vazio (Empty state):* Mensagem explicativa e ação sugerida ("Nenhum veículo disponível");
   - *Erro:* `Alert` compreensível com alternativa de recuperação (botão "Tentar novamente");
   - *Parcial:* Alerta claro do que deu certo e do que falhou em operações compostas.
6. **Confirmação de ação destrutiva diz o quê e quais (`ConfirmDialog`).**
   Diálogos de confirmação (ex: cancelamento de viagem, bloqueio de viatura) devem apresentar claramente a entidade e a consequência da ação.
7. **Localização correta do código:**
   - `src/theme.ts`: Tema global do Material UI (`createTheme`);
   - `src/components/layout/`: Estrutura de página e navegação (`AppShell`, `PageHeader`);
   - `src/components/ui/`: Componentes base reutilizáveis sobre Material UI (`FormField`, `DataTable`, `FilterBar`, `EntityCard`, `StatCard`, `StatusChip`, `StateFeedback`, `ConfirmDialog`);
   - `src/components/`: Componentes compostos específicos de um domínio;
   - `src/pages/`: Telas completas que apenas orquestram hooks e componentes;
   - `src/hooks/`: Hooks customizados de estado, formulários e paginação;
   - `src/services/`: Clientes de API HTTP tipados.

---

## Padrão de Estilização: Material UI (`@mui/material`) e Nomenclatura CSS

### 1. Hierarquia de Estilização
1. **Design Tokens Globais (`frontend/src/theme.ts`):** Cores primárias/secundárias, tipografia, bordas e overrides padrão de componentes (`MuiButton`, `MuiOutlinedInput`, `MuiTableCell`) ficam centralizados em `theme.ts`.
2. **Estilização de Componentes (`sx` e `styled`):** Priorize a prop `sx` do Material UI (usando unidades do tema, ex: `p: 3`, `gap: 2`, `bgcolor: 'background.paper'`) ou `styled()` de `@mui/material/styles`.
3. **CSS Modules (`*.module.css`):** Restritos apenas a layouts estruturais específicos de página quando indispensável.
4. **Regra de Proibição (`:global(.Mui...)`):** É **terminantemente proibido** usar seletores `:global(.MuiOutlinedInput-root)`, `:global(.MuiButton-root)` ou similares em arquivos `.css` para sobrescrever alturas, fontes ou cores do tema, pois isso quebra a consistência visual e viola o tamanho mínimo de toque (`44px`) da WCAG 2.2 AA.

### 2. Nomenclatura de Classes e Variáveis CSS (100% em Inglês)
- **Classes em CSS Modules (`*.module.css`):** Sempre em **inglês no formato `camelCase`** (ex: `.pageContainer`, `.loginCard`, `.fieldGroup`, `.srOnly`). Isso mantém consistência com o TypeScript e permite acesso direto por ponto (`styles.loginCard`) em vez de colchetes com strings em português (`styles['caixa-login']`).
- **Variáveis CSS Globais (`index.css`):** Quando necessárias, sempre em **inglês no formato `--kebab-case`** (ex: `--brand-orange`, `--surface-muted`).

---

## Aratu — Catálogo Oficial de Componentes Reutilizáveis (`src/components/`)

### 1. Layout e Estrutura (`src/components/layout/`)
- **`AppShell`:** Estrutura base das áreas autenticadas (AppBar institucional da FSPH/SVO + Drawer/Menu lateral filtrado pelo perfil RBAC da sessão + container `<main>` acessível).
- **`PageHeader`:** Cabeçalho padronizado no topo de toda página interna contendo título semântico (`<Typography component="h1" variant="h5">`), subtítulo descritivo e área de ações primárias (ex: botão "Novo Veículo", "Solicitar Viagem").

### 2. Campos de Formulário Acessíveis (`src/components/ui/FormField.tsx`)
Encapsula `FormControl`, `FormLabel`, `OutlinedInput` (ou `Select`) e `FormHelperText` do Material UI, gerando e amarrando os IDs automaticamente com `useId()`:

```tsx
import { useId } from 'react';
import type { InputProps } from '@mui/material';
import { FormControl, FormHelperText, FormLabel, OutlinedInput } from '@mui/material';

export interface FormFieldProps extends Omit<InputProps, 'id' | 'error'> {
  label: string;
  errorMessage?: string;
  helperText?: string;
  required?: boolean;
}

export function FormField({
  label,
  errorMessage,
  helperText,
  required,
  ...inputProps
}: FormFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  const helperId = `${id}-helper`;
  const hasError = Boolean(errorMessage);

  return (
    <FormControl fullWidth required={required} error={hasError} sx={{ mb: 2 }}>
      <FormLabel htmlFor={id} sx={{ mb: 0.75, fontSize: 13, fontWeight: 500 }}>
        {label}
      </FormLabel>
      <OutlinedInput
        {...inputProps}
        id={id}
        inputProps={{
          ...inputProps.inputProps,
          'aria-invalid': hasError,
          'aria-describedby': hasError ? errorId : helperText ? helperId : undefined,
        }}
      />
      {hasError && (
        <FormHelperText id={errorId} role="alert">
          {errorMessage}
        </FormHelperText>
      )}
      {!hasError && helperText && (
        <FormHelperText id={helperId}>{helperText}</FormHelperText>
      )}
    </FormControl>
  );
}
```

### 3. Listagens, Tabelas e Filtros (`DataTable` e `FilterBar`)
- **`FilterBar` (`src/components/ui/FilterBar.tsx`):** Barra horizontal padronizada acima de listagens contendo campo de busca textual, seletores de filtro (ex: status, categoria) e botão de limpar filtros.
- **`DataTable` (`src/components/ui/DataTable.tsx`):** Construída sobre `TableContainer`, `Table`, `TableHead`, `TableBody`, `TableRow` e `TableCell` do Material UI:
  - Cabeçalhos sempre com `scope="col"`;
  - Integração nativa com `StateFeedback` para exibir `Skeleton` durante carregamento e estado vazio quando `rows.length === 0`;
  - Botões de ação por linha (ex: "Visualizar viagem", "Editar veículo") com `aria-label` individualizado identificando o registro (`aria-label={`View details for vehicle ${vehicle.licensePlate}`}` ou texto visível em PT-BR `aria-label={`Ver detalhes do veículo placa ${vehicle.licensePlate}`}`).

### 4. Cards Operacionais e Indicadores (`EntityCard` e `StatCard`)
- **`StatCard` (`src/components/ui/StatCard.tsx`):** Card compacto sobre `Card` do MUI para KPIs e resumos numéricos de painel (ex: total de viaturas disponíveis, chamados SVO em aberto).
- **`EntityCard` (`src/components/ui/EntityCard.tsx`):** Card padronizado para exibição de itens em grade ou lista móvel (viaturas, viagens do motorista, chamados do SVO) utilizando **Compound Components** (`EntityCard`, `EntityCard.Header`, `EntityCard.Status`, `EntityCard.Body`, `EntityCard.Actions`) com vínculo `aria-labelledby` via `useId()`.

### 5. Tags de Situação (`StatusChip`)
- Construído sobre o `Chip` do Material UI (`src/components/ui/StatusChip.tsx`).
- O status de veículos (`AVAILABLE` → "Disponível", `IN_TRANSIT` → "Em Viagem", `MAINTENANCE` → "Em Manutenção"), solicitações e chamados SVO **nunca deve depender unicamente da cor** (WCAG 1.4.1).
- Deve combinar **ícone + rótulo textual explícito + paleta semântica com contraste mínimo de 4.5:1**.

### 6. Estados Assíncronos (`StateFeedback`) e Confirmação (`ConfirmDialog`)
- **`StateFeedback` (`src/components/ui/StateFeedback.tsx`):** Componente único para tratar estados de `isLoading` (`CircularProgress` / `Skeleton` + `aria-busy="true"`), `error` (`Alert severity="error"` + botão de tentar novamente), `isEmpty` (ilustração/ícone + mensagem explicativa + botão de ação) e `partialWarning` (`Alert severity="warning"`).
- **`ConfirmDialog` (`src/components/ui/ConfirmDialog.tsx`):** Construído sobre `Dialog`, `DialogTitle`, `DialogContent` e `DialogActions` do Material UI com `aria-labelledby`, `aria-describedby`, fechamento com tecla `Esc` e devolução automática de foco ao botão acionador.

---

## Refatoração de Front-End no Aratu

**Paridade visual e comportamental é condição de aceite:**
- Ao refatorar uma tela ou extrair componentes reutilizáveis em React + Material UI, a aparência, os textos em português para o usuário final, a ordem de tabulação e o fluxo operacional devem ser rigorosamente preservados.
- Qualquer alteração visual que não seja estritamente necessária para corrigir um bug reportado ou uma violação de acessibilidade constitui escopo novo e deve ser apresentada como proposta separada.

