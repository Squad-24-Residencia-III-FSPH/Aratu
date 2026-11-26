import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Typography, useMediaQuery, useTheme } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import { useAuth } from '../../auth/useAuth'
import { hasPermission } from '../../auth/access'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import RowActionsMenu from '../../components/ui/RowActionsMenu'
import type { RowActionItem } from '../../components/ui/RowActionsMenu'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import type { StatusTone } from '../../components/ui/StatusChip'
import { listDrivers } from '../../services/driversService'
import { listVehicles } from '../../services/vehiclesService'
import { changeFineStatus, createFine, listFines, suggestFineDrivers, updateFine } from '../../services/finesService'
import type { Driver } from '../../drivers/driverTypes'
import type { Vehicle } from '../../vehicles/vehicleTypes'
import type { CreateFineInput, Fine, FineDriverSuggestion, FineFilters, FineStatus } from '../../fines/fineTypes'
import { FINE_STATUS_LABELS, FINE_STATUSES, FINE_TRANSITIONS } from '../../fines/fineTypes'
import { formatOperationalDateTime, operationalDateTimeInput, operationalDateTimeToIso, operationalDayEndExclusive, operationalDayStart } from '../../time/operationalTime'

type FormMode = { kind: 'create' } | { kind: 'edit'; fine: Fine }
const STATUS_TONE: Record<FineStatus, StatusTone> = { PENDING: 'warning', PAID: 'success', CONTESTED: 'info', CANCELED: 'neutral' }
const CURRENCY = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
function localInput(value?: string): string {
  return operationalDateTimeInput(value ?? new Date().toISOString())
}
function toInstant(value: string): string { return operationalDateTimeToIso(value) }
function formatDate(value: string | null): string { return value ? formatOperationalDateTime(value) : 'Não informado' }
function freshDraft(fine?: Fine) {
  return { vehicleId: fine?.vehicleId ?? '', driverId: fine?.driverId ?? '', tripId: fine?.tripId ?? '',
    infractionAt: fine ? localInput(fine.infractionAt) : localInput(), infractionCode: fine?.infractionCode ?? '',
    description: fine?.description ?? '', location: fine?.location ?? '', amount: fine?.amount ?? '', dueAt: fine?.dueAt ?? '',
    notes: fine?.notes ?? '', reason: '', evidenceDescription: '', attachmentUrl: '' }
}

