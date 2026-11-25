import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import RefreshIcon from '@mui/icons-material/Refresh'
import { Alert, Box, Button, Typography } from '@mui/material'
import { useAuth } from '../../../auth/useAuth'
import { resolveProfile } from '../../../auth/profiles'
import DataTable from '../../../components/ui/DataTable'
import type { DataTableColumn } from '../../../components/ui/DataTable'
import FilterBar from '../../../components/ui/FilterBar'
import { FormField } from '../../../components/ui/FormField'
import PageHeader from '../../../components/ui/PageHeader'
import StateFeedback from '../../../components/ui/StateFeedback'
import { accessibleControls } from '../../../components/ui/accessibleControls'
import { listVehicles, VehicleRequestError } from '../../../services/vehiclesService'
import { canManageServiceTypes } from '../../../services/fleetServicesAccess'
import {
  FleetServiceRequestError,
  listCompatibleVehicles,
  listFleetServices,
} from '../../../services/fleetServicesService'
import type { CompatibleVehicleSummary, FleetService } from '../../../services/fleetServicesService'
import type { Vehicle } from '../../../vehicles/vehicleTypes'
import { VEHICLE_CATEGORY_LABELS } from '../../../vehicles/vehicleTypes'
import ServiceFormDialog from './ServiceFormDialog'
import ServiceStatusChip from './ServiceStatusChip'
import ServiceStatusDialog from './ServiceStatusDialog'
import { readServiceErrorMessage } from './serviceHelpers'
import type { ServiceLinksState, ServiceRow } from './serviceHelpers'

