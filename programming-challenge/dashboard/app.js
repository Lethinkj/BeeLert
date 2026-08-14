async function fetchCurrentChallenge() {
    try {
        const res = await fetch('/api/challenge/current');
        const data = await res.json();
        if (data.success && data.challenge) {
            const ch = data.challenge;
            document.getElementById('ch-title').innerText = ch.title;
            document.getElementById('ch-desc').innerText = ch.description;
            document.getElementById('ch-diff').innerText = ch.difficulty;
            document.getElementById('ch-cat').innerText = ch.category;
            document.getElementById('ch-hint').innerText = ch.hint || 'No hint provided.';

            const tc = ch.testCases && ch.testCases.length > 0 ? ch.testCases[0] : null;
            document.getElementById('ch-input').innerText = tc ? JSON.stringify(tc.input, null, 2) : 'N/A';
            document.getElementById('ch-expected').innerText = tc ? JSON.stringify(tc.expected, null, 2) : 'N/A';
        }
    } catch (e) {
        console.error('Error fetching challenge:', e);
    }
}

async function fetchLeaderboard() {
    try {
        const res = await fetch('/api/challenge/leaderboard');
        const data = await res.json();
        if (data.success && data.leaderboard) {
            const tbody = document.getElementById('leaderboard-rows');
            if (data.leaderboard.length === 0) {
                tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users on leaderboard yet.</td></tr>';
                return;
            }
            const medals = ['🥇', '🥈', '🥉'];
            tbody.innerHTML = data.leaderboard.map((u, i) => `
                <tr>
                    <td><strong>${medals[i] || '#' + (i + 1)}</strong></td>
                    <td><span class="user-id"><i class="fa-solid fa-user"></i> <@${u.userId}> (${u.userId})</span></td>
                    <td><strong class="gold-text">⭐ ${u.xp} XP</strong> (Lvl ${u.level || Math.floor(u.xp / 100) + 1})</td>
                    <td><strong class="cyan-text">💎 ${u.communityPoints || 0} Pts</strong></td>
                    <td>🎯 ${u.solved} Solved</td>
                    <td>🔥 ${u.streak} Days (Highest: ${u.highestStreak || u.streak}d)</td>
                    <td>🎯 ${u.accuracy}%</td>
                </tr>
            `).join('');
        }
    } catch (e) {
        console.error('Error fetching leaderboard:', e);
    }
}

async function fetchQuestions() {
    try {
        const res = await fetch('/api/challenge/questions');
        const data = await res.json();
        if (data.success && data.questions) {
            const container = document.getElementById('questions-list');
            container.innerHTML = data.questions.map(q => `
                <div class="q-card">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
                        <span class="tag tag-diff">${q.difficulty}</span>
                        <span class="tag tag-cat">${q.category}</span>
                    </div>
                    <strong style="display: block; margin-bottom: 6px;">${q.title}</strong>
                    <p style="font-size: 12px; color: var(--text-muted);">${q.description.slice(0, 80)}...</p>
                </div>
            `).join('');
        }
    } catch (e) {
        console.error('Error fetching questions:', e);
    }
}

async function fetchSystemStatus() {
    try {
        const res = await fetch('/status');
        const data = await res.json();
        if (data) {
            document.getElementById('sys-status').innerText = data.botOnline ? '200 OK (Online)' : '503 Offline';
            const hours = Math.floor(data.uptime / 3600);
            const mins = Math.floor((data.uptime % 3600) / 60);
            document.getElementById('sys-uptime').innerText = `${hours}h ${mins}m`;
        }

        const chStatusRes = await fetch('/api/challenge/status');
        const chStatusData = await chStatusRes.json();
        if (chStatusData && chStatusData.success) {
            document.getElementById('sys-db').innerText = chStatusData.isSupabaseConfigured ? 'Supabase Online' : 'Local Fallback';
        }
    } catch (e) {
        console.error('Error fetching status:', e);
    }
}

