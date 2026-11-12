import { REQUEST_CREATED_NOTICE } from './requestTypes.ts'
import type { SubmittedTripRequest } from './requestTypes.ts'

// TODO(FROTA-82/FROTA-84): Este store sincroniza em memória/sessão as solicitações recém-criadas
// via `POST /requests` (`FROTA-78` / `FROTA-79`) com a tela "Minhas Solicitações" (`SolicitacaoPage.tsx`)
// enquanto o endpoint backend `GET /requests` (`FROTA-82`, US12) e a integração da listagem (`FROTA-84`)
// ainda não foram entregues na `develop`. Quando `FROTA-82` e `FROTA-84` forem implementadas:
// 1. Substituir a leitura de `listCreatedRequests()` em `SolicitacaoPage.tsx` pela chamada real a `GET /requests`;
// 2. Manter apenas o transporte de mensagem flash (`consumeCreatedRequestNotice`) ou `location.state` se desejado.

const STORAGE_KEY = 'aratu.createdTripRequests'
const NOTICE_STORAGE_KEY = 'aratu.createdTripRequestNotice'

let memoryRequests: SubmittedTripRequest[] = []
let memoryNotice: string | null = null

function getSessionStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.sessionStorage ? window.sessionStorage : null
  } catch {
    return null
  }
}

function readStoredRequests(): SubmittedTripRequest[] {
  const storage = getSessionStorage()
  if (!storage) return memoryRequests
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return memoryRequests
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return memoryRequests
    return parsed.filter(
      (item): item is SubmittedTripRequest =>
        typeof item === 'object'
        && item !== null
        && typeof (item as Record<string, unknown>).id === 'string'
        && (item as Record<string, unknown>).status === 'PENDING'
        && typeof (item as Record<string, unknown>).requestedDate === 'string'
        && typeof (item as Record<string, unknown>).requestedTime === 'string'
        && typeof (item as Record<string, unknown>).origin === 'string'
        && typeof (item as Record<string, unknown>).destination === 'string'
        && typeof (item as Record<string, unknown>).purpose === 'string'
        && typeof (item as Record<string, unknown>).serviceId === 'string',
    )
  } catch {
    return memoryRequests
  }
}

function writeStoredRequests(items: SubmittedTripRequest[]): void {
  memoryRequests = items
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignora falhas de cota do sessionStorage mantendo o espelho em memória.
  }
}

/**
 * Registra uma solicitação recém-criada (`201 Created` de `POST /requests`) no topo da sessão
 * e ativa a confirmação `"Solicitação registrada"` para exibição em "Minhas solicitações".
 */
export function recordCreatedRequest(
  request: SubmittedTripRequest,
  notice = REQUEST_CREATED_NOTICE,
): SubmittedTripRequest {
  const existing = readStoredRequests().filter((item) => item.id !== request.id)
  writeStoredRequests([request, ...existing])
  memoryNotice = notice
  const storage = getSessionStorage()
  if (storage) {
    try {
      storage.setItem(NOTICE_STORAGE_KEY, notice)
    } catch {
      // Mantém em memória caso o storage esteja bloqueado.
    }
  }
  return request
}

/**
 * Retorna as solicitações criadas na sessão atual, da mais recente para a mais antiga.
 *
 * // TODO(FROTA-82/FROTA-84): Substituir pelo consumo de `GET /requests` quando a US12 for integrada.
 */
export function listCreatedRequests(): SubmittedTripRequest[] {
  return [...readStoredRequests()]
}

/**
 * Lê e consome a mensagem de confirmação pós-criação (`"Solicitação registrada"`).
 */
export function consumeCreatedRequestNotice(): string | null {
  const storage = getSessionStorage()
  const storedNotice = storage ? storage.getItem(NOTICE_STORAGE_KEY) : null
  const notice = memoryNotice ?? storedNotice
  memoryNotice = null
  if (storage) {
    try {
      storage.removeItem(NOTICE_STORAGE_KEY)
    } catch {
      // Ignora erro de remoção no sessionStorage.
    }
  }
  return notice
}

/** Limpa o estado em memória e no `sessionStorage` (utilizado em logout e testes automatizados). */
export function clearCreatedRequestsStore(): void {
  memoryRequests = []
  memoryNotice = null
  const storage = getSessionStorage()
  if (!storage) return
  try {
    storage.removeItem(STORAGE_KEY)
    storage.removeItem(NOTICE_STORAGE_KEY)
  } catch {
    // Ignora erro de limpeza no sessionStorage.
  }
}
