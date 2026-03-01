-- ============================================
-- COMPLETE DATABASE SCHEMA FOR AURA-7F BOT
-- Comprehensive schema for Discord community management
-- ============================================
-- Run this entire script in Supabase SQL Editor
-- https://supabase.com/dashboard/project/YOUR_PROJECT/sql
-- ============================================

-- ============================================
-- 1. USERS TABLE
-- Core user information and membership tracking
-- ============================================
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL UNIQUE,
    username TEXT,                        -- Discord username
    display_name TEXT,                    -- Server display name
    avatar_url TEXT,                      -- User's avatar URL
    is_clan_member BOOLEAN DEFAULT false,
    is_guest BOOLEAN DEFAULT false,
    is_rookie BOOLEAN DEFAULT false,
    member_tier TEXT DEFAULT 'member',    -- member, senior, admin
    joined_at TIMESTAMP WITH TIME ZONE,
    last_active TIMESTAMP WITH TIME ZONE,
    bio TEXT,                             -- User bio/about
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_discord_id ON users(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_users_clan ON users(is_clan_member);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(member_tier);

-- ============================================
-- 2. BIRTHDAYS TABLE
-- Stores clan member birthday information
-- ============================================
CREATE TABLE IF NOT EXISTS birthdays (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,         -- Discord user ID
    name TEXT NOT NULL,                   -- Display name
    date TEXT NOT NULL,                   -- Birthday in DD/MM format
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_birthdays_user_id ON birthdays(user_id);
CREATE INDEX IF NOT EXISTS idx_birthdays_date ON birthdays(date);

-- ============================================
-- 3. FESTIVALS TABLE
-- Stores Tamil Nadu festivals with dates
-- ============================================
CREATE TABLE IF NOT EXISTS festivals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    date TEXT NOT NULL,                   -- Date in DD/MM format
    emoji TEXT DEFAULT '🎉',
    type TEXT DEFAULT 'hindu',            -- hindu, muslim, christian, global
    year INTEGER,
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(name, year)
);

CREATE INDEX IF NOT EXISTS idx_festivals_date ON festivals(date);
CREATE INDEX IF NOT EXISTS idx_festivals_type ON festivals(type);
CREATE INDEX IF NOT EXISTS idx_festivals_year ON festivals(year);

-- ============================================
-- 4. FESTIVAL_UPDATES TABLE
-- Tracks when festival dates were last updated
-- ============================================
CREATE TABLE IF NOT EXISTS festival_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    year INTEGER NOT NULL UNIQUE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    festivals_count INTEGER DEFAULT 0,
    source TEXT DEFAULT 'ai'
);

-- ============================================
-- 5. DAILY_REMINDERS TABLE
-- Stores recurring daily reminder settings
-- ============================================
CREATE TABLE IF NOT EXISTS daily_reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    time TEXT NOT NULL,                   -- Time in HH:MM format (24hr)
    custom_message TEXT,
    is_active BOOLEAN DEFAULT true,
    reminder_type TEXT DEFAULT 'custom',  -- custom, study, standup, exercise
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_daily_reminders_user ON daily_reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_daily_reminders_active ON daily_reminders(is_active);
CREATE INDEX IF NOT EXISTS idx_daily_reminders_time ON daily_reminders(time);

-- ============================================
-- 6. REMINDERS TABLE
-- Stores one-time personal user reminders
-- ============================================
CREATE TABLE IF NOT EXISTS reminders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    reminder_text TEXT NOT NULL,
    reminder_date TIMESTAMP WITH TIME ZONE NOT NULL,
    is_completed BOOLEAN DEFAULT false,
    sent_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_completed ON reminders(is_completed);
CREATE INDEX IF NOT EXISTS idx_reminders_date ON reminders(reminder_date);

-- ============================================
-- 7. PROGRESS_UPDATES TABLE
-- Stores user daily progress updates
-- ============================================
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

-- ============================================
-- 8. USER_PROGRESS_STATS TABLE
-- Aggregated user progress statistics
-- ============================================
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

-- ============================================
-- 9. VOICE_POINTS TABLE
-- Monthly voice activity points for gamification
-- ============================================
CREATE TABLE IF NOT EXISTS voice_points (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    username TEXT,
    total_points INTEGER DEFAULT 0,       -- Points earned (1 per 5 min)
    total_minutes INTEGER DEFAULT 0,      -- Total voice minutes
    month_year TEXT NOT NULL,             -- Format: YYYY-MM
    last_updated TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(discord_user_id, month_year)
);

