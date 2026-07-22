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
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_RESULTS_TABLE = process.env.SUPABASE_RESULTS_TABLE || 'rodziniada_solo_results';
const ANSWERS_COUNT  = 6;
const MAX_MISSES     = 3;
const START_CHALLENGE_KEY = '2026-07-19';
const START_CHALLENGE = new Date(2026, 6, 19);
const RESULTS_EPOCH_ISO = '2026-07-19T17:51:01.858Z';
const SOLO_STATES_METADATA_KEY = 'rodziniadaSoloStatesV2';

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

function challengeOffsetFromStart(startDate, key) {
    const startKey = normalizeDateKey(startDate);
    if (!startKey || !normalizeDateKey(key)) return -1;

    return Math.floor((dateFromKey(key) - dateFromKey(startKey)) / 86400000);
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

function nicknameFromEmail(email) {
    return String(email || '').split('@')[0] || 'Tester';
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
        readJsonFile(CALENDAR_FILE, { startDate: START_CHALLENGE_KEY, days: [] })
    ]);
    const questions = flattenQuestions(questionsData);
    if (!questions.length) return null;

    const scheduledIndex = challengeOffsetFromStart(calendarData.startDate, key);
    if (scheduledIndex >= 0 && Array.isArray(calendarData.days)) {
        const scheduledId = calendarData.days[scheduledIndex];
        const scheduledQuestion = questions.find(question => question.id === scheduledId);
        if (scheduledQuestion) return scheduledQuestion;
    }

    return questions[(challengeNumber(key) - 1) % questions.length];
}

function publicRankingEntry(entry, place) {
    return {
        place,
        userId: entry.userId,
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
        return String(a.submittedAt).localeCompare(String(b.submittedAt));
    });
}

function withCompetitionPlaces(entries) {
    let currentPlace = 0;
    let previousScore = null;

    return entries.map((entry, index) => {
        const score = Number(entry.score || 0);
        if (previousScore === null || score !== previousScore) {
            currentPlace = index + 1;
            previousScore = score;
        }

        return { ...entry, place: currentPlace };
    });
}

function startOfWeekKey(key) {
    const date = dateFromKey(key);
    const day = (date.getDay() + 6) % 7;
    date.setDate(date.getDate() - day);
    return todayKey(date);
}

function endOfWeekKey(key) {
    const date = dateFromKey(startOfWeekKey(key));
    date.setDate(date.getDate() + 6);
    return todayKey(date);
}

function startOfMonthKey(key) {
    const date = dateFromKey(key);
    return todayKey(new Date(date.getFullYear(), date.getMonth(), 1));
}

function endOfMonthKey(key) {
    const date = dateFromKey(key);
    return todayKey(new Date(date.getFullYear(), date.getMonth() + 1, 0));
}

function rankingRange(scope, key) {
    const challengeKey = normalizeDateKey(key) || todayKey();
    if (scope === 'day') {
        return { from: challengeKey, to: challengeKey };
    }
    if (scope === 'week') {
        return { from: startOfWeekKey(challengeKey), to: endOfWeekKey(challengeKey) };
    }
    if (scope === 'month') {
        return { from: startOfMonthKey(challengeKey), to: endOfMonthKey(challengeKey) };
    }

    return { from: null, to: null };
}

function isBetterResult(next, current) {
    if (!current) return true;
    if (Number(next.score || 0) !== Number(current.score || 0)) {
        return Number(next.score || 0) > Number(current.score || 0);
    }
    return String(next.updatedAt || next.submittedAt || '').localeCompare(String(current.updatedAt || current.submittedAt || '')) > 0;
}

function bestResultsByPlayerChallenge(entries, profilesById) {
    const bestEntries = new Map();

    entries.forEach(entry => {
        const playerKey = entry.userId;
        const profile = profilesById.get(playerKey);
        if (!playerKey || !profile || !entry.challengeKey) return;

        const key = `${playerKey}:${entry.challengeKey}`;
        if (isBetterResult(entry, bestEntries.get(key))) {
            bestEntries.set(key, entry);
        }
    });

    return [...bestEntries.values()];
}

