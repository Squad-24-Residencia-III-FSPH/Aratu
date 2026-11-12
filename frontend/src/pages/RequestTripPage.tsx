import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, CircularProgress, Paper } from '@mui/material'
import { useInRouterContext, useNavigate } from 'react-router-dom'
import { SERVICE_UNAVAILABLE } from '../auth/loginService.ts'
import { useAuth } from '../auth/useAuth.ts'
import { FormField, FormSelect } from '../components/ui/FormField.tsx'
import PageHeader from '../components/ui/PageHeader.tsx'
import StateFeedback from '../components/ui/StateFeedback.tsx'
import { recordCreatedRequest } from '../requests/createdRequestsStore.ts'
import { MY_REQUESTS_PATH } from '../requests/requestAccess.ts'
import {
  EMPTY_REQUEST_FORM,
  firstInvalidRequestField,
  toCreateTripRequestInput,
  validateRequestForm,
} from '../requests/requestForm.ts'
import type { RequestFormErrors, RequestFormField, RequestFormValues } from '../requests/requestForm.ts'
import { REQUEST_CREATED_NOTICE } from '../requests/requestTypes.ts'
import type { ActiveServiceOption, SubmittedTripRequest } from '../requests/requestTypes.ts'
import { createTripRequest, listActiveServices } from '../services/requestsService.ts'

const DOCUMENT_TITLE = 'Nova solicitação de viagem — Aratu'

/** Propriedades opcionais da página de solicitação de viagem (US11 / FROTA-78). */
export interface RequestTripPageProps {
  /** Callback opcional invocado após o registro com sucesso da solicitação (`201 Created`). */
  onCreated?: (request: SubmittedTripRequest) => void
  /** Callback opcional de navegação para ambientes de teste fora de um Router. */
  onNavigate?: (path: string) => void
}

function RouterNavigator({ target, onDone }: { target: string | null; onDone: () => void }) {
  const navigate = useNavigate()
  useEffect(() => {
    if (!target) return
    navigate(target)
    onDone()
  }, [target, navigate, onDone])
  return null
}

/**
 * Página dedicada do perfil SOLICITANTE para abertura de solicitação de viagem (`FROTA-78` / `US11`).
 *
 * Carrega os tipos de serviço ativos via `GET /services`, valida os campos obrigatórios e de
 * data/hora futura no fuso `America/Maceio`, envia `POST /requests` com bloqueio de duplo clique
 * e redireciona para `/solicitacoes/minhas` exibindo `"Solicitação registrada"`.
 */
export default function RequestTripPage(props: RequestTripPageProps = {}) {
  const { session } = useAuth()
  return <RequestTripContent key={session?.token ?? 'anonymous'} {...props} />
}

