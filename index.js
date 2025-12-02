const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Partials, MessageFlags, GuildScheduledEventEntityType, GuildScheduledEventPrivacyLevel } = require('discord.js');
const cron = require('node-cron');
const express = require('express');
require('dotenv').config();

// Import AI service
const aiService = require('./services/aiService');

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
    ],
    partials: [Partials.Channel]
});

// Configuration from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GEMINI_CHANNEL_ID = process.env.GEMINI_CHANNEL_ID;
const STUDY_CHANNEL_ID = process.env.STUDY_CHANNEL_ID;
const LOUNGE_VOICE_CHANNEL_ID = process.env.LOUNGE_VOICE_CHANNEL_ID || '1350324320672546826';
const AURA_VOICE_CHANNEL_ID = process.env.AURA_VOICE_CHANNEL_ID || '1350324320672546827';
const MEETING_ROOM1_CHANNEL_ID = process.env.MEETING_ROOM1_CHANNEL_ID || '1350324320672546828';
const MEETING_ROOM2_CHANNEL_ID = process.env.MEETING_ROOM2_CHANNEL_ID || '1367146219633119354';
const MEETING_SUMMARY_CHANNEL_ID = process.env.MEETING_SUMMARY_CHANNEL_ID || '1442861248285773924';
const SCHEDULE_MEET_CHANNEL_ID = process.env.SCHEDULE_MEET_CHANNEL_ID || '1443135153185493033';
const ROLE_NAME = process.env.ROLE_NAME || 'Basher';
const CLAN_ROLE_ID = process.env.CLAN_ROLE_ID || '1350325011826868305';
const UPDATES_CHANNEL_ID = process.env.UPDATES_CHANNEL_ID || MEETING_SUMMARY_CHANNEL_ID;

// Available voice channels for scheduled meetings
const VOICE_CHANNELS = [
    { id: LOUNGE_VOICE_CHANNEL_ID, name: 'Lounge' },
    { id: AURA_VOICE_CHANNEL_ID, name: 'Aura-7f Space' },
    { id: MEETING_ROOM1_CHANNEL_ID, name: 'Meeting Room 1' },
    { id: MEETING_ROOM2_CHANNEL_ID, name: 'Meeting Room 2' }
];

// Clan member IDs
const CLAN_MEMBERS = [
    '1259881373309861888', // Alisha
    '1309201554787664026', // Anitus
    '1181238306671968256', // Archana
    '1337604789378482228', // Arthi
    '1097767757434597398', // Bennyhinn
    '1344618947185606707', // Beule
    '1187606759351799970', // Jijo
    '1308385757576036412', // Lifnan
    '1173582369484177470', // Ashif
    '1344619303688998934', // Shailu
    '1171801933158285354', // Shaniya
    '1174295899745296438', // Lethin
];

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

// Scheduled meetings tracking
const scheduledMeetings = new Map(); // meetingId -> { time, topic, channelId, timeoutId, creatorId, confirmationMsg, startTime, endTime, date, status }
const activeMeetings = new Map(); // meetingId -> { actualStartTime, participants: Map(userId -> {username, joinedAt, leftAt, totalSeconds}), scheduledSummaryPosted: false, waitingForEmpty: false }

// Personal reminder tracking (Note: Data is lost on restart due to Render's ephemeral filesystem)
const userReminders = new Map(); // userId -> { time: '20:00', customMessage: null, active: true }
const conversationStates = new Map(); // userId -> { step: 'awaiting_time' | 'awaiting_message', time: string }
const userHasChatted = new Set(); // Track users who have already chatted (for first-time AI context)

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

// Helper function to get current IST time
function getISTTime() {
    const now = new Date();
    const istTime = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
    return istTime;
}

// Helper function to format IST time
function formatISTTime(date) {
    return date.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }) + ' IST';
}

