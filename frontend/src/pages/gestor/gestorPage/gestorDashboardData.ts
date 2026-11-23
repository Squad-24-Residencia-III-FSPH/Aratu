
export const DEMO_FLEET_STATUS = [
  { key: 'available', label: 'Disponíveis', count: 12, color: '#15803d' },
  { key: 'inTrip', label: 'Em viagem', count: 5, color: '#2563eb' },
  { key: 'maintenance', label: 'Em manutenção', count: 3, color: '#b45309' },
  { key: 'unavailable', label: 'Indisponíveis', count: 2, color: '#64748b' },
] as const

export const DEMO_DASHBOARD_METRICS = {
  utilization: 78,
  utilizationChange: '+4 p.p. no período',
  trips: 146,
  tripsChange: '+12% no período',
  kilometers: 8420,
  kilometersChange: '+8% no período',
  fuelCost: 18450,
  fuelCostChange: '+3% no período',
  maintenance: 14,
  preventiveMaintenance: 9,
  correctiveMaintenance: 5,
  averageConsumption: 8.2,
  consumptionChange: '+0,6 km/L',
  fuelVolume: 2250,
} as const

export const DEMO_UPCOMING_MAINTENANCE = [
  { id: 'maintenance-1', vehicle: 'Veículo 04', kind: 'Preventiva', date: dateInDays(3) },
  { id: 'maintenance-2', vehicle: 'Veículo 11', kind: 'Corretiva', date: dateInDays(5) },
  { id: 'maintenance-3', vehicle: 'Veículo 18', kind: 'Preventiva', date: dateInDays(8) },
] as const

export const DEMO_TODAY_TRIPS = [
  { id: 'trip-1', time: '08:00', service: 'Institucional', origin: 'FSPH', destination: 'Hospital Regional', vehicle: 'Veículo 13', status: 'Em andamento' },
  { id: 'trip-2', time: '10:30', service: 'Institucional', origin: 'FSPH', destination: 'Unidade Norte', vehicle: 'Veículo 14', status: 'Agendada' },
  { id: 'trip-3', time: '14:00', service: 'Visita técnica', origin: 'FSPH', destination: 'Unidade Centro', vehicle: 'Veículo 15', status: 'Agendada' },
  { id: 'trip-4', time: '16:30', service: 'Administrativa', origin: 'Almoxarifado', destination: 'FSPH', vehicle: 'Veículo 16', status: 'Agendada' },
] as const

export const DEMO_PENDING_ACTIONS = [
  { id: 'requests', count: 5, title: 'solicitações aguardando aprovação', detail: '2 são para viagens ainda hoje', action: 'Ver solicitações', path: '/frota/solicitacoes/analise', tone: 'warning' },
  { id: 'documents', count: 2, title: 'veículos com documentos a vencer', detail: 'Vencimento nos próximos 15 dias', action: 'Ver veículos', path: '/veiculos', tone: 'danger' },
  { id: 'trips', count: 3, title: 'viagens aguardando confirmação', detail: 'Execuções finalizadas pelo motorista', action: 'Ver viagens', path: '/viagens/confirmacao', tone: 'info' },
] as const

function dateInDays(daysFromNow: number): string {
  const date = new Date()
  date.setDate(date.getDate() + daysFromNow)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function formatDemoCurrency(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(value)
}

export function formatDemoDate(value: string): string {
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`))
}
