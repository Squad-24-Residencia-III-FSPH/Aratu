import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControl,
  FormHelperText,
  FormLabel,
  OutlinedInput,
  Stack,
  Typography,
} from '@mui/material'
import { SERVICE_UNAVAILABLE } from './loginService.ts'
import { SESSION_EXPIRY_WARNING_MS } from './token.ts'
import type { LoginCredentials, SignInOptions } from './types.ts'
import { validateLogin } from './validation.ts'
import type { LoginErrors } from './validation.ts'

const MAX_TIMEOUT_MS = 2_147_483_647
const COUNTDOWN_STEP_MS = 30_000

const FOCUS_VISIBLE_SX = {
  '&:focus-visible': {
    outline: '2px solid #111827',
    outlineOffset: '2px',
  },
} as const

export interface SessionExpiryPromptProps {
  /** Timestamp em milissegundos (`exp * 1000`) de expiração do JWT vigente. */
  expiresAt: number
  /** Nome de exibição da conta atualmente autenticada. */
  userName: string
  /** Executa reautenticação explícita para o mesmo usuário sem estender o JWT no cliente. */
  onReauthenticate: (credentials: LoginCredentials, options?: SignInOptions) => Promise<void>
  /** Encerra a sessão intencionalmente caso o usuário opte por sair para trocar de conta. */
  onLogout: () => void
}

function formatRemainingMinutes(expiresAt: number, now = Date.now()): string {
  const remainingMs = Math.max(0, expiresAt - now)
  const minutes = Math.max(1, Math.ceil(remainingMs / 60_000))
  return minutes === 1 ? 'menos de 1 minuto' : `${minutes} minutos`
}

/**
 * Aviso acessível de expiração iminente da sessão e diálogo de reautenticação explícita (WCAG 2.2.1).
 *
 * Renderizado dentro de `AuthProvider` para preservar o preenchimento em andamento
 * sem prolongar o JWT no cliente e garantindo devolução de foco ao fechar com `Esc`.
 */