function aggregateAllTimeRanking(entries, profilesById = new Map()) {
    const players = new Map();

    profilesById.forEach((profile, userId) => {
        players.set(userId, {
            userId,
            nickname: profile.nickname,
            score: 0,
            maxScore: 0,
            revealed: [],
            submittedAt: '',
            updatedAt: '',
            challenges: 0
        });
    });

    bestResultsByPlayerChallenge(entries, profilesById).forEach(entry => {
        const playerKey = entry.userId;
        const profile = profilesById.get(playerKey);

        const current = players.get(playerKey) || {
            nickname: profile.nickname || entry.nickname,
            score: 0,
            maxScore: 0,
            revealed: [],
            submittedAt: entry.submittedAt,
            updatedAt: entry.updatedAt,
            challenges: 0
        };

        current.nickname = profile.nickname || current.nickname;
        current.score += Number(entry.score || 0);
        current.maxScore += Number(entry.maxScore || 0);
        current.challenges += 1;
        current.submittedAt = String(current.submittedAt || '').localeCompare(String(entry.submittedAt || '')) <= 0
            ? current.submittedAt
            : entry.submittedAt;
        current.updatedAt = String(current.updatedAt || '').localeCompare(String(entry.updatedAt || '')) >= 0
            ? current.updatedAt
            : entry.updatedAt;
        players.set(playerKey, current);
    });

    return [...players.values()]
        .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            return String(a.nickname).localeCompare(String(b.nickname), 'pl');
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

async function supabaseAuthAdminRequest(pathname, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
        ...options,
        headers: supabaseHeaders(options.headers || {})
    });
    const text = await response.text();

    if (!response.ok) {
        const error = new Error(`Supabase auth admin failed ${response.status}: ${text}`);
        error.status = response.status;
        error.body = text;
        throw error;
    }

    return text ? JSON.parse(text) : null;
}

async function supabaseRequestPages(pathname, pageSize = 1000, maxRows = 50000) {
    const rows = [];
    const separator = pathname.includes('?') ? '&' : '?';

    for (let offset = 0; offset < maxRows; offset += pageSize) {
        const page = await supabaseRequest(`${pathname}${separator}limit=${pageSize}&offset=${offset}`);
        if (!Array.isArray(page) || !page.length) break;

        rows.push(...page);
        if (page.length < pageSize) break;
    }

    return rows;
}

async function supabaseAuthUsersPages(pageSize = 1000, maxPages = 10) {
    const users = [];

    for (let page = 1; page <= maxPages; page += 1) {
        const data = await supabaseAuthAdminRequest(`admin/users?page=${page}&per_page=${pageSize}`);
        const pageUsers = Array.isArray(data?.users) ? data.users : [];
        if (!pageUsers.length) break;

        users.push(...pageUsers);
        if (pageUsers.length < pageSize) break;
    }

    return users;
}

async function getAuthenticatedSupabaseUser(req) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) return null;

    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: {
            apikey: SUPABASE_KEY,
            Authorization: `Bearer ${token}`
        }
    });
    const text = await response.text();

    if (!response.ok) {
        const error = new Error(`Supabase auth failed ${response.status}: ${text}`);
        error.status = response.status;
        error.body = text;
        throw error;
    }

    return text ? JSON.parse(text) : null;
}

async function getSupabaseProfile(userId) {
    const query = [
        `id=eq.${encodeURIComponent(userId)}`,
        'select=nickname,role',
        'limit=1'
    ].join('&');
    const rows = await supabaseRequest(`profiles?${query}`);

    return rows?.[0] || null;
}

function isAllowedResultProfile(profile) {
    return Boolean(
        profile
        && sanitizeNickname(profile.nickname)
        && ['admin', 'tester', 'player'].includes(profile.role)
    );
}

