const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, MessageFlags, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel, SlashCommandBuilder, REST, Routes } = require('discord.js');
const cron = require('node-cron');
const express = require('express');
require('dotenv').config();

// Import AI service
const aiService = require('./services/aiService');
// Import Supabase service
const supabaseService = require('./services/supabaseService');

// Create Express app for health check
const app = express();
const PORT = process.env.PORT || 3000;

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildScheduledEvents,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Channel]
});

// Configuration from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GEMINI_CHANNEL_ID = process.env.GEMINI_CHANNEL_ID;
const STUDY_CHANNEL_ID = process.env.STUDY_CHANNEL_ID;
const PROGRESS_CHANNEL_ID = process.env.PROGRESS_CHANNEL_ID || '1467890154164191343';
const ROOKIE_ROLE_ID = process.env.ROOKIE_ROLE_ID || '1358772531745521684';
const LOUNGE_VOICE_CHANNEL_ID = process.env.LOUNGE_VOICE_CHANNEL_ID || '1350324320672546826';
const AURA_VOICE_CHANNEL_ID = process.env.AURA_VOICE_CHANNEL_ID || '1350324320672546827';
const MEETING_ROOM1_CHANNEL_ID = process.env.MEETING_ROOM1_CHANNEL_ID || '1350324320672546828';
const MEETING_ROOM2_CHANNEL_ID = process.env.MEETING_ROOM2_CHANNEL_ID || '1367146219633119354';
const GUEST_VOICE_CHANNEL_ID = process.env.GUEST_VOICE_CHANNEL_ID || '1459945478488854641';
const MEETING_SUMMARY_CHANNEL_ID = process.env.MEETING_SUMMARY_CHANNEL_ID || '1442861248285773924';
const SCHEDULE_MEET_CHANNEL_ID = process.env.SCHEDULE_MEET_CHANNEL_ID || '1443135153185493033';
const ROLE_NAME = process.env.ROLE_NAME || 'Basher';
const CLAN_ROLE_ID = process.env.CLAN_ROLE_ID || '1350325011826868305';
const GUEST_ROLE_ID = process.env.GUEST_ROLE_ID || '1438467762929537076';
const WELCOME_CHANNEL_ID = process.env.WELCOME_CHANNEL_ID || '1438532221697921106';
const UPDATES_CHANNEL_ID = process.env.UPDATES_CHANNEL_ID || MEETING_SUMMARY_CHANNEL_ID;

// Available voice channels for scheduled meetings
const VOICE_CHANNELS = [
    { id: LOUNGE_VOICE_CHANNEL_ID, name: 'Lounge' },
    { id: AURA_VOICE_CHANNEL_ID, name: 'Aura-7f Space' },
    { id: MEETING_ROOM1_CHANNEL_ID, name: 'Meeting Room 1' },
    { id: MEETING_ROOM2_CHANNEL_ID, name: 'Meeting Room 2' },
    { id: GUEST_VOICE_CHANNEL_ID, name: 'Guest' }
];

// ============================================
// SLASH COMMANDS DEFINITION
// ============================================
const commands = [
    new SlashCommandBuilder()
        .setName('points')
        .setDescription('Check your voice activity points')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s points (optional)')
                .setRequired(false)),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View the voice activity leaderboard')
        .addStringOption(option =>
            option.setName('type')
                .setDescription('Leaderboard type')
                .setRequired(false)
                .addChoices(
                    { name: 'Monthly', value: 'monthly' },
                    { name: 'All Time', value: 'alltime' }
                )),
    new SlashCommandBuilder()
        .setName('mystats')
        .setDescription('View your detailed voice activity statistics')
].map(command => command.toJSON());

// Helper functions to get data from Supabase
async function getBirthdays() {
    if (supabaseService.isSupabaseConfigured()) {
        const dbBirthdays = await supabaseService.getBirthdays();
        if (dbBirthdays.length > 0) {
            return dbBirthdays.map(b => ({ userId: b.user_id, name: b.name, date: b.date }));
        }
    }
    console.log('⚠️ No birthdays found in database');
    return [];
}

async function getFestivals() {
    if (supabaseService.isSupabaseConfigured()) {
        const dbFestivals = await supabaseService.getFestivals();
        if (dbFestivals.length > 0) {
            return dbFestivals;
        }
    }
    console.log('⚠️ No festivals found in database');
    return [];
}

/**
 * Parse JSON from AI response (handles markdown code blocks and truncated responses)
 */
function parseJsonResponse(response) {
    let jsonText = response.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    
    try {
        if (jsonText.startsWith('[')) {
            if (!jsonText.endsWith(']')) {
                const lastCompleteIndex = jsonText.lastIndexOf('}');
                if (lastCompleteIndex > 0) {
                    jsonText = jsonText.substring(0, lastCompleteIndex + 1) + ']';
                }
            }
            return JSON.parse(jsonText);
        }
        
        const jsonMatch = jsonText.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }
    } catch (e) {
        console.error('JSON parse error:', e.message);
    }
    return null;
}

/**
 * Use AI to fetch festival dates for a given year and store in database
 * @param {number} year - The year to fetch festivals for
 * @returns {Promise<boolean>} - Success status
 */
async function fetchAndStoreFestivals(year) {
    console.log(`🎉 Fetching all Tamil Nadu festival dates for ${year} using AI...`);
    
    try {
        // Split into two requests to avoid response truncation
        const prompt1 = `List exact dates for these Tamil Nadu festivals in ${year}. Return ONLY JSON array, no markdown:
1. New Year (01/01) 2. Pongal (14/01) 3. Republic Day (26/01) 4. Thaipusam 5. Maha Shivaratri 6. Holi 7. Ramadan Start 8. Good Friday 9. Easter Sunday 10. Tamil New Year (14/04) 11. Eid ul-Fitr 12. Akshaya Tritiya 13. Vaigasi Visakam
Format: [{"name":"..","date":"DD/MM","emoji":"🎉","type":"hindu/muslim/christian/global"}]
Use: 🌾Pongal 🕉️Hindu 🌙Muslim ✝️Christian 🎆NewYear 🇮🇳National`;

        const prompt2 = `List exact dates for these Tamil Nadu festivals in ${year}. Return ONLY JSON array, no markdown:
1. Eid ul-Adha 2. Muharram 3. Independence Day (15/08) 4. Aadi Perukku 5. Onam 6. Krishna Jayanthi 7. Vinayagar Chaturthi 8. Milad-un-Nabi 9. Navaratri Start 10. Ayudha Puja 11. Dussehra 12. Diwali 13. Karthigai Deepam 14. Christmas (25/12)
Format: [{"name":"..","date":"DD/MM","emoji":"🎉","type":"hindu/muslim/christian/global"}]
Use: 🪔Diwali 🐘Ganesh 🏹Dussehra 🔥Karthigai 🌙Muslim 🌼Onam 🎄Christmas 🇮🇳National`;

        console.log('📡 Fetching Part 1 (Jan-Jun)...');
        const response1 = await aiService.askQuestion(prompt1);
        const festivals1 = parseJsonResponse(response1) || [];
        console.log(`   Got ${festivals1.length} festivals`);
        
        console.log('📡 Fetching Part 2 (Jul-Dec)...');
        const response2 = await aiService.askQuestion(prompt2);
        const festivals2 = parseJsonResponse(response2) || [];
        console.log(`   Got ${festivals2.length} festivals`);
        
        const festivals = [...festivals1, ...festivals2];
        
        if (festivals.length === 0) {
            console.error('❌ No festival data received');
            return false;
        }
        
        // Clear existing festivals for the year and add new ones
        console.log(`📝 Storing ${festivals.length} festivals for ${year}...`);
        
        // Delete existing festivals
        await supabaseService.clearFestivals();
        
        // Add new festivals
        for (const festival of festivals) {
            if (festival.name && festival.date) {
                await supabaseService.addFestival(
                    festival.name,
                    festival.date,
                    festival.emoji || '🎉',
                    festival.type || 'global'
                );
                console.log(`   ✅ ${festival.emoji || '🎉'} ${festival.name} - ${festival.date}`);
            }
        }
        
        // Log the update
        await supabaseService.logFestivalUpdate(year, festivals.length);
        
        console.log(`✅ Successfully updated festivals for ${year}`);
        return true;
    } catch (error) {
        console.error('❌ Error fetching festivals:', error.message);
        return false;
    }
}

/**
 * Verify festival date with AI before posting (for lunar calendar festivals that may shift)
 * @param {Object} festival - Festival object with name and date
 * @param {string} today - Today's date in DD/MM format
 * @param {number} year - Current year
 * @returns {Promise<{isToday: boolean, correctDate: string|null}>}
 */
async function verifyFestivalDate(festival, today, year) {
    // Skip verification for fixed-date festivals
    const fixedDateFestivals = ['New Year', 'Republic Day', 'Independence Day', 'Christmas', 'Tamil New Year', 'Puthandu', 'Pongal'];
    if (fixedDateFestivals.some(f => festival.name.toLowerCase().includes(f.toLowerCase()))) {
        return { isToday: festival.date === today, correctDate: null };
    }
    
    try {
        const prompt = `What is the EXACT date of ${festival.name} in the year ${year}?

IMPORTANT: I need the accurate date for this specific year (${year}).
- For Islamic festivals like Eid ul-Fitr, Eid ul-Adha, Muharram, Milad-un-Nabi: These follow the Islamic lunar calendar and shift approximately 10-11 days earlier each Gregorian year.
- For Hindu lunar festivals like Diwali, Dussehra, Navaratri: These follow the Hindu lunar calendar.

Return ONLY a JSON object with the ACTUAL date (day and month as numbers):
{"festivalName":"${festival.name}","correctDate":"06/06"}

The correctDate MUST be the actual numeric date like "06/06" or "15/09" - NOT the literal text "DD/MM".

Do NOT include any other text, explanation, or markdown. Just the JSON object with real numbers.`;

        const response = await aiService.askQuestion(prompt);
        
        // Parse response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            const result = JSON.parse(jsonMatch[0]);
            const correctDate = result.correctDate || null;
            
            // Only return isToday: true if the AI's correctDate matches today exactly
            // Don't trust AI's isToday field - calculate it ourselves
            const isToday = correctDate === today;
            
            console.log(`   📅 AI says ${festival.name} is on ${correctDate}, today is ${today}, match: ${isToday}`);
            
            return {
                isToday: isToday,
                correctDate: correctDate
            };
        }
    } catch (error) {
        console.error(`❌ Error verifying ${festival.name} date:`, error.message);
    }
    
    // Fallback to stored date comparison only (don't assume it's today)
    return { isToday: festival.date === today, correctDate: null };
}

/**
 * Update a single festival's date in the database
 * @param {string} festivalName - Name of the festival
 * @param {string} newDate - New date in DD/MM format
 */
async function updateFestivalDate(festivalName, newDate) {
    try {
        await supabaseService.updateFestivalByName(festivalName, { date: newDate });
        console.log(`📅 Updated ${festivalName} date to ${newDate}`);
    } catch (error) {
        console.error(`❌ Error updating ${festivalName} date:`, error.message);
    }
}

// Bot status tracking
let botStatus = {
    isOnline: false,
    connectedAt: null,
    lastMessageSent: null,
    totalMessagesSent: 0
};

// Voice channel meeting tracking
const voiceMeetings = new Map(); // channelId -> { startTime, participants: Map(userId -> joinTime), lastActivity }
const MINIMUM_MEETING_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

// Voice points tracking (1 point per 5 minutes)
const voicePointsTracking = new Map(); // discordUserId -> { joinedAt, channelId, channelName, lastPointsAwarded }
const POINTS_INTERVAL = 5 * 60 * 1000; // 5 minutes in milliseconds

// Scheduled meetings tracking
const scheduledMeetings = new Map(); // meetingId -> { time, topic, channelId, timeoutId, creatorId, confirmationMsg, startTime, endTime, date, status }
const activeMeetings = new Map(); // meetingId -> { actualStartTime, participants: Map(userId -> {username, joinedAt, leftAt, totalSeconds}), scheduledSummaryPosted: false, waitingForEmpty: false }

// Personal reminder tracking (synced with Supabase database)
const userReminders = new Map(); // userId -> { time: '20:00', customMessage: null, active: true }

/**
 * Load all daily reminders from database into memory
 */
async function loadRemindersFromDatabase() {
    try {
        const reminders = await supabaseService.getAllDailyReminders();
        for (const reminder of reminders) {
            userReminders.set(reminder.user_id, {
                time: reminder.time,
                customMessage: reminder.custom_message,
                active: reminder.is_active
            });
        }
        console.log(`✅ Loaded ${reminders.length} daily reminders from database`);
    } catch (error) {
        console.error('❌ Error loading reminders from database:', error);
    }
}
const conversationStates = new Map(); // userId -> { step: 'awaiting_time' | 'awaiting_message', time: string }
const userHasChatted = new Set(); // Track users who have already chatted (for first-time AI context)

// Meeting scheduling wizard sessions
const meetingWizardSessions = new Map(); // userId -> { step, title, date, startTime, endTime, channelNum, messages[], lastActivity }
const WIZARD_TIMEOUT = 2 * 60 * 1000; // 2 minutes timeout for wizard sessions

// ============================================
// CONVERSATION MEMORY SYSTEM
// ============================================
const conversationHistory = new Map(); // contextId -> [{role, content, timestamp}]
const MAX_HISTORY_LENGTH = 10; // Store last 10 messages
const HISTORY_EXPIRY = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

/**
 * Add message to conversation history
 * @param {string} contextId - userId for DMs, channelId for channels
 * @param {string} role - 'user' or 'assistant'
 * @param {string} content - Message content
 */
function addToHistory(contextId, role, content) {
    if (!conversationHistory.has(contextId)) {
        conversationHistory.set(contextId, []);
    }
    
    const history = conversationHistory.get(contextId);
    history.push({
        role: role,
        content: content,
        timestamp: Date.now()
    });
    
    // Keep only recent messages
    if (history.length > MAX_HISTORY_LENGTH) {
        history.shift(); // Remove oldest
    }
    
    conversationHistory.set(contextId, history);
}

/**
 * Get conversation history for context
 * @param {string} contextId - userId for DMs, channelId for channels
 * @returns {Array} Recent conversation messages
 */
function getHistory(contextId) {
    const history = conversationHistory.get(contextId) || [];
    const now = Date.now();
    
    // Filter out expired messages
    const validHistory = history.filter(msg => (now - msg.timestamp) < HISTORY_EXPIRY);
    
    // Update storage with filtered history
    if (validHistory.length !== history.length) {
        conversationHistory.set(contextId, validHistory);
    }
    
    return validHistory;
}

/**
 * Clear conversation history
 * @param {string} contextId - userId for DMs, channelId for channels
 */
function clearHistory(contextId) {
    conversationHistory.delete(contextId);
}

/**
 * Parse natural language for reminder requests
 * @param {string} text - User's message
 * @returns {Object} - { isReminderRequest, time, hours, minutes, display12hr, customMessage }
 */
function parseNaturalLanguageReminder(text) {
    const lowerText = text.toLowerCase();
    
    // Check for reminder-related keywords (expanded)
    const reminderKeywords = [
        'remind me', 'set reminder', 'set a reminder', 'daily reminder',
        'reminder at', 'remind at', 'remind me at', 'set my reminder',
        'create reminder', 'schedule reminder', 'want a reminder',
        'need a reminder', 'can you remind', 'please remind',
        'reminder for', 'remind me to', 'remind me every day',
        'remind me daily', 'set up reminder', 'setup reminder',
        'wake me', 'alert me', 'notify me', 'ping me', 'message me',
        'dm me at', 'send me reminder', 'daily ping', 'everyday reminder',
        'remind every day', 'remind daily'
    ];
    
    const isReminderRequest = reminderKeywords.some(keyword => lowerText.includes(keyword));
    
    if (!isReminderRequest) {
        return { isReminderRequest: false };
    }
    
    // Try to extract time from the message (improved patterns)
    const timePatterns = [
        /(?:at|for|around|@|by)\s*(\d{1,2}):(\d{2})\s*(am|pm)/i,
        /(?:at|for|around|@|by)\s*(\d{1,2})\s*(am|pm)/i,
        /(\d{1,2}):(\d{2})\s*(am|pm)/i,
        /(\d{1,2})\s*(am|pm)/i,
        /(\d{1,2}):(\d{2})(?!\s*(?:am|pm))/i, // 24-hour format like 21:00
        /(?:at|for|around|@|by)\s*(\d{1,2})(?:\s|$)/i, // "at 9" without AM/PM
    ];
    
    let hours = null;
    let minutes = 0;
    let period = null;
    
    for (const pattern of timePatterns) {
        const match = text.match(pattern);
        if (match) {
            hours = parseInt(match[1]);
            // Check if minutes exist in capture group
            if (match[2] && !isNaN(parseInt(match[2])) && match[2].length <= 2 && parseInt(match[2]) < 60) {
                minutes = parseInt(match[2]);
                period = match[3]?.toUpperCase() || null;
            } else if (match[2] && /^(am|pm)$/i.test(match[2])) {
                period = match[2].toUpperCase();
            } else {
                period = match[3]?.toUpperCase() || null;
            }
            break;
        }
    }
    
    // If no time found, return that it's a reminder request but no time
    if (hours === null) {
        return { isReminderRequest: true, time: null };
    }
    
    // Validate basic hours
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
        return { isReminderRequest: true, time: null };
    }
    
    // Smart AM/PM inference if not specified
    if (!period) {
        // Check for context clues
        if (lowerText.includes('morning') || lowerText.includes('breakfast')) {
            period = 'AM';
        } else if (lowerText.includes('evening') || lowerText.includes('night') || lowerText.includes('dinner')) {
            period = 'PM';
        } else if (hours >= 1 && hours <= 6) {
            // 1-6 without AM/PM likely means PM for reminders
            period = 'PM';
        } else if (hours >= 7 && hours <= 11) {
            // 7-11 could be either, default to PM for productivity reminders
            period = 'PM';
        }
    }
    
    // Convert to 24-hour format
    if (period === 'PM' && hours !== 12) hours += 12;
    if (period === 'AM' && hours === 12) hours = 0;
    
    // Clamp hours to valid range
    if (hours > 23) hours = hours - 12;
    
    // Create display format
    const displayHour = hours > 12 ? hours - 12 : hours === 0 ? 12 : hours;
    const displayPeriod = hours >= 12 ? 'PM' : 'AM';
    const display12hr = `${displayHour}:${minutes.toString().padStart(2, '0')} ${displayPeriod}`;
    
    // Try to extract custom message (improved patterns)
    let customMessage = null;
    const messagePatterns = [
        /(?:to|for)\s+(?:post|share|update|submit|do|complete|finish|work on|study|practice|learn)\s+(.+?)(?:\s+at\s+\d|$)/i,
        /(?:with message|message:?|saying|to say)\s*[:\s]?\s*["']?(.+?)["']?$/i,
        /remind(?:er)?\s+(?:me\s+)?(?:to\s+)?["'](.+?)["']/i,
    ];
    
    for (const pattern of messagePatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].length > 3) {
            customMessage = match[1].trim();
            // Clean up the message
            customMessage = customMessage.replace(/\s+at\s+\d{1,2}.*$/i, '').trim();
            if (customMessage.length > 3) break;
            customMessage = null;
        }
    }
    
    return {
        isReminderRequest: true,
        time: true,
        hours,
        minutes,
        display12hr,
        customMessage
    };
}

