import type { AuditLogsRepository } from '../repositories/audit-logs.repository'

export class InvalidAuditFilter extends Error {}

function optionalText(value: unknown, label: string): string | null {
  if (value === undefined || value === '') return null
  if (typeof value !== 'string' || value.length > 128 || /[\u0000-\u001f]/.test(value)) {
    throw new InvalidAuditFilter(`Filtro inválido: ${label}.`)
  }
  return value.trim() || null
}

function date(value: unknown, label: string): string | null {
  const text = optionalText(value, label)
  if (!text) return null
  const parsed = new Date(text + 'T00:00:00Z')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text) || text.startsWith('0000') ||
    !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== text) {
    throw new InvalidAuditFilter(`Informe uma data válida para ${label} (AAAA-MM-DD).`)
  }
  return text
}

/** Valida filtros do painel e produz detalhes seguros sem reutilizar texto livre dos snapshots. */
export class AuditLogsService {
  constructor(private readonly repository: Pick<AuditLogsRepository, 'list'>) {}

  async list(query: Record<string, unknown>) {
    const inicio = date(query.inicio, 'data inicial')
    const fim = date(query.fim, 'data final')
    if (inicio && fim && inicio > fim) throw new InvalidAuditFilter('A data final deve ser igual ou posterior à inicial.')
    const usuario_id = optionalText(query.usuario_id, 'usuário')
    if (usuario_id && (!/^[1-9]\d{0,18}$/.test(usuario_id) || BigInt(usuario_id) > 9223372036854775807n)) {
      throw new InvalidAuditFilter('Informe um ID de usuário válido.')
    }
    const page = optionalText(query.page, 'página') ?? '1'
    if (!/^[1-9]\d{0,6}$/.test(page)) throw new InvalidAuditFilter('Informe uma página válida.')
    const acao = optionalText(query.acao, 'ação')?.toUpperCase() ?? null
    const entidade = optionalText(query.entidade, 'entidade')?.toLowerCase() ?? null
    const result = await this.repository.list({ inicio, fim, usuario_id, acao, entidade, offset: Number(page) - 1 })
    return { total: result.total, rows: result.rows.map(row => ({
      ...row,
      resumo: `${row.acao} em ${row.entidade}`,
      detalhes_mascarados: 'Identificador do alvo, valores anteriores e posteriores e justificativa: ***.',
    })) }
  }
}
