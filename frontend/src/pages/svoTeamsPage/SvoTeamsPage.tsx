import { useCallback, useEffect, useState } from 'react'
import {
  Alert, Box, Button, Card, CardActions, CardContent, Checkbox, Dialog, DialogActions, DialogContent,
  DialogTitle, Divider, FormControlLabel, Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import { useAuth } from '../../auth/useAuth'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import { FormField, FormSelect } from '../../components/ui/FormField'
import {
  addSvoTeamMember, cancelSvoShift, createSvoShift, createSvoTeam, listEligibleSvoMembers,
  listSvoTeams, removeSvoTeamMember, updateSvoShift, updateSvoTeam,
} from '../../services/svoTeamsService'
import type { SvoEligibleMemberRecord, SvoTeamMemberRecord, SvoTeamRecord, SvoTeamShiftRecord } from '../../services/svoTeamsService'

type ShiftDraft = { team: SvoTeamRecord; shift: SvoTeamShiftRecord | null }
type MemberDraft = { team: SvoTeamRecord; member: SvoTeamMemberRecord }

function inputDate(instant: string): string {
  const date = new Date(instant)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function displayDate(instant: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant))
}

/** Mantém equipes, integrantes e janelas de plantão usadas pela distribuição automática. */
export default function SvoTeamsPage() {
  const { api } = useAuth()
  const theme = useTheme()
  const isSmallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [teams, setTeams] = useState<SvoTeamRecord[] | null>(null)
  const [eligibleMembers, setEligibleMembers] = useState<SvoEligibleMemberRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [createName, setCreateName] = useState('')
  const [editTeam, setEditTeam] = useState<SvoTeamRecord | null>(null)
  const [teamName, setTeamName] = useState('')
  const [teamActive, setTeamActive] = useState(true)
  const [teamReason, setTeamReason] = useState('')
  const [memberTeam, setMemberTeam] = useState<SvoTeamRecord | null>(null)
  const [memberId, setMemberId] = useState('')
  const [removeMember, setRemoveMember] = useState<MemberDraft | null>(null)
  const [removeReason, setRemoveReason] = useState('')
  const [shiftDraft, setShiftDraft] = useState<ShiftDraft | null>(null)
  const [shiftStart, setShiftStart] = useState('')
  const [shiftEnd, setShiftEnd] = useState('')
  const [shiftReason, setShiftReason] = useState('')
  const [cancelShift, setCancelShift] = useState<ShiftDraft | null>(null)
  const [cancelReason, setCancelReason] = useState('')

  const load = useCallback(async (): Promise<void> => {
    setLoading(true)
    setError('')
    try {
      const [nextTeams, nextMembers] = await Promise.all([listSvoTeams(api), listEligibleSvoMembers(api)])
      setTeams(nextTeams)
      setEligibleMembers(nextMembers)
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível consultar as equipes SVO.')
    } finally { setLoading(false) }
  }, [api])

  useEffect(() => {
    let active = true
    queueMicrotask(() => { if (active) void load() })
    return () => { active = false }
  }, [load])

  const memberOptions = eligibleMembers.filter((member) => !memberTeam?.members.some((existing) => existing.active && existing.userId === member.id))

  async function save(action: () => Promise<unknown>, successMessage: string): Promise<void> {
    if (saving) return
    setSaving(true)
    setError('')
    setNotice('')
    try {
      await action()
      setNotice(successMessage)
      await load()
      setCreateOpen(false); setEditTeam(null); setMemberTeam(null); setRemoveMember(null)
      setShiftDraft(null); setCancelShift(null)
      setCreateName(''); setMemberId(''); setTeamReason(''); setRemoveReason(''); setShiftReason(''); setCancelReason('')
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar as alterações.')
    } finally { setSaving(false) }
  }

  function openEdit(team: SvoTeamRecord): void {
    setEditTeam(team); setTeamName(team.name); setTeamActive(team.active); setTeamReason('')
  }

  function openShift(team: SvoTeamRecord, shift: SvoTeamShiftRecord | null): void {
    setShiftDraft({ team, shift })
    setShiftStart(shift ? inputDate(shift.startsAt) : '')
    setShiftEnd(shift ? inputDate(shift.endsAt) : '')
    setShiftReason('')
  }

  function closeDialogs(): void {
    if (saving) return
    setCreateOpen(false); setEditTeam(null); setMemberTeam(null); setRemoveMember(null)
    setShiftDraft(null); setCancelShift(null)
    setError('')
  }

  return (
    <Box>
      <PageHeader title="Equipes e plantões SVO" description="Organize os integrantes e períodos usados no despacho automático das solicitações triadas."
        actions={<Button variant="contained" onClick={() => setCreateOpen(true)} sx={{ minHeight: 48 }}>Nova equipe</Button>} />
      {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {error && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{error}</Alert>}
      {loading && !teams ? <StateFeedback kind="loading" title="Carregando equipes e plantões..." /> : !teams ? (
        <StateFeedback kind="error" title={error || 'Não foi possível carregar as equipes.'} actionLabel="Tentar novamente" onAction={() => { void load() }} />
      ) : teams.length === 0 ? (
        <StateFeedback kind="empty" title="Nenhuma equipe SVO cadastrada." description="Cadastre uma equipe e associe integrantes com perfil ativo de Equipe SVO." actionLabel="Nova equipe" onAction={() => setCreateOpen(true)} />
      ) : (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 2 }}>
          {teams.map((team) => (
            <Card component="article" variant="outlined" key={team.id}>
              <CardContent>
                <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <Box>
                    <Typography component="h2" variant="h6">{team.name}</Typography>
                    <Typography variant="body2" color="text.secondary">Equipe #{team.id} · revisão {team.revision}</Typography>
                  </Box>
                  <StatusChip label={team.active ? 'Ativa' : 'Inativa'} tone={team.active ? 'success' : 'neutral'} />
                </Stack>
                <Divider sx={{ my: 1.5 }} />
                <Typography variant="subtitle2">Integrantes ativos ({team.members.filter((member) => member.active).length})</Typography>
                {team.members.filter((member) => member.active).length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>Nenhum integrante ativo associado.</Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {team.members.filter((member) => member.active).map((member) => (
                      <Stack key={member.id} direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between' }}>
                        <Typography variant="body2">{member.name}</Typography>
                        <Button size="small" onClick={() => { setRemoveMember({ team, member }); setRemoveReason('') }} sx={{ minHeight: 44 }}>Remover</Button>
                      </Stack>
                    ))}
                  </Stack>
                )}
                <Typography variant="subtitle2" sx={{ mt: 1.5 }}>Plantões</Typography>
                {team.shifts.length === 0 ? (
                  <Typography variant="body2" color="text.secondary" sx={{ py: 1 }}>Nenhum plantão cadastrado.</Typography>
                ) : (
                  <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                    {team.shifts.map((shift) => (
                      <Stack key={shift.id} direction={{ xs: 'column', sm: 'row' }} spacing={0.5} sx={{ alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}>
                        <Typography variant="body2">{displayDate(shift.startsAt)} – {displayDate(shift.endsAt)}{shift.canceledAt ? ' · cancelado' : ''}</Typography>
                        {!shift.canceledAt && <Stack direction="row" spacing={0.5}>
                          <Button size="small" onClick={() => openShift(team, shift)} sx={{ minHeight: 44 }}>Editar</Button>
                          <Button size="small" color="error" onClick={() => { setCancelShift({ team, shift }); setCancelReason('') }} sx={{ minHeight: 44 }}>Cancelar</Button>
                        </Stack>}
                      </Stack>
                    ))}
                  </Stack>
                )}
              </CardContent>
              <CardActions sx={{ px: 2, pb: 2, display: 'grid', gridTemplateColumns: { xs: '1fr 1fr', sm: 'repeat(3, 1fr)' }, gap: 1 }}>
                <Button onClick={() => openEdit(team)} sx={{ minHeight: 48 }}>Editar equipe</Button>
                <Button onClick={() => { setMemberTeam(team); setMemberId('') }} disabled={!team.active || memberOptions.length === 0} sx={{ minHeight: 48 }}>Adicionar pessoa</Button>
                <Button onClick={() => openShift(team, null)} disabled={!team.active} sx={{ minHeight: 48 }}>Novo plantão</Button>
              </CardActions>
            </Card>
          ))}
        </Box>
      )}

      <Dialog open={createOpen} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-create-title">
        <DialogTitle id="svo-team-create-title">Nova equipe SVO</DialogTitle>
        <DialogContent><FormField label="Nome da equipe" value={createName} onChange={setCreateName} required autoFocus /></DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !createName.trim()} onClick={() => { void save(() => createSvoTeam(api, createName), 'Equipe cadastrada.') }} sx={{ minHeight: 48 }}>Salvar equipe</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(editTeam)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-edit-title">
        <DialogTitle id="svo-team-edit-title">Editar equipe SVO</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <FormField label="Nome da equipe" value={teamName} onChange={setTeamName} required autoFocus />
            <FormControlLabel control={<Checkbox checked={teamActive} onChange={(event) => setTeamActive(event.target.checked)} />} label="Equipe ativa para novos despachos" />
            <FormField label="Motivo da alteração" value={teamReason} onChange={setTeamReason} required multiline minRows={2} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !teamName.trim() || !teamReason.trim()} onClick={() => editTeam && void save(() => updateSvoTeam(api, editTeam, { name: teamName, active: teamActive, reason: teamReason }), 'Equipe atualizada.')} sx={{ minHeight: 48 }}>Salvar alterações</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(memberTeam)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-member-title">
        <DialogTitle id="svo-team-member-title">Adicionar integrante</DialogTitle>
        <DialogContent>
          {memberOptions.length === 0 ? <Alert severity="info">Não há contas ativas de Equipe SVO disponíveis para associar.</Alert> : (
            <FormSelect label="Conta de integrante SVO" value={memberId} onChange={setMemberId}
              options={memberOptions.map((member) => ({ value: member.id, label: `${member.name} · ${member.email}` }))}
              emptyLabel="Selecione uma conta" required />
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !memberTeam || !memberId} onClick={() => memberTeam && void save(() => addSvoTeamMember(api, memberTeam.id, memberId), 'Integrante associado à equipe.')} sx={{ minHeight: 48 }}>Adicionar</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(removeMember)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-team-member-remove-title">
        <DialogTitle id="svo-team-member-remove-title">Remover integrante da equipe?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>{removeMember?.member.name} deixará de ser elegível em novos despachos desta equipe. Ordens em andamento permanecem com seus vínculos atuais.</Typography>
          <FormField label="Motivo da remoção" value={removeReason} onChange={setRemoveReason} required multiline minRows={2} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 48 }}>Manter integrante</Button>
          <Button color="error" variant="contained" disabled={saving || !removeReason.trim()} onClick={() => removeMember && void save(() => removeSvoTeamMember(api, removeMember.team.id, removeMember.member.userId, removeReason), 'Integrante removido da composição atual.')} sx={{ minHeight: 48 }}>Remover integrante</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(shiftDraft)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-shift-title">
        <DialogTitle id="svo-shift-title">{shiftDraft?.shift ? 'Editar plantão SVO' : 'Novo plantão SVO'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2}>
            <FormField label="Início do plantão" type="datetime-local" value={shiftStart} onChange={setShiftStart} required />
            <FormField label="Fim do plantão" type="datetime-local" value={shiftEnd} onChange={setShiftEnd} required />
            {shiftDraft?.shift && <FormField label="Motivo da alteração" value={shiftReason} onChange={setShiftReason} required multiline minRows={2} />}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button>
          <Button variant="contained" disabled={saving || !shiftDraft || !shiftStart || !shiftEnd || Boolean(shiftDraft.shift && !shiftReason.trim())}
            onClick={() => shiftDraft && void save(() => shiftDraft.shift
              ? updateSvoShift(api, shiftDraft.team.id, shiftDraft.shift, { startsAt: new Date(shiftStart).toISOString(), endsAt: new Date(shiftEnd).toISOString(), reason: shiftReason })
              : createSvoShift(api, shiftDraft.team.id, { startsAt: new Date(shiftStart).toISOString(), endsAt: new Date(shiftEnd).toISOString() }), shiftDraft.shift ? 'Plantão atualizado.' : 'Plantão cadastrado.')}
            sx={{ minHeight: 48 }}>Salvar plantão</Button>
        </DialogActions>
      </Dialog>

      <Dialog open={Boolean(cancelShift)} onClose={closeDialogs} fullScreen={isSmallScreen} fullWidth maxWidth="sm" aria-labelledby="svo-shift-cancel-title">
        <DialogTitle id="svo-shift-cancel-title">Cancelar plantão SVO?</DialogTitle>
        <DialogContent>
          <Typography sx={{ mb: 2 }}>O plantão será preservado no histórico e deixará de tornar a equipe elegível para novos despachos.</Typography>
          <FormField label="Motivo do cancelamento" value={cancelReason} onChange={setCancelReason} required multiline minRows={2} />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={closeDialogs} disabled={saving} sx={{ minHeight: 48 }}>Manter plantão</Button>
          <Button color="error" variant="contained" disabled={saving || !cancelReason.trim()} onClick={() => cancelShift && void save(() => cancelSvoShift(api, cancelShift.team.id, cancelShift.shift!, cancelReason), 'Plantão cancelado e preservado no histórico.')} sx={{ minHeight: 48 }}>Cancelar plantão</Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}
