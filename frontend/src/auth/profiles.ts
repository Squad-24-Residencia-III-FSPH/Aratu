// Identificadores centralizados conforme FROTA-27/36; os nomes legíveis também
// são aceitos enquanto a equipe finaliza o seed de perfis do backend.
export const PROFILE_HOMES = {
  ADMINISTRADOR: { label: 'Administrador do Sistema', title: 'Gerenciamento de usuários', path: '/administracao/usuarios' },
  GESTOR: { label: 'Gestor de Frota', title: 'Painel da frota', path: '/frota/inicio' },
  SOLICITANTE: { label: 'Solicitante Interno', title: 'Minhas solicitações', path: '/solicitacoes/minhas' },
  MOTORISTA: { label: 'Motorista', title: 'Minhas viagens', path: '/viagens/minhas' },
  ATENDENTE_SVO: { label: 'Atendente SVO', title: 'Solicitações SVO', path: '/svo/solicitacoes' },
  EQUIPE_SVO: { label: 'Equipe SVO', title: 'Ordens SVO', path: '/svo/ordens' },
} as const

export type Profile = keyof typeof PROFILE_HOMES

const aliases: Record<string, Profile> = {
  ADMINISTRADOR_DO_SISTEMA: 'ADMINISTRADOR',
  GESTOR_DE_FROTA: 'GESTOR',
  SOLICITANTE_INTERNO: 'SOLICITANTE',
  EQUIPE_DE_COLETA_SVO: 'EQUIPE_SVO',
  EQUIPE_DE_COLETA_LOGISTICA_SVO: 'EQUIPE_SVO',
}

export function resolveProfile(value: string): Profile | null {
  const key = value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_|_$/g, '')
  if (Object.hasOwn(PROFILE_HOMES, key)) return key as Profile
  return Object.hasOwn(aliases, key) ? aliases[key] : null
}

export function profileLabel(value: string): string {
  const profile = resolveProfile(value)
  return profile ? PROFILE_HOMES[profile].label : 'Usuário'
}

export function profileInitials(name: string): string {
  const initials = name.trim().split(/\s+/).filter(Boolean)
    .map((part) => part[0]).slice(0, 2).join('').toUpperCase()
  return initials || 'AR'
}
