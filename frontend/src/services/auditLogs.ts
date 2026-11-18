import type { ApiRequest } from '../api/client.ts'

export const AUDIT_PATH = '/auditoria'
export const canReadAudit = (profile: string) => profile === 'GESTOR' || profile === 'ADMINISTRADOR'

export interface AuditFilters {
  inicio: string
  fim: string
  usuario_id: string
  acao: string
  entidade: string
}

export interface AuditEntry {
  id: string
  created_at: string
  usuario: string
  acao: string
  entidade: string
  resumo: string
  detalhes_mascarados?: string
}

export interface AuditPage {
  rows: AuditEntry[]
  total: number
  received: number
  partial: boolean
}

export class AuditAccessDenied extends Error {}

/** Consulta o endpoint de leitura da auditoria e valida os registros antes de exibi-los. */
export async function readAuditLogs(api: ApiRequest, filters: AuditFilters, page: number, signal: AbortSignal): Promise<AuditPage> {
  const params = new URLSearchParams({ page: String(page) })
  for (const [key, value] of Object.entries(filters)) {
    if (value.trim()) params.set(key, value.trim())
  }
  const response = await api('/audit-logs?' + params, { method: 'GET', signal, cache: 'no-store' })
  if (response.status === 403) throw new AuditAccessDenied()
  if (!response.ok) throw new Error('Não foi possível consultar a auditoria.')
  const data: unknown = await response.json()
  if (!data || typeof data !== 'object' || !('rows' in data) || !Array.isArray(data.rows)
    || !('total' in data) || typeof data.total !== 'number' || !Number.isSafeInteger(data.total) || data.total < 0) {
    throw new Error('Resposta de auditoria incompatível.')
  }
  const rows: AuditEntry[] = []
  const ids = new Set<string>()
  for (const row of data.rows) {
    if (!row || !['string', 'number'].includes(typeof row.id)
      || ![row.created_at, row.usuario, row.acao, row.entidade, row.resumo].every(value => typeof value === 'string')
      || !/(Z|[+-]\d{2}:\d{2})$/i.test(row.created_at) || !Number.isFinite(Date.parse(row.created_at))
      || ids.has(String(row.id))) continue
    const id = String(row.id)
    ids.add(id)
    rows.push({ id, created_at: row.created_at, usuario: row.usuario, acao: row.acao,
      entidade: row.entidade, resumo: row.resumo,
      detalhes_mascarados: typeof row.detalhes_mascarados === 'string' ? row.detalhes_mascarados : undefined })
  }
  if (data.rows.length && !rows.length) throw new Error('Nenhum registro válido na resposta.')
  return { rows, total: data.total, received: data.rows.length, partial: rows.length !== data.rows.length || ('partial' in data && data.partial === true) }
}
