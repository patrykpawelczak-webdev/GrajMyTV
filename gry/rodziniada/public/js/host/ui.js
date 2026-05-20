import { $, escapeHtml, normalizeStr } from './utils.js';

// ===== SAFE DOM HELPERS =====
function safeClass(id, className, action) {
    const el = $(id);
    if (!el) return;
    if (action === 'add') el.classList.add(className);
    else if (action === 'remove') el.classList.remove(className);
    else if (action === 'toggle') el.classList.toggle(className);
}

export function safeAdd(id, className) { safeClass(id, className, 'add'); }
export function safeRemove(id, className) { safeClass(id, className, 'remove'); }

// ===== MODAL =====
export function showModal(title, message, confirmText, confirmClass, onConfirm) {
    const t = $('modalTitle');
    if (t) t.textContent = title;
    const m = $('modalMessage');
    if (m) m.textContent = message;
    const oldBtn = $('modalConfirmBtn');
    if (oldBtn) {
        const newBtn = oldBtn.cloneNode(true);
        oldBtn.parentNode.replaceChild(newBtn, oldBtn);
        newBtn.textContent = confirmText || 'Potwierdź';
        newBtn.className = `btn ${confirmClass || 'btn--primary'}`;
        newBtn.addEventListener('click', () => { closeModal(); if (onConfirm) onConfirm(); });
    }
    const o = $('modalOverlay');
    if (o) o.classList.add('show');
}

export function closeModal() {
    const o = $('modalOverlay');
    if (o) o.classList.remove('show');
}

