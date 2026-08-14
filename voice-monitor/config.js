// Configuration constants for Daily Voice Activity Monitoring
module.exports = {
    MAIN_SERVER_ID: process.env.MAIN_SERVER_ID || '1163002451746623528',
    CLAN_SERVER_ID: process.env.CLAN_SERVER_ID || '1350324319942868992',
    MONITORED_VC_ID: process.env.MONITORED_VC_ID || '1497644357870682324',
    REPORT_CHANNEL_ID: process.env.REPORT_CHANNEL_ID || '1442861248285773924',
    CRON_SCHEDULE: '0 23 * * *', // Every day at 11:00 PM IST
    TIMEZONE: 'Asia/Kolkata'
};
