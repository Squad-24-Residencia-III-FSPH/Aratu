import type { Pool } from 'pg'
import type {
  DashboardPeriod,
  DashboardActivityBucket,
  DashboardSummaryCounts,
  DashboardSvoIndicators,
  DashboardSvoSummary,
  VehicleIndicatorsRow,
} from '../types/dashboard.types'
import { CNH_ALERT_DAYS } from './reports/report-sql'

/** Contrato de leitura do dashboard, usado pelo service e por testes isolados. */
export interface DashboardRepositoryContract {
  summary(alertDays: number, vehicleId?: string | null): Promise<DashboardSummaryCounts>
  svoSummary(vehicleId?: string | null): Promise<DashboardSvoSummary>
  vehicleIndicators(period: DashboardPeriod, vehicleId: string | null): Promise<VehicleIndicatorsRow[]>
  activitySeries(period: DashboardPeriod, vehicleId: string | null, bucket: 'day' | 'month'): Promise<DashboardActivityBucket[]>
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

  /** Retrato atual de frota, motoristas, operações, multas e documentos. */
  async summary(alertDays: number, vehicleId: string | null = null): Promise<DashboardSummaryCounts> {
    const result = await this.pool.query<DashboardSummaryCounts>(
      `SELECT (SELECT json_build_object(
                 'available', count(*) FILTER (WHERE status = 'AVAILABLE'),
                 'inMaintenance', count(*) FILTER (WHERE status = 'IN_MAINTENANCE'),
                 'inactive', count(*) FILTER (WHERE status = 'INACTIVE'),
                 'total', count(*))
                 FROM fleet.vehicles WHERE ($3::bigint IS NULL OR id = $3)) AS fleet,
              (SELECT json_build_object(
                 'active', count(*) FILTER (WHERE status = 'ACTIVE'),
                 'away', count(*) FILTER (WHERE status = 'AWAY'),
                 'inactive', count(*) FILTER (WHERE status = 'INACTIVE'),
                 'total', count(*),
                 'cnhExpiring', count(*) FILTER (WHERE d.cnh_expires_at >= c.today AND d.cnh_expires_at <= c.today + $2::int),
                 'cnhExpired', count(*) FILTER (WHERE d.cnh_expires_at < c.today))
                 FROM fleet.drivers d
                 CROSS JOIN (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Maceio')::date AS today) c) AS drivers,
              (SELECT count(*)::int FROM trip.requests WHERE status = 'PENDING') AS "pendingRequests",
              (SELECT count(*)::int FROM trip.trips WHERE status = 'IN_PROGRESS' AND ($3::bigint IS NULL OR vehicle_id = $3)) AS "tripsInProgress",
              (SELECT count(DISTINCT vehicle_id)::int FROM trip.trips WHERE status = 'IN_PROGRESS' AND ($3::bigint IS NULL OR vehicle_id = $3)) AS "vehiclesInTrip",
              (SELECT count(*)::int FROM trip.trips WHERE status = 'FINISHED' AND ($3::bigint IS NULL OR vehicle_id = $3)) AS "tripsToConfirm",
              (SELECT json_build_object(
                 'pending', count(*) FILTER (WHERE status = 'PENDING'),
                 'paid', count(*) FILTER (WHERE status = 'PAID'),
                 'contested', count(*) FILTER (WHERE status = 'CONTESTED'))
                 FROM fleet.fines WHERE ($3::bigint IS NULL OR vehicle_id = $3)) AS fines,
              (SELECT json_build_object(
                 'expiring', count(*) FILTER (WHERE d.expires_at >= c.today AND d.expires_at <= c.today + $1::int),
                 'expired', count(*) FILTER (WHERE d.expires_at < c.today))
                 FROM fleet.vehicle_documents d
                 CROSS JOIN (SELECT (CURRENT_TIMESTAMP AT TIME ZONE 'America/Maceio')::date AS today) c
                WHERE ($3::bigint IS NULL OR d.vehicle_id = $3)
                  AND NOT d.is_annulled
                  AND NOT EXISTS (SELECT 1 FROM fleet.vehicle_documents n WHERE n.supersedes_id = d.id AND NOT n.is_annulled)
              ) AS documents`,
      [alertDays, CNH_ALERT_DAYS, vehicleId],
    )
    const row = result.rows[0]
    if (!row) throw new Error('O resumo do dashboard não retornou dados.')
    return row
  }

