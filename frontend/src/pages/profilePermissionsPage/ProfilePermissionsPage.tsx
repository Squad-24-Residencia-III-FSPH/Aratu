import { useEffect, useId, useReducer, useState } from 'react'
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Grid,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material'
import AdminPanelSettings from '@mui/icons-material/AdminPanelSettings'
import AssignmentInd from '@mui/icons-material/AssignmentInd'
import DirectionsCar from '@mui/icons-material/DirectionsCar'
import InfoOutlined from '@mui/icons-material/InfoOutlined'
import LocalShipping from '@mui/icons-material/LocalShipping'
import MedicalServices from '@mui/icons-material/MedicalServices'
import PeopleAlt from '@mui/icons-material/PeopleAlt'
import SupportAgent from '@mui/icons-material/SupportAgent'
import type { SvgIconComponent } from '@mui/icons-material'
import { PROFILE_HOMES } from '../../auth/profiles'
import type { Profile } from '../../auth/profiles'
import { useAuth } from '../../auth/useAuth'
import { accessibleControls } from '../../components/ui/accessibleControls'
import {
  listProfiles,
  PROFILE_ACCESS_DENIED_MESSAGE,
  ProfileListError,
} from '../../services/profileService'
import { profileDialogReducer } from './profileDialogState'
import { profileListReducer } from './profileListState'
import type { ProfileListState } from './profileListState'

const profileIcons: Record<Profile, SvgIconComponent> = {
  GESTOR: LocalShipping,
  SOLICITANTE: AssignmentInd,
  ATENDENTE_SVO: SupportAgent,
  EQUIPE_SVO: MedicalServices,
  ADMINISTRADOR: AdminPanelSettings,
  MOTORISTA: DirectionsCar,
}

const pageControlSx = {
  ...accessibleControls,
  '& button, & a, & [tabindex]': {
    scrollMarginTop: '80px',
  },
}

/** Apresenta os perfis da API para consulta e encaminha a atribuição para o cadastro de Usuários. */
export default function ProfilePermissionsPage() {
  const { api } = useAuth()
  const [profilesState, dispatchProfiles] = useReducer(profileListReducer, { status: 'loading' })
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Perfis e permissões (consulta) — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  useEffect(() => {
    let isCurrentRequest = true
    void listProfiles(api).then((loadedProfiles) => {
      if (isCurrentRequest) dispatchProfiles({ type: 'loaded', profiles: loadedProfiles })
    }).catch((error: unknown) => {
      if (!isCurrentRequest) return
      dispatchProfiles({
        type: 'failed',
        reason: error instanceof ProfileListError && error.kind === 'forbidden'
          ? 'forbidden'
          : 'unavailable',
      })
    })
    return () => { isCurrentRequest = false }
  }, [api, retryCount])

  function retryLoadingProfiles() {
    dispatchProfiles({ type: 'loading' })
    setRetryCount((current) => current + 1)
  }

  return <ProfilePermissionsView profilesState={profilesState} onRetry={retryLoadingProfiles} />
}

