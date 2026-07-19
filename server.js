require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const os         = require('os');
const qrcode     = require('qrcode-terminal');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server, {
    pingTimeout:  5000,   // 5s – czas oczekiwania na pong zanim uzna klienta za rozłączonego
    pingInterval: 3000,   // 3s – jak często serwer pinguje klientów
    transports: ['websocket'],  // wymuś WebSocket, bez fallbacku na polling
    upgradeTimeout: 3000,
});

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';
const EDITOR_PIN = process.env.EDITOR_PIN || '2509';
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SECRET_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '';
const SUPABASE_RESULTS_TABLE = process.env.SUPABASE_RESULTS_TABLE || 'rodziniada_solo_results';

// ===== KOLORY TERMINALA =====
const c = {
    reset:'\x1b[0m', bright:'\x1b[1m',
    red:'\x1b[31m', green:'\x1b[32m', yellow:'\x1b[33m',
    blue:'\x1b[34m', magenta:'\x1b[35m', cyan:'\x1b[36m',
    white:'\x1b[37m', gray:'\x1b[90m', bgBlue:'\x1b[44m',
};

function ts() {
    const n = new Date();
    return `${c.gray}[${String(n.getHours()).padStart(2,'0')}:${String(n.getMinutes()).padStart(2,'0')}:${String(n.getSeconds()).padStart(2,'0')}]${c.reset}`;
}
function log(color,l,m) { console.log(`${ts()} ${color}${c.bright}[${l}]${c.reset} ${m}`); }
function logInfo(l,m)    { log(c.cyan,l,m); }
function logSuccess(l,m) { log(c.green,l,m); }
function logWarn(l,m)    { log(c.yellow,l,m); }
function logError(l,m)   { log(c.red,l,m); }

function readPin(req) {
    return req.headers['x-pin'] || req.body?.pin || req.query?.pin;
}

function supabaseAdminEnabled() {
    return Boolean(SUPABASE_URL && SUPABASE_SECRET_KEY);
}

function supabaseAuthEnabled() {
    return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SECRET_KEY);
}

function supabaseAdminHeaders(extra = {}) {
    return {
        apikey: SUPABASE_SECRET_KEY,
        Authorization: `Bearer ${SUPABASE_SECRET_KEY}`,
        ...extra
    };
}

async function supabaseAuthAdminRequest(pathname, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
        ...options,
        headers: supabaseAdminHeaders(options.headers || {})
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

async function supabaseAuthPublicRequest(pathname, body = {}) {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/${pathname}`, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_ANON_KEY,
            Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
    });
    const text = await response.text();

    if (!response.ok) {
        const error = new Error(`Supabase auth public failed ${response.status}: ${text}`);
        error.status = response.status;
        error.body = text;
        throw error;
    }

    return text ? JSON.parse(text) : null;
}

async function supabaseRestAdminRequest(pathname, options = {}) {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/${pathname}`, {
        ...options,
        headers: supabaseAdminHeaders(options.headers || {})
    });
    const text = await response.text();

    if (!response.ok) {
        const error = new Error(`Supabase rest admin failed ${response.status}: ${text}`);
        error.status = response.status;
        error.body = text;
        throw error;
    }

    return text ? JSON.parse(text) : null;
}

function sanitizeAccountInput(data) {
    const password = String(data.password || '');
    const nickname = String(data.nickname || '')
        .replace(/\s+/g, ' ')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 24);
    const role = ['admin', 'tester', 'player'].includes(data.role) ? data.role : 'tester';

    if (password.length < 6) {
        return { error: 'Haslo musi miec minimum 6 znakow' };
    }
    if (nickname.length < 2) {
        return { error: 'Nick musi miec minimum 2 znaki' };
    }

    return { email: generatedAccountEmail(), password, nickname, role };
}

function generatedAccountEmail(domain = 'grajmytv.pl') {
    const suffix = Math.random().toString(36).slice(2, 10);
    const stamp = Date.now().toString(36);

    return `tester-${stamp}-${suffix}@${domain}`;
}

function publicAccount(user, profile = {}) {
    const metadata = user.user_metadata || {};
    const testerPassword = metadata.grajmytv?.testerPassword || metadata.testerPassword || null;

    return {
        id: user.id,
        email: user.email,
        nickname: profile.nickname || user.user_metadata?.nickname || String(user.email || '').split('@')[0],
        role: profile.role || user.user_metadata?.role || 'tester',
        password: testerPassword,
        confirmed: Boolean(user.email_confirmed_at || user.confirmed_at),
        lastSignInAt: user.last_sign_in_at || null,
        createdAt: user.created_at || null
    };
}

