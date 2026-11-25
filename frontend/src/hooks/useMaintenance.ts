import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client'
import type { MaintenanceFilters, MaintenanceList, MaintenanceOrder } from '../maintenance/maintenanceTypes'
import { getMaintenance, listMaintenance } from '../services/maintenanceService'
import { listVehicles } from '../services/vehiclesService'
import type { Vehicle } from '../vehicles/vehicleTypes'
import { buildVehicleSituation } from '../pages/gestor/ManuPage/maintenancePresentation'
import type { VehicleSituation, VehicleSituationState } from '../pages/gestor/ManuPage/maintenancePresentation'

/** Descarta respostas antigas, vincula o recorte confirmado e consulta a situação real da viatura. */
export function useMaintenance(api: ApiRequest, filters: MaintenanceFilters) {
  const [data, setData] = useState<MaintenanceList | null>(null)
  const [appliedFilters, setAppliedFilters] = useState<MaintenanceFilters | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehiclesError, setVehiclesError] = useState('')
  const [version, setVersion] = useState(0)
  const [selection, setSelection] = useState<{ order: MaintenanceOrder | null; loading: boolean; error: string } | null>(null)
  const [vehicleSituation, setVehicleSituation] = useState<VehicleSituationState | null>(null)
  const selectionRequest = useRef(0)
  const situationRequest = useRef(0)

  useEffect(() => {
    let current = true
    void listMaintenance(api, filters).then((result) => {
      if (current) {
        setData(result)
        setAppliedFilters(filters)
        setError('')
        setLoading(false)
      }
    }).catch((failure: unknown) => {
      if (current) {
        setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as manutenções.')
        setLoading(false)
      }
    })
    return () => { current = false }
  }, [api, filters, version])

  useEffect(() => {
    let current = true
    void listVehicles(api).then((result) => {
      if (current) {
        setVehicles(result)
        setVehiclesError('')
      }
    }).catch(() => {
      if (current) setVehiclesError('Não foi possível carregar os veículos. Atualize para tentar novamente.')
    })
    return () => { current = false }
  }, [api, version])

  const inspectVehicleSituation = useCallback(async (order: MaintenanceOrder): Promise<VehicleSituation | null> => {
    const request = ++situationRequest.current
    setVehicleSituation({ loading: true, error: '', situation: null })
    try {
      const [freshVehicles, ordersResult] = await Promise.all([
        listVehicles(api),
        listMaintenance(api, { vehicleId: order.vehicleId }).catch(() => null),
      ])
      if (situationRequest.current !== request) return null
      setVehicles(freshVehicles)
      setVehiclesError('')
      const situation = buildVehicleSituation(
        order,
        freshVehicles,
        ordersResult ? ordersResult.items : null,
      )
      setVehicleSituation({ loading: false, error: '', situation })
      return situation
    } catch (failure) {
      if (situationRequest.current === request) {
        setVehicleSituation({
          loading: false,
          error: failure instanceof Error ? failure.message : 'Não foi possível consultar a situação atual do veículo.',
          situation: null,
        })
      }
      return null
    }
  }, [api])

  function reload() {
    setLoading(true)
    setError('')
    setVersion((value) => value + 1)
  }

  async function select(id: string) {
    const request = ++selectionRequest.current
    situationRequest.current += 1
    setSelection({ order: null, loading: true, error: '' })
    setVehicleSituation(null)
    try {
      const order = await getMaintenance(api, id)
      if (selectionRequest.current === request) {
        setSelection({ order, loading: false, error: '' })
        void inspectVehicleSituation(order)
      }
    } catch (failure) {
      if (selectionRequest.current === request) {
        setSelection({
          order: null,
          loading: false,
          error: failure instanceof Error ? failure.message : 'Não foi possível carregar a ordem.',
        })
      }
    }
  }

  function dismiss() {
    selectionRequest.current += 1
    situationRequest.current += 1
    setSelection(null)
    setVehicleSituation(null)
  }

  async function saved(order: MaintenanceOrder): Promise<VehicleSituation | null> {
    setSelection({ order, loading: false, error: '' })
    reload()
    return inspectVehicleSituation(order)
  }

  return {
    data,
    appliedFilters,
    vehicles,
    loading,
    error,
    vehiclesError,
    reload,
    selection,
    vehicleSituation,
    select,
    dismiss,
    saved,
  }
}
