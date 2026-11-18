import type { Pool } from 'pg'
import type {
  DashboardPeriod,
  DashboardSummaryCounts,
  DashboardSvoIndicators,
  DashboardSvoSummary,
  VehicleIndicatorsRow,
} from '../types/dashboard.types'

/** Contrato de leitura do dashboard, usado pelo service e por testes isolados. */
export interface DashboardRepositoryContract {
  summary(alertDays: number): Promise<DashboardSummaryCounts>
  svoSummary(): Promise<DashboardSvoSummary>
  vehicleIndicators(period: DashboardPeriod, vehicleId: string | null): Promise<VehicleIndicatorsRow[]>
  svoIndicators(period: DashboardPeriod, vehicleId: string | null): Promise<DashboardSvoIndicators>
  vehicleExists(vehicleId: string): Promise<boolean>
}

/**
 * Agregações do dashboard calculadas no PostgreSQL (definição em `docs/manuais/indicadores-dashboard.md`).
 *
 * O período chega como datas civis de Aracaju e vira o intervalo semiaberto `[from, to)` em `timestamptz`,
 * mantendo os filtros sargáveis sobre os índices de período.
 */
export class DashboardRepository implements DashboardRepositoryContract {
  constructor(private readonly pool: Pool) {}

  /** Retrato atual: frota por situação, pendências e documentos vigentes a vencer ou vencidos. */
  async summary(alertDays: number): Promise<DashboardSummaryCounts> {
    const result = await this.pool.query<DashboardSummaryCounts>(
      `SELECT (SELECT json_build_object(
                 'available', count(*) FILTER (WHERE status = 'AVAILABLE'),
                 'inMaintenance', count(*) FILTER (WHERE status = 'IN_MAINTENANCE'),
                 'inactive', count(*) FILTER (WHERE status = 'INACTIVE'),
                 'total', count(*))
                 FROM fleet.vehicles) AS fleet,
              (SELECT count(*)::int FROM trip.requests WHERE status = 'PENDING') AS "pendingRequests",
              (SELECT count(*)::int FROM trip.trips WHERE status = 'FINISHED') AS "tripsToConfirm",
              (SELECT json_build_object(
                 'expiring', count(*) FILTER (WHERE d.expires_at >= c.today AND d.expires_at <= c.today + $1::int),
                 'expired', count(*) FILTER (WHERE d.expires_at < c.today))
                 FROM fleet.vehicle_documents d
                 CROSS JOIN (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Maceio')::date AS today) c
                WHERE NOT d.is_annulled
                  AND NOT EXISTS (SELECT 1 FROM fleet.vehicle_documents n WHERE n.supersedes_id = d.id AND NOT n.is_annulled)
              ) AS documents`,
      [alertDays],
    )
    const row = result.rows[0]
    if (!row) throw new Error('O resumo do dashboard não retornou dados.')
    return row
  }

  /** Situação atual do SVO: ordens em andamento e ocupação dos veículos SVO não inativos. */
  async svoSummary(): Promise<DashboardSvoSummary> {
    const result = await this.pool.query<{ ordersInProgress: number; total: number; busy: number; occupancyRate: number | null }>(
      `WITH active_orders AS (
         SELECT o.vehicle_id
           FROM svo.execution_orders o
          WHERE o.status IN ('OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS')
       ), svo_vehicles AS (
         SELECT v.id FROM fleet.vehicles v WHERE v.operation_type = 'SVO' AND v.status <> 'INACTIVE'
       ), counts AS (
         SELECT (SELECT count(*)::int FROM active_orders) AS orders_in_progress,
                (SELECT count(*)::int FROM svo_vehicles) AS total,
                (SELECT count(DISTINCT a.vehicle_id)::int FROM active_orders a JOIN svo_vehicles s ON s.id = a.vehicle_id) AS busy
       )
       SELECT orders_in_progress AS "ordersInProgress", total, busy,
              CASE WHEN total > 0 THEN ROUND(100.0 * busy / total, 1)::float8 END AS "occupancyRate"
         FROM counts`,
    )
    const row = result.rows[0]
    if (!row) throw new Error('O resumo do SVO não retornou dados.')
    return { ordersInProgress: row.ordersInProgress, vehicles: { total: row.total, busy: row.busy, occupancyRate: row.occupancyRate } }
  }

