import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent, Ref } from 'react'
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  TextField,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material'
import SendIcon from '@mui/icons-material/Send'
import type { ApiRequest } from '../../api/client'
import { useSessionDraft } from '../../auth/sessionDrafts'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { FormField, FormSelect } from '../../components/ui/FormField'
import StateFeedback from '../../components/ui/StateFeedback'
import { listFleetServices } from '../../services/fleetServicesService'
import type { FleetService } from '../../services/fleetServicesService'
import {
  createRequest,
  isUncertainRequestError,
  RequestActionError,
  resubmitRequest,
} from '../../services/requestsService'
import type { CreatedRequestResult, ResubmitRequestResult } from '../../services/requestsService'
import {
  mapServerErrorToField,
  validateRequestForm,
  validateResubmitForm,
} from './requestFormValidation'
import type {
  RequestFormAnyField,
  RequestFormErrors,
  RequestFormField,
  RequestFormValues,
  ResubmitTarget,
} from './requestFormValidation'

interface NewRequestDialogProps {
  open: boolean
  api: ApiRequest
  draft: RequestFormValues
  resubmitTarget?: ResubmitTarget | null
  onChangeDraft: (updater: (current: RequestFormValues) => RequestFormValues) => void
  onClose: () => void
  onExited?: () => void
  onCreated: (created: CreatedRequestResult) => void
  onResubmitted?: (result: ResubmitRequestResult) => void
  onConflictRefresh?: (requestId: string) => void
  onRefreshList: () => Promise<boolean>
}

interface TimeFieldProps {
  label: string
  value: string
  onChange: (value: string) => void
  error?: string
  required?: boolean
  disabled?: boolean
  inputRef?: Ref<HTMLInputElement | HTMLTextAreaElement>
}

function TimeField({
  label,
  value,
  onChange,
  error,
  required,
  disabled,
  inputRef,
}: TimeFieldProps) {
  const id = useId()
  const errorId = `${id}-error`
  const hasError = Boolean(error)

  return (
    <TextField
      id={id}
      label={label}
      type="time"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={hasError}
      helperText={hasError ? <span id={errorId} role="alert">{error}</span> : undefined}
      required={required}
      disabled={disabled}
      fullWidth
      size="small"
      inputRef={inputRef}
      slotProps={{
        htmlInput: {
          'aria-invalid': hasError ? true : undefined,
          'aria-describedby': hasError ? errorId : undefined,
        },
        inputLabel: { shrink: true },
      }}
    />
  )
}

