BEGIN;
CREATE INDEX IF NOT EXISTS fleet_fuelings_by_fueled_at ON fleet.fuelings (fueled_at DESC, id DESC) WHERE NOT is_annulled;
CREATE INDEX IF NOT EXISTS fleet_fines_by_infraction_at ON fleet.fines (infraction_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS fleet_maintenance_orders_by_opened_at ON fleet.maintenance_orders (opened_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS trip_requests_by_requested_date ON trip.requests (requested_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS trip_trips_by_scheduled_start ON trip.trips (scheduled_start DESC, id DESC);
CREATE INDEX IF NOT EXISTS fleet_drivers_by_cnh_expires_at ON fleet.drivers (cnh_expires_at ASC, id ASC);
COMMIT;