  /**
   * Uso e custo por veículo no período, com os totais do período calculados por janela na mesma consulta.
   *
   * Viagens `FINISHED`/`CONFIRMED` pelo término; abastecimentos vigentes (não anulados nem retificados);
   * manutenções `DONE` pelo fechamento. Veículos inativos só aparecem se tiveram movimento no período.
   */
  async vehicleIndicators(period: DashboardPeriod, vehicleId: string | null): Promise<VehicleIndicatorsRow[]> {
    const result = await this.pool.query<VehicleIndicatorsRow>(
      `WITH bounds AS (
         SELECT ($1::date::timestamp AT TIME ZONE 'America/Maceio') AS start_at,
                ($2::date::timestamp AT TIME ZONE 'America/Maceio') AS end_at
       ), trips AS (
         SELECT t.vehicle_id, count(*)::int AS trips_count, COALESCE(sum(t.end_km - t.start_km), 0)::bigint AS km
           FROM trip.trips t CROSS JOIN bounds b
          WHERE t.status IN ('FINISHED', 'CONFIRMED')
            AND t.finished_at >= b.start_at AND t.finished_at < b.end_at
            AND ($3::bigint IS NULL OR t.vehicle_id = $3)
          GROUP BY t.vehicle_id
       ), fuel AS (
         SELECT f.vehicle_id, sum(f.liters) AS liters, sum(f.total_value) AS cost
           FROM fleet.fuelings f CROSS JOIN bounds b
          WHERE NOT f.is_annulled
            AND NOT EXISTS (SELECT 1 FROM fleet.fuelings n WHERE n.supersedes_id = f.id)
            AND f.fueled_at >= b.start_at AND f.fueled_at < b.end_at
            AND ($3::bigint IS NULL OR f.vehicle_id = $3)
          GROUP BY f.vehicle_id
       ), maintenance AS (
         SELECT m.vehicle_id, sum(m.cost) AS cost
           FROM fleet.maintenance_orders m CROSS JOIN bounds b
          WHERE m.status = 'DONE' AND m.cost IS NOT NULL
            AND m.closed_at >= b.start_at AND m.closed_at < b.end_at
            AND ($3::bigint IS NULL OR m.vehicle_id = $3)
          GROUP BY m.vehicle_id
       ), per_vehicle AS (
         SELECT v.id, v.license_plate,
                COALESCE(t.trips_count, 0) AS trips_count, COALESCE(t.km, 0) AS km,
                COALESCE(fu.liters, 0) AS liters, COALESCE(fu.cost, 0) AS fuel_cost,
                COALESCE(m.cost, 0) AS maintenance_cost
           FROM fleet.vehicles v
           LEFT JOIN trips t ON t.vehicle_id = v.id
           LEFT JOIN fuel fu ON fu.vehicle_id = v.id
           LEFT JOIN maintenance m ON m.vehicle_id = v.id
          WHERE ($3::bigint IS NULL OR v.id = $3)
            AND (v.status <> 'INACTIVE' OR t.vehicle_id IS NOT NULL OR fu.vehicle_id IS NOT NULL OR m.vehicle_id IS NOT NULL)
       )
       SELECT id::text AS "vehicleId", license_plate AS "licensePlate",
              trips_count AS "tripsCount", km::float8 AS "kmDriven", liters::float8 AS "litersFueled",
              ROUND(fuel_cost, 2)::float8 AS "fuelCost",
              CASE WHEN km > 0 AND liters > 0 THEN ROUND(km / liters, 2)::float8 END AS "averageConsumptionKmPerLiter",
              ROUND(maintenance_cost, 2)::float8 AS "maintenanceCost",
              json_build_object(
                'tripsCount', (sum(trips_count) OVER ())::int,
                'kmDriven', (sum(km) OVER ())::float8,
                'litersFueled', (sum(liters) OVER ())::float8,
                'fuelCost', ROUND(sum(fuel_cost) OVER (), 2)::float8,
                'averageConsumptionKmPerLiter',
                  CASE WHEN sum(km) OVER () > 0 AND sum(liters) OVER () > 0
                       THEN ROUND((sum(km) OVER ()) / (sum(liters) OVER ()), 2)::float8 END,
                'maintenanceCost', ROUND(sum(maintenance_cost) OVER (), 2)::float8
              ) AS totals
         FROM per_vehicle
        ORDER BY license_plate ASC, id ASC`,
      [period.from, period.to, vehicleId],
    )
    return result.rows
  }

  /** Ordens SVO abertas no período e tempo médio, em minutos, do recebimento do chamado até a coleta. */
  async svoIndicators(period: DashboardPeriod, vehicleId: string | null): Promise<DashboardSvoIndicators> {
    const result = await this.pool.query<DashboardSvoIndicators>(
      `WITH bounds AS (
         SELECT ($1::date::timestamp AT TIME ZONE 'America/Maceio') AS start_at,
                ($2::date::timestamp AT TIME ZONE 'America/Maceio') AS end_at
       )
       SELECT count(*)::int AS "ordersOpened",
              count(o.collected_at)::int AS "ordersCollected",
              ROUND(avg(EXTRACT(EPOCH FROM (o.collected_at - oc.received_at)) / 60)
                      FILTER (WHERE o.collected_at IS NOT NULL), 1)::float8 AS "averageMinutesToCollection"
         FROM svo.execution_orders o
         JOIN svo.occurrences oc ON oc.id = o.occurrence_id
        CROSS JOIN bounds b
        WHERE o.opened_at >= b.start_at AND o.opened_at < b.end_at
          AND ($3::bigint IS NULL OR o.vehicle_id = $3)`,
      [period.from, period.to, vehicleId],
    )
    const row = result.rows[0]
    if (!row) throw new Error('Os indicadores do SVO não retornaram dados.')
    return row
  }

  async vehicleExists(vehicleId: string): Promise<boolean> {
    const result = await this.pool.query('SELECT 1 FROM fleet.vehicles WHERE id = $1', [vehicleId])
    return (result.rowCount ?? 0) > 0
  }
}