function updateCountdown() {
    const now = new Date();
    const next8AM = new Date(now);
    next8AM.setHours(8, 0, 0, 0);
    if (now >= next8AM) {
        next8AM.setDate(next8AM.getDate() + 1);
    }
    const diffMs = next8AM - now;
    const hours = Math.floor(diffMs / 3600000).toString().padStart(2, '0');
    const mins = Math.floor((diffMs % 3600000) / 60000).toString().padStart(2, '0');
    const secs = Math.floor((diffMs % 60000) / 1000).toString().padStart(2, '0');
    document.getElementById('countdown-timer').innerText = `${hours}:${mins}:${secs}`;
}

function showTab(tabName, el) {
    document.querySelectorAll('.tab-page').forEach(page => page.classList.remove('active'));
    document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
    
    const targetTab = document.getElementById(`tab-${tabName}`);
    if (targetTab) {
        targetTab.classList.add('active');
    }
    
    const activeBtn = el || (window.event && window.event.currentTarget) || document.querySelector(`.nav-btn[onclick*="'${tabName}'"]`);
    if (activeBtn && activeBtn.classList) {
        activeBtn.classList.add('active');
    }

    if (tabName === 'admin') {
        checkAdminAuth();
    }
}

// ============================================
// ADMIN SYSTEM JS CONTROLLERS
// ============================================
let currentAdminKey = sessionStorage.getItem('adminSecretKey') || '';

function checkAdminAuth() {
    const loginView = document.getElementById('admin-login-view');
    const controlView = document.getElementById('admin-control-view');
    if (!loginView || !controlView) return;
    if (currentAdminKey) {
        loginView.style.display = 'none';
        controlView.style.display = 'block';
        fetchAdminSolution();
        fetchAdminVoiceLogs();
    } else {
        loginView.style.display = 'block';
        controlView.style.display = 'none';
    }
}

