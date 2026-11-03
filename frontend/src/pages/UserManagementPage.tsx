import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Breadcrumbs,
  Button,
  Chip,
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
import PersonAddAlt1 from '@mui/icons-material/PersonAddAlt1'
import Search from '@mui/icons-material/Search'
import PeopleAlt from '@mui/icons-material/PeopleAlt'
import { useAuth } from '../auth/useAuth'
import { PROFILE_HOMES } from '../auth/profiles'
import type { Profile } from '../auth/profiles'
import { tokenUserId } from '../auth/token'
import { listProfiles } from '../services/profileService'
import type { ProfileOption } from '../services/profileService'
import {
  activateUser,
  createUser,
  deactivateUser,
  listUsers,
  toProfile,
  updateUser,
} from '../services/usersService'
import type { ManagedUser } from '../users/userTypes'
import { validateUserForm } from '../users/userFormValidation'
import type { UserFormErrors, UserFormValues } from '../users/userFormValidation'
import styles from './UserManagementPage.module.css'

const pageSize = 10

const initialFormValues: UserFormValues = {
  name: '',
  email: '',
  password: '',
  roleId: '',
  active: true,
}

const colors = {
  primary: '#FF6B00',
  heading: '#1e293b',
  text: '#475569',
  secondary: '#64748b',
  border: '#e2e8f0',
  tableHeader: '#f8fafc',
}

