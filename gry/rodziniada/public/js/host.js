const socket = io('/rodziniada');

let questionCategories = [];
let allGames = [];
let categoriesRendered = false;
let currentMode    = 'manual';
let selectedRounds = 2;
let drawnQuestions = [];

async function loadQuestionsFromServer() {
    try {
        const res = await fetch('/rodziniada/api/questions');
        const data = await res.json();
        questionCategories = data.categories || [];
    } catch(e) { questionCategories = []; }
}

function createEmptyState() {
    return {
        team1:{name:'Drużyna 1',score:0,strikes:0},
        team2:{name:'Drużyna 2',score:0,strikes:0},
        currentTeam:null, roundPoints:0, multiplier:1,
        currentQuestionIndex:-1, currentQuestion:null,
        questionRevealed:false, revealedAnswers:[],
        isStealMode:false, stealUsed:false,
        pointsAwarded:false, failedTeam:null,
        selectedQuestions:[], soundEnabled:true
    };
}

let gameState       = createEmptyState();
let currentGameId   = null;
let currentHostCode = null;
let currentTvCode   = null;

const $ = id => document.getElementById(id);

// ===== MODAL =====
function showModal(title, message, confirmText, confirmClass, onConfirm) {
    $('modalTitle').textContent   = title;
    $('modalMessage').textContent = message;
    const oldBtn = $('modalConfirmBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.textContent = confirmText || 'Potwierdź';
    newBtn.className   = `modal-btn ${confirmClass || 'modal-btn-confirm'}`;
    newBtn.addEventListener('click', () => { closeModal(); if (onConfirm) onConfirm(); });
    $('modalOverlay').classList.add('show');
}

function closeModal() { $('modalOverlay').classList.remove('show'); }

// ===== TOAST =====
let toastTimer = null;
function showToast(msg, type='info') {
    let toast = $('hostToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'hostToast';
        toast.className = 'host-toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `host-toast show ${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;')
        .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', async () => {
    $('modalOverlay').addEventListener('click', (e) => {
        if (e.target === $('modalOverlay')) closeModal();
    });
    await loadQuestionsFromServer();
});

// ===== LOBBY =====
function showLobbyScreen() {
    $('lobbyScreen').classList.remove('hidden');
    $('setupScreen').classList.add('hidden');
    $('gameScreen').classList.remove('active');
}

function showSetupScreen() {
    $('lobbyScreen').classList.add('hidden');
    $('setupScreen').classList.remove('hidden');

    $('setupGameName').value  = '';
    $('setupTeam1Name').value = 'Drużyna 1';
    $('setupTeam2Name').value = 'Drużyna 2';

    currentMode    = 'manual';
    drawnQuestions = [];
    $('modeTabManual')?.classList.add('active');
    $('modeTabRandom')?.classList.remove('active');
    $('modeManual')?.classList.remove('hidden');
    $('modeRandom')?.classList.add('hidden');
    $('randomPreview')?.classList.add('hidden');

    loadQuestionsFromServer().then(() => {
        categoriesRendered = false;
        const btn  = $('btnShowCategories');
        const grid = $('categoriesGrid');
        if (btn && grid) {
            btn.classList.remove('hidden');
            grid.classList.add('hidden');
            grid.innerHTML = '';
        }
        updateSelectedQuestions();
    });
}

function backToLobby() {
    $('lobbyScreen').classList.remove('hidden');
    $('setupScreen').classList.add('hidden');
}

