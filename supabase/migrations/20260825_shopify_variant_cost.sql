-- ─────────────────────────────────────────────────────────────────────────────
-- shopify_variants.cost — per-item cost of goods, needed to compute Profit
-- and per-product profit in the daily report (src/lib/reports/dailyReport.ts)
-- and any margin surfaces added later.
--
-- Shopify stores cost on the InventoryItem resource (not the Variant), reached
-- via variant.inventory_item_id. The sync path in src/lib/shopify/sync/products
-- .ts now performs a bulk GET /admin/api/*/inventory_items.json?ids=<csv> for
-- every batch of variants and writes the cost back onto this column so joins
-- at report time stay a single query, no fan-out to the Shopify API.
--
-- Nullable on purpose: (a) not every merchant fills cost in on every variant
-- in Shopify; (b) the sync backfills existing rows progressively rather than
-- blocking on a huge one-shot fetch; the report's Profit line treats NULL as
-- "unknown cost" and shows N/A rather than pretending 0.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.shopify_variants
  ADD COLUMN IF NOT EXISTS cost NUMERIC(12,2);

COMMENT ON COLUMN public.shopify_variants.cost IS
  'Per-item cost of goods, from Shopify InventoryItem.cost (fetched via variant.inventory_item_id). NULL when the merchant has not set it or the sync has not yet populated it.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'shopify_variants' AND column_name = 'cost'
  ) THEN
    RAISE EXCEPTION 'shopify_variants.cost was not added';
  END IF;
END $$;