CREATE INDEX IF NOT EXISTS idx_voice_points_user ON voice_points(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_voice_points_month ON voice_points(month_year);
CREATE INDEX IF NOT EXISTS idx_voice_points_ranking ON voice_points(month_year, total_points DESC);

-- ============================================
-- 10. VOICE_SESSIONS TABLE
-- Individual voice session logs
-- ============================================
CREATE TABLE IF NOT EXISTS voice_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_user_id TEXT NOT NULL,
    username TEXT,
    channel_id TEXT NOT NULL,
    channel_name TEXT,
    duration_minutes INTEGER DEFAULT 0,
    points_earned INTEGER DEFAULT 0,
    session_start TIMESTAMP WITH TIME ZONE,
    session_end TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_voice_sessions_user ON voice_sessions(discord_user_id);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_date ON voice_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_voice_sessions_channel ON voice_sessions(channel_id);

-- ============================================
-- 11. HEARTBEAT_LOGS TABLE
-- Keeps database active (prevents free tier pause)
-- ============================================
CREATE TABLE IF NOT EXISTS heartbeat_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    status TEXT DEFAULT 'alive',
    bot_version TEXT,
    uptime_seconds BIGINT
);

CREATE INDEX IF NOT EXISTS idx_heartbeat_timestamp ON heartbeat_logs(timestamp);

-- ============================================
-- 12. EVENTS TABLE
-- Stores scheduled events and meetings
-- ============================================
CREATE TABLE IF NOT EXISTS events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    description TEXT,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER,
    location TEXT,                        -- Voice channel name or physical location
    organizer_id TEXT NOT NULL,           -- Discord user ID of organizer
    event_type TEXT DEFAULT 'meeting',    -- meeting, study, social, competition
    is_active BOOLEAN DEFAULT true,
    max_attendees INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_events_date ON events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_organizer ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_events_active ON events(is_active);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type);

