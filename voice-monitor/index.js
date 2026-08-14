const config = require('./config');
const db = require('./db');
const tracker = require('./tracker');
const scheduler = require('./scheduler');

function init(client) {
    console.log('🎙️ [Voice Monitor Plugin] Initializing Voice Activity Monitoring System...');
    try {
        // Startup active sessions recovery
        tracker.initStartupRecovery(client);

        // Register 11 PM cron scheduler
        scheduler.startScheduler(client);

        console.log(`✅ [Voice Monitor Plugin] Fully initialized. Monitoring VC ${config.MONITORED_VC_ID}...`);
    } catch (err) {
        console.error('❌ [Voice Monitor Plugin] Initialization error:', err);
    }
}

module.exports = {
    init,
    handleVoiceStateUpdate: tracker.handleVoiceStateUpdate,
    generateAndSendDailyReport: scheduler.generateAndSendDailyReport,
    config,
    db,
    tracker,
    scheduler
};
