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
      styleOverrides: { root: { minHeight: 44 } },
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: { fontSize: 14, minHeight: 44 },
        notchedOutline: { borderColor: '#d1d5db' },
        input: { padding: '10px 12px' },
      },
    },
  },
})
