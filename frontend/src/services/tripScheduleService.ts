import type {
  TripRequest,
  VehicleOption,
  DriverOption,
  FleetScheduleItem,
  ScheduleTripInput,
  ScheduleTripResult,
} from '../types/trip'

// Dados padronizados para solicitações deferidas (FSPH / SVO)
const MOCK_REQUESTS: Record<string, TripRequest> = {
  '123': {
    id: '123',
    requesterName: 'Dr. Marcos Silveira',
    requesterDepartment: 'LACEN - Laboratório Central de Saúde Pública',
    destination: 'Hospital de Urgências de Sergipe (HUSE) - Bloco Cirúrgico, Aracaju/SE',
    passengersCount: 2,
    cargoDescription: '4 caixas térmicas com amostras biológicas e exames sorológicos refrigerados',
    requestedDeparture: '2026-10-28T08:30',
    justification: 'Remessa prioritária de amostras para diagnóstico de rotina hospitalar de urgência.',
    status: 'APPROVED',
    urgency: 'URGENT',
    observations: 'Necessita veículo com ar-condicionado e porta-malas espaçoso para acondicionamento térmico.',
  },
  '456': {
    id: '456',
    requesterName: 'Enf. Juliana Vasconcelos',
    requesterDepartment: 'Vigilância Epidemiológica Estadual',
    destination: 'Unidade Regional de Saúde - Itabaiana/SE',
    passengersCount: 4,
    cargoDescription: 'Material informativo e insumos de imunização',
    requestedDeparture: '2026-10-29T09:00',
    justification: 'Capacitação técnica regional e entrega de insumos essenciais.',
    status: 'APPROVED',
    urgency: 'NORMAL',
    observations: 'Transporte de equipe com retorno previsto para o fim do expediente.',
  },
}

const MOCK_VEHICLES: VehicleOption[] = [
  {
    id: 'veh-01',
    licensePlate: 'XYZ-9821',
    model: 'Chevrolet Spin 1.8 Premier (7 Lugares)',
    capacity: 7,
    category: 'Passageiros / Carga Leve',
    status: 'AVAILABLE',
    currentMileage: 42150,
    isCompatible: true,
  },
  {
    id: 'veh-02',
    licensePlate: 'BRA-2E19',
    model: 'Fiat Doblò Essence 1.8 Ambulatório',
    capacity: 5,
    category: 'Misto / Insumos',
    status: 'AVAILABLE',
    currentMileage: 58900,
    isCompatible: true,
  },
  {
    id: 'veh-03',
    licensePlate: 'KLP-4412',
    model: 'Renault Master Furgão L3H2',
    capacity: 3,
    category: 'Carga Pesada / Logística',
    status: 'AVAILABLE',
    currentMileage: 89300,
    isCompatible: true,
  },
  {
    id: 'veh-04',
    licensePlate: 'OQM-8832',
    model: 'Toyota Hilux 4x4 Cabine Dupla',
    capacity: 5,
    category: 'Operacional / Campo',
    status: 'IN_TRANSIT',
    currentMileage: 64200,
    isCompatible: false,
  },
  {
    id: 'veh-05',
    licensePlate: 'HZV-5510',
    model: 'Fiat Fiorino 1.4 Hard Working',
    capacity: 2,
    category: 'Carga Exclusiva',
    status: 'MAINTENANCE',
    currentMileage: 112000,
    isCompatible: false,
  },
]

const MOCK_DRIVERS: DriverOption[] = [
  {
    id: 'drv-01',
    name: 'Carlos Alberto Santos',
    cnhCategory: 'D',
    cnhNumber: '04829103948',
    status: 'AVAILABLE',
    shift: 'Matutino / Vespertino (07:00 às 16:00)',
    isAvailable: true,
  },
  {
    id: 'drv-02',
    name: 'Marcelo Pereira Lima',
    cnhCategory: 'B',
    cnhNumber: '03918274619',
    status: 'AVAILABLE',
    shift: 'Diurno Integral (08:00 às 17:00)',
    isAvailable: true,
  },
  {
    id: 'drv-03',
    name: 'José Roberto de Oliveira',
    cnhCategory: 'AD',
    cnhNumber: '02847591034',
    status: 'AVAILABLE',
    shift: 'Plantão 12x36 (07:00 às 19:00)',
    isAvailable: true,
  },
  {
    id: 'drv-04',
    name: 'Antônio Marcos Dias',
    cnhCategory: 'B',
    cnhNumber: '05928173645',
    status: 'ON_DUTY',
    shift: 'Em Viagem - Viagem #VG-2026-0839',
    isAvailable: false,
  },
  {
    id: 'drv-05',
    name: 'Reginaldo Farias Filho',
    cnhCategory: 'D',
    cnhNumber: '01849203847',
    status: 'LEAVE',
    shift: 'Licença Médica',
    isAvailable: false,
  },
]