// Function to post Meeting Manager interface
async function postMeetingManager(channel) {
    const row = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('schedule_meeting')
                .setLabel('📅 Schedule Meeting')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('view_meetings')
                .setLabel('📋 View Meetings')
                .setStyle(ButtonStyle.Secondary),
        );

    await channel.send({
        content: '📅 **MEETING MANAGER**\n\n' +
                 'Manage your team meetings easily!\n\n' +
                 '• Click **Schedule Meeting** to create a new meeting\n' +
                 '• Click **View Meetings** to see upcoming meetings\n' +
                 '• Only meeting creators can cancel their meetings',
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
        
        // Delete Discord scheduled event
        if (scheduledMeeting.eventId) {
            try {
                const guild = client.guilds.cache.first(); // Get first guild
                const event = await guild.scheduledEvents.fetch(scheduledMeeting.eventId);
                if (event) {
                    await event.delete();
                    console.log(`🗑️ Deleted Discord event: ${meeting.topic}`);
                }
            } catch (err) {
                console.error('Error deleting Discord event:', err);
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
// Helper function to format date for daily update
function formatISTDate(date) {
    return date.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
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
    
    // Schedule personal reminder checker (runs every minute)
    cron.schedule('* * * * *', async () => {
        const now = getISTTime();
        const currentTime = `${now.getHours()}:${now.getMinutes().toString().padStart(2, '0')}`;
        
        for (const [userId, settings] of userReminders.entries()) {
            if (!settings.active) continue;
            if (settings.time !== currentTime) continue;
            
            try {
                const user = await client.users.fetch(userId);
                const defaultMessage = 
                    "⏰ **Daily Progress Reminder!**\n\n" +
                    "Time to post your daily progress! 📝\n\n" +
                    `Head to the server and share what you learned today.\n\n` +
                    "Keep the momentum going! 🚀";
                
                await user.send(settings.customMessage || defaultMessage);
                console.log(`✅ Sent reminder to ${user.username} at ${currentTime}`);
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

// Handle button and modal interactions
client.on(Events.InteractionCreate, async (interaction) => {
    try {
        // Handle button clicks
        if (interaction.isButton()) {
            
            // Schedule Meeting button
            if (interaction.customId === 'schedule_meeting') {
                const channelList = VOICE_CHANNELS.map((ch, idx) => `${idx + 1}. ${ch.name}`).join('\n');
                
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
                    "• Type `!reminder` to start setup\n" +
                    "• I'll guide you through choosing your time\n" +
                    "• Optionally set a custom message\n\n" +
                    "**Manage Your Reminder:**\n" +
                    "• `!status` - View your current settings\n" +
                    "• `!pause` - Temporarily pause reminders\n" +
                    "• `!resume` - Resume paused reminders\n" +
                    "• `!change time` - Update reminder time\n" +
                    "• `!change message` - Update custom message\n" +
                    "• `!stop` - Delete your reminder completely\n\n" +
                    "**During Setup:**\n" +
                    "• `cancel` - Cancel current setup\n\n" +
                    "**Chat with AI:**\n" +
                    "• Just send any message and I'll respond!\n" +
                    "• Ask questions, get motivation, or chat casually\n\n" +
                    "⚠️ Note: Reminders reset on bot restart (hosting limitation)"
                );
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
            if (!state && !['!help', '!status', '!pause', '!resume', '!change time', '!change message', '!stop', '!reminder'].includes(content)) {
                try {
                    await message.channel.sendTyping();
                    
                    // Check if this is first time user is chatting
                    const isFirstChat = !userHasChatted.has(userId);
                    if (isFirstChat) {
                        userHasChatted.add(userId); // Mark as chatted
                    }
                    
                    const contextPrompt = isFirstChat 
                        ? `You are BeeLert, a friendly Discord productivity bot. This is the user's FIRST chat with you.\n\n` +
                          `IMPORTANT: Mention once that they can type !reminder to set up daily reminders (you'll ask for time like "9:00 PM", then optional custom message).\n\n` +
                          `FEATURES: Daily reminders, Meeting scheduling, AI chat, Voice tracking\n` +
                          `COMMANDS: !reminder, !help, !status, !pause, !resume, !stop\n\n` +
                          `USER SAYS: "${message.content}"\n\n` +
                          `Respond naturally, mention the !reminder feature briefly, keep under 100 words.`
                        : `You are BeeLert, a friendly Discord productivity bot assistant.\n\n` +
                          `USER SAYS: "${message.content}"\n\n` +
                          `Respond naturally and helpfully. Don't repeat reminder setup instructions unless they specifically ask about reminders. ` +
                          `Be conversational, friendly, and concise (under 80 words).`;
                    
                    const aiResponse = await aiService.askQuestion(contextPrompt);
                    
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
                
                // Save reminder settings
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
                
                console.log(`✅ Reminder created for ${message.author.username} at ${state.time}`);
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
                userReminders.delete(userId);
                await message.reply("❌ Daily reminder deleted. Type `reminder` anytime to set up again.");
                console.log(`🗑️ Reminder deleted for ${message.author.username}`);
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
    // Gemini AI Chat in dedicated channel
    if (message.channel.id === GEMINI_CHANNEL_ID && !message.content.startsWith('!')) {
        try {
            await message.channel.sendTyping();
            const response = await askGemini(message.content);
            
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

        const statusMsg = `✅ **Bot Status**\n\n` +
            `**Current Time (IST):** ${now.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}\n` +
            `**Next Update:** ${nextUpdate.toLocaleString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })} IST\n` +
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
            `📊 **Meeting Summaries:** Posted in <#${MEETING_SUMMARY_CHANNEL_ID}> after meetings end`;
        
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
    
    // Only track the lounge voice channel
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
    
    // Fetch username
    const user = await client.users.fetch(userId).catch(() => null);
    const username = user ? user.username : `User ${userId}`;
    
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
    
    // Only track the lounge voice channel
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
                // Only process SCHEDULED or ACTIVE voice events
                if (event.entityType === GuildScheduledEventEntityType.Voice && 
                    (event.status === 1 || event.status === 2)) { // 1=SCHEDULED, 2=ACTIVE
                    
                    const now = Date.now();
                    const startTime = event.scheduledStartTime.getTime();
                    const endTime = event.scheduledEndTime.getTime();
                    
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

// Error handling
client.on(Events.Error, error => {
    console.error('Discord client error:', error);
    botStatus.isOnline = false;
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(BOT_TOKEN).catch(error => {
    console.error('Failed to login:', error);
    process.exit(1);
});
