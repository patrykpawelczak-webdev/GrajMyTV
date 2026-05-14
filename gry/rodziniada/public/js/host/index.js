import { $, normalizeStr } from './utils.js';
import { createEmptyState, buildInitialStateFromSetup } from './state.js';
import * as ui from './ui.js';
import * as net from './network.js';

const socket = io('/rodziniada');

// ===== STAN GLOBALNY (MODUŁOWY) =====
let questionCategories = [];
let allGames = [];
let categoriesRendered = false;
let currentMode = 'manual';
let selectedRounds = 2;
let drawnQuestions = [];
let gameState = createEmptyState();
let currentGameId = null;
let currentHostCode = null;
let currentTvCode = null;

// ===== INICJALIZACJA =====
document.addEventListener('DOMContentLoaded', async () => {
    $('modalOverlay').addEventListener('click', (e) => {
        if (e.target === $('modalOverlay')) ui.closeModal();
    });
    await loadQuestionsFromServer();
});

async function loadQuestionsFromServer() {
    try {
        const res = await fetch('/rodziniada/api/questions');
        const data = await res.json();
        questionCategories = data.categories || [];
    } catch (e) { questionCategories = []; }
}

// ===== HANDLERY SIECIOWE =====
const netHandlers = {
    onGameCreated: ({ gameId, hostCode, tvCode, state }) => {
        currentGameId = gameId; currentHostCode = hostCode; currentTvCode = tvCode;
        gameState = state;
        ui.showGameScreen();
        ui.updateHeaderCodes(currentHostCode, currentTvCode);
        ui.updateUI(gameState, revealAnswer);
    },
    onJoinedHost: ({ gameId, hostCode, tvCode, state }) => {
        currentGameId = gameId; currentHostCode = hostCode; currentTvCode = tvCode;
        gameState = state;
        ui.showGameScreen();
        ui.updateHeaderCodes(currentHostCode, currentTvCode);
        ui.updateUI(gameState, revealAnswer);
    },
    onJoinError: ({ message }) => {
        ui.showToast(message || 'Nie udało się dołączyć', 'error');
    },
    onGameStateUpdated: ({ gameId, state }) => {
        if (gameId !== currentGameId) return;
        gameState = state;
        ui.updateUI(gameState, revealAnswer);
    },
    onGameEnded: () => {
        backToMenuUIOnly();
    },
    onGamesListUpdated: (games) => {
        allGames = games;
        filterGames();
    }
};

net.setupSocket(socket, netHandlers);

function sendStateUpdate() {
    if (!currentGameId) return;
    net.updateGameState(socket, currentGameId, gameState);
}

// ===== FUNKCJE LOGIKI (EKSPORTOWANE DO WINDOW) =====

window.showSetupScreen = () => {
    ui.showSetupScreen();
    currentMode = 'manual';
    drawnQuestions = [];
    $('modeTabManual')?.classList.add('active');
    $('modeTabRandom')?.classList.remove('active');
    $('modeManual')?.classList.remove('hidden');
    $('modeRandom')?.classList.add('hidden');
    $('randomPreview')?.classList.add('hidden');

    loadQuestionsFromServer().then(() => {
        categoriesRendered = false;
        const btn = $('btnShowCategories');
        const grid = $('categoriesGrid');
        if (btn && grid) {
            btn.classList.remove('hidden');
            grid.classList.add('hidden');
            grid.innerHTML = '';
        }
        updateSelectedQuestions();
    });
};

window.backToLobby = ui.showLobbyScreen;

window.filterGames = () => {
    const query = ($('lobbySearchInput').value || '').trim();
    ui.renderGamesList(allGames, query, window.joinGameAsTv);
};

window.joinGameAsTv = (tvCode) => {
    ui.showModal('Dołącz jako ekran TV', '', 'Dołącz', 'modal-btn-confirm', () => {
        const code = $('lobbyTvCodeInput')?.value?.trim();
        if (!code) { ui.showToast('Wpisz kod TV!', 'error'); return; }
        if (code !== tvCode) { ui.showToast('Nieprawidłowy kod TV!', 'error'); return; }
        window.location.href = `/rodziniada/tv?code=${tvCode}`;
    });

    setTimeout(() => {
        const msgEl = $('modalMessage');
        if (msgEl) {
            msgEl.innerHTML = `
                <p style="margin-bottom:14px;color:#94a3b8;">Wpisz kod TV podany przez prowadzącego.</p>
                <input type="text" id="lobbyTvCodeInput" maxlength="6" inputmode="numeric" placeholder="------" class="tv-code-input-modal">
            `;
            setTimeout(() => {
                const inp = $('lobbyTvCodeInput');
                if (inp) {
                    inp.focus();
                    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('modalConfirmBtn')?.click(); });
                }
            }, 50);
        }
    }, 10);
};