/**
 * Parse natural language for meeting scheduling
 * @param {string} text - User's message
 * @returns {Object} - Meeting details or null
 */
function parseNaturalLanguageMeeting(text) {
    const lowerText = text.toLowerCase();
    
    // Check for meeting-related keywords
    const meetingKeywords = [
        'schedule meeting', 'schedule a meeting', 'create meeting', 'set up meeting',
        'setup meeting', 'plan meeting', 'arrange meeting', 'book meeting',
        'meeting at', 'meeting from', 'meeting for', 'lets meet', "let's meet",
        'have a meeting', 'start meeting', 'schedule meet', 'arrange meet'
    ];
    
    const isMeetingRequest = meetingKeywords.some(keyword => lowerText.includes(keyword));
    
    if (!isMeetingRequest) {
        return { isMeetingRequest: false };
    }
    
    // Extract topic (text in quotes or after "about/for/on")
    let topic = null;
    const topicPatterns = [
        /["'](.+?)["']/,
        /(?:about|for|on|regarding|topic:?)\s+(.+?)(?:\s+(?:at|from|on|tomorrow|today|\d))/i,
        /meeting\s+(?:about|for|on)\s+(.+?)(?:\s+(?:at|from|on|tomorrow|today|\d)|$)/i,
    ];
    
    for (const pattern of topicPatterns) {
        const match = text.match(pattern);
        if (match && match[1]) {
            topic = match[1].trim();
            if (topic.length > 2 && topic.length < 100) break;
            topic = null;
        }
    }
    
    // Extract date
    let targetDate = null;
    // Use proper IST date calculation
    const nowUTC = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const nowIST = new Date(nowUTC.getTime() + istOffset);
    
    if (lowerText.includes('today')) {
        targetDate = { day: nowIST.getUTCDate(), month: nowIST.getUTCMonth() + 1, year: nowIST.getUTCFullYear() };
    } else if (lowerText.includes('tomorrow')) {
        const tomorrowIST = new Date(nowIST.getTime() + 24 * 60 * 60 * 1000);
        targetDate = { day: tomorrowIST.getUTCDate(), month: tomorrowIST.getUTCMonth() + 1, year: tomorrowIST.getUTCFullYear() };
    } else {
        // Try to parse DD/MM or DD/MM/YYYY
        const dateMatch = text.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
        if (dateMatch) {
            const day = parseInt(dateMatch[1]);
            const month = parseInt(dateMatch[2]);
            const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : nowIST.getUTCFullYear();
            if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
                targetDate = { day, month, year };
            }
        }
    }
    
    // Default to today (IST) if no date
    if (!targetDate) {
        targetDate = { day: nowIST.getUTCDate(), month: nowIST.getUTCMonth() + 1, year: nowIST.getUTCFullYear() };
    }
    
    // Extract start and end times
    let startHours = null, startMinutes = 0, endHours = null, endMinutes = 0;
    
    // Pattern: "from 8 PM to 10 PM" or "8 PM - 10 PM" or "8-10 PM"
    const rangePatterns = [
        /(?:from\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)?\s*(?:to|-)\s*(\d{1,2}):?(\d{2})?\s*(am|pm)/i,
        /(\d{1,2}):?(\d{2})?\s*(am|pm)\s*(?:to|-)\s*(\d{1,2}):?(\d{2})?\s*(am|pm)/i,
        /(?:at\s+)?(\d{1,2}):?(\d{2})?\s*(am|pm)(?:\s+for\s+(\d+)\s*(?:hour|hr)s?)?/i,
    ];
    
    for (const pattern of rangePatterns) {
        const match = text.match(pattern);
        if (match) {
            startHours = parseInt(match[1]);
            startMinutes = match[2] ? parseInt(match[2]) : 0;
            let startPeriod = match[3]?.toUpperCase();
            
            if (match[4] && !match[4].match(/hour|hr/i)) {
                // Has end time
                endHours = parseInt(match[4]);
                endMinutes = match[5] ? parseInt(match[5]) : 0;
                const endPeriod = match[6]?.toUpperCase() || startPeriod;
                
                // Infer start period from end period if not specified
                if (!startPeriod && endPeriod) {
                    startPeriod = (startHours > endHours || (startHours === endHours && startMinutes >= endMinutes)) ? 'AM' : endPeriod;
                }
                
                // Convert to 24-hour
                if (startPeriod === 'PM' && startHours !== 12) startHours += 12;
                if (startPeriod === 'AM' && startHours === 12) startHours = 0;
                if (endPeriod === 'PM' && endHours !== 12) endHours += 12;
                if (endPeriod === 'AM' && endHours === 12) endHours = 0;
            } else if (match[4]) {
                // Has duration in hours
                const durationHours = parseInt(match[4]);
                if (startPeriod === 'PM' && startHours !== 12) startHours += 12;
                if (startPeriod === 'AM' && startHours === 12) startHours = 0;
                endHours = startHours + durationHours;
                endMinutes = startMinutes;
                if (endHours >= 24) endHours -= 24;
            } else {
                // Only start time, default to 1 hour meeting
                if (startPeriod === 'PM' && startHours !== 12) startHours += 12;
                if (startPeriod === 'AM' && startHours === 12) startHours = 0;
                endHours = startHours + 1;
                endMinutes = startMinutes;
                if (endHours >= 24) endHours -= 24;
            }
            break;
        }
    }
    
    // Extract channel preference
    let channelNum = null;
    const channelPatterns = [
        /(?:in|at|channel)\s*(?:room\s*)?(\d)/i,
        /room\s*(\d)/i,
        /lounge/i,
        /aura/i,
    ];
    
    if (lowerText.includes('lounge')) channelNum = 1;
    else if (lowerText.includes('aura')) channelNum = 2;
    else if (lowerText.includes('room 1') || lowerText.includes('room1')) channelNum = 3;
    else if (lowerText.includes('room 2') || lowerText.includes('room2')) channelNum = 4;
    else {
        const channelMatch = text.match(/(?:channel|room)\s*(\d)/i);
        if (channelMatch) channelNum = parseInt(channelMatch[1]);
    }
    
    return {
        isMeetingRequest: true,
        topic,
        targetDate,
        startHours,
        startMinutes,
        endHours,
        endMinutes,
        channelNum,
        hasTime: startHours !== null,
        hasTopic: topic !== null
    };
}

// Get AI-generated motivational content
async function getAIMotivation() {
    try {
        const motivation = await aiService.generateMotivation();
        if (!motivation || motivation.trim().length === 0) {
            return "Keep pushing forward! Your consistent efforts today build the success of tomorrow. 🚀";
        }
        return motivation;
    } catch (error) {
        console.error('Error generating AI motivation:', error);
        return "Stay focused and keep learning! Every day is a new opportunity for growth. 💪";
    }
}

// Ask Gemini AI a question
async function askGemini(question) {
    return await aiService.askQuestion(question);
}

// Delete message after 24 hours
function scheduleMessageDeletion(message) {
    setTimeout(async () => {
        try {
            await message.delete();
            console.log(`Deleted message from ${message.author.tag} after 24 hours`);
        } catch (error) {
            console.error('Error deleting message:', error);
        }
    }, 24 * 60 * 60 * 1000); // 24 hours
}

// Express API endpoints
app.get('/', (req, res) => {
    res.json({
        service: 'BeeLert Discord Bot',
        status: botStatus.isOnline ? 'online' : 'offline',
        uptime: botStatus.connectedAt ? Math.floor((Date.now() - new Date(botStatus.connectedAt)) / 1000) : 0,
        endpoints: {
            health: '/health',
            status: '/status'
        }
    });
});

app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString()
    });
});

app.get('/status', (req, res) => {
    const statusCode = botStatus.isOnline ? 200 : 503;
    res.status(statusCode).json({
        botOnline: botStatus.isOnline,
        connectedAt: botStatus.connectedAt,
        lastMessageSent: botStatus.lastMessageSent,
        totalMessagesSent: botStatus.totalMessagesSent,
        uptime: botStatus.connectedAt ? Math.floor((Date.now() - new Date(botStatus.connectedAt)) / 1000) : 0,
        nextScheduledUpdate: '9:00 PM IST',
        timestamp: new Date().toISOString()
    });
});

// Start Express server
app.listen(PORT, () => {
    console.log(`Express server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Status check: http://localhost:${PORT}/status`);
});

// IST is UTC+5:30 (Render uses UTC/GMT)
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5 hours 30 minutes in milliseconds

// Helper function to get current IST time components
// Returns an object with IST date/time components for easy comparison
function getISTTime() {
    const now = new Date();
    // Use toLocaleString to get actual IST time, then parse it
    const istString = now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
    const istDate = new Date(istString);
    return istDate;
}

// Helper function to get IST hours and minutes as string (for reminder comparison)
function getISTTimeString() {
    const now = new Date();
    const hours = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: 'numeric', hour12: false }));
    const minutes = parseInt(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', minute: 'numeric' }));
    return `${hours}:${minutes.toString().padStart(2, '0')}`;
}

// Helper function to format IST time (date is already IST-adjusted from getISTTime())
function formatISTTime(date) {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const hours = date.getHours();
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const hours12 = hours % 12 || 12;
    return `${month}/${day}/${year}, ${hours12}:${minutes}:${seconds} ${ampm} IST`;
}

// Function to post Meeting Manager interface
async function postMeetingManager(channel) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('schedule_meeting')
                .setLabel('� Use Form')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('start_wizard')
                .setLabel('💬 Step-by-Step')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('view_meetings')
                .setLabel('📋 View Meetings')
                .setStyle(ButtonStyle.Secondary),
        );

    await channel.send({
        content: '📅 **MEETING SCHEDULER**\n\n' +
                 '**Two ways to schedule:**\n\n' +
                 '📝 **Use Form** - Quick modal form (fill all at once)\n' +
                 '💬 **Step-by-Step** - Guided chat wizard (one question at a time)\n\n' +
                 '📋 **View Meetings** - See all upcoming meetings',
        components: [row]
    });
}

// Function to send meeting reminder in general channel
async function sendMeetingReminder(topic, meetingId) {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        const role = channel.guild.roles.cache.find(r => r.name === ROLE_NAME);
        
        const loungeChannel = await client.channels.fetch(LOUNGE_VOICE_CHANNEL_ID);
        const channelLink = `https://discord.com/channels/${channel.guildId}/${LOUNGE_VOICE_CHANNEL_ID}`;
        
        const reminderMessage = `📢 **MEETING IS NOW LIVE!**

📝 **Topic:** ${topic}
🎙️ **Location:** ${loungeChannel.name}
🔗 **Join here:** ${channelLink}

⚡ All Bashers are requested to join now!`;

        await channel.send(reminderMessage);
        console.log(`📢 Meeting reminder posted for: ${topic}`);
        
        // Delete confirmation message 1 hour after meeting starts
        if (meetingId && scheduledMeetings.has(meetingId)) {
            const meeting = scheduledMeetings.get(meetingId);
            if (meeting.confirmationMsg) {
                setTimeout(async () => {
                    try {
                        await meeting.confirmationMsg.delete();
                        console.log(`🗑️ Deleted confirmation message for: ${topic}`);
                    } catch (err) {
                        console.error('Error deleting confirmation message:', err);
                    }
                }, 60 * 60 * 1000); // 1 hour
            }
        }
    } catch (error) {
        console.error('Error sending meeting reminder:', error);
    }
}

// Start automated meeting tracking
async function startAutomatedTracking(meeting, meetingId) {
    try {
        const channel = await client.channels.fetch(meeting.channelId);
        const startTime = Date.now();
        
        // Get members ALREADY in channel
        const presentMembers = channel.members;
        const participants = new Map();
        
        presentMembers.forEach(member => {
            if (!member.user.bot) {
                participants.set(member.id, {
                    username: member.user.username,
                    joinedAt: startTime,
                    leftAt: null,
                    totalSeconds: 0,
                    sessions: [] // Track multiple sessions if they disconnect/reconnect
                });
                console.log(`👤 ${member.user.username} - present at meeting start`);
            }
        });
        
        activeMeetings.set(meetingId, {
            ...meeting,
            actualStartTime: startTime,
            participants: participants,
            scheduledSummaryPosted: false,
            waitingForEmpty: false
        });
        
        meeting.status = 'active';
        
        // Update Discord event status to ACTIVE
        if (meeting.eventId) {
            try {
                const guild = channel.guild;
                const event = await guild.scheduledEvents.fetch(meeting.eventId);
                if (event && event.status === 1) { // 1 = SCHEDULED
                    await event.setStatus(2); // 2 = ACTIVE
                    console.log(`📶 Discord event updated to ACTIVE: ${meeting.topic}`);
                }
            } catch (err) {
                console.error('Error updating Discord event status:', err);
            }
        }
        
        console.log(`🎬 Started tracking: ${meeting.topic} in ${meeting.channelName} (${participants.size} already present)`);
        
        // Notify in general channel with channel link
        const generalChannel = await client.channels.fetch(CHANNEL_ID);
        
        await generalChannel.send(
            `🎬 **Meeting Started**\n\n` +
            `📝 ${meeting.topic}\n` +
            `🎙️ <#${meeting.channelId}>\n\n` +
            `<@&${CLAN_ROLE_ID}> The meeting is live, please join now!`
        );
        
    } catch (error) {
        console.error('Error starting automated tracking:', error);
    }
}

// Generate scheduled period summary (first summary at scheduled end time)
async function generateScheduledPeriodSummary(meeting, meetingId, scheduledEndTime) {
    try {
        const summaryChannel = await client.channels.fetch(MEETING_SUMMARY_CHANNEL_ID);
        
        // Calculate times up to scheduled end for participants
        const scheduledDuration = scheduledEndTime.getTime() - meeting.actualStartTime;
        const durationMinutes = Math.floor(scheduledDuration / (1000 * 60));
        const durationHours = Math.floor(durationMinutes / 60);
        const durationRemainingMins = durationMinutes % 60;
        
        // Create snapshot of attendance during scheduled period
        const attendanceSnapshot = [];
        meeting.participants.forEach((participant, userId) => {
            let timeInScheduledPeriod = 0;
            
            // Calculate time spent during scheduled period
            participant.sessions.forEach(session => {
                const sessionStart = session.joinedAt;
                const sessionEnd = session.leftAt || Date.now();
                
                // Clip session to scheduled period
                const effectiveStart = Math.max(sessionStart, meeting.actualStartTime);
                const effectiveEnd = Math.min(sessionEnd, scheduledEndTime.getTime());
                
                if (effectiveEnd > effectiveStart) {
                    timeInScheduledPeriod += Math.floor((effectiveEnd - effectiveStart) / 1000);
                }
            });
            
            // Add current session if still in channel
            if (!participant.leftAt) {
                const effectiveStart = Math.max(participant.joinedAt, meeting.actualStartTime);
                const effectiveEnd = scheduledEndTime.getTime();
                if (effectiveEnd > effectiveStart) {
                    timeInScheduledPeriod += Math.floor((effectiveEnd - effectiveStart) / 1000);
                }
            }
            
            if (timeInScheduledPeriod > 0) {
                attendanceSnapshot.push({
                    username: participant.username,
                    seconds: timeInScheduledPeriod
                });
            }
        });
        
        attendanceSnapshot.sort((a, b) => b.seconds - a.seconds);
        
        let summary = `📊 **Meeting Summary - Scheduled Period**\n\n`;
        summary += `📝 **${meeting.topic}**\n`;
        summary += `🎙️ Channel: ${meeting.channelName}\n`;
        summary += `📅 ${new Date(meeting.actualStartTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n`;
        summary += `🕐 Scheduled: ${new Date(meeting.actualStartTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} - ${scheduledEndTime.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST (${durationHours}h ${durationRemainingMins}m)\n\n`;
        summary += `👥 **Attendance During Scheduled Time:**\n\n`;
        
        if (attendanceSnapshot.length === 0) {
            summary += `❌ No participants attended.\n`;
        } else {
            attendanceSnapshot.forEach(p => {
                const mins = Math.floor(p.seconds / 60);
                const secs = p.seconds % 60;
                const percentage = Math.round((p.seconds / (scheduledDuration / 1000)) * 100);
                const badge = percentage >= 95 ? ' ⭐' : '';
                summary += `• **${p.username}** - ${mins}m ${secs}s (${percentage}%)${badge}\n`;
            });
            
            const avgSeconds = attendanceSnapshot.reduce((sum, p) => sum + p.seconds, 0) / attendanceSnapshot.length;
            const avgMins = Math.floor(avgSeconds / 60);
            summary += `\n📈 Average attendance: ${avgMins}m per member\n`;
        }
        
        await summaryChannel.send(summary);
        console.log(`📊 Scheduled period summary posted for: ${meeting.topic}`);
    } catch (error) {
        console.error('Error generating scheduled period summary:', error);
    }
}

