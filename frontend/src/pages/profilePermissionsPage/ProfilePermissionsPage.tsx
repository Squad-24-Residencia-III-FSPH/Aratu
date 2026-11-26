import { useEffect, useId, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Menu,
  MenuItem,
  Pagination,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material'
import MoreVert from '@mui/icons-material/MoreVert'
import Add from '@mui/icons-material/Add'
import PageHeader from '../../components/ui/PageHeader'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { useAuth } from '../../auth/useAuth'
import { hasPermission } from '../../auth/access'
import {
  createProfile,
  getProfile,
  listPermissions,
  listProfiles,
  setProfileActive,
  updateProfile,
} from '../../services/profileService'
import type {
  PermissionOption,
  ProfileDetails,
  ProfileMutation,
  ProfileOption,
} from '../../services/profileService'

const PAGE_SIZE = 10
const INITIAL_FILTER = true

interface ProfileForm {
  code: string
  displayName: string
  description: string
  defaultPath: string
  permissionIds: string[]
  reason: string
}

interface PendingStatus {
  profile: ProfileOption
  active: boolean
  reason: string
}

const EMPTY_FORM: ProfileForm = {
  code: '', displayName: '', description: '', defaultPath: '', permissionIds: [], reason: '',
}

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function ProfileRowActions({
  profile,
  onEdit,
  onStatus,
  canManage,
}: {
  profile: ProfileOption
  onEdit: (profile: ProfileOption) => void
  onStatus: (profile: ProfileOption, active: boolean) => void
  canManage: boolean
}) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  const menuId = useId()
  return (
    <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 0.5 }}>
      {canManage && <Button onClick={() => onEdit(profile)} sx={{ minHeight: 44, textTransform: 'none' }}>
        Editar
      </Button>}
      {canManage && <IconButton
        aria-label={`Mais ações para ${profile.displayName}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(anchor)}
        aria-controls={anchor ? menuId : undefined}
        onClick={(event) => setAnchor(event.currentTarget)}
        sx={{ minWidth: 44, minHeight: 44 }}
      >
        <MoreVert aria-hidden="true" />
      </IconButton>}
      {canManage && <Menu id={menuId} anchorEl={anchor} open={Boolean(anchor)} onClose={() => setAnchor(null)}>
        <MenuItem onClick={() => { setAnchor(null); onStatus(profile, !profile.active) }} sx={{ minHeight: 44 }}>
          {profile.active ? 'Arquivar' : 'Restaurar'}
        </MenuItem>
      </Menu>}
    </Box>
  )
}

/** Gerencia códigos de acesso reais, perfis e concessões aplicadas pelo servidor. */
export default function ProfilePermissionsPage() {
  const { api, session } = useAuth()
  const canRead = hasPermission(session, 'profiles:read')
  const canManage = hasPermission(session, 'profiles:manage')
  const dialogId = useId()
  const [search, setSearch] = useState('')
  const [activeFilter, setActiveFilter] = useState<boolean | undefined>(INITIAL_FILTER)
  const [page, setPage] = useState(1)
  const [profiles, setProfiles] = useState<ProfileOption[]>([])
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [listLoading, setListLoading] = useState(true)
  const [listError, setListError] = useState('')
  const [listReload, setListReload] = useState(0)
  const [catalog, setCatalog] = useState<PermissionOption[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<ProfileDetails | null>(null)
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM)
  const [formLoading, setFormLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [pendingStatus, setPendingStatus] = useState<PendingStatus | null>(null)
  const [statusBusy, setStatusBusy] = useState(false)
  const [pageNotice, setPageNotice] = useState('')

  const permissionsByModule = useMemo(() => {
    const groups = new Map<string, PermissionOption[]>()
    for (const permission of catalog) {
      const values = groups.get(permission.module) ?? []
      values.push(permission)
      groups.set(permission.module, values)
    }
    return [...groups]
  }, [catalog])

  useEffect(() => {
    if (!canManage) return
    let active = true
    listPermissions(api)
      .then((loaded) => { if (active) { setCatalog(loaded); setCatalogError('') } })
      .catch((error: unknown) => { if (active) setCatalogError(errorText(error, 'Não foi possível carregar o catálogo de permissões.')) })
      .finally(() => { if (active) setCatalogLoading(false) })
    return () => { active = false }
  }, [api, canManage])

  useEffect(() => {
    if (!canRead) return
    let active = true
    listProfiles(api, {
      ...(activeFilter !== undefined ? { active: activeFilter } : {}),
      ...(search.trim() ? { search: search.trim() } : {}),
      page,
      pageSize: PAGE_SIZE,
    })
      .then((result) => {
        if (!active) return
        setListError('')
        setProfiles(result.profiles)
        setTotal(result.total)
        setTotalPages(result.totalPages)
        if (result.totalPages > 0 && page > result.totalPages) setPage(result.totalPages)
      })
      .catch((error: unknown) => { if (active) setListError(errorText(error, 'Não foi possível carregar os perfis.')) })
      .finally(() => { if (active) setListLoading(false) })
    return () => { active = false }
  }, [activeFilter, api, canRead, listReload, page, search])

  function refreshList() {
    setListLoading(true)
    setListError('')
    setListReload((current) => current + 1)
  }

  function updateFilter(next: boolean | undefined) {
    setListLoading(true)
    setListError('')
    setActiveFilter(next)
    setPage(1)
  }

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
    setDialogOpen(true)
  }

  async function openEdit(profile: ProfileOption) {
    setFormLoading(true)
    setFormError('')
    setDialogOpen(true)
    try {
      const details = await getProfile(api, profile.id)
      setEditing(details)
      setForm({
        code: details.name,
        displayName: details.displayName,
        description: details.description ?? '',
        defaultPath: details.defaultPath ?? '',
        permissionIds: details.permissions.map(({ id }) => id),
        reason: '',
      })
    } catch (error) {
      setDialogOpen(false)
      setPageNotice(errorText(error, 'Não foi possível carregar o perfil.'))
    } finally { setFormLoading(false) }
  }

  function closeForm() {
    if (saving) return
    setDialogOpen(false)
    setEditing(null)
    setForm(EMPTY_FORM)
    setFormError('')
  }

  function updateField(field: keyof ProfileForm, value: string) {
    setForm((current) => ({ ...current, [field]: value }))
    setFormError('')
  }

  function togglePermission(permission: PermissionOption, checked: boolean) {
    setForm((current) => {
      const selected = new Set(current.permissionIds)
      if (checked) {
        if (permission.scopeGroup) {
          for (const item of catalog) {
            if (item.scopeGroup === permission.scopeGroup) selected.delete(item.id)
          }
        }
        selected.add(permission.id)
      } else selected.delete(permission.id)
      const nextIds = [...selected]
      const allowedPaths = new Set(catalog.filter(({ id }) => selected.has(id)).map(({ defaultPath }) => defaultPath))
      const nextHome = allowedPaths.has(current.defaultPath) ? current.defaultPath : ''
      return { ...current, permissionIds: nextIds, defaultPath: nextHome }
    })
    setFormError('')
  }

  const selectedNames = useMemo(() => new Set(catalog.filter(({ id }) => form.permissionIds.includes(id)).map(({ name }) => name)), [catalog, form.permissionIds])
  const missingDependencies = useMemo(() => catalog
    .filter(({ id }) => form.permissionIds.includes(id))
    .flatMap((permission) => permission.dependencies.filter((name) => !selectedNames.has(name)).map((name) => ({ permission, name }))),
  [catalog, form.permissionIds, selectedNames])
  const homeOptions = useMemo(() => [...new Set(catalog
    .filter(({ id }) => form.permissionIds.includes(id))
    .map(({ defaultPath }) => defaultPath))], [catalog, form.permissionIds])

  async function submitProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!form.displayName.trim() || !form.reason.trim() || (!editing && !form.code.trim())) {
      setFormError('Preencha o código, o nome e o motivo da alteração.')
      return
    }
    if (missingDependencies.length > 0) {
      setFormError('Revise as dependências indicadas antes de salvar.')
      return
    }
    setSaving(true)
    setFormError('')
    const input: ProfileMutation = {
      ...(editing ? {} : { code: form.code.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '') }),
      displayName: form.displayName.trim(),
      description: form.description.trim() || null,
      defaultPath: form.defaultPath || null,
      permissionIds: form.permissionIds,
      reason: form.reason.trim(),
      ...(editing ? { expectedRevision: editing.revision } : {}),
    }
    try {
      if (editing) await updateProfile(api, editing.id, input)
      else await createProfile(api, input, crypto.randomUUID())
      setPageNotice(editing ? 'Perfil atualizado.' : 'Perfil criado.')
      setDialogOpen(false)
      setEditing(null)
      setForm(EMPTY_FORM)
      setPage(1)
      refreshList()
    } catch (error) { setFormError(errorText(error, 'Não foi possível salvar o perfil.')) }
    finally { setSaving(false) }
  }

  async function confirmStatusChange() {
    if (!pendingStatus) return
    if (!pendingStatus.reason.trim()) return
    setStatusBusy(true)
    try {
      await setProfileActive(api, pendingStatus.profile.id, pendingStatus.active, pendingStatus.profile.revision, pendingStatus.reason.trim())
      setPageNotice(pendingStatus.active ? 'Perfil restaurado.' : 'Perfil arquivado.')
      setPendingStatus(null)
      refreshList()
    } catch (error) {
      setPageNotice(errorText(error, 'Não foi possível alterar a situação do perfil.'))
      setPendingStatus(null)
    } finally { setStatusBusy(false) }
  }

  const columns: readonly DataTableColumn<ProfileOption>[] = [
    { key: 'displayName', header: 'Perfil', width: 260, render: (profile) => (
      <Box><Typography sx={{ fontWeight: 600 }}>{profile.displayName}</Typography>
        <Typography variant="caption" color="text.secondary">{profile.name}</Typography></Box>
    ) },
    { key: 'users', header: 'Contas ativas', width: 120, render: (profile) => profile.activeUserCount },
    { key: 'status', header: 'Situação', width: 130, render: (profile) => (
      <StatusChip label={profile.active ? 'Ativo' : 'Arquivado'} tone={profile.active ? 'success' : 'neutral'} />
    ) },
  ]

  const tableRows = profiles.map((profile) => ({ ...profile }))

  return (
    <Box sx={{ width: '100%', minWidth: 0 }}>
      <PageHeader
        title="Perfis de acesso"
        eyebrow="Administração"
        description="Combine permissões existentes entre módulos e controle a página inicial de cada perfil."
        actions={canManage ? <Button variant="contained" startIcon={<Add aria-hidden="true" />} onClick={openCreate} sx={{ minHeight: 44, textTransform: 'none' }}>Novo perfil</Button> : undefined}
      />

      {!canRead && <StateFeedback kind="forbidden" title="Acesso restrito" description="Seu perfil não pode consultar os perfis de acesso." />}
      {pageNotice && <Alert role="status" severity="info" sx={{ mb: 2 }} onClose={() => setPageNotice('')}>{pageNotice}</Alert>}

      {canRead && <Paper variant="outlined" sx={{ p: 2, mb: 2, display: 'flex', gap: 1.5, alignItems: 'center', flexWrap: 'wrap' }}>
        <TextField
          id={`${dialogId}-search`}
          label="Buscar perfil"
          value={search}
          onChange={(event: ChangeEvent<HTMLInputElement>) => { setListLoading(true); setListError(''); setSearch(event.target.value); setPage(1) }}
          size="small"
          sx={{ minWidth: { xs: '100%', sm: 240 }, '& .MuiInputBase-root': { minHeight: 44 } }}
        />
        <TextField
          id={`${dialogId}-status-filter`}
          select
          label="Situação"
          value={activeFilter === undefined ? 'all' : activeFilter ? 'active' : 'archived'}
          onChange={(event: ChangeEvent<HTMLInputElement>) => updateFilter(event.target.value === 'all' ? undefined : event.target.value === 'active')}
          size="small"
          sx={{ minWidth: 170, '& .MuiInputBase-root': { minHeight: 44 } }}
        >
          <MenuItem value="active">Ativos</MenuItem>
          <MenuItem value="archived">Arquivados</MenuItem>
          <MenuItem value="all">Todos</MenuItem>
        </TextField>
        <Typography variant="body2" color="text.secondary" sx={{ ml: 'auto' }} aria-live="polite">
          {total} {total === 1 ? 'perfil' : 'perfis'}
        </Typography>
      </Paper>}

      {canManage && catalogError && <Alert severity="warning" sx={{ mb: 2 }} action={<Button color="inherit" onClick={() => {
        setCatalogLoading(true)
        setCatalogError('')
        listPermissions(api).then(setCatalog).catch((error: unknown) => setCatalogError(errorText(error, 'Não foi possível carregar o catálogo de permissões.'))).finally(() => setCatalogLoading(false))
      }} sx={{ minHeight: 44 }}>Tentar novamente</Button>}>{catalogError}</Alert>}
      {canRead && (listError ? (
        <StateFeedback kind="error" title={listError} actionLabel="Tentar novamente" onAction={() => refreshList()} />
      ) : (
        <DataTable
          caption="Perfis de acesso"
          columns={columns}
          rows={tableRows}
          rowKey={(profile) => profile.id}
          busy={listLoading}
          loadingContent={<StateFeedback kind="loading" title="Carregando perfis..." progressSize={24} />}
          emptyContent={<StateFeedback kind="empty" title="Nenhum perfil neste filtro" description="Ajuste a busca ou crie um perfil para organizar as permissões de acesso." />}
          containerClassName=""
          minWidth={640}
          actionsWidth={160}
          renderActions={(profile) => (
            <ProfileRowActions
              profile={profile}
              canManage={canManage}
              onEdit={(selected) => { void openEdit(selected) }}
              onStatus={(selected, active) => setPendingStatus({ profile: selected, active, reason: '' })}
            />
          )}
        />
      ))}

      {totalPages > 1 && (
          <Stack direction="row" sx={{ py: 2, justifyContent: 'center' }}>
          <Pagination count={totalPages} page={page} onChange={(_event, nextPage) => { setListLoading(true); setListError(''); setPage(nextPage) }} aria-label="Paginação de perfis" />
        </Stack>
      )}

      <Dialog open={dialogOpen} onClose={closeForm} fullWidth maxWidth="md" aria-labelledby={`${dialogId}-title`}>
        <Box component="form" onSubmit={(event: FormEvent<HTMLFormElement>) => void submitProfile(event)}>
          <DialogTitle id={`${dialogId}-title`}>{editing ? `Editar ${editing.displayName}` : 'Novo perfil'}</DialogTitle>
          <DialogContent dividers>
            {formLoading || catalogLoading ? (
              <Box role="status" aria-live="polite" aria-busy="true" sx={{ display: 'flex', alignItems: 'center', gap: 1, py: 4 }}>
                <CircularProgress size={24} /><Typography>Carregando dados do perfil...</Typography>
              </Box>
            ) : (
              <Stack spacing={2} sx={{ pt: 1 }}>
                {formError && <Alert severity="error" role="alert">{formError}</Alert>}
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                  {!editing && <TextField id={`${dialogId}-code`} label="Código estável" required value={form.code} onChange={(event) => updateField('code', event.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_'))} helperText="Letras, números e sublinhado. O código não pode ser alterado depois." fullWidth slotProps={{ htmlInput: { maxLength: 63 } }} />}
                  {editing && <TextField label="Código estável" value={editing.name} disabled fullWidth />}
                  <TextField id={`${dialogId}-display-name`} label="Nome do perfil" required value={form.displayName} onChange={(event) => updateField('displayName', event.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 100 } }} />
                </Stack>
                <TextField id={`${dialogId}-description`} label="Descrição" value={form.description} onChange={(event) => updateField('description', event.target.value)} multiline minRows={2} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
                <TextField
                  id={`${dialogId}-home`}
                  select
                  label="Página inicial"
                  value={form.defaultPath}
                  onChange={(event) => updateField('defaultPath', event.target.value)}
                  helperText="As opções dependem das permissões selecionadas."
                  fullWidth
                >
                  <MenuItem value="">Sem página inicial definida</MenuItem>
                  {homeOptions.map((path) => <MenuItem key={path} value={path}>{path}</MenuItem>)}
                </TextField>

                <Box>
                  <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>Permissões</Typography>
                  <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
                    A ausência de uma permissão bloqueia a ação. Escopos como “próprios” e “todos” são exclusivos.
                  </Typography>
                  {missingDependencies.length > 0 && (
                    <Alert severity="warning" sx={{ mb: 1 }}>
                      Complete as dependências: {missingDependencies.map(({ permission, name }) => `${permission.label} → ${name}`).join('; ')}.
                    </Alert>
                  )}
                  <Stack spacing={1}>
                    {permissionsByModule.map(([module, permissions]) => (
                      <Paper key={module} variant="outlined" sx={{ p: 1.5 }}>
                        <Typography component="h4" variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>{module}</Typography>
                        <Stack spacing={0.25}>
                          {permissions.map((permission) => {
                            const checked = form.permissionIds.includes(permission.id)
                            return (
                              <FormControlLabel
                                key={permission.id}
                                control={(
                                  <Checkbox
                                    id={`${dialogId}-permission-${permission.id}`}
                                    checked={checked}
                                    onChange={(_event, nextChecked) => togglePermission(permission, nextChecked)}
                                    slotProps={{ input: { 'aria-describedby': `${dialogId}-permission-help-${permission.id}` } }}
                                  />
                                )}
                                label={(
                                  <Box component="span" sx={{ display: 'block' }}>
                                    <Typography component="span" variant="body2" sx={{ fontWeight: 600 }}>{permission.label}</Typography>
                                    <Typography id={`${dialogId}-permission-help-${permission.id}`} component="span" variant="caption" color="text.secondary" sx={{ display: 'block' }}>
                                      {permission.description}{permission.scopeGroup ? ` · Escopo ${permission.name.split(':').at(-1)}` : ''}
                                    </Typography>
                                  </Box>
                                )}
                                sx={{ minHeight: 44, alignItems: 'center', ml: 0, mr: 0, py: 0.25 }}
                              />
                            )
                          })}
                        </Stack>
                      </Paper>
                    ))}
                  </Stack>
                </Box>

                <TextField id={`${dialogId}-reason`} label="Motivo da alteração" required value={form.reason} onChange={(event) => updateField('reason', event.target.value)} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
              </Stack>
            )}
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={closeForm} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
            <Button type="submit" variant="contained" disabled={saving || formLoading || catalogLoading} sx={{ minHeight: 44 }}>
              {saving ? 'Salvando…' : 'Salvar perfil'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      <Dialog open={pendingStatus !== null} onClose={() => { if (!statusBusy) setPendingStatus(null) }} fullWidth maxWidth="xs" aria-labelledby={`${dialogId}-status-title`}>
        <DialogTitle id={`${dialogId}-status-title`}>{pendingStatus?.active ? 'Restaurar perfil' : 'Arquivar perfil'}</DialogTitle>
        <DialogContent>
          <Typography variant="body2" sx={{ mb: 2 }}>
            {pendingStatus?.profile.displayName}: {pendingStatus?.active ? 'o perfil poderá ser atribuído novamente.' : 'o perfil deixará de autenticar novas sessões; contas ativas precisam ser transferidas antes.'}
          </Typography>
          <TextField id={`${dialogId}-status-reason`} label="Motivo" required value={pendingStatus?.reason ?? ''} onChange={(event) => setPendingStatus((current) => current ? { ...current, reason: event.target.value } : current)} fullWidth slotProps={{ htmlInput: { maxLength: 500 } }} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setPendingStatus(null)} disabled={statusBusy} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" onClick={() => void confirmStatusChange()} disabled={statusBusy || !pendingStatus?.reason.trim()} sx={{ minHeight: 44 }}>
            {statusBusy ? 'Salvando…' : pendingStatus?.active ? 'Restaurar perfil' : 'Arquivar perfil'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