export function SessionExpiryPrompt({
  expiresAt,
  userName,
  onReauthenticate,
  onLogout,
}: SessionExpiryPromptProps) {
  const baseId = useId()
  const emailId = `${baseId}-email`
  const passwordId = `${baseId}-password`
  const dialogTitleId = `${baseId}-title`
  const dialogDescId = `${baseId}-description`

  const [warningOpen, setWarningOpen] = useState(
    () => expiresAt - SESSION_EXPIRY_WARNING_MS <= Date.now(),
  )
  const [dismissed, setDismissed] = useState(false)
  const [reauthOpen, setReauthOpen] = useState(false)
  const [remainingText, setRemainingText] = useState(() => formatRemainingMinutes(expiresAt))

  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [loading, setLoading] = useState(false)

  const renewButtonRef = useRef<HTMLButtonElement>(null)
  const emailInputRef = useRef<HTMLInputElement>(null)
  const passwordInputRef = useRef<HTMLInputElement>(null)
  const abortControllerRef = useRef<AbortController | null>(null)
  const submittingRef = useRef(false)

  useEffect(() => () => abortControllerRef.current?.abort(), [])

  useEffect(() => {
    if (warningOpen) return
    let warningTimer: ReturnType<typeof setTimeout> | undefined
    const warningStartAt = expiresAt - SESSION_EXPIRY_WARNING_MS

    function scheduleWarning(): void {
      const delay = warningStartAt - Date.now()
      if (delay <= 0) {
        setRemainingText(formatRemainingMinutes(expiresAt))
        setWarningOpen(true)
        return
      }
      warningTimer = setTimeout(scheduleWarning, Math.min(delay, MAX_TIMEOUT_MS))
    }

    const initialDelay = warningStartAt - Date.now()
    warningTimer = setTimeout(scheduleWarning, Math.max(0, Math.min(initialDelay, MAX_TIMEOUT_MS)))
    return () => {
      if (warningTimer !== undefined) clearTimeout(warningTimer)
    }
  }, [expiresAt, warningOpen])

  useEffect(() => {
    if (!warningOpen && !reauthOpen) return
    let tickTimer: ReturnType<typeof setTimeout> | undefined

    function scheduleTick(): void {
      setRemainingText(formatRemainingMinutes(expiresAt))
      const remaining = expiresAt - Date.now()
      if (remaining <= 0) return
      tickTimer = setTimeout(scheduleTick, Math.min(COUNTDOWN_STEP_MS, remaining))
    }

    const remaining = expiresAt - Date.now()
    if (remaining > 0) {
      tickTimer = setTimeout(scheduleTick, Math.min(COUNTDOWN_STEP_MS, remaining))
    }
    return () => {
      if (tickTimer !== undefined) clearTimeout(tickTimer)
    }
  }, [warningOpen, reauthOpen, expiresAt])

  function resetForm(): void {
    setEmail('')
    setSenha('')
    setErrors({})
    setSubmitError('')
    setLoading(false)
    submittingRef.current = false
  }

  function openReauthDialog(): void {
    resetForm()
    setReauthOpen(true)
  }

  function closeReauthDialog(): void {
    if (loading) return
    abortControllerRef.current?.abort()
    setReauthOpen(false)
    resetForm()
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submittingRef.current) return
    setSubmitError('')
    const validation = validateLogin({ email, senha })
    setErrors(validation)
    if (validation.email || validation.senha) {
      if (validation.email) emailInputRef.current?.focus()
      else passwordInputRef.current?.focus()
      return
    }
    submittingRef.current = true
    setLoading(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      await onReauthenticate({ email, senha }, { signal: controller.signal })
      setReauthOpen(false)
      setWarningOpen(false)
      resetForm()
    } catch (cause) {
      setSubmitError(cause instanceof Error ? cause.message : SERVICE_UNAVAILABLE)
    } finally {
      submittingRef.current = false
      setLoading(false)
    }
  }

  const showBanner = warningOpen && !reauthOpen && !dismissed

  return (
    <>
      {showBanner && (
        <Box
          role="region"
          aria-label="Aviso de expiração de sessão"
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            left: { xs: 16, sm: 'auto' },
            maxWidth: 460,
            zIndex: 1400,
          }}
        >
          <Alert
            severity="warning"
            role="alert"
            sx={{
              bgcolor: '#fffbeb',
              color: '#111827',
              border: '1px solid #b45309',
              boxShadow: 3,
              '& .MuiAlert-icon': { color: '#92400e' },
            }}
          >
            <Typography variant="body2" sx={{ fontWeight: 700, color: '#111827', mb: 0.5 }}>
              Sua sessão expira em {remainingText}.
            </Typography>
            <Typography variant="body2" sx={{ color: '#1f2937', mb: 1.5 }}>
              Renove sua autenticação como {userName} para continuar sem perder os dados preenchidos.
            </Typography>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
              <Button
                ref={renewButtonRef}
                type="button"
                variant="contained"
                onClick={openReauthDialog}
                sx={{ minHeight: 44, minWidth: 44, ...FOCUS_VISIBLE_SX }}
              >
                Renovar sessão
              </Button>
              <Button
                type="button"
                variant="outlined"
                color="inherit"
                onClick={() => setDismissed(true)}
                sx={{ minHeight: 44, minWidth: 44, color: '#111827', borderColor: '#4b5563', ...FOCUS_VISIBLE_SX }}
              >
                Fechar aviso
              </Button>
            </Stack>
          </Alert>
        </Box>
      )}

      <Dialog
        open={reauthOpen}
        onClose={loading ? undefined : closeReauthDialog}
        aria-labelledby={dialogTitleId}
        aria-describedby={dialogDescId}
        fullWidth
        maxWidth="xs"
        slotProps={{
          transition: {
            onEntered: () => emailInputRef.current?.focus(),
            onExited: () => renewButtonRef.current?.focus(),
          },
        }}
      >
        <DialogTitle id={dialogTitleId}>Renovar sessão</DialogTitle>
        <Box component="form" onSubmit={handleSubmit} noValidate aria-busy={loading}>
          <DialogContent>
            <DialogContentText id={dialogDescId} sx={{ color: '#1f2937', mb: 2 }}>
              Confirme suas credenciais de <strong>{userName}</strong> para iniciar uma nova sessão sem perder seu trabalho atual. Tempo restante: {remainingText}.
            </DialogContentText>

            <FormControl fullWidth required error={Boolean(errors.email)} sx={{ mb: 2 }}>
              <FormLabel htmlFor={emailId} sx={{ mb: 0.75, fontSize: 13, fontWeight: 600, color: '#111827' }}>
                E-mail institucional
              </FormLabel>
              <OutlinedInput
                id={emailId}
                name="email"
                type="email"
                autoComplete="username"
                placeholder="usuario@fsph.gov.br"
                value={email}
                inputRef={emailInputRef}
                disabled={loading}
                inputProps={{
                  'aria-invalid': Boolean(errors.email),
                  'aria-describedby': errors.email ? `${emailId}-error` : undefined,
                }}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setErrors((previous) => ({ ...previous, email: undefined }))
                  setSubmitError('')
                }}
              />
              {errors.email && (
                <FormHelperText id={`${emailId}-error`} role="alert">
                  {errors.email}
                </FormHelperText>
              )}
            </FormControl>

            <FormControl fullWidth required error={Boolean(errors.senha)} sx={{ mb: 1 }}>
              <FormLabel htmlFor={passwordId} sx={{ mb: 0.75, fontSize: 13, fontWeight: 600, color: '#111827' }}>
                Senha
              </FormLabel>
              <OutlinedInput
                id={passwordId}
                name="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                inputRef={passwordInputRef}
                disabled={loading}
                inputProps={{
                  'aria-invalid': Boolean(errors.senha),
                  'aria-describedby': errors.senha ? `${passwordId}-error` : undefined,
                }}
                onChange={(event) => {
                  setSenha(event.target.value)
                  setErrors((previous) => ({ ...previous, senha: undefined }))
                  setSubmitError('')
                }}
              />
              {errors.senha && (
                <FormHelperText id={`${passwordId}-error`} role="alert">
                  {errors.senha}
                </FormHelperText>
              )}
            </FormControl>

            {submitError && (
              <Alert severity="error" role="alert" sx={{ mt: 1.5 }}>
                {submitError}
              </Alert>
            )}
          </DialogContent>

          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1, flexWrap: 'wrap' }}>
            <Button
              type="button"
              color="inherit"
              disabled={loading}
              onClick={onLogout}
              sx={{ minHeight: 44, mr: 'auto', color: '#111827', ...FOCUS_VISIBLE_SX }}
            >
              Sair da conta
            </Button>
            <Button
              type="button"
              color="inherit"
              disabled={loading}
              onClick={closeReauthDialog}
              sx={{ minHeight: 44, color: '#111827', ...FOCUS_VISIBLE_SX }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={loading}
              aria-busy={loading ? 'true' : undefined}
              sx={{ minHeight: 44, ...FOCUS_VISIBLE_SX }}
            >
              {loading && <CircularProgress size={18} color="inherit" aria-label="Autenticando" sx={{ mr: 1 }} />}
              {loading ? 'Validando…' : 'Confirmar e continuar'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </>
  )
}
