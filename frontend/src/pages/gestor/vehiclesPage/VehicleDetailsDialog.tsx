import { Dialog, DialogContent, DialogTitle, Grid, Typography } from '@mui/material'
import type { Vehicle } from '../../../vehicles/vehicleTypes'
import {
  VEHICLE_CATEGORY_LABELS,
  VEHICLE_OPERATION_LABELS,
  VEHICLE_OWNERSHIP_LABELS,
  VEHICLE_STATUS_LABELS,
} from '../../../vehicles/vehicleTypes'

interface VehicleDetailsDialogProps {
  vehicle: Vehicle
  onClose: () => void
}

/** Exibe atributos secundários sem ocupar colunas permanentes na consulta da frota. */
export default function VehicleDetailsDialog({ vehicle, onClose }: VehicleDetailsDialogProps) {
  const details: [string, string][] = [
    ['Placa', vehicle.licensePlate],
    ['Marca e modelo', [vehicle.brand, vehicle.model].filter(Boolean).join(' ') || 'Não informado'],
    ['Ano', vehicle.year === null ? 'Não informado' : String(vehicle.year)],
    ['Tipo de veículo', vehicle.vehicleType ?? 'Não informado'],
    ['Categoria', vehicle.categories.map((category) => VEHICLE_CATEGORY_LABELS[category]).join(', ')],
    ['Operação', VEHICLE_OPERATION_LABELS[vehicle.operationType]],
    ['Propriedade', VEHICLE_OWNERSHIP_LABELS[vehicle.ownership]],
    ['Passageiros', String(vehicle.seats)],
    ['Limite de corpos', String(vehicle.bodyLimit)],
    ['Limite de peso', vehicle.weightLimit === null ? 'Não informado' : `${vehicle.weightLimit} kg`],
    ['Situação', VEHICLE_STATUS_LABELS[vehicle.status]],
  ]

  return (
    <Dialog open onClose={onClose} aria-labelledby="vehicle-details-title" fullWidth maxWidth="sm">
      <DialogTitle id="vehicle-details-title">Veículo {vehicle.licensePlate}</DialogTitle>
      <DialogContent dividers>
        <Grid container spacing={2} component="dl" sx={{ m: 0 }}>
          {details.map(([label, value]) => (
            <Grid key={label} size={{ xs: 12, sm: 6 }}>
              <Typography component="dt" variant="body2" color="text.secondary">{label}</Typography>
              <Typography component="dd" sx={{ m: 0, overflowWrap: 'anywhere' }}>{value}</Typography>
            </Grid>
          ))}
        </Grid>
      </DialogContent>
    </Dialog>
  )
}
