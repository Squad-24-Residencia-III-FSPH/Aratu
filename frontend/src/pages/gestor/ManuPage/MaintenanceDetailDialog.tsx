import { useId, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Paper, Stack, Typography } from '@mui/material'
import type { ApiRequest } from '../../../api/client'
import ConfirmDialog from '../../../components/ui/ConfirmDialog'
import { FormField, FormSelect } from '../../../components/ui/FormField'
import { formatInstant, formatCivilDate, formatMoney, isActiveOrder, TYPE_LABELS } from '../../../maintenance/maintenanceTypes'
import type { MaintenanceOrder, MaintenanceItem } from '../../../maintenance/maintenanceTypes'
import { normalizeFormItems } from '../../../maintenance/maintenanceForm'
import { closeMaintenance } from '../../../services/maintenanceService'
import { ItemsEditor, ItemsSummary } from './MaintenanceItems'
import { MaintenanceStatusChip, VehicleStatusChip } from './MaintenanceStatusChip'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import {
  buildCloseConsequenceDescription,
  findFirstInvalidItem,
  isRevisionConflict,
  validateClosedAt,
} from './maintenancePresentation'
import type { ItemValidationFailure, VehicleSituationState } from './maintenancePresentation'

interface MaintenanceDetailDialogProps {
  /** Detalhe atualizado da API; o orçamento só muda pela edição, nunca pelo encerramento. */
  order: MaintenanceOrder
  vehicleSituation?: VehicleSituationState | null
  api: ApiRequest
  onClose: () => void
  onEdit: () => void
  onSaved: (order: MaintenanceOrder) => void
  onReload: () => void
  onInspectOrder?: (orderId: string) => void
}

function focusCloseItemInput(
  container: HTMLDivElement | null,
  failure: ItemValidationFailure | null,
  items: readonly MaintenanceItem[],
) {
  if (!container || !failure) return
  const card = container.querySelector<HTMLElement>(`[data-item-index="${failure.index}"]`)
  if (!card) return
  const inputs = card.querySelectorAll<HTMLElement>('input, textarea')
  const item = items[failure.index]
  let offset = 0
  if (failure.field === 'quantity' || failure.field === 'amount') offset = 1
  else if (failure.field === 'unitPrice' && item?.kind === 'PART') offset = 2
  inputs[offset]?.focus()
}

