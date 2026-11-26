import { useCallback, useEffect, useMemo, useState } from 'react'
import { Alert, Box, Button, Card, CardActions, CardContent, Dialog, DialogActions, DialogContent, DialogTitle, Stack, useMediaQuery, useTheme, Typography } from '@mui/material'
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
import type { Vehicle } from '../../vehicles/vehicleTypes'
import { listVehicles } from '../../services/vehiclesService'
import {
  annulVehicleDocument, createVehicleDocument, listExpiringVehicleDocuments,
  listVehicleDocuments, updateVehicleDocument,
} from '../../services/vehicleDocumentsService'
import type { VehicleDocument, VehicleDocumentFilters, VehicleDocumentStatus, VehicleDocumentType } from '../../vehicleDocuments/vehicleDocumentTypes'
import { VEHICLE_DOCUMENT_STATUS_LABELS, VEHICLE_DOCUMENT_STATUSES, VEHICLE_DOCUMENT_TYPE_LABELS, VEHICLE_DOCUMENT_TYPES } from '../../vehicleDocuments/vehicleDocumentTypes'

type FormMode = { kind: 'create' } | { kind: 'renew'; previous: VehicleDocument } | { kind: 'edit'; document: VehicleDocument }
const STATUS_TONE: Record<VehicleDocumentStatus, StatusTone> = { VALID: 'success', EXPIRING: 'warning', EXPIRED: 'warning', RENEWED: 'info', ANNULLED: 'neutral' }
const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' })

function displayDate(value: string | null): string { return value ? DATE_FORMAT.format(new Date(`${value.slice(0, 10)}T12:00:00`)) : 'Não informado' }
function freshDraft(document?: VehicleDocument) {
  return { vehicleId: document?.vehicleId ?? '', documentType: document?.documentType ?? 'CRLV' as VehicleDocumentType,
    documentNumber: document?.documentNumber ?? '', issuedAt: document?.issuedAt ?? '', expiresAt: document?.expiresAt ?? '', notes: document?.notes ?? '', reason: '' }
}