// ===== LISTA GIER =====
function renderGamesList(games) {
    const body  = $('lobbyTableBody');
    const empty = $('lobbyEmpty');

    if (!games || games.length === 0) {
        body.innerHTML = '';
        body.appendChild(empty);
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';

    body.innerHTML = games.map(g => `
        <div class="lobby-row" data-id="${g.gameId}">
            <div class="lobby-col-name">
                <div class="lobby-game-name">${escapeHtml(g.name)}</div>
            </div>
            <div class="lobby-col-actions">
                <button class="lobby-btn lobby-btn-tv"
                        onclick="joinGameAsTv('${g.tvCode}')">
                    Dołącz jako ekran TV
                </button>
            </div>
        </div>
    `).join('');
}

function normalizeStr(str) {
    return String(str).toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
}

function filterGames() {
    const query = ($('lobbySearchInput').value || '').trim();
    if (!query) {
        renderGamesList(allGames);
        return;
    }
    const q = normalizeStr(query);
    const filtered = allGames.filter(g => normalizeStr(g.name).includes(q));
    renderGamesList(filtered);
}

function joinGameAsTv(tvCode) {
    showModal(
        'Dołącz jako ekran TV',
        '',
        'Dołącz',
        'modal-btn-confirm',
        () => {
            const code = $('lobbyTvCodeInput')?.value?.trim();
            if (!code) { showToast('Wpisz kod TV!', 'error'); return; }
            if (code !== tvCode) {
                showToast('Nieprawidłowy kod TV!', 'error');
                return;
            }
            window.location.href = `/tv?code=${tvCode}`;
        }
    );

    setTimeout(() => {
        const msgEl = $('modalMessage');
        if (msgEl) {
            msgEl.innerHTML = `
                <p style="margin-bottom:14px;color:#94a3b8;">
                    Wpisz kod TV podany przez prowadzącego.
                </p>
                <input type="text"
                       id="lobbyTvCodeInput"
                       maxlength="6"
                       inputmode="numeric"
                       placeholder="------"
                       style="
                           width:100%;
                           padding:12px 16px;
                           background:rgba(0,0,0,0.4);
                           border:2px solid rgba(255,215,0,0.4);
                           border-radius:10px;
                           color:#ffd700;
                           font-size:1.6rem;
                           text-align:center;
                           letter-spacing:8px;
                           font-family:'Roboto',sans-serif;
                           outline:none;
                       ">
            `;
            setTimeout(() => {
                const inp = $('lobbyTvCodeInput');
                if (inp) {
                    inp.focus();
                    inp.addEventListener('keydown', (e) => {
                        if (e.key === 'Enter') $('modalConfirmBtn')?.click();
                    });
                }
            }, 50);
        }
    }, 10);
}

// ===== RĘCZNY WYBÓR KATEGORII =====
function renderCategoriesSetup() {
    const grid = $('categoriesGrid');
    const nonEmpty = questionCategories
        .map((cat,idx) => ({...cat, originalIndex:idx}))
        .filter(cat => cat.questions.length > 0);

    if (nonEmpty.length === 0) {
        grid.innerHTML = '<div class="no-questions">Brak pytań do wyświetlenia</div>';
        categoriesRendered = true;
        updateSelectedQuestions();
        return;
    }

    grid.innerHTML = nonEmpty.map(category => {
        const ci = category.originalIndex;
        return `
            <div class="category-card" onclick="toggleCategory(${ci})">
                <div class="category-header">
                    <span class="category-icon">${category.icon}</span>
                    <span class="category-name">${category.name}</span>
                    <span class="category-count">${category.questions.length}</span>
                </div>
                <div class="category-questions">
                    ${category.questions.map((q,qi) => `
                        <div class="category-question-item" onclick="event.stopPropagation()">
                            <input type="checkbox" class="category-question-checkbox"
                                   id="q${ci}_${qi}" onchange="updateSelectedQuestions()">
                            <span class="category-question-text">${q.text}</span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');

    categoriesRendered = true;
    updateSelectedQuestions();
}

function showCategories() {
    const btn = $('btnShowCategories');
    const grid = $('categoriesGrid');
    if (btn) btn.classList.add('hidden');
    if (grid) grid.classList.remove('hidden');
    if (!categoriesRendered) renderCategoriesSetup();
}

function toggleCategory(ci) {
    const cat = questionCategories[ci];
    const any = cat.questions.some((_,qi) => $(`q${ci}_${qi}`)?.checked);
    cat.questions.forEach((_,qi) => {
        const cb = $(`q${ci}_${qi}`);
        if (cb) cb.checked = !any;
    });
    updateSelectedQuestions();
}

// ===== TRYB WYBORU =====
function switchMode(mode) {
    currentMode = mode;

    $('modeTabManual').classList.toggle('active', mode === 'manual');
    $('modeTabRandom').classList.toggle('active', mode === 'random');

    $('modeManual').classList.toggle('hidden', mode !== 'manual');
    $('modeRandom').classList.toggle('hidden', mode !== 'random');

    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');

    if (mode === 'random') {
        renderRandomCats();
    }

    updateSelectedQuestions();
}

// ===== LOSOWY - KATEGORIE =====
function renderRandomCats() {
    const grid = $('randomCatsGrid');
    if (!grid) return;

    const nonEmpty = questionCategories.filter(c => c.questions.length > 0);

    if (nonEmpty.length === 0) {
        grid.innerHTML = '<div class="random-exclude-empty">Brak pytań do wyświetlenia</div>';
        return;
    }

    grid.innerHTML = nonEmpty.map((cat, i) => {
        const ci = questionCategories.indexOf(cat);
        return `
            <div class="random-cat-card ${i === 0 ? 'selected' : ''}"
                 id="randomCat_${ci}"
                 onclick="toggleRandomCat(${ci})">
                <span class="random-cat-icon">${cat.icon}</span>
                <span class="random-cat-name">${cat.name}</span>
                <span class="random-cat-count">${cat.questions.length} pyt.</span>
                <div class="random-cat-check">${i === 0 ? '✓' : ''}</div>
            </div>
        `;
    }).join('');

    updateExcludeList();
    updateDrawButton();
}

function toggleRandomCat(ci) {
    const card = $(`randomCat_${ci}`);
    if (!card) return;
    card.classList.toggle('selected');
    const check = card.querySelector('.random-cat-check');
    if (check) check.textContent = card.classList.contains('selected') ? '✓' : '';
    updateExcludeList();
    updateDrawButton();
    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');
    updateSelectedQuestions();
}

function getSelectedCatIndexes() {
    return questionCategories
        .map((_, ci) => ci)
        .filter(ci => $(`randomCat_${ci}`)?.classList.contains('selected'));
}

// ===== LOSOWY - WYKLUCZENIA =====
function updateExcludeList() {
    const list = $('randomExcludeList');
    if (!list) return;

    const selectedCats = getSelectedCatIndexes();

    if (selectedCats.length === 0) {
        list.innerHTML = '<div class="random-exclude-empty">Najpierw wybierz kategorie powyżej</div>';
        return;
    }

    let html = '';
    selectedCats.forEach(ci => {
        const cat = questionCategories[ci];
        html += `<div class="exclude-cat-group">
            <div class="exclude-cat-label">${cat.icon} ${cat.name}</div>
            ${cat.questions.map((q, qi) => `
                <label class="exclude-question-item">
                    <input type="checkbox" class="exclude-checkbox"
                           id="excl_${ci}_${qi}" checked>
                    <span class="exclude-question-text">${q.text}</span>
                </label>
            `).join('')}
        </div>`;
    });

    list.innerHTML = html;
}

// ===== LOSOWY - RUNDY =====
function selectRounds(n) {
    selectedRounds = n;
    document.querySelectorAll('.rounds-opt').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.rounds) === n);
    });
    const label = $('roundsLabel');
    if (label) {
        label.textContent = n === 2 ? '2 rundy' : n === 3 ? '3 rundy' : '5 rund';
    }
    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');
    updateSelectedQuestions();
}

