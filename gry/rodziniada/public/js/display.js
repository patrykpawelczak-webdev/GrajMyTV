const socket = io('/rodziniada', {
    reconnection:         true,
    reconnectionAttempts: Infinity,
    reconnectionDelay:    1000,
    reconnectionDelayMax: 5000
});

let gameState         = null;
let currentGameId     = null;
let introVisible      = false;
let lastQuestionIndex = -2;
let isReconnecting    = false;
let isCountingDown    = false;
let countdownAnimFrame = null;
let filmNoise          = [];

const LS_CODE_KEY = 'rodziniada_tv_code';
const LS_GAME_KEY = 'rodziniada_tv_gameId';

const tv = (id)  => document.getElementById(id);
const qs = (sel) => document.querySelector(sel);

// ================== SOCKET ==================
socket.on('connect', () => {
    console.log('[TV] Połączony:', socket.id);
    tryReconnect();
});

socket.on('disconnect', (reason) => {
    if (currentGameId) { isReconnecting = true; showReconnectOverlay(); }
});

socket.on('reconnect_attempt', (attempt) => {
    updateReconnectMessage('Laczenie... (proba ' + attempt + ')');
});

socket.on('reconnect_failed', () => {
    updateReconnectMessage('Nie mozna polaczyc. Odswiez strone.');
});

socket.on('joinedTv', ({ gameId, state }) => {
    hideReconnectOverlay();
    currentGameId     = gameId;
    gameState         = state;
    lastQuestionIndex = -2;
    localStorage.setItem(LS_GAME_KEY, gameId);
    hideJoinScreen();
    updateDisplay([]);

    if (isReconnecting) {
        isReconnecting = false;
    } else {
        showIntro();
    }
});

socket.on('joinError', ({ message }) => {
    localStorage.removeItem(LS_CODE_KEY);
    localStorage.removeItem(LS_GAME_KEY);
    currentGameId = null; gameState = null; isReconnecting = false;
    hideReconnectOverlay();
    showJoinScreen();
    showJoinError(message || 'Nieprawidlowy kod');
});

socket.on('gameStateUpdated', ({ gameId, state }) => {
    if (!currentGameId || gameId !== currentGameId) return;
    const oldRevealedArr   = gameState ? [...(gameState.revealedAnswers || [])] : [];
    const oldQuestionIndex = gameState ? gameState.currentQuestionIndex : -2;
    gameState = state;
    const newRevealedArr   = gameState.revealedAnswers || [];
    const newQuestionIndex = gameState.currentQuestionIndex;
    let newlyRevealed = [];
    if (newQuestionIndex === oldQuestionIndex) {
        newlyRevealed = newRevealedArr.filter(i => !oldRevealedArr.includes(i));
        if (newlyRevealed.length > 0) playSound('reveal');
    }
    updateDisplay(newlyRevealed);
});

socket.on('gameEnded', () => {
    localStorage.removeItem(LS_CODE_KEY);
    localStorage.removeItem(LS_GAME_KEY);
    currentGameId  = null;
    gameState      = null;
    isReconnecting = false;
    hideReconnectOverlay();

    // ✅ Wróć do lobby po chwili
    setTimeout(() => {
        window.location.href = '/';
    }, 1500);
});

socket.on('startDisplay', () => { startCountdown(); });

socket.on('showBigX',        (count)               => showBigX(count));
socket.on('showPoints',      ({ points, teamName }) => showPoints(points, teamName));
socket.on('showWinner',      ({ winnerName })       => showWinnerOverlay(winnerName));
socket.on('hideWinner',      ()                     => hideWinnerOverlay());
socket.on('playRevealSound', ()                     => playSound('reveal'));

// ================== RECONNECT ==================
function tryReconnect() {
    const c = localStorage.getItem(LS_CODE_KEY);
    const g = localStorage.getItem(LS_GAME_KEY);
    if (c && g) { if (isReconnecting) showReconnectOverlay(); socket.emit('joinAsTv', { code: c }); }
    else if (c) { socket.emit('joinAsTv', { code: c }); }
}
function showReconnectOverlay()   { const o = tv('tvReconnect'); if (o) o.classList.add('show'); }
function hideReconnectOverlay()   { const o = tv('tvReconnect'); if (o) o.classList.remove('show'); }
function updateReconnectMessage(m){ const e = tv('tvReconnectMessage'); if (e) e.textContent = m; }

