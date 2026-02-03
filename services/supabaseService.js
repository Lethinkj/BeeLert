// Supabase Database Service
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

let supabase = null;
let isConfigured = false;

if (supabaseUrl && supabaseKey) {
    supabase = createClient(supabaseUrl, supabaseKey);
    isConfigured = true;
    console.log('✅ Supabase database service initialized');
} else {
    console.log('⚠️  Warning: Supabase not configured. Using local data.');
}

// ==================== BIRTHDAY OPERATIONS ====================

/**
 * Get all birthdays from database
 * @returns {Promise<Array>} - Array of birthday objects
 */
async function getBirthdays() {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('birthdays')
        .select('*')
        .order('date');
    
    if (error) {
        console.error('❌ Error fetching birthdays:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Add a new birthday
 * @param {string} userId - Discord user ID
 * @param {string} name - User's name
 * @param {string} date - Birthday date (DD/MM format)
 * @returns {Promise<Object|null>} - Created birthday or null
 */
async function addBirthday(userId, name, date) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('birthdays')
        .insert([{ user_id: userId, name, date }])
        .select()
        .single();
    
    if (error) {
        console.error('❌ Error adding birthday:', error.message);
        return null;
    }
    return data;
}

/**
 * Update a birthday
 * @param {string} userId - Discord user ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object|null>} - Updated birthday or null
 */
async function updateBirthday(userId, updates) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('birthdays')
        .update(updates)
        .eq('user_id', userId)
        .select()
        .single();
    
    if (error) {
        console.error('❌ Error updating birthday:', error.message);
        return null;
    }
    return data;
}

/**
 * Delete a birthday
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteBirthday(userId) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('birthdays')
        .delete()
        .eq('user_id', userId);
    
    if (error) {
        console.error('❌ Error deleting birthday:', error.message);
        return false;
    }
    return true;
}

/**
 * Get birthday by user ID
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>} - Birthday object or null
 */
async function getBirthdayByUserId(userId) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('birthdays')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    if (error) return null;
    return data;
}

// ==================== FESTIVAL OPERATIONS ====================

/**
 * Get all festivals from database
 * @returns {Promise<Array>} - Array of festival objects
 */
