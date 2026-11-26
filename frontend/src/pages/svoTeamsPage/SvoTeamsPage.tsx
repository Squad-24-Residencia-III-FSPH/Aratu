import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Alert, Box, Button, Card, CardContent, Dialog, DialogActions, DialogContent, DialogTitle,
  Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import { hasPermission } from '../../auth/access'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import RowActionsMenu from '../../components/ui/RowActionsMenu'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import {
  addSvoTeamMember, cancelSvoShift, createSvoShift, createSvoTeam, listEligibleSvoMembers,
  listSvoTeamPage, removeSvoTeamMember, updateSvoShift, updateSvoTeam,
} from '../../services/svoTeamsService'
import type {
  SvoEligibleMemberRecord, SvoTeamFilters, SvoTeamMemberRecord, SvoTeamPage,
  SvoTeamRecord, SvoTeamShiftRecord,
} from '../../services/svoTeamsService'
import SvoTeamDetailsDialog from './SvoTeamDetailsDialog'

type TeamStatusAction = { team: SvoTeamRecord; mode: 'archive' | 'restore' }
type MemberDraft = { team: SvoTeamRecord; member: SvoTeamMemberRecord }
type ShiftDraft = { team: SvoTeamRecord; shift: SvoTeamShiftRecord | null }
const PAGE_SIZE = 20
const VIEW_OPTIONS = [
  { value: 'operational', label: 'Em operação' },
  { value: 'archived', label: 'Arquivadas' },
  { value: 'all', label: 'Todas' },
]