// ================== DOŁĄCZANIE ==================
function autoJoinFromUrl() {
    const p = new URLSearchParams(window.location.search);
    const c = p.get('code');
    if (c && /^\d{6}$/.test(c)) {
        isReconnecting = false;
        localStorage.setItem(LS_CODE_KEY, c);
        joinAsTv(c);
    } else {
        if (!localStorage.getItem(LS_CODE_KEY)) showJoinScreen();
    }
}
function joinWithEnteredCode() {
    const c = (tv('joinCodeInput').value || '').trim();
    if (!/^\d{6}$/.test(c)) { showJoinError('Wpisz 6 cyfr'); return; }
    isReconnecting = false;
    joinAsTv(c);
}
function joinAsTv(code) {
    localStorage.setItem(LS_CODE_KEY, code);
    showJoinError('');
    socket.emit('joinAsTv', { code });
}
function showJoinScreen()   { tv('joinScreen').classList.remove('hidden'); }
function hideJoinScreen()   { tv('joinScreen').classList.add('hidden'); }
function showJoinError(msg) { tv('joinErrorTv').textContent = msg || ''; }

// ================== INTRO ==================
function showIntro() {
    const intro = tv('tvIntro');
    if (!intro) return;
    intro.style.opacity    = '1';
    intro.style.visibility = 'visible';
    intro.classList.add('show');
    introVisible = true;

    // Pokaż countdown
    const countdown = tv('introCountdown');
    if (countdown) {
        countdown.style.opacity    = '1';
        countdown.style.visibility = 'visible';
        countdown.classList.add('show');
    }

    // Schowaj split panele
    const sl = tv('introSplitLeft');
    const sr = tv('introSplitRight');
    if (sl) { sl.style.transition = 'none'; sl.style.transform = 'translateX(-100%)'; }
    if (sr) { sr.style.transition = 'none'; sr.style.transform = 'translateX(100%)'; }

    // Schowaj wideo
    const vw = tv('introVideoWrap');
    if (vw) { vw.classList.remove('show'); vw.style.opacity = ''; }

    drawCountdownIdle();
}

