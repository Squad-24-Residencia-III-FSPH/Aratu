import { createTheme } from '@mui/material/styles'

export const theme = createTheme({
  palette: {
    primary: { main: '#FF6B00', dark: '#b94700', contrastText: '#111827' },
    text: { primary: '#642c04', secondary: '#000000' },
    background: { default: '#fff', paper: '#fff' },
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
        root: { minHeight: 44 },
        text: { '&.Mui-disabled': { color: '#6b7280' } },
        outlined: { '&.Mui-disabled': { color: '#6b7280', borderColor: '#9ca3af' } },
        contained: { '&.Mui-disabled': { color: '#4b5563', backgroundColor: '#e5e7eb' } },
      },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { fontSize: 14, minHeight: 44 },
        notchedOutline: { borderColor: '#d1d5db' },
        input: {
          padding: '10px 12px',
          '&::placeholder': { color: '#4b5563', opacity: 1 },
        },
      },
    },
  },
})
