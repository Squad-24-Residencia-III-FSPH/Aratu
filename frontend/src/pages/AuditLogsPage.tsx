import { useEffect, useId, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Tab, Tabs, TextField, Typography, useTheme } from '@mui/material'
import { useSearchParams } from 'react-router-dom'
import DataTable from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import { useAuth } from '../auth/useAuth'
import { hasPermission } from '../auth/access'
import { AuditAccessDenied, AuditRequestError, AUDIT_MAX_PERIOD_DAYS, AUDIT_TIME_ZONE, nextCivilDate, readAuditHistory, readAuditLogs, validateAuditFilters } from '../services/auditLogs'
import type { AuditEntityType, AuditFilters, AuditHistoryEntry, AuditHistoryPage, AuditLog, AuditPage } from '../services/auditLogs'

const empty: AuditFilters = { from: '', to: '', userId: '', operation: '', table: '', recordId: '' }
const fields = [
  { key: 'from', label: 'Data inicial', type: 'date', helper: undefined },
  { key: 'to', label: 'Data final', type: 'date', helper: 'Inclui este dia; a API usa o dia seguinte como limite exclusivo.' },
  { key: 'userId', label: 'ID do usuário', type: 'text', helper: 'Informe um número inteiro positivo.' },
  { key: 'operation', label: 'Ação', type: 'text', helper: 'Ex.: CREATE, UPDATE, STATUS_CHANGE.' },
  { key: 'table', label: 'Entidade', type: 'text', helper: 'Formato schema.tabela, ex.: fleet.vehicles.' },
  { key: 'recordId', label: 'ID do registro', type: 'text', helper: 'Informe junto com a entidade.' },
] as const
const auditEntities: { value: AuditEntityType; label: string }[] = [
  { value: 'vehicle', label: 'Veículo' }, { value: 'driver', label: 'Motorista' }, { value: 'service', label: 'Tipo de serviço' },
  { value: 'trip-request', label: 'Solicitação de viagem' }, { value: 'trip', label: 'Viagem' },
  { value: 'maintenance-order', label: 'Ordem de manutenção' }, { value: 'fueling', label: 'Abastecimento' },
  { value: 'fine', label: 'Multa' }, { value: 'vehicle-document', label: 'Documento do veículo' },
  { value: 'svo-occurrence', label: 'Solicitação SVO' }, { value: 'svo-order', label: 'Ordem SVO' },
  { value: 'svo-team', label: 'Equipe SVO' }, { value: 'user', label: 'Usuário' }, { value: 'profile', label: 'Perfil de acesso' },
]
const auditEntityTables: Record<AuditEntityType, string> = {
  vehicle: 'fleet.vehicles', driver: 'fleet.drivers', service: 'fleet.services',
  'trip-request': 'trip.requests', trip: 'trip.trips',
  'maintenance-order': 'fleet.maintenance_orders', fueling: 'fleet.fuelings', fine: 'fleet.fines',
  'vehicle-document': 'fleet.vehicle_documents', 'svo-occurrence': 'svo.occurrences',
  'svo-order': 'svo.execution_orders', 'svo-team': 'svo.teams', 'user': 'auth.users', 'profile': 'auth.roles',
}
const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: AUDIT_TIME_ZONE })
const formatDate = (value: string) => dates.format(new Date(value))
const operationLabels: Record<string, string> = {
  CREATE: 'Cadastro criado', UPDATE: 'Registro atualizado', DELETE: 'Registro removido',
  STATUS_CHANGE: 'Situação alterada', LOGIN_SUCCESS: 'Login realizado',
  LOGIN_FAILURE: 'Tentativa de login sem sucesso', LOGIN_INACTIVE: 'Tentativa de login em conta desativada',
  LOGOUT: 'Logout realizado',
}
const tableLabels: Record<string, string> = {
  'auth.users': 'Usuários', 'audit.logs': 'Registros de auditoria',
  'fleet.vehicles': 'Veículos', 'fleet.drivers': 'Motoristas', 'fleet.services': 'Tipos de serviço',
}