// ================== ODLICZANIE ==================
function drawCountdownIdle() {
    const canvas = tv('countdownCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;

    const rh = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
    window.addEventListener('resize', rh);
    canvas._rh = rh;

    filmNoise = Array.from({ length: 500 }, () => ({
        x: Math.random(), y: Math.random(),
        w: Math.random() * 2 + 0.5, h: Math.random() * 5 + 1,
        o: Math.random() * 0.25 + 0.02
    }));

    function loop() {
        drawFilmFrame(ctx, canvas, null);
        countdownAnimFrame = requestAnimationFrame(loop);
    }
    loop();
}

function drawFilmFrame(ctx, canvas, number) {
    const W = canvas.width, H = canvas.height;
    const cx = W / 2, cy = H / 2;

    // Tło
    ctx.fillStyle = '#080600';
    ctx.fillRect(0, 0, W, H);

    // Winietowanie
    const vig = ctx.createRadialGradient(cx, cy, H * 0.15, cx, cy, H * 0.8);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // Scanlines
    ctx.fillStyle = 'rgba(0,0,0,0.05)';
    for (let y = 0; y < H; y += 3) ctx.fillRect(0, y, W, 1);

    // Ziarno
    filmNoise.forEach(n => {
        n.x = Math.random(); n.y = Math.random();
        n.o = Math.random() * 0.2 + 0.02;
        ctx.fillStyle = `rgba(255,250,200,${n.o})`;
        ctx.fillRect(n.x * W, n.y * H, n.w, n.h);
    });

    // Krzyżyk
    const ll = Math.min(W, H) * 0.4;
    ctx.strokeStyle = 'rgba(255,250,200,0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx - ll, cy); ctx.lineTo(cx + ll, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - ll); ctx.lineTo(cx, cy + ll); ctx.stroke();

    // Okrąg
    const r = Math.min(W, H) * 0.35;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.06, 0, Math.PI * 2); ctx.stroke();

    // Perforacja
    const pw = 14, ph = 24, pg = 42;
    ctx.fillStyle = 'rgba(255,250,200,0.08)';
    ctx.strokeStyle = 'rgba(255,250,200,0.18)';
    ctx.lineWidth = 1;
    for (let y = pg / 2; y < H; y += pg) {
        ctx.fillRect(20, y - ph / 2, pw, ph);
        ctx.strokeRect(20, y - ph / 2, pw, ph);
        ctx.fillRect(W - 20 - pw, y - ph / 2, pw, ph);
        ctx.strokeRect(W - 20 - pw, y - ph / 2, pw, ph);
    }

    // Rysy
    if (Math.random() > 0.8) {
        const sx = cx + (Math.random() - 0.5) * W * 0.5;
        const sh = Math.random() * H * 0.3 + H * 0.1;
        const sy = Math.random() * (H - sh);
        ctx.strokeStyle = `rgba(255,250,200,${Math.random() * 0.2 + 0.03})`;
        ctx.lineWidth = Math.random() + 0.3;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(sx + (Math.random() - 0.5) * 3, sy + sh); ctx.stroke();
    }

    // ✅ FIX 1: Cyfra wycentrowana - używamy measureText
    if (number !== null) {
        const fs = Math.min(W, H) * 0.5;
        ctx.save();
        ctx.font         = `900 ${fs}px 'Roboto', sans-serif`;
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'middle';

        // Korekta - textBaseline middle nie zawsze idealnie centruje
        // więc mierzymy i poprawiamy
        const metrics  = ctx.measureText(String(number));
        const textH    = metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent;
        const offsetY  = (metrics.actualBoundingBoxAscent - metrics.actualBoundingBoxDescent) / 2;

        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fillText(number, cx + 3, cy + offsetY + 3);
        ctx.fillStyle = '#fffde0';
        ctx.fillText(number, cx, cy + offsetY);
        ctx.restore();
    }

    // Migotanie
    if (Math.random() > 0.93) {
        ctx.fillStyle = `rgba(255,250,200,${Math.random() * 0.05})`;
        ctx.fillRect(0, 0, W, H);
    }
}

function playTickSound() {
    try {
        const actx = new (window.AudioContext || window.webkitAudioContext)();
        const len  = Math.floor(actx.sampleRate * 0.06);
        const buf  = actx.createBuffer(1, len, actx.sampleRate);
        const d    = buf.getChannelData(0);
        for (let i = 0; i < len; i++) {
            d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 6) * 0.8;
        }
        const src = actx.createBufferSource(); src.buffer = buf;
        const flt = actx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.value = 900; flt.Q.value = 0.6;
        const g   = actx.createGain(); g.gain.value = 0.9;
        src.connect(flt); flt.connect(g); g.connect(actx.destination); src.start();
    } catch(e) {}
}

function startCountdown() {
    if (isCountingDown) return;
    isCountingDown = true;

    const canvas = tv('countdownCanvas');
    if (!canvas) return;

    // Zatrzymaj idle
    if (countdownAnimFrame) { cancelAnimationFrame(countdownAnimFrame); countdownAnimFrame = null; }
    if (canvas._rh) { window.removeEventListener('resize', canvas._rh); canvas._rh = null; }

    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    const ctx = canvas.getContext('2d');

    const nums = [3, 2, 1];
    let idx = 0;

    function showNum() {
        if (idx >= nums.length) {
            // ✅ FIX 2: Płynne przejście do wideo
            // Countdown fade out → wideo fade in (bez przerwy)
            transitionToVideo();
            return;
        }

        const num = nums[idx];
        idx++;
        playTickSound();

        const dur   = 1000;
        const start = performance.now();

        function anim(ts) {
            const p = Math.min((ts - start) / dur, 1);
            drawFilmFrame(ctx, canvas, num);

            // Flash na początku
            if (p < 0.08) {
                ctx.fillStyle = `rgba(255,250,200,${(0.08 - p) / 0.08 * 0.2})`;
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }

            if (p < 1) {
                countdownAnimFrame = requestAnimationFrame(anim);
            } else {
                // Szybki fade między cyframi
                fadeBetween(ctx, canvas, 120, showNum);
            }
        }
        countdownAnimFrame = requestAnimationFrame(anim);
    }

    showNum();
}

