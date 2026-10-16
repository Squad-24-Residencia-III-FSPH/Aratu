import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { AuthProvider } from './auth/AuthProvider'
import { theme } from './theme'
import App from './App'
import './index.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider><App /></AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)
