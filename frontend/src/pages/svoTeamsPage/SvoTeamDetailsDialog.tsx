import {
  Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography,
} from '@mui/material'
import RowActionsMenu from '../../components/ui/RowActionsMenu'
import StatusChip from '../../components/ui/StatusChip'
import type { SvoTeamMemberRecord, SvoTeamRecord, SvoTeamShiftRecord } from '../../services/svoTeamsService'

/** Dados e ações autorizadas para o detalhe sob demanda da equipe SVO. */
interface SvoTeamDetailsDialogProps {
  /** Equipe selecionada; null mantém o diálogo fechado. */
  team: SvoTeamRecord | null
  /** Exibe comandos de gestão somente quando a permissão correspondente existe. */
  canManage: boolean
  /** Apresenta o detalhe em tela cheia em viewports pequenos. */
  fullScreen: boolean
  /** Fecha o detalhe e devolve o foco ao controle que o abriu. */
  onClose: () => void
  /** Abre o fluxo de associação de integrante elegível. */
  onAddMember: (team: SvoTeamRecord) => void
  /** Abre a confirmação de remoção do vínculo atual. */
  onRemoveMember: (team: SvoTeamRecord, member: SvoTeamMemberRecord) => void
  /** Abre o cadastro de um plantão para a equipe. */
  onCreateShift: (team: SvoTeamRecord) => void
  /** Abre a edição do período de um plantão vigente. */
  onEditShift: (team: SvoTeamRecord, shift: SvoTeamShiftRecord) => void
  /** Abre o cancelamento justificado de um plantão vigente. */
  onCancelShift: (team: SvoTeamRecord, shift: SvoTeamShiftRecord) => void
}

function displayDate(instant: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(instant))
}

/** Exibe a composição e os plantões somente quando a equipe é aberta para gestão. */
export default function SvoTeamDetailsDialog({
  team, canManage, fullScreen, onClose, onAddMember, onRemoveMember, onCreateShift, onEditShift, onCancelShift,
}: SvoTeamDetailsDialogProps) {
  if (!team) return null
  const members = team.members.filter((member) => member.active)

  return (
    <Dialog open fullScreen={fullScreen} fullWidth maxWidth="md" onClose={onClose} aria-labelledby="svo-team-details-title">
      <DialogTitle id="svo-team-details-title">
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <Typography component="span" variant="h6">{team.name}</Typography>
          <StatusChip label={team.active ? 'Em operação' : 'Arquivada'} tone={team.active ? 'success' : 'neutral'} />
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2.5}>
          <Box component="section" aria-labelledby="svo-team-members-heading">
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
              <Typography id="svo-team-members-heading" component="h2" variant="subtitle1">
                Integrantes <Typography component="span" variant="body2" color="text.secondary">({members.length})</Typography>
              </Typography>
              {canManage && <Button onClick={() => onAddMember(team)} disabled={!team.active} sx={{ minHeight: 44 }}>Adicionar integrante</Button>}
            </Stack>
            {members.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nenhum integrante ativo associado.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {members.map((member) => <Stack key={member.id} direction="row" spacing={1} sx={{ minHeight: 48, alignItems: 'center', justifyContent: 'space-between' }}>
                  <Typography variant="body2">{member.name}</Typography>
                  {canManage && <RowActionsMenu label={`Ações do integrante ${member.name}, vínculo ${member.id}`} actions={[
                    { key: 'remove', label: 'Remover da equipe', danger: true, onSelect: () => onRemoveMember(team, member) },
                  ]} />}
                </Stack>)}
              </Stack>
            )}
          </Box>

          <Divider />

          <Box component="section" aria-labelledby="svo-team-shifts-heading">
            <Stack direction="row" spacing={1} sx={{ justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', mb: 1 }}>
              <Typography id="svo-team-shifts-heading" component="h2" variant="subtitle1">Plantões</Typography>
              {canManage && <Button onClick={() => onCreateShift(team)} disabled={!team.active} sx={{ minHeight: 44 }}>Novo plantão</Button>}
            </Stack>
            {team.shifts.length === 0 ? (
              <Typography variant="body2" color="text.secondary">Nenhum plantão cadastrado.</Typography>
            ) : (
              <Stack divider={<Divider flexItem />}>
                {team.shifts.map((shift) => <Stack key={shift.id} direction={{ xs: 'column', sm: 'row' }} spacing={0.5}
                  sx={{ py: 1, alignItems: { xs: 'stretch', sm: 'center' }, justifyContent: 'space-between' }}>
                  <Box>
                    <Typography variant="body2">{displayDate(shift.startsAt)} – {displayDate(shift.endsAt)}</Typography>
                    {shift.canceledAt && <Stack direction="row" spacing={1} sx={{ alignItems: 'center', mt: 0.5 }}>
                      <Chip label="Cancelado" size="small" />
                      {shift.cancellationReason && <Typography variant="caption" color="text.secondary">{shift.cancellationReason}</Typography>}
                    </Stack>}
                  </Box>
                  {canManage && !shift.canceledAt && <RowActionsMenu label={`Ações do plantão de ${displayDate(shift.startsAt)}`} actions={[
                    { key: 'edit', label: 'Editar plantão', onSelect: () => onEditShift(team, shift) },
                    { key: 'cancel', label: 'Cancelar plantão', danger: true, onSelect: () => onCancelShift(team, shift) },
                  ]} />}
                </Stack>)}
              </Stack>
            )}
          </Box>
        </Stack>
      </DialogContent>
      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} sx={{ minHeight: 44 }}>Fechar</Button>
      </DialogActions>
    </Dialog>
  )
}
