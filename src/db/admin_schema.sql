-- ==========================================
-- Part 4: Isolated Admin System
-- ==========================================

-- 1. Create the Admins Table
CREATE TABLE IF NOT EXISTS public.admins (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(50) DEFAULT 'admin', -- 'super_admin', 'editor', etc.
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Apply updated_at trigger
DROP TRIGGER IF EXISTS trg_admins_updated_at ON public.admins;
CREATE TRIGGER trg_admins_updated_at
  BEFORE UPDATE ON public.admins
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 3. [OPTIONAL] Add your first admin account manually:
-- INSERT INTO public.admins (name, email, password_hash)
-- VALUES ('Admin Name', 'admin@example.com', 'bcrypt_hash_here');
