CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TYPE app_role AS ENUM ('admin','staff','viewer');
CREATE TYPE shipment_status AS ENUM ('Pending','On Track','At Risk','Delayed','Delivered','Cancelled');
CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entra_oid text UNIQUE NOT NULL,
  email text NOT NULL,
  display_name text NOT NULL,
  role app_role NOT NULL DEFAULT 'viewer',
  password_hash text,
  requested_role app_role,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE shipments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_number text UNIQUE NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  recipient text NOT NULL,
  carrier text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('FTL','LTL','Air')),
  eta text NOT NULL,
  status shipment_status NOT NULL DEFAULT 'Pending',
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX shipments_status_idx ON shipments(status);
CREATE INDEX shipments_created_at_idx ON shipments(created_at DESC);
CREATE TABLE shipment_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_weight numeric(12,3) NOT NULL CHECK (unit_weight >= 0),
  declared_value numeric(14,2) NOT NULL DEFAULT 0 CHECK (declared_value >= 0)
);
CREATE INDEX shipment_items_sku_idx ON shipment_items(sku);
COMMENT ON COLUMN shipment_items.unit_weight IS 'Kilograms per unit';
CREATE TABLE tracking_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shipment_id uuid NOT NULL REFERENCES shipments(id) ON DELETE CASCADE,
  status shipment_status NOT NULL,
  location text,
  description text NOT NULL,
  updated_by uuid REFERENCES users(id) ON DELETE SET NULL,
  actor_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX tracking_events_shipment_idx ON tracking_events(shipment_id,created_at);