// Generate final summary (second summary when everyone leaves)
async function generateFinalSummary(meeting, meetingId) {
    try {
        const summaryChannel = await client.channels.fetch(MEETING_SUMMARY_CHANNEL_ID);
        const scheduledMeeting = scheduledMeetings.get(meetingId);
        
        const actualEndTime = Date.now();
        const totalDuration = actualEndTime - meeting.actualStartTime;
        const totalMinutes = Math.floor(totalDuration / (1000 * 60));
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        
        // Calculate final times for all participants
        const finalAttendance = [];
        meeting.participants.forEach((participant, userId) => {
            let totalSeconds = participant.totalSeconds;
            
            // Add current session if still tracking
            if (!participant.leftAt) {
                totalSeconds += Math.floor((actualEndTime - participant.joinedAt) / 1000);
            }
            
            if (totalSeconds > 0) {
                finalAttendance.push({
                    username: participant.username,
                    seconds: totalSeconds,
                    joinedAt: participant.sessions[0]?.joinedAt || participant.joinedAt
                });
            }
        });
        
        finalAttendance.sort((a, b) => b.seconds - a.seconds);
        
        let summary = `📊 **Final Meeting Report - Complete Attendance**\n\n`;
        summary += `📝 **${meeting.topic}**\n`;
        summary += `🎙️ Channel: ${meeting.channelName}\n`;
        summary += `📅 ${new Date(meeting.actualStartTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n`;
        summary += `🕐 Actual: ${new Date(meeting.actualStartTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} - ${new Date(actualEndTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST (${totalHours}h ${remainingMinutes}m)\n\n`;
        
        if (scheduledMeeting) {
            const scheduledDuration = scheduledMeeting.endTime.getTime() - scheduledMeeting.startTime.getTime();
            const overtimeMs = totalDuration - scheduledDuration;
            if (overtimeMs > 0) {
                const overtimeMins = Math.floor(overtimeMs / (1000 * 60));
                summary += `⏱️ Overtime: ${overtimeMins} minutes beyond scheduled end\n\n`;
            }
        }
        
        summary += `👥 **Complete Attendance:**\n\n`;
        
        if (finalAttendance.length === 0) {
            summary += `❌ No participants.\n`;
        } else {
            finalAttendance.forEach(p => {
                const mins = Math.floor(p.seconds / 60);
                const secs = p.seconds % 60;
                const percentage = Math.round((p.seconds / (totalDuration / 1000)) * 100);
                const badge = percentage >= 95 ? ' ⭐' : '';
                summary += `• **${p.username}** - ${mins}m ${secs}s (${percentage}%)${badge}\n`;
            });
            
            const avgSeconds = finalAttendance.reduce((sum, p) => sum + p.seconds, 0) / finalAttendance.length;
            const avgMins = Math.floor(avgSeconds / 60);
            const fullAttendance = finalAttendance.filter(p => p.seconds >= (totalDuration / 1000) * 0.95).length;
            
            summary += `\n📈 **Statistics:**\n`;
            summary += `• Total participants: ${finalAttendance.length}\n`;
            summary += `• Average attendance: ${avgMins}m per member\n`;
            summary += `• Full attendance (95%+): ${fullAttendance} members\n`;
        }
        
        await summaryChannel.send(summary);
        console.log(`📊 Final summary posted for: ${meeting.topic}`);
    } catch (error) {
        console.error('Error generating final summary:', error);
    }
}

// Cleanup meeting data
async function finalizeAndCleanup(meetingId) {
    const meeting = activeMeetings.get(meetingId);
    if (!meeting) return;
    
    // Cleanup
    activeMeetings.delete(meetingId);
    const scheduledMeeting = scheduledMeetings.get(meetingId);
    if (scheduledMeeting) {
        scheduledMeeting.status = 'completed';
        
        // Complete and delete Discord scheduled event
        if (scheduledMeeting.eventId) {
            try {
                const guild = client.guilds.cache.first(); // Get first guild
                const event = await guild.scheduledEvents.fetch(scheduledMeeting.eventId);
                if (event) {
                    // Set to COMPLETED first (status 3)
                    if (event.status !== 3 && event.status !== 4) { // Not already COMPLETED or CANCELED
                        await event.setStatus(3); // 3 = COMPLETED
                        console.log(`✅ Discord event marked as completed: ${meeting.topic}`);
                    }
                    // Then delete it
                    await event.delete();
                    console.log(`🗑️ Deleted Discord event: ${meeting.topic}`);
                }
            } catch (err) {
                console.error('Error managing Discord event:', err);
            }
        }
        
        // Delete confirmation message
        if (scheduledMeeting.confirmationMsg) {
            try {
                await scheduledMeeting.confirmationMsg.delete();
                console.log(`🗑️ Deleted confirmation message for: ${meeting.topic}`);
            } catch (err) {
                console.error('Error deleting confirmation message:', err);
            }
        }
    }
    
    console.log(`✅ Meeting fully completed: ${meeting.topic}`);
}

// Generate attendance summary for scheduled meeting
// Helper function to format date for daily update (date is already IST-adjusted)
function formatISTDate(date) {
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 
                   'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`;
}

// Send daily progress update
async function sendDailyUpdate() {
    try {
        const channel = await client.channels.fetch(CHANNEL_ID);
        if (!channel) {
            console.error(`Error: Could not find channel with ID ${CHANNEL_ID}`);
            return;
        }

        const guild = channel.guild;
        const role = guild.roles.cache.find(r => r.name === ROLE_NAME);

        if (!role) {
            console.error(`Error: Could not find role '${ROLE_NAME}'`);
            return;
        }

        const now = getISTTime();
        const currentTime = formatISTTime(now);
        const dailyQuote = await getAIMotivation();

        const message = `${role} Heyyy everyone! Hope everyone is fine! 😊\n\n` +
            `This is a gentle reminder to post your daily progress. 📝\n\n` +
            `💡 **Today's Motivation:**\n` +
            `_${dailyQuote}_`;

        await channel.send(message);
        console.log(`Daily update sent at ${currentTime}`);
    } catch (error) {
        console.error('Error sending daily update:', error);
    }
}

