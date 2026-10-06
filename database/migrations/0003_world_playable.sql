-- Phase 2 playable world catalog and server-authoritative player location state.
CREATE TABLE IF NOT EXISTS world_districts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES world_regions(id),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  map_x numeric(6,2) NOT NULL DEFAULT 50,
  map_y numeric(6,2) NOT NULL DEFAULT 50,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS world_districts_region_idx ON world_districts(region_id, is_active, sort_order);

ALTER TABLE locations ADD COLUMN IF NOT EXISTS district_id uuid;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS coordinates jsonb NOT NULL DEFAULT '{"x":50,"y":50}'::jsonb;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS opening_status text NOT NULL DEFAULT 'open';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS activities jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS interaction_points jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE player_locations ADD COLUMN IF NOT EXISTS last_sequence bigint NOT NULL DEFAULT 0;
ALTER TABLE player_locations ADD COLUMN IF NOT EXISTS is_inside boolean NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_district_fk') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_district_fk FOREIGN KEY (district_id) REFERENCES world_districts(id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'locations_opening_status_check') THEN
    ALTER TABLE locations ADD CONSTRAINT locations_opening_status_check CHECK (opening_status IN ('open', 'closed', 'seasonal'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS locations_playable_idx ON locations(district_id, is_active, opening_status);
CREATE INDEX IF NOT EXISTS player_locations_presence_idx ON player_locations(location_id, updated_at DESC);