async function createSupabaseAccount(input, email = input.email) {
    const authData = await supabaseAuthAdminRequest('admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email,
            password: input.password,
            email_confirm: true,
            user_metadata: {
                nickname: input.nickname,
                role: input.role,
                grajmytv: {
                    testerPassword: input.password
                }
            }
        })
    });

    return {
        email,
        user: authData.user || authData.data?.user || authData
    };
}

function isSupabaseEmailError(error) {
    return /email/i.test(String(error?.body || error?.message || ''));
}

function sanitizeLoginIdentifier(value) {
    return String(value || '')
        .replace(/\s+/g, ' ')
        .replace(/[<>]/g, '')
        .trim()
        .slice(0, 64);
}

function createLoginError(message, status, code) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

async function emailForLoginIdentifier(identifier) {
    const cleanIdentifier = sanitizeLoginIdentifier(identifier);
    if (!cleanIdentifier) {
        throw createLoginError('Brak nazwy uzytkownika', 400, 'missing_identifier');
    }

    if (cleanIdentifier.includes('@')) {
        return cleanIdentifier.toLowerCase();
    }

    const query = [
        `nickname=ilike.${encodeURIComponent(cleanIdentifier)}`,
        'select=id',
        'limit=1'
    ].join('&');
    const profiles = await supabaseRestAdminRequest(`profiles?${query}`);
    const userId = profiles?.[0]?.id;
    if (!userId) {
        throw createLoginError('Nie znaleziono konta', 404, 'account_not_found');
    }

    const userData = await supabaseAuthAdminRequest(`admin/users/${encodeURIComponent(userId)}`);
    const account = userData.user || userData.data?.user || userData;
    if (!account?.email) {
        throw createLoginError('Nie znaleziono konta', 404, 'account_not_found');
    }

    return account.email;
}

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== STRONA GŁÓWNA =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/w-przygotowaniu', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'w-przygotowaniu.html'));
});

app.get('/regulamin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'regulamin.html'));
});

app.get('/polityka-prywatnosci', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'polityka-prywatnosci.html'));
});

app.get('/polityka-cookies', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'polityka-cookies.html'));
});

app.get('/konta', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'konta.html'));
});

app.get('/api/auth-config', (req, res) => {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.json({
        enabled: Boolean(SUPABASE_URL && SUPABASE_ANON_KEY),
        supabaseUrl: SUPABASE_URL,
        supabaseAnonKey: SUPABASE_ANON_KEY
    });
});

app.post('/api/auth/login', async (req, res) => {
    if (!supabaseAuthEnabled()) {
        return res.status(503).json({ error: 'Logowanie nie jest skonfigurowane' });
    }

    const identifier = sanitizeLoginIdentifier(req.body?.identifier || req.body?.username || req.body?.email);
    const password = String(req.body?.password || '');
    if (!identifier || !password) {
        return res.status(400).json({ error: 'Podaj nazwe uzytkownika i haslo' });
    }

    try {
        const email = await emailForLoginIdentifier(identifier);
        const session = await supabaseAuthPublicRequest('token?grant_type=password', {
            email,
            password
        });

        res.json(session);
    } catch(e) {
        const code = e.code || 'invalid_credentials';
        const status = code === 'account_not_found' ? 404 : code === 'missing_identifier' ? 400 : 401;
        const message = status === 404
            ? 'Nie znaleziono konta o takiej nazwie uzytkownika'
            : status === 400
                ? 'Podaj nazwe uzytkownika i haslo'
                : 'Nieprawidlowa nazwa uzytkownika lub haslo';

        console.warn('Tester login failed:', {
            code,
            status: e.status || status,
            message: e.message
        });

        res.status(status).json({ error: message, code });
    }
});

app.post('/api/accounts/list', async (req, res) => {
    if (readPin(req) !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }
    if (!supabaseAdminEnabled()) {
        return res.status(503).json({ error: 'Supabase nie jest skonfigurowany' });
    }

    try {
        const authData = await supabaseAuthAdminRequest('admin/users?page=1&per_page=100');
        const users = Array.isArray(authData)
            ? authData
            : authData.users || authData.data?.users || [];
        let profiles = [];

        try {
            profiles = await supabaseRestAdminRequest('profiles?select=id,nickname,role');
        } catch {
            profiles = [];
        }

        const profileById = new Map(profiles.map(profile => [profile.id, profile]));
        res.json({
            ok: true,
            accounts: users.map(user => publicAccount(user, profileById.get(user.id)))
        });
    } catch(e) {
        res.status(500).json({ error: 'Nie udalo sie pobrac kont', details: e.body || e.message });
    }
});