function fadeBetween(ctx, canvas, dur, cb) {
    const start = performance.now();
    function anim(ts) {
        const p = Math.min((ts - start) / dur, 1);
        drawFilmFrame(ctx, canvas, null);
        ctx.fillStyle = `rgba(0,0,0,${p * 0.7})`;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        if (p < 1) countdownAnimFrame = requestAnimationFrame(anim);
        else cb();
    }
    countdownAnimFrame = requestAnimationFrame(anim);
}

// ✅ FIX 2: Płynne przejście countdown → wideo
function transitionToVideo() {
    const countdown = tv('introCountdown');
    const videoWrap = tv('introVideoWrap');
    const video     = tv('introVideo');

    if (countdownAnimFrame) { cancelAnimationFrame(countdownAnimFrame); countdownAnimFrame = null; }

    // Najpierw pokaż wideo pod countdownem
    if (videoWrap) {
        videoWrap.style.transition = 'none';
        videoWrap.style.opacity    = '1';
        videoWrap.style.visibility = 'visible';
        videoWrap.classList.add('show');
    }

    if (video) {
        video.currentTime = 0;
        video.play().catch(() => {});
    }

    // Fade out countdown odsłaniając wideo pod spodem
    if (countdown) {
        countdown.style.transition = 'opacity 0.5s ease';
        countdown.style.opacity    = '0';

        setTimeout(() => {
            countdown.classList.remove('show');
            countdown.style.visibility = 'hidden';
            countdown.style.transition = '';
        }, 500);
    }

    // Czekaj na koniec wideo
    if (video) {
        video.onended = () => doSplitTransition();

        // Zabezpieczenie
        setTimeout(() => {
            if (videoWrap && videoWrap.classList.contains('show')) {
                doSplitTransition();
            }
        }, 7000);
    } else {
        setTimeout(() => doSplitTransition(), 500);
    }
}

