-- ============================================
-- DAILY REMINDERS TABLE
-- Stores recurring daily reminder settings
-- ============================================

CREATE TABLE IF NOT EXISTS daily_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,         -- Discord user ID (one reminder per user)
    time TEXT NOT NULL,                   -- Time in HH:MM format (24hr, e.g., '21:00')
    custom_message TEXT,                  -- Optional custom reminder message
    is_active BOOLEAN DEFAULT true,       -- Whether reminder is active
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_reminders_user ON daily_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reminders_active ON daily_reminders(is_active);
CREATE INDEX IF NOT EXISTS idx_daily_reminders_time ON daily_reminders(time);

-- Enable RLS
ALTER TABLE daily_reminders ENABLE ROW LEVEL SECURITY;

-- Allow bot access
CREATE POLICY "Enable all for anon" ON daily_reminders FOR ALL USING (true) WITH CHECK (true);
