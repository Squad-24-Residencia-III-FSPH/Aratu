import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Paper,
  Stack,
  Typography,
} from '@mui/material'
import type { ApiRequest } from '../../api/client.ts'
import ConfirmDialog from '../../components/ui/ConfirmDialog.tsx'
import { FormField, FormSelect } from '../../components/ui/FormField.tsx'
import StateFeedback from '../../components/ui/StateFeedback.tsx'
import StatusChip from '../../components/ui/StatusChip.tsx'
import { accessibleControls } from '../../components/ui/accessibleControls.ts'
import type { Driver } from '../../drivers/driverTypes.ts'
import { createFine, FineRequestError, suggestFineDrivers, updateFine } from '../../services/finesService.ts'
import {
  getAttachmentUrlError,
  getFineAmountError,
  isValidLocalDateTime,
  localDateTimeToIso,
  normalizeFineAmount,
  SNAPSHOT_SOURCE_LABELS,
  toLocalDateTimeInput,
  TRIP_STATUS_LABELS,
} from '../../types/fine.ts'
import type {
  CreateFineInput,
  Fine,
  FineDriverSuggestion,
  FineSnapshotSource,
  UpdateFineInput,
} from '../../types/fine.ts'
import { formatDateTime } from '../../utils/dates.ts'
import type { Vehicle } from '../../vehicles/vehicleTypes.ts'

interface FineFormDialogProps {
  /** Quando informada, fixa a revisão otimista para retificação; ausente, cria nova multa. */
  fine?: Fine
  vehicles: readonly Vehicle[]
  drivers: readonly Driver[]
  api: ApiRequest
  onClose: () => void
  onSaved: (fine: Fine) => void
  onConflict: () => void
}

interface PendingSubmission {
  createInput?: CreateFineInput
  updateInput?: UpdateFineInput
  driverName: string
  tripSummary: string | null
  linkSourceLabel: string
  reason: string
}

