const express = require('express');
const path    = require('path');
const fs      = require('fs');
const fsp     = require('fs').promises;
const router  = express.Router();

const QUESTIONS_FILE = path.join(__dirname, 'public', 'pytania.json');
const JOKES_FILE     = path.join(__dirname, 'public', 'zarty.json');
const CALENDAR_FILE  = path.join(__dirname, 'public', 'daily-challenges.json');
const RESULTS_FILE   = process.env.RODZINIADA_SOLO_RESULTS_FILE || path.join(__dirname, 'data', 'solo-results.json');
const EDITOR_PIN     = process.env.EDITOR_PIN || '2509';
const SUPABASE_URL   = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY   = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_RESULTS_TABLE = process.env.SUPABASE_RESULTS_TABLE || 'rodziniada_solo_results';
const ANSWERS_COUNT  = 6;
const MAX_MISSES     = 3;
const START_CHALLENGE = new Date(2026, 6, 1);

function normalizeDateKey(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return null;
    }

    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    const valid = date.getFullYear() === year
        && date.getMonth() === month - 1
        && date.getDate() === day;

    return valid ? value : null;
}

function todayKey(date = new Date()) {
    const parts = new Intl.DateTimeFormat('pl-PL', {
        timeZone: 'Europe/Warsaw',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date);
    const part = type => parts.find(item => item.type === type)?.value;

    return [part('year'), part('month'), part('day')].join('-');
}

function dateFromKey(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day);
}

function challengeNumber(key) {
    const diff = Math.floor((dateFromKey(key) - START_CHALLENGE) / 86400000) + 1;
    return Math.max(1, diff);
}

function sanitizeNickname(value) {
    const nickname = String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 24);

    return nickname.length >= 2 ? nickname : null;
}

function sanitizePlayerId(value) {
    const playerId = String(value || '').trim();
    return /^[a-zA-Z0-9_-]{8,64}$/.test(playerId) ? playerId : null;
}

function flattenQuestions(data) {
    return (data.categories || []).flatMap(category => {
        return (category.questions || []).map(question => ({
            id: question.id,
            text: question.text,
            answers: [...(question.answers || [])]
                .sort((a, b) => Number(b.points || 0) - Number(a.points || 0))
                .slice(0, ANSWERS_COUNT)
        }));
    }).filter(question => question.id && question.answers.length > 0);
}

async function readJsonFile(filePath, fallback) {
    try {
        if (!fs.existsSync(filePath)) return fallback;
        const fileData = await fsp.readFile(filePath, 'utf8');
        return JSON.parse(fileData);
    } catch {
        return fallback;
    }
}

async function writeJsonFile(filePath, data) {
    await fsp.mkdir(path.dirname(filePath), { recursive: true });
    const tempFile = filePath + '.tmp';
    await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
    await fsp.rename(tempFile, filePath);
}

async function getSoloQuestionForDate(key) {
    const [questionsData, calendarData] = await Promise.all([
        readJsonFile(QUESTIONS_FILE, { categories: [] }),
        readJsonFile(CALENDAR_FILE, { startDate: '2026-07-01', days: [] })
    ]);
    const questions = flattenQuestions(questionsData);
    if (!questions.length) return null;

    const date = dateFromKey(key);
    const isJuly2026 = date.getFullYear() === 2026 && date.getMonth() === 6 && date.getDate() >= 1 && date.getDate() <= 31;

    if (isJuly2026 && Array.isArray(calendarData.days)) {
        const scheduledId = calendarData.days[date.getDate() - 1];
        const scheduledQuestion = questions.find(question => question.id === scheduledId);
        if (scheduledQuestion) return scheduledQuestion;
    }

    return questions[(challengeNumber(key) - 1) % questions.length];
}

function publicRankingEntry(entry, place) {
    return {
        place,
        nickname: entry.nickname,
        score: entry.score,
        maxScore: entry.maxScore,
        misses: entry.misses,
        revealedCount: Array.isArray(entry.revealed) ? entry.revealed.length : 0,
        submittedAt: entry.submittedAt
    };
}

function sortRanking(entries) {
    return entries.sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        if (a.misses !== b.misses) return a.misses - b.misses;
        return String(a.submittedAt).localeCompare(String(b.submittedAt));
    });
}

function supabaseEnabled() {
    return Boolean(SUPABASE_URL && SUPABASE_KEY);
}

function supabaseHeaders(extra = {}) {
    return {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        ...extra
    };
}

