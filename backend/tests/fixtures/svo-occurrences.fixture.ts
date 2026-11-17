import type { Pool } from 'pg'
import type { CreateSvoOccurrenceInput, SvoStatus } from '../../src/types/svo-occurrence.types'

/** Sentinelas distintas e inteiramente fictícias permitem detectar vazamento entre projeções. */
export function svoInput(): CreateSvoOccurrenceInput {
  return {
    requesterName: 'Solicitante Fictício SENTINELA_NOME',
    requesterPhone: '00000000000_SENTINELA_TELEFONE',
    requesterType: 'FAMILY', location: 'Local Fictício SENTINELA_LOCAL',
    description: 'Descrição fictícia SENTINELA_DESCRICAO',
    notes: 'Observação fictícia SENTINELA_NOTAS',
    evidenceDescription: 'Telefone fictício SENTINELA_EVIDENCIA',
  }
}

/** Legado persistível: sem evento RECEIVED nem snapshot, preservando todas as constraints. */
export async function insertLegacySvo(pool: Pool, actorId: string, status: SvoStatus = 'PENDING', receivedAt = '2020-01-04T02:15:00-03:00'): Promise<string> {
  const input = svoInput()
  const result = await pool.query<{ id: string }>(
    `INSERT INTO svo.occurrences
       (attendant_id, requester_name, requester_phone, requester_type, location, description,
        status, received_at, cancellation_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id::text AS id`,
    [actorId, input.requesterName, input.requesterPhone, input.requesterType, input.location,
      input.description, status, receivedAt, status === 'CANCELED' ? 'Cancelamento fictício QA.' : null],
  )
  return result.rows[0]!.id
}