function updateDrawButton() {
    const btn = $('btnDraw');
    if (!btn) return;
    btn.disabled = getSelectedCatIndexes().length === 0;
}

// ===== LOSOWY - LOSOWANIE =====
function drawQuestions() {
    const selectedCats = getSelectedCatIndexes();
    if (selectedCats.length === 0) return;

    const available = [];
    selectedCats.forEach(ci => {
        const cat = questionCategories[ci];
        cat.questions.forEach((q, qi) => {
            const checkbox = $(`excl_${ci}_${qi}`);
            if (checkbox && checkbox.checked) {
                available.push({...q, _catName: cat.name, _catIcon: cat.icon});
            }
        });
    });

    if (available.length === 0) {
        showToast('Brak dostępnych pytań!', 'error');
        return;
    }

    const count = Math.min(selectedRounds, available.length);

    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    drawnQuestions = shuffled.slice(0, count);

    renderRandomPreview();
    updateSelectedQuestions();
}

function renderRandomPreview() {
    const preview = $('randomPreview');
    const list    = $('randomPreviewList');
    if (!preview || !list) return;

    list.innerHTML = drawnQuestions.map((q, i) => `
        <div class="preview-question-item">
            <span class="preview-q-num">${i + 1}</span>
            <div class="preview-q-info">
                <div class="preview-q-cat">${q._catIcon} ${q._catName}</div>
                <div class="preview-q-text">${q.text}</div>
                <div class="preview-q-answers">
                    ${q.answers.map(a => `
                        <span class="preview-answer">${a.text} (${a.points})</span>
                    `).join('')}
                </div>
            </div>
        </div>
    `).join('');

    preview.classList.remove('hidden');
}

