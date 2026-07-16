const express = require('express');
const path    = require('path');
const fs      = require('fs');
const fsp     = require('fs').promises;
const router  = express.Router();

const QUESTIONS_FILE = path.join(__dirname, 'public', 'pytania.json');
const JOKES_FILE     = path.join(__dirname, 'public', 'zarty.json');
const CALENDAR_FILE  = path.join(__dirname, 'public', 'daily-challenges.json');
const EDITOR_PIN     = process.env.EDITOR_PIN || '2509';

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

// ===== API ŻARTÓW =====
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
