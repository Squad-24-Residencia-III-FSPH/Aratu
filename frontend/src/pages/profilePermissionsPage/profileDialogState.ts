import type { Profile } from '../../auth/profiles'

export type ProfileDialogAction =
  | { type: 'open'; profile: Profile }
  | { type: 'close' }

/** Mantém apenas o perfil cujo diálogo informativo está aberto. */
export function profileDialogReducer(
  _currentProfile: Profile | null,
  action: ProfileDialogAction,
): Profile | null {
  return action.type === 'open' ? action.profile : null
}