// ===== WYBÓR PYTAŃ - GŁÓWNA FUNKCJA =====
function updateSelectedQuestions() {
    let count = 0;

    if (currentMode === 'manual') {
        questionCategories.forEach((cat, ci) => {
            cat.questions.forEach((_, qi) => {
                if ($(`q${ci}_${qi}`)?.checked) count++;
            });
        });
    } else {
        count = drawnQuestions.length;
    }

    $('selectedCount').textContent =
        `Wybrano: ${count} ${count === 1 ? 'pytanie' : count < 5 ? 'pytania' : 'pytań'}`;
    $('btnStartGame').disabled = count === 0;
}

// ===== BUDOWANIE STANU =====
function buildInitialStateFromSetup() {
    const state = createEmptyState();
    state.team1.name = $('setupTeam1Name').value.trim() || 'Drużyna 1';
    state.team2.name = $('setupTeam2Name').value.trim() || 'Drużyna 2';

    const selected = [];

    if (currentMode === 'manual') {
        questionCategories.forEach((cat, ci) => {
            cat.questions.forEach((q, qi) => {
                if ($(`q${ci}_${qi}`)?.checked) {
                    selected.push({
                        text: q.text,
                        answers: q.answers.map(a => ({text:a.text, points:a.points}))
                    });
                }
            });
        });
    } else {
        drawnQuestions.forEach(q => {
            selected.push({
                text: q.text,
                answers: q.answers.map(a => ({text:a.text, points:a.points}))
            });
        });
    }

    state.selectedQuestions = selected;
    return state;
}

function startGame() {
    const gameName = $('setupGameName').value.trim() || 'Rozgrywka';
    const initialState = buildInitialStateFromSetup();
    socket.emit('createGame', {initialState, name: gameName});
}

// ===== SOCKET =====
socket.on('gameCreated', ({gameId, hostCode, tvCode, state}) => {
    currentGameId = gameId; currentHostCode = hostCode; currentTvCode = tvCode;
    gameState = state;
    showGameScreen();
    updateHeaderCodes();
    updateUI();
});

socket.on('joinedHost', ({gameId, hostCode, tvCode, state}) => {
    currentGameId = gameId; currentHostCode = hostCode; currentTvCode = tvCode;
    gameState = state;
    showGameScreen();
    updateHeaderCodes();
    updateUI();
});

socket.on('joinError', ({message}) => {
    showToast(message || 'Nie udało się dołączyć', 'error');
});

socket.on('gameStateUpdated', ({gameId, state}) => {
    if (gameId !== currentGameId) return;
    gameState = state;
    updateUI();
});

socket.on('gameEnded', () => { backToMenuUIOnly(); });

socket.on('gamesListUpdated', (games) => {
    allGames = games;
    filterGames();
});

// ===== WYSYŁANIE =====
function sendStateUpdate() {
    if (!currentGameId) return;
    socket.emit('updateGameState', {gameId:currentGameId, state:gameState});
}

// ===== EKRANY =====
function showGameScreen() {
    $('lobbyScreen').classList.add('hidden');
    $('setupScreen').classList.add('hidden');
    $('gameScreen').classList.add('active');
}

function backToMenuUIOnly() {
    currentGameId = currentHostCode = currentTvCode = null;
    gameState = createEmptyState();
    $('gameScreen').classList.remove('active');
    showLobbyScreen();
}

function endGameAndBackToMenu() {
    showModal('Powrót do menu', 'Czy na pewno chcesz zakończyć grę?',
        'Zakończ grę', 'modal-btn-confirm',
        () => {
            if (currentGameId) socket.emit('endGame', {gameId:currentGameId});
            backToMenuUIOnly();
        });
}

