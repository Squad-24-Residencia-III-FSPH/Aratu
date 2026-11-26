import type { ProfileOption } from '../../services/profileService'

export type ProfileListState =
  | { status: 'loading' }
  | { status: 'success'; profiles: ProfileOption[] }
  | { status: 'empty' }
  | { status: 'forbidden' }
  | { status: 'error' }

export type ProfileListAction =
  | { type: 'loading' }
  | { type: 'loaded'; profiles: ProfileOption[] }
  | { type: 'failed'; reason: 'forbidden' | 'unavailable' }

/** Converte respostas da consulta em estados de interface explícitos. */
export function profileListReducer(_state: ProfileListState, action: ProfileListAction): ProfileListState {
  if (action.type === 'loading') return { status: 'loading' }
  if (action.type === 'failed') {
    return action.reason === 'forbidden' ? { status: 'forbidden' } : { status: 'error' }
  }
  return action.profiles.length > 0
    ? { status: 'success', profiles: action.profiles }
    : { status: 'empty' }
}
