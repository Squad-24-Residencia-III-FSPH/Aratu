
import { useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material'
import type { SelectChangeEvent } from '@mui/material'
import PersonAddAlt1 from '@mui/icons-material/PersonAddAlt1'
import UploadFile from '@mui/icons-material/UploadFile'
import Search from '@mui/icons-material/Search'
import PeopleAlt from '@mui/icons-material/PeopleAlt'
import { useAuth } from '../auth/useAuth'
import { PROFILE_HOMES } from '../auth/profiles'
import type { Profile } from '../auth/profiles'
import { listProfiles } from '../services/profileService'
import type { ProfileOption } from '../services/profileService'
import { validateUserForm } from '../users/userFormValidation'
import type { UserFormErrors, UserFormValues } from '../users/userFormValidation'
import styles from './UserManagementPage.module.css'

const initialFormValues: UserFormValues = {
  name: '',
  email: '',
  password: '',
  roleId: '',
}

const colors = {
  primary: '#FF6B00',
  heading: '#1e293b',
  text: '#475569',
  secondary: '#64748b',
  border: '#e2e8f0',
  background: '#f4f6f8',
  tableHeader: '#f8fafc',
}

const buttonSx = {
  textTransform: 'none' as const,
  fontWeight: 600,
  borderRadius: 1,
  minHeight: 36,
}

const fieldSx = {
  '& .MuiInputLabel-root': {
    color: colors.secondary,
  },
  '& .MuiOutlinedInput-root': {
    borderRadius: 1,
    backgroundColor: '#fff',
    '& fieldset': {
      borderColor: colors.border,
    },
    '&:hover fieldset': {
      borderColor: '#cbd5e1',
    },
    '&.Mui-focused fieldset': {
      borderColor: colors.primary,
    },
  },
  '& .MuiFormHelperText-root': {
    marginLeft: 0,
  },
}

function profileLabel(profile: Profile): string {
  return PROFILE_HOMES[profile].label
}

export default function UserManagementPage() {
  const { api } = useAuth()
  const id = useId()

  const [formOpen, setFormOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [profilesError, setProfilesError] = useState('')
  const [formValues, setFormValues] =
    useState<UserFormValues>(initialFormValues)
  const [formErrors, setFormErrors] = useState<UserFormErrors>({})
  const [submitNotice, setSubmitNotice] = useState('')

  useEffect(() => {
    let active = true

    listProfiles(api)
      .then((result) => {
        if (active) setProfiles(result)
      })
      .catch((error: unknown) => {
        if (active) {
          setProfilesError(
            error instanceof Error
              ? error.message
              : 'Não foi possível carregar os perfis de acesso.',
          )
        }
      })
      .finally(() => {
        if (active) setProfilesLoading(false)
      })

    return () => {
      active = false
    }
  }, [api])

  async function loadProfiles() {
    setProfilesLoading(true)
    setProfilesError('')

    try {
      setProfiles(await listProfiles(api))
    } catch (error) {
      setProfilesError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os perfis de acesso.',
      )
    } finally {
      setProfilesLoading(false)
    }
  }

  function openForm() {
    setFormValues(initialFormValues)
    setFormErrors({})
    setSubmitNotice('')
    setFormOpen(true)
  }

  function closeForm() {
    setFormOpen(false)
    setFormValues(initialFormValues)
    setFormErrors({})
    setSubmitNotice('')
  }

  function updateFormValue(field: keyof UserFormValues, value: string) {
    setFormValues((current) => ({ ...current, [field]: value }))
    setFormErrors((current) => ({ ...current, [field]: undefined }))
    setSubmitNotice('')
  }

  function handleProfileChange(event: SelectChangeEvent<string>) {
    updateFormValue('roleId', event.target.value)
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const errors = validateUserForm(formValues)
    setFormErrors(errors)

    if (Object.keys(errors).length > 0) return

    setSubmitNotice(
      'O cadastro ainda não pode ser enviado porque a API de criação de usuários não está disponível.',
    )
  }

  return (
    <Box className={styles.page}>
      <Breadcrumbs
        aria-label="Navegação estrutural"
        sx={{ mb: 2, color: colors.secondary, fontSize: '0.85rem' }}
      >
        <Typography variant="body2" sx={{ color: colors.secondary }}>
          Início
        </Typography>
        <Typography
          variant="body2"
          aria-current="page"
          sx={{ color: colors.heading }}
        >
          Usuários
        </Typography>
      </Breadcrumbs>

      <Box sx={{ mb: 3 }}>
        <Typography
          variant="body2"
          sx={{ color: colors.secondary, mb: 0.5 }}
        >
          Administração do sistema
        </Typography>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: { xs: 'flex-start', sm: 'center' },
            flexWrap: 'wrap',
            gap: 2,
          }}
        >
          <Box>
            <Typography
              component="h1"
              variant="h4"
              sx={{
                fontWeight: 700,
                color: colors.heading,
                fontSize: { xs: '1.5rem', sm: '2rem' },
              }}
            >
              Gerenciar usuários
            </Typography>

            <Typography
              variant="body2"
              sx={{ color: colors.secondary, mt: 0.5 }}
            >
              Cadastre e gerencie os usuários e seus perfis de acesso.
            </Typography>
          </Box>

          <Box sx={{ display: 'flex', gap: 1.5, flexWrap: 'wrap' }}>
            <Button
              variant="outlined"
              startIcon={<UploadFile />}
              onClick={() => setImportOpen(true)}
              sx={{
                ...buttonSx,
                borderColor: '#cbd5e1',
                color: '#334155',
                '&:hover': {
                  borderColor: colors.primary,
                  backgroundColor: '#fff7ed',
                },
              }}
            >
              Importar
            </Button>

            <Button
              variant="contained"
              startIcon={<PersonAddAlt1 />}
              onClick={openForm}
              sx={{
                ...buttonSx,
                backgroundColor: colors.primary,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: '#e85d00',
                  boxShadow: 'none',
                },
              }}
            >
              Cadastrar usuário
            </Button>
          </Box>
        </Box>
      </Box>

      <Paper
        elevation={0}
        sx={{
          borderRadius: 2,
          backgroundColor: '#fff',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            p: 2.5,
            display: 'flex',
            alignItems: 'center',
            gap: 2,
            flexWrap: 'wrap',
            borderBottom: `1px solid ${colors.border}`,
          }}
        >
          <TextField
            size="small"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Buscar usuários por nome ou e-mail"
            sx={{
              ...fieldSx,
              flex: '1 1 240px',
              '& .MuiInputBase-root': { fontSize: '0.875rem' },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <Search
                    sx={{
                      color: colors.secondary,
                      fontSize: 20,
                      mr: 1,
                    }}
                  />
                ),
              },
            }}
          />

          <FormControl
            size="small"
            sx={{ ...fieldSx, width: { xs: '100%', sm: 190 } }}
          >
            <Select
              displayEmpty
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              inputProps={{ 'aria-label': 'Filtrar por perfil' }}
            >
              <MenuItem value="">Todos os perfis</MenuItem>
              {profiles.map((profile) => (
                <MenuItem key={profile.id} value={profile.id}>
                  {profileLabel(profile.name)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl
            size="small"
            sx={{ ...fieldSx, width: { xs: '100%', sm: 150 } }}
          >
            <Select
              displayEmpty
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
              inputProps={{ 'aria-label': 'Filtrar por situação' }}
            >
              <MenuItem value="">Todos os status</MenuItem>
              <MenuItem value="active">Ativo</MenuItem>
              <MenuItem value="inactive">Inativo</MenuItem>
            </Select>
          </FormControl>
        </Box>

        {profilesError && (
          <Alert
            severity="error"
            sx={{ m: 2, borderRadius: 1 }}
            action={
              <Button color="inherit" onClick={() => void loadProfiles()}>
                Tentar novamente
              </Button>
            }
          >
            Não foi possível carregar os perfis: {profilesError}
          </Alert>
        )}

        <TableContainer className={styles.tableContainer}>
          <Table aria-label="Usuários cadastrados">
            <TableHead>
              <TableRow>
                {[
                  'Usuário',
                  'E-mail',
                  'Matrícula',
                  'Unidade',
                  'Último acesso',
                  'Perfil',
                  'Status',
                  'Ações',
                ].map((heading) => (
                  <TableCell
                    key={heading}
                    scope="col"
                    sx={{
                      backgroundColor: colors.tableHeader,
                      color: colors.secondary,
                      fontWeight: 600,
                      fontSize: '0.8rem',
                      whiteSpace: 'nowrap',
                      borderBottom: `1px solid ${colors.border}`,
                      py: 1.75,
                    }}
                  >
                    {heading}
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              <TableRow>
                <TableCell colSpan={8} sx={{ borderBottom: 0, p: 0 }}>
                  <Box
                    sx={{
                      py: 6,
                      px: 3,
                      display: 'flex',
                      alignItems: 'center',
                      flexDirection: 'column',
                      textAlign: 'center',
                    }}
                  >
                    <Box
                      sx={{
                        width: 52,
                        height: 52,
                        borderRadius: 2,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: '#f1f5f9',
                        color: colors.secondary,
                        mb: 2,
                      }}
                    >
                      <PeopleAlt sx={{ fontSize: 28 }} />
                    </Box>

                    <Typography
                      variant="subtitle1"
                      sx={{ color: colors.heading, fontWeight: 700 }}
                    >
                      Lista de usuários indisponível
                    </Typography>

                    <Typography
                      variant="body2"
                      sx={{
                        color: colors.secondary,
                        mt: 1,
                        maxWidth: 480,
                        lineHeight: 1.7,
                      }}
                    >
                      A API de consulta de usuários ainda não está disponível.
                      Quando a integração for implementada, os usuários
                      aparecerão aqui e os filtros poderão ser aplicados.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            px: 2.5,
            py: 1.75,
            borderTop: `1px solid ${colors.border}`,
            color: colors.secondary,
            fontSize: '0.8rem',
          }}
        >
          A listagem será habilitada após a integração com a API de usuários.
        </Box>
      </Paper>

      <Dialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        fullWidth
        maxWidth="xs"
        aria-labelledby={`${id}-import-title`}
        slotProps={{
          paper: { sx: { borderRadius: 2 } },
        }}
      >
        <DialogTitle
          id={`${id}-import-title`}
          sx={{ color: colors.heading, fontWeight: 700 }}
        >
          Importar usuários
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: colors.text, lineHeight: 1.7 }}>
            A importação ainda não está disponível. O sistema não possui um
            fluxo de importação de usuários implementado.
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1 }}>
          <Button
            onClick={() => setImportOpen(false)}
            sx={{ ...buttonSx, color: colors.text }}
          >
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={formOpen}
        onClose={closeForm}
        fullWidth
        maxWidth="sm"
        aria-labelledby={`${id}-dialog-title`}
        slotProps={{
          paper: { sx: { borderRadius: 2 } },
        }}
      >
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <DialogTitle
            id={`${id}-dialog-title`}
            sx={{ color: colors.heading, fontWeight: 700, pb: 1 }}
          >
            Cadastrar usuário
          </DialogTitle>

          <DialogContent sx={{ pt: '12px !important' }}>
            <Typography
              variant="body2"
              sx={{ color: colors.secondary, mb: 3, lineHeight: 1.7 }}
            >
              Preencha os dados abaixo e selecione o perfil de acesso.
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label="Nome completo"
                fullWidth
                required
                value={formValues.name}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
                onChange={(event) =>
                  updateFormValue('name', event.target.value)
                }
                sx={fieldSx}
              />

              <TextField
                label="E-mail institucional"
                type="email"
                autoComplete="email"
                fullWidth
                required
                value={formValues.email}
                error={Boolean(formErrors.email)}
                helperText={formErrors.email}
                onChange={(event) =>
                  updateFormValue('email', event.target.value)
                }
                sx={fieldSx}
              />

              <TextField
                label="Senha inicial"
                type="password"
                autoComplete="new-password"
                fullWidth
                required
                value={formValues.password}
                error={Boolean(formErrors.password)}
                helperText={
                  formErrors.password ?? 'Máximo de 72 bytes em UTF-8.'
                }
                onChange={(event) =>
                  updateFormValue('password', event.target.value)
                }
                sx={fieldSx}
              />

              <FormControl
                fullWidth
                required
                error={Boolean(formErrors.roleId)}
                sx={fieldSx}
              >
                <Select
                  displayEmpty
                  value={formValues.roleId}
                  disabled={profilesLoading || Boolean(profilesError)}
                  onChange={handleProfileChange}
                  inputProps={{ 'aria-label': 'Perfil de acesso' }}
                >
                  <MenuItem value="" disabled>
                    Selecione o perfil de acesso
                  </MenuItem>
                  {profiles.map((profile) => (
                    <MenuItem key={profile.id} value={profile.id}>
                      {profileLabel(profile.name)}
                    </MenuItem>
                  ))}
                </Select>
                {formErrors.roleId && (
                  <Typography
                    variant="caption"
                    role="alert"
                    sx={{ color: '#d32f2f', mt: 0.5 }}
                  >
                    {formErrors.roleId}
                  </Typography>
                )}
              </FormControl>

              {profilesLoading && (
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1.5,
                    color: colors.secondary,
                  }}
                >
                  <CircularProgress size={20} />
                  <Typography variant="body2">
                    Carregando perfis de acesso...
                  </Typography>
                </Box>
              )}

              {profilesError && (
                <Alert
                  severity="warning"
                  action={
                    <Button
                      color="inherit"
                      onClick={() => void loadProfiles()}
                    >
                      Tentar novamente
                    </Button>
                  }
                >
                  {profilesError}
                </Alert>
              )}

              {!profilesLoading && !profilesError && profiles.length === 0 && (
                <Alert severity="info">
                  Nenhum perfil de acesso foi retornado pela API.
                </Alert>
              )}

              {submitNotice && (
                <Alert severity="warning">{submitNotice}</Alert>
              )}

              <Alert severity="info">
                O formulário está pronto visualmente, mas o cadastro só será
                concluído quando o endpoint de criação de usuários estiver
                disponível.
              </Alert>
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 2.5, pt: 1, gap: 1 }}>
            <Button
              variant="outlined"
              onClick={closeForm}
              sx={{
                ...buttonSx,
                borderColor: '#cbd5e1',
                color: colors.text,
              }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<PersonAddAlt1 />}
              sx={{
                ...buttonSx,
                backgroundColor: colors.primary,
                boxShadow: 'none',
                '&:hover': {
                  backgroundColor: '#e85d00',
                  boxShadow: 'none',
                },
              }}
            >
              Cadastrar usuário
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Box>
  )
}
