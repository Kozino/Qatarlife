-- Phase 4–7 integrity hardening for already-provisioned PostgreSQL/Supabase databases.
-- This migration contains schema changes only; static catalog data remains in the
-- guarded TypeScript application bootstrap and player-generated data is untouched.
-- Idempotency belongs to the actor, not to the whole database. The old global
-- constraints could make two different players collide on the same client key.
ALTER TABLE wallet_transactions DROP CONSTRAINT IF EXISTS wallet_transactions_idempotency_key_key;
ALTER TABLE work_sessions DROP CONSTRAINT IF EXISTS work_sessions_idempotency_key_key;
ALTER TABLE player_activity_completions DROP CONSTRAINT IF EXISTS player_activity_completions_idempotency_key_key;
ALTER TABLE marketplace_orders DROP CONSTRAINT IF EXISTS marketplace_orders_idempotency_key_key;

ALTER TABLE business_orders ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Preserve the first idempotency key from the pre-column metadata shape. If old
-- data contains a duplicate key, suffix later historical rows rather than
-- blocking the migration or changing the first retry result.
WITH legacy AS (
  SELECT id, metadata->>'idempotencyKey' AS legacy_key,
         row_number() OVER (
           PARTITION BY buyer_user_id, metadata->>'idempotencyKey'
           ORDER BY created_at, id
         ) AS occurrence
  FROM business_orders
  WHERE idempotency_key IS NULL
    AND metadata ? 'idempotencyKey'
)
UPDATE business_orders orders
SET idempotency_key = CASE
  WHEN legacy.occurrence = 1 THEN legacy.legacy_key
  ELSE legacy.legacy_key || ':legacy:' || legacy.occurrence::text
END
FROM legacy
WHERE orders.id = legacy.id;

CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_user_idempotency_uidx
  ON wallet_transactions(wallet_user_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_user_idempotency_uidx
  ON work_sessions(user_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS player_activity_user_idempotency_uidx
  ON player_activity_completions(user_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_buyer_idempotency_uidx
  ON marketplace_orders(buyer_user_id, idempotency_key);
CREATE UNIQUE INDEX IF NOT EXISTS business_orders_buyer_idempotency_uidx
  ON business_orders(buyer_user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- These indexes make the server-side access patterns and uniqueness rules
-- explicit for installations that were migrated from an earlier snapshot.
CREATE UNIQUE INDEX IF NOT EXISTS products_shop_name_uidx
  ON products(shop_id, name);
CREATE INDEX IF NOT EXISTS friends_reverse_idx
  ON friends(friend_user_id, user_id);
CREATE INDEX IF NOT EXISTS relationships_block_idx
  ON relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS events_schedule_idx
  ON events(status, start_at);
CREATE UNIQUE INDEX IF NOT EXISTS chat_rooms_location_uidx
  ON chat_rooms(location_id)
  WHERE room_type = 'location' AND location_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS advertisements_active_idx
  ON advertisements(status, start_at, end_at);
CREATE INDEX IF NOT EXISTS player_jobs_current_idx
  ON player_jobs(user_id, is_current);
CREATE INDEX IF NOT EXISTS business_order_items_order_idx
  ON business_order_items(order_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'wallet_transaction_reference_check'
  ) THEN
    ALTER TABLE wallet_transactions
      ADD CONSTRAINT wallet_transaction_reference_check
      CHECK (reference_type IS NULL OR reference_id IS NOT NULL);
  END IF;
END $$;

