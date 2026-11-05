/** Contraste e foco consistentes nos controles da manutenção, inclusive em diálogos portados. */
export const maintenanceControls = {
  '& .MuiButton-text, & .MuiButton-outlined': { color: 'primary.dark' },
  '& .MuiButton-root': { minWidth: 44 },
  '& input:not([aria-hidden="true"]), & [role="combobox"]': { minHeight: 44, boxSizing: 'border-box' },
  '& .MuiButton-root.Mui-focusVisible': { outline: '3px solid', outlineColor: 'primary.dark', outlineOffset: 2 },
}
