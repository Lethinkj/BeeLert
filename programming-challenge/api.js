const express = require('express');
const path = require('path');
const db = require('./db');
const questions = require('./questions');
const scheduler = require('./scheduler');

function registerRoutes(app, client) {
    if (!app) return;

    const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

    // Admin Auth Middleware
    const requireAdmin = (req, res, next) => {
        const key = req.headers['x-admin-key'] || req.body?.adminKey || req.query?.adminKey;
        if (key && key === ADMIN_SECRET) {
            return next();
        }
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid Admin Key' });
    };

    // Mount Static Web Dashboard at /programming-dashboard
    try {
        app.use('/programming-dashboard', express.static(path.join(__dirname, 'dashboard')));
        console.log('✅ [Programming Challenge Web] Web Dashboard mounted at /programming-dashboard');
    } catch (e) {
        console.error('❌ Failed to mount programming dashboard:', e.message);
    }

    // Get Active Daily Challenge
    app.get('/api/challenge/current', async (req, res) => {
        try {
            const active = await db.getActiveChallenge();
            if (!active) {
                return res.json({ success: false, message: 'No active challenge' });
            }
            res.json({ success: true, challenge: active });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get Leaderboard Data
    app.get('/api/challenge/leaderboard', async (req, res) => {
        try {
            const data = await db.getLeaderboardData();
            res.json({ success: true, leaderboard: data });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get User Profile
    app.get('/api/challenge/profile/:userId', async (req, res) => {
        try {
            const profile = await db.getUserProfile(req.params.userId);
            res.json({ success: true, profile });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get Question Bank
    app.get('/api/challenge/questions', (req, res) => {
        try {
            const list = questions.getAllQuestions();
            res.json({ success: true, count: list.length, questions: list });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Get System Status & Supabase Connection Info
    app.get('/api/challenge/status', async (req, res) => {
        try {
            const isConfigured = db.isSupabaseConfigured();
            const leaderboard = await db.getLeaderboardData();
            res.json({
                success: true,
                isSupabaseConfigured: isConfigured,
                leaderboardCount: leaderboard.length
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // ============================================
    // ADMIN SYSTEM REST API ENDPOINTS
    // ============================================

    // Admin Login Verification
    app.post('/api/admin/login', (req, res) => {
        const { adminKey } = req.body;
        if (adminKey === ADMIN_SECRET) {
            return res.json({ success: true, message: 'Admin authentication successful' });
        }
        return res.status(401).json({ success: false, error: 'Invalid Admin Key' });
    });

    // Admin Get Current Solution
    app.get('/api/admin/challenge/current-solution', requireAdmin, async (req, res) => {
        try {
            const active = await db.getActiveChallenge();
            if (!active) {
                return res.json({ success: false, message: 'No active challenge currently.' });
            }

            // Find question in question bank for full solution code
            const solCode = questions.getSolutionForQuestion(active);

            res.json({
                success: true,
                challenge: active,
                testCases: active.testCases || [],
                solutionCode: solCode,
                answers: (active.testCases || []).map((tc, idx) => ({
                    testCaseIndex: idx + 1,
                    input: JSON.stringify(tc.input),
                    expectedAnswer: JSON.stringify(tc.expected)
                }))
            });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Admin Get Voice Activity Monitor Logs
    app.get('/api/admin/voice-monitor/logs', requireAdmin, async (req, res) => {
        try {
            const voiceMonitor = require('../voice-monitor');
            const nowIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
            const todayStr = nowIST.toISOString().split('T')[0];
            const targetDate = req.query.date || todayStr;

            const dbSessions = await voiceMonitor.db.getSessionsForDate(targetDate);
            const activeMap = voiceMonitor.tracker.getActiveSessions();
            const now = Date.now();

            const combinedSessions = [...dbSessions.map(s => ({ ...s, isLive: false }))];

            if (targetDate === todayStr) {
                activeMap.forEach((active, userId) => {
                    const durationSec = Math.max(0, Math.floor((now - active.joinTime) / 1000));
                    combinedSessions.push({
                        sessionId: active.sessionId,
                        discordUserId: userId,
                        username: active.username,
                        guildId: active.guildId,
                        voiceChannelId: active.voiceChannelId,
                        joinTime: new Date(active.joinTime).toISOString(),
                        leaveTime: null,
                        durationSeconds: durationSec,
                        sessionDate: targetDate,
                        isLive: true
                    });
                });
            }

            const userStats = new Map();
            combinedSessions.forEach(s => {
                const uid = s.discordUserId;
                if (!userStats.has(uid)) {
                    userStats.set(uid, {
                        discordUserId: uid,
                        username: s.username || `user_${uid}`,
                        totalSeconds: 0,
                        sessionCount: 0
                    });
                }
                const stat = userStats.get(uid);
                stat.totalSeconds += (s.durationSeconds || 0);
                stat.sessionCount += 1;
            });

            const memberSummary = Array.from(userStats.values())
                .sort((a, b) => b.totalSeconds - a.totalSeconds);

            const activeMembersCount = memberSummary.length;
            const totalVoiceSeconds = memberSummary.reduce((acc, m) => acc + m.totalSeconds, 0);
            const liveConnectedCount = targetDate === todayStr ? activeMap.size : 0;

            res.json({
                success: true,
                date: targetDate,
                monitoredVcId: voiceMonitor.config.MONITORED_VC_ID,
                stats: {
                    activeMembersCount,
                    totalVoiceSeconds,
                    totalSessionsCount: combinedSessions.length,
                    liveConnectedCount
                },
                memberSummary,
                sessions: combinedSessions.sort((a, b) => new Date(b.joinTime) - new Date(a.joinTime))
            });
        } catch (err) {
            console.error('❌ Error fetching admin voice logs:', err);
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Admin Force Post Challenge
    app.post('/api/admin/challenge/force-post', requireAdmin, async (req, res) => {
        try {
            if (!client) {
                return res.status(500).json({ success: false, error: 'Discord client not connected' });
            }
            const msg = await scheduler.postDailyChallenge(client);
            if (msg) {
                res.json({ success: true, message: 'Daily challenge posted successfully with @everyone ping!' });
            } else {
                res.status(500).json({ success: false, error: 'Failed to post challenge (check channel config)' });
            }
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Admin Skip Challenge
    app.post('/api/admin/challenge/skip', requireAdmin, async (req, res) => {
        try {
            if (!client) {
                return res.status(500).json({ success: false, error: 'Discord client not connected' });
            }
            const msg = await scheduler.postDailyChallenge(client);
            res.json({ success: true, message: 'Challenge skipped and new challenge posted!' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Admin Add Question
    app.post('/api/admin/challenge/add-question', requireAdmin, (req, res) => {
        try {
            const { title, difficulty, category, description, hint, sampleInput, sampleExpected } = req.body;
            if (!title || !description || !difficulty || !category) {
                return res.status(400).json({ success: false, error: 'Missing required fields' });
            }

            const newQuestion = {
                id: `q_custom_${Date.now()}`,
                title,
                difficulty,
                category,
                description,
                hint: hint || '',
                testCases: sampleInput ? [{ input: sampleInput, expected: sampleExpected }] : []
            };

            const bank = questions.getAllQuestions();
            bank.push(newQuestion);
            db.saveQuestionBank(bank);

            res.json({ success: true, message: 'New question added to Question Bank!', question: newQuestion });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    // Admin Reset Leaderboard
    app.post('/api/admin/challenge/reset-leaderboard', requireAdmin, async (req, res) => {
        try {
            await db.resetLeaderboard();
            res.json({ success: true, message: 'Leaderboard reset successfully!' });
        } catch (err) {
            res.status(500).json({ success: false, error: err.message });
        }
    });

    console.log('🌐 [Programming Challenge Web] REST API & Admin routes mounted at /api/challenge/* and /api/admin/*');
}

module.exports = {
    registerRoutes
};
