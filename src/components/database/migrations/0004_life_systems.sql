-- Qatar Life Phase 3–7 runtime systems.
-- This migration creates structures only. Runtime catalog rows are provisioned by
-- the typed application bootstrap; there are intentionally no seed files.

CREATE TABLE IF NOT EXISTS activity_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  location_id uuid REFERENCES locations(id),
  energy_cost integer NOT NULL DEFAULT 0 CHECK (energy_cost >= 0),
  experience_reward integer NOT NULL DEFAULT 0 CHECK (experience_reward >= 0),
  reward_minor bigint NOT NULL DEFAULT 0 CHECK (reward_minor >= 0),
  cooldown_seconds integer NOT NULL DEFAULT 0 CHECK (cooldown_seconds >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_catalog_location_idx ON activity_catalog(location_id, is_active);

CREATE TABLE IF NOT EXISTS player_activity_completions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  activity_id uuid NOT NULL REFERENCES activity_catalog(id) ON DELETE CASCADE,
  completed_at timestamptz NOT NULL DEFAULT now(),
  reward_transaction_id uuid,
  idempotency_key text NOT NULL UNIQUE
);
CREATE INDEX IF NOT EXISTS player_activity_user_idx ON player_activity_completions(user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS business_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES business_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES business_products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_order_items_order_idx ON business_order_items(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS products_shop_name_uidx ON products(shop_id, name);

CREATE TABLE IF NOT EXISTS marketplace_listings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id),
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  quantity integer NOT NULL CHECK (quantity > 0),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'sold', 'cancelled')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_listings_active_idx ON marketplace_listings(status, created_at DESC);

CREATE TABLE IF NOT EXISTS marketplace_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  listing_id uuid NOT NULL REFERENCES marketplace_listings(id),
  buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  seller_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  quantity integer NOT NULL CHECK (quantity > 0),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  status text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'fulfilled', 'cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_idx ON marketplace_orders(buyer_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS friends_reverse_idx ON friends(friend_user_id, user_id);
CREATE INDEX IF NOT EXISTS relationships_block_idx ON relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS events_schedule_idx ON events(status, start_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_rooms_location_uidx ON chat_rooms(location_id) WHERE room_type = 'location' AND location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS advertisements_active_idx ON advertisements(status, start_at, end_at);
CREATE INDEX IF NOT EXISTS player_jobs_current_idx ON player_jobs(user_id, is_current);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wallet_transaction_reference_check') THEN
    ALTER TABLE wallet_transactions ADD CONSTRAINT wallet_transaction_reference_check
      CHECK (reference_type IS NULL OR reference_id IS NOT NULL);
  END IF;
END $$;

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['activity_catalog','marketplace_listings','marketplace_orders','businesses','business_products','business_orders','player_jobs','wallets','products','shops','homes','player_achievements']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
  END LOOP;
END $$;
