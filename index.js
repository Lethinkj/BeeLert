const { Client, GatewayIntentBits, Events, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, Partials } = require('discord.js');
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
    ],
    partials: [Partials.Channel]
});

// Configuration from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GEMINI_CHANNEL_ID = process.env.GEMINI_CHANNEL_ID;
const STUDY_CHANNEL_ID = process.env.STUDY_CHANNEL_ID;
const LOUNGE_VOICE_CHANNEL_ID = process.env.LOUNGE_VOICE_CHANNEL_ID || '1350324320672546826';
const MEETING_SUMMARY_CHANNEL_ID = process.env.MEETING_SUMMARY_CHANNEL_ID || '1442861248285773924';
const SCHEDULE_MEET_CHANNEL_ID = process.env.SCHEDULE_MEET_CHANNEL_ID || '1443135153185493033';
const ROLE_NAME = process.env.ROLE_NAME || 'Basher';

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
const scheduledMeetings = new Map(); // meetingId -> { time, topic, channelId, timeoutId, creatorId, confirmationMsg }

// Personal reminder tracking
const userReminders = new Map(); // userId -> { time: '20:00', customMessage: null, active: true }
const conversationStates = new Map(); // userId -> { step: 'awaiting_time' | 'awaiting_message', time: string }
const fs = require('fs');
const REMINDERS_FILE = './user-reminders.json';

// Load reminders from file on startup
function loadReminders() {
    try {
        if (fs.existsSync(REMINDERS_FILE)) {
            const data = fs.readFileSync(REMINDERS_FILE, 'utf8');
            const savedReminders = JSON.parse(data);
            savedReminders.forEach(([userId, settings]) => {
                userReminders.set(userId, settings);
            });
            console.log(`📁 Loaded ${userReminders.size} user reminders from file`);
        }
    } catch (error) {
        console.error('Error loading reminders:', error);
    }
}

// Save reminders to file
function saveReminders() {
    try {
        const data = JSON.stringify(Array.from(userReminders.entries()));
        fs.writeFileSync(REMINDERS_FILE, data);
    } catch (error) {
        console.error('Error saving reminders:', error);
    }
}

