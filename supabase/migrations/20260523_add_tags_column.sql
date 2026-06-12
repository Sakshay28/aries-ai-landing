-- Migration: Add tags column to leads table
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql

ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';

-- Add an index for fast tag lookups
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING GIN(tags);
