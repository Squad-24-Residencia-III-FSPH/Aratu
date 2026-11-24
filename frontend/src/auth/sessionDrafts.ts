import { createContext, useCallback, useContext, useState, useSyncExternalStore } from 'react'

/**
 * Opções de retenção em memória para um rascunho de formulário ou filtro.
 */
export interface SessionDraftOptions {
  /**
   * Indica dado operacional sensível (ex.: registros ou identificações do SVO).
   * Rascunhos sensíveis são descartados imediatamente também na expiração da sessão.
   */
  sensitive?: boolean
}

/**
 * Política de armazenamento seguro em memória para rascunhos de formulário e contexto de retorno.
 *
 * Nenhum dado operacional ou sensível (ex.: registros do SVO) é gravado em `localStorage` ou
 * `sessionStorage`. O conteúdo permanece exclusivamente em memória na aba atual e é descartado
 * no logout intencional, no encerramento em outra aba ou na troca de conta (`userId`). Rascunhos
 * marcados como `sensitive` também são descartados na expiração involuntária da sessão.
 */
export interface SessionDraftStore {
  /** Vincula o usuário ativo ao repositório em memória, descartando dados de outra conta. */
  bindUser: (userId: string | null) => void
  /** Descarta imediatamente todos os rascunhos e o contexto de retorno em memória. */
  clear: () => void
  /** Descarta apenas os rascunhos marcados como sensíveis (ex.: política SVO ao expirar). */
  clearSensitive: () => void
  /** Lê um rascunho armazenado em memória para a chave informada. */
  getDraft: <T>(key: string) => T | undefined
  /** Salva ou remove (`undefined`) um rascunho em memória sob a chave informada. */
  setDraft: <T>(key: string, value: T | undefined, options?: SessionDraftOptions) => void
  /** Registra o caminho de retorno após expiração involuntária para retomada pelo mesmo usuário. */
  setReturnPath: (path: string | null) => void
  /** Lê o caminho de retorno pendente sem descartá-lo. */
  getReturnPath: () => string | null
  /** Lê e limpa o caminho de retorno pendente após retomada pelo mesmo usuário. */
  consumeReturnPath: () => string | null
  /** Retorna o identificador do usuário atualmente dono dos rascunhos em memória. */
  getOwnerUserId: () => string | null
  /** Inscreve um ouvinte para sincronização de mudanças/descartes em componentes React. */
  subscribe: (listener: () => void) => () => void
}

/**
 * Cria um repositório em memória isolado por instância de `AuthProvider`.
 *
 * @returns Instância do repositório em memória de rascunhos e contexto de retorno.
 */
export function createSessionDraftStore(): SessionDraftStore {
  let ownerUserId: string | null = null
  let returnPath: string | null = null
  const drafts = new Map<string, unknown>()
  const sensitiveKeys = new Set<string>()
  const listeners = new Set<() => void>()

  function notify(): void {
    for (const listener of listeners) listener()
  }

  function clearInternal(): void {
    const hadState = ownerUserId !== null || returnPath !== null || drafts.size > 0 || sensitiveKeys.size > 0
    ownerUserId = null
    returnPath = null
    drafts.clear()
    sensitiveKeys.clear()
    if (hadState) notify()
  }

  return {
    bindUser(userId: string | null): void {
      if (userId === null) return
      if (ownerUserId !== null && ownerUserId !== userId) {
        drafts.clear()
        sensitiveKeys.clear()
        returnPath = null
        ownerUserId = userId
        notify()
        return
      }
      ownerUserId = userId
    },
    clear(): void {
      clearInternal()
    },
    clearSensitive(): void {
      if (sensitiveKeys.size === 0) return
      let removed = false
      for (const key of sensitiveKeys) {
        if (drafts.delete(key)) removed = true
      }
      sensitiveKeys.clear()
      if (removed) notify()
    },
    getDraft<T>(key: string): T | undefined {
      return drafts.get(key) as T | undefined
    },
    setDraft<T>(key: string, value: T | undefined, options?: SessionDraftOptions): void {
      if (value === undefined) {
        sensitiveKeys.delete(key)
        if (drafts.delete(key)) notify()
        return
      }
      if (options?.sensitive) sensitiveKeys.add(key)
      else if (options?.sensitive === false) sensitiveKeys.delete(key)
      drafts.set(key, value)
      notify()
    },
    setReturnPath(path: string | null): void {
      const normalized = path && path !== '/login' ? path : null
      if (returnPath !== normalized) {
        returnPath = normalized
        notify()
      }
    },
    getReturnPath(): string | null {
      return returnPath
    },
    consumeReturnPath(): string | null {
      const current = returnPath
      if (current !== null) {
        returnPath = null
        notify()
      }
      return current
    },
    getOwnerUserId(): string | null {
      return ownerUserId
    },
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
  }
}

export const SessionDraftContext = createContext<SessionDraftStore | null>(null)

/**
 * Hook reutilizável para persistir rascunhos não persistentes (somente em memória)
 * através de renovação de token ou expiração involuntária retomada pelo mesmo usuário.
 *
 * Quando usado fora de `AuthProvider`, degrada com segurança para estado local do componente.
 *
 * @param key - Chave estável identificando o formulário/recorte (ex.: `'trip-confirmation:filters'`).
 * @param initialValue - Valor padrão quando não houver rascunho em memória.
 * @param options - Opções de política de retenção (ex.: `{ sensitive: true }` para dados do SVO).
 * @returns Tupla `[draft, setDraft, clearDraft]` compatível com `React.useState`.
 */
export function useSessionDraft<T>(
  key: string,
  initialValue: T,
  options?: SessionDraftOptions,
): readonly [T, (next: T | ((prev: T) => T)) => void, () => void] {
  const store = useContext(SessionDraftContext)
  const [fallbackState, setFallbackState] = useState<T>(initialValue)
  const sensitive = options?.sensitive

  const subscribe = useCallback((listener: () => void) => {
    if (!store) return () => undefined
    return store.subscribe(listener)
  }, [store])

  const getSnapshot = useCallback((): T => {
    if (!store) return initialValue
    const existing = store.getDraft<T>(key)
    return existing !== undefined ? existing : initialValue
  }, [store, key, initialValue])

  const storeValue = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const value = store ? storeValue : fallbackState

  const setDraft = useCallback((next: T | ((prev: T) => T)): void => {
    if (!store) {
      setFallbackState(next)
      return
    }
    const previous = store.getDraft<T>(key)
    const base = previous !== undefined ? previous : initialValue
    const resolved = typeof next === 'function' ? (next as (prev: T) => T)(base) : next
    store.setDraft(key, resolved, sensitive !== undefined ? { sensitive } : undefined)
  }, [store, key, initialValue, sensitive])

  const clearDraft = useCallback((): void => {
    if (!store) {
      setFallbackState(initialValue)
      return
    }
    store.setDraft(key, undefined)
  }, [store, key, initialValue])

  return [value, setDraft, clearDraft] as const
}

/**
 * Hook auxiliar para acessar o contexto de continuidade da sessão (rascunhos e rota de retorno).
 *
 * @returns Instância do `SessionDraftStore` ou `null` fora do `AuthProvider`.
 */
export function useSessionContinuity(): SessionDraftStore | null {
  return useContext(SessionDraftContext)
}