/** Registra ou retifica multas com sugestão de viagem, idempotência e confirmação consciente de vínculo. */
export default function FineFormDialog({
  fine,
  vehicles,
  drivers,
  api,
  onClose,
  onSaved,
  onConflict,
}: FineFormDialogProps) {
  const baseId = useId()
  const initialInfractionLocal = useMemo(
    () => (fine ? toLocalDateTimeInput(fine.infractionAt) : ''),
    [fine],
  )

  const [vehicleId, setVehicleId] = useState(fine?.vehicleId ?? '')
  const [infractionAtInput, setInfractionAtInput] = useState(initialInfractionLocal)
  const [infractionCode, setInfractionCode] = useState(fine?.infractionCode ?? '')
  const [amount, setAmount] = useState(fine ? fine.amount.replace('.', ',') : '')
  const [dueAt, setDueAt] = useState(fine?.dueAt ?? '')
  const [description, setDescription] = useState(fine?.description ?? '')
  const [location, setLocation] = useState(fine?.location ?? '')
  const [notes, setNotes] = useState(fine?.notes ?? '')

  const [driverId, setDriverId] = useState<string>(fine?.driverId ?? '')
  const [tripId, setTripId] = useState<string>(fine?.tripId ?? '')
  const [selectedSuggestion, setSelectedSuggestion] = useState<FineDriverSuggestion | null>(null)
  const [linkNeedsReview, setLinkNeedsReview] = useState(false)

  const [reportedBy, setReportedBy] = useState('')
  const [reason, setReason] = useState('')
  const [evidenceDescription, setEvidenceDescription] = useState('')
  const [attachmentUrl, setAttachmentUrl] = useState('')

  const [suggestions, setSuggestions] = useState<FineDriverSuggestion[] | null>(null)
  const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [suggestionsError, setSuggestionsError] = useState('')
  const [suggestionsVersion, setSuggestionsVersion] = useState(0)

  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState('')
  const [conflict, setConflict] = useState(false)
  const [busy, setBusy] = useState(false)
  const [pendingConfirm, setPendingConfirm] = useState<PendingSubmission | null>(null)

  const submittingRef = useRef(false)
  const idempotencyAttemptRef = useRef<{ payload: string; key: string } | null>(null)

  const resolvedInfractionIso = useMemo(() => {
    if (fine && infractionAtInput === initialInfractionLocal) {
      return fine.infractionAt
    }
    if (!isValidLocalDateTime(infractionAtInput)) return ''
    return localDateTimeToIso(infractionAtInput)
  }, [fine, infractionAtInput, initialInfractionLocal])

  const vehicleOptions = useMemo(() => {
    const list = vehicles.map((vehicle) => ({
      value: vehicle.id,
      label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}`,
    }))
    if (fine && !list.some((option) => option.value === fine.vehicleId)) {
      list.push({
        value: fine.vehicleId,
        label: `${fine.vehicle.licensePlate}${fine.vehicle.model ? ` — ${fine.vehicle.model}` : ''}`,
      })
    }
    return list
  }, [fine, vehicles])

  const driverOptions = useMemo(() => {
    const list = drivers.map((driver) => ({ value: driver.id, label: driver.name }))
    if (fine?.driver && !list.some((option) => option.value === fine.driver!.id)) {
      list.push({ value: fine.driver.id, label: fine.driver.name })
    }
    if (selectedSuggestion && !list.some((option) => option.value === selectedSuggestion.driverId)) {
      list.push({ value: selectedSuggestion.driverId, label: selectedSuggestion.driverName })
    }
    return list
  }, [drivers, fine, selectedSuggestion])

  useEffect(() => {
    if (!vehicleId || !resolvedInfractionIso) {
      return
    }
    const controller = new AbortController()
    let active = true

    // Evita setState síncrono no corpo do efeito; a atualização de loading ocorre antes da chamada ou via callback.
    Promise.resolve().then(() => {
      if (!active) return
      setSuggestionsLoading(true)
      setSuggestionsError('')
      return suggestFineDrivers(api, vehicleId, resolvedInfractionIso, controller.signal)
    }).then((items) => {
      if (!active || !items) return
      setSuggestions(items)
      setSuggestionsError('')
    }).catch((failure: unknown) => {
      if (!active || controller.signal.aborted) return
      setSuggestions(null)
      setSuggestionsError(
        failure instanceof Error
          ? failure.message
          : 'Não foi possível consultar sugestões de viagem no momento.',
      )
    }).finally(() => {
      if (active && !controller.signal.aborted) {
        setSuggestionsLoading(false)
      }
    })

    return () => {
      active = false
      controller.abort()
    }
  }, [api, resolvedInfractionIso, suggestionsVersion, vehicleId])

  const refreshSuggestions = useCallback(() => {
    if (!vehicleId || !resolvedInfractionIso) return
    setSuggestionsVersion((current) => current + 1)
  }, [resolvedInfractionIso, vehicleId])

  function handleVehicleChange(nextVehicleId: string) {
    setVehicleId(nextVehicleId)
    setSuggestions(null)
    setSuggestionsError('')
    if (tripId) {
      setLinkNeedsReview(true)
    }
  }

  function handleInfractionAtChange(nextValue: string) {
    setInfractionAtInput(nextValue)
    setSuggestions(null)
    setSuggestionsError('')
    if (tripId) {
      setLinkNeedsReview(true)
    }
  }

  function selectSuggestion(suggestion: FineDriverSuggestion) {
    setDriverId(suggestion.driverId)
    setTripId(suggestion.tripId)
    setSelectedSuggestion(suggestion)
    setLinkNeedsReview(false)
    setError('')
  }

  function unlinkTrip() {
    setTripId('')
    setSelectedSuggestion(null)
    setLinkNeedsReview(false)
    setError('')
  }

  const amountError = getFineAmountError(amount)
  const attachmentUrlError = getAttachmentUrlError(attachmentUrl)
  const infractionAtError = !infractionAtInput
    ? 'Informe a data e hora da infração.'
    : !resolvedInfractionIso
      ? 'Informe data e hora válidas.'
      : undefined
  const dueAtError = dueAt && !/^\d{4}-\d{2}-\d{2}$/.test(dueAt)
    ? 'Informe o vencimento no formato AAAA-MM-DD.'
    : undefined

  const selectedVehicleLabel = vehicleOptions.find((option) => option.value === vehicleId)?.label ?? `Veículo #${vehicleId}`
  const selectedDriverName = driverOptions.find((option) => option.value === driverId)?.label ?? (driverId ? `Motorista #${driverId}` : '')

  const persistSubmission = useCallback(async (submission: PendingSubmission) => {
    if (submittingRef.current || conflict) return
    submittingRef.current = true
    setBusy(true)
    setError('')
    try {
      let savedFine: Fine
      if (fine && submission.updateInput) {
        savedFine = await updateFine(api, fine.id, submission.updateInput)
      } else if (submission.createInput) {
        const payload = JSON.stringify(submission.createInput)
        if (idempotencyAttemptRef.current?.payload !== payload) {
          idempotencyAttemptRef.current = { payload, key: crypto.randomUUID() }
        }
        savedFine = await createFine(api, submission.createInput, idempotencyAttemptRef.current.key)
      } else {
        return
      }
      setPendingConfirm(null)
      onSaved(savedFine)
    } catch (failure) {
      setPendingConfirm(null)
      const message = failure instanceof Error ? failure.message : 'Não foi possível salvar a multa.'
      setError(message)
      if (fine && failure instanceof FineRequestError && failure.status === 409) {
        setConflict(true)
      }
    } finally {
      submittingRef.current = false
      setBusy(false)
    }
  }, [api, conflict, fine, onSaved])

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submittingRef.current || conflict) return
    setSubmitted(true)

    if (
      !vehicleId
      || infractionAtError
      || !infractionCode.trim()
      || amountError
      || dueAtError
      || !description.trim()
      || !reportedBy.trim()
      || !reason.trim()
      || !evidenceDescription.trim()
      || attachmentUrlError
    ) {
      setError('Corrija os campos obrigatórios indicados antes de salvar.')
      return
    }

    if (linkNeedsReview && tripId) {
      setError('O veículo ou a data/hora foram alterados. Revise o vínculo com a viagem ou clique em Desvincular viagem antes de salvar.')
      return
    }

    if (tripId && !driverId) {
      setError('Uma viagem vinculada exige motorista selecionado. Selecione o motorista da viagem ou desvincule a viagem.')
      return
    }

    const normalizedAmount = normalizeFineAmount(amount)
    const commonAttributes = {
      vehicleId,
      driverId: driverId || null,
      tripId: tripId || null,
      infractionAt: resolvedInfractionIso,
      infractionCode: infractionCode.trim(),
      description: description.trim(),
      location: location.trim() || null,
      amount: normalizedAmount,
      dueAt: dueAt || null,
      notes: notes.trim() || null,
    }
    const commonMetadata = {
      reportedBy: reportedBy.trim(),
      reason: reason.trim(),
      evidenceDescription: evidenceDescription.trim(),
      attachmentUrl: attachmentUrl.trim() || null,
    }

    const submission: PendingSubmission = fine
      ? {
          updateInput: {
            ...commonAttributes,
            ...commonMetadata,
            expectedRevision: fine.revision,
            occurredAt: new Date().toISOString(),
          },
          driverName: selectedDriverName,
          tripSummary: buildTripSummary(tripId, selectedSuggestion, fine),
          linkSourceLabel: resolveLinkSourceLabel(selectedSuggestion, tripId, fine),
          reason: commonMetadata.reason,
        }
      : {
          createInput: {
            ...commonAttributes,
            ...commonMetadata,
          },
          driverName: selectedDriverName,
          tripSummary: buildTripSummary(tripId, selectedSuggestion),
          linkSourceLabel: resolveLinkSourceLabel(selectedSuggestion, tripId),
          reason: commonMetadata.reason,
        }

    if (commonAttributes.driverId !== null || commonAttributes.tripId !== null) {
      setError('')
      setPendingConfirm(submission)
      return
    }

    void persistSubmission(submission)
  }

  return (
    <>
      <Dialog
        open
        onClose={busy ? undefined : onClose}
        fullWidth
        maxWidth="md"
        aria-labelledby={`${baseId}-title`}
        sx={accessibleControls}
      >
        <DialogTitle id={`${baseId}-title`}>
          {fine ? `Retificar multa #${fine.id} — ${fine.infractionCode}` : 'Registrar multa ou infração'}
        </DialogTitle>
        <Box component="form" onSubmit={handleSubmit} aria-busy={busy} noValidate>
          <DialogContent dividers>
            <Stack spacing={2.5}>
              {error && (
                <Alert
                  severity="error"
                  role="alert"
                  action={conflict ? <Button color="inherit" onClick={onConflict}>Recarregar multa</Button> : undefined}
                >
                  {error}
                </Alert>
              )}

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormSelect
                    label="Veículo"
                    value={vehicleId}
                    options={vehicleOptions}
                    emptyLabel="Selecione o veículo"
                    onChange={handleVehicleChange}
                    required
                    disabled={busy}
                    error={submitted && !vehicleId ? 'Selecione o veículo.' : undefined}
                    autoFocus
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormField
                    label="Data e hora da infração"
                    type="datetime-local"
                    value={infractionAtInput}
                    onChange={handleInfractionAtChange}
                    required
                    disabled={busy}
                    error={submitted ? infractionAtError : undefined}
                    helperText="Horário local deste dispositivo; convertido para UTC no envio."
                  />
                </Box>
              </Stack>

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormField
                    label="Código da infração"
                    value={infractionCode}
                    onChange={setInfractionCode}
                    required
                    disabled={busy}
                    error={submitted && !infractionCode.trim() ? 'Informe o código da infração.' : undefined}
                    helperText="Ex.: 7455-0 ou código do auto de infração."
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormField
                    label="Valor (R$)"
                    value={amount}
                    onChange={setAmount}
                    required
                    disabled={busy}
                    error={submitted ? amountError : undefined}
                    helperText="Ex.: 195,23 ou 0,00."
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormField
                    label="Data de vencimento (opcional)"
                    type="date"
                    value={dueAt}
                    onChange={setDueAt}
                    disabled={busy}
                    error={submitted ? dueAtError : undefined}
                  />
                </Box>
              </Stack>

              <FormField
                label="Descrição da infração"
                value={description}
                onChange={setDescription}
                required
                multiline
                minRows={2}
                disabled={busy}
                error={submitted && !description.trim() ? 'Informe a descrição da infração.' : undefined}
              />

              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormField
                    label="Local da infração (opcional)"
                    value={location}
                    onChange={setLocation}
                    disabled={busy}
                  />
                </Box>
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <FormField
                    label="Observações (opcional)"
                    value={notes}
                    onChange={setNotes}
                    disabled={busy}
                  />
                </Box>
              </Stack>

              <Divider />

              <Stack spacing={1.5} aria-label="Sugestões e vínculo de motorista e viagem">
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 1 }}>
                  <Box>
                    <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                      Vínculo com motorista e viagem (opcional)
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      A API consulta viagens efetivamente iniciadas para o veículo no instante da infração, sem atribuir responsabilidade automaticamente.
                    </Typography>
                  </Box>
                  <Button
                    type="button"
                    variant="outlined"
                    onClick={refreshSuggestions}
                    disabled={busy || !vehicleId || !resolvedInfractionIso || suggestionsLoading}
                    sx={{ minHeight: 44 }}
                  >
                    Atualizar sugestões
                  </Button>
                </Box>

                {(!vehicleId || !resolvedInfractionIso) && (
                  <Alert severity="info">
                    Selecione o veículo e informe uma data/hora válida da infração para consultar viagens elegíveis.
                  </Alert>
                )}

                {vehicleId && resolvedInfractionIso && suggestionsLoading && (
                  <StateFeedback kind="loading" title="Consultando sugestões de viagem..." sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1.5 }} />
                )}

                {vehicleId && resolvedInfractionIso && !suggestionsLoading && suggestionsError && (
                  <StateFeedback
                    kind="partial"
                    title="Não foi possível consultar sugestões de viagem."
                    description={`${suggestionsError} Você ainda pode prosseguir sem motorista ou selecionar o motorista manualmente.`}
                    actionLabel="Tentar novamente"
                    onAction={refreshSuggestions}
                    sx={{ mb: 0 }}
                  />
                )}

                {vehicleId && resolvedInfractionIso && !suggestionsLoading && !suggestionsError && suggestions !== null && (
                  suggestions.length === 0 ? (
                    <Alert severity="info" role="status">
                      Nenhuma viagem iniciada ou em andamento encontrada para este veículo neste instante. Você pode salvar sem motorista vinculado ou selecionar um motorista manualmente.
                    </Alert>
                  ) : (
                    <Stack spacing={1.25} role="region" aria-label="Candidatos sugeridos pela API">
                      {suggestions.map((suggestion) => {
                        const isSelected = tripId === suggestion.tripId && driverId === suggestion.driverId
                        return (
                          <Paper
                            key={`${suggestion.tripId}-${suggestion.driverId}`}
                            variant="outlined"
                            sx={{
                              p: 1.75,
                              borderColor: isSelected ? 'primary.main' : 'divider',
                              borderWidth: isSelected ? 2 : 1,
                            }}
                          >
                            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ justifyContent: 'space-between', alignItems: { sm: 'center' } }}>
                              <Stack spacing={0.5}>
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                                    Viagem #{suggestion.tripId} · {suggestion.driverName}
                                  </Typography>
                                  <StatusChip
                                    label={SNAPSHOT_SOURCE_LABELS[suggestion.nameSource]}
                                    tone={suggestion.nameSource === 'TRIP_SNAPSHOT' ? 'info' : 'neutral'}
                                  />
                                </Box>
                                <Typography variant="body2" color="text.secondary">
                                  Situação da viagem: {TRIP_STATUS_LABELS[suggestion.tripStatus] ?? suggestion.tripStatus} ·
                                  Início efetivo: {formatDateTime(suggestion.startedAt)} ·
                                  Fim efetivo: {suggestion.finishedAt ? formatDateTime(suggestion.finishedAt) : 'Em andamento'}
                                </Typography>
                                <Typography variant="caption" color="text.secondary">
                                  Fonte do nome: {suggestion.nameSource === 'TRIP_SNAPSHOT'
                                    ? 'Preservado do snapshot histórico da viagem (TRIP_SNAPSHOT).'
                                    : 'Obtido do cadastro vigente no momento da consulta (CURRENT_REGISTRY).'}
                                </Typography>
                              </Stack>
                              <Button
                                type="button"
                                variant={isSelected ? 'contained' : 'outlined'}
                                onClick={() => selectSuggestion(suggestion)}
                                disabled={busy}
                                aria-pressed={isSelected}
                                sx={{ minHeight: 44, flexShrink: 0 }}
                              >
                                {isSelected ? 'Vínculo selecionado' : 'Selecionar vínculo'}
                              </Button>
                            </Stack>
                          </Paper>
                        )
                      })}
                    </Stack>
                  )
                )}

                {linkNeedsReview && tripId && (
                  <Alert
                    severity="warning"
                    role="alert"
                    action={
                      <Button type="button" color="inherit" onClick={unlinkTrip} disabled={busy} sx={{ minHeight: 44 }}>
                        Desvincular viagem
                      </Button>
                    }
                  >
                    O veículo ou a data/hora foram alterados após o vínculo com a viagem #{tripId}. Selecione uma nova sugestão ou desvincule a viagem antes de salvar.
                  </Alert>
                )}

                {tripId && !linkNeedsReview && (
                  <Alert
                    severity="info"
                    role="status"
                    action={
                      <Button type="button" color="inherit" onClick={unlinkTrip} disabled={busy} sx={{ minHeight: 44 }}>
                        Remover vínculo de viagem
                      </Button>
                    }
                  >
                    Viagem #{tripId} selecionada para o motorista {selectedDriverName || `#${driverId}`}. O vínculo será confirmado antes da gravação.
                  </Alert>
                )}

                <FormSelect
                  label="Motorista (opcional)"
                  value={driverId}
                  options={driverOptions}
                  emptyLabel="Sem motorista vinculado"
                  displayEmpty
                  onChange={(value) => setDriverId(value)}
                  disabled={busy || Boolean(tripId)}
                  helperText={
                    tripId
                      ? 'Para escolher outro motorista manualmente ou deixar sem motorista, remova primeiro o vínculo com a viagem.'
                      : 'Pode permanecer sem motorista quando nenhum candidato for confirmado.'
                  }
                />
              </Stack>

              <Divider />

              <Stack spacing={2}>
                <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Origem, justificativa e evidência
                </Typography>
                <FormField
                  label="Origem da informação"
                  value={reportedBy}
                  onChange={setReportedBy}
                  required
                  disabled={busy}
                  error={submitted && !reportedBy.trim() ? 'Informe a origem da informação.' : undefined}
                  helperText="Identifique quem comunicou, órgão autuador ou protocolo."
                />
                <FormField
                  label="Justificativa"
                  value={reason}
                  onChange={setReason}
                  required
                  multiline
                  minRows={2}
                  disabled={busy}
                  error={submitted && !reason.trim() ? 'Informe a justificativa.' : undefined}
                />
                <FormField
                  label="Descrição da evidência"
                  value={evidenceDescription}
                  onChange={setEvidenceDescription}
                  required
                  multiline
                  minRows={2}
                  disabled={busy}
                  error={submitted && !evidenceDescription.trim() ? 'Informe a descrição da evidência.' : undefined}
                />
                <FormField
                  label="URL da evidência (opcional)"
                  value={attachmentUrl}
                  onChange={setAttachmentUrl}
                  disabled={busy}
                  error={submitted ? attachmentUrlError : undefined}
                  helperText="Link HTTP ou HTTPS sem usuário/senha."
                />
              </Stack>
            </Stack>
          </DialogContent>
          <DialogActions sx={{ p: 2, flexWrap: 'wrap', gap: 1 }}>
            <Button type="button" color="inherit" onClick={onClose} disabled={busy} sx={{ minHeight: 44 }}>
              Cancelar
            </Button>
            <Button type="submit" variant="contained" disabled={busy || conflict} sx={{ minHeight: 44 }}>
              {busy ? 'Salvando...' : fine ? 'Salvar alterações' : 'Salvar multa'}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>

      {pendingConfirm && (
        <ConfirmDialog
          open
          sx={accessibleControls}
          title={pendingConfirm.tripSummary ? 'Confirmar vínculo com motorista e viagem?' : 'Confirmar vínculo com motorista?'}
          description={
            <Stack spacing={1}>
              <Typography variant="body2">
                Revise o vínculo antes de gravar no histórico imutável da multa:
              </Typography>
              <Typography variant="body2">
                <strong>Veículo:</strong> {selectedVehicleLabel}
              </Typography>
              <Typography variant="body2">
                <strong>Data/hora da infração:</strong> {formatDateTime(resolvedInfractionIso)}
              </Typography>
              <Typography variant="body2">
                <strong>Motorista selecionado:</strong> {pendingConfirm.driverName}
              </Typography>
              <Typography variant="body2">
                <strong>Viagem vinculada:</strong> {pendingConfirm.tripSummary ?? 'Nenhuma viagem vinculada (identificação manual)'}
              </Typography>
              <Typography variant="body2">
                <strong>Fonte da identificação:</strong> {pendingConfirm.linkSourceLabel}
              </Typography>
              <Typography variant="body2">
                <strong>Justificativa informada:</strong> {pendingConfirm.reason}
              </Typography>
            </Stack>
          }
          cancelLabel="Cancelar e revisar"
          confirmLabel="Confirmar vínculo e gravar"
          onCancel={() => setPendingConfirm(null)}
          onConfirm={() => void persistSubmission(pendingConfirm)}
          loading={busy}
          autoFocusCancel
        />
      )}
    </>
  )
}

