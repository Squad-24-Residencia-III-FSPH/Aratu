import type { Profile } from '../auth/profiles'

export const TRIP_SCHEDULING_PATH = '/agendar-viagem'

/** Agendamento de solicitações é uma operação exclusiva do Gestor. */
export function canScheduleTrips(profile: Profile | null): boolean {
  return profile === 'GESTOR'
}
