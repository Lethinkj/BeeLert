-- ============================================
-- COMPLETE DATABASE SCHEMA FOR AURA-7F BOT
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================

-- ============================================
-- 1. BIRTHDAYS TABLE
-- Stores clan member birthday information
-- ============================================
CREATE TABLE IF NOT EXISTS birthdays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,        -- Discord user ID
    name TEXT NOT NULL,                   -- Display name
    date TEXT NOT NULL,                   -- Birthday in DD/MM format
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_birthdays_user_id ON birthdays(user_id);
CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(date);

-- ============================================
-- 2. FESTIVALS TABLE
-- Stores Tamil Nadu festivals with dates
-- ============================================
CREATE TABLE IF NOT EXISTS festivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,                   -- Festival name
    date TEXT NOT NULL,                   -- Date in DD/MM format
    emoji TEXT DEFAULT '🎉',              -- Festival emoji
    type TEXT DEFAULT 'hindu',            -- hindu, muslim, christian, global
    year INTEGER,                         -- Year for the date
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, year)
);

CREATE INDEX IF NOT EXISTS idx_festivals_date ON festivals(date);
CREATE INDEX IF NOT EXISTS idx_festivals_type ON festivals(type);

-- ============================================
-- 3. FESTIVAL_UPDATES TABLE
-- Tracks when festival dates were last updated
-- ============================================
CREATE TABLE IF NOT EXISTS festival_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL UNIQUE,         -- Year updated
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    festivals_count INTEGER DEFAULT 0,    -- Number of festivals stored
    source TEXT DEFAULT 'ai'              -- How dates were fetched
);

-- ============================================
-- 4. USERS TABLE
-- Stores clan member information
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE, -- Discord user ID
    username TEXT,                        -- Discord username
    display_name TEXT,                    -- Server display name
    is_clan_member BOOLEAN DEFAULT false, -- Is part of the clan
    joined_at TIMESTAMP WITH TIME ZONE,   -- When they joined
    last_active TIMESTAMP WITH TIME ZONE, -- Last activity
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_users_clan ON users(is_clan_member);

-- ============================================
-- 5. REMINDERS TABLE
-- Stores personal user reminders
-- ============================================
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,                -- Discord user ID
    reminder_text TEXT,                   -- Reminder message
    reminder_date TIMESTAMP WITH TIME ZONE, -- When to remind
    is_completed BOOLEAN DEFAULT false,   -- Whether reminder was sent
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(is_completed);

-- ============================================
-- 6. HEARTBEAT_LOGS TABLE
-- Keeps database active (prevents free tier pause)
-- ============================================
CREATE TABLE IF NOT EXISTS heartbeat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'alive',          -- Status message
    bot_version TEXT,                     -- Bot version if tracked
    uptime_seconds BIGINT                 -- Bot uptime at heartbeat
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_timestamp ON heartbeat_logs(timestamp);

-- ============================================
-- 7. VOICE_POINTS TABLE
-- Monthly voice activity points for gamification
-- ============================================
CREATE TABLE IF NOT EXISTS voice_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,        -- Discord user ID
    username TEXT,                        -- Discord username
    total_points INTEGER DEFAULT 0,       -- Points earned (1 per 5 min)
    total_minutes INTEGER DEFAULT 0,      -- Total voice minutes
    month_year TEXT NOT NULL,             -- Format: YYYY-MM (e.g., 2026-01)
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(discord_user_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_voice_points_user ON voice_points(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_voice_points_month ON voice_points(month_year);
CREATE INDEX IF NOT EXISTS idx_voice_points_user_month ON voice_points(discord_user_id, month_year);
CREATE INDEX IF NOT EXISTS idx_voice_points_ranking ON voice_points(month_year, total_points DESC);

-- ============================================
-- 8. VOICE_SESSIONS TABLE
-- Individual voice session logs
-- ============================================
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,        -- Discord user ID
    username TEXT,                        -- Discord username
    channel_id TEXT,                      -- Voice channel ID
    channel_name TEXT,                    -- Voice channel name
    duration_minutes INTEGER DEFAULT 0,   -- Session duration
    points_earned INTEGER DEFAULT 0,      -- Points from this session
    session_date TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON voice_sessions(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_date ON voice_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_channel ON voice_sessions(channel_id);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- Required for Supabase security
-- ============================================
ALTER TABLE birthdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE festivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE POLICIES FOR BOT ACCESS
-- Allows the bot (using anon/service key) full access
-- ============================================
CREATE POLICY "Enable all for anon" ON birthdays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON festivals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON festival_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON heartbeat_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON voice_points FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON voice_sessions FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SCHEMA SUMMARY
-- ============================================
-- Tables: 8
-- 1. birthdays      - Clan member birthdays (DD/MM format)
-- 2. festivals      - Tamil Nadu festivals with AI-fetched dates
-- 3. festival_updates - Tracks yearly festival refresh
-- 4. users          - Clan member profiles
-- 5. reminders      - Personal user reminders
-- 6. heartbeat_logs - Keeps free tier database alive
-- 7. voice_points   - Monthly voice activity gamification
-- 8. voice_sessions - Detailed voice session history
-- ============================================