function resetGame() {
    showModal('Reset gry', 'Czy na pewno chcesz zresetować grę?',
        'Resetuj', 'modal-btn-confirm',
        () => {
            if (currentGameId) socket.emit('hideWinner', {gameId:currentGameId});

            gameState.team1.score=0; gameState.team1.strikes=0;
            gameState.team2.score=0; gameState.team2.strikes=0;
            gameState.currentTeam=null; gameState.roundPoints=0;
            gameState.multiplier=1; gameState.currentQuestionIndex=-1;
            gameState.currentQuestion=null; gameState.questionRevealed=false;
            gameState.revealedAnswers=[]; gameState.isStealMode=false;
            gameState.stealUsed=false; gameState.pointsAwarded=false;
            gameState.failedTeam=null;

            document.querySelectorAll('.round-btn').forEach((b,i) =>
                b.classList.toggle('active', i===0));

            updateUI(); sendStateUpdate();
        });
}

function updateHeaderCodes() {
    $('headerCodes').textContent =
        `KOD HOSTA: ${currentHostCode} | KOD TV: ${currentTvCode}`;
}

function openTV() {
    if (!currentTvCode) return;
    window.open(`/tv?code=${currentTvCode}`, 'RodziniadaTV', 'width=1920,height=1080');
}

function startDisplay() {
    if (!currentGameId) return;
    socket.emit('startDisplay', {gameId:currentGameId});
}

function toggleSound() {
    gameState.soundEnabled = !gameState.soundEnabled;
    updateUI(); sendStateUpdate();
}

function toggleFullscreenHost() {
    if (!document.fullscreenElement)
        document.documentElement.requestFullscreen().catch(()=>{});
    else
        document.exitFullscreen().catch(()=>{});
}

// ===== ZWYCIĘZCA =====
function canShowWinner() {
    const s = gameState;
    if (!s.selectedQuestions || s.selectedQuestions.length === 0) return false;
    if (s.currentQuestionIndex !== s.selectedQuestions.length - 1) return false;
    if (!s.pointsAwarded) return false;
    if (s.team1.score === s.team2.score) return false;
    if (s.team1.score === 0 && s.team2.score === 0) return false;
    return true;
}

function showWinner() {
    if (!currentGameId) return;
    if (!canShowWinner()) {
        showToast('Nie można ogłosić zwycięzcy!', 'error');
        return;
    }

    const s1 = gameState.team1.score;
    const s2 = gameState.team2.score;
    const winnerName = s1 > s2 ? gameState.team1.name : gameState.team2.name;

    socket.emit('showWinner', {gameId: currentGameId, winnerName});

    setTimeout(() => {
        if (currentGameId) {
            socket.emit('endGame', {gameId: currentGameId});
        }
        backToMenuUIOnly();
    }, 10000);
}

function updateWinnerButton() {
    const btns = document.querySelectorAll('.winner-button');
    const can  = canShowWinner();
    btns.forEach(btn => {
        btn.disabled      = !can;
        btn.style.opacity = can ? '1' : '0.4';
        btn.style.cursor  = can ? 'pointer' : 'not-allowed';
        btn.title = can
            ? 'Ogłoś zwycięzcę'
            : 'Dostępne po ukończeniu wszystkich pytań (bez remisu)';
    });
}

