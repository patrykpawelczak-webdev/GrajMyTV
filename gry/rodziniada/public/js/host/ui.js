import { $, escapeHtml, normalizeStr } from './utils.js';

// ===== MODAL =====
export function showModal(title, message, confirmText, confirmClass, onConfirm) {
    $('modalTitle').textContent = title;
    $('modalMessage').textContent = message;
    const oldBtn = $('modalConfirmBtn');
    const newBtn = oldBtn.cloneNode(true);
    oldBtn.parentNode.replaceChild(newBtn, oldBtn);
    newBtn.textContent = confirmText || 'Potwierdź';
    newBtn.className = `btn ${confirmClass || 'btn--primary'}`;
    newBtn.addEventListener('click', () => { closeModal(); if (onConfirm) onConfirm(); });
    $('modalOverlay').classList.add('show');
}

export function closeModal() { $('modalOverlay').classList.remove('show'); }

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
    $('lobbyScreen').classList.remove('hidden');
    $('setupScreen').classList.add('hidden');
    $('gameScreen').classList.remove('active');
}

export function showSetupScreen() {
    $('lobbyScreen').classList.add('hidden');
    $('setupScreen').classList.remove('hidden');
    $('setupGameName').value = '';
    $('setupTeam1Name').value = 'Drużyna 1';
    $('setupTeam2Name').value = 'Drużyna 2';
}

export function showGameScreen() {
    $('lobbyScreen').classList.add('hidden');
    $('setupScreen').classList.add('hidden');
    $('gameScreen').classList.add('active');
}

// ===== RENDEROWANIE =====
export function renderGamesList(games, filterQuery = '', joinGameAsTvCallback) {
    const body = $('lobbyTableBody');
    const empty = $('lobbyEmpty');

    const filtered = filterQuery 
        ? games.filter(g => g.name.toLowerCase().includes(filterQuery.toLowerCase()))
        : games;

    if (!filtered || filtered.length === 0) {
        body.innerHTML = '';
        body.appendChild(empty);
        empty.style.display = 'flex';
        return;
    }

    empty.style.display = 'none';
    body.innerHTML = filtered.map(g => `
        <div class="lobby-row" data-id="${g.gameId}">
            <div class="lobby-col-name">
                <div class="lobby-game-name">${escapeHtml(g.name)}</div>
            </div>
            <div class="lobby-col-actions">
                <button class="lobby-btn lobby-btn-tv" onclick="joinGameAsTv('${g.tvCode}')">
                    Dołącz jako ekran TV
                </button>
            </div>
        </div>
    `).join('');
}

export function updateHeaderCodes(hostCode, tvCode) {
    $('headerCodes').textContent = `KOD HOSTA: ${hostCode} | KOD TV: ${tvCode}`;
}

export function updateUI(gameState, revealAnswerCallback) {
    if (!gameState) return;
    
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

    if (gameState.currentTeam === 1) {
        t1.classList.add('active');
        if (gameState.team1.strikes === 2 && gameState.questionRevealed && !gameState.pointsAwarded && !gameState.isStealMode) t2.classList.add('warning');
    } else if (gameState.currentTeam === 2) {
        t2.classList.add('active');
        if (gameState.team2.strikes === 2 && gameState.questionRevealed && !gameState.pointsAwarded && !gameState.isStealMode) t1.classList.add('warning');
    }

    $('roundPoints').textContent = `${gameState.roundPoints} pkt`;
    $('multiplier').textContent = `×${gameState.multiplier}`;
    $('questionProgress').textContent = gameState.currentQuestionIndex >= 0
        ? `${gameState.currentQuestionIndex + 1} / ${gameState.selectedQuestions.length}`
        : `0 / ${gameState.selectedQuestions.length}`;

    const qs = $('questionStatus'), br = $('btnReveal');
    const nt = !gameState.currentTeam && gameState.revealedAnswers.length >= 2 && gameState.questionRevealed && !gameState.pointsAwarded;

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
        } else if ((gameState.team1.strikes === 2 && gameState.currentTeam === 1) || (gameState.team2.strikes === 2 && gameState.currentTeam === 2)) {
            qs.textContent = 'Ostatnia szansa - 2 błędy!';
            qs.classList.add('warning');
        } else {
            qs.textContent = 'Gra aktywna';
            qs.classList.add('revealed');
        }
        br.style.display = 'none';
    }

    const bra = $('btnRevealAll');
    if (bra) {
        bra.disabled = !gameState.pointsAwarded;
        bra.style.opacity = gameState.pointsAwarded ? '1' : '0.5';
        bra.style.cursor = gameState.pointsAwarded ? 'pointer' : 'not-allowed';
    } else if (gameState.currentQuestion) {
        qs.textContent = 'Pytanie ukryte'; br.style.display = 'block';
    } else {
        qs.textContent = 'Załaduj pytanie strzałką →'; br.style.display = 'none';
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
    const nt = !gameState.currentTeam && gameState.revealedAnswers.length >= 2 && !gameState.pointsAwarded;

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
                        <div class="category-question-item" onclick="event.stopPropagation()">
                            <input type="checkbox" class="category-question-checkbox"
                                   id="q${ci}_${qi}" onchange="updateSelectedQuestions()">
                            <span class="category-question-text">${escapeHtml(q.text)}</span>
                        </div>
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
            <div class="random-cat-card ${i === 0 ? 'selected' : ''}" id="randomCat_${ci}" onclick="toggleRandomCat(${ci})">
                <span class="random-cat-icon">${cat.icon}</span>
                <span class="random-cat-name">${cat.name}</span>
                <span class="random-cat-count">${cat.questions.length} pyt.</span>
                <div class="random-cat-check">${i === 0 ? '✓' : ''}</div>
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
                    <input type="checkbox" class="exclude-checkbox" id="excl_${ci}_${qi}" checked>
                    <span class="exclude-question-text">${escapeHtml(q.text)}</span>
                </label>
            `).join('')}
        </div>`;
    });
    list.innerHTML = html;
}
