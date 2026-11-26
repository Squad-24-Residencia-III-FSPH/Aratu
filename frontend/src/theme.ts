import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: { main: '#FF6B00', dark: '#b94700', contrastText: '#111827' },
    secondary: { main: '#475569', dark: '#334155', contrastText: '#ffffff' },
    info: { main: '#1d4ed8', dark: '#1e40af', light: '#eff6ff', contrastText: '#ffffff' },
    success: { main: '#15803d', dark: '#166534', light: '#f0fdf4', contrastText: '#ffffff' },
    warning: { main: '#a16207', dark: '#854d0e', light: '#fffbeb', contrastText: '#111827' },
    error: { main: '#b91c1c', dark: '#991b1b', light: '#fef2f2', contrastText: '#ffffff' },
    text: { primary: '#111827', secondary: '#475569', disabled: '#64748b' },
    divider: '#64748b',
    background: { default: '#f8fafc', paper: '#fff' },
  },
  typography: {
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 600 },
  },
  shape: { borderRadius: 6 },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: {
          minHeight: 44,
          '@media (max-width:599.95px)': { minHeight: 48 },
          '&.Mui-focusVisible': { outline: '2px solid #111827', outlineOffset: 2 },
        },
        text: { '&.Mui-disabled': { color: '#6b7280' } },
        outlined: { '&.Mui-disabled': { color: '#6b7280', borderColor: '#9ca3af' } },
        contained: { '&.Mui-disabled': { color: '#4b5563', backgroundColor: '#e5e7eb' } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          fontSize: '1rem',
          minHeight: 48,
          '&.Mui-focused .MuiOutlinedInput-notchedOutline': { borderWidth: 2 },
        },
        notchedOutline: { borderColor: '#64748b' },
        input: {
          padding: '10px 12px',
          '&::placeholder': { color: '#4b5563', opacity: 1 },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          minWidth: 44,
          minHeight: 44,
          '&.Mui-focusVisible': { outline: '2px solid #111827', outlineOffset: 2 },
        },
      },
    },
    MuiMenuItem: {
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiTableCell: {
      styleOverrides: { root: { borderColor: '#cbd5e1' }, head: { color: '#1e293b', fontWeight: 700 } },
    },
    MuiTooltip: {
      styleOverrides: {
        tooltip: { backgroundColor: '#1e293b', color: '#ffffff', fontSize: '0.8125rem' },
        arrow: { color: '#1e293b' },
      },
    },
    MuiFormHelperText: {
      styleOverrides: { root: { color: '#475569' } },
    },
    MuiCssBaseline: {
      styleOverrides: {
        ':focus-visible': { outline: '2px solid #111827', outlineOffset: 2 },
        '::selection': { backgroundColor: 'rgba(255, 107, 0, 0.24)' },
      },
    },
  },
})
