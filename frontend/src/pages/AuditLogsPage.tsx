import { useEffect, useId, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography, useTheme } from '@mui/material'
import DataTable from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import { useAuth } from '../auth/useAuth'
import { AuditAccessDenied, AuditRequestError, AUDIT_MAX_PERIOD_DAYS, AUDIT_TIME_ZONE, nextCivilDate, readAuditLogs, validateAuditFilters } from '../services/auditLogs'
import type { AuditFilters, AuditLog, AuditPage } from '../services/auditLogs'

const empty: AuditFilters = { from: '', to: '', userId: '', operation: '', table: '' }
const fields = [
  { key: 'from', label: 'Data inicial', type: 'date', helper: undefined },
  { key: 'to', label: 'Data final', type: 'date', helper: 'Inclui este dia; a API usa o dia seguinte como limite exclusivo.' },
  { key: 'userId', label: 'ID do usuário', type: 'text', helper: 'Informe um número inteiro positivo.' },
  { key: 'operation', label: 'Ação', type: 'text', helper: 'Ex.: CREATE, UPDATE, STATUS_CHANGE.' },
  { key: 'table', label: 'Entidade', type: 'text', helper: 'Formato schema.tabela, ex.: fleet.vehicles.' },
] as const
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
  'fleet.vehicles': 'Veículos', 'fleet.drivers': 'Motoristas',
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

/** Consulta somente leitura. O servidor é responsável pelas permissões e pela máscara dos detalhes. */
export default function AuditLogsPage() {
  const { api } = useAuth()
  const theme = useTheme()
  const id = useId()
  const [draft, setDraft] = useState(empty)
  const [query, setQuery] = useState({ filters: empty, page: 1 })
  const [result, setResult] = useState<Result>({ kind: 'loading' })
  const [selected, setSelected] = useState<AuditLog | null>(null)
  const [filterError, setFilterError] = useState<ReturnType<typeof validateAuditFilters>>(null)

  useEffect(() => { document.title = 'Registros de auditoria — Aratu' }, [])

  useEffect(() => {
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
  }, [api, query])

  function load(filters: AuditFilters, page = 1) {
    setSelected(null)
    setResult({ kind: 'loading' })
    setQuery({ filters, page })
  }

  const data = result.kind === 'ready' ? result.data : null
  return (
    <Box sx={{ width: '100%', minWidth: 0, '& :is(button, a, pre):focus-visible': { outline: `2px solid ${theme.palette.text.primary}`, outlineOffset: 2 } }}>
      <PageHeader title="Registros de auditoria" breadcrumbs={['Início', 'Auditoria']}
        description="Consulte as operações registradas no sistema. Os dados sensíveis são protegidos pela API." />
      <Typography color="text.secondary" sx={{ mb: 2 }}>Horário de Maceió ({AUDIT_TIME_ZONE}). O período pode abranger até {AUDIT_MAX_PERIOD_DAYS} dias.</Typography>
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
      {result.kind === 'loading' && <StateFeedback kind="loading" title="Carregando registros de auditoria…" />}
      {result.kind === 'error' && <StateFeedback kind="error" title={result.message}
        actionLabel="Tentar novamente" onAction={() => load(query.filters, query.page)} />}
      {result.kind === 'forbidden' && <StateFeedback kind="forbidden" title="Seu perfil não pode consultar estes registros." />}
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
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} aria-labelledby={id + '-detail'} fullWidth>
        <DialogTitle id={id + '-detail'}>Detalhes do registro {selected?.id}</DialogTitle>
        {selected && (
          <DialogContent sx={{ overflowWrap: 'anywhere' }}>
            <Box component="dl">
              {[
                ['Data e hora', `${formatDate(selected.registeredAt)} (Horário de Maceió — ${AUDIT_TIME_ZONE})`],
                ['Usuário', actorName(selected)], ['Ação', selected.operation], ['Entidade', selected.table],
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
            <Typography color="text.secondary" variant="body2" sx={{ mt: 1 }}>O identificador do registro e a justificativa não são exibidos enquanto a API não confirmar que esses campos podem ser apresentados sem expor dados sensíveis.</Typography>
          </DialogContent>
        )}
        <DialogActions><Button autoFocus color="inherit" onClick={() => setSelected(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
