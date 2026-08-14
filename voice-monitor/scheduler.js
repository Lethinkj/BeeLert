const cron = require('node-cron');
const { EmbedBuilder } = require('discord.js');
const config = require('./config');
const db = require('./db');
const tracker = require('./tracker');

let cronJob = null;

/**
 * Format duration seconds into human readable "Xh Ym" or "Ym"
 */
function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
        return mins > 0 ? `${hrs}h ${mins}m` : `${hrs}h`;
    }
    return `${mins}m`;
}

/**
 * Get IST Date string (YYYY-MM-DD) and Display Date (DD Month YYYY)
 */
function getISTDateInfo() {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { timeZone: config.TIMEZONE });
    const d = new Date(dateStr);
    
    // YYYY-MM-DD
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const isoDate = `${year}-${month}-${day}`;

    // Display Date (e.g. 14 August 2026)
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const displayDate = `${d.getDate()} ${monthNames[d.getMonth()]} ${d.getFullYear()}`;

    return { isoDate, displayDate };
}

/**
 * Generate and Post Daily 11 PM Voice Activity Report
 */
async function generateAndSendDailyReport(client) {
    console.log('⏰ [Voice Monitor Scheduler] Running 11 PM Daily Voice Activity Report...');
    try {
        const { isoDate, displayDate } = getISTDateInfo();

        // 1. Check if report was already sent today
        const alreadySent = await db.hasReportBeenSent(isoDate);
        if (alreadySent) {
            console.log(`ℹ️ [Voice Monitor Scheduler] Report for ${isoDate} already sent. Skipping duplicate.`);
            return false;
        }

        // 2. Fetch completed sessions for today
        const dbSessions = await db.getSessionsForDate(isoDate);

        // 3. Combine with currently active connected sessions up to now
        const activeMap = tracker.getActiveSessions();
        const now = Date.now();
        const combinedSessions = [...dbSessions];

        activeMap.forEach((active, userId) => {
            const activeDurationSec = Math.max(0, Math.floor((now - active.joinTime) / 1000));
            combinedSessions.push({
                sessionId: active.sessionId,
                discordUserId: userId,
                username: active.username,
                guildId: active.guildId,
                voiceChannelId: active.voiceChannelId,
                joinTime: active.joinTime,
                leaveTime: null,
                durationSeconds: activeDurationSec,
                sessionDate: isoDate
            });
        });

        // 4. Group sessions by member
        const userStats = new Map(); // userId -> { username, totalSeconds, sessionCount }

        combinedSessions.forEach(s => {
            const uid = s.discordUserId;
            if (!userStats.has(uid)) {
                userStats.set(uid, {
                    username: s.username || `user_${uid}`,
                    totalSeconds: 0,
                    sessionCount: 0
                });
            }
            const stat = userStats.get(uid);
            stat.totalSeconds += (s.durationSeconds || 0);
            stat.sessionCount += 1;
        });

        // 5. Convert to array and sort descending by total voice duration
        const memberList = Array.from(userStats.values())
            .filter(m => m.totalSeconds > 0)
            .sort((a, b) => b.totalSeconds - a.totalSeconds);

        const activeMembersCount = memberList.length;
        const totalVoiceSeconds = memberList.reduce((acc, m) => acc + m.totalSeconds, 0);
        const totalSessionsCount = combinedSessions.length;

        // 6. Build Discord Embed Report
        const medals = ['🥇', '🥈', '🥉'];
        let leaderboardText = '';

        if (memberList.length === 0) {
            leaderboardText = ' *No voice activity recorded today.*';
        } else {
            leaderboardText = memberList.map((m, idx) => {
                const icon = medals[idx] || `**#${idx + 1}**`;
                const formattedTime = formatDuration(m.totalSeconds);
                return `${icon} **${m.username}** — ${formattedTime}`;
            }).join('\n');
        }

        const vcMention = `<#${config.MONITORED_VC_ID}>`;

        const embed = new EmbedBuilder()
            .setTitle('📊 DAILY VOICE ACTIVITY')
            .setDescription(`📅 **${displayDate}**\n\n🎙️ **Voice Channel Activity**\n\n${leaderboardText}\n\n━━━━━━━━━━━━━━━━━━\n\n👥 **Active Members:** ${activeMembersCount}\n⏱️ **Total Voice Time:** ${formatDuration(totalVoiceSeconds)}\n🎙️ **Total Sessions:** ${totalSessionsCount}\n\n━━━━━━━━━━━━━━━━━━`)
            .setColor(0x00f2fe)
            .addFields(
                { name: 'Channel', value: vcMention, inline: true },
                { name: 'Report Time', value: '11:00 PM IST', inline: true }
            )
            .setTimestamp();

        // 7. Validate Destination & Send Report ONLY to Clan Server Report Channel
        const clanServerId = config.CLAN_SERVER_ID;
        const reportChannelId = config.REPORT_CHANNEL_ID;

        const channel = await client.channels.fetch(reportChannelId).catch(() => null);
        if (!channel) {
            console.error(`❌ [Voice Monitor Scheduler] Could not fetch report channel ${reportChannelId}`);
            return false;
        }

        // STRICT DESTINATION VALIDATION: Must be Clan Server 1350324319942868992
        if (channel.guild && channel.guild.id !== clanServerId) {
            console.error(`❌ [Voice Monitor Scheduler] Security Alert: Report channel ${reportChannelId} is not in Clan Server ${clanServerId}`);
            return false;
        }

        await channel.send({ embeds: [embed] });
        console.log(`✅ [Voice Monitor Scheduler] Daily report for ${isoDate} posted to Clan Server channel ${reportChannelId}`);

        // 8. Mark report sent in database
        await db.markReportSent(isoDate, {
            activeMembersCount,
            totalSeconds: totalVoiceSeconds
        });

        return true;
    } catch (err) {
        console.error('❌ [Voice Monitor Scheduler] Error generating daily report:', err);
        return false;
    }
}

/**
 * Start cron scheduler for 11:00 PM IST
 */
function startScheduler(client) {
    if (cronJob) cronJob.stop();

    console.log(`⏰ [Voice Monitor Scheduler] Registering 11 PM cron schedule "${config.CRON_SCHEDULE}" (${config.TIMEZONE})...`);
    cronJob = cron.schedule(config.CRON_SCHEDULE, async () => {
        await generateAndSendDailyReport(client);
    }, {
        scheduled: true,
        timezone: config.TIMEZONE
    });
}

module.exports = {
    startScheduler,
    generateAndSendDailyReport
};
