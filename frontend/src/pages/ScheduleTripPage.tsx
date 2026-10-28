import { useEffect, useState, useId, useCallback } from 'react'
import type { FormEvent } from 'react'
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Divider,
  MenuItem,
  Select,
  Typography,
} from '@mui/material'
import { AppShell } from '../components/layout/AppShell'
import { FormField } from '../components/ui/FormField'
import { StateFeedback } from '../components/ui/StateFeedback'
import { navigate } from '../routing/navigation'
import type {
  TripRequest,
  VehicleOption,
  DriverOption,
  FleetScheduleItem,
  ScheduleTripResult,
} from '../types/trip'
import {
  getTripRequest,
  getAvailableVehicles,
  getAvailableDrivers,
  getFleetSchedule,
  scheduleTrip,
} from '../services/tripScheduleService'

export interface ScheduleTripPageProps {
  requestId?: string
}

export default function ScheduleTripPage({ requestId = '123' }: ScheduleTripPageProps) {
  // Estados de dados da página
  const [request, setRequest] = useState<TripRequest | null>(null)
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [drivers, setDrivers] = useState<DriverOption[]>([])
  const [fleetSchedule, setFleetSchedule] = useState<FleetScheduleItem[]>([])

  // Estados dos 5 estados visuais da interface
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [successResult, setSuccessResult] = useState<ScheduleTripResult | null>(null)

  // Estados dos campos do formulário
  const [startDateTime, setStartDateTime] = useState('2026-10-28T14:00')
  const [endDateTime, setEndDateTime] = useState('2026-10-28T17:30')
  const [selectedVehicleId, setSelectedVehicleId] = useState('veh-01')
  const [selectedDriverId, setSelectedDriverId] = useState('drv-01')
  const [operationalNotes, setOperationalNotes] = useState('')

  // IDs acessíveis para os campos de Select
  const vehicleSelectId = useId()
  const driverSelectId = useId()

  const reloadData = useCallback(async () => {
    setIsLoading(true)
    setLoadError(null)
    try {
      const [reqData, vehData, drvData, schedData] = await Promise.all([
        getTripRequest(requestId),
        getAvailableVehicles(),
        getAvailableDrivers(),
        getFleetSchedule(),
      ])
      setRequest(reqData)
      setVehicles(vehData)
      setDrivers(drvData)
      setFleetSchedule(schedData)
    } catch (err) {
      setLoadError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os dados da solicitação. Verifique sua conexão e tente novamente.',
      )
    } finally {
      setIsLoading(false)
    }
  }, [requestId])

  useEffect(() => {
    let isMounted = true

    async function initialFetch() {
      try {
        const [reqData, vehData, drvData, schedData] = await Promise.all([
          getTripRequest(requestId),
          getAvailableVehicles(),
          getAvailableDrivers(),
          getFleetSchedule(),
        ])
        if (isMounted) {
          setRequest(reqData)
          setVehicles(vehData)
          setDrivers(drvData)
          setFleetSchedule(schedData)
          setIsLoading(false)
        }
      } catch (err) {
        if (isMounted) {
          setLoadError(
            err instanceof Error
              ? err.message
              : 'Não foi possível carregar os dados da solicitação. Verifique sua conexão e tente novamente.',
          )
          setIsLoading(false)
        }
      }
    }

    void initialFetch()

    return () => {
      isMounted = false
    }
  }, [requestId])

  // Submissão do agendamento (PE-RN-026 e PE-CA-014)
  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitError(null)
    setIsSubmitting(true)

    try {
      const result = await scheduleTrip({
        requestId,
        vehicleId: selectedVehicleId,
        driverId: selectedDriverId,
        startDateTime,
        endDateTime,
        notes: operationalNotes,
      })
      setSuccessResult(result)
    } catch (err) {
      // PE-CA-014: Erro ou concorrência é anunciado com destaque assertivo
      // SEM resetar nem limpar os dados já preenchidos no formulário!
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Falha ao agendar viagem. Os dados digitados foram preservados. Tente novamente.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  // Simulação de concorrência com veículo disputado por outro gestor
  const handleSimulateConflict = () => {
    setSelectedVehicleId('veh-02') // BRA-2E19 (tem conflito no período da tarde)
    setStartDateTime('2026-10-28T14:00')
    setEndDateTime('2026-10-28T16:00')
    setSubmitError(null)
  }

  return (
    <AppShell>
      {/* Breadcrumb idêntico ao Figma */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1, fontSize: 13, color: '#6b7280' }}>
        <span>Início</span>
        <span>›</span>
        <span>Solicitações de Viagem</span>
        <span>›</span>
        <span style={{ color: '#111827', fontWeight: 600 }}>Agendamento #{requestId}</span>
      </Box>

      {/* Título e Ações da Página */}
      <Box
        sx={{
          mb: 3,
          display: 'flex',
          flexDirection: { xs: 'column', sm: 'row' },
          justifyContent: 'space-between',
          alignItems: { xs: 'flex-start', sm: 'center' },
          gap: 2,
        }}
      >
        <Box>
          <Typography
            component="h1"
            variant="h5"
            sx={{
              fontWeight: 800,
              color: '#0f172a',
              letterSpacing: '-0.02em',
              fontSize: { xs: 22, md: 24 },
            }}
          >
            Agendamento de Viagem
          </Typography>
          <Typography variant="body2" sx={{ color: '#64748b', mt: 0.3, fontSize: 14 }}>
            Atribuição de frota, condutor e horários para a solicitação deferida
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Button
            variant="outlined"
            onClick={() => navigate('/frota/solicitacoes')}
            sx={{
              minHeight: 40,
              borderColor: '#cbd5e1',
              color: '#334155',
              fontWeight: 600,
              fontSize: 13,
              borderRadius: 1.5,
              textTransform: 'none',
              '&:hover': { borderColor: '#94a3b8', bgcolor: '#f8fafc' },
            }}
          >
            ← Voltar para Solicitações
          </Button>
        </Box>
      </Box>

      {/* Tratamento dos 5 Estados Visuais de Carregamento e Erro Inicial */}
      <StateFeedback
        isLoading={isLoading}
        error={loadError}
        isEmpty={!isLoading && !loadError && !request}
        emptyMessage={`A solicitação #${requestId} não foi localizada no sistema.`}
        emptyActionLabel="Consultar Solicitações"
        onEmptyAction={() => navigate('/frota/solicitacoes')}
        onRetry={() => { void reloadData() }}
      >
        {request && (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Feedback de Erro ou Concorrência no Topo (PE-CA-014) */}
            {submitError && (
              <Box
                role="alert"
                aria-live="assertive"
                sx={{
                  bgcolor: '#fef2f2',
                  border: '1px solid #f87171',
                  borderRadius: 2,
                  p: 2,
                  boxShadow: '0 2px 4px rgba(239, 68, 68, 0.08)',
                }}
              >
                <Alert
                  severity="error"
                  onClose={() => setSubmitError(null)}
                  sx={{
                    bgcolor: 'transparent',
                    p: 0,
                    fontWeight: 500,
                    fontSize: 14,
                    '& .MuiAlert-message': { color: '#991b1b' },
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
                    Conflito de Concorrência Detectado (PE-CA-014)
                  </Typography>
                  {submitError}
                </Alert>
              </Box>
            )}

            {/* Estado de Sucesso (5º Estado Visual) */}
            {successResult && (
              <Card
                role="status"
                aria-live="polite"
                sx={{
                  bgcolor: '#f0fdf4',
                  border: '1px solid #86efac',
                  borderRadius: 2.5,
                  p: 3,
                  boxShadow: '0 2px 8px rgba(34, 197, 94, 0.12)',
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
                  <Box
                    sx={{
                      width: 44,
                      height: 44,
                      borderRadius: '50%',
                      bgcolor: '#22c55e',
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 22,
                      flexShrink: 0,
                    }}
                  >
                    ✓
                  </Box>
                  <Box sx={{ flex: 1 }}>
                    <Typography variant="h6" sx={{ color: '#166534', fontWeight: 800 }}>
                      Viagem confirmada e fluxo agendado com sucesso!
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#15803d', mt: 0.5 }}>
                      Protocolo de Despacho Oficial: <strong>{successResult.protocol}</strong>
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#166534', mt: 1 }}>
                      A viatura e o motorista foram atribuídos e a viagem está sincronizada com a Agenda da Frota.
                    </Typography>
                    <Box sx={{ mt: 2.5, display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                      <Button
                        variant="contained"
                        onClick={() => navigate('/frota/inicio')}
                        sx={{
                          bgcolor: '#15803d',
                          '&:hover': { bgcolor: '#166534' },
                          minHeight: 40,
                          fontWeight: 700,
                          px: 3,
                          textTransform: 'none',
                        }}
                      >
                        Ver Agenda de Viagens
                      </Button>
                      <Button
                        variant="outlined"
                        onClick={() => {
                          setSuccessResult(null)
                          setSubmitError(null)
                        }}
                        sx={{
                          borderColor: '#86efac',
                          color: '#166534',
                          fontWeight: 600,
                          minHeight: 40,
                          textTransform: 'none',
                          '&:hover': { bgcolor: '#dcfce7', borderColor: '#4ade80' },
                        }}
                      >
                        Agendar Outra Solicitação
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Card>
            )}

            {/* CARD SUPERIOR IMUTÁVEL (Resumo da Solicitação Deferida - PE-RN-010 e PE-RN-023) */}
            <Card
              component="section"
              aria-labelledby="card-solicitacao-titulo"
              sx={{
                bgcolor: '#ffffff',
                borderRadius: 2.5,
                boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
              }}
            >
              <Box
                sx={{
                  bgcolor: '#ffffff',
                  px: 3,
                  py: 2,
                  borderBottom: '1px solid #f3f4f6',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 1.5,
                }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Typography
                    id="card-solicitacao-titulo"
                    variant="subtitle1"
                    sx={{ fontWeight: 800, color: '#111827', fontSize: 16 }}
                  >
                    Solicitação SOL-{request.id} · Transporte institucional
                  </Typography>

                  {/* Badges idênticos ao padrão do Figma */}
                  <Box
                    sx={{
                      bgcolor: '#dcfce7',
                      color: '#15803d',
                      fontSize: 12,
                      fontWeight: 700,
                      px: 1.2,
                      py: 0.3,
                      borderRadius: 1,
                      display: 'inline-block',
                    }}
                  >
                    Aprovada
                  </Box>

                  {request.urgency === 'URGENT' && (
                    <Box
                      sx={{
                        bgcolor: '#fee2e2',
                        color: '#dc2626',
                        fontSize: 12,
                        fontWeight: 700,
                        px: 1.2,
                        py: 0.3,
                        borderRadius: 1,
                        display: 'inline-block',
                      }}
                    >
                      Urgente
                    </Box>
                  )}
                </Box>

                <Typography variant="caption" sx={{ color: '#9ca3af', fontWeight: 500 }}>
                  Dados imutáveis da solicitação deferida (PE-RN-010)
                </Typography>
              </Box>

              <CardContent sx={{ p: 3 }}>
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: 'repeat(4, 1fr)' },
                    gap: 3,
                  }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, display: 'block' }}>
                      Solicitante
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#111827', mt: 0.3, fontSize: 15 }}>
                      {request.requesterName}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#9ca3af', display: 'block' }}>
                      {request.requesterDepartment}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, display: 'block' }}>
                      Destino
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#111827', mt: 0.3, fontSize: 15 }}>
                      {request.destination}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, display: 'block' }}>
                      Passageiros / Carga (Pax)
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#111827', mt: 0.3, fontSize: 15 }}>
                      {request.passengersCount} passageiros
                    </Typography>
                    {request.cargoDescription && (
                      <Typography variant="caption" sx={{ color: '#6b7280', display: 'block' }}>
                        {request.cargoDescription}
                      </Typography>
                    )}
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, display: 'block' }}>
                      Horário Solicitado
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#1976d2', mt: 0.3, fontSize: 15 }}>
                      {new Date(request.requestedDeparture).toLocaleString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Typography>
                  </Box>
                </Box>

                <Divider sx={{ my: 2 }} />

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: { xs: '1fr', md: '7fr 5fr' },
                    gap: 3,
                  }}
                >
                  <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, display: 'block' }}>
                      Finalidade e Justificativa (PE-RN-023)
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#374151', mt: 0.3, lineHeight: 1.5 }}>
                      {request.justification}
                    </Typography>
                  </Box>

                  <Box>
                    <Typography variant="caption" sx={{ color: '#6b7280', fontWeight: 600, display: 'block' }}>
                      Requisitos de Transporte
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.3, fontStyle: 'italic' }}>
                      {request.observations || 'Nenhum requisito adicional.'}
                    </Typography>
                  </Box>
                </Box>
              </CardContent>
            </Card>

            {/* SEÇÃO PRINCIPAL: FORMULÁRIO (ESQUERDA) + TIMELINE DA FROTA (DIREITA) */}
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: { xs: '1fr', lg: '7fr 5fr' },
                gap: 3,
                alignItems: 'start',
              }}
            >
              {/* FORMULÁRIO OPERACIONAL */}
              <Card
                component="section"
                aria-labelledby="titulo-formulario"
                sx={{
                  bgcolor: '#ffffff',
                  borderRadius: 2.5,
                  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                  border: '1px solid #e5e7eb',
                  p: 3,
                }}
              >
                <Box sx={{ mb: 2.5 }}>
                  <Typography id="titulo-formulario" variant="h6" sx={{ fontWeight: 800, color: '#111827', fontSize: 17 }}>
                    Alocação de Viatura e Condutor
                  </Typography>
                  <Typography variant="body2" sx={{ color: '#6b7280', mt: 0.3, fontSize: 13 }}>
                    Selecione o intervalo operacional e os recursos compatíveis para a realização do transporte.
                  </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit} noValidate>
                  {/* Campos de Início e Fim Previstos Lado a Lado (PE-RN-026) */}
                  <Box
                    sx={{
                      display: 'grid',
                      gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' },
                      gap: 2,
                    }}
                  >
                    <FormField
                      label="Início Previsto da Viagem *"
                      type="datetime-local"
                      value={startDateTime}
                      onChange={(e) => setStartDateTime(e.target.value)}
                      required
                      helperText="Saída prevista da unidade"
                      inputProps={{ 'aria-label': 'Início Previsto da Viagem' }}
                    />

                    <FormField
                      label="Fim Previsto da Viagem *"
                      type="datetime-local"
                      value={endDateTime}
                      onChange={(e) => setEndDateTime(e.target.value)}
                      required
                      helperText="Retorno previsto ao pátio"
                      inputProps={{ 'aria-label': 'Fim Previsto da Viagem' }}
                    />
                  </Box>

                  {/* Seletor de Veículo Compatível */}
                  <Box sx={{ mb: 2.5 }}>
                    <Typography
                      component="label"
                      htmlFor={vehicleSelectId}
                      sx={{ display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600, color: '#374151' }}
                    >
                      Veículo Compatível *
                    </Typography>
                    <Select
                      id={vehicleSelectId}
                      fullWidth
                      value={selectedVehicleId}
                      onChange={(e) => setSelectedVehicleId(e.target.value)}
                      inputProps={{ 'aria-label': 'Selecione o veículo compatível' }}
                      sx={{
                        minHeight: 44,
                        borderRadius: 1.5,
                        bgcolor: '#ffffff',
                        fontSize: 14,
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#1976d2',
                          borderWidth: 2,
                        },
                      }}
                    >
                      {vehicles.map((veh) => (
                        <MenuItem
                          key={veh.id}
                          value={veh.id}
                          disabled={veh.status !== 'AVAILABLE'}
                          sx={{ py: 1.2, display: 'flex', justifyContent: 'space-between' }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                              {veh.model} · Placa {veh.licensePlate}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6b7280' }}>
                              Cap: {veh.capacity} lugares · Categoria: {veh.category} · Hodômetro:{' '}
                              {veh.currentMileage.toLocaleString('pt-BR')} km
                            </Typography>
                          </Box>
                          <Box sx={{ ml: 2 }}>
                            {veh.status === 'AVAILABLE' ? (
                              <Box sx={{ bgcolor: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                                Disponível
                              </Box>
                            ) : veh.status === 'IN_TRANSIT' ? (
                              <Box sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                                Em Trânsito
                              </Box>
                            ) : (
                              <Box sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                                Manutenção
                              </Box>
                            )}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>

                  {/* Seletor de Motorista Disponível */}
                  <Box sx={{ mb: 2.5 }}>
                    <Typography
                      component="label"
                      htmlFor={driverSelectId}
                      sx={{ display: 'block', mb: 0.75, fontSize: 13, fontWeight: 600, color: '#374151' }}
                    >
                      Motorista Disponível *
                    </Typography>
                    <Select
                      id={driverSelectId}
                      fullWidth
                      value={selectedDriverId}
                      onChange={(e) => setSelectedDriverId(e.target.value)}
                      inputProps={{ 'aria-label': 'Selecione o motorista disponível' }}
                      sx={{
                        minHeight: 44,
                        borderRadius: 1.5,
                        bgcolor: '#ffffff',
                        fontSize: 14,
                        '&.Mui-focused .MuiOutlinedInput-notchedOutline': {
                          borderColor: '#1976d2',
                          borderWidth: 2,
                        },
                      }}
                    >
                      {drivers.map((drv) => (
                        <MenuItem
                          key={drv.id}
                          value={drv.id}
                          disabled={drv.status !== 'AVAILABLE'}
                          sx={{ py: 1.2, display: 'flex', justifyContent: 'space-between' }}
                        >
                          <Box>
                            <Typography variant="body2" sx={{ fontWeight: 600, color: '#111827' }}>
                              {drv.name} · CNH {drv.cnhCategory}
                            </Typography>
                            <Typography variant="caption" sx={{ color: '#6b7280' }}>
                              Escala: {drv.shift}
                            </Typography>
                          </Box>
                          <Box sx={{ ml: 2 }}>
                            {drv.status === 'AVAILABLE' ? (
                              <Box sx={{ bgcolor: '#dcfce7', color: '#15803d', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                                Disponível
                              </Box>
                            ) : drv.status === 'ON_DUTY' ? (
                              <Box sx={{ bgcolor: '#dbeafe', color: '#1e40af', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                                Em Viagem
                              </Box>
                            ) : (
                              <Box sx={{ bgcolor: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 700, px: 1, py: 0.2, borderRadius: 1 }}>
                                Afastado
                              </Box>
                            )}
                          </Box>
                        </MenuItem>
                      ))}
                    </Select>
                  </Box>

                  {/* Observações Operacionais */}
                  <FormField
                    label="Observações Operacionais para o Motorista"
                    placeholder="Ex: Acessar portaria 2 da Santa Casa; apresentar guia de remessa sorológica."
                    value={operationalNotes}
                    onChange={(e) => setOperationalNotes(e.target.value)}
                    multiline
                    rows={2}
                    helperText="Instruções repassadas na ordem de serviço do condutor"
                  />

                  {/* Ações do Formulário */}
                  <Box
                    sx={{
                      mt: 3,
                      pt: 2.5,
                      borderTop: '1px solid #f3f4f6',
                      display: 'flex',
                      gap: 2,
                      flexWrap: 'wrap',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <Button
                      type="button"
                      variant="text"
                      onClick={handleSimulateConflict}
                      aria-label="Simular teste de concorrência com veículo ocupado"
                      sx={{
                        color: '#b45309',
                        fontSize: 12,
                        textDecoration: 'underline',
                        textTransform: 'none',
                        minHeight: 40,
                        fontWeight: 600,
                        '&:hover': { bgcolor: '#fef3c7' },
                      }}
                    >
                      ⚡ Simular Conflito de Concorrência (PE-CA-014)
                    </Button>

                    <Box sx={{ display: 'flex', gap: 1.5 }}>
                      <Button
                        type="button"
                        variant="outlined"
                        onClick={() => navigate('/frota/solicitacoes')}
                        disabled={isSubmitting}
                        sx={{
                          minHeight: 42,
                          borderColor: '#d1d5db',
                          color: '#4b5563',
                          fontWeight: 600,
                          fontSize: 13,
                          textTransform: 'none',
                          borderRadius: 1.5,
                          px: 2.5,
                          '&:hover': { bgcolor: '#f9fafb' },
                        }}
                      >
                        Cancelar
                      </Button>

                      <Button
                        type="submit"
                        variant="contained"
                        disabled={isSubmitting}
                        aria-busy={isSubmitting}
                        sx={{
                          bgcolor: '#1976d2', // Azul institucional do Figma
                          '&:hover': { bgcolor: '#1565c0' },
                          minHeight: 42,
                          px: 3,
                          fontSize: 14,
                          fontWeight: 700,
                          textTransform: 'none',
                          borderRadius: 1.5,
                          boxShadow: 'none',
                        }}
                      >
                        {isSubmitting && (
                          <CircularProgress size={18} sx={{ color: '#ffffff', mr: 1 }} aria-label="Processando" />
                        )}
                        {isSubmitting ? 'Processando…' : 'Confirmar agendamento'}
                      </Button>
                    </Box>
                  </Box>
                </Box>
              </Card>

              {/* PAINEL LATERAL: AGENDA DA FROTA (Idêntico ao Figma Tela 1 - Captura 192950) */}
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                {/* Card 1: Grade de Horários da Semana */}
                <Card
                  component="aside"
                  aria-labelledby="titulo-agenda-frota"
                  sx={{
                    bgcolor: '#ffffff',
                    borderRadius: 2.5,
                    boxShadow: '0 1px 3px rgba(0, 0, 0, 0.05)',
                    border: '1px solid #e5e7eb',
                    p: 2.5,
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Box>
                      <Typography id="titulo-agenda-frota" variant="subtitle1" sx={{ fontWeight: 800, color: '#111827', fontSize: 15 }}>
                        Agenda de Viagens
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#6b7280' }}>
                        21 a 25 de setembro · Prevenção de conflito (PE-RN-026)
                      </Typography>
                    </Box>

                    {/* Toggle Semana / Mês do Figma */}
                    <Box sx={{ display: 'flex', border: '1px solid #1976d2', borderRadius: 1, overflow: 'hidden' }}>
                      <Box sx={{ bgcolor: '#1976d2', color: '#ffffff', fontSize: 11, fontWeight: 700, px: 1, py: 0.3 }}>
                        Semana
                      </Box>
                      <Box sx={{ bgcolor: '#ffffff', color: '#1976d2', fontSize: 11, fontWeight: 600, px: 1, py: 0.3 }}>
                        Mês
                      </Box>
                    </Box>
                  </Box>

                  {/* Tabela Resumida da Agenda Semanal com Chips Coloridos do Figma */}
                  <Box
                    sx={{
                      width: '100%',
                      overflowX: 'auto',
                      border: '1px solid #f3f4f6',
                      borderRadius: 1.5,
                      mb: 2,
                    }}
                  >
                    <Box
                      component="table"
                      sx={{
                        width: '100%',
                        borderCollapse: 'collapse',
                        fontSize: 12,
                        '& th': { bgcolor: '#f9fafb', color: '#6b7280', fontWeight: 600, p: 1, textAlign: 'left', borderBottom: '1px solid #e5e7eb' },
                        '& td': { p: 0.9, borderBottom: '1px solid #f3f4f6', verticalAlign: 'middle' },
                      }}
                    >
                      <thead>
                        <tr>
                          <th>Horário</th>
                          <th>Seg, 21</th>
                          <th>Ter, 22</th>
                          <th>Qua, 23</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr>
                          <td><strong>08:00</strong></td>
                          <td>
                            <Box sx={{ bgcolor: '#dbeafe', color: '#1e40af', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              RJG-9912 · UPA
                            </Box>
                          </td>
                          <td><span style={{ color: '#d1d5db' }}>—</span></td>
                          <td>
                            <Box sx={{ bgcolor: '#dcfce7', color: '#15803d', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              MGT-1103 · Sede
                            </Box>
                          </td>
                        </tr>
                        <tr>
                          <td><strong>10:00</strong></td>
                          <td><span style={{ color: '#d1d5db' }}>—</span></td>
                          <td>
                            <Box sx={{ bgcolor: '#dbeafe', color: '#1e40af', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              KBP-7722 · Hospital
                            </Box>
                          </td>
                          <td><span style={{ color: '#d1d5db' }}>—</span></td>
                        </tr>
                        <tr>
                          <td><strong>14:00</strong></td>
                          <td>
                            <Box sx={{ bgcolor: '#fef3c7', color: '#92400e', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              MGT-1103 · Santa Casa
                            </Box>
                          </td>
                          <td><span style={{ color: '#d1d5db' }}>—</span></td>
                          <td>
                            <Box sx={{ bgcolor: '#dbeafe', color: '#1e40af', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              PBT-4421 · Lab
                            </Box>
                          </td>
                        </tr>
                        <tr>
                          <td><strong>16:00</strong></td>
                          <td>
                            <Box sx={{ bgcolor: '#fef3c7', color: '#92400e', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              PBT-4421 · Almox.
                            </Box>
                          </td>
                          <td>
                            <Box sx={{ bgcolor: '#dbeafe', color: '#1e40af', px: 0.8, py: 0.3, borderRadius: 1, fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>
                              RJG-9912 · Norte
                            </Box>
                          </td>
                          <td><span style={{ color: '#d1d5db' }}>—</span></td>
                        </tr>
                      </tbody>
                    </Box>
                  </Box>

                  {/* Card "Hoje — 21/09" idêntico ao Figma */}
                  <Box sx={{ borderTop: '1px solid #f3f4f6', pt: 2 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 800, color: '#111827', fontSize: 13, mb: 1.5 }}>
                      Hoje — 21/09 (Ocupação em Tempo Real)
                    </Typography>

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {fleetSchedule.map((item) => (
                        <Box
                          key={item.id}
                          sx={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            py: 0.5,
                            borderBottom: '1px dashed #f3f4f6',
                          }}
                        >
                          <Typography variant="caption" sx={{ fontWeight: 600, color: '#374151' }}>
                            {item.startTime} · {item.vehiclePlate} ({item.driverName})
                          </Typography>
                          <Box
                            sx={{
                              bgcolor: item.status === 'IN_PROGRESS' ? '#dbeafe' : '#fef3c7',
                              color: item.status === 'IN_PROGRESS' ? '#1e40af' : '#92400e',
                              fontSize: 11,
                              fontWeight: 700,
                              px: 1,
                              py: 0.2,
                              borderRadius: 1,
                            }}
                          >
                            {item.status === 'IN_PROGRESS' ? 'Em uso' : 'Pendente'}
                          </Box>
                        </Box>
                      ))}
                    </Box>
                  </Box>
                </Card>

                {/* Card de Auxílio à Decisão Operacional */}
                <Box
                  sx={{
                    p: 2,
                    bgcolor: '#eff6ff',
                    borderRadius: 2,
                    border: '1px solid #bfdbfe',
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#1e40af', fontSize: 13, mb: 0.5 }}>
                    ✓ Verificação Automática de Agenda
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#1e3a8a', lineHeight: 1.5, display: 'block' }}>
                    O veículo <strong>XYZ-9821</strong> e o condutor <strong>Carlos Alberto Santos</strong> estão 100% disponíveis no horário selecionado. Não há sobreposição com manutenções preventivas ou outras viagens.
                  </Typography>
                </Box>
              </Box>
            </Box>
          </Box>
        )}
      </StateFeedback>
    </AppShell>
  )
}
