-- Qatar Life PostgreSQL schema
-- All game systems are fictional. Money is integer minor units of Virtual QAR.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  password_hash text NOT NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'pending_deletion', 'deleted')),
  email_verified_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS users_email_lower_uidx ON users (lower(email));

CREATE TABLE IF NOT EXISTS sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS sessions_active_idx ON sessions(token_hash) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_active_idx ON password_reset_tokens(token_hash, expires_at) WHERE used_at IS NULL;

CREATE TABLE IF NOT EXISTS world_regions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  map_asset_key text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

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

CREATE TABLE IF NOT EXISTS locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  region_id uuid NOT NULL REFERENCES world_regions(id),
  district_id uuid,
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  location_type text NOT NULL DEFAULT 'district',
  activity_tags jsonb NOT NULL DEFAULT '[]'::jsonb,
  activities jsonb NOT NULL DEFAULT '[]'::jsonb,
  coordinates jsonb NOT NULL DEFAULT '{"x":50,"y":50}'::jsonb,
  opening_status text NOT NULL DEFAULT 'open',
  interaction_points jsonb NOT NULL DEFAULT '[]'::jsonb,
  map_x numeric(8,3),
  map_y numeric(8,3),
  capacity integer NOT NULL DEFAULT 250 CHECK (capacity > 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT locations_district_fk FOREIGN KEY (district_id) REFERENCES world_districts(id),
  CONSTRAINT locations_opening_status_check CHECK (opening_status IN ('open', 'closed', 'seasonal'))
);
CREATE INDEX IF NOT EXISTS locations_region_idx ON locations(region_id, is_active);
CREATE INDEX IF NOT EXISTS locations_playable_idx ON locations(district_id, is_active, opening_status);

CREATE TABLE IF NOT EXISTS profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text,
  bio text NOT NULL DEFAULT '',
  locale text NOT NULL DEFAULT 'en',
  starting_region_id uuid REFERENCES world_regions(id),
  onboarding_complete boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (display_name IS NULL OR char_length(display_name) BETWEEN 2 AND 24)
);