/** Gestão de multas e infrações integrada ao histórico e aos contratos REST existentes. */
export default function FinesPage() {
  const { api, session } = useAuth()
  const allowed = hasPermission(session, 'fines:read')
  const canCreate = hasPermission(session, 'fines:create')
  const canUpdate = hasPermission(session, 'fines:update')
  const canChangeStatus = hasPermission(session, 'fines:status:change')
  const theme = useTheme(); const smallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [items, setItems] = useState<Fine[] | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([]); const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(true); const [optionsLoading, setOptionsLoading] = useState(true)
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [refresh, setRefresh] = useState(0)
  const [vehicleId, setVehicleId] = useState(''); const [driverId, setDriverId] = useState('')
  const [status, setStatus] = useState<FineStatus | ''>(''); const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const [form, setForm] = useState<FormMode | null>(null); const [draft, setDraft] = useState(freshDraft())
  const [saving, setSaving] = useState(false); const [suggestions, setSuggestions] = useState<FineDriverSuggestion[]>([])
  const [suggestionError, setSuggestionError] = useState(''); const [suggestionsLoading, setSuggestionsLoading] = useState(false)
  const [statusChange, setStatusChange] = useState<{ fine: Fine; target: FineStatus } | null>(null)
  const [statusReason, setStatusReason] = useState(''); const [statusEvidence, setStatusEvidence] = useState(''); const [occurredAt, setOccurredAt] = useState(localInput())

  const vehicleOptions = useMemo(() => vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}` })), [vehicles])
  const driverOptions = useMemo(() => drivers.map((driver) => ({ value: driver.id, label: driver.name })), [drivers])
  const filters: FineFilters = { ...(vehicleId ? { vehicleId } : {}), ...(driverId ? { driverId } : {}), ...(status ? { status } : {}), ...(from ? { from: operationalDayStart(from) } : {}), ...(to ? { to: operationalDayEndExclusive(to) } : {}) }
  const reload = useCallback(() => { setLoading(true); setError(''); setRefresh((value) => value + 1) }, [])

  useEffect(() => {
    if (!allowed) return
    let active = true
    Promise.all([listVehicles(api), listDrivers(api)])
      .then(([vehicleRows, driverRows]) => { if (active) { setVehicles(vehicleRows); setDrivers(driverRows) } })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar veículos e motoristas.') })
      .finally(() => { if (active) setOptionsLoading(false) })
    return () => { active = false }
  }, [allowed, api, refresh])

  useEffect(() => {
    if (!allowed) return
    let active = true
    listFines(api, filters).then((rows) => { if (active) { setItems(rows); setError('') } })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar as multas.') })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, api, driverId, from, refresh, status, to, vehicleId])

  useEffect(() => {
    let active = true
    if (!form || !draft.vehicleId || !draft.infractionAt) {
      queueMicrotask(() => { if (active) { setSuggestions([]); setSuggestionError(''); setSuggestionsLoading(false) } })
      return () => { active = false }
    }
    queueMicrotask(() => { if (active) { setSuggestionsLoading(true); setSuggestionError('') } })
    suggestFineDrivers(api, draft.vehicleId, toInstant(draft.infractionAt))
      .then((rows) => { if (active) setSuggestions(rows) })
      .catch((requestError: unknown) => { if (active) setSuggestionError(requestError instanceof Error ? requestError.message : 'Não foi possível buscar sugestões de motorista.') })
      .finally(() => { if (active) setSuggestionsLoading(false) })
    return () => { active = false }
  }, [api, draft.infractionAt, draft.vehicleId, form])

  function openCreate(): void { setDraft(freshDraft()); setForm({ kind: 'create' }); setNotice(''); setError('') }
  function openEdit(fine: Fine): void { setDraft(freshDraft(fine)); setForm({ kind: 'edit', fine }); setNotice(''); setError('') }
  async function saveFine(): Promise<void> {
    if (!form || saving) return
    setSaving(true); setError('')
    const metadata = { reportedBy: session?.nome ?? 'Gestor de frota', reason: draft.reason.trim(),
      evidenceDescription: draft.evidenceDescription.trim(), attachmentUrl: draft.attachmentUrl.trim() || null }
    try {
      if (form.kind === 'edit') {
        await updateFine(api, form.fine.id, { expectedRevision: form.fine.revision, occurredAt: toInstant(draft.infractionAt),
          vehicleId: draft.vehicleId, driverId: draft.driverId || null, tripId: draft.tripId || null,
          infractionAt: toInstant(draft.infractionAt), infractionCode: draft.infractionCode.trim(), description: draft.description.trim(),
          location: draft.location.trim() || null, amount: draft.amount, dueAt: draft.dueAt || null, notes: draft.notes.trim() || null, ...metadata })
        setNotice('Multa retificada e registrada no histórico.')
      } else {
        const input: CreateFineInput = { vehicleId: draft.vehicleId, ...(draft.driverId ? { driverId: draft.driverId } : {}),
          ...(draft.tripId ? { tripId: draft.tripId } : {}), infractionAt: toInstant(draft.infractionAt),
          infractionCode: draft.infractionCode.trim(), description: draft.description.trim(), location: draft.location.trim() || null,
          amount: draft.amount, dueAt: draft.dueAt || null, notes: draft.notes.trim() || null, ...metadata }
        await createFine(api, input, crypto.randomUUID())
        setNotice('Multa registrada e incluída no histórico.')
      }
      setForm(null); reload()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar a multa.') }
    finally { setSaving(false) }
  }

  function startStatusChange(fine: Fine, target: FineStatus): void {
    setStatusChange({ fine, target }); setStatusReason(''); setStatusEvidence(''); setOccurredAt(localInput()); setError('')
  }
  function actionsFor(fine: Fine): RowActionItem[] {
    const actions: RowActionItem[] = []
    if (canUpdate) actions.push({
      key: 'correct', label: 'Corrigir',
      onSelect: () => openEdit(fine),
      disabled: fine.status === 'PAID' || fine.status === 'CANCELED',
    })
    if (canChangeStatus) actions.push(...FINE_TRANSITIONS[fine.status].map((target) => ({
      key: `status-${target}`,
      label: target === 'PAID' ? 'Registrar pagamento' : target === 'CONTESTED' ? 'Contestar' : target === 'CANCELED' ? 'Cancelar multa' : 'Reabrir',
      onSelect: () => startStatusChange(fine, target),
      danger: target === 'CANCELED',
    })))
    return actions
  }
  async function saveStatusChange(): Promise<void> {
    if (!statusChange || saving) return
    setSaving(true); setError('')
    const { fine, target } = statusChange
    try {
      const metadata = { expectedRevision: fine.revision, reportedBy: session?.nome ?? 'Gestor de frota',
        reason: statusReason.trim(), evidenceDescription: statusEvidence.trim() }
      const input = target === 'PAID'
        ? { ...metadata, status: target, paidAt: toInstant(occurredAt) }
        : { ...metadata, status: target, occurredAt: toInstant(occurredAt) }
      await changeFineStatus(api, fine.id, input)
      setStatusChange(null); setNotice(`Situação alterada: ${FINE_STATUS_LABELS[target]}.`); reload()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível alterar a situação.') }
    finally { setSaving(false) }
  }

  const columns: readonly DataTableColumn<Fine>[] = [
    { key: 'vehicle', header: 'Veículo', width: 145, render: (fine) => `${fine.vehicle.licensePlate}${fine.vehicle.model ? ` · ${fine.vehicle.model}` : ''}` },
    { key: 'infraction', header: 'Infração', width: 220, render: (fine) => <><strong>{fine.infractionCode}</strong><br />{fine.description}</> },
    { key: 'driver', header: 'Motorista', width: 170, render: (fine) => fine.driver?.name ?? 'Não identificado' },
    { key: 'date', header: 'Data da infração', width: 170, render: (fine) => formatDate(fine.infractionAt) },
    { key: 'amount', header: 'Valor', align: 'right', width: 120, render: (fine) => CURRENCY.format(Number(fine.amount)) },
    { key: 'status', header: 'Situação', width: 160, render: (fine) => <StatusChip label={FINE_STATUS_LABELS[fine.status]} tone={STATUS_TONE[fine.status]} /> },
  ]

  return <Box>
    <PageHeader title="Multas" description="Consulte infrações e acompanhe seu tratamento." actions={canCreate ? <Button variant="contained" startIcon={<AddIcon aria-hidden="true" />} onClick={openCreate} disabled={optionsLoading || vehicles.length === 0} sx={{ minHeight: 48 }}>Registrar multa</Button> : undefined} />
    {!allowed && <StateFeedback kind="forbidden" title="Acesso restrito" description="Somente gestor de frota e administrador podem consultar e tratar multas." />}
    {allowed && <>
      {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {error && <Alert severity="error" role="alert" sx={{ mb: 2 }} action={<Button color="inherit" onClick={reload}>Tentar novamente</Button>}>{error}</Alert>}
      <FilterBar label="Filtros de multas">
        <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}><FormSelect label="Veículo" value={vehicleId} onChange={setVehicleId} options={vehicleOptions} emptyLabel="Todos os veículos" /></Box>
        <Box sx={{ flex: '1 1 190px', minWidth: { xs: '100%', sm: 190 } }}><FormSelect label="Motorista" value={driverId} onChange={setDriverId} options={driverOptions} emptyLabel="Todos os motoristas" /></Box>
        <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}><FormSelect label="Situação" value={status} onChange={(value) => setStatus(value as FineStatus | '')} options={FINE_STATUSES.map((value) => ({ value, label: FINE_STATUS_LABELS[value] }))} emptyLabel="Todas as situações" /></Box>
        <Box sx={{ flex: '1 1 150px', minWidth: { xs: '100%', sm: 150 } }}><FormField label="De" type="date" value={from} onChange={setFrom} /></Box>
        <Box sx={{ flex: '1 1 150px', minWidth: { xs: '100%', sm: 150 } }}><FormField label="Até" type="date" value={to} onChange={setTo} /></Box>
        <Button onClick={() => { setVehicleId(''); setDriverId(''); setStatus(''); setFrom(''); setTo('') }} disabled={!vehicleId && !driverId && !status && !from && !to} sx={{ minHeight: 44 }}>Limpar</Button>
      </FilterBar>
      {smallScreen ? (
        <Stack spacing={1.5}>
          {loading ? <StateFeedback kind="loading" title="Carregando multas..." /> : items?.length ? items.map((fine) => {
            const actions = actionsFor(fine)
            return <Card key={fine.id} variant="outlined">
              <CardContent>
                <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{fine.vehicle.licensePlate} · {CURRENCY.format(Number(fine.amount))}</Typography>
                    <Typography variant="body2">{fine.infractionCode} · {fine.description}</Typography>
                  </Box>
                  <StatusChip label={FINE_STATUS_LABELS[fine.status]} tone={STATUS_TONE[fine.status]} />
                </Stack>
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>{formatDate(fine.infractionAt)} · {fine.driver?.name ?? 'Motorista não identificado'}</Typography>
              </CardContent>
              {actions.length > 0 && <CardActions sx={{ px: 1, pb: 1, justifyContent: 'flex-end' }}>
                <RowActionsMenu label={`Ações da multa ${fine.id}`} actions={actions} />
              </CardActions>}
            </Card>
          }) : <StateFeedback kind="empty" title="Nenhuma multa encontrada" description="Ajuste os filtros ou registre uma infração." />}
        </Stack>
      ) : (
        <DataTable
          caption="Multas e infrações"
          columns={columns}
          rows={items ?? []}
          rowKey={(fine) => fine.id}
          busy={loading}
          minWidth={1060}
          loadingContent={<StateFeedback kind="loading" title="Carregando multas..." />}
          emptyContent={<StateFeedback kind="empty" title="Nenhuma multa encontrada" description="Ajuste os filtros ou registre uma infração." />}
          renderActions={canUpdate || canChangeStatus ? (fine) => <RowActionsMenu label={`Ações da multa ${fine.id}`} actions={actionsFor(fine)} /> : undefined}
        />
      )}
    </>}

    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullScreen={smallScreen} fullWidth maxWidth="md" aria-labelledby="fine-form-title">
      <DialogTitle id="fine-form-title">{form?.kind === 'edit' ? 'Corrigir multa' : 'Registrar multa ou infração'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <FormSelect label="Veículo" required value={draft.vehicleId} onChange={(value) => setDraft((current) => ({ ...current, vehicleId: value, driverId: '', tripId: '' }))} options={vehicleOptions} emptyLabel="Selecione um veículo" emptyOptionDisabled />
        <FormField label="Data e hora da infração" type="datetime-local" required value={draft.infractionAt} onChange={(value) => setDraft((current) => ({ ...current, infractionAt: value }))} />
        <FormSelect label="Motorista identificado" value={draft.driverId} onChange={(value) => setDraft((current) => ({ ...current, driverId: value, tripId: '' }))} options={driverOptions} emptyLabel="Não identificado" />
        {suggestionError && <Alert severity="warning">{suggestionError}</Alert>}
        {suggestionsLoading && <Typography variant="body2" color="text.secondary">Buscando viagens compatíveis...</Typography>}
        {suggestions.length > 0 && <Box><Typography variant="subtitle2" sx={{ mb: 1 }}>Viagens compatíveis para conferência</Typography><Stack spacing={1}>{suggestions.map((suggestion) => <Card key={suggestion.tripId} variant="outlined"><CardContent sx={{ py: 1, '&:last-child': { pb: 1 } }}><Stack direction={{ xs: 'column', sm: 'row' }} spacing={1} sx={{ justifyContent: 'space-between', alignItems: { xs: 'stretch', sm: 'center' } }}><Typography variant="body2">{suggestion.driverName} · viagem #{suggestion.tripId} · {formatDate(suggestion.startedAt)}{suggestion.finishedAt ? ` a ${formatDate(suggestion.finishedAt)}` : ' · em andamento'}</Typography><Button sx={{ minHeight: 44 }} onClick={() => setDraft((current) => ({ ...current, driverId: suggestion.driverId, tripId: suggestion.tripId }))}>Usar sugestão</Button></Stack></CardContent></Card>)}</Stack></Box>}
        <FormField label="Viagem vinculada (opcional)" value={draft.tripId} onChange={(value) => setDraft((current) => ({ ...current, tripId: value }))} helperText="A sugestão ajuda na conferência, mas não atribui responsabilidade automaticamente." inputMode="numeric" />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
          <FormField label="Código da infração" required value={draft.infractionCode} onChange={(value) => setDraft((current) => ({ ...current, infractionCode: value }))} maxLength={100} />
          <FormField label="Valor (R$)" required value={draft.amount} onChange={(value) => setDraft((current) => ({ ...current, amount: value }))} placeholder="0.00" inputMode="numeric" />
          <FormField label="Vencimento" type="date" value={draft.dueAt} onChange={(value) => setDraft((current) => ({ ...current, dueAt: value }))} />
          <FormField label="Local" value={draft.location} onChange={(value) => setDraft((current) => ({ ...current, location: value }))} maxLength={500} />
        </Box>
        <FormField label="Descrição" required value={draft.description} onChange={(value) => setDraft((current) => ({ ...current, description: value }))} multiline minRows={2} maxLength={1000} />
        <FormField label="Observações" value={draft.notes} onChange={(value) => setDraft((current) => ({ ...current, notes: value }))} multiline minRows={2} maxLength={1000} />
        <FormField label="Motivo do registro ou retificação" required value={draft.reason} onChange={(value) => setDraft((current) => ({ ...current, reason: value }))} multiline minRows={2} maxLength={500} />
        <FormField label="Descrição da evidência" required value={draft.evidenceDescription} onChange={(value) => setDraft((current) => ({ ...current, evidenceDescription: value }))} maxLength={500} />
        <FormField label="Link da evidência (opcional)" value={draft.attachmentUrl} onChange={(value) => setDraft((current) => ({ ...current, attachmentUrl: value }))} maxLength={2000} />
      </Stack></DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setForm(null)} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button><Button variant="contained" onClick={() => { void saveFine() }} disabled={saving || !draft.vehicleId || !draft.infractionAt || !draft.infractionCode.trim() || !draft.description.trim() || !draft.amount || !draft.reason.trim() || !draft.evidenceDescription.trim()} sx={{ minHeight: 48 }}>Salvar multa</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(statusChange)} onClose={() => !saving && setStatusChange(null)} fullScreen={smallScreen} fullWidth maxWidth="sm" aria-labelledby="fine-status-title">
      <DialogTitle id="fine-status-title">{statusChange ? FINE_STATUS_LABELS[statusChange.target] : 'Alterar situação'}</DialogTitle><DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        <Alert severity="info">A revisão atual é #{statusChange?.fine.revision}. A mudança e seus dados de autoria serão adicionados ao histórico.</Alert>
        <FormField label={statusChange?.target === 'PAID' ? 'Data e hora do pagamento' : 'Data e hora da decisão'} type="datetime-local" required value={occurredAt} onChange={setOccurredAt} />
        <FormField label="Motivo" required value={statusReason} onChange={setStatusReason} multiline minRows={2} />
        <FormField label="Descrição da evidência" required value={statusEvidence} onChange={setStatusEvidence} />
      </Stack></DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setStatusChange(null)} disabled={saving} sx={{ minHeight: 48 }}>Fechar</Button><Button variant="contained" onClick={() => { void saveStatusChange() }} disabled={saving || !statusReason.trim() || !statusEvidence.trim() || !occurredAt} sx={{ minHeight: 48 }}>Confirmar</Button></DialogActions>
    </Dialog>
  </Box>
}