async function fetchAdminSolution() {
    const contentEl = document.getElementById('admin-solution-content');
    if (!contentEl) return;

    try {
        const res = await fetch('/api/admin/challenge/current-solution', {
            headers: { 'X-Admin-Key': currentAdminKey }
        });
        const data = await res.json();
        if (data.success && data.challenge) {
            const ch = data.challenge;
            const answersHtml = (data.answers || []).map((ans) => `
                <div style="background: rgba(0,0,0,0.4); border-radius: 8px; padding: 12px; border: 1px solid rgba(241,196,15,0.25); margin-top: 8px;">
                    <div style="font-size: 11px; color: var(--text-muted); text-transform: uppercase; margin-bottom: 4px;">Test Case #${ans.testCaseIndex}</div>
                    <div style="font-family: 'Fira Code', monospace; font-size: 13px;">
                        <span style="color: #3498db;">Input:</span> <code>${ans.input}</code>
                    </div>
                    <div style="font-family: 'Fira Code', monospace; font-size: 14px; margin-top: 6px;">
                        <span style="color: #2ecc71;">Expected Answer Output:</span> <strong style="color: #f1c40f; background: rgba(241,196,15,0.1); padding: 2px 8px; border-radius: 4px;">${ans.expectedAnswer}</strong>
                    </div>
                </div>
            `).join('');

            const solCode = data.solutionCode || {};
            const pyCode = solCode.python || `# Solution for ${ch.title}`;
            const jsCode = solCode.javascript || `// Solution for ${ch.title}`;

            window._adminCurrentSolution = {
                python: pyCode,
                javascript: jsCode
            };

            contentEl.innerHTML = `
                <div style="display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-bottom: 8px;">
                    <h3 style="margin: 0; color: #fff;">${ch.title}</h3>
                    <span class="tag tag-diff">${ch.difficulty}</span>
                    <span class="tag tag-cat">${ch.category}</span>
                </div>
                <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 16px;">${ch.description}</div>
                
                <!-- FULL SOLUTION CODE BLOCKS -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 16px;">
                    <div style="background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid rgba(46,204,113,0.3); padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <strong style="color: #2ecc71; font-size: 13px;"><i class="fa-brands fa-python"></i> Python Solution Code</strong>
                            <button onclick="copySolutionCode('python', this)" class="tag tag-diff" style="cursor: pointer; font-size: 10px;">Copy Code</button>
                        </div>
                        <pre class="code-block" style="margin: 0; font-size: 12px; max-height: 220px; overflow-y: auto; white-space: pre; text-align: left; tab-size: 4;"><code>${escapeHtml(pyCode)}</code></pre>
                    </div>
                    <div style="background: rgba(0,0,0,0.5); border-radius: 8px; border: 1px solid rgba(241,196,15,0.3); padding: 12px;">
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                            <strong style="color: #f1c40f; font-size: 13px;"><i class="fa-brands fa-js"></i> JavaScript Solution Code</strong>
                            <button onclick="copySolutionCode('javascript', this)" class="tag tag-diff" style="cursor: pointer; font-size: 10px;">Copy Code</button>
                        </div>
                        <pre class="code-block" style="margin: 0; font-size: 12px; max-height: 220px; overflow-y: auto; white-space: pre; text-align: left; tab-size: 4;"><code>${escapeHtml(jsCode)}</code></pre>
                    </div>
                </div>

                <div style="margin-top: 12px;">
                    <strong style="color: #00f2fe; font-size: 13px;"><i class="fa-solid fa-check-double"></i> Test Cases & Expected Outputs:</strong>
                    ${answersHtml || '<div style="color: var(--text-muted);">No test cases defined.</div>'}
                </div>
            `;
        } else {
            contentEl.innerHTML = `<div style="color: var(--text-muted);">${data.message || 'No active challenge found.'}</div>`;
        }
    } catch (e) {
        contentEl.innerHTML = `<div style="color: #e74c3c;">Failed to fetch solution: ${e.message}</div>`;
    }
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

function copySolutionCode(type, btn) {
    if (window._adminCurrentSolution && window._adminCurrentSolution[type]) {
        const text = window._adminCurrentSolution[type];
        navigator.clipboard.writeText(text).then(() => {
            if (btn) {
                const oldText = btn.innerText;
                btn.innerText = 'COPIED! ✅';
                setTimeout(() => { btn.innerText = oldText; }, 1500);
            }
        }).catch(err => {
            console.error('Failed to copy text:', err);
        });
    }
}

async function loginAdmin() {
    const key = document.getElementById('admin-secret-input').value.trim();
    const errEl = document.getElementById('admin-login-error');
    errEl.style.display = 'none';

    if (!key) {
        errEl.innerText = 'Please enter admin secret key.';
        errEl.style.display = 'block';
        return;
    }

    try {
        const res = await fetch('/api/admin/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ adminKey: key })
        });
        const data = await res.json();
        if (data.success) {
            currentAdminKey = key;
            sessionStorage.setItem('adminSecretKey', key);
            checkAdminAuth();
        } else {
            errEl.innerText = data.error || 'Invalid Admin Key.';
            errEl.style.display = 'block';
        }
    } catch (e) {
        errEl.innerText = 'Connection error. Please try again.';
        errEl.style.display = 'block';
    }
}

function logoutAdmin() {
    currentAdminKey = '';
    sessionStorage.removeItem('adminSecretKey');
    checkAdminAuth();
}

async function adminAction(endpoint, payload = {}) {
    const statusEl = document.getElementById('admin-action-status');
    statusEl.innerHTML = '<span style="color: #f1c40f;">⏳ Processing admin command...</span>';

    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Admin-Key': currentAdminKey
            },
            body: JSON.stringify({ ...payload, adminKey: currentAdminKey })
        });
        const data = await res.json();
        if (data.success) {
            statusEl.innerHTML = `<span style="color: #2ecc71;">✅ ${data.message}</span>`;
            fetchCurrentChallenge();
            fetchLeaderboard();
            fetchQuestions();
        } else {
            statusEl.innerHTML = `<span style="color: #e74c3c;">❌ Error: ${data.error || 'Operation failed'}</span>`;
        }
    } catch (e) {
        statusEl.innerHTML = `<span style="color: #e74c3c;">❌ Network error: ${e.message}</span>`;
    }
}