// Bot ready event
client.once(Events.ClientReady, async (c) => {
    console.log(`${c.user.tag} has connected to Discord!`);
    console.log(`Bot is ready at ${formatISTTime(getISTTime())}`);
    // Removed: setTimeout(() => sendWelcomeMessages(), 3000);

    // Update bot status
    botStatus.isOnline = true;
    botStatus.connectedAt = new Date().toISOString();
    
    // Load daily reminders from database
    await loadRemindersFromDatabase();

    // Register slash commands
    try {
        console.log('Registering slash commands...');
        const rest = new REST({ version: '10' }).setToken(BOT_TOKEN);
        await rest.put(
            Routes.applicationCommands(c.user.id),
            { body: commands }
        );
        console.log('✅ Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }

    // Schedule daily update at 9:00 PM IST (21:00)
    // Cron format: minute hour * * *
    // 0 21 * * * means every day at 21:00 (9:00 PM) IST
    cron.schedule('0 21 * * *', async () => {
        console.log('Running scheduled daily update...');
        await sendDailyUpdate();
        botStatus.lastMessageSent = new Date().toISOString();
        botStatus.totalMessagesSent++;
    }, {
        timezone: 'Asia/Kolkata'
    });

    console.log('Daily scheduler started - will post at 9:00 PM IST every day');
    
    // Schedule birthday checker (runs daily at 7:00 AM IST)
    cron.schedule('0 7 * * *', async () => {
        console.log('Running daily birthday check at 7:00 AM IST...');
        
        const now = getISTTime();
        // getISTTime() already returns IST-adjusted time, use direct methods
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const today = `${day}/${month}`; // DD/MM format
        
        // Find today's birthdays from Supabase
        const allBirthdays = await getBirthdays();
        const todaysBirthdays = allBirthdays.filter(b => b.date === today);
        
        if (todaysBirthdays.length > 0) {
            const channel = await client.channels.fetch(CHANNEL_ID);
            
            for (const person of todaysBirthdays) {
                try {
                    // Generate AI birthday wish
                    const birthdayWish = await aiService.askQuestion(
                        `Generate a heartfelt birthday wish for ${person.name}. ` +
                        `Include a meaningful quote and warm wishes. ` +
                        `Make it personal, inspiring, and celebratory. ` +
                        `Keep it under 150 words. Format it beautifully. ` +
                        `Do NOT include any signature, closing, or "With love" at the end. ` +
                        `The message should end after the birthday wishes and quote.`
                    );
                    
                    const wishMessage = 
                        `🎉🎂 **HAPPY BIRTHDAY** <@${person.userId}>! 🎂🎉\n\n` +
                        `${birthdayWish}\n\n` +
                        `— With love from the Aura-7F fam 💙`;
                    
                    await channel.send(wishMessage);
                    console.log(`✅ Posted AI birthday wish for ${person.name}`);
                } catch (error) {
                    console.error(`Error posting birthday wish for ${person.name}:`, error);
                }
            }
        }
    }, {
        timezone: 'Asia/Kolkata'
    });
    
    console.log('Birthday checker started - will check daily at 7:00 AM IST');
    
    // Schedule festival checker (runs daily at 8:00 AM IST)
    cron.schedule('0 8 * * *', async () => {
        console.log('Running daily festival check at 8:00 AM IST...');
        
        const now = getISTTime();
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const year = now.getFullYear();
        const today = `${day}/${month}`; // DD/MM format
        
        console.log(`📅 Today's date (IST): ${today}/${year}`);
        
        // Find today's festivals from Supabase (only those that match today's date exactly)
        const allFestivals = await getFestivals();
        let todaysFestivals = allFestivals.filter(f => f.date === today);
        
        // For lunar calendar festivals, verify with AI if the stored date matches today
        // This is to double-check that stored dates are correct for the current year
        const lunarFestivals = allFestivals.filter(f => 
            f.type === 'muslim' || 
            ['Diwali', 'Dussehra', 'Ganesh', 'Navaratri', 'Shivaratri', 'Eid', 'Ramadan', 'Muharram', 'Milad', 'Onam', 'Thaipusam', 'Janmashtami', 'Krishna'].some(
                name => f.name.toLowerCase().includes(name.toLowerCase())
            )
        );
        
        // Verify lunar calendar festivals that are supposedly today
        // Remove any that AI says are NOT actually today
        for (const festival of todaysFestivals.filter(f => lunarFestivals.some(lf => lf.name === f.name))) {
            console.log(`🔍 Verifying stored date for ${festival.name} (stored: ${festival.date})...`);
            const verification = await verifyFestivalDate(festival, today, year);
            
            // Validate that AI returned a real date format (DD/MM), not literal text
            if (verification.correctDate && /^\d{2}\/\d{2}$/.test(verification.correctDate)) {
                // If AI says the correct date is different from today, remove this festival
                if (verification.correctDate !== today) {
                    console.log(`❌ ${festival.name} is NOT today. AI says correct date is ${verification.correctDate}`);
                    todaysFestivals = todaysFestivals.filter(f => f.name !== festival.name);
                    
                    // Update the stored date for future reference
                    await updateFestivalDate(festival.name, verification.correctDate);
                } else {
                    console.log(`✅ Confirmed: ${festival.name} is today!`);
                }
            } else {
                console.log(`⚠️ AI returned invalid date for ${festival.name}: ${verification.correctDate} - removing to be safe`);
                todaysFestivals = todaysFestivals.filter(f => f.name !== festival.name);
            }
        }
        
        // Also check if any lunar festivals NOT in today's list might actually be today
        // (in case the stored date was wrong)
        for (const festival of lunarFestivals) {
            if (!todaysFestivals.find(f => f.name === festival.name) && festival.date !== today) {
                console.log(`🔍 Checking if ${festival.name} (stored: ${festival.date}) might be today...`);
                const verification = await verifyFestivalDate(festival, today, year);
                
                // Validate AI returned a real date format
                if (verification.correctDate && /^\d{2}\/\d{2}$/.test(verification.correctDate)) {
                    // Only add if AI confirms the correct date IS today
                    if (verification.correctDate === today) {
                        console.log(`✅ AI confirmed ${festival.name} is actually today!`);
                        todaysFestivals.push(festival);
                        await updateFestivalDate(festival.name, verification.correctDate);
                    } else if (verification.correctDate !== festival.date) {
                        // Update stored date for future reference
                        console.log(`📅 Updating ${festival.name} date from ${festival.date} to ${verification.correctDate}`);
                        await updateFestivalDate(festival.name, verification.correctDate);
                    }
                } else {
                    console.log(`⚠️ AI returned invalid date for ${festival.name}: ${verification.correctDate}`);
                }
            }
        }
        
        if (todaysFestivals.length > 0) {
            const channel = await client.channels.fetch(CHANNEL_ID);
            
            for (const festival of todaysFestivals) {
                try {
                    // Generate AI festival wish based on festival type
                    let festivalContext = '';
                    if (festival.type === 'muslim') {
                        festivalContext = 'This is an Islamic festival. Include appropriate Islamic greetings and blessings. ';
                    } else if (festival.type === 'christian') {
                        festivalContext = 'This is a Christian festival. Include appropriate Christian blessings. ';
                    } else if (festival.type === 'hindu') {
                        festivalContext = 'This is a Hindu festival celebrated in Tamil Nadu. Include cultural significance and traditional Tamil/Sanskrit greetings. ';
                    }
                    
                    const festivalWish = await aiService.askQuestion(
                        `Generate a warm and festive greeting for ${festival.name}. ` +
                        festivalContext +
                        `Include meaningful wishes and the cultural significance of the day. ` +
                        `Make it joyful, inspiring, and celebratory. ` +
                        `Keep it under 150 words. Format it beautifully. ` +
                        `Do NOT include any signature or closing at the end. ` +
                        `The message should end after the festival wishes.`
                    );
                    
                    const festivalMessage = 
                        `${festival.emoji} **HAPPY ${festival.name.toUpperCase()}!** ${festival.emoji}\n\n` +
                        `<@&${CLAN_ROLE_ID}>\n\n` +
                        `${festivalWish}\n\n` +
                        `— Wishing you joy and prosperity from the Aura-7F fam 💙`;
                    
                    await channel.send(festivalMessage);
                    console.log(`✅ Posted AI festival wish for ${festival.name}`);
                } catch (error) {
                    console.error(`Error posting festival wish for ${festival.name}:`, error);
                }
            }
        } else {
            console.log(`No festivals today (${today})`);
        }
    }, {
        timezone: 'Asia/Kolkata'
    });
    
    console.log('Festival checker started - will check daily at 8:00 AM IST');
    
    // Schedule database heartbeat (runs every 6 hours to keep Supabase active)
    cron.schedule('0 */6 * * *', async () => {
        console.log('Writing database heartbeat...');
        await supabaseService.writeHeartbeat();
    }, {
        timezone: 'Asia/Kolkata'
    });
    
    console.log('Database heartbeat scheduler started - will ping every 6 hours');
    
    // Schedule yearly festival update (runs on January 2nd at 6:00 AM IST)
    cron.schedule('0 6 2 1 *', async () => {
        const year = new Date().getFullYear();
        console.log(`🎉 Running yearly festival update for ${year}...`);
        await fetchAndStoreFestivals(year);
    }, {
        timezone: 'Asia/Kolkata'
    });
    
    console.log('Yearly festival updater scheduled - will run on January 2nd');
    
    // Monthly leaderboard is now only available via /leaderboard command (not auto-posted)
    
    // Start periodic voice points checker (every 5 minutes)
    setInterval(async () => {
        const now = Date.now();
        for (const [userId, tracking] of voicePointsTracking.entries()) {
            const timeSinceLastPoints = now - tracking.lastPointsAwarded;
            const intervalsElapsed = Math.floor(timeSinceLastPoints / POINTS_INTERVAL);
            
            if (intervalsElapsed > 0) {
                try {
                    // Award points for elapsed intervals
                    const pointsToAward = intervalsElapsed;
                    const minutesToAdd = intervalsElapsed * 5;
                    
                    await supabaseService.addVoicePoints(userId, tracking.username, pointsToAward, minutesToAdd);
                    
                    // Update tracking
                    tracking.lastPointsAwarded = now;
                    
                    console.log(`🎯 Periodic: ${tracking.username} earned ${pointsToAward} points in ${tracking.channelName}`);
                } catch (error) {
                    console.error(`Error awarding periodic points to ${tracking.username}:`, error);
                }
            }
        }
    }, POINTS_INTERVAL);
    
    console.log('Voice points tracker started - checking every 5 minutes');
    
    // Write initial heartbeat on startup
    setTimeout(async () => {
        console.log('Writing startup heartbeat to database...');
        await supabaseService.writeHeartbeat();
    }, 3000);
    
    // Check if festivals need to be updated on startup
    setTimeout(async () => {
        const currentYear = new Date().getFullYear();
        const lastUpdate = await supabaseService.getLastFestivalUpdate();
        
        if (!lastUpdate || lastUpdate.year < currentYear) {
            console.log(`🎉 Festivals need update for ${currentYear}. Fetching...`);
            await fetchAndStoreFestivals(currentYear);
        } else {
            console.log(`✅ Festivals already updated for ${currentYear}`);
        }
    }, 5000);
    
    // Check birthdays on bot startup (backup in case bot started after 7 AM)
    setTimeout(async () => {
        console.log('Running startup birthday check (backup)...');
        const now = getISTTime();
        // getISTTime() already returns IST-adjusted time, use direct methods
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const today = `${day}/${month}`; // DD/MM format
        
        // Fetch birthdays from Supabase
        const allBirthdays = await getBirthdays();
        const todaysBirthdays = allBirthdays.filter(b => b.date === today);
        
        if (todaysBirthdays.length > 0) {
            const channel = await client.channels.fetch(CHANNEL_ID);
            
            for (const person of todaysBirthdays) {
                try {
                    const birthdayWish = await aiService.askQuestion(
                        `Generate a heartfelt birthday wish for ${person.name}. ` +
                        `Include a meaningful quote and warm wishes. ` +
                        `Make it personal, inspiring, and celebratory. ` +
                        `Keep it under 150 words. Format it beautifully. ` +
                        `Do NOT include any signature, closing, or "With love" at the end. ` +
                        `The message should end after the birthday wishes and quote.`
                    );
                    
                    const wishMessage = 
                        `🎉🎂 **HAPPY BIRTHDAY** <@${person.userId}>! 🎂🎉\n\n` +
                        `${birthdayWish}\n\n` +
                        `— With love from the Aura-7F fam 💙`;
                    
                    await channel.send(wishMessage);
                    console.log(`✅ Posted startup birthday wish for ${person.name}`);
                } catch (error) {
                    console.error(`Error posting startup birthday wish:`, error);
                }
            }
        } else {
            console.log(`No birthdays today (${today})`);
        }
    }, 5000); // Wait 5 seconds after bot is ready
    
    // Check festivals on bot startup (backup in case bot started after 8 AM)
    setTimeout(async () => {
        console.log('Running startup festival check (backup)...');
        const now = getISTTime();
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const year = now.getFullYear();
        const today = `${day}/${month}`; // DD/MM format
        
        console.log(`📅 Startup check - Today's date (IST): ${today}/${year}`);
        
        // Fetch festivals from Supabase
        const allFestivals = await getFestivals();
        let todaysFestivals = allFestivals.filter(f => f.date === today);
        
        // Identify lunar calendar festivals that need verification
        const lunarFestivals = allFestivals.filter(f => 
            f.type === 'muslim' || 
            ['Diwali', 'Dussehra', 'Ganesh', 'Navaratri', 'Shivaratri', 'Eid', 'Ramadan', 'Muharram', 'Milad', 'Onam', 'Thaipusam', 'Janmashtami', 'Krishna'].some(
                name => f.name.toLowerCase().includes(name.toLowerCase())
            )
        );
        
        // Verify lunar festivals that are supposedly today - remove if AI says otherwise
        for (const festival of todaysFestivals.filter(f => lunarFestivals.some(lf => lf.name === f.name))) {
            console.log(`🔍 Startup: Verifying ${festival.name} (stored: ${festival.date})...`);
            const verification = await verifyFestivalDate(festival, today, year);
            
            // Validate that AI returned a real date, not literal "DD/MM"
            if (verification.correctDate && /^\d{2}\/\d{2}$/.test(verification.correctDate)) {
                if (verification.correctDate !== today) {
                    console.log(`❌ ${festival.name} is NOT today. AI says correct date is ${verification.correctDate}`);
                    todaysFestivals = todaysFestivals.filter(f => f.name !== festival.name);
                    await updateFestivalDate(festival.name, verification.correctDate);
                } else {
                    console.log(`✅ Confirmed: ${festival.name} is today!`);
                }
            } else {
                console.log(`⚠️ AI returned invalid date for ${festival.name}: ${verification.correctDate}`);
                // Don't post if we can't verify - remove from today's list to be safe
                todaysFestivals = todaysFestivals.filter(f => f.name !== festival.name);
            }
        }
        
        // Don't check for festivals NOT in today's list on startup - that's the job of the 8 AM cron
        
        if (todaysFestivals.length > 0) {
            const channel = await client.channels.fetch(CHANNEL_ID);
            
            for (const festival of todaysFestivals) {
                try {
                    let festivalContext = '';
                    if (festival.type === 'muslim') {
                        festivalContext = 'This is an Islamic festival. Include appropriate Islamic greetings and blessings. ';
                    } else if (festival.type === 'christian') {
                        festivalContext = 'This is a Christian festival. Include appropriate Christian blessings. ';
                    } else if (festival.type === 'hindu') {
                        festivalContext = 'This is a Hindu festival celebrated in Tamil Nadu. Include cultural significance and traditional Tamil/Sanskrit greetings. ';
                    }
                    
                    const festivalWish = await aiService.askQuestion(
                        `Generate a warm and festive greeting for ${festival.name}. ` +
                        festivalContext +
                        `Include meaningful wishes and the cultural significance of the day. ` +
                        `Make it joyful, inspiring, and celebratory. ` +
                        `Keep it under 150 words. Format it beautifully. ` +
                        `Do NOT include any signature or closing at the end. ` +
                        `The message should end after the festival wishes.`
                    );
                    
                    const festivalMessage = 
                        `${festival.emoji} **HAPPY ${festival.name.toUpperCase()}!** ${festival.emoji}\n\n` +
                        `<@&${CLAN_ROLE_ID}>\n\n` +
                        `${festivalWish}\n\n` +
                        `— Wishing you joy and prosperity from the Aura-7F fam 💙`;
                    
                    await channel.send(festivalMessage);
                    console.log(`✅ Posted startup festival wish for ${festival.name}`);
                } catch (error) {
                    console.error(`Error posting startup festival wish:`, error);
                }
            }
        } else {
            console.log(`No festivals today (${today})`);
        }
    }, 7000); // Wait 7 seconds after bot is ready
    
    // Schedule personal reminder checker (runs every minute)
    cron.schedule('* * * * *', async () => {
        const now = getISTTime();
        // Since getISTTime() already returns IST-adjusted time, use direct methods
        const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        // Debug log every minute (comment out after testing)
        if (userReminders.size > 0) {
            console.log(`⏰ Checking reminders at IST: ${currentTime}`);
        }
        
        for (const [userId, settings] of userReminders.entries()) {
            if (!settings.active) continue;
            
            console.log(`   Comparing: "${settings.time}" vs "${currentTime}" for user ${userId}`);
            
            if (settings.time !== currentTime) continue;
            
            try {
                const user = await client.users.fetch(userId);
                const defaultMessage = 
                    "⏰ **Daily Progress Reminder!**\n\n" +
                    "Time to post your daily progress! 📝\n\n" +
                    `Head to the server and share what you learned today.\n\n` +
                    "Keep the momentum going! 🚀";
                
                await user.send(settings.customMessage || defaultMessage);
                console.log(`✅ Sent reminder to ${user.username} at ${currentTime} IST`);
            } catch (error) {
                console.error(`❌ Cannot DM user ${userId}:`, error.message);
                // Optionally disable reminder if user has DMs closed for too long
            }
        }
    }, {
        timezone: 'Asia/Kolkata'
    });
    
    console.log('Personal reminder checker started - runs every minute');
    
    // Schedule automated meeting tracking checker (runs every minute)
    cron.schedule('* * * * *', async () => {
        const now = Date.now();
        
        for (const [meetingId, meeting] of scheduledMeetings.entries()) {
            // Check if it's time to START tracking
            if (meeting.status === 'scheduled' && meeting.startTime.getTime() <= now) {
                await startAutomatedTracking(meeting, meetingId);
            }
        }
        
        // Check active meetings for scheduled end time and empty channel
        for (const [meetingId, activeMeeting] of activeMeetings.entries()) {
            const scheduledMeeting = scheduledMeetings.get(meetingId);
            if (!scheduledMeeting) continue;
            
            const channel = await client.channels.fetch(activeMeeting.channelId);
            const currentMembers = channel.members.filter(m => !m.user.bot);
            
            // FIRST CHECK: Has scheduled end time been reached?
            if (!activeMeeting.scheduledSummaryPosted && scheduledMeeting.endTime.getTime() <= now) {
                // Post first summary for scheduled period
                console.log(`⏰ ${activeMeeting.topic}: Scheduled time ended - posting scheduled period summary`);
                await generateScheduledPeriodSummary(activeMeeting, meetingId, scheduledMeeting.endTime);
                activeMeeting.scheduledSummaryPosted = true;
                
                // Check if anyone is still in the channel
                if (currentMembers.size > 0) {
                    activeMeeting.waitingForEmpty = true;
                    console.log(`👥 ${activeMeeting.topic}: ${currentMembers.size} members still present - waiting for all to leave`);
                    
                    // Notify in meeting summary channel that we're waiting
                    const summaryChannel = await client.channels.fetch(MEETING_SUMMARY_CHANNEL_ID);
                    await summaryChannel.send(
                        `⏱️ **Meeting Extended Beyond Scheduled Time**\n\n` +
                        `📝 ${activeMeeting.topic}\n` +
                        `🎙️ ${activeMeeting.channelName}\n` +
                        `👥 ${currentMembers.size} members still present\n\n` +
                        `Continuing to track until all participants leave...`
                    );
                } else {
                    // No one left, end immediately
                    console.log(`✅ ${activeMeeting.topic}: Channel empty at scheduled end - ending meeting`);
                    await finalizeAndCleanup(meetingId);
                }
            }
            
            // SECOND CHECK: If waiting for empty channel, check if it's empty now
            if (activeMeeting.waitingForEmpty && currentMembers.size === 0) {
                console.log(`✅ ${activeMeeting.topic}: All participants have left - posting final summary`);
                await generateFinalSummary(activeMeeting, meetingId);
                await finalizeAndCleanup(meetingId);
            }
        }
    }, {
        timezone: 'Asia/Kolkata'
    });
    
    console.log('Automated meeting tracking started - checks every minute');
    
    // Post Meeting Manager interface in schedule meet channel
    try {
        const scheduleChannel = await client.channels.fetch(SCHEDULE_MEET_CHANNEL_ID);
        await postMeetingManager(scheduleChannel);
        console.log('📅 Meeting Manager interface posted in schedule channel');
    } catch (error) {
        console.error('Error posting meeting manager:', error);
    }
});

// Handle new member joins - assign guest role automatically
client.on(Events.GuildMemberAdd, async (member) => {
    console.log(`👋 New member joined: ${member.user.tag}`);
    
    try {
        const guild = member.guild;
        
        // Assign guest role
        if (GUEST_ROLE_ID) {
            const guestRole = guild.roles.cache.get(GUEST_ROLE_ID);
            if (guestRole) {
                await member.roles.add(guestRole);
                console.log(`✅ Assigned guest role "${guestRole.name}" to ${member.user.tag}`);
            } else {
                console.error(`❌ Guest role with ID ${GUEST_ROLE_ID} not found in server.`);
            }
        }
        
        // Send welcome message
        if (WELCOME_CHANNEL_ID) {
            const welcomeChannel = await client.channels.fetch(WELCOME_CHANNEL_ID);
            if (welcomeChannel) {
                const welcomeMessage = 
                    `🎉 **Welcome to the Aura-7F Fam!** 🎉\n\n` +
                    `Hey ${member}! 👋\n\n` +
                    `We're super excited to have you here! Make yourself at home, ` +
                    `introduce yourself, and feel free to explore our community. ` +
                    `If you have any questions, don't hesitate to ask!\n\n` +
                    `Enjoy your stay! 💙`;
                
                await welcomeChannel.send(welcomeMessage);
                console.log(`✅ Sent welcome message for ${member.user.tag}`);
            } else {
                console.error(`❌ Welcome channel with ID ${WELCOME_CHANNEL_ID} not found.`);
            }
        }
    } catch (error) {
        console.error(`❌ Error handling new member ${member.user.tag}:`, error);
    }
});

// Handle button and modal interactions
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        // ===== SLASH COMMANDS HANDLER =====
        if (interaction.isChatInputCommand()) {
            const { commandName, options } = interaction;
            
            // /points command
            if (commandName === 'points') {
                const targetUser = options.getUser('user') || interaction.user;
                const now = getISTTime();
                const monthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
                
                try {
                    const monthlyPoints = await supabaseService.getUserVoicePoints(targetUser.id, monthYear);
                    const allTimePoints = await supabaseService.getUserAllTimePoints(targetUser.id);
                    
                    const isOwnPoints = targetUser.id === interaction.user.id;
                    const possessive = isOwnPoints ? 'Your' : `${targetUser.username}'s`;
                    
                    const monthHours = Math.floor((monthlyPoints?.total_minutes || 0) / 60);
                    const monthMins = (monthlyPoints?.total_minutes || 0) % 60;
                    const allTimeHours = Math.floor((allTimePoints?.total_minutes || 0) / 60);
                    const allTimeMins = (allTimePoints?.total_minutes || 0) % 60;
                    
                    const embed = {
                        color: 0x5865F2,
                        title: `🎯 ${possessive} Voice Points`,
                        fields: [
                            {
                                name: '📅 This Month',
                                value: `**${monthlyPoints?.total_points || 0}** points\n⏱️ ${monthHours}h ${monthMins}m voice time`,
                                inline: true
                            },
                            {
                                name: '🏆 All Time',
                                value: `**${allTimePoints?.total_points || 0}** points\n⏱️ ${allTimeHours}h ${allTimeMins}m voice time`,
                                inline: true
                            }
                        ],
                        footer: { text: '1 point = 5 minutes of voice activity' }
                    };
                    
                    await interaction.reply({ embeds: [embed] });
                } catch (error) {
                    console.error('Error fetching points:', error);
                    await interaction.reply({ content: '❌ Error fetching points data.', flags: MessageFlags.Ephemeral });
                }
                return;
            }
            
            // /leaderboard command
            if (commandName === 'leaderboard') {
                const type = options.getString('type') || 'monthly';
                
                try {
                    let leaderboard;
                    let title;
                    
                    if (type === 'alltime') {
                        leaderboard = await supabaseService.getAllTimeLeaderboard(10);
                        title = '🏆 All-Time Voice Activity Leaderboard';
                    } else {
                        const now = getISTTime();
                        leaderboard = await supabaseService.getMonthlyLeaderboard(10, now.getMonth() + 1, now.getFullYear());
                        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
                                           'July', 'August', 'September', 'October', 'November', 'December'];
                        title = `📊 ${monthNames[now.getMonth()]} ${now.getFullYear()} Voice Leaderboard`;
                    }
                    
                    if (!leaderboard || leaderboard.length === 0) {
                        await interaction.reply({ content: '📊 No voice activity data yet!', flags: MessageFlags.Ephemeral });
                        return;
                    }
                    
                    const medals = ['🥇', '🥈', '🥉'];
                    let leaderboardText = '';
                    
                    leaderboard.forEach((entry, index) => {
                        const medal = medals[index] || `**${index + 1}.**`;
                        const hours = Math.floor(entry.total_minutes / 60);
                        const mins = entry.total_minutes % 60;
                        leaderboardText += `${medal} **${entry.username}** - ${entry.total_points} pts (${hours}h ${mins}m)\n`;
                    });
                    
                    const embed = {
                        color: 0xFFD700,
                        title: title,
                        description: leaderboardText,
                        footer: { text: '1 point = 5 minutes of voice activity' }
                    };
                    
                    await interaction.reply({ embeds: [embed] });
                } catch (error) {
                    console.error('Error fetching leaderboard:', error);
                    await interaction.reply({ content: '❌ Error fetching leaderboard.', flags: MessageFlags.Ephemeral });
                }
                return;
            }
            
            // /mystats command
            if (commandName === 'mystats') {
                try {
                    const userId = interaction.user.id;
                    const now = getISTTime();
                    const monthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}/${now.getFullYear()}`;
                    
                    const monthlyPoints = await supabaseService.getUserVoicePoints(userId, monthYear);
                    const allTimePoints = await supabaseService.getUserAllTimePoints(userId);
                    const recentSessions = await supabaseService.getUserVoiceSessions(userId, 5);
                    const monthlyRank = await supabaseService.getMonthlyLeaderboard(100, now.getMonth() + 1, now.getFullYear());
                    
                    // Find user's rank
                    const userRankIndex = monthlyRank.findIndex(e => e.discord_user_id === userId);
                    const userRank = userRankIndex !== -1 ? userRankIndex + 1 : 'N/A';
                    
                    const monthHours = Math.floor((monthlyPoints?.total_minutes || 0) / 60);
                    const monthMins = (monthlyPoints?.total_minutes || 0) % 60;
                    const allTimeHours = Math.floor((allTimePoints?.total_minutes || 0) / 60);
                    const allTimeMins = (allTimePoints?.total_minutes || 0) % 60;
                    
                    // Format recent sessions
                    let sessionsText = 'No recent sessions';
                    if (recentSessions && recentSessions.length > 0) {
                        sessionsText = recentSessions.map(s => {
                            const date = new Date(s.session_date).toLocaleDateString('en-IN');
                            return `📍 ${s.channel_name || 'Voice'} - ${s.duration_minutes}m (+${s.points_earned} pts) - ${date}`;
                        }).join('\n');
                    }
                    
                    const embed = {
                        color: 0x5865F2,
                        title: `📊 ${interaction.user.username}'s Voice Stats`,
                        fields: [
                            {
                                name: '📅 This Month',
                                value: `🎯 **${monthlyPoints?.total_points || 0}** points\n⏱️ ${monthHours}h ${monthMins}m\n🏅 Rank: #${userRank}`,
                                inline: true
                            },
                            {
                                name: '🏆 All Time',
                                value: `🎯 **${allTimePoints?.total_points || 0}** points\n⏱️ ${allTimeHours}h ${allTimeMins}m`,
                                inline: true
                            },
                            {
                                name: '📜 Recent Sessions',
                                value: sessionsText,
                                inline: false
                            }
                        ],
                        footer: { text: '1 point = 5 minutes of voice activity' }
                    };
                    
                    await interaction.reply({ embeds: [embed] });
                } catch (error) {
                    console.error('Error fetching stats:', error);
                    await interaction.reply({ content: '❌ Error fetching your stats.', flags: MessageFlags.Ephemeral });
                }
                return;
            }
        }
        
        // Handle button clicks
        if (interaction.isButton()) {
            
            // Schedule Meeting button
            if (interaction.customId === 'schedule_meeting') {
                if (interaction.replied || interaction.deferred) return;
                
                const modal = new ModalBuilder()
                    .setCustomId('schedule_modal')
                    .setTitle('📅 Schedule a Meeting');

                const topicInput = new TextInputBuilder()
                    .setCustomId('meeting_topic')
                    .setLabel('Meeting Topic')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Daily Standup')
                    .setRequired(true);

                const channelInput = new TextInputBuilder()
                    .setCustomId('meeting_channel')
                    .setLabel(`Channel (Type: 1-${VOICE_CHANNELS.length})`)
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder(`1=Lounge 2=Aura 3=Room1 4=Room2`)
                    .setRequired(true);

                const dateInput = new TextInputBuilder()
                    .setCustomId('meeting_date')
                    .setLabel('Date (DD/MM/YYYY) - Leave blank for today')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('30/11/2025')
                    .setRequired(false);

                const startTimeInput = new TextInputBuilder()
                    .setCustomId('meeting_start_time')
                    .setLabel('Start Time (e.g., 8:00 PM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('8:00 PM')
                    .setRequired(true);

                const endTimeInput = new TextInputBuilder()
                    .setCustomId('meeting_end_time')
                    .setLabel('End Time (e.g., 10:00 PM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('10:00 PM')
                    .setRequired(true);

                modal.addComponents(
                    new ActionRowBuilder().addComponents(topicInput),
                    new ActionRowBuilder().addComponents(channelInput),
                    new ActionRowBuilder().addComponents(dateInput),
                    new ActionRowBuilder().addComponents(startTimeInput),
                    new ActionRowBuilder().addComponents(endTimeInput)
                );
                
                await interaction.showModal(modal);
                return;
            }
            
            // Start Wizard button - starts the step-by-step chat wizard
            if (interaction.customId === 'start_wizard') {
                if (interaction.replied || interaction.deferred) return;
                
                const userId = interaction.user.id;
                
                // Check if user already has an active session
                if (meetingWizardSessions.has(userId)) {
                    await interaction.reply({
                        content: '⚠️ You already have an active scheduling session. Complete it or type `cancel` to start over.',
                        flags: MessageFlags.Ephemeral
                    });
                    return;
                }
                
                // Reply first to acknowledge
                await interaction.reply({
                    content: '✅ Wizard started! Answer the questions in the channel.',
                    flags: MessageFlags.Ephemeral
                });
                
                // Initialize new session
                const session = {
                    step: 'title',
                    title: null,
                    date: null,
                    startTime: null,
                    endTime: null,
                    channelNum: null,
                    messages: [],
                    lastActivity: Date.now()
                };
                meetingWizardSessions.set(userId, session);
                
                // Auto-timeout cleanup
                setTimeout(() => {
                    const currentSession = meetingWizardSessions.get(userId);
                    if (currentSession && Date.now() - currentSession.lastActivity >= WIZARD_TIMEOUT) {
                        for (const msg of currentSession.messages) {
                            try { msg.delete(); } catch (e) {}
                        }
                        meetingWizardSessions.delete(userId);
                    }
                }, WIZARD_TIMEOUT + 1000);
                
                // Send first prompt
                const promptMsg = await interaction.channel.send(
                    `📅 **Meeting Scheduler** - Step 1/5\n\n` +
                    `Hey <@${userId}>! Let's schedule your meeting.\n\n` +
                    `📝 **What's the meeting title/topic?**\n` +
                    `_(e.g., "Team Standup", "Project Review")_\n\n` +
                    `_Type \`cancel\` to exit_`
                );
                session.messages.push(promptMsg);
                return;
            }
            
            // View Meetings button
            if (interaction.customId === 'view_meetings') {
                if (scheduledMeetings.size === 0) {
                    return interaction.reply({ 
                        content: '📭 No upcoming meetings scheduled.', 
                        flags: MessageFlags.Ephemeral
                    });
                }

                let message = '📋 **UPCOMING MEETINGS**\n\n';

                const buttons = [];
                scheduledMeetings.forEach((meeting, id) => {
                    const startTimeStr = meeting.startTime.toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    
                    const endTimeStr = meeting.endTime.toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    
                    const statusEmoji = meeting.status === 'active' ? '🔴 LIVE' : '📌';
                    const creatorTag = meeting.creatorId === interaction.user.id ? ' 👤' : '';
                    
                    message += `${statusEmoji} **${meeting.topic}**${creatorTag}\n`;
                    message += `🎙️ ${meeting.channelName}\n`;
                    message += `🕐 ${startTimeStr} - ${endTimeStr}\n\n`;

                    // Only show cancel button if user is the creator and meeting hasn't started
                    if (meeting.creatorId === interaction.user.id && meeting.status === 'scheduled') {
                        const label = meeting.topic.length > 15 ? meeting.topic.substring(0, 15) + '...' : meeting.topic;
                        buttons.push(
                            new ButtonBuilder()
                                .setCustomId(`cancel_${id}`)
                                .setLabel(`❌ ${label}`)
                                .setStyle(ButtonStyle.Danger)
                        );
                    }
                });

                const rows = [];
                if (buttons.length > 0) {
                    for (let i = 0; i < buttons.length; i += 5) {
                        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
                    }
                }

                await interaction.reply({ 
                    content: message, 
                    components: rows,
                    flags: MessageFlags.Ephemeral
                });
                return;
            }
            
            // Cancel meeting button
            if (interaction.customId.startsWith('cancel_')) {
                const meetingId = interaction.customId.replace('cancel_', '');
                
                if (scheduledMeetings.has(meetingId)) {
                    const meeting = scheduledMeetings.get(meetingId);
                    
                    // Verify user is the creator
                    if (meeting.creatorId !== interaction.user.id) {
                        return interaction.reply({
                            content: '❌ Only the meeting creator can cancel this meeting.',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    
                    // Ask for confirmation
                    const confirmRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder()
                                .setCustomId(`confirm_cancel_${meetingId}`)
                                .setLabel('✅ Yes, Cancel It')
                                .setStyle(ButtonStyle.Danger),
                            new ButtonBuilder()
                                .setCustomId('no_cancel')
                                .setLabel('❌ No, Keep It')
                                .setStyle(ButtonStyle.Secondary)
                        );

                    await interaction.reply({
                        content: `⚠️ Are you sure you want to cancel **"${meeting.topic}"**?`,
                        components: [confirmRow],
                        flags: MessageFlags.Ephemeral
                    });
                }
                return;
            }
            
            // Confirm cancellation
            if (interaction.customId.startsWith('confirm_cancel_')) {
                const meetingId = interaction.customId.replace('confirm_cancel_', '');
                
                if (scheduledMeetings.has(meetingId)) {
                    const meeting = scheduledMeetings.get(meetingId);
                    
                    // Verify user is still the creator
                    if (meeting.creatorId !== interaction.user.id) {
                        return interaction.update({
                            content: '❌ Only the meeting creator can cancel this meeting.',
                            components: []
                        });
                    }
                    
                    // Delete Discord event if it exists
                    if (meeting.eventId) {
                        try {
                            const guild = interaction.guild;
                            const event = await guild.scheduledEvents.fetch(meeting.eventId);
                            if (event) {
                                await event.delete();
                                console.log(`🗑️ Deleted Discord event for cancelled meeting: ${meeting.topic}`);
                            }
                        } catch (error) {
                            console.error(`Error deleting Discord event:`, error.message);
                        }
                    }
                    
                    clearTimeout(meeting.timeoutId);
                    scheduledMeetings.delete(meetingId);
                    
                    await interaction.update({
                        content: `✅ Meeting **"${meeting.topic}"** has been cancelled.`,
                        components: []
                    });
                    console.log(`❌ Meeting cancelled by ${interaction.user.username}: ${meeting.topic}`);
                }
                return;
            }
            
            // No cancellation
            if (interaction.customId === 'no_cancel') {
                await interaction.update({
                    content: '✅ Meeting kept. No changes made.',
                    components: []
                });
                return;
            }
        }
        
        // Handle modal submissions
        if (interaction.isModalSubmit() && interaction.customId === 'schedule_modal') {
            const topic = interaction.fields.getTextInputValue('meeting_topic');
            const channelInput = interaction.fields.getTextInputValue('meeting_channel').trim();
            const dateStr = interaction.fields.getTextInputValue('meeting_date').trim();
            const startTimeStr = interaction.fields.getTextInputValue('meeting_start_time');
            const endTimeStr = interaction.fields.getTextInputValue('meeting_end_time');

            try {
                // Parse channel number
                const channelNum = parseInt(channelInput);
                if (isNaN(channelNum) || channelNum < 1 || channelNum > VOICE_CHANNELS.length) {
                    return interaction.reply({
                        content: `❌ Invalid channel number. Please enter 1-${VOICE_CHANNELS.length}:\n${VOICE_CHANNELS.map((ch, i) => `${i + 1}. ${ch.name}`).join('\n')}`,
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const channel = VOICE_CHANNELS[channelNum - 1];
                
                // Parse date (use today if not provided)
                const now = new Date();
                let targetDate;
                
                if (dateStr) {
                    const [day, month, year] = dateStr.split('/').map(Number);
                    if (!day || !month || !year || day < 1 || day > 31 || month < 1 || month > 12) {
                        return interaction.reply({
                            content: '❌ Invalid date format. Use: **DD/MM/YYYY**',
                            flags: MessageFlags.Ephemeral
                        });
                    }
                    targetDate = { day, month, year };
                } else {
                    const istDateStr = now.toLocaleString('en-US', { 
                        timeZone: 'Asia/Kolkata',
                        year: 'numeric',
                        month: '2-digit',
                        day: '2-digit'
                    });
                    const [m, d, y] = istDateStr.split('/');
                    targetDate = { day: parseInt(d), month: parseInt(m), year: parseInt(y) };
                }
                
                // Parse start time
                const startParts = startTimeStr.trim().split(' ');
                if (startParts.length < 2) {
                    return interaction.reply({
                        content: '❌ Invalid start time format. Use: **8:00 PM**',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const [startTimeOnly, startPeriod] = startParts;
                const [startHoursStr, startMinutesStr] = startTimeOnly.split(':');
                let startHours = parseInt(startHoursStr);
                const startMinutes = parseInt(startMinutesStr);
                
                if (isNaN(startHours) || isNaN(startMinutes) || startHours < 1 || startHours > 12 || startMinutes < 0 || startMinutes > 59) {
                    return interaction.reply({
                        content: '❌ Invalid start time format. Use: **8:00 PM**',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (startPeriod.toUpperCase() === 'PM' && startHours !== 12) startHours += 12;
                if (startPeriod.toUpperCase() === 'AM' && startHours === 12) startHours = 0;
                
                // Parse end time
                const endParts = endTimeStr.trim().split(' ');
                if (endParts.length < 2) {
                    return interaction.reply({
                        content: '❌ Invalid end time format. Use: **10:00 PM**',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const [endTimeOnly, endPeriod] = endParts;
                const [endHoursStr, endMinutesStr] = endTimeOnly.split(':');
                let endHours = parseInt(endHoursStr);
                const endMinutes = parseInt(endMinutesStr);
                
                if (isNaN(endHours) || isNaN(endMinutes) || endHours < 1 || endHours > 12 || endMinutes < 0 || endMinutes > 59) {
                    return interaction.reply({
                        content: '❌ Invalid end time format. Use: **10:00 PM**',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (endPeriod.toUpperCase() === 'PM' && endHours !== 12) endHours += 12;
                if (endPeriod.toUpperCase() === 'AM' && endHours === 12) endHours = 0;
                
                // Create start and end time Date objects in IST
                const startTime = new Date(`${targetDate.year}-${targetDate.month.toString().padStart(2, '0')}-${targetDate.day.toString().padStart(2, '0')}T${startHours.toString().padStart(2, '0')}:${startMinutes.toString().padStart(2, '0')}:00+05:30`);
                const endTime = new Date(`${targetDate.year}-${targetDate.month.toString().padStart(2, '0')}-${targetDate.day.toString().padStart(2, '0')}T${endHours.toString().padStart(2, '0')}:${endMinutes.toString().padStart(2, '0')}:00+05:30`);
                
                // Validate times (compare in UTC)
                const nowUtc = Date.now();
                if (startTime.getTime() <= nowUtc) {
                    return interaction.reply({
                        content: '❌ Start time must be in the future.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                if (endTime.getTime() <= startTime.getTime()) {
                    return interaction.reply({
                        content: '❌ End time must be after start time.',
                        flags: MessageFlags.Ephemeral
                    });
                }
                
                const meetingId = Date.now().toString();
                
                const dateDispStr = startTime.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const startTimeDispStr = startTime.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                const endTimeDispStr = endTime.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                
                // Calculate duration
                const durationMs = endTime.getTime() - startTime.getTime();
                const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                const durationStr = `${durationHours}h ${durationMinutes}m`;
                
                // Send confirmation in schedule channel
                const scheduleChannel = await client.channels.fetch(SCHEDULE_MEET_CHANNEL_ID);
                const confirmationMsg = await scheduleChannel.send({
                    content: `✅ **Meeting Scheduled**\n` +
                            `👤 By: <@${interaction.user.id}>\n` +
                            `📅 ${dateDispStr}\n` +
                            `🕐 ${startTimeDispStr} - ${endTimeDispStr} IST (${durationStr})\n` +
                            `📝 **${topic}**\n` +
                            `📍 ${channel.name}\n\n` +
                            `⏰ Tracking will start automatically at meeting time.`
                });
                
                // Create Discord Scheduled Event
                const guild = interaction.guild;
                const scheduledEvent = await guild.scheduledEvents.create({
                    name: topic,
                    scheduledStartTime: startTime,
                    scheduledEndTime: endTime,
                    privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                    entityType: GuildScheduledEventEntityType.Voice,
                    channel: channel.id,
                    description: `Scheduled meeting with automated attendance tracking.`
                });
                
                scheduledMeetings.set(meetingId, {
                    startTime: startTime,
                    endTime: endTime,
                    topic: topic,
                    channelId: channel.id,
                    channelName: channel.name,
                    creatorId: interaction.user.id,
                    confirmationMsg: confirmationMsg,
                    status: 'scheduled',
                    eventId: scheduledEvent.id
                });
                
                // Reply to user
                await interaction.reply({
                    content: `✅ **Meeting scheduled successfully!**\n` +
                            `📝 ${topic}\n` +
                            `🎙️ ${channel.name}\n` +
                            `🕐 ${startTimeDispStr} - ${endTimeDispStr} IST\n` +
                            `⏱️ Duration: ${durationStr}\n\n` +
                            `Attendance tracking will start automatically.\n` +
                            `📅 Discord event created!`,
                    flags: MessageFlags.Ephemeral
                });
                
                console.log(`📅 Meeting scheduled by ${interaction.user.username}: ${topic} at ${startTimeDispStr} (Event ID: ${scheduledEvent.id})`);
                
            } catch (error) {
                console.error('Error scheduling meeting:', error);
                await interaction.reply({
                    content: '❌ Invalid time format. Use format like: **8:00 PM**',
                    flags: MessageFlags.Ephemeral
                });
            }
            return;
        }
        
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                flags: MessageFlags.Ephemeral
            }).catch(console.error);
        }
    }
});

// DM Handler for personal reminders
client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Debug: Log all messages in guilds
    if (message.guild) {
        const parentId = message.channel.parentId || message.channel.id;
        const isThread = message.channel.isThread();
        console.log(`💬 Message from ${message.author.username} in ${isThread ? 'thread' : 'channel'} ${message.channel.id} (Parent: ${parentId}, Progress: ${PROGRESS_CHANNEL_ID})`);
    }
    
    // Handle progress updates in the PROGRESS_CHANNEL_ID (including threads)
    const channelId = message.channel.parentId || message.channel.id; // Get parent channel if in thread
    if (channelId === PROGRESS_CHANNEL_ID && !message.content.startsWith('!')) {
        console.log(`📝 Message in progress channel from ${message.author.username}`);
        // Check if user has the ROOKIE_ROLE_ID
        const member = message.member;
        console.log(`👤 Member roles:`, member ? Array.from(member.roles.cache.keys()) : 'No member');
        console.log(`🔍 Looking for rookie role: ${ROOKIE_ROLE_ID}`);
        if (!member || !member.roles.cache.has(ROOKIE_ROLE_ID)) {
            console.log(`⚠️ User ${message.author.username} doesn't have rookie role (ID: ${ROOKIE_ROLE_ID})`);
            return; // Ignore messages from users without the rookie role
        }
        console.log(`✅ User ${message.author.username} has rookie role, processing progress update...`);
        
        try {
            // Check if already posted today
            const alreadyPosted = await supabaseService.hasPostedToday(message.author.id);
            if (alreadyPosted) {
                return; // Silently ignore if already posted today
            }
            
            // Check for image attachment
            const hasImage = message.attachments.size > 0 && 
                            message.attachments.some(att => att.contentType?.startsWith('image/'));
            
            if (!hasImage) {
                return; // Silently ignore if no image
            }
            
            // Record progress update (no AI verification, no word count)
            const result = await supabaseService.recordProgressUpdate(
                message.author.id,
                message.author.username,
                message.content,
                0, // word count not needed
                hasImage,
                null // no AI feedback
            );
            
            if (!result) {
                console.error('Failed to record progress update');
                return;
            }
            
            // Format date
            const today = new Date();
            const formattedDate = `${today.getMonth() + 1}/${today.getDate()}/${today.getFullYear()}`;
            
            // Send simple success message
            const responseMessage = 
                `Appreciation for updating your daily progress, ${ROLE_NAME} ${message.author.username}. You've been awarded **5 points** for your update ${formattedDate}\n` +
                `Current streak: **${result.current_streak} day${result.current_streak > 1 ? 's' : ''}**! ${result.current_streak >= 7 ? 'Amazing consistency!' : 'Keep it up!'}`;
            
            await message.reply(responseMessage);
            
            console.log(`✅ Progress update recorded for ${message.author.username}, Streak: ${result.current_streak}`);
            
        } catch (error) {
            console.error('❌ Error handling progress update:', error);
        }
        
        return; // Stop here for progress channel messages
    }
    
    // Handle bot messages
    if (message.author.bot) return;
    
    // Handle DMs (personal reminders)
    if (!message.guild) {
        const userId = message.author.id;
        const content = message.content.trim().toLowerCase();
        const state = conversationStates.get(userId);
        
        try {
            // Help command
            if (content === '!help') {
                await message.reply(
                    "🤖 **BeeLert Bot Help**\n\n" +
                    "**Setup Daily Reminder:**\n" +
                    "• Say `remind me at 9 PM` (natural language!)\n" +
                    "• Or type `!reminder` for guided setup\n\n" +
                    "**Manage Your Reminder:**\n" +
                    "• `!status` - View your current settings\n" +
                    "• `!pause` - Temporarily pause reminders\n" +
                    "• `!resume` - Resume paused reminders\n" +
                    "• `!change time` - Update reminder time\n" +
                    "• `!change message` - Update custom message\n" +
                    "• `!stop` - Delete your reminder completely\n\n" +
                    "**Chat with AI:**\n" +
                    "• Just send any message and I'll respond!\n" +
                    "• 🧠 I remember our last 10 messages (2 hours)\n" +
                    "• `!clear` - Clear conversation history\n\n" +
                    "**Examples:**\n" +
                    "• `remind me at 8:30 PM`\n" +
                    "• `set a reminder for 9 AM`\n" +
                    "• `daily reminder at 21:00`\n\n" +
                    "💾 Your reminders are saved and persist across bot restarts!"
                );
                return;
            }
            
            // Clear conversation history command
            if (content === '!clear') {
                clearHistory(userId);
                await message.reply("🗑️ Conversation history cleared! Starting fresh.");
                return;
            }
            
            // Start reminder setup with !reminder command
            if (content === '!reminder') {
                conversationStates.set(userId, { step: 'awaiting_time' });
                await message.reply(
                    "Hi! I can remind you to post your daily progress. 📝\n\n" +
                    "What time works best for you?\n" +
                    "**Examples:** `8:00 PM`, `9 PM`, `21:00`, `8:30 PM`\n\n" +
                    "_(Type `cancel` anytime to stop)_"
                );
                return;
            }
            
            // If NOT in conversation state and NOT a command - use AI
            if (!state && !['!help', '!status', '!pause', '!resume', '!change time', '!change message', '!stop', '!reminder', '!clear'].includes(content)) {
                try {
                    await message.channel.sendTyping();
                    
                    // Check for natural language reminder request
                    const reminderResult = parseNaturalLanguageReminder(message.content);
                    
                    if (reminderResult.isReminderRequest && reminderResult.time) {
                        // User asked to set a reminder with a time - set it directly
                        const { hours, minutes, display12hr } = reminderResult;
                        const timeString = `${hours}:${minutes.toString().padStart(2, '0')}`;
                        
                        // Check if they also specified a custom message
                        const customMessage = reminderResult.customMessage || null;
                        
                        // Save reminder to database and memory
                        await supabaseService.saveDailyReminder(userId, timeString, customMessage);
                        userReminders.set(userId, {
                            time: timeString,
                            customMessage: customMessage,
                            active: true
                        });
                        
                        console.log(`⏰ Natural language reminder set for ${message.author.username} at ${timeString} IST (saved to DB)`);
                        
                        // Add to history
                        addToHistory(userId, 'user', message.content);
                        
                        const responseMsg = customMessage 
                            ? `✅ Done! I've set your daily reminder for **${display12hr} IST**.\n\n` +
                              `📝 Custom message: "${customMessage}"\n\n` +
                              `I'll DM you every day at this time! Use \`!status\` to check or \`!stop\` to cancel.`
                            : `✅ Done! I've set your daily reminder for **${display12hr} IST**.\n\n` +
                              `I'll DM you every day to post your progress! Use \`!status\` to check or \`!stop\` to cancel.`;
                        
                        addToHistory(userId, 'assistant', responseMsg);
                        await message.reply(responseMsg);
                        return;
                    }
                    
                    if (reminderResult.isReminderRequest && !reminderResult.time) {
                        // User wants a reminder but didn't specify time - ask for it
                        conversationStates.set(userId, { step: 'awaiting_time', fromNaturalLanguage: true });
                        
                        addToHistory(userId, 'user', message.content);
                        const askTimeMsg = "Sure! I'd love to set up a daily reminder for you. 📝\n\n" +
                            "What time works best?\n" +
                            "**Examples:** `8:00 PM`, `9 PM`, `21:00`, `8:30 AM`\n\n" +
                            "_(Or type `cancel` to stop)_";
                        addToHistory(userId, 'assistant', askTimeMsg);
                        
                        await message.reply(askTimeMsg);
                        return;
                    }
                    
                    // Regular AI chat - no reminder intent detected
                    // Get conversation history for this user
                    const history = getHistory(userId);
                    const isFirstChat = history.length === 0;
                    
                    const systemPrompt = isFirstChat 
                        ? `You are BeeLert, a friendly Discord productivity bot. This is the user's FIRST chat with you.\n\n` +
                          `IMPORTANT: Mention once that they can say "remind me at 9 PM" or type !reminder to set up daily reminders.\n\n` +
                          `FEATURES: Daily reminders (natural language or !reminder), Meeting scheduling, AI chat with memory, Voice tracking\n` +
                          `COMMANDS: !reminder, !help, !status, !clear\n\n` +
                          `Respond naturally, mention the reminder feature briefly, keep under 100 words.`
                        : `You are BeeLert, a friendly Discord productivity bot assistant. You remember our conversation. Respond naturally and helpfully. Be conversational and concise (under 80 words).`;
                    
                    // Add user message to history BEFORE getting response
                    addToHistory(userId, 'user', message.content);
                    
                    // Get AI response with conversation context
                    const aiResponse = await aiService.askWithHistory(message.content, history, systemPrompt);
                    
                    // Add AI response to history
                    addToHistory(userId, 'assistant', aiResponse);
                    
                    await message.reply(
                        aiResponse || 
                        "👋 Hi! I'm BeeLert, your productivity assistant!\n\n" +
                        "Type `!help` to see all commands or `!reminder` to set up daily reminders!"
                    );
                    return;
                } catch (aiError) {
                    console.error('AI response error in DM:', aiError);
                    await message.reply(
                        "👋 Hi! I'm BeeLert, your productivity assistant!\n\n" +
                        "Type `!help` to see all commands or `!reminder` to set up daily reminders!"
                    );
                    return;
                }
            }
            
            // Handle time input
            if (state && state.step === 'awaiting_time') {
                if (content === 'cancel') {
                    conversationStates.delete(userId);
                    await message.reply("❌ Setup cancelled. Type `!reminder` to start again.");
                    return;
                }
                
                // Parse time
                const timeMatch = message.content.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
                if (!timeMatch) {
                    await message.reply(
                        "⚠️ I didn't understand that time format.\n" +
                        "Please try again (e.g., `8:00 PM` or `20:00`)"
                    );
                    return;
                }
                
                let hours = parseInt(timeMatch[1]);
                const minutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                const period = timeMatch[3]?.toUpperCase();
                
                // Validate hours and minutes
                if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                    await message.reply("⚠️ Invalid time. Hours: 0-23, Minutes: 0-59");
                    return;
                }
                
                // Convert to 24-hour format
                if (period === 'PM' && hours !== 12) hours += 12;
                if (period === 'AM' && hours === 12) hours = 0;
                
                const timeString = `${hours}:${minutes.toString().padStart(2, '0')}`;
                
                // Store time and move to next step
                state.time = timeString;
                state.step = 'awaiting_message';
                conversationStates.set(userId, state);
                
                const display12hr = period ? `${hours > 12 ? hours - 12 : hours === 0 ? 12 : hours}:${minutes.toString().padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}` : timeString;
                
                await message.reply(
                    `✅ Got it! I'll remind you at **${display12hr} IST** daily.\n\n` +
                    "Want a custom reminder message? 💬\n" +
                    "Send your message, or type **`skip`** for default."
                );
                return;
            }
            
            // Handle custom message
            if (state && state.step === 'awaiting_message') {
                if (content === 'cancel') {
                    conversationStates.delete(userId);
                    await message.reply("❌ Setup cancelled.");
                    return;
                }
                
                const customMessage = content === 'skip' ? null : message.content;
                
                // Save reminder settings to database and memory
                await supabaseService.saveDailyReminder(userId, state.time, customMessage);
                userReminders.set(userId, {
                    time: state.time,
                    customMessage: customMessage,
                    active: true,
                    createdAt: Date.now()
                });
                
                // Clear conversation state
                conversationStates.delete(userId);
                
                const displayMessage = customMessage || "Default reminder message";
                
                await message.reply(
                    "🎉 **All set!** Your daily reminder is configured.\n\n" +
                    `⏰ **Time:** ${state.time} IST\n` +
                    `📝 **Message:** ${displayMessage}\n\n` +
                    "**Commands:** Type `!help` to see all commands"
                );
                
                console.log(`✅ Reminder created for ${message.author.username} at ${state.time} (saved to DB)`);
                return;
            }
            
            // Status command
            if (content === '!status') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `!reminder` to create one.");
                    return;
                }
                
                await message.reply(
                    "📊 **Your Reminder Settings**\n\n" +
                    `⏰ **Time:** ${reminder.time} IST\n` +
                    `📝 **Message:** ${reminder.customMessage || 'Default'}\n` +
                    `🔔 **Status:** ${reminder.active ? '✅ Active' : '⏸️ Paused'}\n\n` +
                    "Type `!help` for available commands"
                );
                return;
            }
            
            // Pause command
            if (content === '!pause') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `!reminder` to create one.");
                    return;
                }
                reminder.active = false;
                await supabaseService.updateDailyReminderStatus(userId, false);
                await message.reply("⏸️ Reminders paused. Type `!resume` to turn them back on.");
                return;
            }
            
            // Resume command
            if (content === '!resume') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `!reminder` to create one.");
                    return;
                }
                reminder.active = true;
                await supabaseService.updateDailyReminderStatus(userId, true);
                await message.reply("✅ Reminders resumed!");
                return;
            }
            
            // Change time
            if (content === '!change time') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `!reminder` to create one.");
                    return;
                }
                conversationStates.set(userId, { step: 'awaiting_time' });
                await message.reply("What's your new preferred time? (e.g., `9:00 PM`)");
                return;
            }
            
            // Change message
            if (content === '!change message') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `!reminder` to create one.");
                    return;
                }
                conversationStates.set(userId, { 
                    step: 'awaiting_message',
                    time: reminder.time 
                });
                await message.reply("Send your new custom message, or type `skip` for default.");
                return;
            }
            
            // Stop/delete reminder
            if (content === '!stop') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set.");
                    return;
                }
                await supabaseService.deleteDailyReminder(userId);
                userReminders.delete(userId);
                await message.reply("❌ Daily reminder deleted. Type `reminder` anytime to set up again.");
                console.log(`🗑️ Reminder deleted for ${message.author.username} (removed from DB)`);
                return;
            }
            
            // Unknown command in DM - Use AI to respond
            try {
                const typing = message.channel.sendTyping();
                
                const aiResponse = await aiService.askQuestion(
                    `You are BeeLert, a helpful productivity bot assistant. A user sent you: "${message.content}". ` +
                    `Respond helpfully and mention they can type 'help' for commands or 'reminder' to set up daily reminders. ` +
                    `Keep response under 200 words.`
                );
                
                await message.reply(
                    aiResponse || 
                    "🤔 I didn't understand that.\n\n" +
                    "Type `help` to see all available commands, or `reminder` to set up daily reminders!"
                );
            } catch (aiError) {
                console.error('AI response error in DM:', aiError);
                await message.reply(
                    "🤔 I didn't understand that.\n\n" +
                    "Type `help` to see all available commands, or `reminder` to set up daily reminders!"
                );
            }
            
        } catch (error) {
            console.error('Error handling DM:', error);
            await message.reply(
                "❌ An error occurred. Please try again or contact support."
            ).catch(() => {});
        }
        
        return; // Stop here for DMs
    }

    // Server message handler starts here
    
    // Handle !rookie command
    if (message.content.toLowerCase() === '!rookie') {
        try {
            const leaderboard = await supabaseService.getProgressLeaderboard(10);
            
            if (leaderboard.length === 0) {
                await message.reply("📊 No progress updates yet! Be the first to post in the progress channel.");
                return;
            }
            
            let leaderboardText = "🏆 **Rookie Progress Leaderboard** 🏆\n\n";
            
            leaderboard.forEach((user, index) => {
                const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
                const streak = user.current_streak > 0 ? `🔥 ${user.current_streak}` : '';
                leaderboardText += `${medal} **${user.username}** - ${user.total_points} pts ${streak}\n`;
                leaderboardText += `   └ ${user.total_updates} updates | Longest: ${user.longest_streak} days\n\n`;
            });
            
            leaderboardText += `\n💡 Post daily progress updates in <#${PROGRESS_CHANNEL_ID}> to earn points and maintain your streak!`;
            
            await message.reply(leaderboardText);
        } catch (error) {
            console.error('Error fetching rookie leaderboard:', error);
            await message.reply("❌ Failed to fetch leaderboard. Please try again later.");
        }
        return;
    }
    
    // Interactive meeting scheduling wizard in schedule-meet channel
    if (message.channel.id === SCHEDULE_MEET_CHANNEL_ID && !message.content.startsWith('!')) {
        const userId = message.author.id;
        const content = message.content.trim().toLowerCase();
        
        // Check if user has an active wizard session
        let session = meetingWizardSessions.get(userId);
        
        // Check for cancel command
        if (content === 'cancel' || content === 'stop' || content === 'exit') {
            if (session) {
                // Delete all session messages
                for (const msg of session.messages) {
                    try { await msg.delete(); } catch (e) {}
                }
                try { await message.delete(); } catch (e) {}
                meetingWizardSessions.delete(userId);
                const cancelMsg = await message.channel.send(`❌ Meeting scheduling cancelled, <@${userId}>.`);
                setTimeout(() => cancelMsg.delete().catch(() => {}), 5000);
            }
            return;
        }
        
        // Start new wizard session
        const startKeywords = ['schedule', 'meeting', 'meet', 'create', 'new', 'book', 'plan'];
        const isStartCommand = startKeywords.some(kw => content.includes(kw)) || !session;
        
        if (!session && (isStartCommand || content.length > 0)) {
            // Initialize new session
            session = {
                step: 'title',
                title: null,
                date: null,
                startTime: null,
                endTime: null,
                channelNum: null,
                messages: [message],
                lastActivity: Date.now()
            };
            meetingWizardSessions.set(userId, session);
            
            // Auto-timeout cleanup
            setTimeout(() => {
                const currentSession = meetingWizardSessions.get(userId);
                if (currentSession && Date.now() - currentSession.lastActivity >= WIZARD_TIMEOUT) {
                    for (const msg of currentSession.messages) {
                        try { msg.delete(); } catch (e) {}
                    }
                    meetingWizardSessions.delete(userId);
                }
            }, WIZARD_TIMEOUT + 1000);
            
            const promptMsg = await message.channel.send(
                `📅 **Meeting Scheduler** - Step 1/5\n\n` +
                `Hey <@${userId}>! Let's schedule your meeting.\n\n` +
                `📝 **What's the meeting title/topic?**\n` +
                `_(e.g., "Team Standup", "Project Review")_\n\n` +
                `_Type \`cancel\` to exit_`
            );
            session.messages.push(promptMsg);
            return;
        }
        
        if (session) {
            session.lastActivity = Date.now();
            session.messages.push(message);
            
            try {
                // Process based on current step
                if (session.step === 'title') {
                    session.title = message.content.trim();
                    session.step = 'date';
                    
                    const promptMsg = await message.channel.send(
                        `📅 **Meeting Scheduler** - Step 2/5\n\n` +
                        `Great! Topic: **${session.title}**\n\n` +
                        `📆 **When is the meeting?**\n` +
                        `• \`today\` - Today\n` +
                        `• \`tomorrow\` - Tomorrow\n` +
                        `• \`DD/MM\` - Specific date (e.g., 25/12)\n\n` +
                        `_Type \`cancel\` to exit_`
                    );
                    session.messages.push(promptMsg);
                    
                } else if (session.step === 'date') {
                    const input = content;
                    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
                    
                    if (input === 'today') {
                        session.date = { day: nowIST.getDate(), month: nowIST.getMonth() + 1, year: nowIST.getFullYear() };
                    } else if (input === 'tomorrow') {
                        const tomorrow = new Date(nowIST);
                        tomorrow.setDate(tomorrow.getDate() + 1);
                        session.date = { day: tomorrow.getDate(), month: tomorrow.getMonth() + 1, year: tomorrow.getFullYear() };
                    } else {
                        const dateMatch = input.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?/);
                        if (dateMatch) {
                            const day = parseInt(dateMatch[1]);
                            const month = parseInt(dateMatch[2]);
                            const year = dateMatch[3] ? (dateMatch[3].length === 2 ? 2000 + parseInt(dateMatch[3]) : parseInt(dateMatch[3])) : nowIST.getFullYear();
                            if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
                                session.date = { day, month, year };
                            }
                        }
                    }
                    
                    if (!session.date) {
                        const errorMsg = await message.channel.send(`❌ Invalid date. Try: \`today\`, \`tomorrow\`, or \`DD/MM\` (e.g., 25/12)`);
                        session.messages.push(errorMsg);
                        return;
                    }
                    
                    session.step = 'start_time';
                    const dateStr = `${session.date.day}/${session.date.month}/${session.date.year}`;
                    
                    const promptMsg = await message.channel.send(
                        `📅 **Meeting Scheduler** - Step 3/5\n\n` +
                        `Topic: **${session.title}**\n` +
                        `Date: **${dateStr}**\n\n` +
                        `⏰ **What's the START time? (IST)**\n` +
                        `• \`8 PM\` or \`8:30 PM\`\n` +
                        `• \`20:00\` (24-hour format)\n\n` +
                        `_Type \`cancel\` to exit_`
                    );
                    session.messages.push(promptMsg);
                    
                } else if (session.step === 'start_time') {
                    // Parse start time
                    const timeInput = message.content.trim();
                    let startHours = null, startMinutes = 0;
                    
                    const timeMatch = timeInput.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
                    if (timeMatch) {
                        startHours = parseInt(timeMatch[1]);
                        startMinutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                        const period = timeMatch[3]?.toUpperCase();
                        
                        if (period === 'PM' && startHours !== 12) startHours += 12;
                        if (period === 'AM' && startHours === 12) startHours = 0;
                    }
                    
                    if (startHours === null || startHours < 0 || startHours > 23) {
                        const errorMsg = await message.channel.send(`❌ Invalid time. Try: \`8 PM\`, \`8:30 PM\`, or \`20:00\``);
                        session.messages.push(errorMsg);
                        return;
                    }
                    
                    session.startTime = { hours: startHours, minutes: startMinutes };
                    session.step = 'end_time';
                    
                    const formatTime = (h, m) => {
                        const period = h >= 12 ? 'PM' : 'AM';
                        const h12 = h % 12 || 12;
                        return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
                    };
                    
                    const promptMsg = await message.channel.send(
                        `📅 **Meeting Scheduler** - Step 4/5\n\n` +
                        `Topic: **${session.title}**\n` +
                        `Date: **${session.date.day}/${session.date.month}/${session.date.year}**\n` +
                        `Start: **${formatTime(startHours, startMinutes)} IST**\n\n` +
                        `⏰ **What's the END time? (IST)**\n` +
                        `• \`10 PM\` or \`10:30 PM\`\n` +
                        `• \`22:00\` (24-hour format)\n\n` +
                        `_Type \`cancel\` to exit_`
                    );
                    session.messages.push(promptMsg);
                    
                } else if (session.step === 'end_time') {
                    // Parse end time
                    const timeInput = message.content.trim();
                    let endHours = null, endMinutes = 0;
                    
                    const timeMatch = timeInput.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
                    if (timeMatch) {
                        endHours = parseInt(timeMatch[1]);
                        endMinutes = timeMatch[2] ? parseInt(timeMatch[2]) : 0;
                        const period = timeMatch[3]?.toUpperCase();
                        
                        if (period === 'PM' && endHours !== 12) endHours += 12;
                        if (period === 'AM' && endHours === 12) endHours = 0;
                    }
                    
                    if (endHours === null || endHours < 0 || endHours > 23) {
                        const errorMsg = await message.channel.send(`❌ Invalid time. Try: \`10 PM\`, \`10:30 PM\`, or \`22:00\``);
                        session.messages.push(errorMsg);
                        return;
                    }
                    
                    session.endTime = { hours: endHours, minutes: endMinutes };
                    session.step = 'channel';
                    
                    const formatTime = (h, m) => {
                        const period = h >= 12 ? 'PM' : 'AM';
                        const h12 = h % 12 || 12;
                        return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
                    };
                    
                    const promptMsg = await message.channel.send(
                        `📅 **Meeting Scheduler** - Step 5/5\n\n` +
                        `Topic: **${session.title}**\n` +
                        `Date: **${session.date.day}/${session.date.month}/${session.date.year}**\n` +
                        `Time: **${formatTime(session.startTime.hours, session.startTime.minutes)} - ${formatTime(endHours, endMinutes)} IST**\n\n` +
                        `📍 **Which voice channel?**\n` +
                        `• \`1\` - 🌴 Lounge\n` +
                        `• \`2\` - 💬 Aura 7F\n` +
                        `• \`3\` - 📹 Meeting Room 1\n` +
                        `• \`4\` - 📹 Meeting Room 2\n` +
                        `• \`5\` - 👋 Guest\n\n` +
                        `_Type \`cancel\` to exit_`
                    );
                    session.messages.push(promptMsg);
                    
                } else if (session.step === 'channel') {
                    const channelInput = content.trim();
                    let channelNum = null;
                    
                    if (channelInput === '1' || channelInput.includes('lounge')) channelNum = 1;
                    else if (channelInput === '2' || channelInput.includes('aura')) channelNum = 2;
                    else if (channelInput === '3' || channelInput.includes('room 1')) channelNum = 3;
                    else if (channelInput === '4' || channelInput.includes('room 2')) channelNum = 4;
                    else if (channelInput === '5' || channelInput.includes('guest')) channelNum = 5;
                    else {
                        const numMatch = channelInput.match(/[1-5]/);
                        if (numMatch) channelNum = parseInt(numMatch[0]);
                    }
                    
                    if (!channelNum) {
                        const errorMsg = await message.channel.send(`❌ Invalid channel. Enter a number from 1 to 5.`);
                        session.messages.push(errorMsg);
                        return;
                    }
                    
                    session.channelNum = channelNum;
                    
                    // === CREATE THE MEETING ===
                    const channel = VOICE_CHANNELS[channelNum - 1];
                    const targetDate = session.date;
                    
                    const startTime = new Date(`${targetDate.year}-${targetDate.month.toString().padStart(2, '0')}-${targetDate.day.toString().padStart(2, '0')}T${session.startTime.hours.toString().padStart(2, '0')}:${session.startTime.minutes.toString().padStart(2, '0')}:00+05:30`);
                    const endTime = new Date(`${targetDate.year}-${targetDate.month.toString().padStart(2, '0')}-${targetDate.day.toString().padStart(2, '0')}T${session.endTime.hours.toString().padStart(2, '0')}:${session.endTime.minutes.toString().padStart(2, '0')}:00+05:30`);
                    
                    // Validate
                    if (startTime.getTime() <= Date.now()) {
                        const errorMsg = await message.channel.send(`❌ Start time must be in the future.\nCurrent IST: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`);
                        session.messages.push(errorMsg);
                        session.step = 'start_time';
                        return;
                    }
                    
                    if (endTime.getTime() <= startTime.getTime()) {
                        const errorMsg = await message.channel.send(`❌ End time must be after start time. Please re-enter end time.`);
                        session.messages.push(errorMsg);
                        session.step = 'end_time';
                        return;
                    }
                    
                    const meetingId = Date.now().toString();
                    
                    // Format display strings
                    const dateDispStr = startTime.toLocaleDateString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric'
                    });
                    const startTimeDispStr = startTime.toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    const endTimeDispStr = endTime.toLocaleTimeString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    
                    const durationMs = endTime.getTime() - startTime.getTime();
                    const durationHours = Math.floor(durationMs / (1000 * 60 * 60));
                    const durationMinutes = Math.floor((durationMs % (1000 * 60 * 60)) / (1000 * 60));
                    const durationStr = durationHours > 0 ? `${durationHours}h ${durationMinutes}m` : `${durationMinutes}m`;
                    
                    // Create Discord Scheduled Event
                    const guild = message.guild;
                    const scheduledEvent = await guild.scheduledEvents.create({
                        name: session.title,
                        scheduledStartTime: startTime,
                        scheduledEndTime: endTime,
                        privacyLevel: GuildScheduledEventPrivacyLevel.GuildOnly,
                        entityType: GuildScheduledEventEntityType.Voice,
                        channel: channel.id,
                        description: `Scheduled by ${message.author.username} via interactive wizard.`
                    });
                    
                    // Post confirmation to MEETING_SUMMARY_CHANNEL_ID
                    const summaryChannel = await client.channels.fetch(MEETING_SUMMARY_CHANNEL_ID);
                    const confirmationMsg = await summaryChannel.send({
                        content: `✅ **Meeting Scheduled**\n\n` +
                                `📝 **${session.title}**\n` +
                                `👤 Scheduled by: <@${message.author.id}>\n` +
                                `📅 ${dateDispStr}\n` +
                                `🕐 ${startTimeDispStr} - ${endTimeDispStr} IST (${durationStr})\n` +
                                `📍 ${channel.name}\n\n` +
                                `⏰ Attendance tracking will start automatically at meeting time.\n` +
                                `📅 Discord event created!`
                    });
                    
                    // Store meeting
                    scheduledMeetings.set(meetingId, {
                        startTime: startTime,
                        endTime: endTime,
                        topic: session.title,
                        channelId: channel.id,
                        channelName: channel.name,
                        creatorId: message.author.id,
                        confirmationMsg: confirmationMsg,
                        status: 'scheduled',
                        eventId: scheduledEvent.id
                    });
                    
                    console.log(`📅 Meeting scheduled by ${message.author.username}: ${session.title} at ${startTimeDispStr}`);
                    
                    // Send success message then cleanup
                    const successMsg = await message.channel.send(
                        `✅ **Meeting Scheduled Successfully!**\n\n` +
                        `📝 **${session.title}**\n` +
                        `📅 ${dateDispStr}\n` +
                        `🕐 ${startTimeDispStr} - ${endTimeDispStr} IST\n` +
                        `📍 ${channel.name}\n\n` +
                        `Check <#${MEETING_SUMMARY_CHANNEL_ID}> for details!`
                    );
                    session.messages.push(successMsg);
                    
                    // Delete all wizard messages after 5 seconds
                    setTimeout(async () => {
                        for (const msg of session.messages) {
                            try { await msg.delete(); } catch (e) {}
                        }
                    }, 5000);
                    
                    meetingWizardSessions.delete(userId);
                }
            } catch (error) {
                console.error('Error in meeting wizard:', error);
                const errorMsg = await message.channel.send(`❌ Error scheduling meeting: ${error.message}`);
                session.messages.push(errorMsg);
            }
            return;
        }
    }

    // Gemini AI Chat in dedicated channel
    if (message.channel.id === GEMINI_CHANNEL_ID && !message.content.startsWith('!')) {
        try {
            await message.channel.sendTyping();
            
            // Use channel ID for shared conversation context
            const contextId = `channel_${message.channel.id}`;
            const history = getHistory(contextId);
            
            const systemPrompt = `You are BeeLert, a helpful AI assistant in a Discord server. You have conversation memory and can reference previous messages. Answer questions naturally and helpfully. Keep responses concise (under 150 words).`;
            
            // Add user message to history (include username for context)
            addToHistory(contextId, 'user', `${message.author.username}: ${message.content}`);
            
            // Get AI response with conversation context
            const response = await aiService.askWithHistory(message.content, history, systemPrompt);
            
            // Add AI response to history
            addToHistory(contextId, 'assistant', response);
            
            // Split long responses
            if (response.length > 2000) {
                const chunks = response.match(/[\s\S]{1,2000}/g);
                for (const chunk of chunks) {
                    const sentMsg = await message.reply(chunk);
                    scheduleMessageDeletion(sentMsg);
                }
            } else {
                const sentMsg = await message.reply(response);
                scheduleMessageDeletion(sentMsg);
            }
            
            // Schedule deletion of user's message too
            scheduleMessageDeletion(message);
        } catch (error) {
            console.error('Error in Gemini chat:', error);
            await message.reply('Sorry, I had trouble processing that. Please try again!');
        }
        return;
    }

    // Handle @mentions of the bot in any channel
    if (message.mentions.has(client.user) && !message.author.bot) {
        try {
            await message.channel.sendTyping();
            
            // Remove the bot mention from the message to get the actual question
            const userQuestion = message.content
                .replace(new RegExp(`<@!?${client.user.id}>`, 'g'), '')
                .trim();
            
            // If empty message (just a mention), respond with intro
            if (!userQuestion) {
                await message.reply(
                    "👋 Hey! I'm **BeeLert**, your productivity assistant!\n\n" +
                    "You can:\n" +
                    "• Ask me anything by mentioning me\n" +
                    "• DM me for personal reminders\n" +
                    "• Chat in <#" + GEMINI_CHANNEL_ID + "> for AI conversations\n\n" +
                    "Try: `@BeeLert what's the weather like?`"
                );
                return;
            }
            
            // Use channel-specific context for memory
            const contextId = `mention_${message.channel.id}`;
            const history = getHistory(contextId);
            
            const systemPrompt = `You are BeeLert, a helpful AI assistant in a Discord server. A user mentioned you with a question. Answer helpfully and concisely (under 150 words). Be friendly and conversational.`;
            
            // Add user message to history
            addToHistory(contextId, 'user', `${message.author.username}: ${userQuestion}`);
            
            // Get AI response with conversation context
            const response = await aiService.askWithHistory(userQuestion, history, systemPrompt);
            
            // Add AI response to history
            addToHistory(contextId, 'assistant', response);
            
            // Split long responses
            if (response.length > 2000) {
                const chunks = response.match(/[\s\S]{1,2000}/g);
                for (const chunk of chunks) {
                    await message.reply(chunk);
                }
            } else {
                await message.reply(response);
            }
        } catch (error) {
            console.error('Error handling bot mention:', error);
            await message.reply('Sorry, I had trouble processing that. Please try again!');
        }
        return;
    }

    // !status command
    if (message.content === '!status') {
        const now = getISTTime();
        const nextUpdate = new Date(now);
        nextUpdate.setHours(21, 0, 0, 0);

        // If it's already past 9:00 PM, set for tomorrow
        if (now.getHours() >= 21) {
            nextUpdate.setDate(nextUpdate.getDate() + 1);
        }

        const timeDiff = nextUpdate - now;
        const hours = Math.floor(timeDiff / (1000 * 60 * 60));
        const minutes = Math.floor((timeDiff % (1000 * 60 * 60)) / (1000 * 60));

        // Format times directly since getISTTime() already returns IST
        const formatTime = (date) => {
            const h = date.getHours();
            const m = date.getMinutes().toString().padStart(2, '0');
            const s = date.getSeconds().toString().padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${h12}:${m}:${s} ${ampm}`;
        };
        const formatTimeShort = (date) => {
            const h = date.getHours();
            const m = date.getMinutes().toString().padStart(2, '0');
            const ampm = h >= 12 ? 'PM' : 'AM';
            const h12 = h % 12 || 12;
            return `${h12}:${m} ${ampm}`;
        };

        const statusMsg = `✅ **Bot Status**\n\n` +
            `**Current Time (IST):** ${formatTime(now)}\n` +
            `**Next Update:** ${formatTimeShort(nextUpdate)} IST\n` +
            `**Time Until Update:** ${hours}h ${minutes}m\n` +
            `**Channel:** <#${CHANNEL_ID}>\n` +
            `**Monitoring Role:** ${ROLE_NAME}`;

        await message.reply(statusMsg);
    }

    // !testupdate command (admin only)
    if (message.content === '!testupdate') {
        if (!message.member.permissions.has('Administrator')) {
            return message.reply('You need Administrator permission to use this command.');
        }

        await message.reply('Sending test update message...');
        await sendDailyUpdate();
    }
    
    // !checkbirthday command (manual trigger for testing)
    if (message.content === '!checkbirthday') {
        console.log('Manual birthday check triggered by', message.author.tag);
        const now = getISTTime();
        // getISTTime() already returns IST-adjusted time, use direct methods
        const day = now.getDate().toString().padStart(2, '0');
        const month = (now.getMonth() + 1).toString().padStart(2, '0');
        const today = `${day}/${month}`; // DD/MM format
        
        console.log(`Current IST Date: ${today}`);
        
        // Fetch birthdays from Supabase
        const allBirthdays = await getBirthdays();
        const todaysBirthdays = allBirthdays.filter(b => b.date === today);
        
        if (todaysBirthdays.length > 0) {
            await message.reply(`Found ${todaysBirthdays.length} birthday(s) today (${today}): ${todaysBirthdays.map(b => b.name).join(', ')}\nPosting wishes...`);
            
            const channel = await client.channels.fetch(CHANNEL_ID);
            
            for (const person of todaysBirthdays) {
                try {
                    const birthdayWish = await aiService.askQuestion(
                        `Generate a heartfelt birthday wish for ${person.name}. ` +
                        `Include a meaningful quote and warm wishes. ` +
                        `Make it personal, inspiring, and celebratory. ` +
                        `Keep it under 150 words. Format it beautifully. ` +
                        `Do NOT include any signature, closing, or "With love" at the end. ` +
                        `The message should end after the birthday wishes and quote.`
                    );
                    
                    const wishMessage = 
                        `🎉🎂 **HAPPY BIRTHDAY** <@${person.userId}>! 🎂🎉\n\n` +
                        `${birthdayWish}\n\n` +
                        `— With love from the Aura-7F fam 💙`;
                    
                    await channel.send(wishMessage);
                    console.log(`✅ Posted manual birthday wish for ${person.name}`);
                } catch (error) {
                    console.error(`Error posting manual birthday wish:`, error);
                }
            }
        } else {
            await message.reply(`No birthdays found for today (${today}). Available birthdays: ${allBirthdays.map(b => `${b.name} - ${b.date}`).join(', ')}`);
        }
    }
    
    // !deleteevents command (admin only) - Delete all bot-created events
    if (message.content === '!deleteevents') {
        if (!message.member.permissions.has('Administrator')) {
            await message.reply('❌ Only administrators can use this command.');
            return;
        }
        
        try {
            const guild = message.guild;
            const events = await guild.scheduledEvents.fetch();
            let deletedCount = 0;
            
            for (const [eventId, event] of events) {
                // Check if event was created by bot (has our description)
                if (event.description === 'Scheduled meeting with automated attendance tracking.' ||
                    event.entityType === GuildScheduledEventEntityType.Voice) {
                    try {
                        await event.delete();
                        deletedCount++;
                        console.log(`🗑️ Deleted event: ${event.name}`);
                    } catch (err) {
                        console.error(`Error deleting event ${event.name}:`, err.message);
                    }
                }
            }
            
            await message.reply(`✅ Deleted ${deletedCount} bot-created event(s).`);
        } catch (error) {
            console.error('Error deleting events:', error);
            await message.reply('❌ Error deleting events.');
        }
    }
    
    // !help command
    if (message.content === '!help') {
        const helpMessage = `🤖 **BeeLert Bot Commands**\n\n` +
            `📊 **General:**\n` +
            `\`!status\` - Check bot status and next update time\n` +
            `\`!help\` - Show this help message\n\n` +
            `📅 **Meeting Scheduler** (use buttons in <#${SCHEDULE_MEET_CHANNEL_ID}>):\n` +
            `• Click **📅 Schedule Meeting** button to create meetings\n` +
            `• Click **📋 View Meetings** to see upcoming meetings\n` +
            `• Only meeting creators can cancel their meetings\n` +
            `• Confirmations auto-delete 1 hour after meeting starts\n\n` +
            `🤖 **AI Chat:**\n` +
            `Go to <#${GEMINI_CHANNEL_ID}> and just type your question!\n` +
            `Messages auto-delete after 24 hours.\n\n` +
            `💡 **Daily Updates:** Automatic at 9:00 PM IST with fresh AI-generated motivation!\n` +
            `🎙️ **Meeting Tracking:** Automatic tracking in Lounge voice channel (10 min minimum)\n` +
            `📊 **Meeting Summaries:** Posted in <#${MEETING_SUMMARY_CHANNEL_ID}> after meetings end\n\n` +
            `🛠️ **Admin Commands:**\n` +
            `\`!deleteevents\` - Delete all bot-created Discord events`;
        
        await message.reply(helpMessage);
    }
});

