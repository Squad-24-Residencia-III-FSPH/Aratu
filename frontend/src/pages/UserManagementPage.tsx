import { useCallback, useEffect, useId, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Paper,
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
import ConfirmDialog from '../components/ui/ConfirmDialog'
import DataTable from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import { FormField, FormSelect } from '../components/ui/FormField'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import {
  activateUser,
  createUser,
  deactivateUser,
  listUsers,
  toProfile,
  updateUser,
} from '../services/usersService'
import type { ManagedUser } from '../users/userTypes'
import {
  resolveProfileChangeConfirmation,
  shouldConfirmProfileChange,
} from '../users/profileChangeConfirmation'
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
    minHeight: 44,
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

const USER_COLUMNS: readonly DataTableColumn<ManagedUser>[] = [
  {
    key: 'name',
    header: 'Usuário',
    width: 220,
    render: (user) => <Typography sx={{ color: colors.heading, fontWeight: 600 }}>{user.name}</Typography>,
  },
  {
    key: 'email',
    header: 'E-mail',
    width: 260,
    render: (user) => <Typography sx={{ color: colors.text }}>{user.email}</Typography>,
  },
  {
    key: 'role',
    header: 'Perfil',
    width: 180,
    render: (user) => <Typography sx={{ color: colors.text }}>{profileLabel(user.role)}</Typography>,
  },
  {
    key: 'status',
    header: 'Situação',
    width: 110,
    render: (user) => (
      <StatusChip
        label={user.active ? 'Ativo' : 'Inativo'}
        tone={user.active ? 'success' : 'neutral'}
      />
    ),
  },
]

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
  const [profileChangeConfirmationOpen, setProfileChangeConfirmationOpen] = useState(false)
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
    setProfileChangeConfirmationOpen(false)
    setFormMode('create')
    setEditingUser(null)
    setFormValues(initialFormValues)
    setFormErrors({})
    setFormError('')
    setSuccessNotice('')
    setFormOpen(true)
  }

  function openEditForm(user: ManagedUser) {
    setProfileChangeConfirmationOpen(false)
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
    setProfileChangeConfirmationOpen(false)
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

  async function saveUserForm() {
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

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const errors = validateUserForm(formValues, formMode)
    setFormErrors(errors)
    if (Object.keys(errors).length > 0) return

    if (shouldConfirmProfileChange(formMode, editingUser?.roleId ?? null, formValues.roleId)) {
      setProfileChangeConfirmationOpen(true)
      return
    }

    await saveUserForm()
  }

  async function handleConfirmProfileChange() {
    setProfileChangeConfirmationOpen(false)
    await resolveProfileChangeConfirmation('confirmed', saveUserForm)
  }

  async function handleCancelProfileChange() {
    setProfileChangeConfirmationOpen(false)
    await resolveProfileChangeConfirmation('cancelled', saveUserForm)
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
  const selectedProfile = profiles.find(({ id: profileId }) => profileId === formValues.roleId)
  const emptyContent = (
    <StateFeedback
      kind="empty"
      title={hasFilters ? 'Nenhum usuário encontrado' : 'Nenhum usuário cadastrado'}
      titleSx={{ color: colors.heading, fontWeight: 700 }}
      description={hasFilters
        ? 'Ajuste os filtros ou limpe a busca para ver todos os usuários.'
        : 'Cadastre o primeiro usuário para começar a administrar os acessos.'}
      descriptionSx={{ color: colors.secondary, mt: 1, maxWidth: 480, lineHeight: 1.7 }}
      icon={(
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
          }}
        >
          <PeopleAlt sx={{ fontSize: 28 }} />
        </Box>
      )}
      centered
      sx={{
        py: 6,
        px: 3,
        mb: 0,
        backgroundColor: 'transparent',
        boxShadow: 'none',
        border: 0,
        color: colors.text,
        '& .MuiAlert-icon': { p: 0 },
        '& .MuiAlert-message': { maxWidth: '100%' },
      }}
      actionLabel={hasFilters ? 'Limpar filtros' : undefined}
      onAction={hasFilters ? clearFilters : undefined}
      actionSx={{ ...buttonSx, mt: 2, color: colors.primary }}
    />
  )

  return (
    <Box className={styles.page}>
      <PageHeader
        title="Gerenciar usuários"
        titleVariant="h4"
        titleSx={{ color: colors.heading, fontSize: { xs: '1.5rem', sm: '2rem' } }}
        breadcrumbs={['Início', 'Usuários']}
        breadcrumbsSx={{ mb: 2, color: colors.secondary, fontSize: '0.85rem' }}
        eyebrow="Administração do sistema"
        description="Cadastre, edite e controle a situação das contas e seus perfis de acesso."
        descriptionSx={{ color: colors.secondary, mt: 0.5 }}
        sx={{ mb: 3 }}
        actions={(
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
        )}
      />

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
        <FilterBar
          label="Filtros de usuários"
          sx={{
            p: 2.5,
            mb: 0,
            border: 0,
            borderRadius: 0,
            borderBottom: `1px solid ${colors.border}`,
            boxShadow: 'none',
          }}
        >
          <Box sx={{ flex: '1 1 240px', minWidth: { xs: '100%', sm: 240 } }}>
            <FormField
              label="Buscar usuários por nome ou e-mail"
              hideLabel
              value={search}
              onChange={updateSearch}
              placeholder="Buscar por nome ou e-mail..."
              startAdornment={<Search sx={{ color: colors.secondary, fontSize: 20, mr: 1 }} />}
              sx={{
                ...fieldSx,
                '& .MuiInputBase-root': { fontSize: '0.875rem' },
              }}
            />
          </Box>

          <Box sx={{ width: { xs: '100%', sm: 190 } }}>
            <FormSelect
              label="Filtrar por perfil"
              hideLabel
              value={roleFilter}
              onChange={updateRoleFilter}
              options={profiles.map((profile) => ({
                value: profile.name,
                label: profileLabel(profile.name),
              }))}
              emptyLabel="Todos os perfis"
              displayEmpty
              sx={fieldSx}
            />
          </Box>

          <Box sx={{ width: { xs: '100%', sm: 150 } }}>
            <FormSelect
              label="Filtrar por situação"
              hideLabel
              value={statusFilter}
              onChange={updateStatusFilter}
              options={[
                { value: 'active', label: 'Ativo' },
                { value: 'inactive', label: 'Inativo' },
              ]}
              emptyLabel="Todos os status"
              displayEmpty
              sx={fieldSx}
            />
          </Box>

          {hasFilters && (
            <Button onClick={clearFilters} sx={{ ...buttonSx, color: colors.text }}>
              Limpar filtros
            </Button>
          )}
        </FilterBar>

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
          <StateFeedback
            kind="error"
            title={listError}
            sx={{ m: 2, borderRadius: 1 }}
            actionLabel="Tentar novamente"
            onAction={() => {
              beginListRequest()
              setReloadKey((current) => current + 1)
            }}
          />
        )}

        {!listError && <DataTable
          caption="Usuários cadastrados"
          columns={USER_COLUMNS}
          rows={users}
          rowKey={(user) => user.id}
          busy={listLoading}
          loadingContent={(
            <StateFeedback
              kind="loading"
              title="Carregando usuários..."
              progressSize={26}
              sx={{ py: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}
            />
          )}
          emptyContent={emptyContent}
          stateCellSx={{ py: 0, borderBottom: 0 }}
          containerClassName={styles.tableContainer}
          minWidth={960}
          tableLayout="fixed"
          actionsWidth={190}
          paperSx={{ borderRadius: 0, overflow: 'hidden', border: 0, boxShadow: 'none' }}
          headerCellSx={{
            backgroundColor: colors.tableHeader,
            color: colors.secondary,
            fontSize: '0.8rem',
            borderBottom: `1px solid ${colors.border}`,
            py: 1.75,
          }}
          renderActions={(user) => {
            const ownAccount = user.id === currentUserId
            return (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                <Button
                  size="small"
                  onClick={() => openEditForm(user)}
                  aria-label={`Editar ${user.name}`}
                  sx={{ ...buttonSx, color: colors.primary }}
                >
                  Editar
                </Button>
                {user.active && !ownAccount && (
                  <Button
                    size="small"
                    color="error"
                    onClick={() => setPendingStatus({ kind: 'deactivate', user })}
                    aria-label={`Inativar ${user.name}`}
                    sx={buttonSx}
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
                    sx={buttonSx}
                  >
                    Reativar
                  </Button>
                )}
              </Box>
            )
          }}
        />}

        {!listError && <Box
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
              sx={{ ...buttonSx, color: colors.text }}
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
              sx={{ ...buttonSx, color: colors.text }}
            >
              Próxima
            </Button>
          </Box>
        </Box>}
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
              <FormField
                label="Nome completo"
                required
                value={formValues.name}
                error={formErrors.name}
                onChange={(value) => updateFormValue('name', value)}
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

              <FormSelect
                label="Perfil de acesso"
                hideLabel
                value={formValues.roleId}
                onChange={(value) => updateFormValue('roleId', value)}
                options={profiles.map((profile) => ({
                  value: profile.id,
                  label: profileLabel(profile.name),
                }))}
                emptyLabel="Selecione o perfil de acesso"
                emptyOptionDisabled
                displayEmpty
                required
                disabled={profilesLoading || Boolean(profilesError)}
                error={formErrors.roleId}
                sx={fieldSx}
              />

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

                  <FormSelect
                    label="Situação inicial"
                    hideLabel
                    value={formValues.active ? 'active' : 'inactive'}
                    onChange={(value) => updateFormValue('active', value === 'active')}
                    options={[
                      { value: 'active', label: 'Ativo' },
                      { value: 'inactive', label: 'Inativo' },
                    ]}
                    sx={fieldSx}
                  />
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

      <ConfirmDialog
        open={profileChangeConfirmationOpen}
        title="Confirmar mudança de perfil"
        description={(
          <Typography variant="body2" sx={{ color: colors.text, lineHeight: 1.7 }}>
            {editingUser && (
              <>Confirme a alteração do perfil de {editingUser.name} de {profileLabel(editingUser.role)} para {selectedProfile ? profileLabel(selectedProfile.name) : 'perfil selecionado'}. A mudança será enviada à API ao confirmar.</>
            )}
          </Typography>
        )}
        cancelLabel="Cancelar alteração"
        confirmLabel="Confirmar mudança de perfil"
        onCancel={() => void handleCancelProfileChange()}
        onConfirm={() => void handleConfirmProfileChange()}
        autoFocusCancel
        paperSx={{ borderRadius: 2 }}
        actionsSx={{ p: 2.5, pt: 1, gap: 1 }}
        cancelSx={{ ...buttonSx, color: colors.text }}
        confirmSx={{
          ...buttonSx,
          backgroundColor: colors.primary,
          boxShadow: 'none',
          '&:hover': { backgroundColor: '#e85d00', boxShadow: 'none' },
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title={pendingStatus?.kind === 'deactivate' ? 'Inativar usuário' : 'Reativar usuário'}
        description={(
          <Typography variant="body2" sx={{ color: colors.text, lineHeight: 1.7 }}>
            {pendingStatus?.kind === 'deactivate'
              ? `Ao inativar ${pendingStatus.user.name}, o acesso ao sistema será bloqueado imediatamente. O histórico é preservado.`
              : `Reativar ${pendingStatus?.user.name} devolverá o acesso ao sistema com o mesmo perfil.`}
          </Typography>
        )}
        confirmLabel={pendingStatus?.kind === 'deactivate' ? 'Inativar' : 'Reativar'}
        loadingLabel="Aguarde..."
        onCancel={() => setPendingStatus(null)}
        onConfirm={() => void handleConfirmStatus()}
        loading={confirming}
        danger={pendingStatus?.kind === 'deactivate'}
        confirmColor={pendingStatus?.kind === 'activate' ? 'success' : undefined}
        paperSx={{ borderRadius: 2 }}
        actionsSx={{ p: 2.5, pt: 1, gap: 1 }}
        cancelSx={{ ...buttonSx, color: colors.text }}
        confirmSx={{ ...buttonSx, boxShadow: 'none' }}
      />
    </Box>
  )
}
