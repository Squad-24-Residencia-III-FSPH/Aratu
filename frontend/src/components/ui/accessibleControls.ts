/**
 * Tokens de contraste e foco dos controles de formulário, reutilizáveis por
 * telas e por diálogos portados (o `sx` do `Dialog` não herda o da página).
 *
 * A altura mínima de 44px e o `minHeight` dos botões vêm do tema; aqui ficam
 * apenas as correções de contraste e o anel de foco que o tema não cobre.
 */
export const accessibleControls = {
  '& .MuiButton-text, & .MuiButton-outlined': { color: 'primary.dark' },
  '& .MuiButton-root': { minWidth: 44 },
  '& input:not([aria-hidden="true"]), & [role="combobox"]': { minHeight: 44, boxSizing: 'border-box' },
  '& .MuiButton-root.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.dark', outlineOffset: 2 },
  '& .MuiOutlinedInput-root:not(.Mui-disabled):not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: 'grey.600' },
  '& .MuiOutlinedInput-root.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.dark' },
  '& .MuiInputLabel-root.Mui-focused:not(.Mui-error)': { color: 'primary.dark' },
}