/** Mantém execução separada do orçamento e exige confirmação explícita da baixa da OS. */
export default function MaintenanceDetailDialog({
  order,
  vehicleSituation = null,
  api,
  onClose,
  onEdit,
  onSaved,
  onReload,
  onInspectOrder,
}: MaintenanceDetailDialogProps) {
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
  const itemsContainerRef = useRef<HTMLDivElement>(null)
  const closedAtRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const reportedByRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const reasonRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const errorAlertRef = useRef<HTMLDivElement>(null)

  const closedAtError = validateClosedAt(closedAt, order.openedAt)
  const reportedByError = !reportedBy.trim() ? 'Informe a origem da informação.' : undefined
  const reasonError = !reason.trim() ? 'Informe a justificativa.' : undefined
  const firstInvalidItem = mode === 'actual' ? findFirstInvalidItem(actualItems) : null

  function prepare(event: FormEvent) {
    event.preventDefault()
    if (busy || conflict) return
    setSubmitted(true)

    if (firstInvalidItem) {
      setError('Corrija os itens executados antes de revisar o encerramento.')
      focusCloseItemInput(itemsContainerRef.current, firstInvalidItem, actualItems)
      return
    }
    if (closedAtError) {
      setError('Corrija a data e hora do encerramento antes de continuar.')
      closedAtRef.current?.focus()
      return
    }
    if (reportedByError) {
      setError('Preencha a origem e a justificativa do encerramento.')
      reportedByRef.current?.focus()
      return
    }
    if (reasonError) {
      setError('Preencha a origem e a justificativa do encerramento.')
      reasonRef.current?.focus()
      return
    }

    try {
      if (mode === 'actual') normalizeFormItems(actualItems)
      setError('')
      setConfirm(true)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Confira os itens executados.')
    }
  }

  async function close() {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    try {
      const saved = await closeMaintenance(api, order.id, {
        expectedRevision: order.revision,
        reportedBy: reportedBy.trim(),
        reason: reason.trim(),
        ...(closedAt ? { closedAt: new Date(closedAt).toISOString() } : {}),
        ...(mode === 'estimate' ? { confirmEstimate: true } : { actualItems: normalizeFormItems(actualItems) }),
      })
      onSaved(saved)
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : 'Não foi possível encerrar a manutenção.'
      setError(message)
      if (isRevisionConflict(failure, true)) setConflict(true)
      if (/encerramento/i.test(message)) closedAtRef.current?.focus()
      else requestAnimationFrame(() => errorAlertRef.current?.focus())
    } finally {
      submitting.current = false
      setBusy(false)
      setConfirm(false)
    }
  }

  const plateLabel = order.vehicleSnapshot?.licensePlate ?? `Veículo ${order.vehicleId}`
  const blockingConditionText = order.blocksVehicle
    ? 'Impeditiva — bloqueia o veículo para novas viagens enquanto estiver aberta.'
    : 'Não impeditiva — não bloqueia o veículo e seu encerramento não libera a viatura.'
  const confirmDescription = buildCloseConsequenceDescription(order, vehicleSituation)
  const situation = vehicleSituation?.situation ?? null

  return (
    <>
      <Dialog open onClose={busy ? undefined : onClose} fullWidth maxWidth="md" aria-labelledby={`${id}-title`} sx={accessibleControls}>
        <DialogTitle id={`${id}-title`}>Ordem de serviço #{order.id} — {plateLabel}</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2.5}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
              <MaintenanceStatusChip status={order.status} />
              <Typography>{TYPE_LABELS[order.type]} · Revisão {order.revision}</Typography>
            </Box>

            <Paper variant="outlined" sx={{ p: 2 }}>
              <Stack spacing={1}>
                <Typography component="h3" variant="subtitle2" sx={{ fontWeight: 700 }}>
                  Condição de impedimento e situação real do veículo
                </Typography>
                <Typography variant="body2">
                  <strong>Condição desta ordem:</strong> {blockingConditionText}
                </Typography>
                {vehicleSituation?.loading && (
                  <Typography variant="body2" role="status" aria-live="polite">
                    Consultando situação atual do veículo {plateLabel}...
                  </Typography>
                )}
                {vehicleSituation && !vehicleSituation.loading && vehicleSituation.error && (
                  <Alert severity="warning" role="status">
                    {vehicleSituation.error}
                  </Alert>
                )}
                {situation && !vehicleSituation?.loading && (
                  <Box role="status" aria-live="polite" sx={{ display: 'flex', alignItems: 'center', gap: 1.5, flexWrap: 'wrap' }}>
                    {situation.vehicle && <VehicleStatusChip status={situation.vehicle.status} />}
                    <Typography variant="body2">{situation.message}</Typography>
                    {situation.otherBlockingOrder && onInspectOrder && (
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => onInspectOrder(situation.otherBlockingOrder!.id)}
                      >
                        Consultar ordem impeditiva #{situation.otherBlockingOrder.id}
                      </Button>
                    )}
                  </Box>
                )}
              </Stack>
            </Paper>

            <Typography>{order.description}</Typography>
            <Typography>Oficina: {order.workshop ?? 'Não informada'} · Hodômetro: {order.odometerKm ?? 'Não informado'} km</Typography>
            <Typography>Entrada: {formatInstant(order.openedAt)} · Previsão: {formatCivilDate(order.expectedCompletionDate)}</Typography>
            <Typography>Impeditiva: {order.blocksVehicle ? 'Sim' : 'Não'} · Encerramento: {formatInstant(order.closedAt)}</Typography>
            <Typography variant="body2">
              Registrada por usuário #{order.createdBy} em {formatInstant(order.createdAt)}.
              {order.closedBy && ` Encerrada por usuário #${order.closedBy}.`}
            </Typography>
            <Divider />
            <ItemsSummary label="Orçamento" items={order.estimateItems} total={order.estimatedTotal} />
            <ItemsSummary label="Execução e custo final" items={order.actualItems} total={order.finalCost} />
            {closing && (
              <form id={`${id}-close`} onSubmit={prepare} aria-busy={busy} noValidate>
                <Stack spacing={2.5}>
                  <Divider />
                  <Typography component="h3" variant="h6">Encerrar manutenção</Typography>
                  {error && (
                    <Alert
                      ref={errorAlertRef}
                      tabIndex={-1}
                      severity="error"
                      role="alert"
                      action={conflict ? <Button onClick={onReload}>Recarregar ordem</Button> : undefined}
                    >
                      {error}
                    </Alert>
                  )}
                  <FormSelect
                    label="Execução realizada"
                    value={mode}
                    onChange={setMode}
                    disabled={busy}
                    options={[
                      ...(order.estimateItems !== null
                        ? [{ value: 'estimate', label: `Confirmar orçamento integral — ${formatMoney(order.estimatedTotal)}` }]
                        : []),
                      { value: 'actual', label: 'Informar a relação completa executada' },
                    ]}
                  />
                  {mode === 'actual' && (
                    <>
                      <ItemsEditor
                        label="Itens executados"
                        items={actualItems}
                        onChange={setActualItems}
                        disabled={busy}
                        validate={submitted}
                        containerRef={itemsContainerRef}
                      />
                      {actualItems.length === 0 && (
                        <Alert severity="info">
                          Ao encerrar com a relação vazia, você confirma serviço sem itens e custo final de R$ 0,00.
                        </Alert>
                      )}
                    </>
                  )}
                  <FormField
                    label="Data e hora do encerramento"
                    type="datetime-local"
                    value={closedAt}
                    onChange={setClosedAt}
                    disabled={busy}
                    inputRef={closedAtRef}
                    error={submitted ? closedAtError : undefined}
                    helperText="Opcional; em branco registra o instante atual. Horário local deste dispositivo."
                  />
                  <FormField
                    label="Origem da informação"
                    value={reportedBy}
                    onChange={setReportedBy}
                    required
                    disabled={busy}
                    inputRef={reportedByRef}
                    error={submitted ? reportedByError : undefined}
                    helperText="Identifique quem informou e o canal ou documento de origem."
                  />
                  <FormField
                    label="Justificativa do encerramento"
                    value={reason}
                    onChange={setReason}
                    required
                    disabled={busy}
                    multiline
                    inputRef={reasonRef}
                    error={submitted ? reasonError : undefined}
                  />
                </Stack>
              </form>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={onClose} color="inherit" disabled={busy}>Fechar</Button>
          {isActiveOrder(order) && !closing && (
            <>
              <Button variant="outlined" onClick={onEdit}>Editar orçamento / ordem</Button>
              <Button variant="contained" onClick={() => setClosing(true)}>Encerrar manutenção</Button>
            </>
          )}
          {closing && (
            <Button type="submit" form={`${id}-close`} variant="contained" disabled={busy || conflict}>
              Revisar encerramento
            </Button>
          )}
        </DialogActions>
      </Dialog>
      <ConfirmDialog
        open={confirm}
        sx={accessibleControls}
        title={`Encerrar ordem #${order.id}?`}
        description={confirmDescription}
        confirmLabel="Confirmar encerramento"
        onConfirm={() => void close()}
        onCancel={() => setConfirm(false)}
        loading={busy}
      />
    </>
  )
}