// ✅ FIX 3: Jedno przejście - split panele rozsuwają się odsłaniając grę
function doSplitTransition() {
    const videoWrap  = tv('introVideoWrap');
    const video      = tv('introVideo');
    const splitLeft  = tv('introSplitLeft');
    const splitRight = tv('introSplitRight');

    if (!splitLeft || !splitRight) { finishIntro(); return; }

    // ✅ Zrób screenshot ostatniej klatki wideo na canvas split paneli
    const W = window.innerWidth;
    const H = window.innerHeight;

    // Lewa połowa
    const canvasL = document.createElement('canvas');
    canvasL.width  = W / 2;
    canvasL.height = H;
    const ctxL = canvasL.getContext('2d');

    // Prawa połowa  
    const canvasR = document.createElement('canvas');
    canvasR.width  = W / 2;
    canvasR.height = H;
    const ctxR = canvasR.getContext('2d');

    try {
        // Oblicz jak wideo jest skalowane (object-fit: cover)
        const vW = video.videoWidth  || W;
        const vH = video.videoHeight || H;
        const scale = Math.max(W / vW, H / vH);
        const drawW = vW * scale;
        const drawH = vH * scale;
        const offsetX = (W - drawW) / 2;
        const offsetY = (H - drawH) / 2;

        // Lewa połowa - lewa część wideo
        ctxL.drawImage(video, offsetX, offsetY, drawW, drawH);

        // Prawa połowa - prawa część wideo (przesunięta o W/2)
        ctxR.drawImage(video, offsetX - W / 2, offsetY, drawW, drawH);
    } catch(e) {
        // Jeśli canvas fail - użyj czarnego tła
        ctxL.fillStyle = '#000';
        ctxL.fillRect(0, 0, W / 2, H);
        ctxR.fillStyle = '#000';
        ctxR.fillRect(0, 0, W / 2, H);
    }

    // Ustaw canvas jako tło split paneli
    const dataL = canvasL.toDataURL();
    const dataR = canvasR.toDataURL();

    splitLeft.style.backgroundImage    = `url(${dataL})`;
    splitLeft.style.backgroundSize     = 'cover';
    splitLeft.style.backgroundPosition = 'left center';

    splitRight.style.backgroundImage    = `url(${dataR})`;
    splitRight.style.backgroundSize     = 'cover';
    splitRight.style.backgroundPosition = 'right center';

    // Schowaj wideo - teraz split panele wyglądają jak wideo
    if (videoWrap) {
        videoWrap.classList.remove('show');
        videoWrap.style.opacity    = '0';
        videoWrap.style.visibility = 'hidden';
    }

    // Schowaj intro pod spodem
    const intro = tv('tvIntro');
    if (intro) {
        intro.style.opacity    = '0';
        intro.style.visibility = 'hidden';
        intro.classList.remove('show');
    }

    // Panele startują na pozycji zakrytej (cały ekran)
    splitLeft.style.transition  = 'none';
    splitRight.style.transition = 'none';
    splitLeft.style.transform   = 'translateX(0)';
    splitRight.style.transform  = 'translateX(0)';

    void splitLeft.offsetWidth;

    // ✅ Rozsuwają się - ostatnia klatka "rozjeżdża się" na boki
    splitLeft.style.transition  = 'transform 0.7s cubic-bezier(0.6, 0, 0.2, 1)';
    splitRight.style.transition = 'transform 0.7s cubic-bezier(0.6, 0, 0.2, 1)';
    splitLeft.style.transform   = 'translateX(-100%)';
    splitRight.style.transform  = 'translateX(100%)';

    setTimeout(() => finishIntro(), 750);
}

function finishIntro() {
    const splitLeft  = tv('introSplitLeft');
    const splitRight = tv('introSplitRight');
    const intro      = tv('tvIntro');

    if (intro) {
        intro.style.opacity    = '0';
        intro.style.visibility = 'hidden';
        intro.classList.remove('show');
    }

    // Reset split paneli
    if (splitLeft) {
        splitLeft.style.transition       = 'none';
        splitLeft.style.transform        = 'translateX(-100%)';
        splitLeft.style.backgroundImage  = '';
    }
    if (splitRight) {
        splitRight.style.transition       = 'none';
        splitRight.style.transform        = 'translateX(100%)';
        splitRight.style.backgroundImage  = '';
    }

    introVisible   = false;
    isCountingDown = false;

    if (countdownAnimFrame) {
        cancelAnimationFrame(countdownAnimFrame);
        countdownAnimFrame = null;
    }
}

function finishIntro() {
    const intro = tv('tvIntro');
    if (!intro) return;

    intro.style.opacity    = '0';
    intro.style.visibility = 'hidden';
    intro.classList.remove('show');
    introVisible   = false;
    isCountingDown = false;

    if (countdownAnimFrame) {
        cancelAnimationFrame(countdownAnimFrame);
        countdownAnimFrame = null;
    }
}

// ================== GAME ENDED ==================
function showGameEndedOverlay() { const o = tv('tvGameEnded'); if (o) o.classList.add('show'); }
function hideGameEndedOverlay() { const o = tv('tvGameEnded'); if (o) o.classList.remove('show'); }

// ================== RENDEROWANIE ==================
function updateDisplay(newlyRevealed = []) {
    if (!gameState) { clearBoard(); return; }
    updateTeamsAndScores();
    updateStrikes();
    updateTeamHighlighting();
    updateRoundInfo();
    updateQuestion();

    const ci = gameState.currentQuestionIndex;
    if (ci !== lastQuestionIndex) {
        lastQuestionIndex = ci;
        renderAnswersFresh();
    } else {
        revealAnswerElements(newlyRevealed);
    }
}