// Voice channel meeting tracking
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
        const userId = newState.id;
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;
        
        // Check for active scheduled meetings first
        await handleScheduledMeetingTracking(userId, oldState, newState);
        
        // User joined a voice channel
        if (!oldChannel && newChannel) {
            await handleVoiceJoin(userId, newChannel);
        }
        // User left a voice channel
        else if (oldChannel && !newChannel) {
            await handleVoiceLeave(userId, oldChannel);
        }
        // User switched voice channels
        else if (oldChannel && newChannel && oldChannel.id !== newChannel.id) {
            await handleVoiceLeave(userId, oldChannel);
            await handleVoiceJoin(userId, newChannel);
        }
    } catch (error) {
        console.error('Error handling voice state update:', error);
    }
});

// Handle tracking for scheduled meetings
async function handleScheduledMeetingTracking(userId, oldState, newState) {
    const now = Date.now();
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) return; // Ignore bots
    
    const username = user.username;
    
    for (const [meetingId, meeting] of activeMeetings.entries()) {
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;
        const meetingChannelId = meeting.channelId;
        
        // User JOINED the monitored meeting channel
        if (newChannelId === meetingChannelId && oldChannelId !== meetingChannelId) {
            if (!meeting.participants.has(userId)) {
                meeting.participants.set(userId, {
                    username: username,
                    joinedAt: now,
                    leftAt: null,
                    totalSeconds: 0,
                    sessions: []
                });
            } else {
                // Re-joining after disconnect
                const participant = meeting.participants.get(userId);
                participant.joinedAt = now;
                participant.leftAt = null;
            }
            
            // If in continuous mode and someone joins, keep tracking
            if (meeting.trackingMode === 'continuous') {
                console.log(`➕ ${username} joined ${meeting.topic} (continuing tracking)`);
            } else {
                console.log(`➕ ${username} joined ${meeting.topic} (scheduled meeting)`);
            }
        }
        
        // User LEFT the monitored meeting channel
        if (oldChannelId === meetingChannelId && newChannelId !== meetingChannelId) {
            const participant = meeting.participants.get(userId);
            if (participant && !participant.leftAt) {
                const sessionDuration = Math.floor((now - participant.joinedAt) / 1000);
                participant.totalSeconds += sessionDuration;
                participant.leftAt = now;
                participant.sessions.push({
                    joinedAt: participant.joinedAt,
                    leftAt: now,
                    duration: sessionDuration
                });
                
                const minutes = Math.floor(sessionDuration / 60);
                console.log(`➖ ${username} left ${meeting.topic} (session: ${minutes}m ${sessionDuration % 60}s)`);
            }
        }
    }
}