// ===== TOAST =====
let toastTimer = null;
export function showToast(msg, type = 'info') {
    let toast = $('hostToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'hostToast';
        toast.className = 'toast';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.className = `toast show toast--${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 3000);
}

// ===== EKRANY =====
export function showLobbyScreen() {
    safeRemove('lobbyScreen', 'hidden');
    safeAdd('gameTypeSelectionScreen', 'hidden');
    safeAdd('setupScreen', 'hidden');
    safeAdd('setupScreenOnline', 'hidden');
    safeAdd('onlineLobbyScreen', 'hidden');
    safeRemove('gameScreen', 'active');
}

export function showGameTypeSelectionScreen() {
    safeAdd('lobbyScreen', 'hidden');
    safeRemove('gameTypeSelectionScreen', 'hidden');
    safeAdd('setupScreen', 'hidden');
    safeAdd('setupScreenOnline', 'hidden');
    safeAdd('onlineLobbyScreen', 'hidden');
    safeRemove('gameScreen', 'active');
}

export function showSetupScreenLocal() {
    safeAdd('lobbyScreen', 'hidden');
    safeAdd('gameTypeSelectionScreen', 'hidden');
    safeRemove('setupScreen', 'hidden');
    safeAdd('setupScreenOnline', 'hidden');
    safeAdd('onlineLobbyScreen', 'hidden');
    safeRemove('gameScreen', 'active');
    
    const nameInput = $('setupGameName');
    if (nameInput) nameInput.value = '';
    const team1Input = $('setupTeam1Name');
    if (team1Input) team1Input.value = 'Drużyna 1';
    const team2Input = $('setupTeam2Name');
    if (team2Input) team2Input.value = 'Drużyna 2';
}

export function showSetupScreenOnline() {
    safeAdd('lobbyScreen', 'hidden');
    safeAdd('gameTypeSelectionScreen', 'hidden');
    safeAdd('setupScreen', 'hidden');
    safeRemove('setupScreenOnline', 'hidden');
    safeAdd('onlineLobbyScreen', 'hidden');
    safeRemove('gameScreen', 'active');
    
    const nameInput = $('setupGameNameOnline');
    if (nameInput) nameInput.value = '';
}

export function showOnlineLobbyScreen(roomName, code) {
    safeAdd('lobbyScreen', 'hidden');
    safeAdd('gameTypeSelectionScreen', 'hidden');
    safeAdd('setupScreen', 'hidden');
    safeAdd('setupScreenOnline', 'hidden');
    safeRemove('onlineLobbyScreen', 'hidden');
    safeRemove('gameScreen', 'active');

    // Formatuj kod bez spacji (zgodnie z wymaganiem użytkownika)
    const formattedCode = String(code);
    const codeEl = $('lobbyJoinCode');
    if (codeEl) codeEl.textContent = formattedCode;
    const nameEl = $('lobbyRoomName');
    if (nameEl) nameEl.textContent = roomName;

    // Pusta lista zostanie wyrenderowana przez zdarzenie z serwera, ale możemy tu zresetować widok
}

export function renderLobbyPlayers(lobby, isHost) {
    if (!lobby) return;

    function createPlayerHTML(p) {
        if (!p) return '';
        const isCreator = (p.id === 'creator');
        return `
            <div class="player-item ${isCreator ? 'creator' : ''}" data-player-id="${p.id}" ${isHost ? 'draggable="true"' : ''}>
                ${isCreator ? '<span class="player-crown">👑</span>' : '<span class="player-icon">👤</span>'}
                <span class="player-name">${escapeHtml(p.name)}</span>
                ${isCreator ? '<span class="player-role-badge">Założyciel</span>' : ''}
            </div>
        `;
    }

    const unassignedContainer = $('lobbyPlayerList');
    if (unassignedContainer) {
        unassignedContainer.innerHTML = lobby.unassigned.map(createPlayerHTML).join('');
    }

    const presenterContainer = $('rolePresenterContainer');
    if (presenterContainer) {
        presenterContainer.innerHTML = lobby.presenter ? createPlayerHTML(lobby.presenter) : '';
    }

    const team1Container = $('lobbyPlayers1');
    if (team1Container) {
        team1Container.innerHTML = lobby.team1.map(createPlayerHTML).join('');
    }

    const team2Container = $('lobbyPlayers2');
    if (team2Container) {
        team2Container.innerHTML = lobby.team2.map(createPlayerHTML).join('');
    }

    checkEmptyZones();
    updateTeamCounts();

    if (isHost) {
        initDragAndDrop(window.onLobbyDrop);
    }
}

export function showGameScreen() {
    safeAdd('lobbyScreen', 'hidden');
    safeAdd('gameTypeSelectionScreen', 'hidden');
    safeAdd('setupScreen', 'hidden');
    safeAdd('setupScreenOnline', 'hidden');
    safeAdd('onlineLobbyScreen', 'hidden');
    safeAdd('gameScreen', 'active');
}

// ===== RENDEROWANIE =====
export function renderGamesList(games, filterQuery = '', joinGameAsTvCallback) {
    console.log("RODZINIADA renderGamesList received all games:", games);
    const body = $('lobbyTableBody');
    const empty = $('lobbyEmpty');

    // Przywracamy wyświetlanie wszystkich gier (zarówno lokalnych, jak i online)
    let filtered = [...games];

    if (filterQuery) {
        filtered = filtered.filter(g => g.name.toLowerCase().includes(filterQuery.toLowerCase()));
    }

    if (!filtered || filtered.length === 0) {
        body.innerHTML = '';
        body.appendChild(empty);
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    body.innerHTML = filtered.map(g => {
        const isOnline = !!g.isOnline;
        const rowClass = isOnline ? 'lobby-row-online' : 'lobby-row-local';
        const badgeClass = isOnline ? 'game-badge-online' : 'game-badge-local';
        const badgeText = isOnline ? 'Online' : 'Lokalna';
        const btnClass = isOnline ? 'lobby-btn-online' : 'lobby-btn-local';
        const btnText = isOnline ? 'Dołącz do lobby' : 'Ekran TV';
        const onClickHandler = isOnline 
            ? `joinGameAsTv('${g.tvCode}')` 
            : `openTvDirectly()`;

        return `
            <div class="lobby-row ${rowClass}" data-id="${g.gameId}">
                <div class="lobby-col-name" style="display: flex; align-items: center; gap: 4px;">
                    <span class="game-badge ${badgeClass}">${badgeText}</span>
                    <div class="lobby-game-name">${escapeHtml(g.name)}</div>
                </div>
                <div class="lobby-col-actions">
                    <button class="lobby-btn ${btnClass}" onclick="${onClickHandler}">
                        ${btnText}
                    </button>
                </div>
            </div>
        `;
    }).join('');
}

export function updateHeaderCodes(hostCode, tvCode) {
    $('headerCodes').textContent = `KOD TV: ${tvCode}`;
}

export function updateUI(gameState, revealAnswerCallback) {
    if (!gameState) return;
    
    const hostBlockOverlay = $('hostBlockOverlay');
    if (hostBlockOverlay) {
        if (gameState.displayStarted) hostBlockOverlay.classList.add('hidden');
        else hostBlockOverlay.classList.remove('hidden');
    }

    const bm = $('btnMute');
    if (bm) bm.textContent = gameState.soundEnabled ? '🔊' : '🔇';

    $('team1NameDisplay').textContent = gameState.team1.name.toUpperCase();
    $('team2NameDisplay').textContent = gameState.team2.name.toUpperCase();
    $('team1Score').textContent = `${gameState.team1.score} pkt`;
    $('team2Score').textContent = `${gameState.team2.score} pkt`;

    for (let i = 1; i <= 3; i++) {
        $(`team1Strike${i}`).classList.toggle('active', i <= gameState.team1.strikes);
        $(`team2Strike${i}`).classList.toggle('active', i <= gameState.team2.strikes);
    }

    const t1 = $('team1Box'), t2 = $('team2Box');
    t1.classList.remove('active', 'warning');
    t2.classList.remove('active', 'warning');

    if (!gameState.isStealMode) {
        if (gameState.currentTeam === 1) t1.classList.add('active');
        else if (gameState.currentTeam === 2) t2.classList.add('active');
    }

    $('roundPoints').textContent = `${gameState.roundPoints} pkt`;
    $('multiplier').textContent = `×${gameState.multiplier}`;
    $('questionProgress').textContent = gameState.currentQuestionIndex >= 0
        ? `${gameState.currentQuestionIndex + 1} / ${gameState.selectedQuestions.length}`
        : `0 / ${gameState.selectedQuestions.length}`;

    const qs = $('questionStatus'), br = $('btnReveal');
    const hasTopAnswer = gameState.revealedAnswers.includes(0);
    const nt = !gameState.currentTeam && (hasTopAnswer || gameState.revealedAnswers.length >= 2) && gameState.questionRevealed && !gameState.pointsAwarded;

    qs.className = 'question-status';

    if (gameState.pointsAwarded) {
        qs.textContent = 'Punkty przyznane - przejdź dalej';
        qs.classList.add('revealed'); br.style.display = 'none';
    } else if (nt) {
        qs.textContent = 'Wybierz drużynę aby kontynuować!';
        qs.classList.add('locked'); br.style.display = 'none';
    } else if (gameState.questionRevealed) {
        if (gameState.isStealMode) {
            qs.textContent = 'PRZEJĘCIE - jedna szansa!';
            qs.classList.add('warning');
        } else {
            qs.textContent = 'Gra aktywna';
            qs.classList.add('revealed');
        }
        br.style.display = 'none';
    } else if (gameState.currentQuestion) {
        qs.textContent = 'Pytanie ukryte'; br.style.display = 'block';
    } else {
        qs.textContent = 'Załaduj pytanie strzałką →'; br.style.display = 'none';
    }

    const bra = $('btnRevealAll');
    if (bra) {
        bra.disabled = !gameState.pointsAwarded;
        bra.style.opacity = gameState.pointsAwarded ? '1' : '0.5';
        bra.style.cursor = gameState.pointsAwarded ? 'pointer' : 'not-allowed';
    }

    $('currentQuestionText').textContent = gameState.currentQuestion ? gameState.currentQuestion.text : 'Naciśnij → aby załadować pytanie';

    renderAnswers(gameState, revealAnswerCallback);
    updateWinnerButton(gameState);
    updateNextQuestionPreview(gameState);
}

function renderAnswers(gameState, revealAnswerCallback) {
    const c = $('answersContainer');
    if (!gameState.currentQuestion) {
        c.innerHTML = '<div class="answers-empty">Naciśnij → aby załadować pytanie</div>';
        return;
    }
    const hasTopAnswer = gameState.revealedAnswers.includes(0);
    const nt = !gameState.currentTeam && (hasTopAnswer || gameState.revealedAnswers.length >= 2) && !gameState.pointsAwarded;

    c.innerHTML = gameState.currentQuestion.answers.map((a, i) => {
        const r = gameState.revealedAnswers.includes(i);
        const d = !gameState.questionRevealed || r || nt || gameState.pointsAwarded;
        return `<button class="answer-btn ${r ? 'revealed' : ''}" onclick="revealAnswer(${i})" ${d ? 'disabled' : ''}>
            <span class="answer-number">${i + 1}</span>
            <span class="answer-text">${a.text}</span>
            <span class="answer-points">${a.points} pkt</span>
        </button>`;
    }).join('');
}

function updateWinnerButton(gameState) {
    const btns = document.querySelectorAll('.winner-button');
    const can = canShowWinner(gameState);
    btns.forEach(btn => {
        btn.disabled = !can;
        btn.style.opacity = can ? '1' : '0.4';
        btn.style.cursor = can ? 'pointer' : 'not-allowed';
        btn.title = can ? 'Ogłoś zwycięzcę' : 'Dostępne po ukończeniu wszystkich pytań (bez remisu)';
    });
}

// ===== DRAG & DROP W LOBBY =====
let currentDropCallback = null;

export function initDragAndDrop(onDropCallback) {
    if (onDropCallback) currentDropCallback = onDropCallback;

    const draggables = document.querySelectorAll('.player-item[draggable="true"]');
    const dropZones = document.querySelectorAll('.drop-zone');

    draggables.forEach(draggable => {
        draggable.removeEventListener('dragstart', handleDragStart);
        draggable.removeEventListener('dragend', handleDragEnd);
        draggable.addEventListener('dragstart', handleDragStart);
        draggable.addEventListener('dragend', handleDragEnd);
    });

    dropZones.forEach(zone => {
        zone.removeEventListener('dragover', handleDragOver);
        zone.removeEventListener('drop', handleDrop);
        zone.addEventListener('dragover', handleDragOver);
        zone.addEventListener('drop', handleDrop);
    });
}

function handleDragStart(e) {
    this.classList.add('dragging');
}

function handleDragEnd(e) {
    this.classList.remove('dragging');
    checkEmptyZones();
}

function handleDragOver(e) {
    e.preventDefault(); // Pozwala na upuszczenie
}

function handleDrop(e) {
    e.preventDefault();
    const dragging = document.querySelector('.dragging');
    if (dragging) {
        // Jeśli wrzucamy do prowadzącego (rolę hosta), może tam być tylko jedna osoba
        if (this.id === 'rolePresenterContainer') {
            const existingPlayers = this.querySelectorAll('.player-item');
            if (existingPlayers.length > 0) {
                // Przenieś obecnego prowadzącego z powrotem do listy nieprzydzielonych
                const unassignedZone = document.getElementById('lobbyPlayerList');
                if (unassignedZone) {
                    existingPlayers.forEach(p => unassignedZone.appendChild(p));
                }
            }
        }

        const emptyItalic = this.querySelector('.player-item-empty-italic');
        if (emptyItalic) emptyItalic.remove();
        
        this.appendChild(dragging);
        updateTeamCounts();
        
        if (currentDropCallback) {
            currentDropCallback(rebuildLobbyStateFromDOM());
        }
    }
}

function rebuildLobbyStateFromDOM() {
    const parseList = (containerId) => {
        const container = document.getElementById(containerId);
        if (!container) return [];
        return Array.from(container.querySelectorAll('.player-item')).map(el => ({
            id: el.dataset.playerId,
            name: el.querySelector('.player-name').textContent
        }));
    };

    const presenterList = parseList('rolePresenterContainer');
    return {
        unassigned: parseList('lobbyPlayerList'),
        presenter: presenterList.length > 0 ? presenterList[0] : null,
        team1: parseList('lobbyPlayers1'),
        team2: parseList('lobbyPlayers2')
    };
}

function checkEmptyZones() {
    const dropZones = document.querySelectorAll('.drop-zone');
    dropZones.forEach(zone => {
        const players = zone.querySelectorAll('.player-item');
        if (players.length === 0) {
            let emptyText = "Brak graczy";
            if (zone.id === 'rolePresenterContainer') emptyText = "Przeciągnij tutaj prowadzącego";
            else if (zone.id === 'lobbyPlayers1' || zone.id === 'lobbyPlayers2') emptyText = "Przeciągnij graczy";
            else emptyText = "Oczekiwanie na graczy...";
            
            if (!zone.querySelector('.player-item-empty-italic')) {
                const el = document.createElement('div');
                el.className = 'player-item-empty-italic';
                el.textContent = emptyText;
                zone.appendChild(el);
            }
        }
    });
}

function updateTeamCounts() {
    const t1 = document.getElementById('lobbyPlayers1');
    if (t1) {
        const count = t1.querySelectorAll('.player-item').length;
        const badge = document.getElementById('lobbyTeam1Count');
        if (badge) badge.textContent = count;
    }
    const t2 = document.getElementById('lobbyPlayers2');
    if (t2) {
        const count = t2.querySelectorAll('.player-item').length;
        const badge = document.getElementById('lobbyTeam2Count');
        if (badge) badge.textContent = count;
    }
}

function canShowWinner(gameState) {
    const s = gameState;
    if (!s.selectedQuestions || s.selectedQuestions.length === 0) return false;
    if (s.currentQuestionIndex !== s.selectedQuestions.length - 1) return false;
    if (!s.pointsAwarded) return false;
    if (s.team1.score === s.team2.score) return false;
    if (s.team1.score === 0 && s.team2.score === 0) return false;
    return true;
}

export function updateNextQuestionPreview(gameState) {
    const container = $('questionsListPreview');
    if (!container) return;
    const questions = gameState.selectedQuestions;
    if (!questions || questions.length === 0) {
        container.innerHTML = '<div class="next-q-empty">Brak pytań</div>';
        return;
    }
    container.innerHTML = questions.map((q, i) => {
        const isCurrent = i === gameState.currentQuestionIndex;
        const isDone = i < gameState.currentQuestionIndex;
        const isNext = i === gameState.currentQuestionIndex + 1;
        const count = q.answers.length;
        const maxPts = Math.max(...q.answers.map(a => a.points));
        const minPts = Math.min(...q.answers.map(a => a.points));
        return `
            <div class="qlist-item ${isCurrent ? 'qlist-current' : ''} ${isDone ? 'qlist-done' : ''} ${isNext ? 'qlist-next' : ''}">
                <div class="qlist-num">${i + 1}</div>
                <div class="qlist-info">
                    <div class="qlist-text">${escapeHtml(q.text)}</div>
                    <div class="qlist-meta">
                        <span class="next-q-badge">${count} odp.</span>
                        <span class="next-q-badge">${minPts}–${maxPts} pkt</span>
                    </div>
                </div>
                <div class="qlist-status">
                    ${isDone ? '<span class="qlist-icon done">✓</span>' : ''}
                    ${isCurrent ? '<span class="qlist-icon current">▶</span>' : ''}
                    ${isNext ? '<span class="qlist-icon next">→</span>' : ''}
                </div>
            </div>
        `;
    }).join('');
    const currentEl = container.querySelector('.qlist-current');
    if (currentEl) currentEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function renderCategoriesSetup(questionCategories, toggleCategoryCallback, updateSelectedQuestionsCallback) {
    const grid = $('categoriesGrid');
    const nonEmpty = questionCategories
        .map((cat, idx) => ({ ...cat, originalIndex: idx }))
        .filter(cat => cat.questions.length > 0);

    if (nonEmpty.length === 0) {
        grid.innerHTML = '<div class="no-questions">Brak pytań do wyświetlenia</div>';
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
                    ${category.questions.map((q, qi) => `
                        <label class="category-question-item" style="cursor: pointer;" onclick="event.stopPropagation()">
                            <input type="checkbox" class="category-question-checkbox"
                                   id="q${ci}_${qi}" onchange="onQuestionCheckChange(${ci}, ${qi}, this.checked)">
                            <span class="category-question-text">${escapeHtml(q.text)}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }).join('');
}

