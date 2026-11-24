import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Box, Button, Paper, Stack, Typography } from '@mui/material'
import VisibilityIcon from '@mui/icons-material/Visibility'
import { useAuth } from '../../auth/useAuth'
import { resolveProfile } from '../../auth/profiles'
import { accessibleControls } from '../../components/ui/accessibleControls'
import DataTable from '../../components/ui/DataTable'
import type { DataTableColumn } from '../../components/ui/DataTable'
import FilterBar from '../../components/ui/FilterBar'
import { FormField, FormSelect } from '../../components/ui/FormField'
import PageHeader from '../../components/ui/PageHeader'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import {
  EMPTY_AUDIT_FILTER_DRAFT,
  useAuditLogs,
  validateAuditFilterDraft,
} from '../../hooks/useAuditLogs'
import type { AuditLogFilterDraft, AuditLogFilterErrors } from '../../hooks/useAuditLogs'
import { canAccessAuditLogs } from '../../types/auditLog'
import type { AuditLogEntry } from '../../types/auditLog'
import AuditLogDetailsDialog from './AuditLogDetailsDialog'
import {
  AUDIT_OPERATION_OPTIONS,
  formatActorDisplay,
  formatAuditDateTime,
  formatOperationLabel,
  formatTableLabel,
  operationTone,
} from './auditLogPresentation'
import styles from './AuditLogsPage.module.css'

function hasFilterValues(draft: AuditLogFilterDraft): boolean {
  return Boolean(
    draft.from.trim()
    || draft.to.trim()
    || draft.userId.trim()
    || draft.operation.trim()
    || draft.table.trim(),
  )
}

const AUDIT_COLUMNS: readonly DataTableColumn<AuditLogEntry>[] = [
  {
    key: 'registeredAt',
    header: 'Data e hora (America/Maceio)',
    width: 190,
    render: (log) => (
      <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: 'nowrap' }}>
        {formatAuditDateTime(log.registeredAt)}
      </Typography>
    ),
  },
  {
    key: 'actor',
    header: 'Ator',
    width: 210,
    render: (log) => (
      <Stack spacing={0.25}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatActorDisplay(log)}
        </Typography>
        <Typography variant="caption" color="text.secondary">
          {log.userId ? `ID #${log.userId}` : 'Sem usuário vinculado'}
        </Typography>
      </Stack>
    ),
  },
  {
    key: 'operation',
    header: 'Ação',
    width: 190,
    render: (log) => (
      <StatusChip
        label={formatOperationLabel(log.operation)}
        tone={operationTone(log.operation)}
      />
    ),
  },
  {
    key: 'entity',
    header: 'Entidade',
    width: 220,
    render: (log) => (
      <Stack spacing={0.25}>
        <Typography variant="body2" sx={{ fontWeight: 600 }}>
          {formatTableLabel(log.table)}
        </Typography>
        <Typography variant="caption" color="text.secondary" sx={{ overflowWrap: 'anywhere' }}>
          {log.table}
          {log.recordId ? ` · #${log.recordId}` : ''}
        </Typography>
      </Stack>
    ),
  },
  {
    key: 'reason',
    header: 'Justificativa / Resumo',
    width: 240,
    render: (log) => (
      <Typography
        variant="body2"
        color={log.sensitiveDataHidden && !log.reason?.trim() ? 'text.secondary' : 'text.primary'}
        sx={{ overflowWrap: 'anywhere' }}
      >
        {log.reason?.trim()
          ? log.reason
          : log.sensitiveDataHidden
            ? 'Protegida por sigilo (SVO)'
            : '—'}
      </Typography>
    ),
  },
]

/**
 * Tela somente leitura da trilha de auditoria (FROTA-142), restrita a Gestor e Administrador.
 */
