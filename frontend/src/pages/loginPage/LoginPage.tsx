import { useEffect, useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert, Box, Button, CircularProgress, FormControl, FormHelperText,
  FormLabel, Link, OutlinedInput, Typography,
} from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { validateLogin } from '../../auth/validation'
import type { LoginErrors } from '../../auth/validation'
import { SERVICE_UNAVAILABLE } from '../../auth/loginService'
import logo from '../../assets/aratu-logo-black-orange.png'
import styles from './LoginPage.module.css'

const loginFieldLabelSx = {
  fontSize: 13,
  fontWeight: 600,
  color: '#374151',
  mb: 0.75,
  lineHeight: 1.3,
  '&.Mui-focused:not(.Mui-error)': { color: '#b94700' },
  '& .MuiFormLabel-asterisk': { color: '#b91c1c' },
} as const

const loginInputSx = {
  minHeight: 44,
  fontSize: 14,
  color: '#111827',
  scrollMarginTop: '80px',
  '& .MuiOutlinedInput-input': {
    minHeight: 44,
    boxSizing: 'border-box',
    padding: '10px 12px',
    '&::placeholder': { color: '#6b7280', opacity: 1 },
  },
  '&:not(.Mui-disabled):not(.Mui-error) .MuiOutlinedInput-notchedOutline': {
    borderColor: '#6b7280',
  },
  '&.Mui-focused:not(.Mui-error) .MuiOutlinedInput-notchedOutline': {
    borderColor: '#b94700',
    borderWidth: 2,
  },
} as const

const loginSubmitButtonSx = {
  width: '100%',
  minHeight: 44,
  minWidth: 44,
  mt: 1,
  gap: 1.25,
  borderRadius: 1.5,
  fontSize: 14,
  fontWeight: 600,
  backgroundColor: '#FF6B00',
  color: '#111827',
  scrollMarginTop: '80px',
  '&:hover': { backgroundColor: '#e05e00' },
  '&:disabled': { backgroundColor: '#e5e7eb', color: '#374151' },
  '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid #b94700', outlineOffset: 2 },
} as const

const loginRecoveryLinkSx = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  minHeight: 44,
  minWidth: 44,
  px: 2,
  py: 1,
  fontSize: 14,
  fontWeight: 600,
  color: '#b94700',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  borderRadius: 1,
  scrollMarginTop: '80px',
  '&:hover': { color: '#9a3412' },
  '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid #b94700', outlineOffset: 2 },
} as const

const loginSecondaryButtonSx = {
  minHeight: 44,
  minWidth: 44,
  mt: 1,
  color: '#b94700',
  scrollMarginTop: '80px',
  '&.Mui-focusVisible, &:focus-visible': { outline: '3px solid #b94700', outlineOffset: 2 },
} as const