function inputDate(instant: string): string {
  const date = new Date(instant)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

/** Consulta equipes SVO por página e concentra composição e plantões no detalhe. */
export default function SvoTeamsPage() {
  const { api, session } = useAuth()
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const isCompact = useMediaQuery(theme.breakpoints.down('md'))
  const canRead = hasPermission(session, 'svo:teams:read')
  const canManage = hasPermission(session, 'svo:teams:manage')
  const [view, setView] = useState<SvoTeamFilters['view']>('operational')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [teams, setTeams] = useState<SvoTeamPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const noticeRef = useRef<HTMLDivElement>(null)
  const [refreshToken, setRefreshToken] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [editTeam, setEditTeam] = useState<SvoTeamRecord | null>(null)
  const [teamName, setTeamName] = useState('')
  const [teamReason, setTeamReason] = useState('')
  const [statusAction, setStatusAction] = useState<TeamStatusAction | null>(null)
  const [statusReason, setStatusReason] = useState('')
  const [detailsTeam, setDetailsTeam] = useState<SvoTeamRecord | null>(null)
  const [memberTeam, setMemberTeam] = useState<SvoTeamRecord | null>(null)
  const [eligibleMembers, setEligibleMembers] = useState<SvoEligibleMemberRecord[]>([])
  const [eligibleLoading, setEligibleLoading] = useState(false)
  const [memberId, setMemberId] = useState('')
  const [removeMember, setRemoveMember] = useState<MemberDraft | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft | null>(null)
  const [shiftStart, setShiftStart] = useState('')
  const [shiftEnd, setShiftEnd] = useState('')
  const [shiftReason, setShiftReason] = useState('')
  const [cancelShift, setCancelShift] = useState<ShiftDraft | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const filters = useMemo<SvoTeamFilters>(() => ({
    view,
    page,
    pageSize: PAGE_SIZE,
    ...(search.trim() ? { search: search.trim() } : {}),
  }), [view, page, search])

  useEffect(() => {
    if (!canRead) return
    let active = true
    listSvoTeamPage(api, filters)
      .then((result) => {
        if (!active) return
        setTeams(result)
        const lastPage = Math.max(1, result.totalPages)
        if (page > lastPage) setPage(lastPage)
      })
      .catch((requestError: unknown) => {
        if (active) setLoadError(requestError instanceof Error ? requestError.message : 'Não foi possível consultar as equipes SVO.')
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [api, canRead, filters, page, refreshToken])

  useEffect(() => { if (notice) noticeRef.current?.focus() }, [notice])

  async function save(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      setCreateOpen(false); setEditTeam(null); setStatusAction(null); setMemberTeam(null)
      setRemoveMember(null); setShiftDraft(null); setCancelShift(null); setDetailsTeam(null)
      setCreateName(''); setMemberId(''); setTeamReason(''); setStatusReason('')
      setRemoveReason(''); setShiftReason(''); setCancelReason('')
      setLoading(true)
      setLoadError('')
      setRefreshToken((value) => value + 1)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar as alterações.')
    } finally { setSaving(false) }
  }

  function reload(): void {
    setLoading(true)
    setLoadError('')
    setRefreshToken((value) => value + 1)
  }

  function openEdit(team: SvoTeamRecord): void {
    setEditTeam(team); setTeamName(team.name); setTeamReason(''); setError('')
  }

  function openStatusAction(team: SvoTeamRecord, mode: TeamStatusAction['mode']): void {
    setStatusAction({ team, mode }); setStatusReason(''); setError('')
  }

  async function openAddMember(team: SvoTeamRecord): Promise<void> {
    setMemberTeam(team); setMemberId(''); setEligibleLoading(true); setError('')
    try { setEligibleMembers(await listEligibleSvoMembers(api)) }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível consultar integrantes elegíveis.') }
    finally { setEligibleLoading(false) }
  }

  function openShift(team: SvoTeamRecord, shift: SvoTeamShiftRecord | null): void {
    setShiftDraft({ team, shift })
    setShiftStart(shift ? inputDate(shift.startsAt) : '')
    setShiftEnd(shift ? inputDate(shift.endsAt) : '')
    setShiftReason(''); setError('')
  }

  function closeDialogs(): void {
    if (saving) return
    setCreateOpen(false); setEditTeam(null); setStatusAction(null); setMemberTeam(null)
    setRemoveMember(null); setShiftDraft(null); setCancelShift(null); setDetailsTeam(null)
    setError('')
  }

  const availableMembers = eligibleMembers.filter((member) =>
    !memberTeam?.members.some((existing) => existing.active && existing.userId === member.id))
  const filtersActive = Boolean(search.trim() || view !== 'operational')
  const dialogError = error ? <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert> : null

  const columns: readonly DataTableColumn<SvoTeamRecord>[] = [
    {
      key: 'team', header: 'Equipe',
      render: (team) => <Button variant="text" onClick={() => setDetailsTeam(team)} aria-label={`Ver integrantes e plantões da equipe ${team.name}`}
        sx={{ minHeight: 44, px: 0, textTransform: 'none', textAlign: 'left', justifyContent: 'flex-start' }}>
        <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <Box component="strong">{team.name}</Box>
          <Typography component="span" variant="body2" color="text.secondary">Equipe #{team.id}</Typography>
        </Box>
      </Button>,
    },
    { key: 'members', header: 'Integrantes', render: (team) => `${team.members.filter((member) => member.active).length} ativos` },
    { key: 'shifts', header: 'Plantões', render: (team) => `${team.shifts.filter((shift) => !shift.canceledAt).length} não cancelados` },
    { key: 'status', header: 'Situação', render: (team) => <StatusChip label={team.active ? 'Em operação' : 'Arquivada'} tone={team.active ? 'success' : 'neutral'} /> },
  ]

  function renderActions(team: SvoTeamRecord) {
    if (!canManage) return undefined
    return <RowActionsMenu label={`Ações da equipe ${team.name}`} actions={[
      { key: 'edit', label: 'Editar nome', onSelect: () => openEdit(team) },
      team.active
        ? { key: 'archive', label: 'Arquivar', danger: true, onSelect: () => openStatusAction(team, 'archive') }
        : { key: 'restore', label: 'Restaurar', onSelect: () => openStatusAction(team, 'restore') },
    ]} />
  }

  return (
    <Box>
      <PageHeader title="Equipes" description="Consulte a operação SVO e gerencie integrantes e períodos de plantão."
        actions={canManage ? <Button variant="contained" onClick={() => setCreateOpen(true)} sx={{ minHeight: 44 }}>Nova equipe</Button> : undefined} />
      {notice && <Alert ref={noticeRef} tabIndex={-1} severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
      {!canRead ? <StateFeedback kind="forbidden" /> : <>
        <FilterBar label="Buscar e filtrar equipes SVO">
          <Box sx={{ flex: '1 1 280px', minWidth: { xs: '100%', sm: 260 } }}>
            <FormField label="Buscar pelo nome" value={search} onChange={(value) => { setSearch(value); setPage(1); setLoading(true); setLoadError('') }} placeholder="Ex.: Equipe Norte" />
          </Box>
          <Box sx={{ width: { xs: '100%', sm: 190 } }}>
            <FormSelect label="Atividade" value={view} onChange={(value) => { setView(value as SvoTeamFilters['view']); setPage(1); setLoading(true); setLoadError('') }} options={VIEW_OPTIONS} />
          </Box>
          {filtersActive && <Button color="inherit" onClick={() => { setSearch(''); setView('operational'); setPage(1); setLoading(true); setLoadError('') }} sx={{ minHeight: 44 }}>Limpar filtros</Button>}
        </FilterBar>

        {loading && teams === null && <StateFeedback kind="loading" title="Carregando equipes..." />}
        {!loading && loadError && teams === null && <StateFeedback kind="error" description={loadError} actionLabel="Tentar novamente" onAction={reload} />}
        {loadError && teams !== null && <StateFeedback kind="partial" description={loadError} actionLabel="Tentar novamente" onAction={reload} />}
        {loading && teams !== null && <Box role="status" aria-live="polite" sx={{ mb: 2 }}>Atualizando as equipes…</Box>}

        {teams && !isCompact && <DataTable
          caption="Equipes e plantões SVO"
          columns={columns}
          rows={teams.items}
          rowKey={(team) => team.id}
          busy={loading}
          minWidth={600}
          actionsWidth={64}
          emptyContent={!loading ? <StateFeedback kind="empty" title={filtersActive ? 'Nenhuma equipe encontrada' : 'Nenhuma equipe em operação'}
            description={filtersActive ? 'Ajuste a busca ou o filtro de atividade para consultar outras equipes.' : 'Cadastre uma equipe para iniciar a gestão dos plantões SVO.'}
            actionLabel={!filtersActive && canManage ? 'Nova equipe' : undefined} onAction={!filtersActive && canManage ? () => setCreateOpen(true) : undefined} centered /> : undefined}
          renderActions={canManage ? renderActions : undefined}
        />}

        {teams && isCompact && <Stack spacing={1.5}>
          {teams.items.length === 0 && !loading
            ? <StateFeedback kind="empty" title={filtersActive ? 'Nenhuma equipe encontrada' : 'Nenhuma equipe em operação'}
                description={filtersActive ? 'Ajuste a busca ou o filtro de atividade para consultar outras equipes.' : 'Cadastre uma equipe para iniciar a gestão dos plantões SVO.'}
                actionLabel={!filtersActive && canManage ? 'Nova equipe' : undefined} onAction={!filtersActive && canManage ? () => setCreateOpen(true) : undefined} />
            : teams.items.map((team) => <Card key={team.id} component="article" variant="outlined">
              <CardContent sx={{ '&:last-child': { pb: 2 } }}>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start', justifyContent: 'space-between' }}>
                  <Button variant="text" onClick={() => setDetailsTeam(team)} aria-label={`Ver integrantes e plantões da equipe ${team.name}`}
                    sx={{ minHeight: 44, px: 0, textTransform: 'none', justifyContent: 'flex-start', textAlign: 'left' }}>
                    <Box component="span" sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                      <Typography component="span" variant="subtitle1" sx={{ fontWeight: 700 }}>{team.name}</Typography>
                      <Typography component="span" variant="body2" color="text.secondary">Equipe #{team.id}</Typography>
                    </Box>
                  </Button>
                  {renderActions(team)}
                </Stack>
                <Stack direction="row" spacing={1} sx={{ alignItems: 'center', flexWrap: 'wrap', mt: 1 }}>
                  <StatusChip label={team.active ? 'Em operação' : 'Arquivada'} tone={team.active ? 'success' : 'neutral'} />
                  <Typography variant="body2" color="text.secondary">{team.members.filter((member) => member.active).length} integrantes · {team.shifts.filter((shift) => !shift.canceledAt).length} plantões não cancelados</Typography>
                </Stack>
              </CardContent>
            </Card>)}
        </Stack>}

        {teams && <Stack component="nav" aria-label="Paginação de equipes SVO" direction="row" sx={{ mt: 2, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="body2" color="text.secondary">{teams.total} equipe(s)</Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Button color="inherit" disabled={teams.page <= 1 || loading} onClick={() => { setPage((current) => Math.max(1, current - 1)); setLoading(true) }} sx={{ minHeight: 44 }}>Anterior</Button>
            <Typography role="status">Página {teams.page} de {Math.max(1, teams.totalPages)}</Typography>
            <Button color="inherit" disabled={teams.page >= teams.totalPages || loading} onClick={() => { setPage((current) => current + 1); setLoading(true) }} sx={{ minHeight: 44 }}>Próxima</Button>
          </Stack>
        </Stack>}
      </>}

      <Dialog open={createOpen} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-create-title">
        <DialogTitle id="svo-team-create-title">Nova equipe</DialogTitle>
        <DialogContent>{dialogError}<FormField label="Nome da equipe" value={createName} onChange={setCreateName} required autoFocus /></DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !createName.trim()} onClick={() => { void save(() => createSvoTeam(api, createName), 'Equipe cadastrada.') }} sx={{ minHeight: 44 }}>Salvar equipe</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editTeam)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-edit-title">
        <DialogTitle id="svo-team-edit-title">Editar equipe</DialogTitle>
        <DialogContent>{dialogError}<Stack spacing={2}>
          <FormField label="Nome da equipe" value={teamName} onChange={setTeamName} required autoFocus />
          <FormField label="Motivo da alteração" value={teamReason} onChange={setTeamReason} required multiline minRows={2} helperText="Registrado na auditoria." />
        </Stack></DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !teamName.trim() || !teamReason.trim()} onClick={() => editTeam && void save(
            () => updateSvoTeam(api, editTeam, { name: teamName, active: editTeam.active, reason: teamReason }), 'Equipe atualizada.')}
            sx={{ minHeight: 44 }}>Salvar</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={Boolean(statusAction)}
        title={statusAction?.mode === 'archive' ? 'Arquivar equipe?' : 'Restaurar equipe?'}
        description={statusAction?.mode === 'archive'
          ? `${statusAction.team.name} sairá da consulta operacional e deixará de ser elegível para novos despachos. Integrantes, plantões e vínculos históricos serão preservados.`
          : `${statusAction?.team.name ?? 'A equipe'} voltará à operação. A disponibilidade continuará dependendo de integrantes e plantões válidos.`}
        confirmLabel={statusAction?.mode === 'archive' ? 'Arquivar equipe' : 'Restaurar equipe'}
        danger={statusAction?.mode === 'archive'}
        onConfirm={() => statusAction && void save(() => updateSvoTeam(api, statusAction.team, {
          name: statusAction.team.name, active: statusAction.mode === 'restore', reason: statusReason,
        }), statusAction.mode === 'archive' ? 'Equipe arquivada.' : 'Equipe restaurada.')}
        onCancel={closeDialogs}
        loading={saving}
        confirmDisabled={!statusReason.trim()}
      >
        {dialogError}<FormField label="Motivo" value={statusReason} onChange={setStatusReason} required multiline minRows={2} helperText="Registrado na auditoria." />
      </ConfirmDialog>

      <Dialog open={Boolean(memberTeam)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-member-title">
        <DialogTitle id="svo-team-member-title">Adicionar integrante</DialogTitle>
        <DialogContent>{dialogError}
          {eligibleLoading ? <StateFeedback kind="loading" title="Consultando integrantes elegíveis..." /> : availableMembers.length === 0
            ? <Alert severity="info">Não há contas ativas de Equipe SVO disponíveis para associar.</Alert>
            : <FormSelect label="Conta de integrante SVO" value={memberId} onChange={setMemberId}
                options={availableMembers.map((member) => ({ value: member.id, label: `${member.name} · ${member.email}` }))}
                emptyLabel="Selecione uma conta" required />}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || eligibleLoading || !memberTeam || !memberId}
            onClick={() => memberTeam && void save(() => addSvoTeamMember(api, memberTeam.id, memberId), 'Integrante associado à equipe.')}
            sx={{ minHeight: 44 }}>Adicionar</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={Boolean(removeMember)} title="Remover integrante da equipe?"
        description={`${removeMember?.member.name ?? 'O integrante'} deixará de ser elegível para novos despachos desta equipe. Ordens em andamento mantêm o vínculo atual.`}
        confirmLabel="Remover integrante" danger loading={saving} confirmDisabled={!removeReason.trim()}
        onCancel={closeDialogs} onConfirm={() => removeMember && void save(
          () => removeSvoTeamMember(api, removeMember.team.id, removeMember.member.userId, removeReason), 'Integrante removido da composição atual.')}>
        {dialogError}<FormField label="Motivo da remoção" value={removeReason} onChange={setRemoveReason} required multiline minRows={2} />
      </ConfirmDialog>

      <Dialog open={Boolean(shiftDraft)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-shift-title">
        <DialogTitle id="svo-shift-title">{shiftDraft?.shift ? 'Editar plantão' : 'Novo plantão'}</DialogTitle>
        <DialogContent>{dialogError}<Stack spacing={2}>
          <FormField label="Início do plantão" type="datetime-local" value={shiftStart} onChange={setShiftStart} required />
          <FormField label="Fim do plantão" type="datetime-local" value={shiftEnd} onChange={setShiftEnd} required />
          {shiftDraft?.shift && <FormField label="Motivo da alteração" value={shiftReason} onChange={setShiftReason} required multiline minRows={2} />}
        </Stack></DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 44 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !shiftDraft || !shiftStart || !shiftEnd || Boolean(shiftDraft.shift && !shiftReason.trim())}
            onClick={() => shiftDraft && void save(() => shiftDraft.shift
              ? updateSvoShift(api, shiftDraft.team.id, shiftDraft.shift, { startsAt: new Date(shiftStart).toISOString(), endsAt: new Date(shiftEnd).toISOString(), reason: shiftReason })
              : createSvoShift(api, shiftDraft.team.id, { startsAt: new Date(shiftStart).toISOString(), endsAt: new Date(shiftEnd).toISOString() }),
              shiftDraft.shift ? 'Plantão atualizado.' : 'Plantão cadastrado.')}
            sx={{ minHeight: 44 }}>Salvar plantão</Button>
        </DialogActions>
      </Dialog>

      <ConfirmDialog open={Boolean(cancelShift)} title="Cancelar plantão?"
        description="O plantão continuará no cadastro para consulta e deixará de tornar a equipe elegível nesse período."
        confirmLabel="Cancelar plantão" danger loading={saving} confirmDisabled={!cancelReason.trim()}
        onCancel={closeDialogs} onConfirm={() => cancelShift && void save(
          () => cancelSvoShift(api, cancelShift.team.id, cancelShift.shift!, cancelReason), 'Plantão cancelado e preservado no cadastro.') }>
        {dialogError}<FormField label="Motivo do cancelamento" value={cancelReason} onChange={setCancelReason} required multiline minRows={2} />
      </ConfirmDialog>

      <SvoTeamDetailsDialog
        team={detailsTeam}
        canManage={canManage}
        fullScreen={isSmallScreen}
        onClose={closeDialogs}
        onAddMember={(team) => { void openAddMember(team) }}
        onRemoveMember={(team, member) => { setRemoveMember({ team, member }); setRemoveReason('') }}
        onCreateShift={(team) => openShift(team, null)}
        onEditShift={(team, shift) => openShift(team, shift)}
        onCancelShift={(team, shift) => { setCancelShift({ team, shift }); setCancelReason('') }}
      />
    </Box>
  )
}