function rankingProfileFromAuthUser(user, profile = {}) {
    const metadata = readUserMetadata(user);
    const metadataRole = ['admin', 'tester', 'player'].includes(metadata.role) ? metadata.role : null;
    const profileRole = ['admin', 'tester', 'player'].includes(profile.role) ? profile.role : null;
    const nickname = sanitizeNickname(profile.nickname)
        || sanitizeNickname(metadata.nickname)
        || sanitizeNickname(nicknameFromEmail(user.email))
        || 'Tester';

    return {
        id: user.id,
        nickname,
        role: profileRole || metadataRole || 'tester'
    };
}

function readUserMetadata(user) {
    return user?.user_metadata && typeof user.user_metadata === 'object'
        ? user.user_metadata
        : {};
}

function readSoloStates(user) {
    const metadata = readUserMetadata(user);
    const states = metadata.grajmytv?.[SOLO_STATES_METADATA_KEY];

    return states && typeof states === 'object' ? states : {};
}

function sanitizeSoloState(data = {}) {
    const challengeKey = normalizeDateKey(data.challengeKey);
    const status = data.status === 'completed' ? 'completed' : 'progress';
    const score = Math.max(0, Number(data.score) || 0);
    const maxScore = Math.max(0, Number(data.maxScore) || 0);
    const misses = Math.min(MAX_MISSES, Math.max(0, Number(data.misses) || 0));
    const revealed = Array.isArray(data.revealed)
        ? [...new Set(data.revealed.map(Number))]
            .filter(index => Number.isInteger(index) && index >= 0 && index < ANSWERS_COUNT)
        : [];
    const guesses = Array.isArray(data.guesses)
        ? data.guesses
            .map(value => String(value || '').replace(/[<>]/g, '').trim().slice(0, 80))
            .filter(Boolean)
            .slice(-60)
        : [];

    if (!challengeKey) return null;

    return {
        challengeKey,
        status,
        score,
        maxScore,
        misses,
        revealed,
        guesses,
        synced: Boolean(data.synced),
        completedAt: data.completedAt || null,
        updatedAt: new Date().toISOString()
    };
}

async function requireAllowedUser(req) {
    const user = await getAuthenticatedSupabaseUser(req);
    if (!user?.id) {
        const error = new Error('Brak sesji');
        error.status = 401;
        throw error;
    }

    const profile = await getSupabaseProfile(user.id);
    if (!isAllowedResultProfile(profile)) {
        const error = new Error('Brak uprawnien');
        error.status = 403;
        throw error;
    }

    return { user, profile };
}