// ===== UI =====
function updateUI() {
    const bm = $('btnMute');
    if (bm) bm.textContent = gameState.soundEnabled ? '🔊' : '🔇';

    $('team1NameDisplay').textContent = gameState.team1.name.toUpperCase();
    $('team2NameDisplay').textContent = gameState.team2.name.toUpperCase();
    $('team1Score').textContent = `${gameState.team1.score} pkt`;
    $('team2Score').textContent = `${gameState.team2.score} pkt`;

    for (let i=1;i<=3;i++) {
        $(`team1Strike${i}`).classList.toggle('active', i<=gameState.team1.strikes);
        $(`team2Strike${i}`).classList.toggle('active', i<=gameState.team2.strikes);
    }

    const t1=$('team1Box'), t2=$('team2Box');
    t1.classList.remove('active','warning');
    t2.classList.remove('active','warning');

    if (gameState.currentTeam===1) {
        t1.classList.add('active');
        if (gameState.team1.strikes===2 && gameState.questionRevealed &&
            !gameState.pointsAwarded && !gameState.isStealMode) t2.classList.add('warning');
    } else if (gameState.currentTeam===2) {
        t2.classList.add('active');
        if (gameState.team2.strikes===2 && gameState.questionRevealed &&
            !gameState.pointsAwarded && !gameState.isStealMode) t1.classList.add('warning');
    }

    $('roundPoints').textContent = `${gameState.roundPoints} pkt`;
    $('multiplier').textContent = `×${gameState.multiplier}`;
    $('questionProgress').textContent = gameState.currentQuestionIndex >= 0
        ? `${gameState.currentQuestionIndex+1} / ${gameState.selectedQuestions.length}`
        : `0 / ${gameState.selectedQuestions.length}`;

    const qs=$('questionStatus'), br=$('btnReveal');
    const nt = !gameState.currentTeam && gameState.revealedAnswers.length>=2 &&
               gameState.questionRevealed && !gameState.pointsAwarded;

    qs.className = 'question-status';

    if (gameState.pointsAwarded) {
        qs.textContent = 'Punkty przyznane - przejdź dalej';
        qs.classList.add('revealed'); br.style.display='none';
    } else if (nt) {
        qs.textContent = 'Wybierz drużynę aby kontynuować!';
        qs.classList.add('locked'); br.style.display='none';
    } else if (gameState.questionRevealed) {
        if (gameState.isStealMode) {
            qs.textContent = 'PRZEJĘCIE - jedna szansa!';
            qs.classList.add('warning');
        } else if ((gameState.team1.strikes===2&&gameState.currentTeam===1)||
                   (gameState.team2.strikes===2&&gameState.currentTeam===2)) {
            qs.textContent = 'Ostatnia szansa - 2 błędy!';
            qs.classList.add('warning');
        } else {
            qs.textContent = 'Gra aktywna';
            qs.classList.add('revealed');
        }
        br.style.display='none';
    } else if (gameState.currentQuestion) {
        qs.textContent = 'Pytanie ukryte'; br.style.display='block';
    } else {
        qs.textContent = 'Załaduj pytanie strzałką →'; br.style.display='none';
    }

    $('currentQuestionText').textContent = gameState.currentQuestion
        ? gameState.currentQuestion.text : 'Naciśnij → aby załadować pytanie';

    renderAnswers();
    updateRevealAllButton();
    updateWinnerButton();
    updateNextQuestionPreview();
}

function updateRevealAllButton() {
    const btn = $('btnRevealAll');
    if (!btn || !gameState.currentQuestion) return;
    btn.disabled = !(gameState.pointsAwarded &&
        gameState.revealedAnswers.length < gameState.currentQuestion.answers.length);
}

function renderAnswers() {
    const c = $('answersContainer');
    if (!gameState.currentQuestion) {
        c.innerHTML = '<div class="answers-empty">Naciśnij → aby załadować pytanie</div>';
        return;
    }
    const nt = !gameState.currentTeam && gameState.revealedAnswers.length>=2 && !gameState.pointsAwarded;

    c.innerHTML = gameState.currentQuestion.answers.map((a,i) => {
        const r = gameState.revealedAnswers.includes(i);
        const d = !gameState.questionRevealed || r || nt || gameState.pointsAwarded;
        return `<button class="answer-btn ${r?'revealed':''}" onclick="revealAnswer(${i})" ${d?'disabled':''}>
            <span class="answer-number">${i+1}</span>
            <span class="answer-text">${a.text}</span>
            <span class="answer-points">${a.points} pkt</span>
        </button>`;
    }).join('');
}

// ===== LOGIKA GRY =====
function selectTeam(n) {
    if (gameState.isStealMode||gameState.pointsAwarded) return;
    gameState.currentTeam=n; updateUI(); sendStateUpdate();
}

function addStrike(n) {
    if (!gameState.questionRevealed||gameState.currentTeam!==n||gameState.pointsAwarded) return;
    const team = n===1?gameState.team1:gameState.team2;

    if (gameState.isStealMode) {
        gameState.stealUsed=true; team.strikes=1;
        socket.emit('showBigX',{gameId:currentGameId,count:1});
        setTimeout(()=>{
            if(gameState.roundPoints>0&&gameState.failedTeam) awardPoints(gameState.failedTeam);
            else gameState.pointsAwarded=true;
            endStealMode(); updateUI(); sendStateUpdate();
        },1500);
    } else {
        team.strikes++;
        socket.emit('showBigX',{gameId:currentGameId,count:team.strikes});
        if (team.strikes>=3&&!gameState.stealUsed) activateStealMode(n);
        else if (team.strikes>=3&&gameState.stealUsed) {
            setTimeout(()=>{
                gameState.roundPoints=0; gameState.pointsAwarded=true;
                updateUI(); sendStateUpdate();
            },1500);
        }
    }
    updateUI(); sendStateUpdate();
}

