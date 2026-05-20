const express = require('express');
const path    = require('path');
const fs      = require('fs');
const fsp     = require('fs').promises;
const router  = express.Router();

const QUESTIONS_FILE = path.join(__dirname, 'public', 'pytania.json');
const EDITOR_PIN     = process.env.EDITOR_PIN || '1234';

// Pliki statyczne Rodziniady
router.use(express.static(path.join(__dirname, 'public')));

// Panel hosta (Lobby)
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Rodziniada.html'));
});

// Panel hosta - gra lokalna
router.get('/local', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'RodziniadaLocal.html'));
});

// Panel hosta - gra online
router.get('/online', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'RodziniadaOnline.html'));
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

router.post('/api/verify-pin', (req, res) => {
    res.json({ ok: req.body.pin === EDITOR_PIN });
});

module.exports = router;