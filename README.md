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
ROLE_NAME=Basher
```

- **BOT_TOKEN**: Your Discord bot token from the Developer Portal
- **CHANNEL_ID**: The ID of the channel where messages should be posted
- **ROLE_NAME**: The name of the role to mention (default: "Basher")

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

## Keeping the Bot Running 24/7

To keep the bot running continuously, you can:

1. **Use a VPS/Cloud Server**: Deploy on AWS, DigitalOcean, Azure, etc.
2. **Use a Raspberry Pi**: Run it on a local device
3. **Use a hosting service**: Deploy to Railway, Render, Glitch, or similar platforms
4. **Use PM2** (recommended for Node.js):

```powershell
npm install -g pm2
pm2 start index.js --name discord-bot
pm2 save
pm2 startup
```

PM2 will keep your bot running and automatically restart it if it crashes.

## Notes

- The bot must stay running to send daily updates
- All times are in IST (Indian Standard Time)
- The bot will calculate and wait until the next 9 PM to send the first scheduled update
- The startup message is sent immediately when the bot connects

## Support

If you encounter any issues:
1. Check the console output for error messages
2. Verify all configuration settings
3. Make sure the bot has proper permissions in your Discord server

## License

This bot is provided as-is for educational and personal use.
