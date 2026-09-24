-- Additive completion of diagnostic order-item and appointment persistence.
CREATE TABLE diagnostic_order_items (
  order_item_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES diagnostic_orders(order_id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES facility_diagnostic_services(service_id),
  service_request jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(order_id,service_id)
);
INSERT INTO diagnostic_order_items(order_id,service_id,service_request)
SELECT order_id,service_id,service_request FROM diagnostic_orders
ON CONFLICT(order_id,service_id) DO NOTHING;

CREATE TABLE diagnostic_appointments (
  appointment_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES diagnostic_orders(order_id) ON DELETE CASCADE,
  facility_id uuid NOT NULL REFERENCES facilities(facility_id),
  scheduled_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'SCHEDULED' CHECK(status IN ('SCHEDULED','ARRIVED','MISSED','CANCELLED')),
  note text CHECK(note IS NULL OR length(note)<=500),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TRIGGER diagnostic_appointments_updated BEFORE UPDATE ON diagnostic_appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE diagnostic_appointment_events (
  appointment_event_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id uuid NOT NULL REFERENCES diagnostic_appointments(appointment_id) ON DELETE CASCADE,
  from_status text,
  to_status text NOT NULL,
  actor_practitioner_id uuid NOT NULL REFERENCES practitioners(practitioner_id),
  note text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX diagnostic_appointment_events_idx ON diagnostic_appointment_events(appointment_id,occurred_at);