function buildTripSummary(
  tripId: string,
  suggestion: FineDriverSuggestion | null,
  fine?: Fine,
): string | null {
  if (!tripId) return null
  if (suggestion && suggestion.tripId === tripId) {
    const start = formatDateTime(suggestion.startedAt)
    const end = suggestion.finishedAt ? formatDateTime(suggestion.finishedAt) : 'Em andamento'
    return `Viagem #${tripId} (${start} até ${end})`
  }
  if (fine?.tripSnapshot && fine.tripSnapshot.id === tripId) {
    const start = fine.tripSnapshot.startedAt ? formatDateTime(fine.tripSnapshot.startedAt) : 'Início não informado'
    const end = fine.tripSnapshot.finishedAt ? formatDateTime(fine.tripSnapshot.finishedAt) : 'Em andamento'
    return `Viagem #${tripId} (${start} até ${end})`
  }
  return `Viagem #${tripId}`
}

function resolveLinkSourceLabel(
  suggestion: FineDriverSuggestion | null,
  tripId: string,
  fine?: Fine,
): string {
  const source: FineSnapshotSource | undefined = suggestion && suggestion.tripId === tripId
    ? suggestion.nameSource
    : fine?.driverSnapshot?.source
  if (source) {
    return SNAPSHOT_SOURCE_LABELS[source]
  }
  return tripId ? 'Sugestão de viagem confirmada' : 'Seleção manual no cadastro'
}