function clearBoard() {
    tv('tvTeam1Name').textContent  = 'Druzyna 1';
    tv('tvTeam2Name').textContent  = 'Druzyna 2';
    tv('tvTeam1Score').textContent = '0';
    tv('tvTeam2Score').textContent = '0';
    tv('tvRoundScore').textContent = '0';
    tv('tvMultiplier').textContent = '×1';
    for (let i = 1; i <= 3; i++) {
        qs(`#tvTeam1Strike${i}`)?.classList.remove('active');
        qs(`#tvTeam2Strike${i}`)?.classList.remove('active');
    }
    const qW = qs('#tvQuestion'), qT = qs('#tvQuestionText');
    if (qW) qW.classList.add('hidden');
    if (qT) { qT.textContent = '?'; qT.classList.add('question-mark'); }
    const a = qs('#tvAnswers'); if (a) a.innerHTML = '';
    lastQuestionIndex = -2;
}

function updateTeamsAndScores() {
    tv('tvTeam1Name').textContent  = gameState.team1.name.toUpperCase();
    tv('tvTeam2Name').textContent  = gameState.team2.name.toUpperCase();
    tv('tvTeam1Score').textContent = gameState.team1.score;
    tv('tvTeam2Score').textContent = gameState.team2.score;
}

function updateStrikes() {
    const { team1, team2, isStealMode, currentTeam } = gameState;
    let t1 = team1.strikes, t2 = team2.strikes;
    if (isStealMode) {
        if (currentTeam === 1) t1 = Math.min(t1, 1);
        if (currentTeam === 2) t2 = Math.min(t2, 1);
    }
    for (let i = 1; i <= 3; i++) {
        qs(`#tvTeam1Strike${i}`)?.classList.toggle('active', i <= t1);
        qs(`#tvTeam2Strike${i}`)?.classList.toggle('active', i <= t2);
    }
}

function updateTeamHighlighting() {
    const { isStealMode, currentTeam, questionRevealed, pointsAwarded, team1, team2 } = gameState;
    const e1 = qs('#tvTeam1'), e2 = qs('#tvTeam2');
    if (!e1 || !e2) return;
    e1.classList.remove('active','stealing','warning');
    e2.classList.remove('active','stealing','warning');
    if (isStealMode) {
        if (currentTeam === 1) e1.classList.add('stealing');
        if (currentTeam === 2) e2.classList.add('stealing');
        return;
    }
    if (currentTeam === 1) e1.classList.add('active');
    if (currentTeam === 2) e2.classList.add('active');
    if (questionRevealed && !pointsAwarded) {
        if (currentTeam === 1 && team1.strikes === 2) e2.classList.add('warning');
        if (currentTeam === 2 && team2.strikes === 2) e1.classList.add('warning');
    }
}

function updateRoundInfo() {
    tv('tvRoundScore').textContent = gameState.roundPoints;
    tv('tvMultiplier').textContent = '×' + gameState.multiplier;
}

function updateQuestion() {
    const qW = qs('#tvQuestion'), qT = qs('#tvQuestionText');
    const { currentQuestion, questionRevealed } = gameState;
    if (currentQuestion && questionRevealed) {
        qW.classList.remove('hidden');
        qT.textContent = currentQuestion.text;
        qT.classList.remove('question-mark');
    } else {
        qW.classList.add('hidden');
        qT.textContent = '?';
        qT.classList.add('question-mark');
    }
}

function renderAnswersFresh() {
    const c = qs('#tvAnswers');
    if (!c) return;
    if (!gameState?.currentQuestion) { c.innerHTML = ''; return; }
    const { currentQuestion, revealedAnswers } = gameState;
    c.innerHTML = currentQuestion.answers.map((a, i) => {
        const r = revealedAnswers.includes(i);
        return `<div class="tv-answer ${r ? 'revealed-instant' : ''}" id="tvAnswer${i}">
            <div class="tv-answer-card">
                <div class="tv-answer-front"><span class="tv-answer-number">${i+1}</span></div>
                <div class="tv-answer-back">
                    <div class="tv-answer-inner">
                        <span class="tv-answer-number-badge">${i+1}</span>
                        <span class="tv-answer-text">${a.text}</span>
                    </div>
                    <span class="tv-answer-points">${a.points} pkt</span>
                </div>
            </div>
        </div>`;
    }).join('');
}

