const config = require('./config');
const db = require('./db');

// In-memory active session map: discordUserId -> { sessionId, discordUserId, username, guildId, voiceChannelId, joinTime, sessionDate }
const activeSessions = new Map();

/**
 * Get IST Date YYYY-MM-DD
 */
function getTodayISTDate() {
    const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: config.TIMEZONE }));
    return nowIST.toISOString().split('T')[0];
}

/**
 * Silent Voice State Event Handler
 * Monitors ONLY VC ID 1497644357870682324
 */
async function handleVoiceStateUpdate(oldState, newState) {
    try {
        const userId = newState.id || oldState.id;
        const oldChannelId = oldState.channelId;
        const newChannelId = newState.channelId;
        const monitoredVcId = config.MONITORED_VC_ID;

        const isOldMonitored = oldChannelId === monitoredVcId;
        const isNewMonitored = newChannelId === monitoredVcId;

        // User JOINED monitored VC
        if (!isOldMonitored && isNewMonitored) {
            await handleMemberJoin(userId, newState);
        }
        // User LEFT monitored VC
        else if (isOldMonitored && !isNewMonitored) {
            await handleMemberLeave(userId, oldState);
        }
    } catch (err) {
        console.error('❌ [Voice Monitor Tracker] Error in handleVoiceStateUpdate:', err.message);
    }
}

/**
 * Member Join Monitored VC
 */
async function handleMemberJoin(userId, state) {
    const member = state.member;
    const username = member ? (member.user ? member.user.username : member.displayName) : `user_${userId}`;
    const guildId = state.guild ? state.guild.id : config.MAIN_SERVER_ID;
    const now = Date.now();
    const todayDate = getTodayISTDate();

    const sessionId = `vsession_${userId}_${now}`;
    activeSessions.set(userId, {
        sessionId,
        discordUserId: userId,
        username,
        guildId,
        voiceChannelId: config.MONITORED_VC_ID,
        joinTime: now,
        sessionDate: todayDate
    });

    console.log(`🎙️ [Voice Monitor] Member ${username} (${userId}) joined monitored VC ${config.MONITORED_VC_ID} (Silent)`);
}

/**
 * Member Leave Monitored VC
 */
async function handleMemberLeave(userId, state) {
    const active = activeSessions.get(userId);
    const now = Date.now();
    const todayDate = getTodayISTDate();

    let joinTime = now;
    let username = `user_${userId}`;
    let sessionId = `vsession_${userId}_${now}`;

    if (active) {
        joinTime = active.joinTime;
        username = active.username;
        sessionId = active.sessionId;
        activeSessions.delete(userId);
    } else {
        const member = state.member;
        if (member) username = member.user ? member.user.username : member.displayName;
    }

    const durationSeconds = Math.max(0, Math.floor((now - joinTime) / 1000));
    const sessionData = {
        sessionId,
        discordUserId: userId,
        username,
        guildId: state.guild ? state.guild.id : config.MAIN_SERVER_ID,
        voiceChannelId: config.MONITORED_VC_ID,
        joinTime,
        leaveTime: now,
        durationSeconds,
        sessionDate: active ? active.sessionDate : todayDate
    };

    await db.saveVoiceSession(sessionData);
    console.log(`🎙️ [Voice Monitor] Member ${username} (${userId}) left VC. Duration: ${durationSeconds}s (${Math.floor(durationSeconds/60)}m) (Saved to DB)`);
}

/**
 * Bot Startup Recovery: Detect members currently connected to monitored VC
 */
async function initStartupRecovery(client) {
    try {
        console.log(`🔍 [Voice Monitor] Checking startup recovery for VC ${config.MONITORED_VC_ID}...`);
        const channel = await client.channels.fetch(config.MONITORED_VC_ID).catch(() => null);
        if (!channel || !channel.isVoiceBased()) {
            console.warn(`⚠️ [Voice Monitor] Could not fetch VC ${config.MONITORED_VC_ID}`);
            return;
        }

        const members = channel.members;
        const now = Date.now();
        const todayDate = getTodayISTDate();

        members.forEach(member => {
            if (member.user && member.user.bot) return; // Ignore bots
            const userId = member.id;
            if (!activeSessions.has(userId)) {
                const username = member.user ? member.user.username : member.displayName;
                const sessionId = `vsession_${userId}_${now}`;
                activeSessions.set(userId, {
                    sessionId,
                    discordUserId: userId,
                    username,
                    guildId: channel.guild.id,
                    voiceChannelId: config.MONITORED_VC_ID,
                    joinTime: now,
                    sessionDate: todayDate
                });
                console.log(`🎙️ [Voice Monitor Recovery] Recovered active VC session for ${username} (${userId})`);
            }
        });
    } catch (err) {
        console.error('❌ [Voice Monitor Recovery] Error:', err.message);
    }
}

/**
 * Get map of currently active connected sessions
 */
function getActiveSessions() {
    return activeSessions;
}

module.exports = {
    handleVoiceStateUpdate,
    initStartupRecovery,
    getActiveSessions
};
