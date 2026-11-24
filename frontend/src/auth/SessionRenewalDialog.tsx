import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography } from '@mui/material'
import { useAuth } from './useAuth'
import { tokenExpiresAt } from './token'
import { FormField } from '../components/ui/FormField'

function formatRemaining(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Pausa a tela com antecedência e solicita autenticação explícita da mesma pessoa. */
export default function SessionRenewalDialog() {
  const { session, renewalPrompt, renewalPending, renewalError, renewSession, logout } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [now, setNow] = useState(0)
  const expiresAt = session ? tokenExpiresAt(session.token, session.perfil) : null

  useEffect(() => {
    if (!session || !renewalPrompt) return
    const initialUpdate = window.setTimeout(() => setNow(Date.now()), 0)
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => { window.clearTimeout(initialUpdate); window.clearInterval(timer) }
  }, [renewalPrompt, session])

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim() || !password || renewalPending) return
    await renewSession({ email, senha: password })
    setEmail('')
    setPassword('')
  }

  const remaining = expiresAt ? formatRemaining(expiresAt - now) : '—'

  return (
    <Dialog
      open={Boolean(session && renewalPrompt)}
      fullWidth
      maxWidth="sm"
      aria-labelledby="session-renewal-title"
      aria-describedby="session-renewal-description"
      onClose={() => undefined}
    >
      <form onSubmit={(event) => { void submit(event) }}>
        <DialogTitle id="session-renewal-title">Sua sessão está perto de expirar</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <Typography id="session-renewal-description" variant="body2">
              Para manter seus dados abertos, confirme sua identidade antes que a sessão expire. Tempo restante: {remaining}.
            </Typography>
            {renewalError && <Alert severity="error" role="alert">{renewalError}</Alert>}
            <FormField
              label="E-mail institucional"
              type="email"
              autoComplete="username"
              value={email}
              onChange={setEmail}
              required
              autoFocus
              disabled={renewalPending}
            />
            <FormField
              label="Senha"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={setPassword}
              required
              disabled={renewalPending}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexDirection: { xs: 'column-reverse', sm: 'row' }, alignItems: 'stretch', gap: 1 }}>
          <Button type="button" onClick={logout} color="inherit" disabled={renewalPending} sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
            Encerrar sessão
          </Button>
          <Button type="submit" variant="contained" disabled={!email.trim() || !password || renewalPending} sx={{ minHeight: 48, width: { xs: '100%', sm: 'auto' } }}>
            {renewalPending ? 'Verificando...' : 'Continuar sessão'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  )
}
