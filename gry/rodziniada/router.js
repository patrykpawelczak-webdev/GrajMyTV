const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

const QUESTIONS_FILE = path.join(__dirname, 'pytania.json');
const EDITOR_PIN     = process.env.EDITOR_PIN || '1234';

// Pliki statyczne Rodziniady
router.use(express.static(path.join(__dirname, 'public')));

// Panel hosta
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'Rodziniada.html'));
});

// Ekran TV - tylko z kodem
router.get('/tv', (req, res) => {
    const code = req.query.code;
    if (!code || !/^\d{6}$/.test(code)) {
        return res.redirect('/rodziniada');
    }
    res.sendFile(path.join(__dirname, 'public', 'RodziniadaTV.html'));
});

// Edytor
router.get('/edytor', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'edytor.html'));
});

// ===== API PYTAŃ =====
router.get('/api/questions', (req, res) => {
    try {
        if (!fs.existsSync(QUESTIONS_FILE)) {
            return res.json({ categories: [] });
        }
        const data = JSON.parse(fs.readFileSync(QUESTIONS_FILE, 'utf8'));
        res.json(data);
    } catch(e) {
        res.json({ categories: [] });
    }
});

router.post('/api/questions', (req, res) => {
    const data = req.body;
    if (!data || !Array.isArray(data.categories)) {
        return res.status(400).json({ error: 'Nieprawidlowy format' });
    }
    try {
        if (fs.existsSync(QUESTIONS_FILE)) {
            fs.copyFileSync(QUESTIONS_FILE, QUESTIONS_FILE + '.backup');
        }
        fs.writeFileSync(QUESTIONS_FILE, JSON.stringify(data, null, 2), 'utf8');
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: 'Blad zapisu' });
    }
});

router.post('/api/verify-pin', (req, res) => {
    res.json({ ok: req.body.pin === EDITOR_PIN });
});

module.exports = router;

router.get('/api/questions', (req, res) => {
    try {
        console.log('Szukam pliku:', QUESTIONS_FILE);
        console.log('Plik istnieje:', fs.existsSync(QUESTIONS_FILE));
        
        if (!fs.existsSync(QUESTIONS_FILE)) {
            console.log('BRAK PLIKU!');
            return res.json({ categories: [] });
        }
        const raw = fs.readFileSync(QUESTIONS_FILE, 'utf8');
        console.log('Rozmiar pliku:', raw.length, 'znaków');
        const data = JSON.parse(raw);
        console.log('Kategorii:', data.categories?.length);
        res.json(data);
    } catch(e) {
        console.log('BLAD:', e.message);
        res.json({ categories: [] });
    }
});