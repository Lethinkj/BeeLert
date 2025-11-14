# Discord Moderator Notification Bot

A Discord bot that automatically posts daily progress updates at 9 PM IST and mentions the @Moderator role. The bot also sends a startup message when it comes online.

## Features

- 🚀 **Startup Message**: Sends a test message mentioning @Moderator role when the bot starts
- ⏰ **Daily Updates**: Automatically posts progress updates at 9:00 PM IST every day
- 🕐 **IST Timezone**: All times are in Indian Standard Time (IST)
- 📢 **Role Mentions**: Mentions the configured role (default: @Moderator) in all messages
- 🛠️ **Admin Commands**: Includes commands to check status and test updates
- 🌐 **Node.js**: Built with Discord.js for reliable performance

## Prerequisites

- Node.js 16.9.0 or higher
- npm (comes with Node.js)
- A Discord account
- A Discord server where you have permission to add bots

## Setup Instructions

### 1. Create a Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section in the left sidebar
4. Click "Add Bot" and confirm
5. Under the "Token" section, click "Copy" to copy your bot token
6. Under "Privileged Gateway Intents", enable:
   - ✅ MESSAGE CONTENT INTENT
   - ✅ SERVER MEMBERS INTENT
   - ✅ PRESENCE INTENT

### 2. Invite the Bot to Your Server

1. In the Developer Portal, go to "OAuth2" → "URL Generator"
2. Select the following scopes:
   - ✅ `bot`
3. Select the following bot permissions:
   - ✅ Send Messages
   - ✅ Read Messages/View Channels
   - ✅ Mention Everyone (to mention roles)
4. Copy the generated URL and open it in your browser
5. Select your server and authorize the bot

### 3. Get Channel ID

1. Enable Developer Mode in Discord:
   - Settings → Advanced → Developer Mode (turn ON)
2. Right-click on the channel where you want the bot to post
3. Click "Copy ID" to get the channel ID

### 4. Install Dependencies

Open PowerShell in the bot directory and run:

```powershell
npm install
```

This will install:
- `discord.js` - Discord API library
- `dotenv` - Environment variable management
- `node-cron` - Task scheduler for daily updates

### 5. Configure the Bot

Edit the `.env` file and add your configuration:

```env
BOT_TOKEN=YOUR_DISCORD_BOT_TOKEN_HERE
CHANNEL_ID=YOUR_CHANNEL_ID_HERE
GEMINI_CHANNEL_ID=YOUR_AI_CHAT_CHANNEL_ID_HERE
ROLE_NAME=Basher
OPENAI_API_KEY=YOUR_OPENROUTER_API_KEY_HERE
```

- **BOT_TOKEN**: Your Discord bot token from the Developer Portal
- **CHANNEL_ID**: The ID of the channel where daily updates should be posted
- **GEMINI_CHANNEL_ID**: The ID of the channel for AI chat interactions
- **ROLE_NAME**: The name of the role to mention (default: "Basher")
- **OPENAI_API_KEY**: Your OpenRouter API key (get from https://openrouter.ai/keys)

**Note:** Never share or commit your actual bot token to GitHub!

### 6. Run the Bot

```powershell
npm start
```

Or for development with auto-restart:

```powershell
npm run dev
```

The bot will:
1. Connect to Discord
2. Send a startup message in the configured channel
3. Schedule daily updates at 9 PM IST

## Bot Commands

- **!status** - Check bot status and time until next update
- **!testupdate** - Manually trigger an update message (Admin only)

## Example Messages

### Startup Message
```
@Moderator 🤖 Bot has started successfully!

Status: Online and ready
Time: 2025-11-12 09:30:45 PM IST
Daily Updates: Scheduled at 9:00 PM IST
```

### Daily Progress Update
```
@Moderator 📊 Daily Progress Update

Date: November 12, 2025
Time: 2025-11-12 09:00:00 PM IST

Status: All systems operational
Next Update: Tomorrow at 9:00 PM IST
```

## Troubleshooting

### Bot doesn't mention the role
- Make sure the role name in `config.json` exactly matches the role name in Discord (case-sensitive)
- Ensure the bot has permission to mention roles

### Bot can't send messages
- Check that the bot has "Send Messages" permission in the channel
- Verify the channel ID is correct

### Bot doesn't start
- Make sure you've installed all dependencies: `npm install`
- Check that your bot token is correct in `.env`
- Ensure you have Node.js 16.9.0 or higher installed: `node --version`

### Daily update doesn't trigger at 9 PM
- The bot uses IST (Indian Standard Time)
- Make sure the bot stays running continuously
- Check console output for any errors

## Deploy to Render.com (Recommended)

### Step 1: Prepare Repository
1. Make sure all changes are committed to GitHub
2. Push to your repository: https://github.com/Lethinkj/BeeLert

### Step 2: Create Render Web Service
1. Go to https://render.com/
2. Click "New +" → "Web Service"
3. Connect your GitHub account and select your repository
4. Configure the service:
   - **Name**: BeeLert (or your choice)
   - **Region**: Choose closest to you
   - **Branch**: main
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free

### Step 3: Add Environment Variables
In Render dashboard, go to "Environment" tab and add:
```
BOT_TOKEN=your_discord_bot_token_here
CHANNEL_ID=your_main_channel_id_here
GEMINI_CHANNEL_ID=your_ai_chat_channel_id_here
ROLE_NAME=Basher
OPENAI_API_KEY=your_openrouter_api_key_here
PORT=3000
```

**Important:** Use your actual values from `.env` file, not these placeholders!

### Step 4: Deploy
1. Click "Create Web Service"
2. Wait for deployment to complete
3. Check logs for "Bot is ready at" message

### Health Check URL
Your bot's health check will be at: `https://your-app-name.onrender.com/health`

## Features

### AI-Powered Chat
- Send messages in the AI chat channel (ID: 1438921892101886022)
- Bot responds using GPT-4o-mini via OpenRouter
- Messages auto-delete after 24 hours

### Study Timer
- `!study <minutes>` - Start a study session
- `!studystatus` - Check current session
- `!endstudy` - End session early

### Bot Commands
- `!status` - Check bot status
- `!help` - Show available commands
- `!testupdate` - Test daily update (admin only)

## Notes

- The bot must stay running to send daily updates
- All times are in IST (Indian Standard Time)
- Health check API runs on port 3000 (required for Render)
- Startup message is disabled to reduce spam

## Support

If you encounter any issues:
1. Check Render logs for error messages
2. Verify all environment variables are set correctly
3. Make sure the bot has proper permissions in your Discord server
4. Check OpenRouter credits at https://openrouter.ai/credits

## License

This bot is provided as-is for educational and personal use.
