import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert, Box, Button, CircularProgress, FormControl, FormHelperText,
  FormLabel, Link, OutlinedInput, Typography,
} from '@mui/material'
import { useAuth } from '../auth/useAuth'
import { validateLogin } from '../auth/validation'
import type { LoginErrors } from '../auth/validation'
import { SERVICE_UNAVAILABLE } from '../auth/loginService'
import logo from '../assets/aratu-logo.png'
import styles from './LoginPage.module.css'

export default function LoginPage() {
  const { signIn, notice } = useAuth()
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [errors, setErrors] = useState<LoginErrors>({})
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [recoveryInfo, setRecoveryInfo] = useState(false)
  const submitting = useRef(false)
  const emailInput = useRef<HTMLInputElement>(null)
  const passwordInput = useRef<HTMLInputElement>(null)

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
    try {
      await signIn({ email, senha })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : SERVICE_UNAVAILABLE)
    } finally {
      submitting.current = false
      setLoading(false)
    }
  }

  return (
    <Box className={styles['corpo-pagina']}>
      <Box component="aside" className={styles['cabecalho-lateral']} aria-label="Sobre o Aratu">
        <section className={styles['conteudo-destaque']}>
          <h2>Gestão de frota e operação SVO em um só lugar.</h2>
          <p>Uma operação simples, segura e conectada às necessidades de quem cuida da saúde pública.</p>
        </section>
      </Box>
      <Box component="main" className={styles['conteudo-principal']}>
        <section className={styles['caixa-login']} aria-labelledby="titulo-login">
          <div className={styles['logo']}><img src={logo} alt="Aratu" /></div>
          <header className={styles['cabecalho-login']}>
            <h1 id="titulo-login">Acesse o Aratu</h1>
            <p>Use suas credenciais institucionais para continuar.</p>
          </header>
          <Box component="form" className={styles['formulario-login']} onSubmit={handleSubmit} noValidate aria-busy={loading}>
            <FormControl fullWidth required error={Boolean(errors.email)} className={styles['grupo-campo']}>
              <FormLabel htmlFor="email">E-mail institucional</FormLabel>
              <OutlinedInput
                id="email" name="email" type="email" autoComplete="username"
                placeholder="usuario@fsph.gov.br" value={email} inputRef={emailInput}
                disabled={loading} inputProps={{ 'aria-describedby': errors.email ? 'email-erro' : undefined }}
                onChange={(event) => { setEmail(event.target.value); setErrors((previous) => ({ ...previous, email: undefined })); setError('') }}
              />
              {errors.email && <FormHelperText id="email-erro">{errors.email}</FormHelperText>}
            </FormControl>
            <FormControl fullWidth required error={Boolean(errors.senha)} className={styles['grupo-campo']}>
              <FormLabel htmlFor="senha">Senha</FormLabel>
              <OutlinedInput
                id="senha" name="senha" type="password" autoComplete="current-password"
                value={senha} inputRef={passwordInput} disabled={loading}
                inputProps={{ 'aria-describedby': errors.senha ? 'senha-erro' : undefined }}
                onChange={(event) => { setSenha(event.target.value); setErrors((previous) => ({ ...previous, senha: undefined })); setError('') }}
              />
              {errors.senha && <FormHelperText id="senha-erro">{errors.senha}</FormHelperText>}
            </FormControl>
            {error && <Alert severity="error" className={styles['mensagem-login']}>{error}</Alert>}
            {!error && notice && <Alert severity="info" className={styles['mensagem-login']}>{notice}</Alert>}
            <Button type="submit" variant="contained" fullWidth disabled={loading} className={styles['botao-entrar']}>
              {loading && <CircularProgress size={18} color="inherit" aria-label="Aguardando resposta" />}
              {loading ? 'Entrando…' : 'Entrar'}
            </Button>
            <span role="status" className={styles['somente-leitor']}>{loading ? 'Autenticando. Aguarde.' : ''}</span>
            <footer className={styles['rodape-login']}>
              <Link component="button" type="button" className={styles['link-esqueci-senha']} onClick={() => setRecoveryInfo(true)} disabled={loading}>
                Esqueci minha senha
              </Link>
              {recoveryInfo && <Alert severity="info" className={styles['mensagem-login']}>A recuperação de senha ainda não está disponível.</Alert>}
              <Typography component="p" className={styles['informacao-seguranca']}>Aratu · Ambiente seguro FSPH</Typography>
            </footer>
          </Box>
        </section>
      </Box>
    </Box>
  )
}