app.get('/api/accounts/public-email', async (req, res) => {
    if (!supabaseAdminEnabled()) {
        return res.status(503).json({ error: 'Supabase nie jest skonfigurowany' });
    }

    const userId = String(req.query.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        return res.status(400).json({ error: 'Nieprawidlowe ID konta' });
    }

    try {
        const user = await supabaseAuthAdminRequest(`admin/users/${encodeURIComponent(userId)}`);
        const account = user.user || user.data?.user || user;
        if (!account?.email) {
            return res.status(404).json({ error: 'Nie znaleziono konta' });
        }

        res.json({ email: account.email });
    } catch(e) {
        res.status(404).json({ error: 'Nie znaleziono konta' });
    }
});

app.post('/api/accounts/create', async (req, res) => {
    if (readPin(req) !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }
    if (!supabaseAdminEnabled()) {
        return res.status(503).json({ error: 'Supabase nie jest skonfigurowany' });
    }

    const input = sanitizeAccountInput(req.body || {});
    if (input.error) {
        return res.status(400).json({ error: input.error });
    }

    try {
        let created;
        try {
            created = await createSupabaseAccount(input);
        } catch(e) {
            if (!isSupabaseEmailError(e)) throw e;
            created = await createSupabaseAccount(input, generatedAccountEmail('example.com'));
        }
        const user = created.user;

        await supabaseRestAdminRequest('profiles?on_conflict=id', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Prefer: 'resolution=merge-duplicates,return=minimal'
            },
            body: JSON.stringify({
                id: user.id,
                nickname: input.nickname,
                role: input.role,
                updated_at: new Date().toISOString()
            })
        });

        res.json({ ok: true, account: publicAccount({ ...user, email: created.email }, input) });
    } catch(e) {
        res.status(500).json({ error: 'Nie udalo sie utworzyc konta', details: e.body || e.message });
    }
});

app.post('/api/accounts/delete', async (req, res) => {
    if (readPin(req) !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }
    if (!supabaseAdminEnabled()) {
        return res.status(503).json({ error: 'Supabase nie jest skonfigurowany' });
    }

    const userId = String(req.body?.id || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        return res.status(400).json({ error: 'Nieprawidlowe ID konta' });
    }

    try {
        await supabaseRestAdminRequest(`${SUPABASE_RESULTS_TABLE}?or=(user_id.eq.${encodeURIComponent(userId)},player_id.eq.${encodeURIComponent(userId)})`, {
            method: 'DELETE',
            headers: { Prefer: 'return=minimal' }
        }).catch(() => null);

        await supabaseAuthAdminRequest(`admin/users/${encodeURIComponent(userId)}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ should_soft_delete: false })
        });

        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: 'Nie udalo sie usunac konta', details: e.body || e.message });
    }
});

app.post('/api/accounts/password', async (req, res) => {
    if (readPin(req) !== EDITOR_PIN) {
        return res.status(401).json({ error: 'Brak autoryzacji' });
    }
    if (!supabaseAdminEnabled()) {
        return res.status(503).json({ error: 'Supabase nie jest skonfigurowany' });
    }

    const userId = String(req.body?.id || '').trim();
    const password = String(req.body?.password || '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(userId)) {
        return res.status(400).json({ error: 'Nieprawidlowe ID konta' });
    }
    if (password.length < 6) {
        return res.status(400).json({ error: 'Haslo musi miec minimum 6 znakow' });
    }

    try {
        const userData = await supabaseAuthAdminRequest(`admin/users/${encodeURIComponent(userId)}`);
        const account = userData.user || userData.data?.user || userData;
        const metadata = account.user_metadata || {};

        await supabaseAuthAdminRequest(`admin/users/${encodeURIComponent(userId)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                password,
                user_metadata: {
                    ...metadata,
                    grajmytv: {
                        ...(metadata.grajmytv || {}),
                        testerPassword: password
                    }
                }
            })
        });

        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: 'Nie udalo sie zmienic hasla', details: e.body || e.message });
    }
});

// ===== MONTOWANIE GIER =====
// Rodziniada
const rodziniadaRouter = require('./gry/rodziniada/router');
app.use('/rodziniada', rodziniadaRouter);
app.get('/rodziniadaLocal', (req, res) => res.redirect('/rodziniada/local'));
app.get('/rodziniadaOnline', (req, res) => res.redirect('/rodziniada/online'));