window.showCategories = () => {
    const btn = $('btnShowCategories');
    const grid = $('categoriesGrid');
    if (btn) btn.classList.add('hidden');
    if (grid) grid.classList.remove('hidden');
    if (!categoriesRendered) {
        ui.renderCategoriesSetup(questionCategories, window.toggleCategory, window.updateSelectedQuestions);
        categoriesRendered = true;
    }
};

window.toggleCategory = (ci) => {
    const cat = questionCategories[ci];
    const any = cat.questions.some((_, qi) => $(`q${ci}_${qi}`)?.checked);
    cat.questions.forEach((_, qi) => {
        const cb = $(`q${ci}_${qi}`);
        if (cb) cb.checked = !any;
    });
    updateSelectedQuestions();
};

window.updateSelectedQuestions = () => {
    let count = 0;
    if (currentMode === 'manual') {
        questionCategories.forEach((cat, ci) => {
            cat.questions.forEach((_, qi) => { if ($(`q${ci}_${qi}`)?.checked) count++; });
        });
    } else {
        count = drawnQuestions.length;
    }
    $('selectedCount').textContent = `Wybrano: ${count} ${count === 1 ? 'pytanie' : count < 5 ? 'pytania' : 'pytań'}`;
    $('btnStartGame').disabled = count === 0;
};

window.switchMode = (mode) => {
    currentMode = mode;
    $('modeTabManual').classList.toggle('active', mode === 'manual');
    $('modeTabRandom').classList.toggle('active', mode === 'random');
    $('modeManual').classList.toggle('hidden', mode !== 'manual');
    $('modeRandom').classList.toggle('hidden', mode !== 'random');
    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');
    if (mode === 'random') ui.renderRandomCats(questionCategories, window.toggleRandomCat);
    updateSelectedQuestions();
};

window.toggleRandomCat = (ci) => {
    const card = $(`randomCat_${ci}`);
    if (!card) return;
    card.classList.toggle('selected');
    const check = card.querySelector('.random-cat-check');
    if (check) check.textContent = card.classList.contains('selected') ? '✓' : '';
    const selectedIndexes = questionCategories.map((_, i) => i).filter(i => $(`randomCat_${i}`)?.classList.contains('selected'));
    ui.updateExcludeList(questionCategories, selectedIndexes);
    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');
    updateSelectedQuestions();
};

window.selectRounds = (n) => {
    selectedRounds = n;
    document.querySelectorAll('.rounds-opt').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.rounds) === n));
    const label = $('roundsLabel');
    if (label) label.textContent = n === 2 ? '2 rundy' : n === 3 ? '3 rundy' : '5 rund';
    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');
    updateSelectedQuestions();
};

window.drawQuestions = () => {
    const selectedIndexes = questionCategories.map((_, i) => i).filter(i => $(`randomCat_${i}`)?.classList.contains('selected'));
    if (selectedIndexes.length === 0) return;
    const available = [];
    selectedIndexes.forEach(ci => {
        const cat = questionCategories[ci];
        cat.questions.forEach((q, qi) => {
            const cb = $(`excl_${ci}_${qi}`);
            if (cb && cb.checked) available.push({ ...q, _catName: cat.name, _catIcon: cat.icon });
        });
    });
    if (available.length === 0) { ui.showToast('Brak dostępnych pytań!', 'error'); return; }
    const count = Math.min(selectedRounds, available.length);
    const shuffled = [...available].sort(() => Math.random() - 0.5);
    drawnQuestions = shuffled.slice(0, count);
    ui.renderRandomPreview(drawnQuestions);
    updateSelectedQuestions();
};

window.startGame = () => {
    const gameName = $('setupGameName').value.trim() || 'Rozgrywka';
    const initialState = buildInitialStateFromSetup(currentMode, questionCategories, drawnQuestions);
    net.createGame(socket, initialState, gameName);
};