  /** Situação atual do SVO: ordens em andamento e ocupação dos veículos SVO não inativos. */
  async svoSummary(vehicleId: string | null = null): Promise<DashboardSvoSummary> {
    const result = await this.pool.query<{ ordersInProgress: number; total: number; busy: number; occupancyRate: number | null }>(
      `WITH active_orders AS (
         SELECT o.vehicle_id
           FROM svo.execution_orders o
          WHERE o.status IN ('OPEN', 'IN_TRANSIT', 'IN_SERVICE', 'IN_PROGRESS')
            AND ($1::bigint IS NULL OR o.vehicle_id = $1)
       ), svo_vehicles AS (
         SELECT v.id FROM fleet.vehicles v WHERE v.operation_type = 'SVO' AND v.status <> 'INACTIVE'
           AND ($1::bigint IS NULL OR v.id = $1)
       ), counts AS (
         SELECT (SELECT count(*)::int FROM active_orders) AS orders_in_progress,
                (SELECT count(*)::int FROM svo_vehicles) AS total,
                (SELECT count(DISTINCT a.vehicle_id)::int FROM active_orders a JOIN svo_vehicles s ON s.id = a.vehicle_id) AS busy
       )
       SELECT orders_in_progress AS "ordersInProgress", total, busy,
              CASE WHEN total > 0 THEN ROUND(100.0 * busy / total, 1)::float8 END AS "occupancyRate"
         FROM counts`,
      [vehicleId],
    )
    const row = result.rows[0]
    if (!row) throw new Error('O resumo do SVO não retornou dados.')
    return { ordersInProgress: row.ordersInProgress, vehicles: { total: row.total, busy: row.busy, occupancyRate: row.occupancyRate } }
  }

