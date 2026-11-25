import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import type { Driver } from '../drivers/driverTypes.ts'
import { listDrivers } from '../services/driversService.ts'
import { getFine, listFines } from '../services/finesService.ts'
import { listVehicles } from '../services/vehiclesService.ts'
import type { Fine, FineDetail, FineFilters } from '../types/fine.ts'
import type { Vehicle } from '../vehicles/vehicleTypes.ts'

export interface FineSelectionState {
  fine: FineDetail | null
  loading: boolean
  error: string
}

/** Encapsula listagem, catálogos auxiliares e detalhe de multas com descarte de respostas obsoletas. */
export function useFines(api: ApiRequest, allowed: boolean, filters: FineFilters) {
  const [items, setItems] = useState<Fine[] | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [drivers, setDrivers] = useState<Driver[]>([])
  const [loading, setLoading] = useState(allowed)
  const [error, setError] = useState('')
  const [optionsLoading, setOptionsLoading] = useState(allowed)
  const [optionsError, setOptionsError] = useState('')
  const [version, setVersion] = useState(0)
  const [optionsVersion, setOptionsVersion] = useState(0)
  const [selection, setSelection] = useState<FineSelectionState | null>(null)

  const listRequest = useRef(0)
  const selectionRequest = useRef(0)

  useEffect(() => {
    if (!allowed) return
    const requestId = ++listRequest.current
    let current = true

    void listFines(api, filters)
      .then((result) => {
        if (current && listRequest.current === requestId) {
          setItems(result)
          setError('')
        }
      })
      .catch((failure: unknown) => {
        if (current && listRequest.current === requestId) {
          setError(failure instanceof Error ? failure.message : 'Não foi possível carregar as multas.')
        }
      })
      .finally(() => {
        if (current && listRequest.current === requestId) {
          setLoading(false)
        }
      })

    return () => {
      current = false
    }
  }, [allowed, api, filters, version])

  useEffect(() => {
    if (!allowed) return
    let current = true

    void Promise.all([listVehicles(api), listDrivers(api)])
      .then(([vehicleList, driverList]) => {
        if (!current) return
        setVehicles(vehicleList)
        setDrivers(driverList)
        setOptionsError('')
      })
      .catch((failure: unknown) => {
        if (!current) return
        setOptionsError(
          failure instanceof Error
            ? failure.message
            : 'Não foi possível carregar a lista de veículos e motoristas.',
        )
      })
      .finally(() => {
        if (current) setOptionsLoading(false)
      })

    return () => {
      current = false
    }
  }, [allowed, api, optionsVersion])

  const reload = useCallback(() => {
    if (!allowed) return
    setLoading(true)
    setError('')
    setVersion((current) => current + 1)
  }, [allowed])

  const reloadOptions = useCallback(() => {
    if (!allowed) return
    setOptionsLoading(true)
    setOptionsError('')
    setOptionsVersion((current) => current + 1)
  }, [allowed])

  const select = useCallback(async (id: string) => {
    const requestId = ++selectionRequest.current
    setSelection((current) => ({
      fine: current?.fine?.id === id ? current.fine : null,
      loading: true,
      error: '',
    }))
    try {
      const detail = await getFine(api, id)
      if (selectionRequest.current === requestId) {
        setSelection({ fine: detail, loading: false, error: '' })
      }
    } catch (failure) {
      if (selectionRequest.current === requestId) {
        setSelection({
          fine: null,
          loading: false,
          error: failure instanceof Error ? failure.message : 'Não foi possível consultar o detalhe da multa.',
        })
      }
    }
  }, [api])

  const dismiss = useCallback(() => {
    selectionRequest.current += 1
    setSelection(null)
  }, [])

  const saved = useCallback((id: string, refreshDetail = true) => {
    reload()
    if (refreshDetail) {
      void select(id)
    }
  }, [reload, select])

  return {
    items,
    vehicles,
    drivers,
    loading,
    error,
    optionsLoading,
    optionsError,
    reload,
    reloadOptions,
    selection,
    select,
    dismiss,
    saved,
  }
}
