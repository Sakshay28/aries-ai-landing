-- ═══════════════════════════════════════════════════════════
-- Shopify Custom-App Integration — production schema
-- ═══════════════════════════════════════════════════════════
-- Hybrid mirror: catalog + policies + FAQs + customer refs + recent
-- order snapshots stored locally for AI/broadcasts. Volatile fields
-- (live inventory qty, payment/fulfillment status) are best-effort
-- cached here but re-fetched on demand by the AI tools.
--
-- Modular: only the tenants.shopify_* columns and the webhook
-- shared secret column are auth-shaped. Adding OAuth later is a
-- credential-source swap, not a schema change.
-- ═══════════════════════════════════════════════════════════

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ─── 1. Tenant columns ───────────────────────────────────────
-- shopify_store_url, shopify_access_token, shopify_webhook_secret
-- already exist on tenants. Add the rest.
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_api_version       TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_connected_at      TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_last_full_sync_at TIMESTAMPTZ;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_sync_status       TEXT DEFAULT 'idle'
  CHECK (shopify_sync_status IN ('idle', 'syncing', 'error'));
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_sync_error        TEXT;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_scopes            JSONB DEFAULT '[]';
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS shopify_shop_meta         JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_tenants_shopify_store
  ON tenants(shopify_store_url) WHERE shopify_store_url IS NOT NULL;

