import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
} from '@mui/material'
import type { ApiRequest } from '../../api/client'
import { FormField, FormSelect } from '../../components/ui/FormField'
import { createVehicle, updateVehicle, VehicleRequestError } from '../../services/vehiclesService'
import {
  EMPTY_VEHICLE_FORM,
  normalizeLicensePlate,
  toVehicleAttributes,
  validateVehicleForm,
  vehicleToFormValues,
} from '../../vehicles/vehicleForm'
import type { VehicleFormErrors, VehicleFormValues } from '../../vehicles/vehicleForm'
import {
  VEHICLE_CATEGORIES,
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OPERATION_TYPES,
  VEHICLE_OWNERSHIP_LABELS,
  VEHICLE_OWNERSHIP_TYPES,
} from '../../vehicles/vehicleTypes'
import type { Vehicle } from '../../vehicles/vehicleTypes'

const OPERATION_OPTIONS = VEHICLE_OPERATION_TYPES.map((value) => ({
  value,
  label: VEHICLE_OPERATION_LABELS[value],
}))

const OWNERSHIP_OPTIONS = VEHICLE_OWNERSHIP_TYPES.map((value) => ({
  value,
  label: VEHICLE_OWNERSHIP_LABELS[value],
}))

const CATEGORY_OPTIONS = VEHICLE_CATEGORIES.map((value) => ({
  value,
  label: VEHICLE_CATEGORY_LABELS[value],
}))

interface VehicleFormDialogBaseProps {
  api: ApiRequest
  reportedBy: string
  onSaved: (vehicle: Vehicle) => void
  onCancel: () => void
  onConflict: (message: string) => void
}

type VehicleFormDialogProps = VehicleFormDialogBaseProps & (
  | { mode: 'create' }
  | { mode: 'edit'; vehicle: Vehicle }
)

/** Formulário de cadastro/edição com validação local e erro do campo vindo da API. */
export default function VehicleFormDialog(props: VehicleFormDialogProps) {
  const titleId = useId()
  const initialValues = props.mode === 'edit' ? vehicleToFormValues(props.vehicle) : EMPTY_VEHICLE_FORM
  const [values, setValues] = useState<VehicleFormValues>(initialValues)
  const [errors, setErrors] = useState<VehicleFormErrors>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  function update<K extends keyof VehicleFormValues>(field: K, value: VehicleFormValues[K]) {
    setValues((current) => ({ ...current, [field]: value }))
    setErrors((current) => {
      const next = { ...current }
      delete next[field as keyof VehicleFormErrors]
      return next
    })
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const nextErrors = validateVehicleForm(values)
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length > 0) return

    setSubmitting(true)
    setSubmitError(null)
    const attributes = toVehicleAttributes(values)
    const metadata = { reportedBy: props.reportedBy, reason: values.reason.trim() }

    try {
      const saved = props.mode === 'edit'
        ? await updateVehicle(props.api, props.vehicle.id, {
            ...attributes,
            ...metadata,
            expectedRevision: props.vehicle.revision,
          })
        : await createVehicle(props.api, { ...attributes, ...metadata })
      props.onSaved(saved)
    } catch (error) {
      if (error instanceof VehicleRequestError) {
        if (error.kind === 'conflict-plate') {
          setErrors((current) => ({ ...current, licensePlate: error.message }))
          return
        }
        if (error.kind === 'conflict-revision') {
          props.onConflict(error.message)
          return
        }
        if (error.kind === 'forbidden') {
          setSubmitError('Seu perfil não tem permissão para salvar veículos.')
          return
        }
        setSubmitError(error.message)
        return
      }
      setSubmitError('Não foi possível salvar o veículo. Tente novamente.')
    } finally {
      setSubmitting(false)
    }
  }

  const title = props.mode === 'edit' ? 'Editar veículo' : 'Cadastrar veículo'

  return (
    <Dialog
      open
      onClose={submitting ? undefined : props.onCancel}
      aria-labelledby={titleId}
      fullWidth
      maxWidth="md"
    >
      <Box component="form" onSubmit={handleSubmit} noValidate>
        <DialogTitle id={titleId}>{title}</DialogTitle>
        <DialogContent dividers>
          {submitError && <Alert severity="error" sx={{ mb: 2 }}>{submitError}</Alert>}
          <Stack spacing={2} sx={{ mt: 0.5 }}>
            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Placa"
                value={values.licensePlate}
                onChange={(value) => update('licensePlate', normalizeLicensePlate(value))}
                error={errors.licensePlate}
                helperText="Formatos aceitos: ABC1234 ou ABC1D23."
                required
                autoComplete="off"
                maxLength={7}
                placeholder="ABC1D23"
              />
              <FormField
                label="Ano"
                value={values.year}
                onChange={(value) => update('year', value)}
                error={errors.year}
                inputMode="numeric"
                maxLength={4}
                placeholder="2024"
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Marca"
                value={values.brand}
                onChange={(value) => update('brand', value)}
                autoComplete="off"
              />
              <FormField
                label="Modelo"
                value={values.model}
                onChange={(value) => update('model', value)}
                autoComplete="off"
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Tipo de veículo"
                value={values.vehicleType}
                onChange={(value) => update('vehicleType', value)}
                helperText="Ex.: Van, furgão, sedan."
                autoComplete="off"
              />
              <FormSelect
                label="Operação"
                value={values.operationType}
                onChange={(value) => update('operationType', value as VehicleFormValues['operationType'])}
                options={OPERATION_OPTIONS}
                required
              />
              <FormSelect
                label="Propriedade"
                value={values.ownership}
                onChange={(value) => update('ownership', value as VehicleFormValues['ownership'])}
                options={OWNERSHIP_OPTIONS}
                required
              />
            </Stack>

            <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
              <FormField
                label="Capacidade de passageiros"
                value={values.seats}
                onChange={(value) => update('seats', value)}
                error={errors.seats}
                inputMode="numeric"
                required
              />
              <FormField
                label="Limite de corpos"
                value={values.bodyLimit}
                onChange={(value) => update('bodyLimit', value)}
                error={errors.bodyLimit}
                inputMode="numeric"
                required
              />
            </Stack>

            <FormSelect
              label="Categorias"
              value={values.categories}
              onChange={(value) => update('categories', value as VehicleFormValues['categories'])}
              options={CATEGORY_OPTIONS}
              multiple
              required
              error={errors.categories}
              helperText="Selecione ao menos uma categoria operacional."
            />

            <FormField
              label="Justificativa"
              value={values.reason}
              onChange={(value) => update('reason', value)}
              error={errors.reason}
              helperText="Registrada na história do veículo e na auditoria."
              required
              multiline
              minRows={2}
            />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={props.onCancel} disabled={submitting} color="inherit" sx={{ minHeight: 44 }}>
            Cancelar
          </Button>
          <Button
            type="submit"
            variant="contained"
            disabled={submitting}
            aria-busy={submitting ? 'true' : undefined}
            sx={{ minHeight: 44 }}
          >
            {submitting ? 'Salvando...' : props.mode === 'edit' ? 'Atualizar' : 'Cadastrar'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  )
}