async function saveSoloStateForUser(user, nextState) {
    const metadata = readUserMetadata(user);
    const states = {
        ...readSoloStates(user),
        [nextState.challengeKey]: nextState
    };
    const sortedKeys = Object.keys(states).sort();
    while (sortedKeys.length > 120) {
        delete states[sortedKeys.shift()];
    }

    await supabaseAuthAdminRequest(`admin/users/${encodeURIComponent(user.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            user_metadata: {
                ...metadata,
                grajmytv: {
                    ...(metadata.grajmytv || {}),
                    [SOLO_STATES_METADATA_KEY]: states
                }
            }
        })
    });

    return states[nextState.challengeKey];
}

function readPin(req) {
    return req.headers['x-pin'] || req.body?.pin || req.query?.pin;
}

function resultToSupabaseRow(entry) {
    return {
        challenge_key: entry.challengeKey,
        challenge_number: entry.challengeNumber,
        player_id: entry.playerId,
        user_id: entry.userId || null,
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
        userId: row.user_id,
        nickname: row.nickname,
        score: row.score,
        maxScore: row.max_score,
        misses: row.misses,
        revealed: Array.isArray(row.revealed) ? row.revealed : [],
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at
    };
}

function isBeforeResultsEpoch(entry) {
    return String(entry?.submittedAt || '').localeCompare(RESULTS_EPOCH_ISO) < 0;
}

async function getRankingEntries(limit, scope = 'day', challengeKey = todayKey(), viewerUserId = null) {
    if (supabaseEnabled()) {
        const safeScope = ['day', 'week', 'month', 'all'].includes(scope) ? scope : 'day';
        const range = rankingRange(safeScope, challengeKey);
        const filters = [
            'select=nickname,player_id,user_id,score,max_score,misses,revealed,submitted_at,updated_at,challenge_key',
            'user_id=not.is.null',
            `submitted_at=gte.${encodeURIComponent(RESULTS_EPOCH_ISO)}`,
            'order=challenge_key.asc,user_id.asc,submitted_at.asc'
        ];
        if (range.from) filters.push(`challenge_key=gte.${encodeURIComponent(range.from)}`);
        if (range.to) filters.push(`challenge_key=lte.${encodeURIComponent(range.to)}`);

        const [rows, profiles, authUsers] = await Promise.all([
            supabaseRequestPages(`${SUPABASE_RESULTS_TABLE}?${filters.join('&')}`),
            supabaseRequestPages('profiles?select=id,nickname,role'),
            supabaseAuthUsersPages()
        ]);
        const profilesFromTable = new Map((profiles || []).map(profile => [profile.id, profile]));
        const profilesById = new Map();

        authUsers.forEach(user => {
            if (!user?.id) return;

            const profile = rankingProfileFromAuthUser(user, profilesFromTable.get(user.id));
            if (isAllowedResultProfile(profile)) {
                profilesById.set(user.id, profile);
            }
        });

        const fullRanking = withCompetitionPlaces(aggregateAllTimeRanking((rows || []).map(supabaseRowToResult), profilesById));
        const viewerIndex = viewerUserId
            ? fullRanking.findIndex(entry => entry.userId === viewerUserId)
            : -1;
        const viewerEntry = viewerIndex >= 5
            ? fullRanking[viewerIndex]
            : null;

        return {
            entries: fullRanking.slice(0, limit),
            viewerEntry
        };
    }

    return { entries: [], viewerEntry: null };
}

async function findSavedResult(challengeKey, playerId, userId = null) {
    if (supabaseEnabled()) {
        if (userId) {
            const userQuery = [
                `challenge_key=eq.${encodeURIComponent(challengeKey)}`,
                `user_id=eq.${encodeURIComponent(userId)}`,
                'select=*',
                'limit=1'
            ].join('&');
            const userRows = await supabaseRequest(`${SUPABASE_RESULTS_TABLE}?${userQuery}`);
            if (userRows?.[0]) return supabaseRowToResult(userRows[0]);
        }

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
    const existing = await findSavedResult(entry.challengeKey, entry.playerId, entry.userId);
    const shouldReplace = !existing
        || isBeforeResultsEpoch(existing)
        || entry.score > existing.score
        || (entry.score === existing.score && entry.misses < existing.misses);

    if (supabaseEnabled()) {
        if (existing) {
            const patch = shouldReplace
                ? resultToSupabaseRow(entry)
                : { nickname: entry.nickname, updated_at: entry.updatedAt };
            const query = [
                `challenge_key=eq.${encodeURIComponent(entry.challengeKey)}`,
                existing.userId
                    ? `user_id=eq.${encodeURIComponent(existing.userId)}`
                    : `player_id=eq.${encodeURIComponent(entry.playerId)}`
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
            return res.json({ startDate: START_CHALLENGE_KEY, days: [] });
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

    const limit = Math.min(Math.max(Number(req.query.limit) || 1000, 1), 1000);
    const scope = ['day', 'week', 'month', 'all'].includes(req.query.scope) ? req.query.scope : 'day';
    const challengeKey = normalizeDateKey(req.query.challengeKey) || todayKey();

    try {
        let viewerUserId = null;
        try {
            const viewer = await getAuthenticatedSupabaseUser(req);
            const viewerProfile = viewer?.id ? await getSupabaseProfile(viewer.id) : null;
            if (isAllowedResultProfile(viewerProfile)) {
                viewerUserId = viewer.id;
            }
        } catch {
            viewerUserId = null;
        }

        const rankingData = await getRankingEntries(limit, scope, challengeKey, viewerUserId);
        const ranking = rankingData.entries
            .map(entry => publicRankingEntry(entry, entry.place));
        const viewerRank = rankingData.viewerEntry
            ? publicRankingEntry(rankingData.viewerEntry, rankingData.viewerEntry.place)
            : null;

        res.json({
            mode: scope,
            challengeKey,
            ranking,
            viewerRank
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
            hasAnonKey: Boolean(SUPABASE_ANON_KEY),
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

router.get('/api/solo-state', async (req, res) => {
    const requestedChallenge = typeof req.query.challengeKey === 'string' && req.query.challengeKey.trim();
    const challengeKey = requestedChallenge ? normalizeDateKey(req.query.challengeKey) : null;
    if (requestedChallenge && !challengeKey) {
        return res.status(400).json({ error: 'Nieprawidlowy dzien wyzwania' });
    }

    try {
        const { user } = await requireAllowedUser(req);
        const states = readSoloStates(user);
        if (!challengeKey) {
            return res.json({ ok: true, states });
        }

        res.json({ ok: true, state: states[challengeKey] || null });
    } catch(e) {
        res.status(e.status || 401).json({ error: e.status === 403 ? 'Brak dostepu' : 'Zaloguj sie, aby wczytac status gry' });
    }
});

router.post('/api/solo-state', async (req, res) => {
    const nextState = sanitizeSoloState(req.body || {});
    if (!nextState) {
        return res.status(400).json({ error: 'Nieprawidlowy status gry' });
    }

    try {
        const { user } = await requireAllowedUser(req);
        const state = await saveSoloStateForUser(user, nextState);
        res.json({ ok: true, state });
    } catch(e) {
        res.status(e.status || 401).json({ error: e.status === 403 ? 'Brak dostepu' : 'Zaloguj sie, aby zapisac status gry' });
    }
});

router.post('/api/solo-results', async (req, res) => {
    const challengeKey = normalizeDateKey(req.body.challengeKey);
    let playerId = sanitizePlayerId(req.body.playerId);
    let userId = null;
    let nickname = sanitizeNickname(req.body.nickname);
    const misses = Number(req.body.misses);
    const revealed = Array.isArray(req.body.revealed)
        ? [...new Set(req.body.revealed.map(Number))]
            .filter(index => Number.isInteger(index) && index >= 0 && index < ANSWERS_COUNT)
        : [];
    let authenticatedUser = null;

    if (!supabaseEnabled()) {
        return res.status(503).json({ error: 'Zapisywanie wynikow wymaga aktywnego Supabase' });
    }

    try {
        const { user, profile } = await requireAllowedUser(req);

        authenticatedUser = user;
        userId = user.id;
        playerId = user.id;
        nickname = sanitizeNickname(profile.nickname);
    } catch(e) {
        return res.status(e.status || 401).json({
            error: e.status === 403
                ? 'Tylko konta testerow moga zapisywac wyniki'
                : 'Nieprawidlowa sesja logowania'
        });
    }

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
            userId,
            nickname,
            score,
            maxScore,
            misses,
            revealed,
            submittedAt: now,
            updatedAt: now
        };

        const savedEntry = await saveResultEntry(entry);
        await saveSoloStateForUser(authenticatedUser, {
            challengeKey: entry.challengeKey,
            status: 'completed',
            score: entry.score,
            maxScore: entry.maxScore,
            misses: entry.misses,
            revealed: entry.revealed,
            guesses: Array.isArray(req.body.guesses) ? req.body.guesses : [],
            synced: true,
            completedAt: entry.submittedAt,
            updatedAt: entry.updatedAt
        }).catch(() => null);
        const rankingData = await getRankingEntries(1000, 'day', entry.challengeKey, userId);
        const ranking = rankingData.entries
            .map(result => publicRankingEntry(result, result.place));
        const viewerRank = rankingData.viewerEntry
            ? publicRankingEntry(rankingData.viewerEntry, rankingData.viewerEntry.place)
            : null;

        res.json({
            ok: true,
            result: publicRankingEntry(savedEntry || entry, null),
            ranking,
            viewerRank
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