const buttonSx = {
  textTransform: 'none' as const,
  fontWeight: 600,
  borderRadius: 1,
  minHeight: 44,
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

type FormMode = 'create' | 'edit'

interface PendingStatus {
  kind: 'deactivate' | 'activate'
  user: ManagedUser
}

function profileLabel(profile: Profile): string {
  return PROFILE_HOMES[profile].label
}

function messageFrom(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

export default function UserManagementPage() {
  const { api, session } = useAuth()
  const id = useId()
  const currentUserId = session ? tokenUserId(session.token) : null

  const [search, setSearch] = useState('')
  const [roleFilter, setRoleFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [page, setPage] = useState(1)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [profilesLoading, setProfilesLoading] = useState(true)
  const [profilesError, setProfilesError] = useState('')
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [actionError, setActionError] = useState('')
  const [successNotice, setSuccessNotice] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [formMode, setFormMode] = useState<FormMode>('create')
  const [editingUser, setEditingUser] = useState<ManagedUser | null>(null)
  const [formValues, setFormValues] = useState<UserFormValues>(initialFormValues)
  const [formErrors, setFormErrors] = useState<UserFormErrors>({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingStatus, setPendingStatus] = useState<PendingStatus | null>(null)
  const [confirming, setConfirming] = useState(false)

  useEffect(() => {
    let active = true

    listProfiles(api)
      .then((result) => {
        if (active) setProfiles(result)
      })
      .catch((error: unknown) => {
        if (active) setProfilesError(messageFrom(error, 'Não foi possível carregar os perfis de acesso.'))
      })
      .finally(() => {
        if (active) setProfilesLoading(false)
      })

    return () => {
      active = false
    }
  }, [api])

  const loadProfiles = useCallback(async () => {
    setProfilesLoading(true)
    setProfilesError('')
    try {
      setProfiles(await listProfiles(api))
    } catch (error) {
      setProfilesError(messageFrom(error, 'Não foi possível carregar os perfis de acesso.'))
    } finally {
      setProfilesLoading(false)
    }
  }, [api])

  function beginListRequest() {
    setListLoading(true)
    setListError('')
  }

  useEffect(() => {
    let active = true
    const role = roleFilter ? toProfile(roleFilter) : null

    listUsers(api, {
      ...(search.trim() ? { name: search.trim() } : {}),
      ...(role ? { role } : {}),
      ...(statusFilter ? { active: statusFilter === 'active' } : {}),
      page,
      pageSize,
    })
      .then((result) => {
        if (!active) return
        setListError('')
        setUsers(result.users)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        if (result.totalPages > 0 && page > result.totalPages) setPage(result.totalPages)
      })
      .catch((error: unknown) => {
        if (active) setListError(messageFrom(error, 'Não foi possível carregar os usuários.'))
      })
      .finally(() => {
        if (active) setListLoading(false)
      })

    return () => {
      active = false
    }
  }, [api, roleFilter, search, statusFilter, page, reloadKey])

  function updateSearch(value: string) {
    beginListRequest()
    setSearch(value)
    setPage(1)
  }

  function updateRoleFilter(value: string) {
    beginListRequest()
    setRoleFilter(value)
    setPage(1)
  }

  function updateStatusFilter(value: string) {
    beginListRequest()
    setStatusFilter(value)
    setPage(1)
  }

  function clearFilters() {
    beginListRequest()
    setSearch('')
    setRoleFilter('')
    setStatusFilter('')
    setPage(1)
  }

  function openCreateForm() {
    setFormMode('create')
    setEditingUser(null)
    setFormValues(initialFormValues)
    setFormErrors({})
    setFormError('')
    setSuccessNotice('')
    setFormOpen(true)
  }

  function openEditForm(user: ManagedUser) {
    setFormMode('edit')
    setEditingUser(user)
    setFormValues({
      name: user.name,
      email: user.email,
      password: '',
      roleId: user.roleId,
      active: user.active,
    })
    setFormErrors({})
    setFormError('')
    setSuccessNotice('')
    setFormOpen(true)
  }

  function closeForm() {
    if (saving) return
    setFormOpen(false)
    setEditingUser(null)
    setFormValues(initialFormValues)
    setFormErrors({})
    setFormError('')
  }

  function updateFormValue(field: keyof UserFormValues, value: string | boolean) {
    setFormValues((current) => ({ ...current, [field]: value }))
    setFormErrors((current) => ({ ...current, [field]: undefined }))
    setFormError('')
  }

  function refreshAfterMutation(nextPage = page) {
    beginListRequest()
    if (nextPage === page) {
      setReloadKey((current) => current + 1)
      return
    }
    setPage(nextPage)
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateUserForm(formValues, formMode)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    setSaving(true)
    setFormError('')
    try {
      if (formMode === 'create') {
        await createUser(api, {
          name: formValues.name.trim(),
          email: formValues.email.trim(),
          roleId: formValues.roleId,
          password: formValues.password,
          active: formValues.active ?? true,
        })
        setSuccessNotice('Usuário cadastrado com sucesso.')
      } else if (editingUser) {
        await updateUser(api, editingUser.id, {
          name: formValues.name.trim(),
          email: formValues.email.trim(),
          roleId: formValues.roleId,
          revision: editingUser.revision,
        })
        setSuccessNotice('Usuário atualizado com sucesso.')
      }
      setFormOpen(false)
      setEditingUser(null)
      setFormValues(initialFormValues)
      refreshAfterMutation(1)
    } catch (error) {
      setFormError(messageFrom(error, 'Não foi possível salvar o usuário.'))
    } finally {
      setSaving(false)
    }
  }

  async function handleConfirmStatus() {
    if (!pendingStatus) return
    setConfirming(true)
    setActionError('')
    try {
      if (pendingStatus.kind === 'deactivate') {
        await deactivateUser(api, pendingStatus.user.id)
        setSuccessNotice(`Usuário ${pendingStatus.user.name} inativado com sucesso.`)
      } else {
        await activateUser(api, pendingStatus.user.id)
        setSuccessNotice(`Usuário ${pendingStatus.user.name} reativado com sucesso.`)
      }
      setPendingStatus(null)
      beginListRequest()
      setReloadKey((current) => current + 1)
    } catch (error) {
      setActionError(messageFrom(error, 'Não foi possível alterar a situação do usuário.'))
      setPendingStatus(null)
    } finally {
      setConfirming(false)
    }
  }

  const hasFilters = Boolean(search.trim() || roleFilter || statusFilter)

  return (
    <Box className={styles.page}>
      <Breadcrumbs
        aria-label="Navegação estrutural"
        sx={{ mb: 2, color: colors.secondary, fontSize: '0.85rem' }}
      >
        <Typography variant="body2" sx={{ color: colors.secondary }}>
          Início
        </Typography>
        <Typography variant="body2" aria-current="page" sx={{ color: colors.heading }}>
          Usuários
        </Typography>
      </Breadcrumbs>

      <Box sx={{ mb: 3 }}>
        <Typography variant="body2" sx={{ color: colors.secondary, mb: 0.5 }}>
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
            <Typography variant="body2" sx={{ color: colors.secondary, mt: 0.5 }}>
              Cadastre, edite e controle a situação das contas e seus perfis de acesso.
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={<PersonAddAlt1 />}
            onClick={openCreateForm}
            sx={{
              ...buttonSx,
              backgroundColor: colors.primary,
              boxShadow: 'none',
              '&:hover': { backgroundColor: '#e85d00', boxShadow: 'none' },
            }}
          >
            Cadastrar usuário
          </Button>
        </Box>
      </Box>

      {successNotice && (
        <Alert severity="success" role="status" sx={{ mb: 2 }} onClose={() => setSuccessNotice('')}>
          {successNotice}
        </Alert>
      )}

      {actionError && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setActionError('')}>
          {actionError}
        </Alert>
      )}

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
            onChange={(event) => updateSearch(event.target.value)}
            aria-label="Buscar usuários por nome ou e-mail"
            sx={{
              ...fieldSx,
              flex: '1 1 240px',
              '& .MuiInputBase-root': { fontSize: '0.875rem' },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <Search sx={{ color: colors.secondary, fontSize: 20, mr: 1 }} />
                ),
              },
            }}
          />

          <FormControl size="small" sx={{ ...fieldSx, width: { xs: '100%', sm: 190 } }}>
            <Select
              displayEmpty
              value={roleFilter}
              onChange={(event) => updateRoleFilter(event.target.value)}
              inputProps={{ 'aria-label': 'Filtrar por perfil' }}
            >
              <MenuItem value="">Todos os perfis</MenuItem>
              {profiles.map((profile) => (
                <MenuItem key={profile.id} value={profile.name}>
                  {profileLabel(profile.name)}
                </MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl size="small" sx={{ ...fieldSx, width: { xs: '100%', sm: 150 } }}>
            <Select
              displayEmpty
              value={statusFilter}
              onChange={(event) => updateStatusFilter(event.target.value)}
              inputProps={{ 'aria-label': 'Filtrar por situação' }}
            >
              <MenuItem value="">Todos os status</MenuItem>
              <MenuItem value="active">Ativo</MenuItem>
              <MenuItem value="inactive">Inativo</MenuItem>
            </Select>
          </FormControl>

          {hasFilters && (
            <Button onClick={clearFilters} sx={{ ...buttonSx, color: colors.text }}>
              Limpar filtros
            </Button>
          )}
        </Box>

        {profilesError && (
          <Alert
            severity="warning"
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

        {listError && (
          <Alert
            severity="error"
            sx={{ m: 2, borderRadius: 1 }}
            action={
              <Button
                color="inherit"
                onClick={() => {
                  beginListRequest()
                  setReloadKey((current) => current + 1)
                }}
              >
                Tentar novamente
              </Button>
            }
          >
            {listError}
          </Alert>
        )}

        <TableContainer className={styles.tableContainer}>
          <Table aria-label="Usuários cadastrados" aria-busy={listLoading}>
            <TableHead>
              <TableRow>
                {['Usuário', 'E-mail', 'Perfil', 'Situação', 'Ações'].map((heading) => (
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
              {listLoading ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
                    <Box sx={{ py: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}>
                      <CircularProgress size={26} />
                      <Typography variant="body2" sx={{ color: colors.secondary }}>
                        Carregando usuários...
                      </Typography>
                    </Box>
                  </TableCell>
                </TableRow>
              ) : users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} sx={{ borderBottom: 0 }}>
                    <Box sx={{ py: 6, px: 3, display: 'flex', alignItems: 'center', flexDirection: 'column', textAlign: 'center' }}>
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
                      <Typography variant="subtitle1" sx={{ color: colors.heading, fontWeight: 700 }}>
                        {hasFilters ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
                      </Typography>
                      <Typography variant="body2" sx={{ color: colors.secondary, mt: 1, maxWidth: 480, lineHeight: 1.7 }}>
                        {hasFilters
                          ? 'Ajuste os filtros ou limpe a busca para ver todos os usuários.'
                          : 'Cadastre o primeiro usuário para começar a administrar os acessos.'}
                      </Typography>
                      {hasFilters && (
                        <Button onClick={clearFilters} sx={{ ...buttonSx, mt: 2, color: colors.primary }}>
                          Limpar filtros
                        </Button>
                      )}
                    </Box>
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => {
                  const ownAccount = user.id === currentUserId
                  return (
                    <TableRow key={user.id} hover>
                      <TableCell sx={{ color: colors.heading, fontWeight: 600 }}>{user.name}</TableCell>
                      <TableCell sx={{ color: colors.text }}>{user.email}</TableCell>
                      <TableCell sx={{ color: colors.text }}>{profileLabel(user.role)}</TableCell>
                      <TableCell>
                        <Chip
                          label={user.active ? 'Ativo' : 'Inativo'}
                          color={user.active ? 'success' : 'default'}
                          size="small"
                        />
                      </TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          <Button
                            size="small"
                            onClick={() => openEditForm(user)}
                            aria-label={`Editar ${user.name}`}
                            sx={{ ...buttonSx, minHeight: 36, color: colors.primary }}
                          >
                            Editar
                          </Button>
                          {user.active && !ownAccount && (
                            <Button
                              size="small"
                              color="error"
                              onClick={() => setPendingStatus({ kind: 'deactivate', user })}
                              aria-label={`Inativar ${user.name}`}
                              sx={{ ...buttonSx, minHeight: 36 }}
                            >
                              Inativar
                            </Button>
                          )}
                          {!user.active && (
                            <Button
                              size="small"
                              color="success"
                              onClick={() => setPendingStatus({ kind: 'activate', user })}
                              aria-label={`Reativar ${user.name}`}
                              sx={{ ...buttonSx, minHeight: 36 }}
                            >
                              Reativar
                            </Button>
                          )}
                        </Box>
                      </TableCell>
                    </TableRow>
                  )
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>

        <Box
          sx={{
            px: 2.5,
            py: 1.75,
            borderTop: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: 1.5,
            color: colors.secondary,
            fontSize: '0.8rem',
          }}
        >
          <Typography variant="body2" sx={{ color: colors.secondary, fontSize: '0.8rem' }}>
            {total === 0 ? 'Nenhum registro' : `${total} usuário(s) encontrado(s)`}
          </Typography>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Button
              size="small"
              onClick={() => {
                beginListRequest()
                setPage((current) => Math.max(1, current - 1))
              }}
              disabled={page <= 1 || listLoading}
              sx={{ ...buttonSx, minHeight: 36, color: colors.text }}
            >
              Anterior
            </Button>
            <Typography variant="body2" sx={{ color: colors.secondary, fontSize: '0.8rem' }}>
              Página {page} de {Math.max(1, totalPages)}
            </Typography>
            <Button
              size="small"
              onClick={() => {
                beginListRequest()
                setPage((current) => current + 1)
              }}
              disabled={page >= totalPages || listLoading}
              sx={{ ...buttonSx, minHeight: 36, color: colors.text }}
            >
              Próxima
            </Button>
          </Box>
        </Box>
      </Paper>

      <Dialog
        open={formOpen}
        onClose={closeForm}
        fullWidth
        maxWidth="sm"
        aria-labelledby={`${id}-dialog-title`}
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <DialogTitle id={`${id}-dialog-title`} sx={{ color: colors.heading, fontWeight: 700, pb: 1 }}>
            {formMode === 'create' ? 'Cadastrar usuário' : 'Editar usuário'}
          </DialogTitle>

          <DialogContent sx={{ pt: '12px !important' }}>
            <Typography variant="body2" sx={{ color: colors.secondary, mb: 3, lineHeight: 1.7 }}>
              {formMode === 'create'
                ? 'Preencha os dados e defina a senha inicial e o perfil de acesso.'
                : 'Atualize os dados cadastrais e o perfil de acesso. A situação é alterada pelas ações da listagem.'}
            </Typography>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <TextField
                label="Nome completo"
                fullWidth
                required
                value={formValues.name}
                error={Boolean(formErrors.name)}
                helperText={formErrors.name}
                onChange={(event) => updateFormValue('name', event.target.value)}
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
                onChange={(event) => updateFormValue('email', event.target.value)}
                sx={fieldSx}
              />

              <FormControl fullWidth required error={Boolean(formErrors.roleId)} sx={fieldSx}>
                <Select
                  displayEmpty
                  value={formValues.roleId}
                  disabled={profilesLoading || Boolean(profilesError)}
                  onChange={(event) => updateFormValue('roleId', event.target.value)}
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
                  <Typography variant="caption" role="alert" sx={{ color: '#d32f2f', mt: 0.5 }}>
                    {formErrors.roleId}
                  </Typography>
                )}
              </FormControl>

              {formMode === 'create' && (
                <>
                  <TextField
                    label="Senha inicial"
                    type="password"
                    autoComplete="new-password"
                    fullWidth
                    required
                    value={formValues.password}
                    error={Boolean(formErrors.password)}
                    helperText={formErrors.password ?? 'Máximo de 72 bytes em UTF-8.'}
                    onChange={(event) => updateFormValue('password', event.target.value)}
                    sx={fieldSx}
                  />

                  <FormControl fullWidth sx={fieldSx}>
                    <Select
                      value={formValues.active ? 'active' : 'inactive'}
                      onChange={(event) => updateFormValue('active', event.target.value === 'active')}
                      inputProps={{ 'aria-label': 'Situação inicial' }}
                    >
                      <MenuItem value="active">Ativo</MenuItem>
                      <MenuItem value="inactive">Inativo</MenuItem>
                    </Select>
                  </FormControl>
                </>
              )}

              {profilesLoading && (
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, color: colors.secondary }}>
                  <CircularProgress size={20} />
                  <Typography variant="body2">Carregando perfis de acesso...</Typography>
                </Box>
              )}

              {formError && <Alert severity="error">{formError}</Alert>}
            </Box>
          </DialogContent>

          <DialogActions sx={{ p: 2.5, pt: 1, gap: 1 }}>
            <Button
              variant="outlined"
              onClick={closeForm}
              disabled={saving}
              sx={{ ...buttonSx, borderColor: '#cbd5e1', color: colors.text }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving || profilesLoading || Boolean(profilesError)}
              startIcon={saving ? <CircularProgress size={18} color="inherit" /> : <PersonAddAlt1 />}
              sx={{
                ...buttonSx,
                backgroundColor: colors.primary,
                boxShadow: 'none',
                '&:hover': { backgroundColor: '#e85d00', boxShadow: 'none' },
              }}
            >
              {saving
                ? 'Salvando...'
                : formMode === 'create'
                  ? 'Cadastrar usuário'
                  : 'Salvar alterações'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog
        open={Boolean(pendingStatus)}
        onClose={() => { if (!confirming) setPendingStatus(null) }}
        fullWidth
        maxWidth="xs"
        aria-labelledby={`${id}-confirm-title`}
        slotProps={{ paper: { sx: { borderRadius: 2 } } }}
      >
        <DialogTitle id={`${id}-confirm-title`} sx={{ color: colors.heading, fontWeight: 700 }}>
          {pendingStatus?.kind === 'deactivate' ? 'Inativar usuário' : 'Reativar usuário'}
        </DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ color: colors.text, lineHeight: 1.7 }}>
            {pendingStatus?.kind === 'deactivate'
              ? `Ao inativar ${pendingStatus.user.name}, o acesso ao sistema será bloqueado imediatamente. O histórico é preservado.`
              : `Reativar ${pendingStatus?.user.name} devolverá o acesso ao sistema com o mesmo perfil.`}
          </Typography>
        </DialogContent>
        <DialogActions sx={{ p: 2.5, pt: 1, gap: 1 }}>
          <Button
            onClick={() => setPendingStatus(null)}
            disabled={confirming}
            sx={{ ...buttonSx, color: colors.text }}
          >
            Cancelar
          </Button>
          <Button
            variant="contained"
            color={pendingStatus?.kind === 'deactivate' ? 'error' : 'success'}
            onClick={() => void handleConfirmStatus()}
            disabled={confirming}
            sx={{ ...buttonSx, boxShadow: 'none' }}
          >
            {confirming
              ? 'Aguarde...'
              : pendingStatus?.kind === 'deactivate'
                ? 'Inativar'
                : 'Reativar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
