import { useEffect, useState } from 'react'
import {
  Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Divider, Grid, Paper,
  Stack, Typography, useMediaQuery, useTheme,
} from '@mui/material'
import { profileLabel } from '../../auth/profiles'
import { formatDateTime } from '../../utils/dates'
import StateFeedback from './StateFeedback'
import type { EntityHistoryEntry, EntityHistoryPage } from '../../services/entityHistoryService'

const EVENT_LABELS: Record<EntityHistoryEntry['eventType'], string> = {
  CREATED: 'Cadastro realizado',
  UPDATED: 'Dados atualizados',
  STATUS_CHANGED: 'Situação alterada',
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  licensePlate: 'Placa', brand: 'Marca', model: 'Modelo', year: 'Ano', vehicleType: 'Tipo de veículo',
  ownership: 'Propriedade', categories: 'Categorias', seats: 'Assentos', bodyLimit: 'Limite de corpos',
  weightLimit: 'Limite de peso', operationType: 'Operação', status: 'Situação', revision: 'Revisão',
  name: 'Nome', cpf: 'CPF', cnhNumber: 'CNH', cnhCategory: 'Categoria da CNH', cnhExpiresAt: 'Validade da CNH',
  phone: 'Telefone', userId: 'Conta vinculada',
}

const VALUE_LABELS: Readonly<Record<string, string>> = {
  AVAILABLE: 'Disponível', IN_MAINTENANCE: 'Em manutenção', INACTIVE: 'Inativo', ACTIVE: 'Ativo', AWAY: 'Afastado',
  ADMINISTRATIVE: 'Administrativa', SVO: 'SVO', OWNED: 'Próprio', LEASED: 'Locado',
  PASSENGER: 'Passageiros', BODY: 'Corpos', OTHER: 'Outro',
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return 'Não informado'
  if (Array.isArray(value)) return value.map((entry) => typeof entry === 'string' ? VALUE_LABELS[entry] ?? entry : String(entry)).join(', ')
  if (typeof value === 'string') return VALUE_LABELS[value] ?? value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function changedFields(entry: EntityHistoryEntry): string[] {
  const before = entry.beforeState ?? {}
  const keys = new Set([...Object.keys(before), ...Object.keys(entry.afterState)])
  return [...keys].filter((key) => JSON.stringify(before[key]) !== JSON.stringify(entry.afterState[key]))
}

function StateComparison({ entry }: { entry: EntityHistoryEntry }) {
  const fields = changedFields(entry)
  if (!entry.beforeState) return <Typography variant="body2">Estado inicial registrado no cadastro.</Typography>
  if (fields.length === 0) return <Typography variant="body2">Não houve alteração nos campos exibidos.</Typography>
  return <Stack spacing={1}>
    {fields.map((key) => <Box key={key}>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>{FIELD_LABELS[key] ?? key}</Typography>
      <Grid container spacing={1}>
        <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Antes</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{formatValue(entry.beforeState?.[key])}</Typography></Grid>
        <Grid size={{ xs: 6 }}><Typography variant="caption" color="text.secondary">Depois</Typography><Typography variant="body2" sx={{ overflowWrap: 'anywhere' }}>{formatValue(entry.afterState[key])}</Typography></Grid>
      </Grid>
    </Box>)}
  </Stack>
}

/** Linha do tempo paginada para veículo ou motorista, sem reconstruir eventos anteriores. */
export default function EntityHistoryDialog({
  title,
  loadPage,
  onClose,
}: {
  title: string
  loadPage: (page: number) => Promise<EntityHistoryPage>
  onClose: () => void
}) {
  const theme = useTheme()
  const fullScreen = useMediaQuery(theme.breakpoints.down('sm'))
  const [page, setPage] = useState(1)
  const [result, setResult] = useState<EntityHistoryPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let current = true
    void loadPage(page).then((loaded) => {
      if (!current) return
      setResult(loaded)
      setError('')
      setLoading(false)
    }).catch((cause: unknown) => {
      if (!current) return
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.')
      setLoading(false)
    })
    return () => { current = false }
  }, [loadPage, page])

  return <Dialog open onClose={onClose} fullScreen={fullScreen} fullWidth maxWidth="md" aria-labelledby="entity-history-title">
    <DialogTitle id="entity-history-title">{title}</DialogTitle>
    <DialogContent dividers>
      {error && <StateFeedback kind={result ? 'partial' : 'error'} title={result ? 'A página atual pode estar desatualizada.' : 'Não foi possível carregar o histórico.'} description={error} actionLabel="Tentar novamente" onAction={() => {
        setLoading(true)
        void loadPage(page).then((loaded) => { setResult(loaded); setError(''); setLoading(false) }).catch((cause: unknown) => { setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o histórico.'); setLoading(false) })
      }} />}
      {loading && !result && <StateFeedback kind="loading" title="Carregando histórico..." />}
      {!loading && result?.items.length === 0 && <StateFeedback kind="empty" title="Nenhum evento registrado." description="Este histórico mostra apenas os eventos existentes; fatos anteriores não foram reconstruídos." />}
      {result && <Stack spacing={1.5} aria-busy={loading}>
        {result.items.map((entry) => <Paper key={entry.id} component="article" variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
          <Stack spacing={1.25}>
            <Box>
              <Typography component="h3" variant="subtitle1" sx={{ fontWeight: 700 }}>{EVENT_LABELS[entry.eventType]}</Typography>
              <Typography variant="body2" color="text.secondary">Ocorrido: {formatDateTime(entry.occurredAt)} · Registrado: {formatDateTime(entry.registeredAt)}</Typography>
            </Box>
            <Divider />
            <Typography variant="body2">Responsável: {entry.actor.name} ({profileLabel(entry.actor.role)}) · Registro informado por: {entry.reportedBy}</Typography>
            <Typography variant="body2"><strong>Motivo:</strong> {entry.reason}</Typography>
            <Typography variant="body2"><strong>Evidência:</strong> {entry.evidenceDescription ?? 'Não registrada neste histórico.'}</Typography>
            <StateComparison entry={entry} />
          </Stack>
        </Paper>)}
      </Stack>}
    </DialogContent>
    <DialogActions sx={{ justifyContent: 'space-between', p: 2, flexWrap: 'wrap', gap: 1 }}>
      <Typography variant="body2" color="text.secondary">{result ? `${result.total} evento(s) · Página ${result.page} de ${Math.max(1, result.totalPages)}` : 'Histórico imutável'}</Typography>
      <Stack direction="row" spacing={1}>
        <Button onClick={() => { setPage((current) => Math.max(1, current - 1)); setLoading(true) }} disabled={!result || page <= 1 || loading} sx={{ minHeight: 44 }}>Anterior</Button>
        <Button onClick={() => { setPage((current) => Math.min(result?.totalPages ?? 1, current + 1)); setLoading(true) }} disabled={!result || page >= result.totalPages || loading} sx={{ minHeight: 44 }}>Próxima</Button>
        <Button onClick={onClose} variant="contained" sx={{ minHeight: 44 }}>Fechar</Button>
      </Stack>
    </DialogActions>
  </Dialog>
}