function activateStealMode(f) {
    gameState.isStealMode=true; gameState.failedTeam=f;
    const o=f===1?2:1; gameState.currentTeam=o;
    if(o===1) gameState.team1.strikes=0; else gameState.team2.strikes=0;
    updateUI(); sendStateUpdate();
}

function endStealMode() {
    gameState.isStealMode=false; gameState.failedTeam=null; gameState.currentTeam=null;
    updateUI(); sendStateUpdate();
}

function awardPoints(n) {
    if(!gameState.roundPoints||gameState.pointsAwarded) return;
    const team=n===1?gameState.team1:gameState.team2;
    team.score+=gameState.roundPoints;
    socket.emit('showPoints',{gameId:currentGameId,points:gameState.roundPoints,teamName:team.name});
    gameState.pointsAwarded=true; gameState.roundPoints=0;
    updateUI(); sendStateUpdate();
}

function revealQuestion() {
    if(gameState.questionRevealed||!gameState.currentQuestion) return;
    gameState.questionRevealed=true; updateUI(); sendStateUpdate();
}

function revealAnswer(i) {
    if(!gameState.questionRevealed||gameState.revealedAnswers.includes(i)||gameState.pointsAwarded) return;
    if(!gameState.currentTeam&&gameState.revealedAnswers.length>=2) return;

    gameState.revealedAnswers.push(i);
    gameState.roundPoints+=gameState.currentQuestion.answers[i].points*gameState.multiplier;
    socket.emit('playRevealSound',{gameId:currentGameId});

    if(gameState.isStealMode&&gameState.currentTeam) {
        setTimeout(()=>{awardPoints(gameState.currentTeam);endStealMode();},800);
    } else if(gameState.revealedAnswers.length===gameState.currentQuestion.answers.length&&
              gameState.currentTeam&&!gameState.pointsAwarded) {
        setTimeout(()=>awardPoints(gameState.currentTeam),500);
    }
    updateUI(); sendStateUpdate();
}