export default function AuditLogsPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canAccessAuditLogs(profile)
  const state = useAuditLogs(api, allowed)

  const [draft, setDraft] = useState<AuditLogFilterDraft>(EMPTY_AUDIT_FILTER_DRAFT)
  const [fieldErrors, setFieldErrors] = useState<AuditLogFilterErrors>({})
  const [selectedLog, setSelectedLog] = useState<AuditLogEntry | null>(null)

  const triggerButtonRef = useRef<HTMLButtonElement | null>(null)
  const fromInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const toInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const userIdInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const tableInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    const previousTitle = document.title
    document.title = 'Trilha de Auditoria — Aratu'
    return () => {
      document.title = previousTitle
    }
  }, [])

  const restoreFocusToTrigger = useCallback(() => {
    const button = triggerButtonRef.current
    if (!button) return
    triggerButtonRef.current = null
    if (button.isConnected) {
      button.focus()
    }
  }, [])

  const closeDetails = useCallback(() => {
    setSelectedLog(null)
    requestAnimationFrame(() => {
      if (triggerButtonRef.current && document.activeElement === document.body) {
        restoreFocusToTrigger()
      }
    })
  }, [restoreFocusToTrigger])

  function updateField<K extends keyof AuditLogFilterDraft>(field: K, value: string): void {
    setDraft((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field] && !(field === 'from' && current.to)) return current
      const next = { ...current }
      delete next[field]
      if (field === 'from') delete next.to
      return next
    })
  }

  function focusFirstInvalidField(errors: AuditLogFilterErrors): void {
    if (errors.from) fromInputRef.current?.focus()
    else if (errors.to) toInputRef.current?.focus()
    else if (errors.userId) userIdInputRef.current?.focus()
    else if (errors.table) tableInputRef.current?.focus()
  }

  function handleFilterSubmit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault()
    const errors = validateAuditFilterDraft(draft)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      focusFirstInvalidField(errors)
      return
    }
    state.applyFilters({
      from: draft.from.trim(),
      to: draft.to.trim(),
      userId: draft.userId.trim(),
      operation: draft.operation.trim(),
      table: draft.table.trim(),
    })
  }

  function handleClearFilters(): void {
    setDraft(EMPTY_AUDIT_FILTER_DRAFT)
    setFieldErrors({})
    state.resetFilters()
  }

  const hasAppliedFilters = hasFilterValues(state.appliedFilters)
  const hasAnyFilter = hasAppliedFilters || hasFilterValues(draft)

  return (
    <Box className={styles.pageContainer} sx={accessibleControls}>
      <PageHeader
        title="Trilha de Auditoria"
        titleVariant="h4"
        breadcrumbs={['Início', 'Gestão', 'Auditoria']}
        description="Consulta somente leitura das ações registradas no sistema. Datas e horários exibidos no fuso operacional de Aracaju/Maceió (America/Maceio, UTC−03:00)."
      />

      {(!allowed || state.forbidden) && (
        <StateFeedback
          kind="forbidden"
          title="Acesso restrito à auditoria"
          description="Somente os perfis Gestor de Frota e Administrador do Sistema podem consultar a trilha de auditoria."
        />
      )}

      {allowed && !state.forbidden && (
        <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
          <Box component="form" onSubmit={handleFilterSubmit} noValidate>
            <FilterBar
              label="Filtros da trilha de auditoria"
              sx={{
                p: 2.5,
                mb: 0,
                border: 0,
                borderRadius: 0,
                borderBottom: '1px solid',
                borderColor: 'divider',
              }}
            >
              <Box sx={{ flex: '1 1 170px', minWidth: { xs: '100%', sm: 170 } }}>
                <FormField
                  label="Data inicial"
                  type="date"
                  value={draft.from}
                  onChange={(value) => updateField('from', value)}
                  error={fieldErrors.from}
                  helperText="Início inclusivo (America/Maceio)."
                  inputRef={fromInputRef}
                />
              </Box>

              <Box sx={{ flex: '1 1 180px', minWidth: { xs: '100%', sm: 180 } }}>
                <FormField
                  label="Data final (excluída)"
                  type="date"
                  value={draft.to}
                  onChange={(value) => updateField('to', value)}
                  error={fieldErrors.to}
                  helperText="Fim exclusivo; até 366 dias."
                  inputRef={toInputRef}
                />
              </Box>

              <Box sx={{ flex: '1 1 160px', minWidth: { xs: '100%', sm: 160 } }}>
                <FormField
                  label="ID do ator"
                  value={draft.userId}
                  onChange={(value) => updateField('userId', value)}
                  error={fieldErrors.userId}
                  placeholder="Ex.: 2"
                  inputMode="numeric"
                  helperText="Identificador numérico positivo."
                  inputRef={userIdInputRef}
                />
              </Box>

              <Box sx={{ flex: '1 1 210px', minWidth: { xs: '100%', sm: 210 } }}>
                <FormSelect
                  label="Ação"
                  value={draft.operation}
                  onChange={(value) => updateField('operation', value)}
                  options={AUDIT_OPERATION_OPTIONS}
                  emptyLabel="Todas as ações"
                  displayEmpty
                />
              </Box>

              <Box sx={{ flex: '1 1 210px', minWidth: { xs: '100%', sm: 210 } }}>
                <FormField
                  label="Entidade"
                  value={draft.table}
                  onChange={(value) => updateField('table', value)}
                  error={fieldErrors.table}
                  placeholder="Ex.: fleet.vehicles"
                  helperText="Formato schema.entidade."
                  inputRef={tableInputRef}
                />
              </Box>

              <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap', alignItems: 'center' }}>
                <Button
                  type="submit"
                  variant="contained"
                  disabled={state.loading}
                  sx={{ minHeight: 44 }}
                >
                  Filtrar
                </Button>
                <Button
                  type="button"
                  variant="outlined"
                  onClick={handleClearFilters}
                  disabled={!hasAnyFilter || state.loading}
                  sx={{ minHeight: 44 }}
                >
                  Limpar filtros
                </Button>
              </Box>
            </FilterBar>
          </Box>

          {state.error && (
            <StateFeedback
              kind="error"
              title="Não foi possível carregar a trilha de auditoria."
              description={state.error}
              actionLabel="Tentar novamente"
              onAction={state.retry}
              sx={{ m: 2 }}
            />
          )}

          {!state.error && (
            <DataTable
              caption="Registros da trilha de auditoria"
              columns={AUDIT_COLUMNS}
              rows={state.logs}
              rowKey={(log) => log.id}
              busy={state.loading}
              minWidth={1040}
              actionsWidth={160}
              containerClassName={styles.tableContainer}
              paperSx={{ borderRadius: 0, border: 0, boxShadow: 'none' }}
              loadingContent={(
                <StateFeedback
                  kind="loading"
                  title="Carregando registros de auditoria..."
                  sx={{ py: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 }}
                />
              )}
              emptyContent={(
                <StateFeedback
                  kind="empty"
                  title={hasAppliedFilters
                    ? 'Nenhum evento encontrado para os filtros aplicados.'
                    : 'Nenhum evento de auditoria registrado até o momento.'}
                  description={hasAppliedFilters
                    ? 'Ajuste o período (lembrando que a data final é exclusiva) ou limpe os filtros.'
                    : undefined}
                  actionLabel={hasAppliedFilters ? 'Limpar filtros' : undefined}
                  onAction={hasAppliedFilters ? handleClearFilters : undefined}
                  centered
                  sx={{ py: 4, mb: 0, backgroundColor: 'transparent', border: 0 }}
                />
              )}
              renderActions={(log) => (
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  startIcon={<VisibilityIcon aria-hidden="true" />}
                  aria-label={`Ver detalhes do evento #${log.id} (${formatOperationLabel(log.operation)})`}
                  onClick={(event) => {
                    triggerButtonRef.current = event.currentTarget
                    setSelectedLog(log)
                  }}
                  sx={{ minHeight: 44, whiteSpace: 'nowrap' }}
                >
                  Ver detalhes
                </Button>
              )}
            />
          )}

          {!state.error && (
            <Box
              sx={{
                px: 2.5,
                py: 1.75,
                borderTop: '1px solid',
                borderColor: 'divider',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: 1.5,
              }}
            >
              <Typography variant="body2" color="text.secondary" role="status" aria-live="polite">
                {state.total === 0
                  ? 'Nenhum registro encontrado'
                  : `${state.total} registro(s) encontrado(s) · Fuso America/Maceio`}
              </Typography>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Button
                  type="button"
                  size="small"
                  onClick={() => state.goToPage(state.page - 1)}
                  disabled={state.page <= 1 || state.loading}
                  aria-label="Página anterior"
                  sx={{ minHeight: 44 }}
                >
                  Anterior
                </Button>
                <Typography variant="body2" color="text.secondary">
                  Página {state.page} de {Math.max(1, state.totalPages)}
                </Typography>
                <Button
                  type="button"
                  size="small"
                  onClick={() => state.goToPage(state.page + 1)}
                  disabled={state.page >= state.totalPages || state.loading}
                  aria-label="Próxima página"
                  sx={{ minHeight: 44 }}
                >
                  Próxima
                </Button>
              </Box>
            </Box>
          )}
        </Paper>
      )}

      <AuditLogDetailsDialog
        log={selectedLog}
        profile={profile}
        onClose={closeDetails}
        onClosed={restoreFocusToTrigger}
      />
    </Box>
  )
}