async function handleVoiceJoin(userId, channel) {
    const channelId = channel.id;
    const now = Date.now();
    
    // Fetch user info first
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) return; // Ignore bots
    const username = user.username;
    
    // ===== VOICE POINTS TRACKING (ALL CHANNELS) =====
    if (!voicePointsTracking.has(userId)) {
        voicePointsTracking.set(userId, {
            joinedAt: now,
            channelId: channelId,
            channelName: channel.name,
            username: username,
            lastPointsAwarded: now
        });
        console.log(`🎯 Started tracking points for ${username} in ${channel.name}`);
    }
    
    // ===== LOUNGE MEETING TRACKING (ORIGINAL) =====
    // Only track the lounge voice channel for meeting summaries
    if (channelId !== LOUNGE_VOICE_CHANNEL_ID) return;
    
    if (!voiceMeetings.has(channelId)) {
        // Start new meeting session
        voiceMeetings.set(channelId, {
            startTime: now,
            channelName: channel.name,
            participants: new Map(),
            lastActivity: now
        });
        console.log(`📊 Lounge meeting started: ${channel.name}`);
    }
    
    const meeting = voiceMeetings.get(channelId);
    
    if (!meeting.participants.has(userId)) {
        meeting.participants.set(userId, {
            username: username,
            joinedAt: now,
            leftAt: null,
            totalSeconds: 0,
            sessions: []
        });
    } else {
        // Re-joining after disconnect
        const participant = meeting.participants.get(userId);
        participant.joinedAt = now;
        participant.leftAt = null;
    }
    
    meeting.lastActivity = now;
    console.log(`👤 ${username} joined ${channel.name}`);
}