/** Renderiza o conteúdo completo da página para cada estado da consulta de perfis. */
export function ProfilePermissionsView({
  profilesState,
  onRetry,
}: {
  profilesState: ProfileListState
  onRetry: () => void
}) {
  const dialogId = useId()
  const [selectedProfile, dispatchProfileDialog] = useReducer(profileDialogReducer, null)
  const profiles = profilesState.status === 'success' ? profilesState.profiles : []
  const selectedProfileData = profiles.find(({ profile }) => profile === selectedProfile)
  const usersAssignmentPath = `#${PROFILE_HOMES.ADMINISTRADOR.path}`

  function renderProfileFeedback() {
    if (profilesState.status === 'loading') {
      return (
        <Box role="status" aria-live="polite" aria-busy="true" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 3 }}>
          <CircularProgress size={24} />
          <Typography>Carregando perfis...</Typography>
        </Box>
      )
    }
    if (profilesState.status === 'forbidden') {
      return <Alert severity="error" sx={{ mb: 2 }}>{PROFILE_ACCESS_DENIED_MESSAGE}</Alert>
    }
    if (profilesState.status === 'error') {
      return (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button color="inherit" onClick={onRetry} sx={{ minHeight: 44 }}>Tentar novamente</Button>}
        >
          Não foi possível carregar os perfis. Tente novamente.
        </Alert>
      )
    }
    if (profilesState.status === 'empty') {
      return <Alert severity="info" sx={{ mb: 2 }}>Nenhum perfil foi encontrado.</Alert>
    }
    return null
  }

  return (
    <Box sx={{ maxWidth: 1400, mx: 'auto', ...pageControlSx }}>
      <Breadcrumbs aria-label="Navegação estrutural" sx={{ mb: 2 }}>
        <Typography color="text.secondary" variant="body2">Administração</Typography>
        <Typography color="text.primary" variant="body2">Perfis e Permissões</Typography>
      </Breadcrumbs>

      <Box
        sx={{
          display: 'flex',
          alignItems: { xs: 'flex-start', sm: 'center' },
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 2,
          mb: 3,
        }}
      >
        <Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 0.5 }}>
            Consulta somente leitura
          </Typography>
          <Typography component="h1" variant="h5" sx={{ fontWeight: 700 }}>
            Perfis e Permissões
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5, maxWidth: 720 }}>
            Consulte os perfis disponíveis no sistema. A atribuição ou alteração do perfil de uma conta é realizada no cadastro de Usuários.
          </Typography>
        </Box>
        <Button
          component="a"
          href={usersAssignmentPath}
          variant="contained"
          startIcon={<PeopleAlt aria-hidden="true" />}
          sx={{ minHeight: 44 }}
        >
          Atribuir perfil em Usuários
        </Button>
      </Box>

      {renderProfileFeedback()}

      {profilesState.status === 'success' && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          {profilesState.profiles.map(({ profile, description }) => {
            const Icon = profileIcons[profile]
            const profileLabelText = PROFILE_HOMES[profile].label
            return (
              <Grid key={profile} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Card variant="outlined" sx={{ height: '100%', borderRadius: 2, boxShadow: 1 }}>
                  <CardContent sx={{ p: 2.5, '&:last-child': { pb: 2.5 }, display: 'flex', flexDirection: 'column', height: '100%' }}>
                    <Icon aria-hidden="true" sx={{ color: 'primary.dark', mb: 1 }} />
                    <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
                      {profileLabelText}
                    </Typography>
                    {description && (
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                        {description}
                      </Typography>
                    )}
                    <Stack direction="row" spacing={1} useFlexGap sx={{ mt: 'auto', pt: 1.5, flexWrap: 'wrap' }}>
                      <Button
                        startIcon={<InfoOutlined aria-hidden="true" />}
                        onClick={() => dispatchProfileDialog({ type: 'open', profile })}
                        aria-label={`Consultar detalhes do perfil ${profileLabelText}`}
                        sx={{ minHeight: 44 }}
                      >
                        Consultar detalhes
                      </Button>
                      <Button
                        component="a"
                        href={usersAssignmentPath}
                        aria-label={`Atribuir perfil ${profileLabelText} em Usuários`}
                        sx={{ minHeight: 44 }}
                      >
                        Atribuir em Usuários
                      </Button>
                    </Stack>
                  </CardContent>
                </Card>
              </Grid>
            )
          })}
        </Grid>
      )}

      <Dialog
        open={selectedProfileData !== undefined}
        onClose={() => dispatchProfileDialog({ type: 'close' })}
        aria-labelledby={`${dialogId}-title`}
        aria-describedby={selectedProfileData?.description ? `${dialogId}-description` : undefined}
        fullWidth
        maxWidth="sm"
        slotProps={{ paper: { sx: pageControlSx } }}
      >
        {selectedProfileData && (
          <>
            <DialogTitle id={`${dialogId}-title`}>
              Consulta de perfil: {PROFILE_HOMES[selectedProfileData.profile].label}
            </DialogTitle>
            <DialogContent>
              {selectedProfileData.description && (
                <Typography id={`${dialogId}-description`} variant="body1" sx={{ mb: 2 }}>
                  {selectedProfileData.description}
                </Typography>
              )}
              <Alert severity="info">
                Esta tela é somente consultiva. A matriz oficial FROTA-36 ainda precisa ser confirmada pela equipe; nenhuma permissão está sendo alterada aqui. Para atribuir ou trocar o perfil de uma conta, acesse o cadastro de Usuários.
              </Alert>
            </DialogContent>
            <DialogActions sx={{ p: 2, gap: 1, flexWrap: 'wrap' }}>
              <Button
                autoFocus
                variant="outlined"
                onClick={() => dispatchProfileDialog({ type: 'close' })}
                sx={{ minHeight: 44 }}
              >
                Fechar
              </Button>
              <Button
                component="a"
                href={usersAssignmentPath}
                variant="contained"
                startIcon={<PeopleAlt aria-hidden="true" />}
                sx={{ minHeight: 44 }}
              >
                Atribuir em Usuários
              </Button>
            </DialogActions>
          </>
        )}
      </Dialog>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ p: 2 }}>
          <Typography component="h2" variant="subtitle1" sx={{ fontWeight: 600 }}>
            Matriz de Permissões por Módulo (Consulta)
          </Typography>
          <Typography id={`${dialogId}-matrix-help`} variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Representação provisória somente para consulta. Módulos e permissões aguardam confirmação da matriz FROTA-36; a atribuição de perfil às contas ocorre em Usuários.
          </Typography>
        </Box>
        <TableContainer
          role="region"
          aria-label="Matriz provisória de permissões. Use a rolagem horizontal para percorrer as colunas."
          aria-describedby={`${dialogId}-matrix-help`}
          tabIndex={0}
          sx={{
            overflowX: 'auto',
            '&:focus-visible': {
              outline: '3px solid',
              outlineColor: 'primary.dark',
              outlineOffset: '-3px',
            },
          }}
        >
          <Table aria-label="Matriz provisória de permissões por perfil" sx={{ minWidth: 720 }}>
            <TableHead>
              <TableRow>
                <TableCell component="th" scope="col" sx={{ fontWeight: 600 }}>Módulo</TableCell>
                {profiles.map(({ profile }) => (
                  <TableCell key={profile} component="th" scope="col" align="center" sx={{ fontWeight: 600 }}>
                    {PROFILE_HOMES[profile].label}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow>
                <TableCell component="th" scope="row">Módulos a confirmar</TableCell>
                {profiles.map(({ profile }) => (
                  <TableCell key={profile} align="center" sx={{ color: 'text.secondary' }}>
                    A definir
                  </TableCell>
                ))}
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>
    </Box>
  )
}
