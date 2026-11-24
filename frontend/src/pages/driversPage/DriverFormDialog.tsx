import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { accessibleControls } from '../../components/ui/accessibleControls'
import { FormField, FormSelect } from '../../components/ui/FormField'
import { CNH_CATEGORIES } from '../../drivers/driverTypes'
import type { CnhCategory, CreateDriverInput, Driver, DriverStatus, UpdateDriverInput } from '../../drivers/driverTypes'
import { DRIVER_STATUS_OPTIONS } from '../../drivers/driverStatus'
import {
  createDriver,
  listEligibleDriverAccounts,
  updateDriver,
} from '../../services/driversService'
import type { EligibleDriverAccount } from '../../services/driversService'
import {
  cpfDigits,
  driverToFormValues,
  EMPTY_DRIVER_FORM,
  maskCpf,
  validateDriverForm,
} from '../../drivers/driverForm'
import type { DriverFormErrors, DriverFormValues } from '../../drivers/driverForm'
import {
  buildEligibleAccountOptions,
  firstInvalidDriverField,
  mapDriverApiError,
  sanitizeCpfFromMessage,
} from './driverFormHelper'

interface DriverFormDialogBaseProps {
  api: ApiRequest
  /** O vínculo usa projeção mínima de domínio autorizada para GESTOR e ADMINISTRADOR. */
  canLinkAccount: boolean
  reportedBy: string
  onSaved: (driver: Driver) => void
  onCancel: () => void
}

type DriverFormDialogProps = DriverFormDialogBaseProps & (
  | { mode: 'create' }
  | { mode: 'edit'; driver: Driver }
)

const CATEGORY_OPTIONS = CNH_CATEGORIES.map((category) => ({ value: category, label: category }))

/**
 * Formulário de cadastro e edição de motoristas sobre os contratos da API da FROTA-49.
 *
 * A edição exige o motorista carregado para enviar `expectedRevision` (revisão otimista).
 */
