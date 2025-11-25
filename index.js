const { Client, GatewayIntentBits, Events } = require('discord.js');
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
    ]
});

// Configuration from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GEMINI_CHANNEL_ID = process.env.GEMINI_CHANNEL_ID;
const STUDY_CHANNEL_ID = process.env.STUDY_CHANNEL_ID;
const LOUNGE_VOICE_CHANNEL_ID = process.env.LOUNGE_VOICE_CHANNEL_ID || '1350324320672546826';
const MEETING_SUMMARY_CHANNEL_ID = process.env.MEETING_SUMMARY_CHANNEL_ID || '1442861248285773924';
const ROLE_NAME = process.env.ROLE_NAME || 'Basher';

// Bot status tracking
let botStatus = {
    isOnline: false,
    connectedAt: null,
    lastMessageSent: null,
    totalMessagesSent: 0
};

// Study session tracking
const studySessions = new Map(); // userId -> { startTime, duration, channelId }

// Voice channel meeting tracking
const voiceMeetings = new Map(); // channelId -> { startTime, participants: Map(userId -> joinTime), lastActivity }
const MINIMUM_MEETING_DURATION = 10 * 60 * 1000; // 10 minutes in milliseconds

// Motivational quotes about consistent learning and progress
const motivationalQuotes = [
    "Success is the sum of small efforts repeated day in and day out. Keep learning, keep growing! 📚",
    "Consistency is the key to mastery. Every day you learn is a day you grow stronger! 💪",
    "Small daily improvements are the key to long-term results. Keep pushing forward! 🚀",
    "The secret of getting ahead is getting started. Your daily progress matters! ✨",
    "Learning is a journey, not a destination. Celebrate your daily progress! 🎯",
    "Consistency beats talent when talent doesn't work hard. Keep showing up every day! 🔥",
    "Every expert was once a beginner who refused to give up. Your consistency will pay off! 🌟",
    "The only way to do great work is to keep learning. Stay consistent, stay curious! 🧠",
    "Progress, not perfection. Your daily efforts compound into greatness! 💎",
    "Discipline is choosing between what you want now and what you want most. Keep learning! 🎓",
    "The difference between who you are and who you want to be is what you do. Stay consistent! ⚡",
    "Learning never exhausts the mind. Keep your momentum going strong! 🌈",
    "Your future is created by what you do today, not tomorrow. Make today count! 🌅",
    "Consistency is not perfection. It's persistent forward movement. Keep going! 🏃",
    "The expert in anything was once a beginner who kept practicing. Your turn is coming! 🎪",
    "Great things are done by a series of small things brought together. Stay consistent! 🧩",
    "Don't watch the clock; do what it does. Keep going and make progress every day! ⏰",
    "The beautiful thing about learning is that no one can take it away from you. Keep building! 🏗️",
    "Success is not final, failure is not fatal: it is the courage to continue that counts! 💫",
    "Every day is a new opportunity to learn and grow. Embrace it with consistency! 🌱",
    "The only impossible journey is the one you never begin. Your daily progress proves you've started! 🛤️",
    "Consistent action creates consistent results. You're building something amazing! 🏆",
    "Learning is the only thing the mind never exhausts. Feed it daily! 🍎",
    "The path to success is to take massive, determined action consistently! 🎯",
    "Your dedication to daily learning is your superpower. Keep unleashing it! ⚡",
    "Rome wasn't built in a day, but they were laying bricks every hour. Keep building! 🧱",
    "The more you learn, the more you earn - in knowledge and growth! 📈",
    "Consistency transforms average into excellence. You're on the right path! ✨",
    "Daily progress is the compound interest of self-improvement! 💰",
    "The secret to success: Start before you're ready, and stay consistent! 🚀"
];