/** Diálogo acessível para criação (`POST /requests`) e reenvio versionado (`POST /requests/:id/resubmit`). */
export default function NewRequestDialog({
  open,
  api,
  draft,
  resubmitTarget = null,
  onChangeDraft,
  onClose,
  onExited,
  onCreated,
  onResubmitted,
  onConflictRefresh,
  onRefreshList,
}: NewRequestDialogProps) {
  const theme = useTheme()
  const mobileViewport = useMediaQuery(theme.breakpoints.down('sm'))
  const titleId = useId()
  const descriptionId = useId()

  const [catalogState, setCatalogState] = useState<{
    key: number
    services?: FleetService[]
    error?: string
  } | null>(null)
  const [catalogReload, setCatalogReload] = useState(0)

  const [fieldErrors, setFieldErrors] = useState<RequestFormErrors>({})
  const [resubmitReason, setResubmitReason, clearResubmitReason] = useSessionDraft('solicitacao:resubmit-reason', '')
  const [reasonError, setReasonError] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [uncertainSubmit, setUncertainSubmit, clearUncertainSubmit] = useSessionDraft('solicitacao:pending-send', false)
  const [conflictSubmit, setConflictSubmit] = useState(false)
  const [checkingList, setCheckingList] = useState(false)
  const [listCheckMessage, setListCheckMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const submittingRef = useRef(false)
  const submitSequence = useRef(0)
  useEffect(() => () => { submitSequence.current += 1 }, [])
  const serviceWrapperRef = useRef<HTMLDivElement>(null)
  const dateInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const timeInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const originInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const destinationInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const passengersInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const purposeInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const specialRequirementsInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const notesInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const reasonInputRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const focusField = useCallback((field: RequestFormAnyField) => {
    if (field === 'serviceId') {
      const target = serviceWrapperRef.current?.querySelector<HTMLElement>('[role="combobox"], input, button')
      target?.focus()
      return
    }
    const refMap: Record<Exclude<RequestFormAnyField, 'serviceId'>, typeof dateInputRef> = {
      requestedDate: dateInputRef,
      requestedTime: timeInputRef,
      origin: originInputRef,
      destination: destinationInputRef,
      passengers: passengersInputRef,
      purpose: purposeInputRef,
      specialRequirements: specialRequirementsInputRef,
      notes: notesInputRef,
      reason: reasonInputRef,
    }
    const target = refMap[field].current
    target?.focus()
    if (target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [])

  useEffect(() => {
    if (!open) return
    let current = true

    void listFleetServices(api)
      .then((loaded) => {
        if (!current) return
        setCatalogState({ key: catalogReload, services: loaded.filter((service) => service.active) })
      })
      .catch((error: unknown) => {
        if (!current) return
        setCatalogState({
          key: catalogReload,
          error: error instanceof Error && error.message
            ? error.message
            : 'Não foi possível carregar os tipos de serviço ativos.',
        })
      })

    return () => {
      current = false
    }
  }, [api, catalogReload, open])

  const isCatalogCurrent = open && catalogState?.key === catalogReload
  const servicesLoading = open && !isCatalogCurrent
  const servicesError = isCatalogCurrent ? catalogState.error ?? '' : ''
  const services = isCatalogCurrent ? catalogState.services ?? null : null

  const serviceOptions = useMemo(
    () => (services ?? []).map((service) => ({ value: service.id, label: service.name })),
    [services],
  )

  function handleDialogExited() {
    setFieldErrors({})
    clearResubmitReason()
    setReasonError('')
    setSubmitError('')
    clearUncertainSubmit()
    setConflictSubmit(false)
    setListCheckMessage('')
    onExited?.()
  }

  function updateField(field: RequestFormField, value: string) {
    onChangeDraft((current) => ({ ...current, [field]: value }))
    setFieldErrors((current) => {
      if (!current[field]) return current
      const next = { ...current }
      delete next[field]
      return next
    })
    if (submitError) setSubmitError('')
    if (listCheckMessage) setListCheckMessage('')
  }

  function updateReason(value: string) {
    setResubmitReason(value)
    if (reasonError) setReasonError('')
    if (submitError) setSubmitError('')
    if (listCheckMessage) setListCheckMessage('')
  }

  async function handleCheckListAfterUncertainError() {
    setCheckingList(true)
    setListCheckMessage('')
    const ok = await onRefreshList()
    setCheckingList(false)
    if (ok) {
      setUncertainSubmit(false)
      setSubmitError('')
      setListCheckMessage(
        'Lista atualizada. Confira na tabela principal se a solicitação já aparece antes de enviar novamente.',
      )
    } else {
      setListCheckMessage(
        'Ainda não foi possível consultar a lista. Tente novamente antes de reenviar para evitar duplicidade.',
      )
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (submittingRef.current || uncertainSubmit) return
    const attempt = ++submitSequence.current

    if (resubmitTarget) {
      const validation = validateResubmitForm(draft, resubmitReason, resubmitTarget.revision)
      if (!validation.ok) {
        setFieldErrors(validation.errors)
        setReasonError(validation.reasonError ?? '')
        setSubmitError('')
        focusField(validation.firstInvalidField)
        return
      }

      submittingRef.current = true
      setSubmitting(true)
      setFieldErrors({})
      setReasonError('')
      setSubmitError('')
      setUncertainSubmit(true)
      setConflictSubmit(false)
      setListCheckMessage('')

      try {
        const result = await resubmitRequest(api, resubmitTarget.id, validation.payload)
        if (attempt !== submitSequence.current) return
        clearUncertainSubmit()
        submittingRef.current = false
        setSubmitting(false)
        onResubmitted?.(result)
      } catch (error: unknown) {
        if (attempt !== submitSequence.current) return
        submittingRef.current = false
        setSubmitting(false)

        const message = error instanceof Error && error.message
          ? error.message
          : 'Não foi possível reenviar a solicitação. Tente novamente.'
        if (!isUncertainRequestError(error)) clearUncertainSubmit()

        if (error instanceof RequestActionError && error.kind === 'validation') {
          const targetField = mapServerErrorToField(message, draft)
          if (targetField === 'reason') {
            setReasonError(message)
            focusField('reason')
            return
          }
          if (targetField) {
            setFieldErrors({ [targetField]: message })
            focusField(targetField)
            return
          }
          setSubmitError(message)
          return
        }

        if (error instanceof RequestActionError && error.kind === 'conflict') {
          setConflictSubmit(true)
          setSubmitError(message)
          return
        }

        if (error instanceof RequestActionError && (error.kind === 'forbidden' || error.kind === 'notFound')) {
          setSubmitError(message)
          return
        }

        if (isUncertainRequestError(error)) {
          setSubmitError(
            `${message} Não foi possível confirmar se o reenvio foi gravado; consulte a lista antes de tentar novamente para evitar duplicidade.`,
          )
          return
        }

        setSubmitError(message)
      }
      return
    }

    const validation = validateRequestForm(draft)
    if (!validation.ok) {
      setFieldErrors(validation.errors)
      setSubmitError('')
      focusField(validation.firstInvalidField)
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setFieldErrors({})
    setSubmitError('')
    setUncertainSubmit(true)
    setConflictSubmit(false)
    setListCheckMessage('')

    try {
      const created = await createRequest(api, validation.payload)
      if (attempt !== submitSequence.current) return
      clearUncertainSubmit()
      submittingRef.current = false
      setSubmitting(false)
      onCreated(created)
    } catch (error: unknown) {
      if (attempt !== submitSequence.current) return
      submittingRef.current = false
      setSubmitting(false)

      const message = error instanceof Error && error.message
        ? error.message
        : 'Não foi possível enviar a solicitação. Tente novamente.'
      if (!isUncertainRequestError(error)) clearUncertainSubmit()

      if (error instanceof RequestActionError && error.kind === 'validation') {
        const targetField = mapServerErrorToField(message, draft)
        if (targetField && targetField !== 'reason') {
          setFieldErrors({ [targetField]: message })
          focusField(targetField)
          return
        }
        setSubmitError(message)
        return
      }

      if (error instanceof RequestActionError && error.kind === 'forbidden') {
        setSubmitError(message)
        return
      }

      if (isUncertainRequestError(error)) {
        setSubmitError(
          `${message} Não foi possível confirmar se o pedido foi gravado; consulte a lista antes de tentar novamente para evitar duplicidade.`,
        )
        return
      }

      setSubmitError(message)
    }
  }

  const catalogUnavailable = Boolean(servicesError) || (!servicesLoading && services !== null && services.length === 0)

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : onClose}
      maxWidth="md"
      fullWidth
      fullScreen={mobileViewport}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      sx={{
        ...accessibleControls,
        '& .MuiDialog-paper': {
          m: { xs: 0, sm: 3 },
          width: { xs: '100%', sm: undefined },
          maxHeight: { xs: '100dvh', sm: 'calc(100% - 64px)' },
          borderRadius: { xs: 0, sm: 2 },
        },
      }}
      slotProps={{
        transition: {
          onExited: handleDialogExited,
        },
      }}
    >
      <DialogTitle id={titleId} sx={{ fontWeight: 700, fontSize: '1.25rem' }}>
        {resubmitTarget
          ? `Corrigir Solicitação #${resubmitTarget.id}`
          : 'Nova Solicitação de Viagem'}
      </DialogTitle>
      <DialogContent dividers>
        <Box
          component="form"
          noValidate
          onSubmit={(event) => { void handleSubmit(event) }}
          sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}
        >
          <Alert id={descriptionId} severity={resubmitTarget ? 'warning' : 'info'} sx={{ borderRadius: 1.5 }}>
            {resubmitTarget
              ? `Observação do Gestor para correção: ${resubmitTarget.rejectionReason || 'Não informada.'} Revise os dados necessários e informe a justificativa do reenvio.`
              : 'Preencha os dados da viagem. O Gestor de Frota analisará a solicitação e alocará veículo e motorista.'}
          </Alert>

          {(submitError || (uncertainSubmit && !submitting)) && (
            <Alert
              severity={uncertainSubmit || conflictSubmit ? 'warning' : 'error'}
              role="alert"
              action={uncertainSubmit ? (
                <Button
                  color="inherit"
                  onClick={() => { void handleCheckListAfterUncertainError() }}
                  disabled={checkingList}
                  sx={{ minHeight: 44, minWidth: 44, whiteSpace: 'nowrap' }}
                >
                  {checkingList ? 'Consultando...' : 'Consultar lista'}
                </Button>
              ) : conflictSubmit && resubmitTarget && onConflictRefresh ? (
                <Button
                  color="inherit"
                  onClick={() => { onConflictRefresh(resubmitTarget.id) }}
                  sx={{ minHeight: 44, minWidth: 44, whiteSpace: 'nowrap' }}
                >
                  Atualizar solicitação
                </Button>
              ) : undefined}
            >
              {submitError || 'Consulte a lista para conferir se o envio anterior foi registrado antes de tentar novamente.'}
            </Alert>
          )}

          {listCheckMessage && (
            <Alert severity="info" role="status">
              {listCheckMessage}
            </Alert>
          )}

          <Box ref={serviceWrapperRef}>
            {servicesLoading ? (
              <Box
                role="status"
                aria-live="polite"
                aria-busy="true"
                sx={{ display: 'flex', alignItems: 'center', gap: 1.5, py: 1 }}
              >
                <CircularProgress size={20} />
                <Typography variant="body2">Carregando tipos de serviço ativos...</Typography>
              </Box>
            ) : servicesError ? (
              <StateFeedback
                kind="error"
                title="Não foi possível carregar os tipos de serviço."
                description={servicesError}
                actionLabel="Tentar novamente"
                onAction={() => setCatalogReload((count) => count + 1)}
                sx={{ mb: 0 }}
              />
            ) : services !== null && services.length === 0 ? (
              <StateFeedback
                kind="empty"
                title="Nenhum tipo de serviço ativo disponível."
                description="Procure a gestão de frota para habilitar um tipo de serviço antes de solicitar."
                actionLabel="Atualizar catálogo"
                onAction={() => setCatalogReload((count) => count + 1)}
                sx={{ mb: 0 }}
              />
            ) : (
              <FormSelect
                label="Tipo de serviço"
                value={draft.serviceId}
                onChange={(value) => updateField('serviceId', value)}
                options={serviceOptions}
                emptyLabel="Selecione um tipo de serviço"
                displayEmpty
                emptyOptionDisabled
                required
                disabled={submitting}
                error={fieldErrors.serviceId}
              />
            )}
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <FormField
              label="Data da viagem"
              type="date"
              value={draft.requestedDate}
              onChange={(value) => updateField('requestedDate', value)}
              required
              disabled={submitting}
              error={fieldErrors.requestedDate}
              inputRef={dateInputRef}
            />
            <TimeField
              label="Horário de saída"
              value={draft.requestedTime}
              onChange={(value) => updateField('requestedTime', value)}
              required
              disabled={submitting}
              error={fieldErrors.requestedTime}
              inputRef={timeInputRef}
            />
          </Box>

          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: { xs: 'minmax(0, 1fr)', sm: 'repeat(2, minmax(0, 1fr))' },
              gap: 2,
            }}
          >
            <FormField
              label="Origem"
              value={draft.origin}
              onChange={(value) => updateField('origin', value)}
              required
              disabled={submitting}
              placeholder="Unidade ou endereço de partida"
              maxLength={200}
              error={fieldErrors.origin}
              inputRef={originInputRef}
            />
            <FormField
              label="Destino"
              value={draft.destination}
              onChange={(value) => updateField('destination', value)}
              required
              disabled={submitting}
              placeholder="Endereço completo de destino"
              maxLength={200}
              error={fieldErrors.destination}
              inputRef={destinationInputRef}
            />
          </Box>

          <FormField
            label="Quantidade de Passageiros"
            type="number"
            inputMode="numeric"
            value={draft.passengers}
            onChange={(value) => updateField('passengers', value)}
            required
            disabled={submitting}
            helperText="Informe pelo menos 1 passageiro."
            error={fieldErrors.passengers}
            inputRef={passengersInputRef}
          />

          <FormField
            label="Finalidade / Motivo"
            value={draft.purpose}
            onChange={(value) => updateField('purpose', value)}
            required
            multiline
            minRows={2}
            disabled={submitting}
            placeholder="Ex.: Reunião institucional, entrega de material..."
            maxLength={500}
            error={fieldErrors.purpose}
            inputRef={purposeInputRef}
          />

          <FormField
            label="Necessidades especiais"
            value={draft.specialRequirements ?? ''}
            onChange={(value) => updateField('specialRequirements', value)}
            multiline
            minRows={2}
            disabled={submitting}
            placeholder="Adaptações ou apoio necessários para a viagem (opcional)"
            helperText="Descreva adaptações ou apoio necessários para a viagem."
            maxLength={500}
            error={fieldErrors.specialRequirements}
            inputRef={specialRequirementsInputRef}
          />

          <FormField
            label="Observações"
            value={draft.notes}
            onChange={(value) => updateField('notes', value)}
            multiline
            minRows={2}
            disabled={submitting}
            placeholder="Informações adicionais de embarque ou material (opcional)"
            maxLength={1000}
            error={fieldErrors.notes}
            inputRef={notesInputRef}
          />

          {resubmitTarget && (
            <FormField
              label="Justificativa do reenvio"
              value={resubmitReason}
              onChange={updateReason}
              required
              multiline
              minRows={2}
              disabled={submitting}
              placeholder="Explique as correções realizadas após a devolução"
              maxLength={500}
              error={reasonError}
              inputRef={reasonInputRef}
            />
          )}

          <DialogActions sx={{ px: 0, pt: 1, pb: 'max(0px, env(safe-area-inset-bottom))', gap: 1, flexWrap: 'wrap' }}>
            <Button
              type="button"
              onClick={onClose}
              disabled={submitting}
              variant="outlined"
              color="inherit"
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              variant="contained"
              startIcon={<SendIcon aria-hidden="true" />}
              disabled={submitting || uncertainSubmit || servicesLoading || catalogUnavailable}
              aria-busy={submitting ? 'true' : undefined}
              sx={{ minHeight: 44, minWidth: 44 }}
            >
              {resubmitTarget
                ? (submitting ? 'Reenviando solicitação...' : 'Confirmar Reenvio')
                : (submitting ? 'Enviando solicitação...' : 'Enviar Solicitação')}
            </Button>
          </DialogActions>
        </Box>
      </DialogContent>
    </Dialog>
  )
}