/** Consulta, renova e mantém a história dos documentos da frota usando a API existente. */
export default function VehicleDocumentsPage() {
  const { api, session } = useAuth()
  const allowed = hasPermission(session, 'vehicle-documents:read')
  const canCreate = hasPermission(session, 'vehicle-documents:create')
  const canUpdate = hasPermission(session, 'vehicle-documents:update')
  const canAnnul = hasPermission(session, 'vehicle-documents:annul')
  const theme = useTheme()
  const smallScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [items, setItems] = useState<VehicleDocument[] | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [expiringCount, setExpiringCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [vehiclesLoading, setVehiclesLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehiclesError, setVehiclesError] = useState('')
  const [notice, setNotice] = useState('')
  const [refresh, setRefresh] = useState(0)
  const [vehicleId, setVehicleId] = useState('')
  const [status, setStatus] = useState<VehicleDocumentStatus | ''>('')
  const [documentType, setDocumentType] = useState<VehicleDocumentType | ''>('')
  const [form, setForm] = useState<FormMode | null>(null)
  const [draft, setDraft] = useState(freshDraft())
  const [saving, setSaving] = useState(false)
  const [annul, setAnnul] = useState<VehicleDocument | null>(null)
  const [annulReason, setAnnulReason] = useState('')

  const vehicleOptions = useMemo(() => vehicles.map((vehicle) => ({ value: vehicle.id, label: `${vehicle.licensePlate}${vehicle.model ? ` — ${vehicle.model}` : ''}` })), [vehicles])
  const filters: VehicleDocumentFilters = { ...(vehicleId ? { vehicleId } : {}), ...(status ? { status } : {}), ...(documentType ? { documentType } : {}) }
  const reload = useCallback(() => { setLoading(true); setError(''); setRefresh((value) => value + 1) }, [])

  useEffect(() => {
    if (!allowed) return
    let active = true
    Promise.all([listVehicles(api), listVehicleDocuments(api, filters), listExpiringVehicleDocuments(api)])
      .then(([vehicleRows, list, expiring]) => {
        if (!active) return
        setVehicles(vehicleRows); setItems(list.items); setExpiringCount(expiring.items.length); setError(''); setVehiclesError('')
      })
      .catch((requestError: unknown) => { if (active) setError(requestError instanceof Error ? requestError.message : 'Não foi possível carregar os documentos.') })
      .finally(() => { if (active) { setLoading(false); setVehiclesLoading(false) } })
    return () => { active = false }
  // Each filter is explicit so each requested result has its own stable dependency.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allowed, api, documentType, refresh, status, vehicleId])

  function openCreate(): void { setDraft(freshDraft()); setForm({ kind: 'create' }); setError('') }
  function openRenew(item: VehicleDocument): void { setDraft(freshDraft(item)); setForm({ kind: 'renew', previous: item }); setError('') }
  function openEdit(item: VehicleDocument): void { setDraft(freshDraft(item)); setForm({ kind: 'edit', document: item }); setError('') }
  async function saveDocument(): Promise<void> {
    if (!form || saving) return
    setSaving(true); setError('')
    const metadata = { reportedBy: session?.nome ?? 'Gestor de frota', reason: draft.reason.trim() }
    try {
      if (form.kind === 'edit') {
        await updateVehicleDocument(api, form.document.id, { expectedRevision: form.document.revision, ...metadata,
          documentNumber: draft.documentNumber || null, issuedAt: draft.issuedAt || null, expiresAt: draft.expiresAt, notes: draft.notes || null })
        setNotice('Documento corrigido. A versão anterior permanece no histórico.')
      } else {
        await createVehicleDocument(api, { vehicleId: form.kind === 'renew' ? form.previous.vehicleId : draft.vehicleId,
          documentType: form.kind === 'renew' ? form.previous.documentType : draft.documentType,
          documentNumber: draft.documentNumber || null, issuedAt: draft.issuedAt || null, expiresAt: draft.expiresAt,
          notes: draft.notes || null, ...(form.kind === 'renew' ? { supersedesId: form.previous.id } : {}), ...metadata })
        setNotice(form.kind === 'renew' ? 'Renovação registrada e vinculada ao documento anterior.' : 'Documento cadastrado.')
      }
      setForm(null); reload()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível salvar o documento.') }
    finally { setSaving(false) }
  }

  async function annulDocument(): Promise<void> {
    if (!annul || saving) return
    setSaving(true); setError('')
    try {
      await annulVehicleDocument(api, annul.id, { expectedRevision: annul.revision,
        reportedBy: session?.nome ?? 'Gestor de frota', reason: annulReason.trim() })
      setAnnul(null); setAnnulReason(''); setNotice('Documento anulado com justificativa. O registro permanece no histórico.'); reload()
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Não foi possível anular o documento.') }
    finally { setSaving(false) }
  }

  function actionsFor(item: VehicleDocument): RowActionItem[] {
    const actions: RowActionItem[] = []
    if (canCreate) actions.push({
      key: 'renew', label: 'Renovar', onSelect: () => openRenew(item),
      disabled: item.status === 'ANNULLED' || item.status === 'RENEWED',
    })
    if (canUpdate) actions.push({
      key: 'correct', label: 'Corrigir', onSelect: () => openEdit(item), disabled: item.status === 'ANNULLED',
    })
    if (canAnnul) actions.push({
      key: 'annul', label: 'Anular', onSelect: () => { setAnnul(item); setAnnulReason('') },
      disabled: item.status === 'ANNULLED', danger: true,
    })
    return actions
  }

  const columns: readonly DataTableColumn<VehicleDocument>[] = [
    { key: 'vehicle', header: 'Veículo', width: 165, render: (item) => `${item.vehicle.licensePlate}${item.vehicle.model ? ` · ${item.vehicle.model}` : ''}` },
    { key: 'type', header: 'Documento', width: 180, render: (item) => VEHICLE_DOCUMENT_TYPE_LABELS[item.documentType] },
    { key: 'number', header: 'Número', width: 140, render: (item) => item.documentNumber || 'Não informado' },
    { key: 'expires', header: 'Vencimento', width: 140, render: (item) => displayDate(item.expiresAt) },
    { key: 'status', header: 'Situação', width: 150, render: (item) => <StatusChip label={VEHICLE_DOCUMENT_STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} /> },
  ]

  return <Box>
    <PageHeader title="Documentos" description="Consulte vencimentos e regularize os documentos da frota." actions={canCreate ? <Button variant="contained" startIcon={<AddIcon aria-hidden="true" />} onClick={openCreate} disabled={vehiclesLoading || Boolean(vehiclesError) || vehicles.length === 0} sx={{ minHeight: 48 }}>Novo documento</Button> : undefined} />
    {!allowed && <StateFeedback kind="forbidden" title="Acesso restrito" description="Somente gestor de frota e administrador podem consultar documentos de veículos." />}
    {allowed && <>
      {notice && <Alert severity="success" role="status" sx={{ mb: 2 }}>{notice}</Alert>}
      {error && <Alert severity="error" role="alert" sx={{ mb: 2 }} action={<Button color="inherit" onClick={reload}>Tentar novamente</Button>}>{error}</Alert>}
      {expiringCount > 0 && <Alert severity="warning" sx={{ mb: 2 }}>{expiringCount} documento(s) vencido(s) ou com vencimento próximo. Confira os filtros e a regularização da frota.</Alert>}
      {vehicles.length === 0 && !vehiclesLoading && <StateFeedback kind="empty" title="Nenhum veículo cadastrado" description="Cadastre um veículo antes de registrar documentos." />}
      <FilterBar label="Filtros de documentos">
        <Box sx={{ flex: '1 1 210px', minWidth: { xs: '100%', sm: 210 } }}><FormSelect label="Veículo" value={vehicleId} onChange={setVehicleId} options={vehicleOptions} emptyLabel="Todos os veículos" /></Box>
        <Box sx={{ flex: '1 1 180px', minWidth: { xs: '100%', sm: 180 } }}><FormSelect label="Tipo" value={documentType} onChange={(value) => setDocumentType(value as VehicleDocumentType | '')} options={VEHICLE_DOCUMENT_TYPES.map((value) => ({ value, label: VEHICLE_DOCUMENT_TYPE_LABELS[value] }))} emptyLabel="Todos os tipos" /></Box>
        <Box sx={{ flex: '1 1 180px', minWidth: { xs: '100%', sm: 180 } }}><FormSelect label="Situação" value={status} onChange={(value) => setStatus(value as VehicleDocumentStatus | '')} options={VEHICLE_DOCUMENT_STATUSES.map((value) => ({ value, label: VEHICLE_DOCUMENT_STATUS_LABELS[value] }))} emptyLabel="Todas as situações" /></Box>
        <Button sx={{ minHeight: 44 }} onClick={() => { setVehicleId(''); setDocumentType(''); setStatus('') }} disabled={!vehicleId && !documentType && !status}>Limpar filtros</Button>
      </FilterBar>
      {smallScreen ? <Stack spacing={1.5}>
        {loading ? <StateFeedback kind="loading" title="Carregando documentos..." /> : items?.length ? items.map((item) => <Card key={item.id} variant="outlined"><CardContent>
          <Stack direction="row" sx={{ justifyContent: 'space-between', gap: 1, alignItems: 'flex-start' }}><Box><Typography variant="subtitle1" sx={{ fontWeight: 700 }}>{item.vehicle.licensePlate}</Typography><Typography variant="body2" color="text.secondary">{VEHICLE_DOCUMENT_TYPE_LABELS[item.documentType]} · vence {displayDate(item.expiresAt)}</Typography></Box><StatusChip label={VEHICLE_DOCUMENT_STATUS_LABELS[item.status]} tone={STATUS_TONE[item.status]} /></Stack>
          <Typography variant="body2" sx={{ mt: 1 }}>Número: {item.documentNumber || 'Não informado'}</Typography>
        </CardContent>{actionsFor(item).length > 0 && <CardActions sx={{ px: 1, pb: 1, justifyContent: 'flex-end' }}>
          <RowActionsMenu label={`Ações do documento ${item.id}`} actions={actionsFor(item)} />
        </CardActions>}</Card>) : <StateFeedback kind="empty" title="Nenhum documento encontrado" description="Ajuste os filtros ou cadastre um documento." />}
      </Stack> : <DataTable caption="Documentos de veículos" columns={columns} rows={items ?? []} rowKey={(item) => item.id} busy={loading} minWidth={840}
        loadingContent={<StateFeedback kind="loading" title="Carregando documentos..." />} emptyContent={<StateFeedback kind="empty" title="Nenhum documento encontrado" description="Ajuste os filtros ou cadastre um documento." />}
        renderActions={canCreate || canUpdate || canAnnul ? (item) => <RowActionsMenu label={`Ações do documento ${item.id}`} actions={actionsFor(item)} /> : undefined} />}
    </>}

    <Dialog open={Boolean(form)} onClose={() => !saving && setForm(null)} fullScreen={smallScreen} fullWidth maxWidth="sm" aria-labelledby="vehicle-document-form-title">
      <DialogTitle id="vehicle-document-form-title">{form?.kind === 'edit' ? 'Corrigir documento' : form?.kind === 'renew' ? 'Registrar renovação' : 'Novo documento'}</DialogTitle>
      <DialogContent><Stack spacing={2} sx={{ pt: 1 }}>
        {form?.kind === 'renew' && <Alert severity="info">A renovação será vinculada ao documento #{form.previous.id}; o registro anterior será preservado.</Alert>}
        {form?.kind !== 'edit' && form?.kind !== 'renew' && <FormSelect label="Veículo" required value={draft.vehicleId} onChange={(value) => setDraft((current) => ({ ...current, vehicleId: value }))} options={vehicleOptions} emptyLabel="Selecione um veículo" emptyOptionDisabled />}
        {form?.kind !== 'edit' && form?.kind !== 'renew' && <FormSelect label="Tipo de documento" required value={draft.documentType} onChange={(value) => setDraft((current) => ({ ...current, documentType: value as VehicleDocumentType }))} options={VEHICLE_DOCUMENT_TYPES.map((value) => ({ value, label: VEHICLE_DOCUMENT_TYPE_LABELS[value] }))} />}
        <FormField label="Número do documento" value={draft.documentNumber} onChange={(value) => setDraft((current) => ({ ...current, documentNumber: value }))} maxLength={100} />
        <FormField label="Data de emissão" type="date" value={draft.issuedAt} onChange={(value) => setDraft((current) => ({ ...current, issuedAt: value }))} />
        <FormField label="Data de vencimento" type="date" required value={draft.expiresAt} onChange={(value) => setDraft((current) => ({ ...current, expiresAt: value }))} />
        <FormField label="Observações" value={draft.notes} onChange={(value) => setDraft((current) => ({ ...current, notes: value }))} multiline minRows={2} maxLength={1000} />
        <FormField label="Motivo do cadastro ou alteração" value={draft.reason} onChange={(value) => setDraft((current) => ({ ...current, reason: value }))} required multiline minRows={2} maxLength={500} />
      </Stack></DialogContent>
      <DialogActions sx={{ p: 2 }}><Button onClick={() => setForm(null)} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button><Button variant="contained" onClick={() => { void saveDocument() }} disabled={saving || !draft.expiresAt || !draft.reason.trim() || ((form?.kind === 'create') && !draft.vehicleId)} sx={{ minHeight: 48 }}>Salvar</Button></DialogActions>
    </Dialog>
    <Dialog open={Boolean(annul)} onClose={() => !saving && setAnnul(null)} fullScreen={smallScreen} fullWidth maxWidth="sm" aria-labelledby="vehicle-document-annul-title">
      <DialogTitle id="vehicle-document-annul-title">Anular documento</DialogTitle><DialogContent><Alert severity="warning" sx={{ mb: 2 }}>A anulação é permanente no histórico. Cadastre um novo documento se o registro correto precisar substituir este.</Alert><FormField label="Motivo da anulação" value={annulReason} onChange={setAnnulReason} required multiline minRows={3} /></DialogContent><DialogActions sx={{ p: 2 }}><Button onClick={() => setAnnul(null)} disabled={saving} sx={{ minHeight: 48 }}>Cancelar</Button><Button color="error" variant="contained" onClick={() => { void annulDocument() }} disabled={saving || !annulReason.trim()} sx={{ minHeight: 48 }}>Anular documento</Button></DialogActions>
    </Dialog>
  </Box>
}