async function handleVoiceLeave(userId, channel) {
    const channelId = channel.id;
    const now = Date.now();
    
    // Fetch user info
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user || user.bot) return; // Ignore bots
    
    // ===== VOICE POINTS TRACKING (ALL CHANNELS) =====
    if (voicePointsTracking.has(userId)) {
        const tracking = voicePointsTracking.get(userId);
        const totalTimeMs = now - tracking.joinedAt;
        const totalMinutes = Math.floor(totalTimeMs / (1000 * 60));
        const pointsEarned = Math.floor(totalMinutes / 5); // 1 point per 5 minutes
        
        if (pointsEarned > 0) {
            try {
                // Add points to database
                await supabaseService.addVoicePoints(userId, tracking.username, pointsEarned, totalMinutes);
                // Log the session
                await supabaseService.logVoiceSession(userId, tracking.username, tracking.channelId, tracking.channelName, totalMinutes, pointsEarned);
                console.log(`🎯 ${tracking.username} earned ${pointsEarned} points for ${totalMinutes} minutes in ${tracking.channelName}`);
            } catch (error) {
                console.error('Error saving voice points:', error);
            }
        } else {
            console.log(`🎯 ${tracking.username} left after ${totalMinutes} minutes (no points - less than 5 min)`);
        }
        
        voicePointsTracking.delete(userId);
    }
    
    // ===== LOUNGE MEETING TRACKING (ORIGINAL) =====
    // Only track the lounge voice channel for meeting summaries
    if (channelId !== LOUNGE_VOICE_CHANNEL_ID) return;
    
    if (!voiceMeetings.has(channelId)) return;
    
    const meeting = voiceMeetings.get(channelId);
    const participant = meeting.participants.get(userId);
    
    if (participant && !participant.leftAt) {
        // Calculate session time
        const sessionDuration = Math.floor((now - participant.joinedAt) / 1000);
        participant.totalSeconds += sessionDuration;
        participant.leftAt = now;
        participant.sessions.push({
            joinedAt: participant.joinedAt,
            leftAt: now,
            duration: sessionDuration
        });
        
        meeting.lastActivity = now;
        
        const minutes = Math.floor(sessionDuration / 60);
        console.log(`👤 ${participant.username} left ${channel.name} (session: ${minutes}m ${sessionDuration % 60}s)`);
        
        // Check if channel is now empty
        const currentMembers = channel.members.filter(m => !m.user.bot);
        if (currentMembers.size === 0) {
            await endMeeting(channelId, channel);
        }
    }
}

