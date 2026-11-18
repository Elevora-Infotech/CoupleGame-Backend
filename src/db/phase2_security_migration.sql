-- ============================================================================
-- SoulShuffle Admin Panel — Phase 2: Security & RBAC Migration
-- Based on: SoulShuffle — Admin Panel: Complete Requirements (October 2026)
-- Covers: Part B1 & Part D1 (Access, Roles, Immutability & 2FA)
-- ============================================================================

-- 1. Ensure Admins table has 2FA fields and proper role constraints
ALTER TABLE public.admins 
  ADD COLUMN IF NOT EXISTS two_factor_code VARCHAR(255) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS two_factor_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS two_factor_attempts INT DEFAULT 0;

-- 2. Create the Immutability Function for admin_audit_logs
CREATE OR REPLACE FUNCTION public.prevent_admin_audit_log_mutation()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'admin_audit_logs is an immutable append-only ledger. UPDATE and DELETE operations are strictly prohibited by system security policy.';
END;
$$ LANGUAGE plpgsql;

-- 3. Attach the Immutability Trigger
DROP TRIGGER IF EXISTS trg_prevent_admin_audit_logs_mutation ON public.admin_audit_logs;
CREATE TRIGGER trg_prevent_admin_audit_logs_mutation
  BEFORE UPDATE OR DELETE ON public.admin_audit_logs
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_admin_audit_log_mutation();

-- 4. Enable RLS and establish service policies on admin_audit_logs
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role can manage audit logs" ON public.admin_audit_logs;
CREATE POLICY "Service role can manage audit logs"
  ON public.admin_audit_logs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- 5. Seed Support Account for testing RBAC (password: Support123!)
-- Hash generated via bcrypt (cost factor 10): $2b$10$w6P7U.iMhH.1hA2FhI.y3u1p1LgEa8eRXZlIe9n0qYwZ0jB7oFk.q
INSERT INTO public.admins (name, email, password_hash, role)
VALUES (
  'Support Specialist',
  'support@elevora.com',
  '$2b$10$w6P7U.iMhH.1hA2FhI.y3u1p1LgEa8eRXZlIe9n0qYwZ0jB7oFk.q',
  'support'
)
ON CONFLICT (email) DO UPDATE
SET role = 'support';

-- 6. Verification confirmation
SELECT 
  'PHASE 2 SECURITY MIGRATION COMPLETE' AS status,
  COUNT(*) AS total_admins,
  NOW() AS applied_at
FROM public.admins;
