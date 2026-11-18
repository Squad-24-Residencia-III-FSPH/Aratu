import { useEffect, useId, useState } from 'react'
import { Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack, TextField, Typography } from '@mui/material'
import DataTable from '../components/ui/DataTable'
import FilterBar from '../components/ui/FilterBar'
import StateFeedback from '../components/ui/StateFeedback'
import { useAuth } from '../auth/useAuth'
import { AuditAccessDenied, readAuditLogs } from '../services/auditLogs'
import type { AuditEntry, AuditFilters, AuditPage } from '../services/auditLogs'

const empty: AuditFilters = { inicio: '', fim: '', usuario_id: '', acao: '', entidade: '' }
const fields = [
  ['inicio', 'Data inicial', 'date'], ['fim', 'Data final', 'date'],
  ['usuario_id', 'ID do usuário', 'text'], ['acao', 'Ação', 'text'], ['entidade', 'Entidade', 'text'],
] as const
const dates = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })
const formatDate = (value: string) => dates.format(new Date(value))
const focus = { outline: '2px solid #111827', outlineOffset: 2 }
type Result = { kind: 'loading' | 'error' | 'forbidden' } | { kind: 'ready'; data: AuditPage }

/** Consulta somente leitura. O servidor é responsável pelas permissões e pela máscara dos detalhes. */
export default function AuditLogsPage() {
  const { api } = useAuth()
  const id = useId()
  const [draft, setDraft] = useState(empty)
  const [query, setQuery] = useState({ filters: empty, page: 1 })
  const [result, setResult] = useState<Result>({ kind: 'loading' })
  const [selected, setSelected] = useState<AuditEntry | null>(null)
  const [dateError, setDateError] = useState(false)
  const [offsets, setOffsets] = useState([0])

  useEffect(() => {
    const controller = new AbortController()
    void readAuditLogs(api, query.filters, query.page, controller.signal).then(
      data => { if (!controller.signal.aborted) setResult({ kind: 'ready', data }) },
      error => {
        if (!controller.signal.aborted) setResult({ kind: error instanceof AuditAccessDenied ? 'forbidden' : 'error' })
      },
    )
    return () => controller.abort()
  }, [api, query])

  function load(filters: AuditFilters, page = 1) {
    if (page === 1) setOffsets([0])
    setSelected(null)
    setResult({ kind: 'loading' })
    setQuery({ filters, page })
  }

  const data = result.kind === 'ready' ? result.data : null
  return (
    <Box sx={{ width: '100%', minWidth: 0, '& :is(button, a):focus-visible': focus,
      '& .MuiOutlinedInput-notchedOutline': { borderColor: '#6b7280' },
      '& .Mui-focused .MuiOutlinedInput-notchedOutline': { borderColor: '#111827' } }}>
      <title>Registros de auditoria — Aratu</title>
      <Typography component="h1" variant="h5" gutterBottom>Registros de auditoria</Typography>
      <Typography sx={{ mb: 2 }}>Fuso horário local: {dates.resolvedOptions().timeZone}</Typography>
      <Typography sx={{ mb: 2 }}>O período usa o fuso da FSPH (America/Maceio).</Typography>
      <Box component="form" onSubmit={event => {
        event.preventDefault()
        const invalid = Boolean(draft.inicio && draft.fim && draft.inicio > draft.fim)
        setDateError(invalid)
        if (!invalid) load(draft)
      }}>
        <FilterBar label="Filtros da auditoria">
          {fields.map(([key, label, type]) => (
            <TextField key={key} id={id + key} label={label} type={type} value={draft[key]}
              error={key === 'fim' && dateError}
              helperText={key === 'fim' && dateError ? 'A data final deve ser igual ou posterior à inicial.' : undefined}
              slotProps={{ inputLabel: { shrink: true }, formHelperText: { role: 'alert' } }}
              sx={{ minWidth: 0, width: { xs: '100%', sm: 160 } }}
              onChange={event => { setDateError(false); setDraft({ ...draft, [key]: event.target.value }) }} />
          ))}
          <Button type="submit" variant="contained">Aplicar filtros</Button>
          <Button color="inherit" onClick={() => { setDraft(empty); setDateError(false); load(empty) }}>Limpar filtros</Button>
        </FilterBar>
      </Box>
      {result.kind === 'loading' && <StateFeedback kind="loading" title="Carregando registros de auditoria…" />}
      {result.kind === 'error' && <StateFeedback kind="error" title="Não foi possível consultar a auditoria."
        actionLabel="Tentar novamente" onAction={() => load(query.filters, query.page)} />}
      {result.kind === 'forbidden' && <StateFeedback kind="forbidden" title="Seu perfil não pode consultar estes registros." />}
      {data?.partial && <StateFeedback kind="partial" title="A página contém resultados parciais." />}
      {data && !data.rows.length && <StateFeedback kind="empty" title="Nenhum registro nesta página." description="Revise os filtros ou volte à página anterior." />}
      {data && data.rows.length > 0 && (
        <DataTable caption="Operações registradas" rows={data.rows} rowKey={row => row.id} minWidth={640}
          onRowClick={setSelected} columns={[
            { key: 'date', header: 'Data e hora', render: row => <time dateTime={row.created_at}>{formatDate(row.created_at)}</time> },
            { key: 'user', header: 'Usuário', render: row => row.usuario },
            { key: 'action', header: 'Ação', render: row => row.acao },
            { key: 'entity', header: 'Entidade', render: row => row.entidade },
            { key: 'summary', header: 'Resumo', render: row => row.resumo },
          ]}
          renderActions={row => <Button color="inherit" aria-label={'Ver detalhes do registro ' + row.id}
            onClick={event => { event.stopPropagation(); setSelected(row) }}>Ver detalhes</Button>} />
      )}
      {data && (
        <Stack component="nav" aria-label="Paginação da auditoria" direction="row" sx={{ mt: 2, flexWrap: 'wrap', alignItems: 'center', gap: 1 }}>
          <Button color="inherit" disabled={query.page === 1} onClick={() => {
            load(query.filters, query.page - 1)
          }}>Anterior</Button>
          <Typography role="status">Página {query.page} · {data.total} registros</Typography>
          <Button color="inherit" disabled={!data.received || (offsets[query.page - 1] ?? 0) + data.received >= data.total} onClick={() => {
            setOffsets([...offsets.slice(0, query.page), (offsets[query.page - 1] ?? 0) + data.received])
            load(query.filters, query.page + 1)
          }}>Próxima</Button>
        </Stack>
      )}
      <Dialog open={Boolean(selected)} onClose={() => setSelected(null)} aria-labelledby={id + '-detail'} fullWidth>
        <DialogTitle id={id + '-detail'}>Detalhes do registro {selected?.id}</DialogTitle>
        {selected && (
          <DialogContent sx={{ overflowWrap: 'anywhere' }}>
            <Box component="dl">
              {[
                ['Data e hora', formatDate(selected.created_at) + ' (' + dates.resolvedOptions().timeZone + ')'],
                ['Usuário', selected.usuario], ['Ação', selected.acao], ['Entidade', selected.entidade],
                ['Resumo', selected.resumo], ['Detalhes', selected.detalhes_mascarados ?? 'A API não forneceu detalhes adicionais.'],
              ].map(([label, value]) => <Box key={label} sx={{ mb: 1 }}><dt style={{ fontWeight: 700 }}>{label}</dt><dd style={{ margin: 0 }}>{value}</dd></Box>)}
            </Box>
          </DialogContent>
        )}
        <DialogActions><Button autoFocus color="inherit" sx={{ '&:focus-visible': focus }} onClick={() => setSelected(null)}>Fechar</Button></DialogActions>
      </Dialog>
    </Box>
  )
}