async function getFestivals() {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('festivals')
        .select('*')
        .order('date');
    
    if (error) {
        console.error('❌ Error fetching festivals:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Add a new festival
 * @param {string} name - Festival name
 * @param {string} date - Festival date (DD/MM format)
 * @param {string} emoji - Festival emoji
 * @param {string} type - Festival type (global/south_indian)
 * @returns {Promise<Object|null>} - Created festival or null
 */
async function addFestival(name, date, emoji, type) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('festivals')
        .insert([{ name, date, emoji, type }])
        .select()
        .single();
    
    if (error) {
        console.error('❌ Error adding festival:', error.message);
        return null;
    }
    return data;
}

/**
 * Delete a festival
 * @param {string} festivalId - Festival ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteFestival(festivalId) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('festivals')
        .delete()
        .eq('id', festivalId);
    
    if (error) {
        console.error('❌ Error deleting festival:', error.message);
        return false;
    }
    return true;
}

/**
 * Clear all festivals from database
 * @returns {Promise<boolean>} - Success status
 */
async function clearFestivals() {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('festivals')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all rows
    
    if (error) {
        console.error('❌ Error clearing festivals:', error.message);
        return false;
    }
    console.log('🗑️ Cleared all existing festivals');
    return true;
}

/**
 * Log festival data update
 * @param {number} year - Year the festivals are for
 * @param {number} count - Number of festivals added
 * @returns {Promise<boolean>} - Success status
 */
async function logFestivalUpdate(year, count) {
    if (!isConfigured) return false;
    
    try {
        const { error } = await supabase
            .from('festival_updates')
            .upsert([{
                year: year,
                updated_at: new Date().toISOString(),
                festival_count: count
            }], { onConflict: 'year' });
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('❌ Error logging festival update:', error.message);
        return false;
    }
}

/**
 * Get last festival update info
 * @returns {Promise<Object|null>} - Last update info or null
 */
async function getLastFestivalUpdate() {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('festival_updates')
        .select('*')
        .order('year', { ascending: false })
        .limit(1)
        .single();
    
    if (error) return null;
    return data;
}

/**
 * Update a festival by name
 * @param {string} festivalName - Name of the festival
 * @param {Object} updates - Fields to update (e.g., {date: '15/01'})
 * @returns {Promise<boolean>} - Success status
 */
async function updateFestivalByName(festivalName, updates) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('festivals')
        .update(updates)
        .ilike('name', `%${festivalName}%`);
    
    if (error) {
        console.error('❌ Error updating festival:', error.message);
        return false;
    }
    return true;
}

// ==================== REMINDER OPERATIONS ====================

/**
 * Get reminders (optionally filtered by user)
 * @param {string|null} userId - Discord user ID (optional)
 * @returns {Promise<Array>} - Array of reminder objects
 */
async function getReminders(userId = null) {
    if (!isConfigured) return [];
    
    let query = supabase
        .from('reminders')
        .select('*')
        .eq('is_completed', false)
        .order('reminder_date');
    
    if (userId) {
        query = query.eq('user_id', userId);
    }
    
    const { data, error } = await query;
    
    if (error) {
        console.error('❌ Error fetching reminders:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Get due reminders (reminders that should trigger now)
 * @returns {Promise<Array>} - Array of due reminder objects
 */
async function getDueReminders() {
    if (!isConfigured) return [];
    
    const now = new Date().toISOString();
    
    const { data, error } = await supabase
        .from('reminders')
        .select('*')
        .eq('is_completed', false)
        .lte('reminder_date', now);
    
    if (error) {
        console.error('❌ Error fetching due reminders:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Add a new reminder
 * @param {string} userId - Discord user ID
 * @param {string} reminderText - Reminder message
 * @param {Date|string} reminderDate - When to remind
 * @returns {Promise<Object|null>} - Created reminder or null
 */
async function addReminder(userId, reminderText, reminderDate) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('reminders')
        .insert([{ 
            user_id: userId, 
            reminder_text: reminderText, 
            reminder_date: reminderDate instanceof Date ? reminderDate.toISOString() : reminderDate
        }])
        .select()
        .single();
    
    if (error) {
        console.error('❌ Error adding reminder:', error.message);
        return null;
    }
    return data;
}

/**
 * Mark a reminder as completed
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<boolean>} - Success status
 */
async function completeReminder(reminderId) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('reminders')
        .update({ is_completed: true })
        .eq('id', reminderId);
    
    if (error) {
        console.error('❌ Error completing reminder:', error.message);
        return false;
    }
    return true;
}

/**
 * Delete a reminder
 * @param {string} reminderId - Reminder ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteReminder(reminderId) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('reminders')
        .delete()
        .eq('id', reminderId);
    
    if (error) {
        console.error('❌ Error deleting reminder:', error.message);
        return false;
    }
    return true;
}

// ==================== DAILY REMINDER OPERATIONS ====================

/**
 * Get all active daily reminders
 * @returns {Promise<Array>} - Array of daily reminder objects
 */
async function getAllDailyReminders() {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('daily_reminders')
        .select('*')
        .eq('is_active', true);
    
    if (error) {
        console.error('❌ Error fetching daily reminders:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Get daily reminder for a specific user
 * @param {string} userId - Discord user ID
 * @returns {Promise<Object|null>} - Daily reminder or null
 */
async function getDailyReminder(userId) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('daily_reminders')
        .select('*')
        .eq('user_id', userId)
        .single();
    
    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
        console.error('❌ Error fetching daily reminder:', error.message);
        return null;
    }
    return data;
}

/**
 * Add or update a daily reminder
 * @param {string} userId - Discord user ID
 * @param {string} time - Time in HH:MM format (24hr)
 * @param {string|null} customMessage - Optional custom message
 * @returns {Promise<Object|null>} - Created/updated reminder or null
 */
async function saveDailyReminder(userId, time, customMessage = null) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('daily_reminders')
        .upsert([{ 
            user_id: userId, 
            time: time, 
            custom_message: customMessage,
            is_active: true,
            updated_at: new Date().toISOString()
        }], {
            onConflict: 'user_id'
        })
        .select()
        .single();
    
    if (error) {
        console.error('❌ Error saving daily reminder:', error.message);
        return null;
    }
    return data;
}

/**
 * Update daily reminder active status
 * @param {string} userId - Discord user ID
 * @param {boolean} isActive - Whether reminder is active
 * @returns {Promise<boolean>} - Success status
 */
async function updateDailyReminderStatus(userId, isActive) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('daily_reminders')
        .update({ is_active: isActive, updated_at: new Date().toISOString() })
        .eq('user_id', userId);
    
    if (error) {
        console.error('❌ Error updating daily reminder status:', error.message);
        return false;
    }
    return true;
}

/**
 * Delete a daily reminder
 * @param {string} userId - Discord user ID
 * @returns {Promise<boolean>} - Success status
 */
async function deleteDailyReminder(userId) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('daily_reminders')
        .delete()
        .eq('user_id', userId);
    
    if (error) {
        console.error('❌ Error deleting daily reminder:', error.message);
        return false;
    }
    return true;
}

// ==================== USER OPERATIONS ====================

/**
 * Get all users from database
 * @returns {Promise<Array>} - Array of user objects
 */
async function getUsers() {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('users')
        .select('*');
    
    if (error) {
        console.error('❌ Error fetching users:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Get clan members
 * @returns {Promise<Array>} - Array of clan member objects
 */
async function getClanMembers() {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('is_clan_member', true);
    
    if (error) {
        console.error('❌ Error fetching clan members:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Add a new user
 * @param {string} discordUserId - Discord user ID
 * @param {string} username - Discord username
 * @param {boolean} isClanMember - Is clan member
 * @returns {Promise<Object|null>} - Created user or null
 */
async function addUser(discordUserId, username, isClanMember = false) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('users')
        .insert([{ 
            discord_user_id: discordUserId, 
            username, 
            is_clan_member: isClanMember 
        }])
        .select()
        .single();
    
    if (error) {
        console.error('❌ Error adding user:', error.message);
        return null;
    }
    return data;
}

/**
 * Update user's last activity
 * @param {string} discordUserId - Discord user ID
 * @returns {Promise<boolean>} - Success status
 */
async function updateUserActivity(discordUserId) {
    if (!isConfigured) return false;
    
    const { error } = await supabase
        .from('users')
        .update({ last_active: new Date().toISOString() })
        .eq('discord_user_id', discordUserId);
    
    if (error) {
        console.error('❌ Error updating user activity:', error.message);
        return false;
    }
    return true;
}

/**
 * Get or create user
 * @param {string} discordUserId - Discord user ID
 * @param {string} username - Discord username
 * @returns {Promise<Object|null>} - User object or null
 */
async function getOrCreateUser(discordUserId, username) {
    if (!isConfigured) return null;
    
    // Try to get existing user
    const { data: existingUser } = await supabase
        .from('users')
        .select('*')
        .eq('discord_user_id', discordUserId)
        .single();
    
    if (existingUser) {
        // Update activity and return
        await updateUserActivity(discordUserId);
        return existingUser;
    }
    
    // Create new user
    return await addUser(discordUserId, username, false);
}

// ==================== UTILITY FUNCTIONS ====================

/**
 * Check if Supabase is configured
 * @returns {boolean} - Configuration status
 */
function isSupabaseConfigured() {
    return isConfigured;
}

/**
 * Test database connection
 * @returns {Promise<boolean>} - Connection status
 */
async function testConnection() {
    if (!isConfigured) return false;
    
    try {
        const { error } = await supabase.from('birthdays').select('count').limit(1);
        return !error;
    } catch {
        return false;
    }
}

// ==================== HEARTBEAT/LOG OPERATIONS ====================

/**
 * Write a heartbeat log to keep database active (prevents Supabase pause)
 * @returns {Promise<boolean>} - Success status
 */
async function writeHeartbeat() {
    if (!isConfigured) return false;
    
    try {
        const now = new Date().toISOString();
        const today = now.split('T')[0]; // YYYY-MM-DD
        
        // Try to update existing heartbeat for today
        const { data: existing } = await supabase
            .from('heartbeat_logs')
            .select('id')
            .eq('log_date', today)
            .single();
        
        if (existing) {
            // Update existing record
            const { error } = await supabase
                .from('heartbeat_logs')
                .update({ 
                    last_ping: now,
                    ping_count: supabase.rpc ? undefined : 1 // Increment handled by trigger if exists
                })
                .eq('id', existing.id);
            
            if (error) throw error;
            console.log(`💓 Heartbeat updated: ${now}`);
        } else {
            // Insert new record for today
            const { error } = await supabase
                .from('heartbeat_logs')
                .insert([{ 
                    log_date: today,
                    first_ping: now,
                    last_ping: now,
                    ping_count: 1,
                    bot_status: 'online'
                }]);
            
            if (error) throw error;
            console.log(`💓 New heartbeat log created: ${today}`);
        }
        
        return true;
    } catch (error) {
        console.error('❌ Error writing heartbeat:', error.message);
        return false;
    }
}

/**
 * Get recent heartbeat logs
 * @param {number} days - Number of days to retrieve
 * @returns {Promise<Array>} - Array of heartbeat logs
 */
async function getHeartbeatLogs(days = 7) {
    if (!isConfigured) return [];
    
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);
    
    const { data, error } = await supabase
        .from('heartbeat_logs')
        .select('*')
        .gte('log_date', startDate.toISOString().split('T')[0])
        .order('log_date', { ascending: false });
    
    if (error) {
        console.error('❌ Error fetching heartbeat logs:', error.message);
        return [];
    }
    return data || [];
}

// ==================== VOICE POINTS OPERATIONS ====================

/**
 * Add voice points to a user
 * @param {string} discordUserId - Discord user ID
 * @param {string} username - Discord username
 * @param {number} points - Points to add
 * @param {number} minutes - Minutes to add
 * @returns {Promise<Object|null>} - Updated record or null
 */
async function addVoicePoints(discordUserId, username, points, minutes) {
    if (!isConfigured) return null;
    
    try {
        // Get current month/year for tracking
        const now = new Date();
        const monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        // Check if user has record for this month
        const { data: existing } = await supabase
            .from('voice_points')
            .select('*')
            .eq('discord_user_id', discordUserId)
            .eq('month_year', monthYear)
            .single();
        
        if (existing) {
            // Update existing record
            const { data, error } = await supabase
                .from('voice_points')
                .update({
                    username: username,
                    total_points: existing.total_points + points,
                    total_minutes: existing.total_minutes + minutes,
                    last_updated: new Date().toISOString()
                })
                .eq('id', existing.id)
                .select()
                .single();
            
            if (error) throw error;
            return data;
        } else {
            // Create new record
            const { data, error } = await supabase
                .from('voice_points')
                .insert([{
                    discord_user_id: discordUserId,
                    username: username,
                    total_points: points,
                    total_minutes: minutes,
                    month_year: monthYear,
                    last_updated: new Date().toISOString()
                }])
                .select()
                .single();
            
            if (error) throw error;
            return data;
        }
    } catch (error) {
        console.error('❌ Error adding voice points:', error.message);
        return null;
    }
}

/**
 * Get user's voice points for a specific month
 * @param {string} discordUserId - Discord user ID
 * @param {string} monthYear - Month in MM/YYYY format (optional)
 * @returns {Promise<Object|null>} - User's points data or null
 */
async function getUserVoicePoints(discordUserId, monthYear = null) {
    if (!isConfigured) return null;
    
    if (!monthYear) {
        const now = new Date();
        monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    } else {
        // Convert MM/YYYY to YYYY-MM format
        const [month, year] = monthYear.split('/');
        monthYear = `${year}-${month}`;
    }
    
    const { data, error } = await supabase
        .from('voice_points')
        .select('*')
        .eq('discord_user_id', discordUserId)
        .eq('month_year', monthYear)
        .single();
    
    if (error) return null;
    return data;
}

/**
 * Get user's all-time voice points
 * @param {string} discordUserId - Discord user ID
 * @returns {Promise<Object>} - Total points and minutes
 */
async function getUserAllTimePoints(discordUserId) {
    if (!isConfigured) return { total_points: 0, total_minutes: 0 };
    
    const { data, error } = await supabase
        .from('voice_points')
        .select('total_points, total_minutes')
        .eq('discord_user_id', discordUserId);
    
    if (error || !data) return { total_points: 0, total_minutes: 0 };
    
    return data.reduce((acc, row) => ({
        total_points: acc.total_points + row.total_points,
        total_minutes: acc.total_minutes + row.total_minutes
    }), { total_points: 0, total_minutes: 0 });
}

/**
 * Get monthly leaderboard
 * @param {number} limit - Number of top users to return
 * @param {number} month - Month number (1-12)
 * @param {number} year - Year
 * @returns {Promise<Array>} - Leaderboard data
 */
async function getMonthlyLeaderboard(limit = 10, month = null, year = null) {
    if (!isConfigured) return [];
    
    let monthYear;
    if (month && year) {
        monthYear = `${year}-${String(month).padStart(2, '0')}`;
    } else {
        const now = new Date();
        monthYear = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    }
    
    const { data, error } = await supabase
        .from('voice_points')
        .select('*')
        .eq('month_year', monthYear)
        .order('total_points', { ascending: false })
        .limit(limit);
    
    if (error) {
        console.error('❌ Error fetching leaderboard:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Get all-time leaderboard
 * @param {number} limit - Number of top users to return
 * @returns {Promise<Array>} - Leaderboard data
 */
async function getAllTimeLeaderboard(limit = 10) {
    if (!isConfigured) return [];
    
    // This query aggregates all months for each user
    const { data, error } = await supabase
        .from('voice_points')
        .select('discord_user_id, username, total_points, total_minutes');
    
    if (error || !data) {
        console.error('❌ Error fetching all-time leaderboard:', error?.message);
        return [];
    }
    
    // Aggregate by user
    const userTotals = {};
    for (const row of data) {
        if (!userTotals[row.discord_user_id]) {
            userTotals[row.discord_user_id] = {
                discord_user_id: row.discord_user_id,
                username: row.username,
                total_points: 0,
                total_minutes: 0
            };
        }
        userTotals[row.discord_user_id].total_points += row.total_points;
        userTotals[row.discord_user_id].total_minutes += row.total_minutes;
    }
    
    // Sort and limit
    return Object.values(userTotals)
        .sort((a, b) => b.total_points - a.total_points)
        .slice(0, limit);
}

/**
 * Log voice session
 * @param {string} discordUserId - Discord user ID
 * @param {string} username - Discord username
 * @param {string} channelId - Voice channel ID
 * @param {string} channelName - Voice channel name
 * @param {number} durationMinutes - Session duration in minutes
 * @param {number} pointsEarned - Points earned in session
 * @returns {Promise<boolean>} - Success status
 */
async function logVoiceSession(discordUserId, username, channelId, channelName, durationMinutes, pointsEarned) {
    if (!isConfigured) return false;
    
    try {
        const { error } = await supabase
            .from('voice_sessions')
            .insert([{
                discord_user_id: discordUserId,
                username: username,
                channel_id: channelId,
                channel_name: channelName,
                duration_minutes: durationMinutes,
                points_earned: pointsEarned,
                session_date: new Date().toISOString()
            }]);
        
        if (error) throw error;
        return true;
    } catch (error) {
        console.error('❌ Error logging voice session:', error.message);
        return false;
    }
}

/**
 * Get user's recent voice sessions
 * @param {string} discordUserId - Discord user ID
 * @param {number} limit - Number of sessions to return
 * @returns {Promise<Array>} - Recent sessions
 */
async function getUserVoiceSessions(discordUserId, limit = 10) {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('voice_sessions')
        .select('*')
        .eq('discord_user_id', discordUserId)
        .order('session_date', { ascending: false })
        .limit(limit);
    
    if (error) return [];
    return data || [];
}

module.exports = {
    supabase,
    isSupabaseConfigured,
    testConnection,
    // Heartbeat
    writeHeartbeat,
    getHeartbeatLogs,
    // Birthdays
    getBirthdays,
    addBirthday,
    updateBirthday,
    deleteBirthday,
    getBirthdayByUserId,
    // Festivals
    getFestivals,
    addFestival,
    deleteFestival,
    clearFestivals,
    logFestivalUpdate,
    getLastFestivalUpdate,
    updateFestivalByName,
    // Reminders (one-time)
    getReminders,
    getDueReminders,
    addReminder,
    completeReminder,
    deleteReminder,
    // Daily Reminders (recurring)
    getAllDailyReminders,
    getDailyReminder,
    saveDailyReminder,
    updateDailyReminderStatus,
    deleteDailyReminder,
    // Users
    getUsers,
    getClanMembers,
    addUser,
    updateUserActivity,
    getOrCreateUser,
    // Voice Points
    addVoicePoints,
    getUserVoicePoints,
    getUserAllTimePoints,
    getMonthlyLeaderboard,
    getAllTimeLeaderboard,
    logVoiceSession,
    getUserVoiceSessions,
    // Progress Tracking
    recordProgressUpdate,
    getUserProgressStats,
    getProgressLeaderboard,
    hasPostedToday
};

// ==================== PROGRESS TRACKING OPERATIONS ====================

/**
 * Record a progress update with points and streak
 */
async function recordProgressUpdate(discordUserId, username, content, wordCount, hasImage, aiFeedback) {
    if (!isConfigured) return null;
    
    try {
        // Use IST timezone for consistent date tracking
        const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
        const today = nowIST.toISOString().split('T')[0];
        
        let { data: userStats } = await supabase
            .from('user_progress_stats')
            .select('*')
            .eq('discord_user_id', discordUserId)
            .single();
        
        let currentStreak = 1;
        let longestStreak = 1;
        let totalPoints = 5;
        let totalUpdates = 1;
        
        if (userStats) {
            const lastUpdate = new Date(userStats.last_update_date);
            const todayDate = new Date(today);
            const diffDays = Math.floor((todayDate - lastUpdate) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 1) {
                currentStreak = userStats.current_streak + 1;
            } else if (diffDays === 0) {
                currentStreak = userStats.current_streak;
            } else {
                currentStreak = 1;
            }
            
            longestStreak = Math.max(currentStreak, userStats.longest_streak);
            totalPoints = userStats.total_points + 5;
            totalUpdates = userStats.total_updates + 1;
            
            const { error: statsError } = await supabase
                .from('user_progress_stats')
                .update({
                    username: username,
                    total_points: totalPoints,
                    current_streak: currentStreak,
                    longest_streak: longestStreak,
                    last_update_date: today,
                    total_updates: totalUpdates,
                    updated_at: new Date().toISOString()
                })
                .eq('discord_user_id', discordUserId);
            
            if (statsError) {
                console.error('❌ Error updating progress stats:', statsError.message);
                return null;
            }
        } else {
            const { error: insertError } = await supabase
                .from('user_progress_stats')
                .insert({
                    discord_user_id: discordUserId,
                    username: username,
                    total_points: 5,
                    current_streak: 1,
                    longest_streak: 1,
                    last_update_date: today,
                    total_updates: 1
                });
            
            if (insertError) {
                console.error('❌ Error creating progress stats:', insertError.message);
                return null;
            }
        }
        
        const { data: progressUpdate, error: updateError } = await supabase
            .from('progress_updates')
            .insert({
                discord_user_id: discordUserId,
                username: username,
                content: content,
                word_count: wordCount,
                has_image: hasImage,
                points_awarded: 5,
                current_streak: currentStreak,
                ai_feedback: aiFeedback,
                update_date: today
            })
            .select()
            .single();
        
        if (updateError) {
            console.error('❌ Error recording progress update:', updateError.message);
            return null;
        }
        
        return {
            ...progressUpdate,
            total_points: totalPoints,
            current_streak: currentStreak
        };
    } catch (error) {
        console.error('❌ Error in recordProgressUpdate:', error.message);
        return null;
    }
}

/**
 * Get user progress stats
 */
async function getUserProgressStats(discordUserId) {
    if (!isConfigured) return null;
    
    const { data, error } = await supabase
        .from('user_progress_stats')
        .select('*')
        .eq('discord_user_id', discordUserId)
        .single();
    
    if (error && error.code !== 'PGRST116') {
        console.error('❌ Error fetching user progress stats:', error.message);
    }
    return data;
}

/**
 * Get progress leaderboard
 */
async function getProgressLeaderboard(limit = 10) {
    if (!isConfigured) return [];
    
    const { data, error } = await supabase
        .from('user_progress_stats')
        .select('*')
        .order('total_points', { ascending: false })
        .limit(limit);
    
    if (error) {
        console.error('❌ Error fetching progress leaderboard:', error.message);
        return [];
    }
    return data || [];
}

/**
 * Check if user already posted today
 */
async function hasPostedToday(discordUserId) {
    if (!isConfigured) return false;
    
    // Use IST timezone for consistent date tracking
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    const today = nowIST.toISOString().split('T')[0];
    
    const { data } = await supabase
        .from('progress_updates')
        .select('id')
        .eq('discord_user_id', discordUserId)
        .eq('update_date', today)
        .single();
    
    return data !== null;
}