const MOCK_FLEET_SCHEDULE: FleetScheduleItem[] = [
  {
    id: 'sch-01',
    vehiclePlate: 'OQM-8832',
    vehicleModel: 'Toyota Hilux 4x4',
    driverName: 'Antônio Marcos Dias',
    destination: 'Regional Propriá / Coleta SVO',
    startTime: '07:30',
    endTime: '12:00',
    status: 'IN_PROGRESS',
  },
  {
    id: 'sch-02',
    vehiclePlate: 'BRA-2E19',
    vehicleModel: 'Fiat Doblò 1.8',
    driverName: 'Marcelo Pereira Lima',
    destination: 'Maternidade Hildete Falcão - Entrega Leite Materno',
    startTime: '13:30',
    endTime: '16:00',
    status: 'SCHEDULED',
  },
  {
    id: 'sch-03',
    vehiclePlate: 'KLP-4412',
    vehicleModel: 'Renault Master Furgão',
    driverName: 'José Roberto de Oliveira',
    destination: 'Almoxarifado Central FSPH - Reabastecimento',
    startTime: '10:00',
    endTime: '11:45',
    status: 'SCHEDULED',
  },
]

/**
 * Busca os dados de uma solicitação deferida de viagem pelo ID (PE-RN-010 e PE-RN-023).
 */
export async function getTripRequest(id: string): Promise<TripRequest> {
  // Simulação de latência de rede realista
  await new Promise((resolve) => setTimeout(resolve, 300))

  const request = MOCK_REQUESTS[id]
  if (!request) {
    // Fallback dinâmico para qualquer ID numérico válido
    return {
      id,
      requesterName: 'Dr. Marcos Silveira',
      requesterDepartment: 'LACEN - Laboratório Central de Saúde Pública',
      destination: 'Hospital de Urgências de Sergipe (HUSE), Aracaju/SE',
      passengersCount: 2,
      cargoDescription: 'Amostras biológicas refrigeradas em caixas térmicas certificadas',
      requestedDeparture: '2026-10-28T08:30',
      justification: 'Remessa prioritária de amostras para diagnóstico laboratorial urgente.',
      status: 'APPROVED',
      urgency: 'URGENT',
      observations: 'Transporte refrigerado com prioridade clínica da FSPH.',
    }
  }

  return request
}

/**
 * Retorna lista de veículos disponíveis e compatíveis para o intervalo.
 */
export async function getAvailableVehicles(): Promise<VehicleOption[]> {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return [...MOCK_VEHICLES]
}

/**
 * Retorna lista de motoristas disponíveis para o intervalo.
 */
export async function getAvailableDrivers(): Promise<DriverOption[]> {
  await new Promise((resolve) => setTimeout(resolve, 200))
  return [...MOCK_DRIVERS]
}

/**
 * Retorna a grade de ocupação e viagens agendadas da frota no dia (PE-RN-026).
 */
export async function getFleetSchedule(): Promise<FleetScheduleItem[]> {
  await new Promise((resolve) => setTimeout(resolve, 250))
  return [...MOCK_FLEET_SCHEDULE]
}

/**
 * Executa o agendamento da viagem, aplicando as regras de validação de horário
 * e detecção de conflitos de concorrência com anúncio acessível (PE-CA-014).
 */
export async function scheduleTrip(input: ScheduleTripInput): Promise<ScheduleTripResult> {
  await new Promise((resolve) => setTimeout(resolve, 500))

  // Validação de intervalo de datas
  if (!input.startDateTime || !input.endDateTime) {
    throw new Error('Informe as datas e horários de início e fim previstos.')
  }

  const start = new Date(input.startDateTime)
  const end = new Date(input.endDateTime)

  if (end <= start) {
    throw new Error('O término previsto deve ser posterior ao horário de início da viagem.')
  }

  if (!input.vehicleId) {
    throw new Error('Selecione um veículo compatível para a viagem.')
  }

  if (!input.driverId) {
    throw new Error('Selecione um motorista disponível para conduzir a viagem.')
  }

  // Simulação de concorrência com o veículo BRA-2E19 no período da tarde (13:30 - 16:00)
  if (input.vehicleId === 'veh-02') {
    const tripHour = start.getHours()
    if (tripHour >= 13 && tripHour <= 16) {
      throw new Error(
        'Conflito de Concorrência: O veículo Fiat Doblò (BRA-2E19) acabou de ser reservado por outro gestor para o período das 13:30 às 16:00. Seus dados foram preservados — por favor, selecione outro veículo ou ajuste o intervalo.',
      )
    }
  }

  // Simulação de concorrência com o motorista drv-04
  if (input.driverId === 'drv-04') {
    throw new Error(
      'Conflito de Concorrência: O motorista Antônio Marcos Dias já se encontra em trânsito e não pode ser alocado. Seus dados foram preservados — selecione outro motorista disponível.',
    )
  }

  return {
    success: true,
    tripId: '1042',
    protocol: `VG-2026-${Math.floor(1000 + Math.random() * 9000)}`,
    message: 'Viagem agendada e despachada com sucesso no Sistema Aratu.',
  }
}