export function renderRandomCats(questionCategories, toggleRandomCatCallback) {
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
            <div class="random-cat-card" id="randomCat_${ci}" onclick="toggleRandomCat(${ci})">
                <span class="random-cat-icon">${cat.icon}</span>
                <span class="random-cat-name">${cat.name}</span>
                <span class="random-cat-count">${cat.questions.length} pyt.</span>
                <div class="random-cat-check"></div>
            </div>
        `;
    }).join('');
}

export function renderRandomPreview(drawnQuestions) {
    const preview = $('randomPreview');
    const list = $('randomPreviewList');
    if (!preview || !list) return;
    list.innerHTML = drawnQuestions.map((q, i) => `
        <div class="preview-question-item">
            <span class="preview-q-num">${i + 1}</span>
            <div class="preview-q-info">
                <div class="preview-q-cat">${q._catIcon} ${q._catName}</div>
                <div class="preview-q-text">${escapeHtml(q.text)}</div>
                <div class="preview-q-answers">
                    ${q.answers.map(a => `<span class="preview-answer">${escapeHtml(a.text)} (${a.points})</span>`).join('')}
                </div>
            </div>
        </div>
    `).join('');
    preview.classList.remove('hidden');
}

export function updateExcludeList(questionCategories, selectedCatIndexes) {
    const list = $('randomExcludeList');
    if (!list) return;
    if (selectedCatIndexes.length === 0) {
        list.innerHTML = '<div class="random-exclude-empty">Najpierw wybierz kategorie powyżej</div>';
        return;
    }
    let html = '';
    selectedCatIndexes.forEach(ci => {
        const cat = questionCategories[ci];
        html += `<div class="exclude-cat-group">
            <div class="exclude-cat-label">${cat.icon} ${cat.name}</div>
            ${cat.questions.map((q, qi) => `
                <label class="exclude-question-item">
                    <input type="checkbox" class="exclude-checkbox" id="excl_${ci}_${qi}" onchange="onExcludeCheckChange()" checked>
                    <span class="exclude-question-text">${escapeHtml(q.text)}</span>
                </label>
            `).join('')}
        </div>`;
    });
    list.innerHTML = html;
}
