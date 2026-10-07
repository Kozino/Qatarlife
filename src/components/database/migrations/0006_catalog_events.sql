-- Adds a stable key for typed, recurring event catalog entries.
-- Player-created events keep catalog_key NULL and are never touched by bootstrap.
ALTER TABLE events ADD COLUMN IF NOT EXISTS catalog_key text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_catalog_key_unique'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_catalog_key_unique UNIQUE (catalog_key);
  END IF;
END $$;
