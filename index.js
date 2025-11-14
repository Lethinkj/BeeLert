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
    ]
});

// Configuration from environment variables
const BOT_TOKEN = process.env.BOT_TOKEN;
const CHANNEL_ID = process.env.CHANNEL_ID;
const GEMINI_CHANNEL_ID = process.env.GEMINI_CHANNEL_ID;
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

    // !study command - Start study session
    if (message.content.startsWith('!study')) {
        const args = message.content.split(' ');
        const duration = parseInt(args[1]) || 25; // Default 25 minutes
        
        if (duration < 1 || duration > 240) {
            return message.reply('Please specify a duration between 1 and 240 minutes.');
        }
        
        const userId = message.author.id;
        const startTime = Date.now();
        
        studySessions.set(userId, {
            startTime,
            duration,
            channelId: message.channel.id
        });
        
        await message.reply(`🎯 Study session started! Duration: ${duration} minutes.\nI'll remind you when time's up. Focus mode ON! 📚`);
        
        // Schedule end reminder
        setTimeout(async () => {
            const session = studySessions.get(userId);
            if (session && session.startTime === startTime) {
                try {
                    const channel = await client.channels.fetch(session.channelId);
                    await channel.send(`<@${userId}> ⏰ Time's up! You've completed ${duration} minutes of focused study. Great work! 🎉\n\nTake a break and stay hydrated! 💧`);
                    studySessions.delete(userId);
                } catch (error) {
                    console.error('Error sending study reminder:', error);
                }
            }
        }, duration * 60 * 1000);
        
        return;
    }
    
    // !studystatus command - Check study session
    if (message.content === '!studystatus') {
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
    
    // !endstudy command - End study session early
    if (message.content === '!endstudy') {
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
            `💡 **Daily Updates:** Automatic at 9:00 PM IST with AI motivation!`;
        
        await message.reply(helpMessage);
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
