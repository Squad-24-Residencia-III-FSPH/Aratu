/** Contraste e foco consistentes nos controles da manutenção, inclusive em diálogos portados. */
export const maintenanceControls = {
  '& .MuiButton-text, & .MuiButton-outlined': { color: 'primary.dark' },
  '& .MuiButton-root': { minWidth: 44 },
  '& input:not([aria-hidden="true"]), & [role="combobox"]': { minHeight: 44, boxSizing: 'border-box' },
  '& .MuiButton-root.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.dark', outlineOffset: 2 },
  '& .MuiOutlinedInput-root:not(.Mui-disabled):not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: 'grey.600' },
  '& .MuiOutlinedInput-root.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': { borderColor: 'primary.dark' },
  '& .MuiInputLabel-root.Mui-focused:not(.Mui-error)': { color: 'primary.dark' },
}
