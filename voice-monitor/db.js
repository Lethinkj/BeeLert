const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const LOCAL_SESSIONS_FILE = path.join(__dirname, '..', 'voice-monitor-sessions.json');
const LOCAL_REPORTS_FILE = path.join(__dirname, '..', 'voice-monitor-reports.json');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
let isSupabaseReady = false;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        isSupabaseReady = true;
    } catch (e) {
        console.warn('⚠️ [Voice Monitor DB] Supabase client init failed:', e.message);
    }
}

// Local JSON File Helpers
function loadLocalJson(filePath, defaultVal = []) {
    try {
        if (fs.existsSync(filePath)) {
            const raw = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(raw);
        }
    } catch (e) {
        console.error(`❌ [Voice Monitor DB] Error reading ${filePath}:`, e.message);
    }
    return defaultVal;
}

function saveLocalJson(filePath, data) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`❌ [Voice Monitor DB] Error writing ${filePath}:`, e.message);
    }
}

/**
 * Save a completed or updated voice session.
 */
async function saveVoiceSession(sessionData) {
    const {
        sessionId,
        discordUserId,
        username,
        guildId,
        voiceChannelId,
        joinTime,
        leaveTime,
        durationSeconds,
        sessionDate
    } = sessionData;

    // 1. Local Backup Storage
    const local = loadLocalJson(LOCAL_SESSIONS_FILE, []);
    const idx = local.findIndex(s => s.sessionId === sessionId);
    const sessionObj = {
        sessionId,
        discordUserId,
        username,
        guildId,
        voiceChannelId,
        joinTime: new Date(joinTime).toISOString(),
        leaveTime: leaveTime ? new Date(leaveTime).toISOString() : null,
        durationSeconds: durationSeconds || 0,
        sessionDate
    };

    if (idx >= 0) {
        local[idx] = sessionObj;
    } else {
        local.push(sessionObj);
    }
    saveLocalJson(LOCAL_SESSIONS_FILE, local);

    // 2. Supabase Storage (if connected)
    if (isSupabaseReady) {
        try {
            const { error } = await supabase
                .from('daily_voice_monitor_sessions')
                .upsert({
                    session_id: sessionId,
                    discord_user_id: discordUserId,
                    username: username,
                    guild_id: guildId,
                    voice_channel_id: voiceChannelId,
                    join_time: new Date(joinTime).toISOString(),
                    leave_time: leaveTime ? new Date(leaveTime).toISOString() : null,
                    duration_seconds: durationSeconds || 0,
                    session_date: sessionDate
                }, { onConflict: 'session_id' });

            if (error) {
                console.warn('⚠️ [Voice Monitor DB] Supabase upsert session error:', error.message);
            }
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] Supabase session save exception:', e.message);
        }
    }

    return sessionObj;
}

/**
 * Get all completed sessions for a specific date (YYYY-MM-DD in IST).
 */
async function getSessionsForDate(dateStr) {
    if (isSupabaseReady) {
        try {
            const { data, error } = await supabase
                .from('daily_voice_monitor_sessions')
                .select('*')
                .eq('session_date', dateStr);

            if (!error && data && data.length > 0) {
                return data.map(s => ({
                    sessionId: s.session_id,
                    discordUserId: s.discord_user_id,
                    username: s.username,
                    guildId: s.guild_id,
                    voiceChannelId: s.voice_channel_id,
                    joinTime: s.join_time,
                    leaveTime: s.leave_time,
                    durationSeconds: s.duration_seconds,
                    sessionDate: s.session_date
                }));
            }
        } catch (e) {
            console.warn('⚠️ [Voice Monitor DB] Supabase query error, fallback to local JSON:', e.message);
        }
    }

    const local = loadLocalJson(LOCAL_SESSIONS_FILE, []);
    return local.filter(s => s.sessionDate === dateStr);
}

/**
 * Check if the 11 PM report for a specific date was already sent.
 */
async function hasReportBeenSent(dateStr) {
    if (isSupabaseReady) {
        try {
            const { data, error } = await supabase
                .from('daily_voice_report_logs')
                .select('id')
                .eq('report_date', dateStr)
                .limit(1);

            if (!error && data && data.length > 0) {
                return true;
            }
        } catch (e) {
            // ignore
        }
    }

    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    return reports.some(r => r.reportDate === dateStr);
}

/**
 * Mark 11 PM report as sent for a date.
 */
async function markReportSent(dateStr, stats = {}) {
    const reports = loadLocalJson(LOCAL_REPORTS_FILE, []);
    if (!reports.some(r => r.reportDate === dateStr)) {
        reports.push({ reportDate: dateStr, sentAt: new Date().toISOString(), ...stats });
        saveLocalJson(LOCAL_REPORTS_FILE, reports);
    }

    if (isSupabaseReady) {
        try {
            await supabase
                .from('daily_voice_report_logs')
                .upsert({
                    report_date: dateStr,
                    sent_at: new Date().toISOString(),
                    active_members_count: stats.activeMembersCount || 0,
                    total_seconds: stats.totalSeconds || 0
                }, { onConflict: 'report_date' });
        } catch (e) {
            // ignore
        }
    }
}

module.exports = {
    saveVoiceSession,
    getSessionsForDate,
    hasReportBeenSent,
    markReportSent
};
