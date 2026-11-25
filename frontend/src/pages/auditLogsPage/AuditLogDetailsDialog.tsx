import { useId } from 'react'
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  Stack,
  Typography,
} from '@mui/material'
import OpenInNewIcon from '@mui/icons-material/OpenInNew'
import type { Profile } from '../../auth/profiles'
import { accessibleControls } from '../../components/ui/accessibleControls'
import StateFeedback from '../../components/ui/StateFeedback'
import StatusChip from '../../components/ui/StatusChip'
import type { AuditLogEntry } from '../../types/auditLog'
import {
  formatActorDisplay,
  formatAuditDateTime,
  formatOperationLabel,
  formatTableLabel,
  operationTone,
  resolveAuditRecordTarget,
} from './auditLogPresentation'
import styles from './AuditLogsPage.module.css'

export interface AuditLogDetailsDialogProps {
  /** Registro selecionado para leitura detalhada; `null` mantém o diálogo fechado. */
  log: AuditLogEntry | null
  /** Perfil RBAC do usuário autenticado para resolver vínculo autorizado ao módulo de origem. */
  profile: Profile | null
  /** Fecha o diálogo sem alterar o histórico. */
  onClose: () => void
  /** Executado após o fechamento completo para restaurar o foco ao botão acionador. */
  onClosed: () => void
}

function formatJsonSnapshot(value: unknown): string {
  if (value === null || value === undefined) return 'Não registrado.'
  return JSON.stringify(value, null, 2)
}

function DetailField({ label, value }: { label: string; value: string }) {
  return (
    <Box sx={{ minWidth: 0 }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontWeight: 600, overflowWrap: 'anywhere' }}>
        {value}
      </Typography>
    </Box>
  )
}

/** Diálogo somente leitura para inspeção de autoria, instante, justificativa e snapshots mascarados. */
export default function AuditLogDetailsDialog({
  log,
  profile,
  onClose,
  onClosed,
}: AuditLogDetailsDialogProps) {
  const titleId = useId()
  const target = log ? resolveAuditRecordTarget(log, profile) : null

  return (
    <Dialog
      open={log !== null}
      onClose={onClose}
      fullWidth
      maxWidth="md"
      aria-labelledby={titleId}
      sx={accessibleControls}
      slotProps={{
        transition: { onExited: onClosed },
      }}
    >
      <DialogTitle id={titleId}>
        {log ? `Detalhes do evento de auditoria #${log.id}` : 'Detalhes do evento de auditoria'}
      </DialogTitle>

      <DialogContent dividers>
        {log && (
          <Stack spacing={2.5}>
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                flexWrap: 'wrap',
              }}
            >
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="body2" color="text.secondary">
                  Entidade e registro
                </Typography>
                <Typography variant="h6" sx={{ fontWeight: 700, overflowWrap: 'anywhere' }}>
                  {formatTableLabel(log.table)} ({log.table})
                  {log.recordId ? ` · Registro #${log.recordId}` : ''}
                </Typography>
              </Box>
              <StatusChip
                label={formatOperationLabel(log.operation)}
                tone={operationTone(log.operation)}
              />
            </Box>

            <Box className={styles.detailGrid}>
              <DetailField
                label="Data e hora (America/Maceio · UTC−03:00)"
                value={formatAuditDateTime(log.registeredAt)}
              />
              <DetailField
                label="Ator responsável"
                value={
                  log.userId
                    ? `${formatActorDisplay(log)} (ID #${log.userId})`
                    : formatActorDisplay(log)
                }
              />
              <DetailField
                label="Código da operação"
                value={log.operation}
              />
              <DetailField
                label="Justificativa registrada"
                value={
                  log.reason?.trim()
                    ? log.reason
                    : log.sensitiveDataHidden
                      ? 'Protegida por sigilo operacional (SVO)'
                      : 'Não informada'
                }
              />
            </Box>

            <Box>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 0.75 }}>
                Vínculo com o registro original
              </Typography>
              {target ? (
                <Button
                  component="a"
                  href={`#${target.path}`}
                  variant="outlined"
                  endIcon={<OpenInNewIcon aria-hidden="true" />}
                  sx={{ minHeight: 44 }}
                >
                  {target.label}
                </Button>
              ) : (
                <Typography variant="body2" color="text.secondary">
                  Sem tela de destino autorizada disponível para este registro no seu perfil.
                </Typography>
              )}
            </Box>

            <Divider />

            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                Snapshot do ator no instante do registro
              </Typography>
              <pre className={styles.snapshotBlock}>
                {formatJsonSnapshot(log.actorSnapshot)}
              </pre>
            </Box>

            {log.sensitiveDataHidden ? (
              <StateFeedback
                kind="partial"
                title="Dados do registro protegidos por sigilo operacional (SVO)"
                description="Os snapshots anteriores/posteriores e a justificativa livre de tabelas do SVO são omitidos pela API de auditoria (before, after e reason nulos), mantendo visíveis apenas autoria, ação, entidade e horário."
              />
            ) : (
              <Box className={styles.detailGrid}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                    Estado anterior (mascarado)
                  </Typography>
                  <pre className={styles.snapshotBlock}>
                    {formatJsonSnapshot(log.before)}
                  </pre>
                </Box>
                <Box sx={{ minWidth: 0 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.75 }}>
                    Estado posterior (mascarado)
                  </Typography>
                  <pre className={styles.snapshotBlock}>
                    {formatJsonSnapshot(log.after)}
                  </pre>
                </Box>
              </Box>
            )}
          </Stack>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={onClose} variant="contained" sx={{ minHeight: 44 }}>
          Fechar
        </Button>
      </DialogActions>
    </Dialog>
  )
}
