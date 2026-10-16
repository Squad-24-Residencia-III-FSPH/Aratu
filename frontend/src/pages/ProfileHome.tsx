import { Alert, Box, Button, Typography } from '@mui/material'
import { useAuth } from '../auth/useAuth'
import { PROFILE_HOMES } from '../auth/profiles'
import type { Profile } from '../auth/profiles'
import logo from '../assets/aratu-logo.png'
import styles from './ProfileHome.module.css'

// FROTA-28 permite páginas iniciais provisórias enquanto as telas são construídas.
export default function ProfileHome({ profile }: { profile: Profile }) {
  const { session, logout } = useAuth()
  const home = PROFILE_HOMES[profile]
  if (!session) return null
  return (
    <Box className={styles['area-perfil']}>
      <Box component="header" className={styles['barra-sistema']}>
        <div className={styles['marca-sistema']}><img src={logo} alt="" /><strong>Aratu</strong></div>
        <div className={styles['usuario-sistema']}>
          <span>{session.nome}<small>{home.label}</small></span>
          <Button variant="outlined" onClick={logout}>Sair</Button>
        </div>
      </Box>
      <Box className={styles['estrutura-sistema']}>
        <Box component="nav" aria-label="Navegação principal" className={styles['menu-sistema']}>
          <Typography component="p" variant="body2">{home.label}</Typography>
          <a href={home.path} aria-current="page">{home.title}</a>
        </Box>
        <Box component="main" className={styles['inicio-perfil']}>
          <Typography component="h1" variant="h5">{home.title}</Typography>
          <Typography>Bem-vindo ao Aratu, {session.nome}.</Typography>
          <Alert severity="info">Esta área está em desenvolvimento.</Alert>
        </Box>
      </Box>
    </Box>
  )
}