// Notify users about bot restart
async function notifyUsersAboutRestart() {
    if (userReminders.size === 0) return;
    
    console.log(`📢 Notifying ${userReminders.size} users about restart...`);
    
    for (const [userId, settings] of userReminders.entries()) {
        try {
            const user = await client.users.fetch(userId);
            await user.send(
                "⚠️ **Bot Restart Notice**\n\n" +
                "Sorry for the inconvenience! The bot restarted due to technical maintenance.\n\n" +
                "📋 **Your reminder settings:**\n" +
                `⏰ Time: ${settings.time} IST\n` +
                `📝 Message: ${settings.customMessage || 'Default'}\n` +
                `🔔 Status: ${settings.active ? '✅ Active' : '⏸️ Paused'}\n\n` +
                "✅ Your reminders are still active and will work as scheduled!\n\n" +
                "Type `help` for available commands."
            );
            console.log(`✅ Notified ${user.username}`);
            await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
        } catch (error) {
            console.error(`❌ Cannot notify user ${userId}:`, error.message);
        }
    }
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
        content: '╔══════════════════════════════════════╗\n' +
                 '║      📅 MEETING MANAGER              ║\n' +
                 '╚══════════════════════════════════════╝\n\n' +
                 '**Manage your team meetings easily!**\n\n' +
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
        
        const reminderMessage = `${role ? `<@&${role.id}>` : `@${ROLE_NAME}`}

📢 **MEETING IS NOW LIVE!**

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
    
    // Load saved reminders
    loadReminders();
    
    // Notify users about restart (only if reminders exist)
    if (userReminders.size > 0) {
        // Wait a bit before sending notifications
        setTimeout(() => notifyUsersAboutRestart(), 3000);
    }

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
                const modal = new ModalBuilder()
                    .setCustomId('schedule_modal')
                    .setTitle('📅 Schedule a Meeting');

                const timeInput = new TextInputBuilder()
                    .setCustomId('meeting_time')
                    .setLabel('Meeting Time (e.g., 8:00 PM)')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('8:00 PM')
                    .setRequired(true);

                const topicInput = new TextInputBuilder()
                    .setCustomId('meeting_topic')
                    .setLabel('Meeting Topic')
                    .setStyle(TextInputStyle.Short)
                    .setPlaceholder('Daily Standup')
                    .setRequired(true);

                const firstRow = new ActionRowBuilder().addComponents(timeInput);
                const secondRow = new ActionRowBuilder().addComponents(topicInput);

                modal.addComponents(firstRow, secondRow);
                await interaction.showModal(modal);
                return;
            }
            
            // View Meetings button
            if (interaction.customId === 'view_meetings') {
                if (scheduledMeetings.size === 0) {
                    return interaction.reply({ 
                        content: '📭 No upcoming meetings scheduled.', 
                        ephemeral: true 
                    });
                }

                let message = '╔══════════════════════════════════════╗\n' +
                              '║      📋 UPCOMING MEETINGS            ║\n' +
                              '╚══════════════════════════════════════╝\n\n';

                const buttons = [];
                scheduledMeetings.forEach((meeting, id) => {
                    const timeStr = meeting.time.toLocaleString('en-IN', {
                        timeZone: 'Asia/Kolkata',
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        hour12: true
                    });
                    
                    const creatorTag = meeting.creatorId === interaction.user.id ? ' (Your meeting)' : '';
                    message += `🔹 **${meeting.topic}**${creatorTag}\n   ⏰ ${timeStr} IST\n\n`;

                    // Only show cancel button if user is the creator
                    if (meeting.creatorId === interaction.user.id) {
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
                    ephemeral: true 
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
                            ephemeral: true
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
                        ephemeral: true
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
            const timeStr = interaction.fields.getTextInputValue('meeting_time');
            const topic = interaction.fields.getTextInputValue('meeting_topic');

            try {
                // Parse time
                const parts = timeStr.trim().split(' ');
                if (parts.length < 2) {
                    return interaction.reply({
                        content: '❌ Invalid time format. Use format like: **8:00 PM**',
                        ephemeral: true
                    });
                }
                
                const [timeOnly, period] = parts;
                const [hoursStr, minutesStr] = timeOnly.split(':');
                let hours = parseInt(hoursStr);
                const minutes = parseInt(minutesStr);
                
                if (isNaN(hours) || isNaN(minutes) || hours < 1 || hours > 12 || minutes < 0 || minutes > 59) {
                    return interaction.reply({
                        content: '❌ Invalid time format. Use format like: **8:00 PM**',
                        ephemeral: true
                    });
                }
                
                if (period.toUpperCase() === 'PM' && hours !== 12) hours += 12;
                if (period.toUpperCase() === 'AM' && hours === 12) hours = 0;
                
                // Create scheduled time for today
                const now = getISTTime();
                const scheduledTime = new Date(now);
                scheduledTime.setHours(hours, minutes, 0, 0);
                
                // If time already passed today, schedule for tomorrow
                if (scheduledTime <= now) {
                    scheduledTime.setDate(scheduledTime.getDate() + 1);
                }
                
                // Store meeting with creator ID
                const meetingId = Date.now().toString();
                const delay = scheduledTime.getTime() - now.getTime();
                
                const timeoutId = setTimeout(async () => {
                    await sendMeetingReminder(topic, meetingId);
                    scheduledMeetings.delete(meetingId);
                }, delay);
                
                const dateStr = scheduledTime.toLocaleDateString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric'
                });
                const timeDispStr = scheduledTime.toLocaleTimeString('en-IN', {
                    timeZone: 'Asia/Kolkata',
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true
                });
                
                // Send confirmation in schedule channel (visible to all)
                const scheduleChannel = await client.channels.fetch(SCHEDULE_MEET_CHANNEL_ID);
                const confirmationMsg = await scheduleChannel.send({
                    content: `✅ **Meeting Scheduled by <@${interaction.user.id}>**\n` +
                            `📅 Date: ${dateStr}\n` +
                            `🕐 Time: ${timeDispStr} IST\n` +
                            `📝 Topic: **${topic}**\n` +
                            `📍 Location: Lounge voice channel\n\n` +
                            `A reminder will be posted in the general channel at the scheduled time.`
                });
                
                scheduledMeetings.set(meetingId, {
                    time: scheduledTime,
                    topic: topic,
                    channelId: LOUNGE_VOICE_CHANNEL_ID,
                    timeoutId: timeoutId,
                    creatorId: interaction.user.id,
                    confirmationMsg: confirmationMsg
                });
                
                // Reply to user (only they see this)
                await interaction.reply({
                    content: `✅ **Your meeting has been scheduled successfully!**\n` +
                            `📝 Topic: ${topic}\n` +
                            `🕐 Time: ${timeDispStr} IST\n\n` +
                            `The confirmation is visible to everyone in <#${SCHEDULE_MEET_CHANNEL_ID}>`,
                    ephemeral: true
                });
                
                console.log(`📅 Meeting scheduled by ${interaction.user.username}: ${topic} at ${timeDispStr}`);
                
            } catch (error) {
                console.error('Error scheduling meeting:', error);
                await interaction.reply({
                    content: '❌ Invalid time format. Use format like: **8:00 PM**',
                    ephemeral: true
                });
            }
            return;
        }
        
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                content: '❌ An error occurred while processing your request.',
                ephemeral: true
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
            if (content === 'help') {
                await message.reply(
                    "🤖 **BeeLert Personal Reminder Help**\n\n" +
                    "**Setup Your Reminder:**\n" +
                    "• Type `reminder` to start setup\n" +
                    "• I'll guide you through choosing your time\n" +
                    "• Optionally set a custom message\n\n" +
                    "**Manage Your Reminder:**\n" +
                    "• `status` - View your current settings\n" +
                    "• `pause` - Temporarily pause reminders\n" +
                    "• `resume` - Resume paused reminders\n" +
                    "• `change time` - Update reminder time\n" +
                    "• `change message` - Update custom message\n" +
                    "• `stop` - Delete your reminder completely\n\n" +
                    "**During Setup:**\n" +
                    "• `cancel` - Cancel current setup\n\n" +
                    "💡 Your reminders are saved and persist across bot restarts!"
                );
                return;
            }
            
            // Start reminder setup
            if (content === 'reminder' && !state) {
                conversationStates.set(userId, { step: 'awaiting_time' });
                await message.reply(
                    "Hi! I can remind you to post your daily progress. 📝\n\n" +
                    "What time works best for you?\n" +
                    "**Examples:** `8:00 PM`, `9 PM`, `21:00`, `8:30 PM`\n\n" +
                    "_(Type `cancel` anytime to stop)_"
                );
                return;
            }
            
            // Handle time input
            if (state && state.step === 'awaiting_time') {
                if (content === 'cancel') {
                    conversationStates.delete(userId);
                    await message.reply("❌ Setup cancelled. Type `reminder` to start again.");
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
                
                // Save to file
                saveReminders();
                
                // Clear conversation state
                conversationStates.delete(userId);
                
                const displayMessage = customMessage || "Default reminder message";
                
                await message.reply(
                    "🎉 **All set!** Your daily reminder is configured.\n\n" +
                    `⏰ **Time:** ${state.time} IST\n` +
                    `📝 **Message:** ${displayMessage}\n\n` +
                    "**Commands:** Type `help` to see all commands"
                );
                
                console.log(`✅ Reminder created for ${message.author.username} at ${state.time}`);
                return;
            }
            
            // Status command
            if (content === 'status') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `reminder` to create one.");
                    return;
                }
                
                await message.reply(
                    "📊 **Your Reminder Settings**\n\n" +
                    `⏰ **Time:** ${reminder.time} IST\n` +
                    `📝 **Message:** ${reminder.customMessage || 'Default'}\n` +
                    `🔔 **Status:** ${reminder.active ? '✅ Active' : '⏸️ Paused'}\n\n` +
                    "Type `help` for available commands"
                );
                return;
            }
            
            // Pause command
            if (content === 'pause') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `reminder` to create one.");
                    return;
                }
                reminder.active = false;
                saveReminders();
                await message.reply("⏸️ Reminders paused. Type `resume` to turn them back on.");
                return;
            }
            
            // Resume command
            if (content === 'resume') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `reminder` to create one.");
                    return;
                }
                reminder.active = true;
                saveReminders();
                await message.reply("✅ Reminders resumed!");
                return;
            }
            
            // Change time
            if (content === 'change time') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `reminder` to create one.");
                    return;
                }
                conversationStates.set(userId, { step: 'awaiting_time' });
                await message.reply("What's your new preferred time? (e.g., `9:00 PM`)");
                return;
            }
            
            // Change message
            if (content === 'change message') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set. Type `reminder` to create one.");
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
            if (content === 'stop') {
                const reminder = userReminders.get(userId);
                if (!reminder) {
                    await message.reply("❌ You don't have a reminder set.");
                    return;
                }
                userReminders.delete(userId);
                saveReminders();
                await message.reply("❌ Daily reminder deleted. Type `reminder` anytime to set up again.");
                console.log(`🗑️ Reminder deleted for ${message.author.username}`);
                return;
            }
            
            // Unknown command in DM
            await message.reply(
                "🤔 I didn't understand that.\n\n" +
                "Type `help` to see all available commands, or `reminder` to set up daily reminders!"
            );
            
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