  /**
   * Uso e custo por veículo no período, com os totais do período calculados por janela na mesma consulta.
   *
   * Viagens `FINISHED`/`CONFIRMED` pelo término; abastecimentos vigentes (não anulados nem retificados);
   * ordens de manutenção por abertura e custo de manutenção `DONE` pelo fechamento. Veículos inativos só
   * aparecem se tiveram movimento ou ordem de manutenção no período.
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
       ), maintenance_opened AS (
         SELECT m.vehicle_id,
                count(*)::int AS orders_opened,
                count(*) FILTER (WHERE m.type = 'PREVENTIVE')::int AS preventive_orders_opened,
                count(*) FILTER (WHERE m.type = 'CORRECTIVE')::int AS corrective_orders_opened,
                count(DISTINCT m.vehicle_id) FILTER (WHERE m.type = 'CORRECTIVE')::int AS vehicles_with_corrective_maintenance
           FROM fleet.maintenance_orders m CROSS JOIN bounds b
          WHERE m.opened_at >= b.start_at AND m.opened_at < b.end_at
            AND ($3::bigint IS NULL OR m.vehicle_id = $3)
          GROUP BY m.vehicle_id
       ), maintenance_cost AS (
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
                COALESCE(mo.orders_opened, 0) AS maintenance_orders_opened,
                COALESCE(mo.preventive_orders_opened, 0) AS preventive_maintenance_orders_opened,
                COALESCE(mo.corrective_orders_opened, 0) AS corrective_maintenance_orders_opened,
                COALESCE(mo.vehicles_with_corrective_maintenance, 0) AS vehicles_with_corrective_maintenance,
                COALESCE(mc.cost, 0) AS maintenance_cost
           FROM fleet.vehicles v
           LEFT JOIN trips t ON t.vehicle_id = v.id
           LEFT JOIN fuel fu ON fu.vehicle_id = v.id
           LEFT JOIN maintenance_opened mo ON mo.vehicle_id = v.id
           LEFT JOIN maintenance_cost mc ON mc.vehicle_id = v.id
          WHERE ($3::bigint IS NULL OR v.id = $3)
            AND (v.status <> 'INACTIVE' OR t.vehicle_id IS NOT NULL OR fu.vehicle_id IS NOT NULL
                 OR mo.vehicle_id IS NOT NULL OR mc.vehicle_id IS NOT NULL)
       )
       SELECT id::text AS "vehicleId", license_plate AS "licensePlate",
              trips_count AS "tripsCount", km::float8 AS "kmDriven", liters::float8 AS "litersFueled",
              ROUND(fuel_cost, 2)::float8 AS "fuelCost",
              maintenance_orders_opened AS "maintenanceOrdersOpened",
              preventive_maintenance_orders_opened AS "preventiveMaintenanceOrdersOpened",
              corrective_maintenance_orders_opened AS "correctiveMaintenanceOrdersOpened",
              vehicles_with_corrective_maintenance AS "vehiclesWithCorrectiveMaintenance",
              CASE WHEN km > 0 AND liters > 0 THEN ROUND(km / liters, 2)::float8 END AS "averageConsumptionKmPerLiter",
              ROUND(maintenance_cost, 2)::float8 AS "maintenanceCost",
              json_build_object(
                'tripsCount', (sum(trips_count) OVER ())::int,
                'kmDriven', (sum(km) OVER ())::float8,
                'litersFueled', (sum(liters) OVER ())::float8,
                'fuelCost', ROUND(sum(fuel_cost) OVER (), 2)::float8,
                'maintenanceOrdersOpened', (sum(maintenance_orders_opened) OVER ())::int,
                'preventiveMaintenanceOrdersOpened', (sum(preventive_maintenance_orders_opened) OVER ())::int,
                'correctiveMaintenanceOrdersOpened', (sum(corrective_maintenance_orders_opened) OVER ())::int,
                'vehiclesWithCorrectiveMaintenance', (sum(vehicles_with_corrective_maintenance) OVER ())::int,
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

  /** Séries reais de viagens concluídas e gastos vigentes com combustível no período. */
  async activitySeries(period: DashboardPeriod, vehicleId: string | null, bucket: 'day' | 'month'): Promise<DashboardActivityBucket[]> {
    const result = await this.pool.query<DashboardActivityBucket>(
      `WITH bounds AS (
         SELECT ($1::date::timestamp AT TIME ZONE 'America/Maceio') AS start_at,
                ($2::date::timestamp AT TIME ZONE 'America/Maceio') AS end_at,
                $4::text AS bucket_type
       ), calendar AS (
         SELECT generate_series(
                  date_trunc(b.bucket_type, b.start_at AT TIME ZONE 'America/Maceio'),
                  date_trunc(b.bucket_type, (b.end_at - interval '1 microsecond') AT TIME ZONE 'America/Maceio'),
                  CASE WHEN b.bucket_type = 'day' THEN interval '1 day' ELSE interval '1 month' END
                )::date AS bucket
           FROM bounds b
       ), trips AS (
         SELECT date_trunc($4, t.finished_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                count(*)::int AS trips_count
           FROM trip.trips t CROSS JOIN bounds b
          WHERE t.status IN ('FINISHED', 'CONFIRMED')
            AND t.finished_at >= b.start_at AND t.finished_at < b.end_at
            AND ($3::bigint IS NULL OR t.vehicle_id = $3)
          GROUP BY bucket
       ), fuel AS (
         SELECT date_trunc($4, f.fueled_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                sum(f.total_value) AS cost
           FROM fleet.fuelings f CROSS JOIN bounds b
          WHERE NOT f.is_annulled
            AND NOT EXISTS (SELECT 1 FROM fleet.fuelings n WHERE n.supersedes_id = f.id)
            AND f.fueled_at >= b.start_at AND f.fueled_at < b.end_at
            AND ($3::bigint IS NULL OR f.vehicle_id = $3)
          GROUP BY bucket
       ), maintenance AS (
         SELECT date_trunc($4, e.occurred_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                count(*) FILTER (WHERE e.event_type = 'OPENED')::int AS opened,
                count(*) FILTER (WHERE e.event_type = 'CLOSED')::int AS closed
           FROM fleet.maintenance_order_events e
           JOIN fleet.maintenance_orders m ON m.id = e.maintenance_order_id
           CROSS JOIN bounds b
          WHERE e.event_type IN ('OPENED', 'CLOSED') AND NOT e.is_annulled
            AND NOT EXISTS (SELECT 1 FROM fleet.maintenance_order_events n WHERE n.supersedes_id = e.id)
            AND e.occurred_at >= b.start_at AND e.occurred_at < b.end_at
            AND ($3::bigint IS NULL OR m.vehicle_id = $3)
          GROUP BY bucket
       ), requests AS (
         SELECT date_trunc($4, e.occurred_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                count(*) FILTER (WHERE e.event_type = 'CREATED')::int AS created,
                count(*) FILTER (WHERE e.event_type = 'APPROVED')::int AS approved,
                count(*) FILTER (WHERE e.event_type = 'REJECTED')::int AS rejected,
                count(*) FILTER (WHERE e.event_type = 'SCHEDULED')::int AS scheduled,
                count(*) FILTER (WHERE e.event_type = 'CANCELED')::int AS canceled
           FROM trip.request_events e CROSS JOIN bounds b
          WHERE e.event_type IN ('CREATED', 'APPROVED', 'REJECTED', 'SCHEDULED', 'CANCELED')
            AND NOT e.is_annulled
            AND NOT EXISTS (SELECT 1 FROM trip.request_events n WHERE n.supersedes_id = e.id)
            AND e.occurred_at >= b.start_at AND e.occurred_at < b.end_at
            AND ($3::bigint IS NULL OR EXISTS (
              SELECT 1 FROM trip.trips t WHERE t.request_id = e.request_id AND t.vehicle_id = $3
            ))
          GROUP BY bucket
       ), fines AS (
         SELECT date_trunc($4, e.occurred_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                count(*) FILTER (WHERE e.event_type = 'REGISTERED')::int AS registered,
                count(*) FILTER (WHERE e.event_type = 'PAID')::int AS paid,
                count(*) FILTER (WHERE e.event_type = 'CONTESTED')::int AS contested
           FROM fleet.fine_events e
           JOIN fleet.fines f ON f.id = e.fine_id
           CROSS JOIN bounds b
          WHERE e.event_type IN ('REGISTERED', 'PAID', 'CONTESTED')
            AND NOT e.is_annulled
            AND NOT EXISTS (SELECT 1 FROM fleet.fine_events n WHERE n.supersedes_id = e.id)
            AND e.occurred_at >= b.start_at AND e.occurred_at < b.end_at
            AND ($3::bigint IS NULL OR f.vehicle_id = $3)
          GROUP BY bucket
       ), drivers AS (
         SELECT date_trunc($4, e.occurred_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                count(*) FILTER (WHERE e.event_type = 'CREATED')::int AS created,
                count(*) FILTER (WHERE e.event_type = 'STATUS_CHANGED')::int AS status_changed
           FROM fleet.driver_events e CROSS JOIN bounds b
          WHERE e.event_type IN ('CREATED', 'STATUS_CHANGED')
            AND NOT e.is_annulled
            AND NOT EXISTS (SELECT 1 FROM fleet.driver_events n WHERE n.supersedes_id = e.id)
            AND e.occurred_at >= b.start_at AND e.occurred_at < b.end_at
          GROUP BY bucket
       ), documents AS (
         SELECT date_trunc($4, e.occurred_at AT TIME ZONE 'America/Maceio')::date AS bucket,
                count(*) FILTER (WHERE e.event_type = 'REGISTERED')::int AS registered,
                count(*) FILTER (WHERE e.event_type = 'RENEWED')::int AS renewed
           FROM fleet.vehicle_document_events e
           JOIN fleet.vehicle_documents d ON d.id = e.vehicle_document_id
           CROSS JOIN bounds b
          WHERE e.event_type IN ('REGISTERED', 'RENEWED') AND NOT e.is_annulled
            AND NOT EXISTS (SELECT 1 FROM fleet.vehicle_document_events n WHERE n.supersedes_id = e.id)
            AND e.occurred_at >= b.start_at AND e.occurred_at < b.end_at
            AND ($3::bigint IS NULL OR d.vehicle_id = $3)
          GROUP BY bucket
       )
       SELECT to_char(c.bucket, 'YYYY-MM-DD') AS period,
              COALESCE(t.trips_count, 0)::int AS "tripsCount",
              ROUND(COALESCE(f.cost, 0), 2)::float8 AS "fuelCost",
              COALESCE(m.opened, 0)::int AS "maintenanceOpened",
              COALESCE(m.closed, 0)::int AS "maintenanceClosed",
              COALESCE(r.created, 0)::int AS "requestsCreated",
              COALESCE(r.approved, 0)::int AS "requestsApproved",
              COALESCE(r.rejected, 0)::int AS "requestsRejected",
              COALESCE(r.scheduled, 0)::int AS "requestsScheduled",
              COALESCE(r.canceled, 0)::int AS "requestsCanceled",
              COALESCE(fn.registered, 0)::int AS "finesRegistered",
              COALESCE(fn.paid, 0)::int AS "finesPaid",
              COALESCE(fn.contested, 0)::int AS "finesContested",
              COALESCE(d.created, 0)::int AS "driversCreated",
              COALESCE(d.status_changed, 0)::int AS "driversStatusChanged",
              COALESCE(doc.registered, 0)::int AS "documentsRegistered",
              COALESCE(doc.renewed, 0)::int AS "documentsRenewed"
         FROM calendar c
         LEFT JOIN trips t USING (bucket)
         LEFT JOIN fuel f USING (bucket)
         LEFT JOIN maintenance m USING (bucket)
         LEFT JOIN requests r USING (bucket)
         LEFT JOIN fines fn USING (bucket)
         LEFT JOIN drivers d USING (bucket)
         LEFT JOIN documents doc USING (bucket)
        ORDER BY c.bucket`,
      [period.from, period.to, vehicleId, bucket],
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