function adminForcePost() {
    adminAction('/api/admin/challenge/force-post');
}

function adminSkipChallenge() {
    adminAction('/api/admin/challenge/skip');
}

function adminResetLeaderboard() {
    if (confirm('Are you sure you want to reset the programming leaderboard? This action cannot be undone.')) {
        adminAction('/api/admin/challenge/reset-leaderboard');
    }
}

async function adminAddQuestion(event) {
    event.preventDefault();
    const title = document.getElementById('q-title').value.trim();
    const difficulty = document.getElementById('q-diff').value;
    const category = document.getElementById('q-cat').value.trim();
    const description = document.getElementById('q-desc').value.trim();
    const hint = document.getElementById('q-hint').value.trim();
    const sampleInput = document.getElementById('q-input').value.trim();
    const sampleExpected = document.getElementById('q-expected').value.trim();

    await adminAction('/api/admin/challenge/add-question', {
        title, difficulty, category, description, hint, sampleInput, sampleExpected
    });

    document.getElementById('add-question-form').reset();
}

// Initial Load
window.addEventListener('DOMContentLoaded', () => {
    fetchCurrentChallenge();
    fetchLeaderboard();
    fetchQuestions();
    fetchSystemStatus();
    checkAdminAuth();

    const savedTab = sessionStorage.getItem('openTab') || (window.location.hash ? window.location.hash.replace('#', '') : '');
    if (savedTab) {
        sessionStorage.removeItem('openTab');
        showTab(savedTab);
    }

    setInterval(updateCountdown, 1000);
    updateCountdown();
});