export default function LoginPage() {
  const { signIn, notice } = useAuth()
  const emailId = useId()
  const passwordId = useId()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const signInController = useRef<AbortController | null>(null)
  useEffect(() => () => signInController.current?.abort(), [])
  const [recoveryInfo, setRecoveryInfo] = useState(false)
  const submitting = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    document.title = 'Entrar — Aratu'
    emailInput.current?.focus()
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    setError('')
    const validation = validateLogin({ email, senha })
    setErrors(validation)
    if (validation.email || validation.senha) {
      if (validation.email) emailInput.current?.focus()
      else passwordInput.current?.focus()
      return
    }
    submitting.current = true
    setLoading(true)
    signInController.current = new AbortController()
    try {
      await signIn({ email, senha }, { signal: signInController.current.signal, onPreparing: setPreparing })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : SERVICE_UNAVAILABLE)
    } finally {
      submitting.current = false
      setLoading(false)
      setPreparing(false)
    }
  }

  return (
    <Box className={styles.pageContainer}>
      <Box component="aside" className={styles.brandAside} aria-label="Sobre o Aratu">
        <section className={styles.brandHighlight}>
          <h2>Gestão de frota e operação SVO em um só lugar.</h2>
          <p>Uma operação simples, segura e conectada às necessidades de quem cuida da saúde pública.</p>
        </section>
      </Box>
      <Box component="main" className={styles.mainContent}>
        <section className={styles.loginCard} aria-labelledby="titulo-login">
          <div className={styles.logoWrapper}><img src={logo} alt="Aratu" /></div>
          <header className={styles.loginHeader}>
            <h1 id="titulo-login">Acesse o Aratu</h1>
            <p>Use suas credenciais institucionais para continuar.</p>
          </header>
          <Box component="form" className={styles.loginForm} onSubmit={handleSubmit} noValidate aria-busy={loading}>
            <FormControl fullWidth required error={Boolean(errors.email)} className={styles.fieldGroup}>
              <FormLabel htmlFor={emailId} sx={loginFieldLabelSx}>E-mail institucional</FormLabel>
              <OutlinedInput
                id={emailId}
                name="email"
                type="email"
                autoComplete="username"
                placeholder="usuario@fsph.gov.br"
                value={email}
                inputRef={emailInput}
                disabled={loading}
                sx={loginInputSx}
                inputProps={{
                  'aria-describedby': errors.email ? `${emailId}-error` : undefined,
                  'aria-invalid': Boolean(errors.email),
                }}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setErrors((previous) => ({ ...previous, email: undefined }))
                  setError('')
                }}
              />
              {errors.email && <FormHelperText id={`${emailId}-error`} role="alert">{errors.email}</FormHelperText>}
            </FormControl>
            <FormControl fullWidth required error={Boolean(errors.senha)} className={styles.fieldGroup}>
              <FormLabel htmlFor={passwordId} sx={loginFieldLabelSx}>Senha</FormLabel>
              <OutlinedInput
                id={passwordId}
                name="senha"
                type="password"
                autoComplete="current-password"
                value={senha}
                inputRef={passwordInput}
                disabled={loading}
                sx={loginInputSx}
                inputProps={{
                  'aria-describedby': errors.senha ? `${passwordId}-error` : undefined,
                  'aria-invalid': Boolean(errors.senha),
                }}
                onChange={(event) => {
                  setSenha(event.target.value)
                  setErrors((previous) => ({ ...previous, senha: undefined }))
                  setError('')
                }}
              />
              {errors.senha && <FormHelperText id={`${passwordId}-error`} role="alert">{errors.senha}</FormHelperText>}
            </FormControl>
            {error && <Alert severity="error" className={styles.loginMessage}>{error}</Alert>}
            {!error && notice && <Alert severity="info" role="status" className={styles.loginMessage}>{notice}</Alert>}
            <Button type="submit" variant="contained" fullWidth disabled={loading} sx={loginSubmitButtonSx}>
              {loading && <CircularProgress size={18} color="inherit" aria-label="Aguardando resposta" />}
              {loading ? preparing ? 'Preparando acesso…' : 'Entrando…' : 'Entrar'}
            </Button>
            {preparing && (
              <Box>
                <Typography role="status">Preparando o acesso. Isso pode levar cerca de um minuto.</Typography>
                <Button type="button" onClick={() => signInController.current?.abort()} sx={loginSecondaryButtonSx}>
                  Cancelar espera
                </Button>
              </Box>
            )}
            <span role="status" className={styles.srOnly}>{loading && !preparing ? 'Autenticando. Aguarde.' : ''}</span>
            <footer className={styles.loginFooter}>
              <Link
                component="button"
                type="button"
                onClick={() => setRecoveryInfo(true)}
                disabled={loading}
                sx={loginRecoveryLinkSx}
              >
                Esqueci minha senha
              </Link>
              {recoveryInfo && (
                <Alert severity="info" className={styles.loginMessage} sx={{ width: '100%' }}>
                  A recuperação de senha ainda não está disponível.
                </Alert>
              )}
              <Typography component="p" className={styles.securityNotice}>Aratu · Ambiente seguro FSPH</Typography>
            </footer>
          </Box>
        </section>
      </Box>
    </Box>
  )
}