window.selectTeam = (n) => {
    if (gameState.isStealMode || gameState.pointsAwarded) return;
    gameState.currentTeam = n;
    ui.updateUI(gameState, window.revealAnswer);
    sendStateUpdate();
};

window.addStrike = (n) => {
    if (!gameState.questionRevealed || gameState.currentTeam !== n || gameState.pointsAwarded) return;
    const team = n === 1 ? gameState.team1 : gameState.team2;
    if (gameState.isStealMode) {
        gameState.stealUsed = true; team.strikes = 1;
        net.showBigX(socket, currentGameId, 1);
        setTimeout(() => {
            if (gameState.roundPoints > 0 && gameState.failedTeam) awardPoints(gameState.failedTeam);
            else gameState.pointsAwarded = true;
            endStealMode();
        }, 1500);
    } else {
        team.strikes++;
        net.showBigX(socket, currentGameId, team.strikes);
        if (team.strikes >= 3 && !gameState.stealUsed) activateStealMode(n);
        else if (team.strikes >= 3 && gameState.stealUsed) {
            setTimeout(() => { gameState.roundPoints = 0; gameState.pointsAwarded = true; ui.updateUI(gameState, window.revealAnswer); sendStateUpdate(); }, 1500);
        }
    }
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

function activateStealMode(f) {
    gameState.isStealMode = true; gameState.failedTeam = f;
    const o = f === 1 ? 2 : 1; gameState.currentTeam = o;
    if (o === 1) gameState.team1.strikes = 0; else gameState.team2.strikes = 0;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
}

function endStealMode() {
    gameState.isStealMode = false; gameState.failedTeam = null; gameState.currentTeam = null;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
}

window.awardPoints = (n) => {
    if (!gameState.roundPoints || gameState.pointsAwarded) return;
    const team = n === 1 ? gameState.team1 : gameState.team2;
    team.score += gameState.roundPoints;
    net.showPoints(socket, currentGameId, gameState.roundPoints, team.name);
    gameState.pointsAwarded = true; gameState.roundPoints = 0;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.revealQuestion = () => {
    if (gameState.questionRevealed || !gameState.currentQuestion) return;
    gameState.questionRevealed = true;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.revealAnswer = (i) => {
    if (!gameState.questionRevealed || gameState.revealedAnswers.includes(i) || gameState.pointsAwarded) return;
    if (!gameState.currentTeam && gameState.revealedAnswers.length >= 2) return;
    gameState.revealedAnswers.push(i);
    gameState.roundPoints += gameState.currentQuestion.answers[i].points * gameState.multiplier;
    net.playRevealSound(socket, currentGameId);
    if (gameState.isStealMode && gameState.currentTeam) {
        setTimeout(() => { window.awardPoints(gameState.currentTeam); endStealMode(); }, 800);
    } else if (gameState.revealedAnswers.length === gameState.currentQuestion.answers.length && gameState.currentTeam && !gameState.pointsAwarded) {
        setTimeout(() => window.awardPoints(gameState.currentTeam), 500);
    }
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.revealAll = () => {
    if (!gameState.questionRevealed || !gameState.pointsAwarded || !gameState.currentQuestion) return;
    gameState.currentQuestion.answers.forEach((_, i) => { if (!gameState.revealedAnswers.includes(i)) gameState.revealedAnswers.push(i); });
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.nextQuestion = () => {
    if (gameState.currentQuestionIndex === -1 && gameState.selectedQuestions.length > 0) loadQuestion(0);
    else if (gameState.currentQuestionIndex < gameState.selectedQuestions.length - 1) loadQuestion(gameState.currentQuestionIndex + 1);
};

window.previousQuestion = () => {
    if (gameState.questionRevealed && !gameState.pointsAwarded) {
        ui.showModal('Cofnij pytanie', 'Runda jest w toku! Cofnąć?', 'Cofnij', 'modal-btn-confirm', () => { if (gameState.currentQuestionIndex > 0) loadQuestion(gameState.currentQuestionIndex - 1); });
        return;
    }
    if (gameState.currentQuestionIndex > 0) loadQuestion(gameState.currentQuestionIndex - 1);
};

function loadQuestion(i) {
    if (i < 0 || i >= gameState.selectedQuestions.length) return;
    gameState.currentQuestionIndex = i;
    gameState.currentQuestion = gameState.selectedQuestions[i];
    gameState.questionRevealed = false; gameState.revealedAnswers = [];
    gameState.roundPoints = 0; gameState.currentTeam = null;
    gameState.isStealMode = false; gameState.stealUsed = false;
    gameState.pointsAwarded = false; gameState.failedTeam = null;
    gameState.team1.strikes = 0; gameState.team2.strikes = 0;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
}

window.setMultiplier = (v) => {
    gameState.multiplier = v;
    document.querySelectorAll('.round-btn').forEach(b => b.classList.toggle('active', b.textContent.trim() === `×${v}`));
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.resetGame = () => {
    ui.showModal('Reset gry', 'Czy na pewno chcesz zresetować grę?', 'Resetuj', 'modal-btn-confirm', () => {
        if (currentGameId) net.hideWinner(socket, currentGameId);
        gameState.team1.score = 0; gameState.team1.strikes = 0;
        gameState.team2.score = 0; gameState.team2.strikes = 0;
        gameState.currentTeam = null; gameState.roundPoints = 0;
        gameState.multiplier = 1; gameState.currentQuestionIndex = -1;
        gameState.currentQuestion = null; gameState.questionRevealed = false;
        gameState.revealedAnswers = []; gameState.isStealMode = false;
        gameState.stealUsed = false; gameState.pointsAwarded = false;
        gameState.failedTeam = null;
        document.querySelectorAll('.round-btn').forEach((b, i) => b.classList.toggle('active', i === 0));
        ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
    });
};

window.endGameAndBackToMenu = () => {
    ui.showModal('Powrót do menu', 'Czy na pewno chcesz zakończyć grę?', 'Zakończ grę', 'modal-btn-confirm', () => {
        if (currentGameId) net.endGame(socket, currentGameId);
        backToMenuUIOnly();
    });
};

function backToMenuUIOnly() {
    currentGameId = currentHostCode = currentTvCode = null;
    gameState = createEmptyState();
    $('gameScreen').classList.remove('active');
    ui.showLobbyScreen();
}

window.openTV = () => {
    if (!currentTvCode) return;
    window.open(`/rodziniada/tv?code=${currentTvCode}`, 'RodziniadaTV', 'width=1920,height=1080');
};

window.startDisplay = () => {
    if (currentGameId) net.startDisplay(socket, currentGameId);
};

window.toggleSound = () => {
    gameState.soundEnabled = !gameState.soundEnabled;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.toggleFullscreenHost = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
};

window.showWinner = () => {
    if (!currentGameId) return;
    const s1 = gameState.team1.score;
    const s2 = gameState.team2.score;
    if (s1 === s2) { ui.showToast('Remis! Nie można ogłosić zwycięzcy.', 'error'); return; }
    const winnerName = s1 > s2 ? gameState.team1.name : gameState.team2.name;
    net.showWinner(socket, currentGameId, winnerName);
    setTimeout(() => { if (currentGameId) net.endGame(socket, currentGameId); backToMenuUIOnly(); }, 10000);
};

window.closeModal = ui.closeModal;

// ===== KLAWISZE =====
document.addEventListener('keydown', (e) => {
    if ($('modalOverlay').classList.contains('show')) { if (e.key === 'Escape') ui.closeModal(); return; }
    if (e.target.tagName === 'INPUT') return;
    if (!$('gameScreen').classList.contains('active')) return;
    switch (e.key) {
        case ' ': e.preventDefault(); window.revealQuestion(); break;
        case 'q': case 'Q': window.selectTeam(1); break;
        case 'w': case 'W': window.selectTeam(2); break;
        case 'x': case 'X': if (gameState.currentTeam) window.addStrike(gameState.currentTeam); break;
        case '1': case '2': case '3': case '4': case '5': case '6': case '7': case '8':
            window.revealAnswer(parseInt(e.key) - 1); break;
        case 'r': case 'R': window.revealAll(); break;
        case 'z': case 'Z': window.showWinner(); break;
        case 'ArrowLeft': window.previousQuestion(); break;
        case 'ArrowRight': window.nextQuestion(); break;
        case 'Escape': ui.closeModal(); break;
    }
});
