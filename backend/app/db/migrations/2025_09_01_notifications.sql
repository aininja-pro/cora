-- SMS Notifications Migration
-- Created: 2025-09-01
-- Purpose: Add SMS notification system with compliance and multi-tenant support

-- Extend tenants table for SMS configuration
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sms_enabled boolean DEFAULT true;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS twilio_messaging_service_sid text;
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS sms_default_from text;

-- Extend contacts table for SMS opt-out compliance
ALTER TABLE public.contacts ADD COLUMN IF NOT EXISTS sms_opt_out boolean DEFAULT false;

-- Create notifications table for SMS tracking and compliance
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  call_id uuid REFERENCES public.calls(id) ON DELETE CASCADE,
  to_number text NOT NULL,
  template text NOT NULL, -- 'showing_confirm', 'agent_summary', 'lead_captured', 'missed_call'
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'queued', -- 'queued', 'sent', 'failed'
  error text,
  provider_message_sid text, -- Twilio message SID for tracking
  idempotency_key text,
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_notifications_call_id ON public.notifications(call_id);
CREATE INDEX IF NOT EXISTS idx_notifications_tenant_status ON public.notifications(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON public.notifications(created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_call_created ON public.notifications(call_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notifications_to_number ON public.notifications(to_number);

-- Create unique index for idempotency (partial index where key exists)
CREATE UNIQUE INDEX IF NOT EXISTS ux_notifications_idem ON public.notifications(idempotency_key) 
WHERE idempotency_key IS NOT NULL;

-- Enable Row Level Security for tenant isolation
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Policy: Backend service role gets full access for writes
CREATE POLICY notifications_service_full
ON public.notifications
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Policy: Authenticated users get tenant-scoped read access
CREATE POLICY notifications_tenant_select
ON public.notifications
FOR SELECT
TO authenticated
USING (tenant_id = (auth.jwt() ->> 'tenant_id'));

-- Add comments for documentation
COMMENT ON TABLE public.notifications IS 'SMS notifications sent via Twilio with compliance tracking';
COMMENT ON COLUMN public.notifications.template IS 'Template key: showing_confirm, agent_summary, lead_captured, missed_call';
COMMENT ON COLUMN public.notifications.payload IS 'JSON data for template rendering (name, address, etc.)';
COMMENT ON COLUMN public.notifications.status IS 'Delivery status: queued, sent, failed';
COMMENT ON COLUMN public.notifications.provider_message_sid IS 'Twilio message SID for delivery tracking';
COMMENT ON COLUMN public.notifications.idempotency_key IS 'Prevents duplicate sends for same business event';