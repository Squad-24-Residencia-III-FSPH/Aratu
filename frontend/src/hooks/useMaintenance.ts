import { useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client'
import type { MaintenanceFilters, MaintenanceList, MaintenanceOrder } from '../maintenance/maintenanceTypes'
import { getMaintenance, listMaintenance } from '../services/maintenanceService'
import { listVehicles } from '../services/vehiclesService'
import type { Vehicle } from '../vehicles/vehicleTypes'

/** Descarta respostas antigas de filtros e mantém listas anteriores visíveis em falhas parciais. */
export function useMaintenance(api: ApiRequest, filters: MaintenanceFilters) {
  const [data, setData] = useState<MaintenanceList | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [vehiclesError, setVehiclesError] = useState('')
  const [version, setVersion] = useState(0)
  const [selection, setSelection] = useState<{ order: MaintenanceOrder | null; loading: boolean; error: string } | null>(null)
  const selectionRequest = useRef(0)
  useEffect(() => {
    let current = true
    void listMaintenance(api, filters).then(result => {
      if (current) { setData(result); setLoading(false) }
    }).catch((failure: unknown) => {
      if (current) { setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as manutenções.'); setLoading(false) }
    })
    return () => { current = false }
  }, [api, filters, version])
  useEffect(() => {
    let current = true
    void listVehicles(api).then(result => { if (current) { setVehicles(result); setVehiclesError('') } })
      .catch(() => { if (current) setVehiclesError('Não foi possível carregar os veículos. Atualize para tentar novamente.') })
    return () => { current = false }
  }, [api, version])
  function reload() { setLoading(true); setError(''); setVersion(value => value + 1) }
  async function select(id: string) {
    const request = ++selectionRequest.current
    setSelection({ order: null, loading: true, error: '' })
    try {
      const order = await getMaintenance(api, id)
      if (selectionRequest.current === request) setSelection({ order, loading: false, error: '' })
    } catch (failure) {
      if (selectionRequest.current === request) setSelection({ order: null, loading: false,
        error: failure instanceof Error ? failure.message : 'Não foi possível carregar a ordem.' })
    }
  }
  function dismiss() { selectionRequest.current++; setSelection(null) }
  function saved(order: MaintenanceOrder) {
    setSelection({ order, loading: false, error: '' })
    reload()
  }
  return { data, vehicles, loading, error, vehiclesError, reload, selection, select, dismiss, saved }
}
