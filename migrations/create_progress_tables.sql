-- ============================================
-- PROGRESS TRACKING SYSTEM
-- Run this in Supabase SQL Editor
-- ============================================

-- Progress Updates Table
CREATE TABLE IF NOT EXISTS progress_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    username TEXT NOT NULL,
    content TEXT NOT NULL,
    word_count INTEGER DEFAULT 0,
    has_image BOOLEAN DEFAULT false,
    points_awarded INTEGER DEFAULT 5,
    current_streak INTEGER DEFAULT 1,
    ai_feedback TEXT,
    update_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(discord_user_id, update_date)
);

CREATE INDEX IF NOT EXISTS idx_progress_user ON progress_updates(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_progress_date ON progress_updates(update_date);
CREATE INDEX IF NOT EXISTS idx_progress_user_date ON progress_updates(discord_user_id, update_date);

-- User Progress Stats Table
CREATE TABLE IF NOT EXISTS user_progress_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    total_points INTEGER DEFAULT 0,
    current_streak INTEGER DEFAULT 0,
    longest_streak INTEGER DEFAULT 0,
    last_update_date DATE,
    total_updates INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_stats_points ON user_progress_stats(total_points DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_streak ON user_progress_stats(current_streak DESC);
CREATE INDEX IF NOT EXISTS idx_user_stats_user_id ON user_progress_stats(discord_user_id);

-- Enable RLS
ALTER TABLE progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress_stats ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Enable all for anon" ON progress_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON user_progress_stats FOR ALL USING (true) WITH CHECK (true);