function RequestTripContent({ onCreated, onNavigate }: RequestTripPageProps) {
  const { api } = useAuth()
  const inRouter = useInRouterContext()

  const [services, setServices] = useState<ActiveServiceOption[] | null>(null)
  const [loadingServices, setLoadingServices] = useState(true)
  const [servicesError, setServicesError] = useState<string | null>(null)
  const [refreshToken, setRefreshToken] = useState(0)

  const [values, setValues] = useState<RequestFormValues>(EMPTY_REQUEST_FORM)
  const [errors, setErrors] = useState<RequestFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [pendingRedirect, setPendingRedirect] = useState<string | null>(null)

  const submittingRef = useRef(false)
  const requestedDateRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const requestedTimeRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const serviceIdRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const originRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const destinationRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const purposeRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  useEffect(() => {
    const previous = document.title
    document.title = DOCUMENT_TITLE
    return () => {
      document.title = previous
    }
  }, [])

  useEffect(() => {
    let active = true
    void listActiveServices(api)
      .then((activeServices) => {
        if (!active) return
        setServices(activeServices)
        setServicesError(null)
      })
      .catch((error: unknown) => {
        if (!active) return
        const message =
          error instanceof Error && error.message.trim()
            ? error.message
            : SERVICE_UNAVAILABLE
        setServicesError(message)
        setServices(null)
      })
      .finally(() => {
        if (active) setLoadingServices(false)
      })
    return () => {
      active = false
    }
  }, [api, refreshToken])

  const reloadServices = useCallback(() => {
    setLoadingServices(true)
    setServicesError(null)
    setRefreshToken((current) => current + 1)
  }, [])

  function navigateTo(path: string): void {
    if (onNavigate) {
      onNavigate(path)
      return
    }
    if (inRouter) {
      setPendingRedirect(path)
    }
  }

  function focusField(field: RequestFormField): void {
    const refMap: Record<RequestFormField, React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>> = {
      requestedDate: requestedDateRef,
      requestedTime: requestedTimeRef,
      serviceId: serviceIdRef,
      origin: originRef,
      destination: destinationRef,
      purpose: purposeRef,
    }
    refMap[field].current?.focus()
  }

  function updateField<K extends RequestFormField>(field: K, value: RequestFormValues[K]): void {
    setValues((prev) => ({ ...prev, [field]: value }))
    setErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (submittingRef.current) return

    setSubmitError(null)
    setSuccessMessage(null)

    const validationErrors = validateRequestForm(values)
    const firstInvalid = firstInvalidRequestField(validationErrors)
    if (firstInvalid) {
      setErrors(validationErrors)
      focusField(firstInvalid)
      return
    }

    setErrors({})
    submittingRef.current = true
    setSubmitting(true)

    try {
      const normalized = toCreateTripRequestInput(values)
      const created = await createTripRequest(api, normalized)
      const selectedService = services?.find((item) => item.id === normalized.serviceId)
      const submittedRequest: SubmittedTripRequest = {
        ...normalized,
        id: created.id,
        status: created.status,
        serviceName: selectedService?.name ?? 'Serviço institucional',
        createdAtIso: new Date().toISOString(),
      }

      recordCreatedRequest(submittedRequest, REQUEST_CREATED_NOTICE)
      setSuccessMessage(REQUEST_CREATED_NOTICE)
      onCreated?.(submittedRequest)
      navigateTo(MY_REQUESTS_PATH)
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message
          : SERVICE_UNAVAILABLE
      setSubmitError(message)
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const serviceOptions = (services ?? []).map((service) => ({
    value: service.id,
    label: service.name,
  }))

  return (
    <Box
      component="main"
      aria-label="Nova solicitação de viagem"
      sx={{ p: 3, maxWidth: '960px', mx: 'auto' }}
    >
      {inRouter && (
        <RouterNavigator
          target={pendingRedirect}
          onDone={() => setPendingRedirect(null)}
        />
      )}

      <PageHeader
        title="Nova solicitação de viagem"
        breadcrumbs={['Início', 'Minhas solicitações', 'Nova solicitação']}
        description="Preencha os dados da viagem institucional. O Gestor de Frota analisará a solicitação e alocará veículo e motorista."
        actions={
          <Button
            variant="outlined"
            color="inherit"
            onClick={() => navigateTo(MY_REQUESTS_PATH)}
            disabled={submitting}
            sx={{ minHeight: 44 }}
          >
            Voltar para minhas solicitações
          </Button>
        }
      />

      {successMessage && (
        <Box role="status" aria-live="polite" sx={{ mb: 2 }}>
          <Alert severity="success">{successMessage}</Alert>
        </Box>
      )}

      {loadingServices && (
        <StateFeedback kind="loading" title="Carregando tipos de serviço..." />
      )}

      {!loadingServices && servicesError && (
        <StateFeedback
          kind="error"
          title={servicesError}
          actionLabel="Tentar novamente"
          onAction={reloadServices}
        />
      )}

      {!loadingServices && !servicesError && services !== null && services.length === 0 && (
        <StateFeedback
          kind="empty"
          title="Nenhum tipo de serviço disponível"
          description="Não há tipos de serviço ativos para registrar uma solicitação no momento."
          actionLabel="Atualizar"
          onAction={reloadServices}
        />
      )}

      {!loadingServices && !servicesError && services !== null && services.length > 0 && (
        <Paper
          elevation={0}
          sx={{
            p: { xs: 2, sm: 3 },
            borderRadius: 2,
            border: '1px solid #e2e8f0',
            backgroundColor: '#ffffff',
          }}
        >
          <Box
            component="form"
            noValidate
            onSubmit={(event) => {
              void handleSubmit(event)
            }}
            aria-busy={submitting}
            sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}
          >
            {submitError && (
              <Alert severity="error" role="alert">
                {submitError}
              </Alert>
            )}

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <FormField
                label="Data da viagem"
                type="date"
                required
                value={values.requestedDate}
                onChange={(value) => updateField('requestedDate', value)}
                error={errors.requestedDate}
                helperText="Selecione uma data igual ou posterior a hoje."
                disabled={submitting}
                inputRef={requestedDateRef}
              />

              <FormField
                label="Horário de saída"
                type="time"
                required
                value={values.requestedTime}
                onChange={(value) => updateField('requestedTime', value)}
                error={errors.requestedTime}
                helperText="Informe o horário no formato 24h (HH:mm)."
                disabled={submitting}
                inputRef={requestedTimeRef}
              />
            </Box>

            <FormSelect
              label="Tipo de serviço"
              required
              value={values.serviceId}
              onChange={(value) => updateField('serviceId', value)}
              options={serviceOptions}
              emptyLabel="Selecione o tipo de serviço"
              displayEmpty
              error={errors.serviceId}
              helperText="Tipos de serviço ativos configurados pela gestão de frota."
              disabled={submitting}
              inputRef={serviceIdRef}
            />

            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                gap: 2,
              }}
            >
              <FormField
                label="Origem"
                required
                placeholder="Ex: FSPH — Unidade Central"
                value={values.origin}
                onChange={(value) => updateField('origin', value)}
                error={errors.origin}
                disabled={submitting}
                inputRef={originRef}
              />

              <FormField
                label="Destino"
                required
                placeholder="Ex: Hospital de Urgência de Sergipe (HUSE)"
                value={values.destination}
                onChange={(value) => updateField('destination', value)}
                error={errors.destination}
                disabled={submitting}
                inputRef={destinationRef}
              />
            </Box>

            <FormField
              label="Finalidade"
              required
              multiline
              minRows={3}
              placeholder="Descreva a finalidade institucional do deslocamento..."
              value={values.purpose}
              onChange={(value) => updateField('purpose', value)}
              error={errors.purpose}
              disabled={submitting}
              inputRef={purposeRef}
            />

            <Box
              sx={{
                display: 'flex',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
                gap: 1.5,
                pt: 1,
              }}
            >
              <Button
                type="button"
                variant="outlined"
                color="inherit"
                disabled={submitting}
                onClick={() => navigateTo(MY_REQUESTS_PATH)}
                sx={{ minHeight: 44 }}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={submitting}
                startIcon={
                  submitting ? <CircularProgress size={18} color="inherit" /> : undefined
                }
                sx={{ minHeight: 44 }}
              >
                {submitting ? 'Enviando solicitação...' : 'Solicitar viagem'}
              </Button>
            </Box>
          </Box>
        </Paper>
      )}
    </Box>
  )
}
