-- ============================================
-- DAILY VOICE MONITORING SYSTEM SCHEMA
-- ============================================

-- Sessions table
CREATE TABLE IF NOT EXISTS daily_voice_monitor_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id TEXT NOT NULL UNIQUE,
    discord_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    guild_id TEXT NOT NULL,
    voice_channel_id TEXT NOT NULL,
    join_time TIMESTAMP WITH TIME ZONE NOT NULL,
    leave_time TIMESTAMP WITH TIME ZONE,
    duration_seconds INTEGER DEFAULT 0,
    session_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_mon_user_date ON daily_voice_monitor_sessions(discord_user_id, session_date);
CREATE INDEX IF NOT EXISTS idx_voice_mon_date ON daily_voice_monitor_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_voice_mon_channel ON daily_voice_monitor_sessions(voice_channel_id);

-- Report Dedup Logs table
CREATE TABLE IF NOT EXISTS daily_voice_report_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    report_date DATE NOT NULL UNIQUE,
    sent_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    active_members_count INTEGER DEFAULT 0,
    total_seconds INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE daily_voice_monitor_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_voice_report_logs ENABLE ROW LEVEL SECURITY;

-- Allow bot access (anon key policies)
DROP POLICY IF EXISTS "Enable all for anon" ON daily_voice_monitor_sessions;
DROP POLICY IF EXISTS "Enable all for anon" ON daily_voice_report_logs;

CREATE POLICY "Enable all for anon" ON daily_voice_monitor_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON daily_voice_report_logs FOR ALL USING (true) WITH CHECK (true);