function updateNextQuestionPreview() {
    const container = $('questionsListPreview');
    if (!container) return;

    const questions = gameState.selectedQuestions;

    if (!questions || questions.length === 0) {
        container.innerHTML = '<div class="next-q-empty">Brak pytań</div>';
        return;
    }

    container.innerHTML = questions.map((q, i) => {
        const isCurrent = i === gameState.currentQuestionIndex;
        const isDone    = i < gameState.currentQuestionIndex;
        const isNext    = i === gameState.currentQuestionIndex + 1;

        const count  = q.answers.length;
        const maxPts = Math.max(...q.answers.map(a => a.points));
        const minPts = Math.min(...q.answers.map(a => a.points));
        const label  = count < 5 ? 'odp.' : 'odp.';

        return `
            <div class="qlist-item ${isCurrent ? 'qlist-current' : ''} ${isDone ? 'qlist-done' : ''} ${isNext ? 'qlist-next' : ''}">
                <div class="qlist-num">${i + 1}</div>
                <div class="qlist-info">
                    <div class="qlist-text">${escapeHtml(q.text)}</div>
                    <div class="qlist-meta">
                        <span class="next-q-badge">${count} ${label}</span>
                        <span class="next-q-badge">${minPts}–${maxPts} pkt</span>
                    </div>
                </div>
                <div class="qlist-status">
                    ${isDone    ? '<span class="qlist-icon done">✓</span>'    : ''}
                    ${isCurrent ? '<span class="qlist-icon current">▶</span>' : ''}
                    ${isNext    ? '<span class="qlist-icon next">→</span>'    : ''}
                </div>
            </div>
        `;
    }).join('');

    // Przewiń do aktualnego pytania
    const currentEl = container.querySelector('.qlist-current');
    if (currentEl) {
        currentEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
}

function revealAll() {
    if(!gameState.questionRevealed||!gameState.pointsAwarded||!gameState.currentQuestion) return;
    gameState.currentQuestion.answers.forEach((_,i)=>{
        if(!gameState.revealedAnswers.includes(i)) gameState.revealedAnswers.push(i);
    });
    updateUI(); sendStateUpdate();
}

function loadQuestion(i) {
    if(i<0||i>=gameState.selectedQuestions.length) return;
    gameState.currentQuestionIndex=i;
    gameState.currentQuestion=gameState.selectedQuestions[i];
    gameState.questionRevealed=false; gameState.revealedAnswers=[];
    gameState.roundPoints=0; gameState.currentTeam=null;
    gameState.isStealMode=false; gameState.stealUsed=false;
    gameState.pointsAwarded=false; gameState.failedTeam=null;
    gameState.team1.strikes=0; gameState.team2.strikes=0;
    updateUI(); sendStateUpdate();
}

function nextQuestion() {
    if(gameState.currentQuestionIndex===-1&&gameState.selectedQuestions.length>0) loadQuestion(0);
    else if(gameState.currentQuestionIndex<gameState.selectedQuestions.length-1)
        loadQuestion(gameState.currentQuestionIndex+1);
}

function previousQuestion() {
    if(gameState.questionRevealed&&!gameState.pointsAwarded) {
        showModal('Cofnij pytanie','Runda jest w toku! Cofnąć?','Cofnij','modal-btn-confirm',
            ()=>{ if(gameState.currentQuestionIndex>0) loadQuestion(gameState.currentQuestionIndex-1); });
        return;
    }
    if(gameState.currentQuestionIndex>0) loadQuestion(gameState.currentQuestionIndex-1);
}

function setMultiplier(v) {
    gameState.multiplier=v;
    document.querySelectorAll('.round-btn').forEach(b=>
        b.classList.toggle('active',b.textContent.trim()===`×${v}`));
    updateUI(); sendStateUpdate();
}

// ===== KLAWISZE =====
document.addEventListener('keydown', (e) => {
    if($('modalOverlay').classList.contains('show')) {
        if(e.key==='Escape') closeModal(); return;
    }
    if(e.target.tagName==='INPUT') return;
    if(!$('gameScreen').classList.contains('active')) return;

    switch(e.key) {
        case ' ': e.preventDefault(); revealQuestion(); break;
        case 'q':case 'Q': selectTeam(1); break;
        case 'w':case 'W': selectTeam(2); break;
        case 'x':case 'X': if(gameState.currentTeam) addStrike(gameState.currentTeam); break;
        case '1':case '2':case '3':case '4':
        case '5':case '6':case '7':case '8':
            revealAnswer(parseInt(e.key)-1); break;
        case 'r':case 'R': revealAll(); break;
        case 'z':case 'Z': showWinner(); break;
        case 'ArrowLeft': previousQuestion(); break;
        case 'ArrowRight': nextQuestion(); break;
        case 'Escape': closeModal(); break;
    }
});

// ===== EKSPORT =====
window.showSetupScreen       = showSetupScreen;
window.backToLobby           = backToLobby;
window.filterGames           = filterGames;
window.joinGameAsTv          = joinGameAsTv;
window.showCategories        = showCategories;
window.toggleCategory        = toggleCategory;
window.updateSelectedQuestions = updateSelectedQuestions;
window.startGame             = startGame;
window.selectTeam            = selectTeam;
window.addStrike             = addStrike;
window.awardPoints           = awardPoints;
window.revealQuestion        = revealQuestion;
window.revealAnswer          = revealAnswer;
window.revealAll             = revealAll;
window.previousQuestion      = previousQuestion;
window.nextQuestion          = nextQuestion;
window.setMultiplier         = setMultiplier;
window.resetGame             = resetGame;
window.endGameAndBackToMenu  = endGameAndBackToMenu;
window.openTV                = openTV;
window.startDisplay          = startDisplay;
window.toggleSound           = toggleSound;
window.toggleFullscreenHost  = toggleFullscreenHost;
window.showWinner            = showWinner;
window.closeModal            = closeModal;
window.switchMode            = switchMode;
window.toggleRandomCat       = toggleRandomCat;
window.selectRounds          = selectRounds;
window.drawQuestions         = drawQuestions;