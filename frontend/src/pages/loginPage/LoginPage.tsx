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
    <Box className={styles['pageBody']}>
      <Box component="aside" className={styles['sideHeader']} aria-label="Sobre o Aratu">
        <section className={styles['featureContent']}>
          <h2>Gestão de frota e operação SVO em um só lugar.</h2>
          <p>Uma operação simples, segura e conectada às necessidades de quem cuida da saúde pública.</p>
        </section>
      </Box>
      <Box component="main" className={styles['mainContent']}>
        <section className={styles['loginCard']} aria-labelledby="titulo-login">
          <div className={styles['logo']}><img src={logo} alt="Aratu" /></div>
          <header className={styles['loginHeader']}>
            <h1 id="titulo-login">Acesse o Aratu</h1>
            <p>Use suas credenciais institucionais para continuar.</p>
          </header>
          <Box component="form" className={styles['loginForm']} onSubmit={handleSubmit} noValidate aria-busy={loading}>
            <FormControl fullWidth required error={Boolean(errors.email)} className={styles['formGroup']}
              sx={{ '& .MuiFormLabel-asterisk': { color: '#ef4444' } }}>
              <FormLabel htmlFor={emailId}>E-mail institucional</FormLabel>
              <OutlinedInput
                id={emailId} name="email" type="email" autoComplete="username"
                placeholder="usuario@fsph.gov.br" value={email} inputRef={emailInput}
                disabled={loading} inputProps={{ 'aria-describedby': errors.email ? `${emailId}-error` : undefined, 'aria-invalid': Boolean(errors.email) }}
                sx={{ height: 44, minHeight: 44, fontSize: '0.8125rem', lineHeight: 'normal', color: '#1f2937',
                  '& .MuiOutlinedInput-input': { height: 'auto', padding: '10px 12px', lineHeight: 'normal' },
                  '& .MuiOutlinedInput-input::placeholder': { color: '#9ca3af', opacity: 1 } }}
                onChange={(event) => { setEmail(event.target.value); setErrors((previous) => ({ ...previous, email: undefined })); setError('') }}
              />
              {errors.email && <FormHelperText id={`${emailId}-error`} role="alert">{errors.email}</FormHelperText>}
            </FormControl>
            <FormControl fullWidth required error={Boolean(errors.senha)} className={styles['formGroup']}
              sx={{ '& .MuiFormLabel-asterisk': { color: '#ef4444' } }}>
              <FormLabel htmlFor={passwordId}>Senha</FormLabel>
              <OutlinedInput
                id={passwordId} name="senha" type="password" autoComplete="current-password"
                value={senha} inputRef={passwordInput} disabled={loading}
                inputProps={{ 'aria-describedby': errors.senha ? `${passwordId}-error` : undefined, 'aria-invalid': Boolean(errors.senha) }}
                sx={{ height: 44, minHeight: 44, fontSize: '0.8125rem', lineHeight: 'normal', color: '#1f2937',
                  '& .MuiOutlinedInput-input': { height: 'auto', padding: '10px 12px', lineHeight: 'normal' } }}
                onChange={(event) => { setSenha(event.target.value); setErrors((previous) => ({ ...previous, senha: undefined })); setError('') }}
              />
              {errors.senha && <FormHelperText id={`${passwordId}-error`} role="alert">{errors.senha}</FormHelperText>}
            </FormControl>
            {error && <Alert severity="error" className={styles['loginMessage']}>{error}</Alert>}
            {!error && notice && <Alert severity="info" role="status" className={styles['loginMessage']}>{notice}</Alert>}
            <Button type="submit" variant="contained" fullWidth disabled={loading} className={styles['submitButton']}>
              {loading && <CircularProgress size={18} color="inherit" aria-label="Aguardando resposta" />}
              {loading ? preparing ? 'Preparando acesso…' : 'Entrando…' : 'Entrar'}
            </Button>
            {preparing && <Box>
              <Typography role="status">Preparando o acesso. Isso pode levar cerca de um minuto.</Typography>
              <Button type="button" onClick={() => signInController.current?.abort()}>Cancelar espera</Button>
            </Box>}
            <span role="status" className={styles['screenReaderOnly']}>{loading && !preparing ? 'Autenticando. Aguarde.' : ''}</span>
            <footer className={styles['loginFooter']}>
              <Link component="button" type="button" className={styles['forgotPasswordLink']} onClick={() => setRecoveryInfo(true)} disabled={loading} sx={{ minHeight: 44 }}>
                Esqueci minha senha
              </Link>
              {recoveryInfo && <Alert severity="info" className={styles['loginMessage']}>A recuperação de senha ainda não está disponível.</Alert>}
              <Typography component="p" className={styles['securityInfo']}>Aratu · Ambiente seguro FSPH</Typography>
            </footer>
          </Box>
        </section>
      </Box>
    </Box>
  )
}