// Get a daily motivational quote (changes every day)
function getDailyQuote() {
    const today = new Date();
    const dayOfYear = Math.floor((today - new Date(today.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
    const quoteIndex = dayOfYear % motivationalQuotes.length;
    return motivationalQuotes[quoteIndex];
}

// Get AI-generated motivational content
async function getAIMotivation() {
    try {
        const motivation = await aiService.generateMotivation();
        return motivation;
    } catch (error) {
        console.error('Error generating AI motivation:', error);
        return getDailyQuote(); // Fallback to static quotes
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

// Helper function to format date for daily update
function formatISTDate(date) {
    return date.toLocaleString('en-US', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
}

// Send startup message
async function sendStartupMessage() {
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

        const currentTime = formatISTTime(getISTTime());
        const message = `${role} 🤖 Bot has started successfully!\n\n**Status:** Online and ready\n**Daily Reminders:** Scheduled at 9:00 PM IST`;

        await channel.send(message);
        console.log(`Startup message sent at ${currentTime}`);
    } catch (error) {
        console.error('Error sending startup message:', error);
    }
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

    // Update bot status
    botStatus.isOnline = true;
    botStatus.connectedAt = new Date().toISOString();

    // Send startup message - DISABLED
    // await sendStartupMessage();
    botStatus.totalMessagesSent++;

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
});

// Command handler for status command
client.on(Events.MessageCreate, async (message) => {
    // Ignore bot messages
    if (message.author.bot) return;

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

    // !study command - Start study session (only in study channel)
    if (message.content.startsWith('!study')) {
        if (message.channel.id !== STUDY_CHANNEL_ID) {
            return message.reply(`Please use the study timer in <#${STUDY_CHANNEL_ID}> channel!`);
        }
        
        const args = message.content.split(' ');
        const duration = parseInt(args[1]) || 25; // Default 25 minutes
        
        if (duration < 1 || duration > 240) {
            return message.reply('Please specify a duration between 1 and 240 minutes.');
        }
        
        const userId = message.author.id;
        const startTime = Date.now();
        
        const startMsg = await message.reply(`🎯 Study session started! Duration: ${duration} minutes.\nI'll remind you when time's up. Focus mode ON! 📚`);
        
        studySessions.set(userId, {
            startTime,
            duration,
            channelId: STUDY_CHANNEL_ID,
            commandMessage: message,
            responseMessage: startMsg
        });
        
        // Schedule end reminder in study channel
        setTimeout(async () => {
            const session = studySessions.get(userId);
            if (session && session.startTime === startTime) {
                try {
                    const channel = await client.channels.fetch(STUDY_CHANNEL_ID);
                    const completionMsg = await channel.send(`<@${userId}> ⏰ **Study Session Completed!** 🎉\n\nYou've successfully completed ${duration} minutes of focused study. Amazing dedication! 💪\n\nTake a well-deserved break and stay hydrated! 💧`);
                    
                    // Delete all messages after 5 seconds
                    setTimeout(() => {
                        session.commandMessage.delete().catch(() => {});
                        session.responseMessage.delete().catch(() => {});
                        completionMsg.delete().catch(() => {});
                    }, 5000);
                    
                    studySessions.delete(userId);
                } catch (error) {
                    console.error('Error sending study reminder:', error);
                }
            }
        }, duration * 60 * 1000);
        
        return;
    }
    
    // !studystatus command - Check study session (only in study channel)
    if (message.content === '!studystatus') {
        if (message.channel.id !== STUDY_CHANNEL_ID) {
            return message.reply(`Please use the study timer in <#${STUDY_CHANNEL_ID}> channel!`);
        }
        
        const userId = message.author.id;
        const session = studySessions.get(userId);
        
        if (!session) {
            return message.reply('You don\'t have an active study session. Start one with `!study <minutes>`');
        }
        
        const elapsed = Math.floor((Date.now() - session.startTime) / 1000 / 60);
        const remaining = session.duration - elapsed;
        
        await message.reply(`📊 **Study Session Status**\n⏱️ Elapsed: ${elapsed} minutes\n⏳ Remaining: ${remaining} minutes\n🎯 Keep going! You got this!`);
        return;
    }
    
    // !endstudy command - End study session early (only in study channel)
    if (message.content === '!endstudy') {
        if (message.channel.id !== STUDY_CHANNEL_ID) {
            return message.reply(`Please use the study timer in <#${STUDY_CHANNEL_ID}> channel!`);
        }
        
        const userId = message.author.id;
        const session = studySessions.get(userId);
        
        if (!session) {
            return message.reply('You don\'t have an active study session.');
        }
        
        const elapsed = Math.floor((Date.now() - session.startTime) / 1000 / 60);
        studySessions.delete(userId);
        
        await message.reply(`✅ Study session ended! You studied for ${elapsed} minutes. Well done! 🎓`);
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
            `📚 **Study Timer:**\n` +
            `\`!study <minutes>\` - Start a study session (default: 25 min)\n` +
            `\`!studystatus\` - Check your current study session\n` +
            `\`!endstudy\` - End study session early\n\n` +
            `🤖 **Gemini AI:**\n` +
            `Go to <#${GEMINI_CHANNEL_ID}> and just type your question!\n` +
            `Messages auto-delete after 24 hours.\n\n` +
            `📚 **Study Channel:** <#${STUDY_CHANNEL_ID}>\n\n` +
            `💡 **Daily Updates:** Automatic at 9:00 PM IST with AI motivation!`;
        
        await message.reply(helpMessage);
    }
});

// Voice channel meeting tracking
client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
        const userId = newState.id;
        const oldChannel = oldState.channel;
        const newChannel = newState.channel;
        
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
            allParticipants: new Map(), // Store all participants who ever joined
            lastActivity: now
        });
        console.log(`📊 Meeting started in voice channel: ${channel.name}`);
    }
    
    const meeting = voiceMeetings.get(channelId);
    
    // Fetch username
    const user = await client.users.fetch(userId).catch(() => null);
    const username = user ? user.username : `User ${userId}`;
    
    meeting.participants.set(userId, {
        joinTime: now,
        totalTime: 0,
        sessions: [],
        username: username
    });
    
    // Also track in allParticipants if not already there
    if (!meeting.allParticipants.has(userId)) {
        meeting.allParticipants.set(userId, {
            totalTime: 0,
            sessions: [],
            username: username
        });
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
    
    if (participant) {
        // Calculate session time
        const sessionTime = now - participant.joinTime;
        
        // Update allParticipants data
        const allParticipantData = meeting.allParticipants.get(userId);
        if (allParticipantData) {
            allParticipantData.totalTime += sessionTime;
            allParticipantData.sessions.push({
                start: participant.joinTime,
                end: now,
                duration: sessionTime
            });
        }
        
        // Remove from active participants
        meeting.participants.delete(userId);
        meeting.lastActivity = now;
        
        const username = allParticipantData.username || `User ${userId}`;
        console.log(`👤 ${username} left ${channel.name} (session: ${Math.round(sessionTime / 1000 / 60)} min)`);
        
        // Check if meeting ended (no one left)
        if (meeting.participants.size === 0) {
            await endMeeting(channelId, channel);
        }
    }
}

async function endMeeting(channelId, channel) {
    const meeting = voiceMeetings.get(channelId);
    if (!meeting) return;
    
    const now = Date.now();
    const meetingDuration = now - meeting.startTime;
    
    // Check minimum duration (20 minutes)
    if (meetingDuration < MINIMUM_MEETING_DURATION) {
        console.log(`⏱️ Meeting in ${channel.name} too short (${Math.round(meetingDuration / 1000 / 60)} min), skipping summary`);
        voiceMeetings.delete(channelId);
        return;
    }
    
    // If no participants recorded, skip
    if (meeting.allParticipants.size === 0) {
        voiceMeetings.delete(channelId);
        return;
    }
    
    await generateMeetingSummary(meeting, meetingDuration, channel, meeting.allParticipants);
    voiceMeetings.delete(channelId);
}

async function generateMeetingSummary(meeting, totalDuration, channel, participants) {
    try {
        const summaryChannelId = process.env.MEETING_SUMMARY_CHANNEL_ID || MEETING_SUMMARY_CHANNEL_ID;
        const summaryChannel = await client.channels.fetch(summaryChannelId);
        
        if (!summaryChannel) {
            console.error('Meeting summary channel not found');
            return;
        }
        
        // Format date
        const meetingDate = new Date(meeting.startTime);
        const dateStr = meetingDate.toLocaleDateString('en-IN', {
            timeZone: 'Asia/Kolkata',
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        const timeStr = meetingDate.toLocaleTimeString('en-IN', {
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit'
        });
        
        // Format duration
        const hours = Math.floor(totalDuration / (1000 * 60 * 60));
        const minutes = Math.floor((totalDuration % (1000 * 60 * 60)) / (1000 * 60));
        const durationStr = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
        
        // Build participant list
        let participantList = '';
        let totalParticipantTime = 0;
        
        for (const [userId, data] of participants.entries()) {
            const username = data.username || `User ${userId}`;
            
            const userMinutes = Math.round(data.totalTime / 1000 / 60);
            const percentage = ((data.totalTime / totalDuration) * 100).toFixed(1);
            
            participantList += `• **${username}**: ${userMinutes} minutes (${percentage}%)\n`;
            totalParticipantTime += data.totalTime;
        }
        
        // Calculate average
        const avgTime = Math.round((totalParticipantTime / participants.size) / 1000 / 60);
        
        // Create summary embed
        const summaryEmbed = {
            color: 0x5865F2,
            title: '🎙️ Voice Meeting Summary',
            fields: [
                {
                    name: '📅 Date',
                    value: `${dateStr} at ${timeStr}`,
                    inline: false
                },
                {
                    name: '🏷️ Channel',
                    value: meeting.channelName,
                    inline: true
                },
                {
                    name: '⏱️ Total Duration',
                    value: durationStr,
                    inline: true
                },
                {
                    name: '👥 Participants',
                    value: participantList || 'No participants',
                    inline: false
                },
                {
                    name: '📊 Statistics',
                    value: `Total Participants: ${participants.size}\nAverage Active Time: ${avgTime} minutes`,
                    inline: false
                }
            ],
            timestamp: new Date().toISOString(),
            footer: {
                text: 'BeeLert Meeting Tracker'
            }
        };
        
        await summaryChannel.send({ embeds: [summaryEmbed] });
        console.log(`✅ Meeting summary posted for ${meeting.channelName}`);
        
    } catch (error) {
        console.error('Error generating meeting summary:', error);
    }
}

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