-- ─── 2. Products + variants ──────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_products (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id        UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id       BIGINT NOT NULL,
  handle           TEXT NOT NULL,
  title            TEXT NOT NULL,
  body_html        TEXT,
  body_text        TEXT,                  -- stripped for search / AI
  vendor           TEXT,
  product_type     TEXT,
  tags             TEXT[] DEFAULT '{}',
  status           TEXT,                  -- active / draft / archived
  image_url        TEXT,
  images           JSONB DEFAULT '[]',    -- [{src, alt, position}]
  price_min        NUMERIC(12,2),
  price_max        NUMERIC(12,2),
  currency         TEXT,
  total_inventory  INTEGER,               -- cached; re-fetch for real-time
  online_store_url TEXT,
  seo_title        TEXT,
  seo_description  TEXT,
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  published_at     TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  search_text      TEXT,                  -- tsvector-friendly aggregated text
  raw              JSONB
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_products_tenant_shopify
  ON shopify_products(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_products_tenant_handle
  ON shopify_products(tenant_id, handle);
CREATE INDEX IF NOT EXISTS idx_shopify_products_tenant_status
  ON shopify_products(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_shopify_products_search_trgm
  ON shopify_products USING GIN (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_shopify_products_tags
  ON shopify_products USING GIN (tags);

CREATE TABLE IF NOT EXISTS shopify_variants (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  product_id         UUID NOT NULL REFERENCES shopify_products(id) ON DELETE CASCADE,
  shopify_id         BIGINT NOT NULL,
  shopify_product_id BIGINT NOT NULL,
  sku                TEXT,
  title              TEXT,
  price              NUMERIC(12,2),
  compare_at_price   NUMERIC(12,2),
  currency           TEXT,
  inventory_item_id  BIGINT,
  inventory_quantity INTEGER,             -- cached — re-fetch for real-time
  inventory_policy   TEXT,                -- 'deny' | 'continue'
  option1            TEXT,
  option2            TEXT,
  option3            TEXT,
  image_url          TEXT,
  requires_shipping  BOOLEAN,
  weight             NUMERIC(10,3),
  weight_unit        TEXT,
  barcode            TEXT,
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_variants_tenant_shopify
  ON shopify_variants(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_product
  ON shopify_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_shopify_variants_tenant_sku
  ON shopify_variants(tenant_id, sku);

-- ─── 3. Collections ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_collections (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id         BIGINT NOT NULL,
  handle             TEXT NOT NULL,
  title              TEXT NOT NULL,
  body_html          TEXT,
  image_url          TEXT,
  collection_type    TEXT,                -- 'smart' | 'custom'
  product_ids        BIGINT[] DEFAULT '{}',
  products_count     INTEGER DEFAULT 0,
  shopify_updated_at TIMESTAMPTZ,
  published_at       TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_collections_tenant_shopify
  ON shopify_collections(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_collections_tenant_handle
  ON shopify_collections(tenant_id, handle);

-- ─── 4. Customers (references / mirror) ──────────────────────
CREATE TABLE IF NOT EXISTS shopify_customers (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id         BIGINT NOT NULL,
  lead_id            UUID REFERENCES leads(id) ON DELETE SET NULL,
  email              TEXT,
  phone              TEXT,
  first_name         TEXT,
  last_name          TEXT,
  orders_count       INTEGER DEFAULT 0,
  total_spent        NUMERIC(12,2) DEFAULT 0,
  currency           TEXT,
  tags               TEXT[] DEFAULT '{}',
  accepts_marketing  BOOLEAN DEFAULT false,
  state              TEXT,                -- enabled/disabled/invited
  shopify_created_at TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_customers_tenant_shopify
  ON shopify_customers(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_tenant_email
  ON shopify_customers(tenant_id, lower(email));
CREATE INDEX IF NOT EXISTS idx_shopify_customers_tenant_phone
  ON shopify_customers(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_shopify_customers_lead
  ON shopify_customers(lead_id) WHERE lead_id IS NOT NULL;

-- ─── 5. Orders (recent snapshots) ────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_orders (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id             UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id            BIGINT NOT NULL,
  order_number          TEXT,             -- '#1001'
  customer_shopify_id   BIGINT,
  lead_id               UUID REFERENCES leads(id) ON DELETE SET NULL,
  email                 TEXT,
  phone                 TEXT,
  financial_status      TEXT,             -- pending, paid, refunded, ...
  fulfillment_status    TEXT,             -- fulfilled, partial, unfulfilled, null
  total_price           NUMERIC(12,2),
  subtotal_price        NUMERIC(12,2),
  total_tax             NUMERIC(12,2),
  currency              TEXT,
  line_items            JSONB DEFAULT '[]',
  shipping_address      JSONB,
  fulfillments          JSONB DEFAULT '[]',
  tags                  TEXT[] DEFAULT '{}',
  note                  TEXT,
  cancel_reason         TEXT,
  shopify_created_at    TIMESTAMPTZ,
  shopify_updated_at    TIMESTAMPTZ,
  processed_at          TIMESTAMPTZ,
  cancelled_at          TIMESTAMPTZ,
  closed_at             TIMESTAMPTZ,
  snapshot_expires_at   TIMESTAMPTZ,      -- 90 days by default; nullable = never expires
  synced_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_orders_tenant_shopify
  ON shopify_orders(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_tenant_created
  ON shopify_orders(tenant_id, shopify_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_tenant_customer
  ON shopify_orders(tenant_id, customer_shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_tenant_number
  ON shopify_orders(tenant_id, order_number);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_tenant_phone
  ON shopify_orders(tenant_id, phone);
CREATE INDEX IF NOT EXISTS idx_shopify_orders_lead
  ON shopify_orders(lead_id) WHERE lead_id IS NOT NULL;

-- ─── 6. CMS content: pages, blogs, articles ──────────────────
CREATE TABLE IF NOT EXISTS shopify_pages (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id         BIGINT NOT NULL,
  handle             TEXT NOT NULL,
  title              TEXT NOT NULL,
  body_html          TEXT,
  body_text          TEXT,
  author             TEXT,
  published_at       TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_pages_tenant_shopify
  ON shopify_pages(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_pages_tenant_handle
  ON shopify_pages(tenant_id, handle);
CREATE INDEX IF NOT EXISTS idx_shopify_pages_search_trgm
  ON shopify_pages USING GIN (body_text gin_trgm_ops);

CREATE TABLE IF NOT EXISTS shopify_blogs (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id         BIGINT NOT NULL,
  handle             TEXT NOT NULL,
  title              TEXT NOT NULL,
  commentable        TEXT,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_blogs_tenant_shopify
  ON shopify_blogs(tenant_id, shopify_id);

CREATE TABLE IF NOT EXISTS shopify_articles (
  id                 UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id          UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  blog_id            UUID NOT NULL REFERENCES shopify_blogs(id) ON DELETE CASCADE,
  shopify_id         BIGINT NOT NULL,
  shopify_blog_id    BIGINT NOT NULL,
  handle             TEXT NOT NULL,
  title              TEXT NOT NULL,
  body_html          TEXT,
  body_text          TEXT,
  summary            TEXT,
  author             TEXT,
  tags               TEXT[] DEFAULT '{}',
  image_url          TEXT,
  published_at       TIMESTAMPTZ,
  shopify_updated_at TIMESTAMPTZ,
  synced_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_articles_tenant_shopify
  ON shopify_articles(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_articles_blog
  ON shopify_articles(blog_id);
CREATE INDEX IF NOT EXISTS idx_shopify_articles_search_trgm
  ON shopify_articles USING GIN (body_text gin_trgm_ops);

-- ─── 7. Store policies ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_policies (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id    UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  policy_type  TEXT NOT NULL,        -- refund / privacy / tos / shipping / legal / subscription / contact
  title        TEXT,
  body         TEXT,
  url          TEXT,
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_policies_tenant_type
  ON shopify_policies(tenant_id, policy_type);

-- ─── 8. Discount codes ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_discounts (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id              UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  shopify_id             BIGINT NOT NULL,
  shopify_price_rule_id  BIGINT,
  code                   TEXT NOT NULL,
  discount_type          TEXT,          -- percentage / fixed_amount / free_shipping / bxgy
  value                  NUMERIC(12,4),
  value_type             TEXT,
  starts_at              TIMESTAMPTZ,
  ends_at                TIMESTAMPTZ,
  usage_limit            INTEGER,
  times_used             INTEGER DEFAULT 0,
  status                 TEXT,          -- active / expired / scheduled
  applies_to             JSONB,
  synced_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_discounts_tenant_shopify
  ON shopify_discounts(tenant_id, shopify_id);
CREATE INDEX IF NOT EXISTS idx_shopify_discounts_tenant_code
  ON shopify_discounts(tenant_id, lower(code));

-- ─── 9. Sync jobs (queue) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS shopify_sync_jobs (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  job_type       TEXT NOT NULL,           -- 'full_sync' | 'resource_sync' | 'webhook_event'
  resource       TEXT,                    -- products / variants / collections / customers / orders / pages / policies / blogs / articles / discounts / inventory
  cursor         TEXT,                    -- Shopify page_info (Link header) or since_id
  payload        JSONB DEFAULT '{}',
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','processing','completed','failed','cancelled')),
  attempts       INTEGER NOT NULL DEFAULT 0,
  max_attempts   INTEGER NOT NULL DEFAULT 6,
  worker_id      TEXT,
  error_message  TEXT,
  run_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at     TIMESTAMPTZ,
  completed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_jobs_status_run
  ON shopify_sync_jobs(status, run_at);
CREATE INDEX IF NOT EXISTS idx_shopify_sync_jobs_tenant
  ON shopify_sync_jobs(tenant_id, status);

-- ─── 10. Webhook event idempotency ──────────────────────────
CREATE TABLE IF NOT EXISTS shopify_webhook_events (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id      UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  webhook_id     TEXT NOT NULL,           -- X-Shopify-Webhook-Id
  topic          TEXT NOT NULL,
  resource_id   TEXT,
  status         TEXT NOT NULL DEFAULT 'received'
                   CHECK (status IN ('received','processed','failed','skipped')),
  payload        JSONB,
  error_message  TEXT,
  received_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at   TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_shopify_webhook_events_webhook_id
  ON shopify_webhook_events(webhook_id);
CREATE INDEX IF NOT EXISTS idx_shopify_webhook_events_tenant_topic
  ON shopify_webhook_events(tenant_id, topic, received_at DESC);

-- ─── 11. RLS ─────────────────────────────────────────────────
ALTER TABLE shopify_products       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_variants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_collections    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_customers      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_orders         ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_pages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_blogs          ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_articles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_policies       ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_discounts      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_sync_jobs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE shopify_webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'shopify_products','shopify_variants','shopify_collections',
    'shopify_customers','shopify_orders','shopify_pages',
    'shopify_blogs','shopify_articles','shopify_policies',
    'shopify_discounts','shopify_sync_jobs','shopify_webhook_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_tenant_isolation" ON %I', tbl, tbl);
    EXECUTE format(
      'CREATE POLICY "%s_tenant_isolation" ON %I FOR ALL USING (tenant_id = (SELECT tenant_id FROM users WHERE id = auth.uid()))',
      tbl, tbl
    );
  END LOOP;
END $$;

-- ─── 12. Atomic claim RPC for the worker ────────────────────
CREATE OR REPLACE FUNCTION claim_shopify_sync_jobs(p_worker_id TEXT, p_limit INT)
RETURNS TABLE(
  id            UUID,
  tenant_id     UUID,
  job_type      TEXT,
  resource      TEXT,
  cursor        TEXT,
  payload       JSONB,
  attempts      INTEGER
) AS $$
DECLARE
  v_ids UUID[];
BEGIN
  SELECT array_agg(q.id) INTO v_ids FROM (
    SELECT j.id FROM shopify_sync_jobs j
    WHERE j.status = 'pending' AND j.run_at <= NOW()
    ORDER BY j.run_at ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  ) q;

  IF v_ids IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  UPDATE shopify_sync_jobs j
  SET
    status     = 'processing',
    worker_id  = p_worker_id,
    started_at = COALESCE(j.started_at, NOW()),
    updated_at = NOW(),
    attempts   = j.attempts + 1
  WHERE j.id = ANY(v_ids)
  RETURNING j.id, j.tenant_id, j.job_type, j.resource, j.cursor, j.payload, j.attempts;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 13. Stuck-job recovery (visibility timeout) ────────────
CREATE OR REPLACE FUNCTION reclaim_stuck_shopify_jobs(p_timeout_minutes INT DEFAULT 10)
RETURNS INTEGER AS $$
DECLARE
  n INT;
BEGIN
  UPDATE shopify_sync_jobs
  SET status = 'pending',
      run_at = NOW(),
      worker_id = NULL,
      updated_at = NOW()
  WHERE status = 'processing'
    AND started_at < NOW() - (p_timeout_minutes || ' minutes')::INTERVAL
    AND attempts < max_attempts;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── 14. Auto-update updated_at on shopify_sync_jobs ───────
CREATE OR REPLACE FUNCTION touch_shopify_sync_jobs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_touch_shopify_sync_jobs ON shopify_sync_jobs;
CREATE TRIGGER tr_touch_shopify_sync_jobs
  BEFORE UPDATE ON shopify_sync_jobs
  FOR EACH ROW EXECUTE FUNCTION touch_shopify_sync_jobs_updated_at();

COMMIT;

-- ─── Rollback (manual) ─────────────────────────────────────
-- DROP TABLE IF EXISTS shopify_webhook_events, shopify_sync_jobs,
--   shopify_discounts, shopify_policies, shopify_articles, shopify_blogs,
--   shopify_pages, shopify_orders, shopify_customers, shopify_collections,
--   shopify_variants, shopify_products CASCADE;
-- DROP FUNCTION IF EXISTS claim_shopify_sync_jobs, reclaim_stuck_shopify_jobs,
--   touch_shopify_sync_jobs_updated_at CASCADE;