async function supabaseRequest(pathname, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
        ...options,
        headers: supabaseHeaders(options.headers || {})
    });
    const text = await response.text();

    if (!response.ok) {
        const error = new Error(`Supabase request failed ${response.status}: ${text}`);
        error.status = response.status;
        error.body = text;
        throw error;
    }

    return text ? JSON.parse(text) : null;
}

function readPin(req) {
    return req.headers['x-pin'] || req.body?.pin || req.query?.pin;
}

function resultToSupabaseRow(entry) {
    return {
        challenge_key: entry.challengeKey,
        challenge_number: entry.challengeNumber,
        player_id: entry.playerId,
        nickname: entry.nickname,
        score: entry.score,
        max_score: entry.maxScore,
        misses: entry.misses,
        revealed: entry.revealed,
        submitted_at: entry.submittedAt,
        updated_at: entry.updatedAt || entry.submittedAt
    };
}

function supabaseRowToResult(row) {
    return {
        challengeKey: String(row.challenge_key).slice(0, 10),
        challengeNumber: row.challenge_number,
        playerId: row.player_id,
        nickname: row.nickname,
        score: row.score,
        maxScore: row.max_score,
        misses: row.misses,
        revealed: Array.isArray(row.revealed) ? row.revealed : [],
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at
    };
}

async function getRankingEntries(challengeKey, limit) {
    if (supabaseEnabled()) {
        const query = [
            `challenge_key=eq.${encodeURIComponent(challengeKey)}`,
            'select=nickname,score,max_score,misses,revealed,submitted_at,updated_at',
            'order=score.desc,misses.asc,submitted_at.asc',
            `limit=${limit}`
        ].join('&');
        const rows = await supabaseRequest(`${SUPABASE_RESULTS_TABLE}?${query}`);
        return (rows || []).map(supabaseRowToResult);
    }

    const data = await readJsonFile(RESULTS_FILE, { results: [] });
    const entries = Array.isArray(data.results) ? data.results : [];
    return sortRanking(entries.filter(entry => entry.challengeKey === challengeKey)).slice(0, limit);
}

async function findSavedResult(challengeKey, playerId) {
    if (supabaseEnabled()) {
        const query = [
            `challenge_key=eq.${encodeURIComponent(challengeKey)}`,
            `player_id=eq.${encodeURIComponent(playerId)}`,
            'select=*',
            'limit=1'
        ].join('&');
        const rows = await supabaseRequest(`${SUPABASE_RESULTS_TABLE}?${query}`);
        return rows?.[0] ? supabaseRowToResult(rows[0]) : null;
    }

    const data = await readJsonFile(RESULTS_FILE, { results: [] });
    const results = Array.isArray(data.results) ? data.results : [];
    return results.find(result => result.challengeKey === challengeKey && result.playerId === playerId) || null;
}

async function saveResultEntry(entry) {
    const existing = await findSavedResult(entry.challengeKey, entry.playerId);
    const shouldReplace = !existing
        || entry.score > existing.score
        || (entry.score === existing.score && entry.misses < existing.misses);

    if (supabaseEnabled()) {
        if (existing) {
            const patch = shouldReplace
                ? resultToSupabaseRow(entry)
                : { nickname: entry.nickname, updated_at: entry.updatedAt };
            const query = [
                `challenge_key=eq.${encodeURIComponent(entry.challengeKey)}`,
                `player_id=eq.${encodeURIComponent(entry.playerId)}`
            ].join('&');

            await supabaseRequest(`${SUPABASE_RESULTS_TABLE}?${query}`, {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(patch)
            });
        } else {
            await supabaseRequest(SUPABASE_RESULTS_TABLE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Prefer: 'return=minimal'
                },
                body: JSON.stringify(resultToSupabaseRow(entry))
            });
        }

        return shouldReplace ? entry : existing;
    }

    const data = await readJsonFile(RESULTS_FILE, { results: [] });
    const results = Array.isArray(data.results) ? data.results : [];
    const existingIndex = results.findIndex(result => result.challengeKey === entry.challengeKey && result.playerId === entry.playerId);

    if (existingIndex >= 0) {
        results[existingIndex] = shouldReplace
            ? entry
            : { ...results[existingIndex], nickname: entry.nickname, updatedAt: entry.updatedAt };
    } else {
        results.push(entry);
    }

    await writeJsonFile(RESULTS_FILE, { results });
    return shouldReplace ? entry : existing;
}

