import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, Stack } from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { FormField, FormSelect } from '../../components/ui/FormField'
import { listUsers } from '../../services/usersService'
import type { ManagedUser } from '../../users/userTypes'
import {
  CNH_CATEGORIES,
  DriverRequestError,
} from '../../drivers/driverTypes'
import type { CnhCategory, CreateDriverInput, Driver, DriverStatus, UpdateDriverInput } from '../../drivers/driverTypes'
import { DRIVER_STATUS_OPTIONS } from '../../drivers/driverStatus'
import {
  createDriver,
  updateDriver,
} from '../../services/driversService'
import {
  cpfDigits,
  driverToFormValues,
  EMPTY_DRIVER_FORM,
  maskCpf,
  validateDriverForm,
} from '../../drivers/driverForm'
import type { DriverFormErrors, DriverFormValues } from '../../drivers/driverForm'

interface DriverFormDialogBaseProps {
  api: ApiRequest
  drivers: readonly Driver[]
  /** O vínculo de conta exige `GET /users`, restrito por RBAC a ADMINISTRADOR. */
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
  const { api, drivers, canLinkAccount, reportedBy, onSaved, onCancel } = props
  const [values, setValues] = useState<DriverFormValues>(
    () => (props.mode === 'edit' ? driverToFormValues(props.driver) : EMPTY_DRIVER_FORM),
  )
  const [errors, setErrors] = useState<DriverFormErrors>({})
  const [submitError, setSubmitError] = useState('')
  const [saving, setSaving] = useState(false)
  const [accounts, setAccounts] = useState<ManagedUser[]>([])
  const [accountsLoading, setAccountsLoading] = useState(canLinkAccount)
  const [accountsError, setAccountsError] = useState('')

  useEffect(() => {
    if (!canLinkAccount) return
    let current = true
    async function loadAccounts() {
      try {
        const firstPage = await listUsers(api, { role: 'MOTORISTA', active: true, page: 1, pageSize: 100 })
        const pages = await Promise.all(Array.from(
          { length: Math.max(0, firstPage.totalPages - 1) },
          (_, index) => listUsers(api, {
            role: 'MOTORISTA',
            active: true,
            page: index + 2,
            pageSize: 100,
          }),
        ))
        if (current) setAccounts([...firstPage.users, ...pages.flatMap((page) => page.users)])
      } catch (error) {
        if (current) setAccountsError(error instanceof Error
          ? error.message
          : 'Não foi possível carregar as contas de motoristas.')
      } finally {
        if (current) setAccountsLoading(false)
      }
    }

    void loadAccounts()
    return () => { current = false }
  }, [api, canLinkAccount])

  const editingDriverId = props.mode === 'edit' ? props.driver.id : undefined
  const accountOptions = useMemo(() => {
    const linkedElsewhere = new Set(drivers
      .filter((item) => item.id !== editingDriverId && item.userId !== null)
      .map((item) => item.userId as string))
    const eligible = accounts
      .filter((account) => !linkedElsewhere.has(account.id))
      .map((account) => ({ value: account.id, label: `${account.name} — ${account.email}` }))

    if (values.userId && !eligible.some((option) => option.value === values.userId)) {
      eligible.unshift({ value: values.userId, label: `Conta atualmente vinculada (ID ${values.userId})` })
    }
    return eligible
  }, [accounts, drivers, editingDriverId, values.userId])

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
    if (Object.keys(nextErrors).length > 0) return

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
      setSubmitError(error instanceof DriverRequestError || error instanceof Error
        ? error.message
        : 'Não foi possível salvar o motorista. Tente novamente.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onClose={saving ? undefined : onCancel} fullWidth maxWidth="md" aria-labelledby="driver-form-title">
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle id="driver-form-title">{props.mode === 'create' ? 'Cadastrar motorista' : 'Editar motorista'}</DialogTitle>
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
              />
              <FormField
                label="Número da CNH"
                value={values.cnhNumber}
                onChange={(value) => update('cnhNumber', value)}
                error={errors.cnhNumber}
                required
                autoComplete="off"
              />
            </Stack>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormSelect
                label="Categoria da CNH"
                value={values.cnhCategory}
                onChange={(value) => update('cnhCategory', value)}
                options={CATEGORY_OPTIONS}
                error={errors.cnhCategory}
                required
              />
              <FormField
                label="Validade da CNH"
                value={values.cnhExpiresAt}
                onChange={(value) => update('cnhExpiresAt', value)}
                error={errors.cnhExpiresAt}
                type="date"
                required
              />
            </Stack>
            <FormField
              label="Telefone"
              value={values.phone}
              onChange={(value) => update('phone', value)}
              autoComplete="tel"
              placeholder="(00) 00000-0000"
            />
            {props.mode === 'create' && (
              <FormSelect
                label="Situação inicial"
                value={values.status}
                onChange={(value) => update('status', value as DriverStatus)}
                options={DRIVER_STATUS_OPTIONS}
                error={errors.status}
                helperText="Uma CNH vencida não permite cadastrar o motorista como ativo."
                required
              />
            )}
            {canLinkAccount && (
              <FormSelect
                label="Conta de usuário vinculada (opcional)"
                value={values.userId}
                onChange={(value) => update('userId', value)}
                options={accountOptions}
                emptyLabel={accountsLoading ? 'Carregando contas...' : 'Sem conta vinculada'}
                disabled={accountsLoading || Boolean(accountsError)}
                helperText={accountsError || 'Somente contas ativas com perfil Motorista podem ser vinculadas.'}
              />
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
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
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