// ============================================
// VOICE ACTIVITY MONITOR LOGS CONTROLLER
// ============================================
async function fetchAdminVoiceLogs() {
    const logsContainer = document.getElementById('admin-vc-logs-container');
    const pillsContainer = document.getElementById('admin-vc-members-pills');
    const datePicker = document.getElementById('admin-vc-date-picker');
    if (!logsContainer) return;

    if (datePicker && !datePicker.value) {
        const todayIST = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }))
            .toISOString().split('T')[0];
        datePicker.value = todayIST;
    }

    const selectedDate = datePicker ? datePicker.value : '';

    try {
        const res = await fetch(`/api/admin/voice-monitor/logs?date=${encodeURIComponent(selectedDate)}`, {
            headers: { 'X-Admin-Key': currentAdminKey }
        });
        const data = await res.json();

        if (data.success) {
            const stats = data.stats || {};
            const elMembers = document.getElementById('vc-stat-members');
            const elTime = document.getElementById('vc-stat-time');
            const elSessions = document.getElementById('vc-stat-sessions');
            const elLive = document.getElementById('vc-stat-live');

            if (elMembers) elMembers.innerText = stats.activeMembersCount || 0;
            if (elTime) elTime.innerText = formatSecondsToReadable(stats.totalVoiceSeconds || 0);
            if (elSessions) elSessions.innerText = stats.totalSessionsCount || 0;
            if (elLive) elLive.innerText = stats.liveConnectedCount || 0;

            const members = data.memberSummary || [];
            if (pillsContainer) {
                if (members.length === 0) {
                    pillsContainer.innerHTML = `<span style="font-size: 12px; color: var(--text-muted);">No voice members recorded for ${data.date}.</span>`;
                } else {
                    pillsContainer.innerHTML = members.map((m, idx) => `
                        <div style="background: rgba(255,255,255,0.06); border: 1px solid rgba(0,242,254,0.3); border-radius: 20px; padding: 4px 12px; font-size: 12px; display: flex; align-items: center; gap: 6px;">
                            <strong style="color: #00f2fe;">#${idx + 1} ${escapeHtml(m.username)}</strong>
                            <span style="color: var(--text-muted); font-size: 11px;">(${formatSecondsToReadable(m.totalSeconds)} • ${m.sessionCount} sessions)</span>
                        </div>
                    `).join('');
                }
            }

            const sessions = data.sessions || [];
            if (sessions.length === 0) {
                logsContainer.innerHTML = `<div style="text-align: center; padding: 24px; color: var(--text-muted);">No voice activity sessions logged on ${data.date}.</div>`;
                return;
            }

            const rowsHtml = sessions.map(s => {
                const joinStr = formatIsoToISTTime(s.joinTime);
                const leaveStr = s.isLive ? '🟢 Connected Live' : (s.leaveTime ? formatIsoToISTTime(s.leaveTime) : 'N/A');
                const durStr = formatSecondsToReadable(s.durationSeconds);
                const statusBadge = s.isLive 
                    ? `<span class="tag" style="background: rgba(46,204,113,0.2); color: #2ecc71; border: 1px solid #2ecc71;">LIVE</span>`
                    : `<span class="tag" style="background: rgba(255,255,255,0.1); color: var(--text-muted);">COMPLETED</span>`;

                return `
                    <tr style="border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 13px;">
                        <td style="padding: 10px; font-weight: 600; color: #fff;">
                            <i class="fa-solid fa-user-astronaut cyan-text"></i> ${escapeHtml(s.username)}
                            <div style="font-size: 10px; color: var(--text-muted); font-family: monospace;">ID: ${s.discordUserId}</div>
                        </td>
                        <td style="padding: 10px; color: #e0e0e0; font-family: 'Fira Code', monospace; font-size: 12px;">${joinStr}</td>
                        <td style="padding: 10px; color: ${s.isLive ? '#2ecc71' : '#e0e0e0'}; font-family: 'Fira Code', monospace; font-size: 12px;">${leaveStr}</td>
                        <td style="padding: 10px; font-weight: 600; color: #f1c40f; font-family: 'Fira Code', monospace;">${durStr}</td>
                        <td style="padding: 10px;">${statusBadge}</td>
                    </tr>
                `;
            }).join('');

            logsContainer.innerHTML = `
                <table style="width: 100%; border-collapse: collapse; text-align: left;">
                    <thead>
                        <tr style="border-bottom: 1px solid rgba(255,255,255,0.15); font-size: 11px; text-transform: uppercase; color: var(--text-muted);">
                            <th style="padding: 8px 10px;">Member</th>
                            <th style="padding: 8px 10px;">Join Time (IST)</th>
                            <th style="padding: 8px 10px;">Leave Time (IST)</th>
                            <th style="padding: 8px 10px;">Duration</th>
                            <th style="padding: 8px 10px;">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rowsHtml}
                    </tbody>
                </table>
            `;
        } else {
            logsContainer.innerHTML = `<div style="color: #e74c3c;">Failed to load logs: ${data.error || 'Unknown error'}</div>`;
        }
    } catch (err) {
        logsContainer.innerHTML = `<div style="color: #e74c3c;">Error fetching voice logs: ${err.message}</div>`;
    }
}

function formatSecondsToReadable(totalSec) {
    if (!totalSec || totalSec <= 0) return '0m';
    const hrs = Math.floor(totalSec / 3600);
    const mins = Math.floor((totalSec % 3600) / 60);
    const secs = totalSec % 60;
    if (hrs > 0) return `${hrs}h ${mins}m`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
}

function formatIsoToISTTime(isoStr) {
    if (!isoStr) return 'N/A';
    try {
        const d = new Date(isoStr);
        return d.toLocaleTimeString('en-US', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch (e) {
        return isoStr;
    }
}
