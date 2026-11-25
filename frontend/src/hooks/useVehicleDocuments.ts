import { useCallback, useEffect, useRef, useState } from 'react'
import type { ApiRequest } from '../api/client.ts'
import { listVehicles } from '../services/vehiclesService.ts'
import type { Vehicle } from '../vehicles/vehicleTypes.ts'
import {
  getVehicleDocument,
  listExpiringVehicleDocuments,
  listVehicleDocuments,
  VehicleDocumentRequestError,
} from '../services/vehicleDocumentsService.ts'
import type {
  VehicleDocumentDetail,
  VehicleDocumentFilters,
  VehicleDocumentList,
} from '../types/vehicleDocument.ts'

interface ListResultState {
  key: string
  data?: VehicleDocumentList
  error?: string
  forbidden?: boolean
}

interface ExpiringResultState {
  key: string
  data?: VehicleDocumentList
  error?: string
  forbidden?: boolean
}

interface VehiclesResultState {
  key: string
  items?: Vehicle[]
  error?: string
}

export interface DocumentSelectionState {
  id: string
  detail: VehicleDocumentDetail | null
  loading: boolean
  error: string
}

function readError(failure: unknown, fallback: string): { message: string; forbidden: boolean } {
  if (failure instanceof VehicleDocumentRequestError) {
    return { message: failure.message, forbidden: failure.kind === 'forbidden' }
  }
  return {
    message: failure instanceof Error ? failure.message : fallback,
    forbidden: false,
  }
}

/**
 * Orquestra leitura da listagem principal, alertas de vencimento, catálogo de veículos e detalhe.
 *
 * Mantém consultas independentes para permitir degradação parcial (StateFeedback `partial`)
 * e descarta respostas obsoletas quando filtros, janela ou sessão mudam.
 */
export function useVehicleDocuments(
  api: ApiRequest,
  filters: VehicleDocumentFilters,
  alertDays?: number,
  enabled = true,
) {
  const [listRefresh, setListRefresh] = useState(0)
  const [expiringRefresh, setExpiringRefresh] = useState(0)
  const [vehiclesRefresh, setVehiclesRefresh] = useState(0)

  const listKey = JSON.stringify({ filters, listRefresh })
  const expiringKey = JSON.stringify({ alertDays: alertDays ?? null, expiringRefresh })
  const vehiclesKey = JSON.stringify({ vehiclesRefresh })

  const [listResult, setListResult] = useState<ListResultState | null>(null)
  const [expiringResult, setExpiringResult] = useState<ExpiringResultState | null>(null)
  const [vehiclesResult, setVehiclesResult] = useState<VehiclesResultState | null>(null)
  const [selection, setSelection] = useState<DocumentSelectionState | null>(null)
  const selectionRequestRef = useRef(0)

  useEffect(() => {
    if (!enabled) return
    let current = true
    void listVehicleDocuments(api, filters)
      .then((data) => {
        if (current) setListResult({ key: listKey, data })
      })
      .catch((failure: unknown) => {
        if (!current) return
        const { message, forbidden } = readError(
          failure,
          'Não foi possível carregar os documentos de veículos.',
        )
        setListResult({ key: listKey, error: message, forbidden })
      })
    return () => { current = false }
  }, [api, enabled, filters, listKey])

  useEffect(() => {
    if (!enabled) return
    let current = true
    void listExpiringVehicleDocuments(api, alertDays)
      .then((data) => {
        if (current) setExpiringResult({ key: expiringKey, data })
      })
      .catch((failure: unknown) => {
        if (!current) return
        const { message, forbidden } = readError(
          failure,
          'Não foi possível consultar os vencimentos de documentos.',
        )
        setExpiringResult({ key: expiringKey, error: message, forbidden })
      })
    return () => { current = false }
  }, [api, enabled, alertDays, expiringKey])

  useEffect(() => {
    if (!enabled) return
    let current = true
    void listVehicles(api)
      .then((items) => {
        if (current) setVehiclesResult({ key: vehiclesKey, items })
      })
      .catch((failure: unknown) => {
        if (!current) return
        setVehiclesResult({
          key: vehiclesKey,
          error: failure instanceof Error
            ? failure.message
            : 'Não foi possível carregar os veículos para filtro e cadastro.',
        })
      })
    return () => { current = false }
  }, [api, enabled, vehiclesKey])

  const reloadList = useCallback(() => {
    setListRefresh((current) => current + 1)
  }, [])

  const reloadExpiring = useCallback(() => {
    setExpiringRefresh((current) => current + 1)
  }, [])

  const reloadVehicles = useCallback(() => {
    setVehiclesRefresh((current) => current + 1)
  }, [])

  const reloadAll = useCallback(() => {
    setListRefresh((current) => current + 1)
    setExpiringRefresh((current) => current + 1)
    setVehiclesRefresh((current) => current + 1)
  }, [])

  const openDetail = useCallback(async (id: string) => {
    const requestId = ++selectionRequestRef.current
    setSelection({ id, detail: null, loading: true, error: '' })
    try {
      const detail = await getVehicleDocument(api, id)
      if (selectionRequestRef.current === requestId) {
        setSelection({ id, detail, loading: false, error: '' })
      }
    } catch (failure: unknown) {
      if (selectionRequestRef.current === requestId) {
        const { message } = readError(failure, 'Não foi possível carregar os detalhes do documento.')
        setSelection({ id, detail: null, loading: false, error: message })
      }
    }
  }, [api])

  const dismissDetail = useCallback(() => {
    selectionRequestRef.current += 1
    setSelection(null)
  }, [])

  const currentListMatch = listResult?.key === listKey
  const currentExpiringMatch = expiringResult?.key === expiringKey
  const currentVehiclesMatch = vehiclesResult?.key === vehiclesKey

  const listData = listResult?.data ?? null
  const listLoading = enabled && !currentListMatch
  const listError = currentListMatch ? (listResult?.error ?? '') : ''
  const listStale = Boolean(listData && listError)

  const expiringData = expiringResult?.data ?? null
  const expiringLoading = enabled && !currentExpiringMatch
  const expiringError = currentExpiringMatch ? (expiringResult?.error ?? '') : ''
  const expiringStale = Boolean(expiringData && expiringError)

  const vehicles = vehiclesResult?.items ?? []
  const vehiclesLoading = enabled && !currentVehiclesMatch
  const vehiclesError = currentVehiclesMatch ? (vehiclesResult?.error ?? '') : ''

  const forbidden = Boolean(
    (currentListMatch && listResult?.forbidden)
    || (currentExpiringMatch && expiringResult?.forbidden),
  )

  return {
    listData,
    listLoading,
    listError,
    listStale,
    expiringData,
    expiringLoading,
    expiringError,
    expiringStale,
    vehicles,
    vehiclesLoading,
    vehiclesError,
    forbidden,
    selection,
    reloadList,
    reloadExpiring,
    reloadVehicles,
    reloadAll,
    openDetail,
    dismissDetail,
  }
}