function actorSnapshotEmail(snapshot: unknown): string | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const email = (snapshot as Record<string, unknown>).email
  return typeof email === 'string' && email.trim() ? email : null
}

function actorName(log: AuditLog): string {
  return log.actorName || actorSnapshotEmail(log.actorSnapshot) || 'Usuário não identificado'
}

function summary(log: AuditLog): string {
  const action = operationLabels[log.operation] ?? 'Operação registrada'
  const entity = tableLabels[log.table] ?? log.table.split('.').at(-1)?.replaceAll(/[_-]/g, ' ') ?? log.table
  return `${action} em ${entity}`
}

function JsonValue({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return <Typography color="text.secondary">Sem dados registrados.</Typography>
  return <Box component="pre" tabIndex={0} aria-label={label} sx={{ maxWidth: '100%', maxHeight: 240, overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', bgcolor: 'action.hover', borderRadius: 1, p: 1.5, font: 'inherit', fontSize: 13 }}>
    {JSON.stringify(value, null, 2)}
  </Box>
}

type Result = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'forbidden' } | { kind: 'ready'; data: AuditPage }
type HistoryResult = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'forbidden' } | { kind: 'ready'; data: AuditHistoryPage }
interface HistoryDraft { entityType: AuditEntityType; recordId: string; from: string; to: string; page?: number }

function isAuditEntityType(value: string | null): value is AuditEntityType {
  return auditEntities.some((entity) => entity.value === value)
}

function isRecordId(value: string): boolean {
  return /^[1-9]\d{0,18}$/.test(value)
}

/** Consulta somente leitura. O servidor é responsável pelas permissões e pela máscara dos detalhes. */
export default function AuditLogsPage() {
  const { api, session } = useAuth()
  const [searchParams, setSearchParams] = useSearchParams()
  const canReadOperations = hasPermission(session, 'audit:read')
  const canReadHistory = hasPermission(session, 'audit:history:read')
  const linkedEntity = searchParams.get('entityType')
  const deepLinkEntity = isAuditEntityType(linkedEntity) ? linkedEntity : null
  const linkedRecordId = searchParams.get('recordId') ?? ''
  const validDeepLink = searchParams.get('tab') === 'record' && deepLinkEntity !== null && isRecordId(linkedRecordId)
  const theme = useTheme()
  const id = useId()
  const [draft, setDraft] = useState(empty)
  const [query, setQuery] = useState({ filters: empty, page: 1 })
  const [result, setResult] = useState<Result>({ kind: 'loading' })
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const [filterError, setFilterError] = useState<ReturnType<typeof validateAuditFilters>>(null)
  const [view, setView] = useState<'operations' | 'record'>(() =>
    (searchParams.get('tab') === 'record' && canReadHistory) || (!canReadOperations && canReadHistory) ? 'record' : 'operations')
  const [historyDraft, setHistoryDraft] = useState<HistoryDraft>(() => ({
    entityType: deepLinkEntity ?? 'vehicle',
    recordId: linkedRecordId,
    from: '',
    to: '',
  }))
  const [historyQuery, setHistoryQuery] = useState<HistoryDraft | null>(() =>
    validDeepLink ? { entityType: deepLinkEntity ?? 'vehicle', recordId: linkedRecordId, from: '', to: '', page: 1 } : null)
  const [historyResult, setHistoryResult] = useState<{ queryKey: string; result: HistoryResult } | null>(null)
  const [selectedHistory, setSelectedHistory] = useState<AuditHistoryEntry | null>(null)

  useEffect(() => { document.title = 'Registros de auditoria — Aratu' }, [])

  useEffect(() => {
    if (!canReadOperations) return
    const controller = new AbortController()
    void readAuditLogs(api, query.filters, query.page, controller.signal).then(
      data => { if (!controller.signal.aborted) setResult({ kind: 'ready', data }) },
      error => {
        if (controller.signal.aborted) return
        if (error instanceof AuditAccessDenied) setResult({ kind: 'forbidden' })
        else if (error instanceof AuditRequestError) setResult({ kind: 'error', message: error.message })
        else setResult({ kind: 'error', message: 'Não foi possível consultar a auditoria.' })
      },
    )
    return () => controller.abort()
  }, [api, canReadOperations, query])

  useEffect(() => {
    if (!historyQuery || !canReadHistory) return
    const queryKey = JSON.stringify(historyQuery)
    const controller = new AbortController()
    void readAuditHistory(api, historyQuery.entityType, historyQuery.recordId,
      historyQuery.from, historyQuery.to, historyQuery.page ?? 1, controller.signal).then(
      data => { if (!controller.signal.aborted) setHistoryResult({ queryKey, result: { kind: 'ready', data } }) },
      error => {
        if (controller.signal.aborted) return
        if (error instanceof AuditAccessDenied) setHistoryResult({ queryKey, result: { kind: 'forbidden' } })
        else setHistoryResult({ queryKey, result: { kind: 'error', message: error instanceof Error ? error.message : 'Não foi possível consultar o histórico.' } })
      },
    )
    return () => controller.abort()
  }, [api, canReadHistory, historyQuery])

  function load(filters: AuditFilters, page = 1) {
    setSelected(null)
    setResult({ kind: 'loading' })
    setQuery({ filters, page })
  }

  function changeView(nextView: 'operations' | 'record') {
    if (nextView === 'operations' && !canReadOperations) return
    if (nextView === 'record' && !canReadHistory) return
    setView(nextView)
    const params = new URLSearchParams(searchParams)
    if (nextView === 'operations') {
      params.delete('tab')
      params.delete('entityType')
      params.delete('recordId')
    } else {
      const record = historyQuery ?? historyDraft
      params.set('tab', 'record')
      if (isRecordId(record.recordId)) {
        params.set('entityType', record.entityType)
        params.set('recordId', record.recordId)
      } else {
        params.delete('entityType')
        params.delete('recordId')
      }
    }
    setSearchParams(params, { replace: true })
  }

  function openRecordHistory(record: HistoryDraft) {
    setHistoryQuery({ ...record, page: 1 })
    setView('record')
    const params = new URLSearchParams(searchParams)
    params.set('tab', 'record')
    params.set('entityType', record.entityType)
    params.set('recordId', record.recordId)
    setSearchParams(params, { replace: true })
  }

  const visibleResult = canReadOperations ? result : { kind: 'forbidden' as const }
  const data = visibleResult.kind === 'ready' ? visibleResult.data : null
  const historyQueryKey = historyQuery ? JSON.stringify(historyQuery) : null
  const visibleHistoryResult: HistoryResult | null = !historyQuery ? null
    : !canReadHistory ? { kind: 'forbidden' }
      : historyResult?.queryKey === historyQueryKey ? historyResult.result : { kind: 'loading' }
  return (
    <Box sx={{ width: '100%', minWidth: 0, '& :is(button, a, pre):focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 } }}>
      <PageHeader title="Registros de auditoria"
        description="Consulte operações ou eventos de um registro. Os dados sensíveis são protegidos pela API." />
      <Typography color="text.secondary" sx={{ mb: 2 }}>Horário de Maceió ({AUDIT_TIME_ZONE}). O período pode abranger até {AUDIT_MAX_PERIOD_DAYS} dias.</Typography>
      {(canReadOperations || canReadHistory) && <Tabs value={view} onChange={(_, value: 'operations' | 'record') => changeView(value)} aria-label="Tipo de consulta de auditoria" sx={{ mb: 2 }}>
        {canReadOperations && <Tab value="operations" label="Operações" />}
        {canReadHistory && <Tab value="record" label="Histórico do registro" />}
      </Tabs>}
      {!canReadOperations && !canReadHistory && <StateFeedback kind="forbidden" title="Seu perfil não pode consultar a auditoria." />}
      {view === 'operations' && canReadOperations && <>
      <Box component="form" onSubmit={event => {
        event.preventDefault()
        const validation = validateAuditFilters(draft)
        setFilterError(validation)
        if (validation) return
        load({ ...draft, to: draft.to ? nextCivilDate(draft.to) : '' })
      }}>
        <FilterBar label="Filtros da auditoria">
          {fields.map(({ key, label, type, helper }) => (
            <TextField key={key} id={id + key} label={label} type={type} value={draft[key]}
              error={filterError?.field === key}
              helperText={filterError?.field === key ? <span role="alert">{filterError.message}</span> : helper}
              placeholder={key === 'operation' ? 'CREATE' : key === 'table' ? 'fleet.vehicles' : undefined}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ minWidth: 0, width: { xs: '100%', sm: 180 } }}
              onChange={event => {
                if (filterError?.field === key) setFilterError(null)
                setDraft({ ...draft, [key]: event.target.value })
              }} />
          ))}
          <Button type="submit" variant="contained">Aplicar filtros</Button>
          <Button color="inherit" onClick={() => { setDraft(empty); setFilterError(null); load(empty) }}>Limpar filtros</Button>
        </FilterBar>
      </Box>
      {visibleResult.kind === 'loading' && <StateFeedback kind="loading" title="Carregando registros de auditoria…" />}
      {visibleResult.kind === 'error' && <StateFeedback kind="error" title={visibleResult.message}
        actionLabel="Tentar novamente" onAction={() => load(query.filters, query.page)} />}
      {visibleResult.kind === 'forbidden' && <StateFeedback kind="forbidden" title="Seu perfil não pode consultar estes registros." />}
      {data?.partial && <StateFeedback kind="partial" title="A resposta contém registros inválidos que foram ocultados." />}
      {data && !data.logs.length && <StateFeedback kind="empty" title="Nenhum registro encontrado."
        description="Revise os filtros ou tente outro período." />}
      {data && data.logs.length > 0 && (
        <DataTable caption="Operações registradas" rows={data.logs} rowKey={row => row.id} minWidth={640}
          onRowClick={setSelected} columns={[
            { key: 'date', header: 'Data e hora', render: row => <time dateTime={row.registeredAt}>{formatDate(row.registeredAt)}</time> },
            { key: 'user', header: 'Usuário', render: row => actorName(row) },
            { key: 'action', header: 'Ação', render: row => row.operation },
            { key: 'entity', header: 'Entidade', render: row => row.table },
          ]}
          renderActions={row => <Button color="inherit" aria-label={'Ver detalhes do registro ' + row.id}
            onClick={event => { event.stopPropagation(); setSelected(row) }}>Ver detalhes</Button>} />
      )}
      {data && (
        <Stack component="nav" aria-label="Paginação da auditoria" direction="row" sx={{ mt: 2, flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Button color="inherit" disabled={data.page <= 1} onClick={() => load(query.filters, data.page - 1)}>Anterior</Button>
          <Typography role="status">Página {data.page} de {data.totalPages} · {data.total} registros</Typography>
          <Button color="inherit" disabled={data.page >= data.totalPages} onClick={() => load(query.filters, data.page + 1)}>Próxima</Button>
        </Stack>
      )}
      </>}
      {view === 'record' && canReadHistory && <>
        <Box component="form" onSubmit={event => {
          event.preventDefault()
          const validation = validateAuditFilters({
            ...empty,
            table: auditEntityTables[historyDraft.entityType],
            recordId: historyDraft.recordId,
            from: historyDraft.from,
            to: historyDraft.to,
          })
          setFilterError(validation)
          if (validation) return
          openRecordHistory(historyDraft)
        }}>
          <FilterBar label="Pesquisar histórico do registro">
            <TextField select id={id + 'entityType'} label="Tipo de registro" value={historyDraft.entityType}
              slotProps={{ select: { native: true } }} sx={{ minWidth: 180 }}
              onChange={event => setHistoryDraft({ ...historyDraft, entityType: event.target.value as AuditEntityType })}>
              {auditEntities.map(entity => <option key={entity.value} value={entity.value}>{entity.label}</option>)}
            </TextField>
            <TextField id={id + 'historyRecordId'} label="ID do registro" value={historyDraft.recordId}
              error={filterError?.field === 'recordId'}
              helperText={filterError?.field === 'recordId' ? <span role="alert">{filterError.message}</span> : 'Informe o identificador numérico do cadastro.'}
              sx={{ minWidth: 180 }} onChange={event => setHistoryDraft({ ...historyDraft, recordId: event.target.value })} />
            <TextField id={id + 'historyFrom'} label="Data inicial" type="date" value={historyDraft.from}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 170 }}
              onChange={event => setHistoryDraft({ ...historyDraft, from: event.target.value })} />
            <TextField id={id + 'historyTo'} label="Data final" type="date" value={historyDraft.to}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: 170 }}
              onChange={event => setHistoryDraft({ ...historyDraft, to: event.target.value })} />
            <Button type="submit" variant="contained">Consultar histórico</Button>
          </FilterBar>
        </Box>
        {!historyQuery && <StateFeedback kind="empty" title="Selecione um cadastro para consultar o histórico."
          description="Escolha o tipo do registro e informe seu identificador." />}
        {visibleHistoryResult?.kind === 'loading' && <StateFeedback kind="loading" title="Carregando histórico do registro…" />}
        {visibleHistoryResult?.kind === 'error' && <StateFeedback kind="error" title={visibleHistoryResult.message}
          actionLabel="Tentar novamente" onAction={() => {
            if (!historyQuery) return
            setHistoryResult({ queryKey: JSON.stringify(historyQuery), result: { kind: 'loading' } })
            setHistoryQuery({ ...historyQuery })
          }} />}
        {visibleHistoryResult?.kind === 'forbidden' && <StateFeedback kind="forbidden" title="Seu perfil não pode consultar este histórico." />}
        {visibleHistoryResult?.kind === 'ready' && visibleHistoryResult.data.items.length === 0 && <StateFeedback kind="empty" title="Nenhum evento encontrado."
          description="O registro ainda não possui alterações disponíveis para consulta." />}
        {visibleHistoryResult?.kind === 'ready' && visibleHistoryResult.data.items.length > 0 && <>
          <DataTable caption={`Histórico do registro ${visibleHistoryResult.data.recordId}`} rows={visibleHistoryResult.data.items}
            rowKey={row => row.id} columns={[
              { key: 'date', header: 'Data e hora', render: row => <time dateTime={row.occurredAt}>{formatDate(row.occurredAt)}</time> },
              { key: 'event', header: 'Evento', render: row => row.eventType.replaceAll('_', ' ') },
              { key: 'actor', header: 'Responsável', render: row => row.actor.name ?? 'Usuário não identificado' },
              { key: 'reason', header: 'Justificativa', render: row => row.sensitiveDataHidden ? 'Dados protegidos' : row.reason ?? '—' },
            ]} renderActions={row => <Button color="inherit" aria-label={`Ver evento ${row.eventType} ${row.id}`}
              onClick={() => setSelectedHistory(row)}>Detalhes</Button>} />
          <Stack component="nav" aria-label="Paginação do histórico" direction="row" sx={{ mt: 2, alignItems: 'center', gap: 1 }}>
            <Button color="inherit" disabled={visibleHistoryResult.data.page <= 1} onClick={() => setHistoryQuery(historyQuery ? { ...historyQuery, page: Math.max(1, visibleHistoryResult.data.page - 1) } : null)}>Anterior</Button>
            <Typography role="status">{visibleHistoryResult.data.total} evento(s) · Página {visibleHistoryResult.data.page} de {visibleHistoryResult.data.totalPages}</Typography>
            <Button color="inherit" disabled={visibleHistoryResult.data.page >= visibleHistoryResult.data.totalPages} onClick={() => setHistoryQuery(historyQuery ? { ...historyQuery, page: visibleHistoryResult.data.page + 1 } : null)}>Próxima</Button>
          </Stack>
        </>}
      </>}
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} aria-labelledby={id + '-detail'} fullWidth>
        <DialogTitle id={id + '-detail'}>Detalhes do registro {selected?.id}</DialogTitle>
        {selected && (
          <DialogContent sx={{ overflowWrap: 'anywhere' }}>
            <Box component="dl">
              {[
                ['Data e hora', `${formatDate(selected.registeredAt)} (Horário de Maceió — ${AUDIT_TIME_ZONE})`],
                ['Usuário', actorName(selected)], ['Ação', selected.operation], ['Entidade', selected.table],
                ['ID do registro', selected.recordId ?? 'Não informado'],
                ['Resumo', summary(selected)],
              ].map(([label, value]) => <Box key={label} sx={{ mb: 1 }}><Typography component="dt" sx={{ fontWeight: 700 }}>{label}</Typography><Typography component="dd" sx={{ m: 0 }}>{value}</Typography></Box>)}
            </Box>
            <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>Dados da alteração</Typography>
            {selected.sensitiveDataHidden
              ? <Typography role="status" color="text.secondary" sx={{ my: 1 }}>Dados sensíveis do SVO ocultados por política (LGPD).</Typography>
              : <Stack spacing={1} sx={{ mt: 1 }}>
                <Box><Typography variant="subtitle2">Antes</Typography><JsonValue label="Dados anteriores, já mascarados pela API" value={selected.before} /></Box>
                <Box><Typography variant="subtitle2">Depois</Typography><JsonValue label="Dados posteriores, já mascarados pela API" value={selected.after} /></Box>
              </Stack>}
            {selected.reason && !selected.sensitiveDataHidden && <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>Justificativa: {selected.reason}</Typography>}
          </DialogContent>
        )}
        <DialogActions><Button autoFocus color="inherit" onClick={() => setSelected(null)}>Fechar</Button></DialogActions>
      </Dialog>
      <Dialog open={Boolean(selectedHistory)} onClose={() => setSelectedHistory(null)} aria-labelledby={id + '-history-detail'} fullWidth>
        <DialogTitle id={id + '-history-detail'}>Detalhes do evento {selectedHistory?.id}</DialogTitle>
        {selectedHistory && <DialogContent sx={{ overflowWrap: 'anywhere' }}>
          <Box component="dl">
            {[
              ['Data do evento', formatDate(selectedHistory.occurredAt)],
              ['Registrado em', formatDate(selectedHistory.registeredAt)],
              ['Responsável', selectedHistory.actor.name ?? 'Usuário não identificado'],
              ['Origem', selectedHistory.source === 'DOMAIN_EVENT' ? 'Histórico operacional' : 'Auditoria'],
              ['Justificativa', selectedHistory.sensitiveDataHidden ? 'Dados protegidos' : selectedHistory.reason ?? 'Não informada'],
            ].map(([label, value]) => <Box key={label} sx={{ mb: 1 }}><Typography component="dt" sx={{ fontWeight: 700 }}>{label}</Typography><Typography component="dd" sx={{ m: 0 }}>{value}</Typography></Box>)}
          </Box>
          {selectedHistory.sensitiveDataHidden
            ? <Typography role="status" color="text.secondary">Dados sensíveis ocultados por política de proteção.</Typography>
            : <Stack spacing={1}><JsonValue label="Dados anteriores, mascarados pela API" value={selectedHistory.before} /><JsonValue label="Dados posteriores, mascarados pela API" value={selectedHistory.after} /></Stack>}
        </DialogContent>}
        <DialogActions><Button autoFocus color="inherit" onClick={() => setSelectedHistory(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