async function endMeeting(channelId, channel) {
    const meeting = voiceMeetings.get(channelId);
    if (!meeting) return;
    
    const now = Date.now();
    const meetingDuration = now - meeting.startTime;
    
    // Check minimum duration (10 minutes)
    if (meetingDuration < MINIMUM_MEETING_DURATION) {
        console.log(`⏱️ Meeting in ${channel.name} too short (${Math.round(meetingDuration / 1000 / 60)} min), skipping summary`);
        voiceMeetings.delete(channelId);
        return;
    }
    
    // If no participants recorded, skip
    if (meeting.participants.size === 0) {
        voiceMeetings.delete(channelId);
        return;
    }
    
    await generateMeetingSummary(meeting, meetingDuration, channel, meeting.participants);
    voiceMeetings.delete(channelId);
}

async function generateMeetingSummary(meeting, totalDuration, channel, participants) {
    try {
        const summaryChannel = await client.channels.fetch(MEETING_SUMMARY_CHANNEL_ID);
        const actualEndTime = Date.now();
        const meetingDuration = actualEndTime - meeting.startTime;
        
        const totalMinutes = Math.floor(meetingDuration / (1000 * 60));
        const totalHours = Math.floor(totalMinutes / 60);
        const remainingMinutes = totalMinutes % 60;
        
        // Calculate final times for all participants
        const finalAttendance = [];
        meeting.participants.forEach((participant, userId) => {
            let totalSeconds = participant.totalSeconds;
            
            // Add current session if still tracking (shouldn't happen but safety check)
            if (!participant.leftAt && participant.joinedAt) {
                totalSeconds += Math.floor((actualEndTime - participant.joinedAt) / 1000);
            }
            
            if (totalSeconds > 0) {
                finalAttendance.push({
                    username: participant.username,
                    seconds: totalSeconds,
                    joinedAt: participant.sessions[0]?.joinedAt || participant.joinedAt
                });
            }
        });
        
        // Filter out users with less than 10 minutes
        const qualifiedAttendance = finalAttendance.filter(p => p.seconds >= 10 * 60);
        
        if (qualifiedAttendance.length === 0) {
            console.log('No qualified participants for Lounge meeting summary');
            return;
        }
        
        qualifiedAttendance.sort((a, b) => b.seconds - a.seconds);
        
        const totalMeetingSeconds = meetingDuration / 1000;
        
        let summary = `📊 **Meeting Summary - Lounge**\n\n`;
        summary += `📅 ${new Date(meeting.startTime).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}\n`;
        summary += `🕐 ${new Date(meeting.startTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} - ${new Date(actualEndTime).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST (${totalHours}h ${remainingMinutes}m)\n\n`;
        summary += `👥 **Attendance:**\n\n`;
        
        qualifiedAttendance.forEach(p => {
            const mins = Math.floor(p.seconds / 60);
            const secs = p.seconds % 60;
            const percentage = Math.round((p.seconds / totalMeetingSeconds) * 100);
            const badge = percentage >= 95 ? ' ⭐' : '';
            summary += `• **${p.username}** - ${mins}m ${secs}s (${percentage}%)${badge}\n`;
        });
        
        const avgSeconds = qualifiedAttendance.reduce((sum, p) => sum + p.seconds, 0) / qualifiedAttendance.length;
        const avgMins = Math.floor(avgSeconds / 60);
        const fullAttendance = qualifiedAttendance.filter(p => p.seconds >= totalMeetingSeconds * 0.95).length;
        
        summary += `\n📈 **Statistics:**\n`;
        summary += `• Total participants: ${qualifiedAttendance.length}\n`;
        summary += `• Average attendance: ${avgMins}m per member\n`;
        summary += `• Full attendance (95%+): ${fullAttendance} members\n`;
        
        await summaryChannel.send(summary);
        console.log(`📊 Lounge meeting summary posted`);
    } catch (error) {
        console.error('Error generating Lounge meeting summary:', error);
    }
}

// Bot ready event - recover scheduled meetings from Discord events
client.once(Events.ClientReady, async () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    
    try {
        // Fetch all guilds
        for (const [guildId, guild] of client.guilds.cache) {
            console.log(`🔍 Checking scheduled events in guild: ${guild.name}`);
            
            // Fetch all scheduled events
            const events = await guild.scheduledEvents.fetch();
            
            for (const [eventId, event] of events) {
                const now = Date.now();
                const startTime = event.scheduledStartTime?.getTime();
                const endTime = event.scheduledEndTime?.getTime();
                
                // Check if event was created by bot
                const isBotEvent = event.description === 'Scheduled meeting with automated attendance tracking.' ||
                                   (event.entityType === GuildScheduledEventEntityType.Voice && event.creatorId === client.user.id);
                
                // Delete all past bot-created events regardless of status
                if (isBotEvent && endTime && endTime < now) {
                    console.log(`🧹 Deleting past bot event: ${event.name} (ended ${Math.round((now - endTime) / 60000)} min ago)`);
                    try {
                        await event.delete();
                        console.log(`✅ Deleted past event: ${event.name}`);
                    } catch (err) {
                        console.error(`Error deleting event ${event.name}:`, err.message);
                    }
                    continue;
                }
                
                // Clean up old COMPLETED or CANCELED events (status 3 or 4)
                if (event.entityType === GuildScheduledEventEntityType.Voice && 
                    (event.status === 3 || event.status === 4)) {
                    console.log(`🧹 Cleaning up old ${event.status === 3 ? 'COMPLETED' : 'CANCELED'} event: ${event.name}`);
                    try {
                        await event.delete();
                        console.log(`✅ Deleted old event: ${event.name}`);
                    } catch (err) {
                        console.error(`Error deleting event ${event.name}:`, err.message);
                    }
                    continue;
                }
                
                // Clean up stale ACTIVE events that should have ended
                if (event.entityType === GuildScheduledEventEntityType.Voice && 
                    event.status === 2 && endTime && endTime < now) {
                    console.log(`🧹 Cleaning up stale ACTIVE event: ${event.name} (ended ${Math.round((now - endTime) / 60000)} min ago)`);
                    try {
                        await event.setStatus(3); // Mark as COMPLETED
                        await event.delete();
                        console.log(`✅ Cleaned up stale event: ${event.name}`);
                    } catch (err) {
                        console.error(`Error cleaning up event ${event.name}:`, err.message);
                    }
                    continue;
                }
                
                // Clean up SCHEDULED events that are past their end time
                if (event.entityType === GuildScheduledEventEntityType.Voice && 
                    event.status === 1 && endTime && endTime < now) {
                    console.log(`🧹 Cleaning up expired SCHEDULED event: ${event.name} (ended ${Math.round((now - endTime) / 60000)} min ago)`);
                    try {
                        await event.delete();
                        console.log(`✅ Deleted expired event: ${event.name}`);
                    } catch (err) {
                        console.error(`Error deleting event ${event.name}:`, err.message);
                    }
                    continue;
                }
                
                // Only process SCHEDULED or ACTIVE voice events
                if (event.entityType === GuildScheduledEventEntityType.Voice && 
                    (event.status === 1 || event.status === 2)) { // 1=SCHEDULED, 2=ACTIVE
                    
                    // Only restore if meeting hasn't ended yet
                    if (endTime > now) {
                        const meetingId = `meeting_${eventId}`;
                        
                        // Check if meeting should be active now
                        if (startTime <= now && endTime > now && event.status === 2) {
                            console.log(`🔄 Restoring ACTIVE meeting: ${event.name}`);
                            
                            // Start tracking immediately
                            const channel = await client.channels.fetch(event.channelId);
                            if (channel) {
                                // Add to scheduled meetings first
                                scheduledMeetings.set(meetingId, {
                                    startTime: startTime,
                                    endTime: endTime,
                                    topic: event.name,
                                    channelId: event.channelId,
                                    channelName: channel.name,
                                    creatorId: null,
                                    confirmationMsg: null,
                                    status: 'active',
                                    eventId: eventId
                                });
                                
                                // Start tracking
                                await startAutomatedTracking(scheduledMeetings.get(meetingId), meetingId);
                                console.log(`✅ Resumed tracking: ${event.name}`);
                            }
                        } else if (startTime > now) {
                            // Future meeting - restore to scheduled meetings
                            console.log(`📅 Restoring scheduled meeting: ${event.name}`);
                            
                            const channel = await client.channels.fetch(event.channelId);
                            scheduledMeetings.set(meetingId, {
                                startTime: startTime,
                                endTime: endTime,
                                topic: event.name,
                                channelId: event.channelId,
                                channelName: channel ? channel.name : 'Unknown',
                                creatorId: null,
                                confirmationMsg: null,
                                status: 'scheduled',
                                eventId: eventId
                            });
                            
                            console.log(`✅ Restored: ${event.name} (starts at ${new Date(startTime).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })})`);
                        }
                    }
                }
            }
        }
        
        console.log(`✅ Event recovery complete. ${scheduledMeetings.size} meetings restored.`);
        
    } catch (error) {
        console.error('❌ Error recovering scheduled events:', error);
    }
});

// Error Handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
    botStatus.isOnline = false;
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
console.log('🔐 Attempting to login to Discord...');
if (!BOT_TOKEN) {
    console.error('❌ BOT_TOKEN is not set in environment variables!');
    process.exit(1);
}

client.login(BOT_TOKEN)
    .then(() => {
        console.log('✅ Discord login successful');
    })
    .catch(error => {
        console.error('❌ Failed to login to Discord:', error);
        console.error('Token present:', BOT_TOKEN ? 'Yes (length: ' + BOT_TOKEN.length + ')' : 'No');
        process.exit(1);
    });