// Pliki statyczne Rodziniady
router.use(express.static(path.join(__dirname, 'public')));

// Panel hosta (Lobby)
router.get('/', (req, res) => {
    res.redirect('/rodziniada/solo');
});

// Panel hosta - gra lokalna
router.get('/local', (req, res) => {
    res.redirect('/w-przygotowaniu?game=rodziniada&mode=local');
});

// Gra solo - osobny wariant przygotowany pod dedykowany ekran
router.get('/solo', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'RodziniadaSolo.html'));
});

// Panel hosta - gra online
router.get('/online', (req, res) => {
    res.redirect('/w-przygotowaniu?game=rodziniada&mode=online');
});

// Przyjazne przekierowania
router.get('/rodziniadaLocal', (req, res) => {
    res.redirect('/rodziniada/local');
});
router.get('/rodziniadaOnline', (req, res) => {
    res.redirect('/rodziniada/online');
});

// Ekran TV
router.get('/tv', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'RodziniadaTV.html'));
});

// Edytor
router.get('/edytor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'edytor.html'));
});

// Panel admina Rodziniady Solo
router.get('/solo/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

router.get('/admin', (req, res) => {
    res.redirect('/rodziniada/solo/admin');
});

// ===== API PYTAŃ =====
router.get('/api/questions', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
        if (!fs.existsSync(QUESTIONS_FILE)) {
            return res.json({ 
                categories: [], 
                debug: { error: 'File not found', path: QUESTIONS_FILE, dirname: __dirname }
            });
        }
        const fileData = await fsp.readFile(QUESTIONS_FILE, 'utf8');
        const data = JSON.parse(fileData);
        res.json(data);
    } catch(e) {
        res.json({ 
            categories: [], 
            debug: { error: 'Parse error', message: e.message, path: QUESTIONS_FILE }
        });
    }
});

router.post('/api/questions', async (req, res) => {
    const data = req.body;
    const providedPin = req.headers['x-pin'];
    
    if (providedPin !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji (nieprawidłowy PIN)' });
    }
    
    if (!data || !Array.isArray(data.categories)) {
        return res.status(400).json({ error: 'Nieprawidlowy format' });
    }
    try {
        if (fs.existsSync(QUESTIONS_FILE)) {
            await fsp.copyFile(QUESTIONS_FILE, QUESTIONS_FILE + '.backup');
        }
        
        const tempFile = QUESTIONS_FILE + '.tmp';
        await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
        await fsp.rename(tempFile, QUESTIONS_FILE);
        
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: 'Blad zapisu' });
    }
});

// ===== API KALENDARZA SOLO =====
router.get('/api/solo-calendar', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
        if (!fs.existsSync(CALENDAR_FILE)) {
            return res.json({ startDate: '2026-07-01', days: [] });
        }
        const fileData = await fsp.readFile(CALENDAR_FILE, 'utf8');
        res.json(JSON.parse(fileData));
    } catch(e) {
        res.status(500).json({ error: 'Blad odczytu kalendarza' });
    }
});

router.post('/api/solo-calendar', async (req, res) => {
    const data = req.body;
    const providedPin = req.headers['x-pin'];

    if (providedPin !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji (nieprawidlowy PIN)' });
    }

    if (!data || typeof data.startDate !== 'string' || !Array.isArray(data.days)) {
        return res.status(400).json({ error: 'Nieprawidlowy format kalendarza' });
    }

    try {
        if (fs.existsSync(CALENDAR_FILE)) {
            await fsp.copyFile(CALENDAR_FILE, CALENDAR_FILE + '.backup');
        }

        const tempFile = CALENDAR_FILE + '.tmp';
        await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
        await fsp.rename(tempFile, CALENDAR_FILE);

        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: 'Blad zapisu kalendarza' });
    }
});

// ===== API WYNIKOW SOLO =====
router.get('/api/solo-ranking', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');

    const challengeKey = normalizeDateKey(req.query.date) || todayKey();
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 50);

    try {
        const ranking = (await getRankingEntries(challengeKey, limit))
            .map((entry, index) => publicRankingEntry(entry, index + 1));

        res.json({
            challengeKey,
            challengeNumber: challengeNumber(challengeKey),
            ranking
        });
    } catch(e) {
        res.status(500).json({ error: 'Blad odczytu rankingu' });
    }
});