function revealAnswerElements(nl) {
    if (!nl?.length) return;
    nl.forEach(i => {
        const el = document.getElementById('tvAnswer' + i);
        if (!el || el.classList.contains('revealed') || el.classList.contains('revealed-instant')) return;
        void el.offsetWidth;
        el.classList.add('revealed');
    });
}

// ================== OVERLAYE ==================
function showBigX(count) {
    const o = tv('tvBigX'), c = tv('tvBigXContent');
    if (!o || !c) return;
    c.textContent = '✖'.repeat(count);
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
    playSound('wrong');
    setTimeout(() => o.classList.remove('show'), 1500);
}

function showPoints(points, teamName) {
    const o = tv('tvPoints'), v = tv('tvPointsValue'), t = tv('tvPointsTeam');
    if (!o || !v || !t) return;
    v.textContent = '+' + points; t.textContent = teamName.toUpperCase();
    o.classList.remove('show'); void o.offsetWidth; o.classList.add('show');
    playSound('points');
    setTimeout(() => o.classList.remove('show'), 2500);
}

function showWinnerOverlay(name) {
    const o = tv('tvWinner'), n = tv('tvWinnerName');
    if (!o || !n) return;
    n.textContent = name.toUpperCase();
    o.classList.remove('show');
    void o.offsetWidth;
    o.classList.add('show');
    playSound('winner');
    // ✅ Nie zamykamy przez onclick - host wyśle gameEnded po 10s
    // overlay zostaje do końca
}

function hideWinnerOverlay() {
    const o = tv('tvWinner');
    if (o) { o.classList.remove('show'); o.onclick = null; }
}

// ================== DŹWIĘKI ==================
function playSound(type) {
    if (!gameState || !gameState.soundEnabled) return;
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (type === 'wrong') {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'square'; o.frequency.value = 200; g.gain.value = 0.4;
            o.start(); o.stop(ctx.currentTime + 0.5);
        } else if (type === 'reveal') {
            const o = ctx.createOscillator(), g = ctx.createGain();
            o.connect(g); g.connect(ctx.destination);
            o.type = 'sine'; o.frequency.value = 880;
            g.gain.setValueAtTime(0.3, ctx.currentTime);
            g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25);
            o.start(); o.stop(ctx.currentTime + 0.25);
        } else if (type === 'points') {
            [523,659,784,1047].forEach((f,i) => {
                setTimeout(() => { try {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.type = 'sine'; o.frequency.value = f; g.gain.value = 0.3;
                    o.start(); o.stop(ctx.currentTime + 0.3);
                } catch(e){} }, i * 150);
            });
        } else if (type === 'winner') {
            [523,659,784,1047,1319,1568].forEach((f,i) => {
                setTimeout(() => { try {
                    const o = ctx.createOscillator(), g = ctx.createGain();
                    o.connect(g); g.connect(ctx.destination);
                    o.type = 'sine'; o.frequency.value = f;
                    g.gain.setValueAtTime(0.3, ctx.currentTime);
                    g.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.4);
                    o.start(); o.stop(ctx.currentTime + 0.4);
                } catch(e){} }, i * 200);
            });
        }
    } catch(e) {}
}

// ================== FULLSCREEN ==================
function enterFullscreen() {
    const d = document, de = document.documentElement;
    const f = d.fullscreenElement || d.webkitFullscreenElement || d.mozFullScreenElement || d.msFullscreenElement;
    if (!f) {
        const r = de.requestFullscreen || de.webkitRequestFullscreen || de.mozRequestFullScreen || de.msRequestFullscreen;
        if (r) r.call(de).catch?.(() => {});
    } else {
        const e = d.exitFullscreen || d.webkitExitFullscreen || d.mozCancelFullScreen || d.msExitFullscreen;
        if (e) e.call(d).catch?.(() => {});
    }
}

// ================== INIT ==================
document.addEventListener('DOMContentLoaded', () => { autoJoinFromUrl(); });
window.joinWithEnteredCode = joinWithEnteredCode;
window.enterFullscreen     = enterFullscreen;