-- ============================================
-- 13. EVENT_ATTENDEES TABLE
-- Tracks who is attending which events
-- ============================================
CREATE TABLE IF NOT EXISTS event_attendees (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    status TEXT DEFAULT 'registered',     -- registered, attended, cancelled
    joined_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_event_attendees_event ON event_attendees(event_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_user ON event_attendees(user_id);
CREATE INDEX IF NOT EXISTS idx_event_attendees_status ON event_attendees(status);

-- ============================================
-- 14. MEETING_LOGS TABLE
-- Stores summary of meetings and discussions
-- ============================================
CREATE TABLE IF NOT EXISTS meeting_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_id UUID REFERENCES events(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    summary TEXT,
    attendee_count INTEGER,
    duration_minutes INTEGER,
    key_points TEXT,                      -- JSON array of key discussion points
    action_items TEXT,                    -- JSON array of action items
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_logs_event ON meeting_logs(event_id);
CREATE INDEX IF NOT EXISTS idx_meeting_logs_date ON meeting_logs(created_at);

-- ============================================
-- 15. STUDY_LOGS TABLE
-- Tracks study sessions and progress
-- ============================================
CREATE TABLE IF NOT EXISTS study_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    topic TEXT,
    duration_minutes INTEGER,
    difficulty_level TEXT,                -- beginner, intermediate, advanced
    resources_used TEXT,                  -- URLs or resource names
    notes TEXT,
    completed BOOLEAN DEFAULT false,
    study_date DATE NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, study_date, topic)
);

CREATE INDEX IF NOT EXISTS idx_study_logs_user ON study_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_study_logs_date ON study_logs(study_date);
CREATE INDEX IF NOT EXISTS idx_study_logs_topic ON study_logs(topic);

-- ============================================
-- 16. CHALLENGES TABLE
-- Stores active challenges and competitions
-- ============================================
CREATE TABLE IF NOT EXISTS challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_name TEXT NOT NULL,
    description TEXT,
    challenge_type TEXT,                  -- coding, study, fitness, creative
    start_date TIMESTAMP WITH TIME ZONE NOT NULL,
    end_date TIMESTAMP WITH TIME ZONE NOT NULL,
    reward_type TEXT,                     -- points, badge, recognition
    reward_value INTEGER,
    created_by TEXT NOT NULL,             -- Discord user ID
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenges_type ON challenges(challenge_type);
CREATE INDEX IF NOT EXISTS idx_challenges_active ON challenges(is_active);
CREATE INDEX IF NOT EXISTS idx_challenges_date ON challenges(start_date);

-- ============================================
-- 17. CHALLENGE_PARTICIPANTS TABLE
-- Tracks challenge participation and scores
-- ============================================
CREATE TABLE IF NOT EXISTS challenge_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    challenge_id UUID NOT NULL REFERENCES challenges(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    submissions_count INTEGER DEFAULT 0,
    status TEXT DEFAULT 'active',         -- active, completed, abandoned
    joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE,
    UNIQUE(challenge_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_challenge_participants_challenge ON challenge_participants(challenge_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_user ON challenge_participants(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_participants_score ON challenge_participants(challenge_id, score DESC);

-- ============================================
-- 18. ACHIEVEMENTS TABLE
-- Stores earned badges and achievements
-- ============================================
CREATE TABLE IF NOT EXISTS achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    icon_emoji TEXT,
    criteria TEXT,                        -- How to earn this achievement
    difficulty TEXT DEFAULT 'normal',     -- easy, normal, hard, legendary
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 19. USER_ACHIEVEMENTS TABLE
-- Tracks which achievements users have earned
-- ============================================
CREATE TABLE IF NOT EXISTS user_achievements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    achievement_id UUID NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
    earned_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, achievement_id)
);

CREATE INDEX IF NOT EXISTS idx_user_achievements_user ON user_achievements(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievements_achievement ON user_achievements(achievement_id);

-- ============================================
-- 20. FEEDBACK TABLE
-- Stores user feedback and suggestions
-- ============================================
CREATE TABLE IF NOT EXISTS feedback (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    feedback_type TEXT,                   -- bug, feature_request, suggestion, complaint
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    status TEXT DEFAULT 'open',           -- open, reviewed, acknowledged, resolved
    priority TEXT DEFAULT 'normal',       -- low, normal, high, critical
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(feedback_type);

-- ============================================
-- 21. BOT_LOGS TABLE
-- Tracks bot activity and errors
-- ============================================
CREATE TABLE IF NOT EXISTS bot_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    log_level TEXT,                       -- info, warning, error, critical
    message TEXT NOT NULL,
    context JSONB,                        -- Additional context as JSON
    error_stack TEXT,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bot_logs_level ON bot_logs(log_level);
CREATE INDEX IF NOT EXISTS idx_bot_logs_timestamp ON bot_logs(timestamp DESC);

-- ============================================
-- 22. ANNOUNCEMENTS TABLE
-- Stores community announcements
-- ============================================
CREATE TABLE IF NOT EXISTS announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    author_id TEXT NOT NULL,
    channel_id TEXT,                      -- Discord channel where posted
    message_id TEXT,                      -- Discord message ID
    announcement_type TEXT DEFAULT 'general', -- general, important, event, maintenance
    is_pinned BOOLEAN DEFAULT false,
    expires_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_announcements_author ON announcements(author_id);
CREATE INDEX IF NOT EXISTS idx_announcements_type ON announcements(announcement_type);
CREATE INDEX IF NOT EXISTS idx_announcements_pinned ON announcements(is_pinned);

-- ============================================
-- ENABLE ROW LEVEL SECURITY (RLS)
-- Required for Supabase security
-- ============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE birthdays ENABLE ROW LEVEL SECURITY;
ALTER TABLE festivals ENABLE ROW LEVEL SECURITY;
ALTER TABLE festival_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE progress_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_progress_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE voice_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE heartbeat_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_attendees ENABLE ROW LEVEL SECURITY;
ALTER TABLE meeting_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE study_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE challenge_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_achievements ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- ============================================
-- CREATE POLICIES FOR BOT ACCESS
-- Allows the bot (using anon/service key) full access
-- ============================================
CREATE POLICY "Enable all for anon" ON users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON birthdays FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON festivals FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON festival_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON daily_reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON reminders FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON progress_updates FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON user_progress_stats FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON voice_points FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON voice_sessions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON heartbeat_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON events FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON event_attendees FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON meeting_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON study_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON challenges FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON challenge_participants FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON user_achievements FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON feedback FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON bot_logs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Enable all for anon" ON announcements FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- SCHEMA SUMMARY
-- ============================================
-- Total Tables: 22
-- 
-- Core User Management (3 tables)
-- - users: Member profiles and tier tracking
-- - birthdays: Birthday tracking
-- - user_achievements: Achievement system
--
-- Community Features (6 tables)
-- - events: Scheduled meetings and events
-- - event_attendees: Event participation
-- - meeting_logs: Meeting summaries
-- - announcements: Community announcements
-- - feedback: User feedback and suggestions
-- - achievements: Badge and achievement definitions
--
-- Progress & Gamification (4 tables)
-- - progress_updates: Daily progress tracking
-- - user_progress_stats: Aggregated progress data
-- - voice_points: Voice activity gamification
-- - voice_sessions: Voice session history
--
-- Reminders & Notifications (2 tables)
-- - daily_reminders: Recurring reminders
-- - reminders: One-time reminders
--
-- Challenges & Competitions (2 tables)
-- - challenges: Challenge definitions
-- - challenge_participants: Challenge scores
--
-- Learning (1 table)
-- - study_logs: Study session tracking
--
-- Cultural (2 tables)
-- - festivals: Festival dates and information
-- - festival_updates: Festival data refresh tracking
--
-- Admin & Monitoring (2 tables)
-- - heartbeat_logs: Database keep-alive
-- - bot_logs: Bot activity and error logs
-- ============================================
