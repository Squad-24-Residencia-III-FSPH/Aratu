import { useState } from 'react'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import Box from '@mui/material/Box'
import DataTable from '../components/ui/DataTable'
import type { DataTableColumn } from '../components/ui/DataTable'
import PageHeader from '../components/ui/PageHeader'
import StateFeedback from '../components/ui/StateFeedback'
import StatusChip from '../components/ui/StatusChip'
import { useAuth } from '../auth/useAuth'
import { useSvoOccurrences } from '../hooks/useSvoOccurrences'
import SvoOccurrenceWorkflowDialog from './svoOccurrencesPage/SvoOccurrenceWorkflowDialog'
import {
  formatSvoOccurrenceDateTime,
  SVO_OCCURRENCE_STATUS_LABELS,
  SVO_OCCURRENCE_STATUS_TONES,
  SVO_REQUESTER_TYPE_LABELS,
} from '../svo/svoOccurrencePresentation'
import type { SvoOccurrenceSummary } from '../svo/svoOccurrenceTypes'

/** Fila de triagem que apresenta apenas ocorrências pendentes retornadas pela API. */
function triageColumns(onSelect: (occurrence: SvoOccurrenceSummary) => void): readonly DataTableColumn<SvoOccurrenceSummary>[] {
  return [
    { key: 'id', header: 'Solicitação', width: 130, render: (occurrence) => `#${occurrence.id}` },
    { key: 'requesterType', header: 'Tipo de solicitante', render: (occurrence) => SVO_REQUESTER_TYPE_LABELS[occurrence.requesterType] },
    { key: 'location', header: 'Local', render: (occurrence) => occurrence.location },
    { key: 'receivedAt', header: 'Recebida em', width: 170, render: (occurrence) => formatSvoOccurrenceDateTime(occurrence.receivedAt) },
    {
      key: 'status', header: 'Situação', width: 140,
      render: (occurrence) => <StatusChip label={SVO_OCCURRENCE_STATUS_LABELS[occurrence.status]} tone={SVO_OCCURRENCE_STATUS_TONES[occurrence.status]} />,
    },
    {
      key: 'triage', header: 'Triagem', align: 'right', width: 160,
      render: (occurrence) => (
        <Button onClick={() => onSelect(occurrence)} aria-label={`Abrir triagem da solicitação ${occurrence.id}`} sx={{ minHeight: 44 }}>
          Abrir triagem
        </Button>
      ),
    },
  ]
}

/** Caixa de trabalho para consultar e registrar triagens das ocorrências pendentes. */
export default function SvoTriagesPage() {
  const { api, session } = useAuth()
  const workflow = useSvoOccurrences(api, 'PENDING')
  const [selectedOccurrenceId, setSelectedOccurrenceId] = useState<string | null>(null)
  const canWrite = session?.perfil === 'ATENDENTE_SVO' || session?.perfil === 'ADMINISTRADOR'
  const rows = (workflow.occurrences ?? []).filter((occurrence) => occurrence.status === 'PENDING')
  const columns = triageColumns((occurrence) => {
    setSelectedOccurrenceId(occurrence.id)
    void workflow.openDetail(occurrence.id)
  })

  function closeDetails(): void {
    setSelectedOccurrenceId(null)
    workflow.closeDetail()
  }

  return (
    <Box>
      {workflow.notice && <Alert severity="success" role="status" aria-live="polite" sx={{ mb: 2 }}>{workflow.notice}</Alert>}
      {selectedOccurrenceId ? (
        <SvoOccurrenceWorkflowDialog
          key={selectedOccurrenceId}
          presentation="page"
          open
          detail={workflow.detail}
          canWrite={canWrite}
          savingTriage={workflow.savingTriage}
          confirming={workflow.confirming}
          confirmationError={workflow.confirmationError}
          confirmationBlocked={workflow.confirmationBlocked}
          onClose={closeDetails}
          onRetry={() => { if (workflow.detail) void workflow.openDetail(workflow.detail.id) }}
          onSaveTriage={workflow.saveTriage}
          onConfirm={workflow.confirm}
          onClearConfirmationError={workflow.clearConfirmationError}
        />
      ) : (
        <>
          <PageHeader
            title="Triagens"
            breadcrumbs={['Início', 'SVO — Atendimento', 'Triagens']}
            description="Consulte os dados recebidos e registre ou retifique a triagem das solicitações pendentes."
            actions={<Button onClick={() => { void workflow.reload() }} disabled={workflow.loading} sx={{ minHeight: 44 }}>Atualizar lista</Button>}
          />
          {workflow.permissionDenied ? (
        <StateFeedback kind="forbidden" title="Seu perfil não tem permissão para consultar triagens SVO." description={workflow.listError || undefined} actionLabel="Tentar novamente" onAction={() => { void workflow.reload() }} />
      ) : (
        <>
          {workflow.partialWarning && <StateFeedback kind="partial" title={workflow.partialWarning} actionLabel="Atualizar lista" onAction={() => { void workflow.reload() }} />}
          {workflow.listError && workflow.occurrences && <StateFeedback kind="partial" title={workflow.listError} actionLabel="Tentar novamente" onAction={() => { void workflow.reload() }} />}
          {!workflow.occurrences && workflow.loading ? (
            <StateFeedback kind="loading" title="Carregando solicitações pendentes de triagem..." />
          ) : !workflow.occurrences && workflow.listError ? (
            <StateFeedback kind={workflow.listErrorKind === 'forbidden' ? 'forbidden' : 'error'} title={workflow.listError} actionLabel="Tentar novamente" onAction={() => { void workflow.reload() }} />
          ) : (
            <DataTable
              caption="Solicitações pendentes de triagem SVO"
              columns={columns}
              rows={rows}
              rowKey={(occurrence) => occurrence.id}
              busy={workflow.loading}
              minWidth={760}
              loadingContent={<StateFeedback kind="loading" title="Atualizando solicitações pendentes..." sx={{ justifyContent: 'center' }} />}
              emptyContent={<StateFeedback kind="empty" title="Não há solicitações pendentes de triagem." sx={{ m: 0 }} />}
            />
          )}
        </>
          )}
        </>
      )}
    </Box>
  )
}
