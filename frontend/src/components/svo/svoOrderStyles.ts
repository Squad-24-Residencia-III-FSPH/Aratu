import type { SxProps, Theme } from '@mui/material'

/** Contorno de foco visível WCAG 2.2 AA para controles e diálogos do módulo SVO. */
export const SVO_FOCUS_SX: SxProps<Theme> = {
  '& :focus-visible': { outline: '2px solid', outlineColor: 'text.primary', outlineOffset: 2 },
}

/**
 * Estilo para seletores (`FormSelect`) com contraste de borda e área interativa
 * de `combobox` com no mínimo 44px de altura (WCAG 2.2 AA).
 */
export const SVO_SELECT_FIELD_SX: SxProps<Theme> = {
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'text.primary' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'text.primary' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'text.primary' },
  '& .MuiOutlinedInput-root .MuiSelect-select': {
    boxSizing: 'border-box',
    minHeight: 44,
    lineHeight: '24px',
  },
}

/** Estilo de campos de texto (`FormField`) com alto contraste de foco e borda. */
export const SVO_TEXT_FIELD_SX: SxProps<Theme> = {
  '& .MuiOutlinedInput-notchedOutline': { borderColor: 'text.primary' },
  '& .MuiOutlinedInput-root.Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: 'text.primary' },
  '& .MuiInputLabel-root.Mui-focused': { color: 'text.primary' },
}

/**
 * Empilha mensagem e ação de recuperação abaixo de 900px (celulares, zoom 200% e telas compactas),
 * evitando compressão da mensagem e quebra no meio das palavras do botão.
 */
export const SVO_ALERT_STACKED_SX: SxProps<Theme> = {
  mb: 2,
  flexWrap: { xs: 'wrap', md: 'nowrap' },
  alignItems: { xs: 'flex-start', md: 'center' },
  '& .MuiAlert-message': {
    flex: { xs: '1 1 calc(100% - 40px)', md: '1 1 auto' },
    minWidth: 0,
    overflowWrap: 'break-word',
  },
  '& .MuiAlert-action': {
    flex: { xs: '0 0 100%', md: '0 0 auto' },
    ml: { xs: 0, md: 'auto' },
    mr: { xs: 0, md: -1 },
    pl: { xs: 0, md: 2 },
    pt: { xs: 0.5, md: 0.5 },
    justifyContent: { xs: 'flex-start', md: 'flex-end' },
  },
}

/** Alvo de toque mínimo (44×44px) com rótulo íntegro para ações de recuperação. */
export const SVO_ALERT_ACTION_SX: SxProps<Theme> = {
  minHeight: 44,
  minWidth: 44,
  whiteSpace: 'normal',
  overflowWrap: 'normal',
  textAlign: 'left',
}
