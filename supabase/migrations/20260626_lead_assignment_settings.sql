-- Alter tenants table to add settings for lead assignment email notifications and selective assignee
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS default_lead_assignee_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS lead_assigned_email_template TEXT;