// Przyszłe gry (placeholder)
app.get('/droga-do-miliona/:mode', (req, res) => res.redirect(`/w-przygotowaniu?game=droga-do-miliona&mode=${req.params.mode}`));
app.get('/szczesliwe-kolo/:mode', (req, res) => res.redirect(`/w-przygotowaniu?game=szczesliwe-kolo&mode=${req.params.mode}`));
app.get('/jeden-na-dziesieciu/:mode', (req, res) => res.redirect(`/w-przygotowaniu?game=jeden-na-dziesieciu&mode=${req.params.mode}`));
app.get('/gra2', (req, res) => res.redirect('/w-przygotowaniu?game=gra2'));
app.get('/gra3', (req, res) => res.redirect('/w-przygotowaniu?game=gra3'));
app.get('/gra4', (req, res) => res.redirect('/w-przygotowaniu?game=gra4'));

// ===== SOCKET.IO NAMESPACES =====
const rodziniadaIO = io.of('/rodziniada');
const rodziniadaSocket = require('./gry/rodziniada/socket');
const rodziniadaAPI = rodziniadaSocket(rodziniadaIO, logInfo, logSuccess, logWarn, logError, c);

// Endpoint dla Beacon API – wywoływany przy zamknięciu karty przez hosta
app.post('/rodziniada/api/endgame', express.json(), (req, res) => {
    const { gameId } = req.body || {};
    if (!gameId) return res.status(400).end();
    const ok = rodziniadaAPI.forceEndGame(gameId);
    logInfo('RODZINIADA', `[HTTP] /api/endgame gameId=${gameId} ok=${ok}`);
    res.status(ok ? 200 : 404).end();
});

// Endpoint do pollingu listy gier (fallback gdy WebSocket nie działa)
app.get('/rodziniada/api/games', (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json(rodziniadaAPI.getGamesList());
});

// ===== IP =====
function getBestLocalIP() {
    const ifaces = os.networkInterfaces();
    const cands = [];
    for (const name of Object.keys(ifaces)) {
        const nl = name.toLowerCase();
        if (['loopback','bluetooth','vmware','virtualbox','hamachi','vpn','vethernet','wsl']
            .some(x => nl.includes(x))) continue;
        for (const iface of ifaces[name]) {
            if (iface.family !== 'IPv4' || iface.internal) continue;
            const ip = iface.address;
            let p = ip.startsWith('192.168.') ? 100 : ip.startsWith('10.') ? 80 :
                    ip.match(/^172\.(1[6-9]|2\d|3[01])\./) ? 60 : 10;
            if (nl.includes('wi-fi')||nl.includes('wifi')||nl.includes('wlan')) p+=10;
            if (nl.includes('ethernet')||nl.includes('eth')) p+=5;
            cands.push({name, address:ip, priority:p});
        }
    }
    return cands.sort((a,b) => b.priority - a.priority);
}

// ===== START =====
server.listen(PORT, () => {
    const cands = getBestLocalIP();
    const best  = cands[0];
    const url   = best ? `http://${best.address}:${PORT}` : `http://localhost:${PORT}`;

    console.log('');
    console.log(`${c.bgBlue}${c.white}${c.bright}                                         ${c.reset}`);
    console.log(`${c.bgBlue}${c.white}${c.bright}         GrajMyTV  -  SERWER              ${c.reset}`);
    console.log(`${c.bgBlue}${c.white}${c.bright}                                         ${c.reset}`);
    console.log('');
    console.log(`  ${c.bright}${c.white}Adresy dostepu:${c.reset}`);
    console.log('');
    console.log(`  ${c.green}${c.bright}>> Lokalnie:${c.reset}  http://localhost:${c.cyan}${PORT}${c.reset}`);

    if (cands.length > 0) {
        cands.forEach(({name, address}) => {
            console.log(`  ${c.green}${c.bright}>> Siec:${c.reset}      http://${c.cyan}${address}${c.reset}:${c.cyan}${PORT}${c.reset}  ${c.gray}(${name})${c.reset}`);
        });
    }

    console.log('');
    console.log(`${c.gray}${'─'.repeat(45)}${c.reset}`);
    console.log('');

    if (best && !IS_PROD) {
        console.log(`  ${c.bright}${c.white}Kod QR:${c.reset}`);
        console.log('');
        qrcode.generate(url, {small:true}, (qr) => {
            qr.split('\n').forEach(l => console.log(`    ${l}`));
            console.log('');
            console.log(`${c.gray}${'─'.repeat(45)}${c.reset}`);
            console.log('');
            console.log(`  ${c.gray}Ctrl+C = zatrzymaj serwer${c.reset}`);
            console.log('');
        });
    } else {
        console.log(`  ${c.gray}Ctrl+C = zatrzymaj serwer${c.reset}`);
        console.log('');
    }
});