router.post('/api/solo-storage-status', async (req, res) => {
    if (readPin(req) !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }

    const status = {
        mode: supabaseEnabled() ? 'supabase' : 'file',
        supabase: {
            hasUrl: Boolean(SUPABASE_URL),
            hasKey: Boolean(SUPABASE_KEY),
            table: SUPABASE_RESULTS_TABLE
        }
    };

    if (!supabaseEnabled()) {
        return res.json({
            ok: true,
            ...status,
            file: {
                path: RESULTS_FILE,
                exists: fs.existsSync(RESULTS_FILE)
            }
        });
    }

    try {
        await supabaseRequest(`${SUPABASE_RESULTS_TABLE}?select=id&limit=1`);
        res.json({
            ok: true,
            ...status,
            check: 'Supabase table is reachable'
        });
    } catch(e) {
        res.status(500).json({
            ok: false,
            ...status,
            supabaseError: {
                status: e.status || null,
                message: e.message,
                body: e.body || null
            }
        });
    }
});

router.post('/api/solo-results', async (req, res) => {
    const challengeKey = normalizeDateKey(req.body.challengeKey);
    const playerId = sanitizePlayerId(req.body.playerId);
    const nickname = sanitizeNickname(req.body.nickname);
    const misses = Number(req.body.misses);
    const revealed = Array.isArray(req.body.revealed)
        ? [...new Set(req.body.revealed.map(Number))]
            .filter(index => Number.isInteger(index) && index >= 0 && index < ANSWERS_COUNT)
        : [];

    if (!challengeKey || !playerId || !nickname || !Number.isInteger(misses) || misses < 0 || misses > MAX_MISSES) {
        return res.status(400).json({ error: 'Nieprawidlowy wynik' });
    }

    if (challengeKey !== todayKey()) {
        return res.status(400).json({ error: 'Ranking przyjmuje tylko dzisiejsze wyzwanie' });
    }

    try {
        const question = await getSoloQuestionForDate(challengeKey);
        if (!question) {
            return res.status(404).json({ error: 'Brak pytania dla tego dnia' });
        }

        const score = revealed.reduce((sum, index) => {
            return sum + Number(question.answers[index]?.points || 0);
        }, 0);
        const maxScore = question.answers.reduce((sum, answer) => sum + Number(answer.points || 0), 0);
        const now = new Date().toISOString();
        const entry = {
            challengeKey,
            challengeNumber: challengeNumber(challengeKey),
            playerId,
            nickname,
            score,
            maxScore,
            misses,
            revealed,
            submittedAt: now,
            updatedAt: now
        };

        const savedEntry = await saveResultEntry(entry);
        const ranking = (await getRankingEntries(challengeKey, 10))
            .map((result, index) => publicRankingEntry(result, index + 1));

        res.json({
            ok: true,
            result: publicRankingEntry(savedEntry || entry, null),
            ranking
        });
    } catch(e) {
        console.error('Solo result save failed:', e);
        res.status(500).json({ error: 'Blad zapisu wyniku' });
    }
});

// ===== API ZARTOW =====
router.get('/api/jokes', async (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    try {
        if (!fs.existsSync(JOKES_FILE)) {
            return res.json({ 
                jokes: [], 
                debug: { error: 'File not found', path: JOKES_FILE, dirname: __dirname }
            });
        }
        const fileData = await fsp.readFile(JOKES_FILE, 'utf8');
        const data = JSON.parse(fileData);
        res.json(data);
    } catch(e) {
        res.json({ 
            jokes: [], 
            debug: { error: 'Parse error', message: e.message, path: JOKES_FILE }
        });
    }
});

router.post('/api/jokes', async (req, res) => {
    const data = req.body;
    const providedPin = req.headers['x-pin'];
    
    if (providedPin !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji (nieprawidłowy PIN)' });
    }
    
    if (!data || !Array.isArray(data.jokes)) {
        return res.status(400).json({ error: 'Nieprawidlowy format' });
    }
    try {
        if (fs.existsSync(JOKES_FILE)) {
            await fsp.copyFile(JOKES_FILE, JOKES_FILE + '.backup');
        }
        
        const tempFile = JOKES_FILE + '.tmp';
        await fsp.writeFile(tempFile, JSON.stringify(data, null, 2), 'utf8');
        await fsp.rename(tempFile, JOKES_FILE);
        
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: 'Blad zapisu' });
    }
});

router.post('/api/verify-pin', (req, res) => {
    res.json({ ok: req.body.pin === EDITOR_PIN });
});

module.exports = router;