/** Gerencia o catálogo independente de tipos de serviço. */
export default function ServicesPage() {
  const { api, session } = useAuth()
  const profile = session ? resolveProfile(session.perfil) : null
  const allowed = canManageServiceTypes(profile)
  const forbidden = !allowed

  const [services, setServices] = useState<FleetService[] | null>(null)
  const [linksByServiceId, setLinksByServiceId] = useState<Record<string, ServiceLinksState>>({})
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [vehiclesError, setVehiclesError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [loadingCatalog, setLoadingCatalog] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [refreshCount, setRefreshCount] = useState(0)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'partial'; message: string } | null>(null)
  const [formTarget, setFormTarget] = useState<{ mode: 'new' } | { mode: 'edit'; serviceId: string } | null>(null)
  const [statusTarget, setStatusTarget] = useState<FleetService | null>(null)

  const loadEpochRef = useRef(0)

  const previousTitleRef = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (previousTitleRef.current === null) {
      previousTitleRef.current = document.title
    }
    return () => {
      if (previousTitleRef.current !== null) {
        document.title = previousTitleRef.current
        previousTitleRef.current = null
      }
    }
  }, [])

  useEffect(() => {
    document.title = 'Tipos de serviço — Aratu'
  }, [])

  const fetchVehiclesCatalog = useCallback(async (epoch: number) => {
    try {
      const loadedVehicles = await listVehicles(api)
      if (loadEpochRef.current !== epoch) return
      setVehicles(loadedVehicles)
      setVehiclesError(null)
    } catch (error) {
      if (loadEpochRef.current !== epoch) return
      if (error instanceof VehicleRequestError && error.kind === 'forbidden') return
      setVehiclesError(readServiceErrorMessage(error, 'Não foi possível carregar os veículos da frota para seleção.'))
    }
  }, [api])

  const fetchServiceLinks = useCallback(async (serviceId: string, epoch: number): Promise<CompatibleVehicleSummary[] | null> => {
    setLinksByServiceId((current) => ({ ...current, [serviceId]: { status: 'loading' } }))
    try {
      const view = await listCompatibleVehicles(api, serviceId)
      if (loadEpochRef.current !== epoch) return null
      setLinksByServiceId((current) => ({
        ...current,
        [serviceId]: { status: 'loaded', vehicles: view.vehicles },
      }))
      return view.vehicles
    } catch (error) {
      if (loadEpochRef.current !== epoch) return null
      setLinksByServiceId((current) => ({
        ...current,
        [serviceId]: {
          status: 'error',
          message: readServiceErrorMessage(error, 'Não foi possível consultar os veículos compatíveis.'),
        },
      }))
      return null
    }
  }, [api])

  useEffect(() => {
    if (!allowed) return

    const epoch = ++loadEpochRef.current
    let active = true

    void fetchVehiclesCatalog(epoch)

    void listFleetServices(api)
      .then((loadedServices) => {
        if (!active || loadEpochRef.current !== epoch) return
        setServices(loadedServices)
        setCatalogError(null)
        setLoadingCatalog(false)

        const initialLinks: Record<string, ServiceLinksState> = {}
        for (const service of loadedServices) {
          initialLinks[service.id] = { status: 'loading' }
        }
        setLinksByServiceId(initialLinks)

        void Promise.allSettled(loadedServices.map((service) => fetchServiceLinks(service.id, epoch)))
      })
      .catch((error: unknown) => {
        if (!active || loadEpochRef.current !== epoch) return
        setLoadingCatalog(false)
        if (error instanceof FleetServiceRequestError && error.kind === 'forbidden') return
        setCatalogError(readServiceErrorMessage(error, 'Não foi possível carregar os tipos de serviço.'))
      })

    return () => {
      active = false
    }
  }, [api, allowed, refreshCount, fetchServiceLinks, fetchVehiclesCatalog])

  const rows: ServiceRow[] = useMemo(() => {
    if (!services) return []
    return services.map((service) => ({
      service,
      links: linksByServiceId[service.id] ?? { status: 'loading' },
    }))
  }, [services, linksByServiceId])

  const filteredRows = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR')
    if (!normalizedQuery) return rows
    return rows.filter(({ service }) => `${service.name} ${service.description ?? ''}`
      .toLocaleLowerCase('pt-BR').includes(normalizedQuery))
  }, [query, rows])

  const failedLinkRows = useMemo(
    () => rows.filter((row) => row.links.status === 'error'),
    [rows],
  )

  const knownServiceIds = useMemo(
    () => new Set((services ?? []).map((service) => service.id)),
    [services],
  )

  const editingRow = useMemo(() => {
    if (!formTarget || formTarget.mode !== 'edit') return null
    return rows.find((row) => row.service.id === formTarget.serviceId) ?? null
  }, [formTarget, rows])

  function reload() {
    setLoadingCatalog(true)
    setCatalogError(null)
    setRefreshCount((count) => count + 1)
  }

  function retryFailedLinks() {
    const epoch = loadEpochRef.current
    void Promise.allSettled(failedLinkRows.map((row) => fetchServiceLinks(row.service.id, epoch)))
  }

  function retryVehicles() {
    void fetchVehiclesCatalog(loadEpochRef.current)
  }

  function handleServicePersisted(saved: FleetService, linkedVehicles?: readonly CompatibleVehicleSummary[]) {
    setServices((current) => {
      if (!current) return [saved]
      const exists = current.some((item) => item.id === saved.id)
      return exists ? current.map((item) => (item.id === saved.id ? saved : item)) : [...current, saved]
    })
    if (linkedVehicles !== undefined) {
      setLinksByServiceId((current) => ({
        ...current,
        [saved.id]: { status: 'loaded', vehicles: [...linkedVehicles] },
      }))
    }
  }

  function handleSaved(message: string) {
    setFormTarget(null)
    setStatusTarget(null)
    setFeedback({ kind: 'success', message })
    reload()
  }

  const columns: readonly DataTableColumn<ServiceRow>[] = useMemo(() => [
    {
      key: 'name',
      header: 'Tipo de serviço',
      render: (row) => (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <Box component="span" sx={{ fontWeight: 600 }}>{row.service.name}</Box>
          {row.service.description && (
            <Box component="span" sx={{ fontSize: '0.875rem', color: 'text.secondary' }}>
              {row.service.description}
            </Box>
          )}
        </Box>
      ),
    },
    {
      key: 'categories',
      header: 'Categoria compatível',
      render: (row) => row.service.categories.map((category) => VEHICLE_CATEGORY_LABELS[category]).join(', '),
    },
    {
      key: 'vehicles',
      header: 'Veículos compatíveis',
      render: (row) => {
        if (row.links.status === 'loading') {
          return (
            <Typography variant="body2" color="text.secondary" role="status">
              Consultando vínculos...
            </Typography>
          )
        }
        if (row.links.status === 'error') {
          return (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
              <Typography variant="body2" color="error.main" role="alert">
                Falha ao consultar
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<RefreshIcon aria-hidden="true" />}
                onClick={() => void fetchServiceLinks(row.service.id, loadEpochRef.current)}
                aria-label={`Consultar novamente veículos compatíveis de ${row.service.name}`}
                sx={{ minHeight: 44 }}
              >
                Consultar novamente
              </Button>
            </Box>
          )
        }
        const count = row.links.vehicles.length
        return count === 1 ? '1 veículo' : `${count} veículos`
      },
    },
    {
      key: 'active',
      header: 'Situação',
      render: (row) => <ServiceStatusChip active={row.service.active} />,
    },
  ], [fetchServiceLinks])

  return (
    <Box sx={accessibleControls}>
      <PageHeader
        title="Tipos de serviço"
        breadcrumbs={['Início', 'Tipos de serviço']}
        description="Cadastre e mantenha os tipos de serviço disponíveis para associação aos veículos."
        actions={allowed ? (
          <Button
            variant="contained"
            startIcon={<AddIcon aria-hidden="true" />}
            onClick={() => { setFeedback(null); setFormTarget({ mode: 'new' }) }}
            sx={{ minHeight: 44 }}
          >
            Novo tipo
          </Button>
        ) : undefined}
      />

      {forbidden && <StateFeedback kind="forbidden" title="Acesso restrito" description="Seu perfil não pode gerenciar tipos de serviço." />}

      {allowed && (
        <>
          {feedback && (
            <Alert
              severity={feedback.kind === 'partial' ? 'warning' : 'success'}
              role="status"
              onClose={() => setFeedback(null)}
              sx={{ mb: 2 }}
            >
              <strong>Alteração salva: </strong>{feedback.message}
            </Alert>
          )}

          {catalogError && services !== null && (
            <StateFeedback
              kind="partial"
              title="Não foi possível atualizar os tipos de serviço"
              description={catalogError}
              actionLabel="Tentar novamente"
              onAction={reload}
              sx={{ mb: 2 }}
            />
          )}

          {!catalogError && failedLinkRows.length > 0 && (
            <StateFeedback
              kind="partial"
              title="Leitura parcial dos veículos compatíveis"
              description={`Não foi possível consultar os veículos compatíveis de: ${failedLinkRows.map((item) => item.service.name).join(', ')}. O restante do catálogo permanece disponível.`}
              actionLabel="Tentar novamente"
              onAction={retryFailedLinks}
              sx={{ mb: 2 }}
            />
          )}

          {!catalogError && vehiclesError && (
            <StateFeedback
              kind="partial"
              title="Lista de veículos da frota indisponível"
              description={vehiclesError}
              actionLabel="Tentar novamente"
              onAction={retryVehicles}
              sx={{ mb: 2 }}
            />
          )}

          <FilterBar label="Pesquisar tipos de serviço" sx={{ mb: 2 }}>
            <Box sx={{ width: { xs: '100%', sm: 320 } }}>
              <FormField
                label="Pesquisar tipo de serviço"
                value={query}
                onChange={setQuery}
                placeholder="Nome ou descrição"
              />
            </Box>
          </FilterBar>

          {catalogError && services === null ? (
            <StateFeedback
              kind="error"
              title="Não foi possível carregar os tipos de serviço"
              description={catalogError}
              actionLabel="Tentar novamente"
              onAction={reload}
            />
          ) : loadingCatalog && services === null ? (
            <StateFeedback kind="loading" title="Carregando tipos de serviço..." />
          ) : (
            <DataTable
              caption="Tipos de serviço cadastrados"
              columns={columns}
              rows={filteredRows}
              rowKey={(row) => row.service.id}
              minWidth={560}
              renderActions={(row) => (
                <Box sx={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                  <Button
                    size="small"
                    startIcon={<EditIcon aria-hidden="true" />}
                    onClick={() => { setFeedback(null); setFormTarget({ mode: 'edit', serviceId: row.service.id }) }}
                    aria-label={`Editar tipo de serviço ${row.service.name}`}
                    sx={{ minHeight: 44 }}
                  >
                    Editar
                  </Button>
                  <Button
                    size="small"
                    onClick={() => { setFeedback(null); setStatusTarget(row.service) }}
                    aria-label={`${row.service.active ? 'Inativar' : 'Ativar'} tipo de serviço ${row.service.name}`}
                    sx={{ minHeight: 44 }}
                  >
                    {row.service.active ? 'Inativar' : 'Ativar'}
                  </Button>
                </Box>
              )}
              busy={loadingCatalog}
              emptyContent={(
                <StateFeedback
                  kind="empty"
                  title={rows.length === 0 ? 'Nenhum tipo de serviço cadastrado' : 'Nenhum tipo encontrado'}
                  description={rows.length === 0
                    ? 'Use “Novo tipo” para cadastrar o primeiro serviço.'
                    : 'Ajuste a pesquisa para encontrar outros tipos de serviço.'}
                  centered
                />
              )}
            />
          )}
        </>
      )}

      {formTarget && (formTarget.mode === 'new' || editingRow) && (
        <ServiceFormDialog
          key={formTarget.mode === 'new' ? 'new' : editingRow?.service.id}
          api={api}
          vehicles={vehicles}
          vehiclesLoadError={vehiclesError}
          onRetryVehicles={retryVehicles}
          knownServiceIds={knownServiceIds}
          row={editingRow}
          onRetryRowLinks={(serviceId) => fetchServiceLinks(serviceId, loadEpochRef.current)}
          onServicePersisted={handleServicePersisted}
          onSaved={handleSaved}
          onCancel={() => setFormTarget(null)}
        />
      )}

      {statusTarget && (
        <ServiceStatusDialog
          key={statusTarget.id}
          api={api}
          service={statusTarget}
          onServiceRefreshed={(updated) => handleServicePersisted(updated)}
          onSaved={(service) => handleSaved(`Tipo de serviço “${service.name}” ${service.active ? 'ativado' : 'inativado'}.`)}
          onCancel={() => setStatusTarget(null)}
        />
      )}
    </Box>
  )
}
