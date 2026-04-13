-- ==========================================
-- Part 4: Real-Time Room System (EleVora)
-- ==========================================

-- 1. Create Enums for Status and Expiry Tiers
DO $$ BEGIN
    CREATE TYPE room_status AS ENUM ('WAITING', 'ACTIVE', 'COMPLETED', 'EXPIRED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE expiry_tier AS ENUM ('7_DAYS', '30_DAYS', '1_YEAR');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 2. Create the Rooms Table
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- Publicly sharable code (e.g., ELV-X921)
  code VARCHAR(12) UNIQUE NOT NULL,
  
  -- Participants
  host_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  partner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  
  -- State & Lifecycle
  status room_status DEFAULT 'WAITING',
  expiry_type expiry_tier NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  
  -- Flexible Game Data (Scores, Turn info, current question index)
  game_state JSONB DEFAULT '{}'::jsonb,
  
  -- Audit Trail
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Performance Indexes
-- Index the code for fast 'Join Room' lookups
CREATE INDEX IF NOT EXISTS idx_rooms_code ON public.rooms (UPPER(code));

-- Index user IDs for fast 'My Room' lookups
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON public.rooms (host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_partner_id ON public.rooms (partner_id);

-- Index expiry for cleanup/filtering
CREATE INDEX IF NOT EXISTS idx_rooms_expires_at ON public.rooms (expires_at);

-- 4. Automatically update the updated_at column
DROP TRIGGER IF EXISTS trg_rooms_updated_at ON public.rooms;
CREATE TRIGGER trg_rooms_updated_at
  BEFORE UPDATE ON public.rooms
  FOR EACH ROW EXECUTE FUNCTION handle_updated_at();

-- 5. RLS (Row Level Security) - Optional but Industry Recommendation
-- Ensures only members of a room can read/write to it
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own rooms" ON public.rooms;
CREATE POLICY "Users can view their own rooms" ON public.rooms
  FOR SELECT USING (auth.uid() = host_id OR auth.uid() = partner_id);

DROP POLICY IF EXISTS "Hosts can update their own rooms" ON public.rooms;
CREATE POLICY "Hosts can update their own rooms" ON public.rooms
  FOR UPDATE USING (auth.uid() = host_id);