CREATE TABLE IF NOT EXISTS avatars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  gender_presentation text NOT NULL DEFAULT 'unspecified',
  skin_tone text NOT NULL DEFAULT 'warm-sand',
  hairstyle text NOT NULL DEFAULT 'natural-short',
  hair_color text NOT NULL DEFAULT 'dark-brown',
  face_shape text NOT NULL DEFAULT 'soft-square',
  clothing_style text NOT NULL DEFAULT 'modern-casual',
  accessories jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS characters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  avatar_id uuid REFERENCES avatars(id) ON DELETE SET NULL,
  display_name text,
  level integer NOT NULL DEFAULT 1 CHECK (level > 0),
  experience integer NOT NULL DEFAULT 0 CHECK (experience >= 0),
  energy integer NOT NULL DEFAULT 100 CHECK (energy BETWEEN 0 AND 100),
  current_location_id uuid REFERENCES locations(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS player_locations (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES locations(id),
  x numeric(8,3) NOT NULL DEFAULT 0,
  y numeric(8,3) NOT NULL DEFAULT 0,
  last_validated_at timestamptz NOT NULL DEFAULT now(),
  last_sequence bigint NOT NULL DEFAULT 0,
  is_inside boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS player_locations_location_idx ON player_locations(location_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS player_locations_presence_idx ON player_locations(location_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS player_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES locations(id),
  started_at timestamptz NOT NULL DEFAULT now(),
  last_heartbeat_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  device_class text,
  ip_hash text
);
CREATE INDEX IF NOT EXISTS player_sessions_user_idx ON player_sessions(user_id, started_at DESC);
CREATE INDEX IF NOT EXISTS player_sessions_open_idx ON player_sessions(last_heartbeat_at) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  required_level integer NOT NULL DEFAULT 1 CHECK (required_level > 0),
  salary_minor bigint NOT NULL CHECK (salary_minor >= 0),
  work_duration_seconds integer NOT NULL CHECK (work_duration_seconds > 0),
  cooldown_seconds integer NOT NULL DEFAULT 0 CHECK (cooldown_seconds >= 0),
  energy_cost integer NOT NULL DEFAULT 0 CHECK (energy_cost >= 0),
  location_id uuid REFERENCES locations(id),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS job_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  level integer NOT NULL CHECK (level > 0),
  title text NOT NULL,
  salary_minor bigint NOT NULL CHECK (salary_minor >= 0),
  required_experience integer NOT NULL DEFAULT 0 CHECK (required_experience >= 0),
  UNIQUE(job_id, level)
);

CREATE TABLE IF NOT EXISTS player_jobs (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id),
  job_level integer NOT NULL DEFAULT 1 CHECK (job_level > 0),
  experience integer NOT NULL DEFAULT 0 CHECK (experience >= 0),
  hired_at timestamptz NOT NULL DEFAULT now(),
  is_current boolean NOT NULL DEFAULT true,
  PRIMARY KEY(user_id, job_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS player_jobs_one_current_idx ON player_jobs(user_id) WHERE is_current;

CREATE TABLE IF NOT EXISTS work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  job_id uuid NOT NULL REFERENCES jobs(id),
  job_level integer NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  energy_spent integer NOT NULL DEFAULT 0 CHECK (energy_spent >= 0),
  reward_transaction_id uuid,
  idempotency_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_user_idempotency_uidx ON work_sessions(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS work_sessions_user_idx ON work_sessions(user_id, started_at DESC);

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
  idempotency_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS player_activity_user_idempotency_uidx ON player_activity_completions(user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS player_activity_user_idx ON player_activity_completions(user_id, completed_at DESC);

CREATE TABLE IF NOT EXISTS wallets (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  currency text NOT NULL DEFAULT 'Virtual QAR',
  balance_minor bigint NOT NULL DEFAULT 0 CHECK (balance_minor >= 0),
  version bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_user_id uuid NOT NULL REFERENCES wallets(user_id) ON DELETE RESTRICT,
  direction text NOT NULL CHECK (direction IN ('credit', 'debit')),
  amount_minor bigint NOT NULL CHECK (amount_minor > 0),
  balance_after_minor bigint NOT NULL CHECK (balance_after_minor >= 0),
  reason_code text NOT NULL,
  reference_type text,
  reference_id uuid,
  idempotency_key text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT wallet_transaction_reference_check CHECK (reference_type IS NULL OR reference_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS wallet_transactions_user_idx ON wallet_transactions(wallet_user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_user_idempotency_uidx ON wallet_transactions(wallet_user_id, idempotency_key);

CREATE TABLE IF NOT EXISTS items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  category text NOT NULL,
  price_minor bigint CHECK (price_minor IS NULL OR price_minor >= 0),
  rarity text NOT NULL DEFAULT 'common',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inventory (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES items(id),
  quantity integer NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, item_id)
);

CREATE TABLE IF NOT EXISTS shops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  location_id uuid REFERENCES locations(id),
  shop_type text NOT NULL,
  owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  shop_id uuid NOT NULL REFERENCES shops(id) ON DELETE CASCADE,
  item_id uuid REFERENCES items(id),
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  stock_quantity integer CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS products_shop_idx ON products(shop_id, is_active);
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
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS marketplace_orders_buyer_idempotency_uidx ON marketplace_orders(buyer_user_id, idempotency_key);
CREATE INDEX IF NOT EXISTS marketplace_orders_buyer_idx ON marketplace_orders(buyer_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS homes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  name text NOT NULL,
  tier text NOT NULL,
  location_id uuid NOT NULL REFERENCES locations(id),
  purchase_price_minor bigint CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0),
  rent_price_minor bigint CHECK (rent_price_minor IS NULL OR rent_price_minor >= 0),
  capacity integer NOT NULL DEFAULT 1 CHECK (capacity > 0),
  furniture_slots integer NOT NULL DEFAULT 0 CHECK (furniture_slots >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS home_ownership (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  home_id uuid NOT NULL REFERENCES homes(id),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('rented', 'owned', 'ended')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ends_at timestamptz,
  UNIQUE(home_id, user_id, started_at)
);
CREATE INDEX IF NOT EXISTS home_ownership_user_idx ON home_ownership(user_id, status);

CREATE TABLE IF NOT EXISTS vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  vehicle_type text NOT NULL,
  name text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  purchase_price_minor bigint CHECK (purchase_price_minor IS NULL OR purchase_price_minor >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS friends (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friend_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  friendship_level integer NOT NULL DEFAULT 1 CHECK (friendship_level > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, friend_user_id),
  CHECK(user_id <> friend_user_id)
);

CREATE TABLE IF NOT EXISTS friend_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled')),
  created_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  CHECK(requester_id <> recipient_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_pending_idx ON friend_requests(requester_id, recipient_id) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS friends_reverse_idx ON friends(friend_user_id, user_id);

CREATE TABLE IF NOT EXISTS relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  other_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  relationship_type text NOT NULL CHECK (relationship_type IN ('friend', 'group', 'blocked', 'muted')),
  score integer NOT NULL DEFAULT 0 CHECK (score >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, other_user_id, relationship_type),
  CHECK(user_id <> other_user_id)
);

CREATE TABLE IF NOT EXISTS messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
  status text NOT NULL DEFAULT 'sent' CHECK (status IN ('sent', 'read', 'deleted', 'flagged')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK(sender_id <> recipient_id)
);
CREATE INDEX IF NOT EXISTS messages_thread_idx ON messages(sender_id, recipient_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_rooms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_type text NOT NULL CHECK (room_type IN ('location', 'group', 'event', 'support')),
  location_id uuid REFERENCES locations(id),
  name text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_rooms_location_uidx ON chat_rooms(location_id) WHERE room_type = 'location' AND location_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS chat_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  moderation_status text NOT NULL DEFAULT 'pending' CHECK (moderation_status IN ('pending', 'approved', 'flagged', 'removed')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_room_idx ON chat_messages(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  category text NOT NULL,
  description text NOT NULL DEFAULT '',
  logo_object_key text,
  cover_object_key text,
  location_id uuid REFERENCES locations(id),
  opening_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  reputation numeric(3,2) NOT NULL DEFAULT 0 CHECK (reputation BETWEEN 0 AND 5),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS businesses_category_idx ON businesses(category, status);

CREATE TABLE IF NOT EXISTS business_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  kind text NOT NULL CHECK (kind IN ('product', 'service')),
  price_minor bigint NOT NULL CHECK (price_minor >= 0),
  image_object_key text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS business_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES businesses(id),
  buyer_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  idempotency_key text,
  status text NOT NULL DEFAULT 'placed' CHECK (status IN ('placed', 'accepted', 'fulfilled', 'cancelled')),
  total_minor bigint NOT NULL CHECK (total_minor >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS business_orders_buyer_idempotency_uidx ON business_orders(buyer_user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS business_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL REFERENCES business_orders(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES business_products(id),
  quantity integer NOT NULL CHECK (quantity > 0),
  unit_price_minor bigint NOT NULL CHECK (unit_price_minor >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS business_order_items_order_idx ON business_order_items(order_id);

CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_key text,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  event_type text NOT NULL,
  location_id uuid REFERENCES locations(id),
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  capacity integer CHECK (capacity IS NULL OR capacity > 0),
  rewards jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'cancelled', 'ended')),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_catalog_key_unique UNIQUE (catalog_key),
  CHECK(end_at > start_at)
);

CREATE TABLE IF NOT EXISTS event_attendees (
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'registered' CHECK (status IN ('registered', 'attended', 'cancelled', 'waitlisted')),
  registered_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(event_id, user_id)
);

CREATE TABLE IF NOT EXISTS advertisements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertiser_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  business_id uuid REFERENCES businesses(id) ON DELETE SET NULL,
  ad_type text NOT NULL CHECK (ad_type IN ('billboard', 'shop_banner', 'metro', 'event_sponsorship', 'location_sponsorship', 'business_promotion')),
  title text NOT NULL,
  image_object_key text,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  budget_minor bigint NOT NULL DEFAULT 0 CHECK (budget_minor >= 0),
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'active', 'paused', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK(end_at > start_at)
);

CREATE TABLE IF NOT EXISTS ad_impressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  location_id uuid REFERENCES locations(id),
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ad_impressions_ad_idx ON ad_impressions(advertisement_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS ad_clicks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  advertisement_id uuid NOT NULL REFERENCES advertisements(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  destination jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS achievements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  title text NOT NULL,
  description text NOT NULL,
  category text NOT NULL,
  icon_key text,
  requirement jsonb NOT NULL DEFAULT '{}'::jsonb,
  reward jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS player_achievements (
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  progress integer NOT NULL DEFAULT 0 CHECK (progress >= 0),
  unlocked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(user_id, achievement_id)
);

CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS notifications_user_idx ON notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reported_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  target_type text NOT NULL,
  target_id uuid,
  reason_code text NOT NULL,
  details text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'triaged', 'resolved', 'dismissed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS reports_queue_idx ON reports(status, created_at);
CREATE INDEX IF NOT EXISTS relationships_block_idx ON relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS events_schedule_idx ON events(status, start_at);
CREATE INDEX IF NOT EXISTS advertisements_active_idx ON advertisements(status, start_at, end_at);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES reports(id) ON DELETE SET NULL,
  target_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  moderator_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action_type text NOT NULL CHECK (action_type IN ('warning', 'mute', 'ban', 'remove_content', 'resolve')),
  reason text NOT NULL,
  duration_seconds integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS admin_users (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('super_admin', 'admin', 'moderator', 'support', 'business_manager', 'advertiser_manager')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS audit_logs_entity_idx ON audit_logs(entity_type, entity_id, created_at DESC);

CREATE TABLE IF NOT EXISTS analytics_events (
  id bigserial PRIMARY KEY,
  event_name text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  session_id uuid REFERENCES player_sessions(id) ON DELETE SET NULL,
  anonymous_key text,
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analytics_events_name_idx ON analytics_events(event_name, occurred_at DESC);

CREATE OR REPLACE FUNCTION reject_wallet_ledger_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'wallet_transactions is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS wallet_transactions_immutable ON wallet_transactions;
CREATE TRIGGER wallet_transactions_immutable
  BEFORE UPDATE OR DELETE ON wallet_transactions
  FOR EACH ROW EXECUTE FUNCTION reject_wallet_ledger_mutation();

DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY['users','world_regions','world_districts','locations','profiles','avatars','characters','player_locations','jobs','wallets','items','inventory','shops','products','marketplace_listings','marketplace_orders','homes','activity_catalog','businesses','business_products','business_orders','events','advertisements','player_achievements']
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON %I', table_name, table_name);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
  END LOOP;
END $$;

COMMIT;
