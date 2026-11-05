import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Stack, Typography } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { FormField, FormSelect } from '../../components/ui/FormField'
import { formatInstant, formatCivilDate, formatMoney, isActiveOrder, STATUS_LABELS, TYPE_LABELS } from '../../maintenance/maintenanceTypes'
import type { MaintenanceOrder, MaintenanceItem } from '../../maintenance/maintenanceTypes'
import { normalizeFormItems } from '../../maintenance/maintenanceForm'
import { closeMaintenance, MaintenanceRequestError } from '../../services/maintenanceService'
import { ItemsEditor, ItemsSummary } from './MaintenanceItems'
import { maintenanceControls } from './maintenanceStyles'

interface MaintenanceDetailDialogProps {
  /** Detalhe atualizado da API; o orçamento só muda pela edição, nunca pelo encerramento. */
  order: MaintenanceOrder
  api: ApiRequest
  onClose: () => void
  onEdit: () => void
  onSaved: (order: MaintenanceOrder) => void
  onReload: () => void
}
/** Mantém execução separada do orçamento e exige confirmação explícita da baixa da OS. */
export default function MaintenanceDetailDialog({ order, api, onClose, onEdit, onSaved, onReload }: MaintenanceDetailDialogProps) {
  const id = useId()
  const [closing, setClosing] = useState(false)
  const [mode, setMode] = useState(order.estimateItems === null ? 'actual' : 'estimate')
  const [actualItems, setActualItems] = useState<MaintenanceItem[]>(order.estimateItems ?? [])
  const [reportedBy, setReportedBy] = useState('')
  const [reason, setReason] = useState('')
  const [closedAt, setClosedAt] = useState('')
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const submitting = useRef(false)
  function prepare(event: FormEvent) {
    event.preventDefault()
    if (busy || conflict) return
    setSubmitted(true)
    if (!reportedBy.trim() || !reason.trim()) { setError('Preencha a origem e a justificativa do encerramento.'); return }
    try {
      if (mode === 'actual') normalizeFormItems(actualItems)
      setError(''); setConfirm(true)
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Confira os itens executados.') }
  }
  async function close() {
    if (submitting.current) return
    submitting.current = true; setBusy(true); setError('')
    try {
      const saved = await closeMaintenance(api, order.id, { expectedRevision: order.revision,
        reportedBy: reportedBy.trim(), reason: reason.trim(),
        ...(closedAt ? { closedAt: new Date(closedAt).toISOString() } : {}),
        ...(mode === 'estimate' ? { confirmEstimate: true } : { actualItems: normalizeFormItems(actualItems) }) })
      onSaved(saved)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Não foi possível encerrar a manutenção.')
      if (failure instanceof MaintenanceRequestError && failure.status === 409) setConflict(true)
    } finally { submitting.current = false; setBusy(false); setConfirm(false) }
  }
  return <>
    <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby={`${id}-title`} sx={maintenanceControls}>
      <DialogTitle id={`${id}-title`}>Ordem de serviço #{order.id} — {order.vehicleSnapshot?.licensePlate ?? `Veículo ${order.vehicleId}`}</DialogTitle>
      <DialogContent dividers><Stack spacing={2.5}>
        <Typography>{TYPE_LABELS[order.type]} · {STATUS_LABELS[order.status]} · Revisão {order.revision}</Typography>
        <Typography>{order.description}</Typography>
        <Typography>Oficina: {order.workshop ?? 'Não informada'} · Hodômetro: {order.odometerKm ?? 'Não informado'} km</Typography>
        <Typography>Entrada: {formatInstant(order.openedAt)} · Previsão: {formatCivilDate(order.expectedCompletionDate)}</Typography>
        <Typography>Impeditiva: {order.blocksVehicle ? 'Sim' : 'Não'} · Encerramento: {formatInstant(order.closedAt)}</Typography>
        <Typography variant="body2">Registrada por usuário #{order.createdBy} em {formatInstant(order.createdAt)}.
          {order.closedBy && ` Encerrada por usuário #${order.closedBy}.`}</Typography>
        <Divider />
        <ItemsSummary label="Orçamento" items={order.estimateItems} total={order.estimatedTotal} />
        <ItemsSummary label="Execução e custo final" items={order.actualItems} total={order.finalCost} />
        {closing && <form id={`${id}-close`} onSubmit={prepare} aria-busy={busy} noValidate><Stack spacing={2.5}>
          <Divider />
          <Typography component="h3" variant="h6">Encerrar manutenção</Typography>
          {error && <Alert severity="error" role="alert" action={conflict ? <Button onClick={onReload}>Recarregar ordem</Button> : undefined}>{error}</Alert>}
          <FormSelect label="Execução realizada" value={mode} onChange={setMode} disabled={busy}
            options={[
              ...(order.estimateItems !== null ? [{ value: 'estimate', label: `Confirmar orçamento integral — ${formatMoney(order.estimatedTotal)}` }] : []),
              { value: 'actual', label: 'Informar a relação completa executada' },
            ]} />
          {mode === 'actual' && <>
            <ItemsEditor label="Itens executados" items={actualItems} onChange={setActualItems} disabled={busy} validate={submitted} />
            {actualItems.length === 0 && <Alert severity="info">Ao encerrar com a relação vazia, você confirma serviço sem itens e custo final de R$ 0,00.</Alert>}
          </>}
          <FormField label="Data e hora do encerramento" type="datetime-local" value={closedAt} onChange={setClosedAt} disabled={busy}
            helperText="Opcional; em branco registra o instante atual. Horário local deste dispositivo." />
          <FormField label="Origem da informação" value={reportedBy} onChange={setReportedBy} required disabled={busy}
            error={submitted && !reportedBy.trim() ? 'Informe a origem da informação.' : undefined} helperText="Identifique quem informou e o canal ou documento de origem." />
          <FormField label="Justificativa do encerramento" value={reason} onChange={setReason} required disabled={busy} multiline
            error={submitted && !reason.trim() ? 'Informe a justificativa.' : undefined} />
        </Stack></form>}
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
        <Button onClick={onClose} color="inherit" disabled={busy}>Fechar</Button>
        {isActiveOrder(order) && !closing && <>
          <Button variant="outlined" onClick={onEdit}>Editar orçamento / ordem</Button>
          <Button variant="contained" onClick={() => setClosing(true)}>Encerrar manutenção</Button>
        </>}
        {closing && <Button type="submit" form={`${id}-close`} variant="contained" disabled={busy || conflict}>Revisar encerramento</Button>}
      </DialogActions>
    </Dialog>
    <ConfirmDialog open={confirm} title={`Encerrar ordem #${order.id}?`}
      description={`Veículo ${order.vehicleSnapshot?.licensePlate ?? order.vehicleId}. O orçamento será preservado e o custo final será calculado com a execução confirmada. O impedimento desta ordem será retirado, preservando uma eventual inativação independente.`}
      confirmLabel="Confirmar encerramento" onConfirm={() => void close()} onCancel={() => setConfirm(false)} loading={busy} />
  </>
}