export default function DriverFormDialog(props: DriverFormDialogProps) {
  const { api, canLinkAccount, reportedBy, onSaved, onCancel } = props
  const titleId = useId()
  const [values, setValues] = useState<DriverFormValues>(
    () => (props.mode === 'edit' ? driverToFormValues(props.driver) : EMPTY_DRIVER_FORM),
  )
  const [errors, setErrors] = useState<DriverFormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<EligibleDriverAccount[]>([])
  const [accountsLoading, setAccountsLoading] = useState(canLinkAccount)
  const [accountsError, setAccountsError] = useState('')
  const [accountsRetrySeq, setAccountsRetrySeq] = useState(0)
  const [focusRequest, setFocusRequest] = useState<{ field: keyof DriverFormValues; seq: number } | null>(null)

  const nameRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const cpfRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const cnhNumberRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const cnhCategoryBoxRef = useRef<HTMLDivElement>(null)
  const cnhExpiresAtRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const phoneRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)
  const statusBoxRef = useRef<HTMLDivElement>(null)
  const userIdBoxRef = useRef<HTMLDivElement>(null)
  const reasonRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null)

  const editingDriverId = props.mode === 'edit' ? props.driver.id : undefined
  const persistedUserId = props.mode === 'edit' ? props.driver.userId : null

  useEffect(() => {
    if (!focusRequest) return
    if (focusRequest.field === 'userId' && accountsLoading) return
    const resolveTarget = (field: keyof DriverFormValues): HTMLElement | null => {
      if (field === 'cnhCategory') {
        return cnhCategoryBoxRef.current?.querySelector<HTMLElement>('[role="combobox"], input, select') ?? null
      }
      if (field === 'status') {
        return statusBoxRef.current?.querySelector<HTMLElement>('[role="combobox"], input, select') ?? null
      }
      if (field === 'userId') {
        return userIdBoxRef.current?.querySelector<HTMLElement>('[role="combobox"], input, select') ?? null
      }
      const refMap: Record<'name' | 'cpf' | 'cnhNumber' | 'cnhExpiresAt' | 'phone' | 'reason', HTMLInputElement | HTMLTextAreaElement | null> = {
        name: nameRef.current,
        cpf: cpfRef.current,
        cnhNumber: cnhNumberRef.current,
        cnhExpiresAt: cnhExpiresAtRef.current,
        phone: phoneRef.current,
        reason: reasonRef.current,
      }
      return refMap[field]
    }
    const target = resolveTarget(focusRequest.field)
    if (!target) return
    target.focus()
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'nearest' })
    }
  }, [accountsLoading, focusRequest])

  useEffect(() => {
    if (!canLinkAccount) return
    let current = true
    const controller = new AbortController()

    async function loadCatalog() {
      setAccountsLoading(true)
      setAccountsError('')
      try {
        const eligible = await listEligibleDriverAccounts(api, editingDriverId, { signal: controller.signal })
        if (!current || controller.signal.aborted) return
        setAccounts(eligible)
      } catch (error) {
        if (!current || controller.signal.aborted) return
        const raw = error instanceof Error
          ? error.message
          : 'Não foi possível carregar as contas de motoristas.'
        setAccountsError(sanitizeCpfFromMessage(raw))
      } finally {
        if (current && !controller.signal.aborted) setAccountsLoading(false)
      }
    }

    void loadCatalog()
    return () => {
      current = false
      controller.abort()
    }
  }, [api, canLinkAccount, editingDriverId, accountsRetrySeq])

  const accountOptions = useMemo(() => {
    if (accountsError) {
      return persistedUserId && values.userId === persistedUserId
        ? [{ value: values.userId, label: `Conta atualmente vinculada (ID ${values.userId})` }]
        : []
    }
    return buildEligibleAccountOptions(
      accounts,
      editingDriverId,
      persistedUserId,
      values.userId,
    )
  }, [accounts, accountsError, editingDriverId, persistedUserId, values.userId])

  function requestFieldFocus(field: keyof DriverFormValues) {
    setFocusRequest((current) => ({ field, seq: (current?.seq ?? 0) + 1 }))
  }

  function retryAccounts() {
    setAccountsRetrySeq((current) => current + 1)
  }

  function update<K extends keyof DriverFormValues>(field: K, value: DriverFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateDriverForm(values)
    setErrors(nextErrors)
    const firstInvalid = firstInvalidDriverField(nextErrors)
    if (firstInvalid) {
      requestFieldFocus(firstInvalid)
      return
    }

    const attributes = {
      name: values.name.trim(),
      cpf: cpfDigits(values.cpf),
      cnhNumber: values.cnhNumber.trim(),
      cnhCategory: values.cnhCategory as CnhCategory,
      cnhExpiresAt: values.cnhExpiresAt,
      phone: values.phone.trim() || null,
      userId: values.userId || null,
      reportedBy,
      reason: values.reason.trim(),
    }

    setSaving(true)
    setSubmitError('')
    try {
      const saved = props.mode === 'create'
        ? await createDriver(api, { ...attributes, status: values.status } satisfies CreateDriverInput)
        : await updateDriver(api, props.driver.id, {
            ...attributes,
            expectedRevision: props.driver.revision,
          } satisfies UpdateDriverInput)
      onSaved(saved)
    } catch (error) {
      const mapped = mapDriverApiError(error)
      if (mapped.clearUserId) {
        setValues((current) => ({ ...current, userId: '' }))
      }
      if (Object.keys(mapped.fieldErrors).length > 0) {
        setErrors((current) => ({ ...current, ...mapped.fieldErrors }))
        const target = firstInvalidDriverField(mapped.fieldErrors)
        if (target) requestFieldFocus(target)
      }
      setSubmitError(mapped.bannerMessage)
      if (mapped.shouldRefreshAccounts && canLinkAccount) {
        retryAccounts()
      }
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={saving ? undefined : onCancel}
      fullWidth
      maxWidth="md"
      scroll="paper"
      aria-labelledby={titleId}
      sx={accessibleControls}
      slotProps={{
        paper: {
          sx: {
            m: { xs: 1, sm: 3 },
            width: { xs: 'calc(100% - 16px)', sm: '100%' },
            maxHeight: { xs: 'calc(100dvh - 16px)', sm: 'calc(100dvh - 48px)' },
          },
        },
      }}
    >
      <Box
        component="form"
        onSubmit={handleSubmit}
        noValidate
        sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden', maxHeight: '100%' }}
      >
        <DialogTitle id={titleId}>{props.mode === 'create' ? 'Cadastrar motorista' : 'Editar motorista'}</DialogTitle>
        <DialogContent dividers>
          {submitError && <Alert severity="error" role="alert" sx={{ mb: 2 }}>{submitError}</Alert>}
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <FormField
              label="Nome completo"
              value={values.name}
              onChange={(value) => update('name', value)}
              error={errors.name}
              required
              autoComplete="name"
              inputRef={nameRef}
            />
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="CPF"
                value={values.cpf}
                onChange={(value) => update('cpf', maskCpf(value))}
                error={errors.cpf}
                helperText="Digite os 11 dígitos do CPF."
                required
                inputMode="numeric"
                maxLength={14}
                placeholder="000.000.000-00"
                inputRef={cpfRef}
              />
              <FormField
                label="Número da CNH"
                value={values.cnhNumber}
                onChange={(value) => update('cnhNumber', value)}
                error={errors.cnhNumber}
                required
                autoComplete="off"
                inputRef={cnhNumberRef}
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <Box ref={cnhCategoryBoxRef} sx={{ flex: 1, minWidth: 0 }}>
                <FormSelect
                  label="Categoria da CNH"
                  value={values.cnhCategory}
                  onChange={(value) => update('cnhCategory', value)}
                  options={CATEGORY_OPTIONS}
                  error={errors.cnhCategory}
                  required
                />
              </Box>
              <FormField
                label="Validade da CNH"
                value={values.cnhExpiresAt}
                onChange={(value) => update('cnhExpiresAt', value)}
                error={errors.cnhExpiresAt}
                type="date"
                required
                inputRef={cnhExpiresAtRef}
              />
            </Stack>
            <FormField
              label="Telefone"
              value={values.phone}
              onChange={(value) => update('phone', value)}
              error={errors.phone}
              autoComplete="tel"
              placeholder="(00) 00000-0000"
              inputRef={phoneRef}
            />
            {props.mode === 'create' && (
              <Box ref={statusBoxRef}>
                <FormSelect
                  label="Situação inicial"
                  value={values.status}
                  onChange={(value) => update('status', value as DriverStatus)}
                  options={DRIVER_STATUS_OPTIONS}
                  error={errors.status}
                  helperText="Uma CNH vencida não permite cadastrar o motorista como ativo."
                  required
                />
              </Box>
            )}
            {canLinkAccount && (
              <Stack spacing={1}>
                {accountsError && (
                  <Alert
                    severity="warning"
                    role="alert"
                    action={(
                      <Button
                        color="inherit"
                        size="small"
                        onClick={retryAccounts}
                        disabled={accountsLoading}
                        sx={{ minHeight: 44 }}
                      >
                        Tentar novamente
                      </Button>
                    )}
                  >
                    {accountsError} Os dados preenchidos permanecem preservados: tente novamente ou continue sem alterar o vínculo.
                  </Alert>
                )}
                <Box ref={userIdBoxRef}>
                  <FormSelect
                    label="Conta de usuário vinculada (opcional)"
                    value={values.userId}
                    onChange={(value) => update('userId', value)}
                    options={accountOptions}
                    error={errors.userId}
                    emptyLabel={accountsLoading ? 'Carregando contas...' : 'Sem conta vinculada'}
                    disabled={accountsLoading || Boolean(accountsError)}
                    helperText="Somente contas ativas com perfil Motorista podem ser vinculadas."
                  />
                </Box>
              </Stack>
            )}
            <FormField
              label="Justificativa"
              value={values.reason}
              onChange={(value) => update('reason', value)}
              error={errors.reason}
              helperText="Registrada no histórico do motorista e na auditoria."
              required
              multiline
              minRows={2}
              inputRef={reasonRef}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: { xs: 1.5, sm: 2 }, flexWrap: 'wrap', gap: 1 }}>
          <Button onClick={onCancel} disabled={saving} color="inherit" sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
          <Button type="submit" variant="contained" disabled={saving} aria-busy={saving || undefined} sx={{ minHeight: 44 }}>
            {saving ? 'Salvando...' : props.mode === 'create' ? 'Cadastrar' : 'Salvar alterações'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
