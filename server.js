require('dotenv').config();

const express    = require('express');
const http       = require('http');
const { Server } = require('socket.io');
const path       = require('path');
const os         = require('os');
const qrcode     = require('qrcode-terminal');

const app    = express();
const server = http.createServer(app);
const io     = new Server(server);

const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === 'production';

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

// ===== MIDDLEWARE =====
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ===== STRONA GŁÓWNA =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ===== MONTOWANIE GIER =====
// Rodziniada
const rodziniadaRouter = require('./games/rodziniada/router');
app.use('/rodziniada', rodziniadaRouter);

// Przyszłe gry (placeholder)
app.get('/gra2', (req, res) => res.redirect('/?soon=gra2'));
app.get('/gra3', (req, res) => res.redirect('/?soon=gra3'));
app.get('/gra4', (req, res) => res.redirect('/?soon=gra4'));

// ===== SOCKET.IO NAMESPACES =====
const rodziniadaIO = io.of('/rodziniada');
const rodziniadaSocket = require('./games/rodziniada/socket');
rodziniadaSocket(rodziniadaIO, logInfo, logSuccess, logWarn, logError, c);

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