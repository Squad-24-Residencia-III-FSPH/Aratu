import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: { main: '#FF6B00', dark: '#b94700', contrastText: '#111827' },
    text: { primary: '#111827', secondary: '#4b5563' },
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
        notchedOutline: { borderColor: '#d1d5db' },
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
    MuiCssBaseline: {
      styleOverrides: {
        ':focus-visible': { outline: '2px solid #111827', outlineOffset: 2 },
        '::selection': { backgroundColor: 'rgba(255, 107, 0, 0.24)' },
      },
    },
  },
})
