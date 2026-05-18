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
let selectedRounds = 3;
let drawnQuestions = [];
let gameState = createEmptyState();
let currentGameId = null;
let currentHostCode = null;
let currentTvCode = null;
let isOnlineMode = false;
let currentRole = null;

// ===== DETEKCJA STRONY =====
const path = window.location.pathname;
const isLocalPage = path.includes('/local') || path.includes('Local');
const isOnlinePage = path.includes('/online') || path.includes('Online');

// ===== INICJALIZACJA =====
document.addEventListener('DOMContentLoaded', async () => {
    const overlay = $('modalOverlay');
    if (overlay) {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) ui.closeModal();
        });
    }

    if (isLocalPage) {
        isOnlineMode = false;
        ui.showSetupScreenLocal();
        currentMode = 'manual';
        drawnQuestions = [];
        const manualTab = $('modeTabManual');
        if (manualTab) manualTab.classList.add('active');
        const randomTab = $('modeTabRandom');
        if (randomTab) randomTab.classList.remove('active');
        
        await loadQuestionsFromServer();
        categoriesRendered = false;
        const btn = $('btnShowCategories');
        const grid = $('categoriesGrid');
        if (btn && grid) {
            btn.classList.remove('hidden');
            grid.classList.add('hidden');
            grid.innerHTML = '';
        }
        updateSelectedQuestions();
    } else if (isOnlinePage) {
        isOnlineMode = true;
        
        const urlParams = new URLSearchParams(window.location.search);
        const joinCode = urlParams.get('code');
        
        if (joinCode) {
            const joinName = urlParams.get('name');
            if (!joinName) {
                window.location.href = '/rodziniada';
                return;
            }
            
            ui.showOnlineLobbyScreen('Oczekiwanie...', joinCode);
            
            const startBtn = document.getElementById('btnStartOnlineActive');
            if (startBtn) startBtn.style.display = 'none';
            const cancelBtn = document.querySelector('.btn-dashboard-cancel');
            if (cancelBtn) cancelBtn.style.display = 'none';
            
            socket.emit('joinAsPlayer', { code: joinCode, name: joinName });
            
            socket.on('joinedPlayer', (data) => {
                currentGameId = data.gameId;
                gameState = data.state;
                currentRole = 'player';
                currentTvCode = data.tvCode;
                currentHostCode = data.hostCode;
                window.myPlayerId = data.playerId;
                ui.renderLobbyPlayers(gameState.lobby, false);
                ui.showToast('Pomyślnie dołączono do pokoju!', 'success');
            });
            
            socket.on('joinError', (data) => {
                ui.showToast(data.message, 'error');
                setTimeout(() => { window.location.href = '/rodziniada'; }, 2000);
            });
        } else {
            ui.showSetupScreenOnline();
        }
    } else {
        // Główna strona lobby
        ui.showLobbyScreen();
    }
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
        currentRole = 'host';
        loadQuestion(0);
        ui.updateHeaderCodes(currentHostCode, currentTvCode);
        ui.updateUI(gameState, revealAnswer);
        
        if (isOnlineMode) {
            ui.showOnlineLobbyScreen(gameState.name || 'Pokój Online', tvCode);
            ui.renderLobbyPlayers(gameState.lobby, true);
        } else {
            ui.showGameScreen();
        }
    },
    onJoinedHost: ({ gameId, hostCode, tvCode, state }) => {
        currentGameId = gameId; currentHostCode = hostCode; currentTvCode = tvCode;
        gameState = state;
        currentRole = 'host';
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
        
        // Jeśli jesteśmy w poczekalni online (widoczny ekran lobby)
        const lobbyScreen = document.getElementById('onlineLobbyScreen');
        if (lobbyScreen && !lobbyScreen.classList.contains('hidden')) {
            ui.renderLobbyPlayers(gameState.lobby, currentRole === 'host');
            const nameEl = document.getElementById('lobbyRoomName');
            if (nameEl) nameEl.textContent = gameState.name;
        }
        
        // Logika autoryzacji do odpowiednich widoków przy starcie gry
        if (gameState.displayStarted) {
            if (currentRole === 'player') {
                if (gameState.lobby && gameState.lobby.presenter && gameState.lobby.presenter.id === window.myPlayerId) {
                    // Ten gracz został przypisany jako Prowadzący! Staje się hostem.
                    socket.emit('joinAsHost', { code: currentHostCode });
                    return; // przerwij dalsze ładowanie jako gracz
                } else {
                    // Zwykli gracze lądują na ekranie TV
                    window.location.href = `/rodziniada/tv?code=${currentTvCode}`;
                    return;
                }
            } else if (currentRole === 'host') {
                // Założyciel: Jeśli z jakiegoś powodu przeniósł sam siebie gdzie indziej i ktoś inny jest hostem
                if (gameState.lobby && gameState.lobby.presenter && gameState.lobby.presenter.id !== 'creator') {
                    window.location.href = `/rodziniada/tv?code=${currentTvCode}`;
                    return;
                }
            }
        }
        
        ui.updateUI(gameState, revealAnswer);
    },
    onGameEnded: () => {
        // Usunięto automatyczny powrót do lobby na prośbę użytkownika
        // backToMenuUIOnly();
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
    ui.showGameTypeSelectionScreen();
};

window.selectGameType = (type) => {
    if (type === 'local') {
        window.location.href = '/rodziniada/local';
    } else if (type === 'online') {
        window.location.href = '/rodziniada/online';
    }
};

window.goToOnlineStep2 = () => {
    const playerName = ($('setupGameNameOnline').value || '').trim();
    if (!playerName) {
        ui.showToast('Wpisz swoją nazwę gracza!', 'error');
        return;
    }

    const lobbyName = `Pokój gracza: ${playerName}`;

    // Sprawdź czy pokój o takiej nazwie już istnieje na serwerze (wśród aktywnych gier)
    const exists = allGames.some(g => g.name.toLowerCase() === lobbyName.toLowerCase());
    if (exists) {
        ui.showToast('Pokój o takiej nazwie gracza już istnieje! Wybierz inny nick.', 'error');
        return;
    }
    
    // Tworzymy grę/lobby online OD RAZU!
    const initialState = createEmptyState();
    initialState.isOnline = true;
    initialState.name = lobbyName;
    
    // Zapiszmy założyciela w lobby
    initialState.lobby.unassigned.push({ id: 'creator', name: playerName });

    net.createGame(socket, initialState, lobbyName, true);
};

window.onLobbyDrop = (newLobbyState) => {
    if (currentRole !== 'host') return;
    gameState.lobby = newLobbyState;
    socket.emit('updateGameState', { gameId: currentGameId, state: gameState });
};

window.goToOnlineStep1 = () => {
    ui.showSetupScreenOnline();
};

window.backFromSetup = () => {
    if (isOnlineMode) {
        // Powrót do poczekalni online!
        ui.showOnlineLobbyScreen(gameState.name || 'Pokój Online', currentTvCode);
    } else {
        window.location.href = '/rodziniada';
    }
};

window.backToGameTypeSelection = () => {
    window.location.href = '/rodziniada';
};

window.backToLobby = () => {
    window.location.href = '/rodziniada';
};

window.startOnlineActiveGame = async () => {
    if (questionCategories.length === 0) {
        await loadQuestionsFromServer();
    }
    
    const allQ = [];
    if (questionCategories && questionCategories.length > 0) {
        questionCategories.forEach((cat) => {
            if (cat.questions) {
                cat.questions.forEach((q) => {
                    allQ.push({
                        text: q.text,
                        answers: q.answers.map(a => ({ text: a.text, points: a.points }))
                    });
                });
            }
        });
    }

    const shuffled = allQ.sort(() => 0.5 - Math.random());
    const selected = shuffled.slice(0, 5);

    if (selected.length === 0) {
        ui.showToast('Błąd: brak pytań w bazie!', 'error');
        return;
    }

    const newState = createEmptyState();
    newState.isOnline = true;
    newState.selectedQuestions = selected;
    newState.name = gameState.name;
    
    if (gameState && gameState.lobby) {
        newState.lobby = gameState.lobby;
    }

    if (newState.lobby && newState.lobby.team1 && newState.lobby.team1.length > 0) {
        newState.team1.name = "Drużyna Niebieskich";
    }
    if (newState.lobby && newState.lobby.team2 && newState.lobby.team2.length > 0) {
        newState.team2.name = "Drużyna Czerwonych";
    }
    
    newState.currentQuestionIndex = 0;
    newState.currentQuestion = newState.selectedQuestions[0];
    newState.displayStarted = true;
    
    gameState = newState;
    net.updateGameState(socket, currentGameId, gameState);
    
    if (gameState.lobby && gameState.lobby.presenter && gameState.lobby.presenter.id !== 'creator') {
        window.location.href = `/rodziniada/tv?code=${currentTvCode}`;
    } else {
        ui.showGameScreen();
        ui.updateHeaderCodes(currentHostCode, currentTvCode);
        ui.updateUI(gameState, revealAnswer);
    }
};

window.cancelOnlineLobby = () => {
    if (currentGameId) {
        net.endGame(socket, currentGameId);
    }
    window.location.href = '/rodziniada';
};

window.filterGames = () => {
    const query = ($('lobbySearchInput').value || '').trim();
    ui.renderGamesList(allGames, query, window.joinGameAsTv);
};

window.joinGameAsTv = (tvCode) => {
    ui.showModal('DOŁĄCZ DO LOBBY', '', 'Dołącz', 'btn--primary', () => {
        const code = $('lobbyTvCodeInput')?.value?.trim();
        const playerName = $('lobbyPlayerNameInput')?.value?.trim();
        
        if (!code) { ui.showToast('Wpisz kod pokoju!', 'error'); return; }
        if (!playerName) { ui.showToast('Wpisz swoją nazwę (Nick)!', 'error'); return; }
        if (code !== tvCode) { ui.showToast('Nieprawidłowy kod pokoju!', 'error'); return; }
        
        // Przenosi gracza do poczekalni online (lobby) wraz z jego nickiem
        window.location.href = `/rodziniada/online?code=${tvCode}&name=${encodeURIComponent(playerName)}`;
    });

    setTimeout(() => {
        const msgEl = $('modalMessage');
        if (msgEl) {
            msgEl.innerHTML = `
                <div style="text-align:center; margin-bottom: 10px; color: var(--gray); font-size: 0.95rem;">
                    Kod pokoju:
                </div>
                <input type="text" id="lobbyTvCodeInput" 
                       style="width: 100%; text-align: center; font-size: 2rem; font-family: 'Russo One', sans-serif; letter-spacing: 8px; color: var(--gold); background: rgba(0,0,0,0.3); border: 1px solid rgba(255,215,0,0.3); padding: 15px; border-radius: 12px; outline: none; margin-bottom: 20px;" 
                       placeholder="------" maxlength="6" autocomplete="off" inputmode="numeric">
                
                <div style="text-align:center; margin-bottom: 10px; color: var(--gray); font-size: 0.95rem;">
                    Twój Nick:
                </div>
                <input type="text" id="lobbyPlayerNameInput" 
                       style="width: 100%; text-align: center; font-size: 1.5rem; font-family: 'Russo One', sans-serif; color: var(--white); background: rgba(0,0,0,0.3); border: 1px solid rgba(255,255,255,0.2); padding: 15px; border-radius: 12px; outline: none;" 
                       placeholder="Wpisz imię..." maxlength="15" autocomplete="off">
            `;
            setTimeout(() => {
                const inpCode = $('lobbyTvCodeInput');
                const inpName = $('lobbyPlayerNameInput');
                if (inpCode) {
                    inpCode.focus();
                    inpCode.addEventListener('keydown', (e) => { if (e.key === 'Enter') inpName.focus(); });
                }
                if (inpName) {
                    inpName.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('modalConfirmBtn')?.click(); });
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
    $('selectedCount').textContent = `Wybrano: ${count} z ${selectedRounds}`;
    $('btnStartGame').disabled = count !== selectedRounds;
};

window.switchMode = (mode) => {
    currentMode = mode;
    $('modeTabManual').classList.toggle('active', mode === 'manual');
    $('modeTabRandom').classList.toggle('active', mode === 'random');
    $('modeManual').classList.toggle('hidden', mode !== 'manual');
    $('modeRandom').classList.toggle('hidden', mode !== 'random');
    drawnQuestions = [];
    $('randomPreview')?.classList.add('hidden');
    if (mode === 'random') {
        ui.renderRandomCats(questionCategories, window.toggleRandomCat);
        const btn = $('btnDraw');
        if (btn) btn.disabled = questionCategories.length === 0;
    }
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
    const btn = $('btnDraw');
    if (btn) btn.disabled = selectedIndexes.length === 0;
    updateSelectedQuestions();
};

window.selectRounds = (n) => {
    selectedRounds = n;
    document.querySelectorAll('.rounds-opt').forEach(btn => btn.classList.toggle('active', parseInt(btn.dataset.rounds) === n));
    const label = $('roundsLabel');
    if (label) label.textContent = n === 3 ? '3 rundy' : n === 5 ? '5 rund' : '7 rund';
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
    if (isOnlineMode) {
        // Gry online: aktualizujemy stan istniejącej gry i przechodzimy do planszy!
        const setupState = buildInitialStateFromSetup(currentMode, questionCategories, drawnQuestions);
        
        // Przenosimy wybrane pytania do aktywnego stanu gry
        gameState.selectedQuestions = setupState.selectedQuestions;
        gameState.displayStarted = false; // Rozpoczynamy od ekranu powitalnego dla TV
        
        // Zapisujemy i rozsyłamy zaktualizowany stan
        sendStateUpdate();
        loadQuestion(0);
        
        ui.showGameScreen();
    } else {
        // Gra lokalna: tworzymy nową grę
        const gameName = $('setupGameName').value.trim() || 'Rozgrywka';
        const initialState = buildInitialStateFromSetup(currentMode, questionCategories, drawnQuestions);
        initialState.isOnline = isOnlineMode;
        net.createGame(socket, initialState, gameName, false);
    }
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
            gameState.pointsAwarded = true;
            gameState.roundPoints = 0;
            endStealMode();
        }, 1500);
    } else {
        team.strikes++;
        net.showBigX(socket, currentGameId, team.strikes);
        if (team.strikes >= 3 && !gameState.stealUsed) {
            gameState.currentTeam = n === 1 ? 2 : 1; // Auto switch
            activateStealMode(n);
        }
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

window.awardPoints = (n, qIdx) => {
    if (gameState.pointsAwarded) return;
    if (qIdx !== undefined && qIdx !== gameState.currentQuestionIndex) return;

    const team = n === 1 ? gameState.team1 : gameState.team2;
    if (gameState.roundPoints > 0) {
        team.score += gameState.roundPoints;
        net.showPoints(socket, currentGameId, gameState.roundPoints, team.name);
    }
    gameState.pointsAwarded = true; 
    gameState.roundPoints = 0;
    
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.revealQuestion = () => {
    if (gameState.questionRevealed || !gameState.currentQuestion) return;
    gameState.questionRevealed = true;
    ui.updateUI(gameState, window.revealAnswer); sendStateUpdate();
};

window.revealAnswer = (i) => {
    if (!gameState.questionRevealed || gameState.revealedAnswers.includes(i) || gameState.pointsAwarded) return;
    const hasTopAnswer = gameState.revealedAnswers.includes(0);
    if (!gameState.currentTeam && (hasTopAnswer || gameState.revealedAnswers.length >= 2)) return;
    gameState.revealedAnswers.push(i);
    gameState.roundPoints += gameState.currentQuestion.answers[i].points * gameState.multiplier;
    net.playRevealSound(socket, currentGameId);
    
    const qIdx = gameState.currentQuestionIndex;
    if (gameState.isStealMode && gameState.currentTeam) {
        setTimeout(() => { window.awardPoints(gameState.currentTeam, qIdx); endStealMode(); }, 800);
    } else if (gameState.revealedAnswers.length === gameState.currentQuestion.answers.length && gameState.currentTeam && !gameState.pointsAwarded) {
        setTimeout(() => window.awardPoints(gameState.currentTeam, qIdx), 500);
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
    // Funkcja cofania pytań została zablokowana na prośbę użytkownika
    ui.showToast('Cofanie pytań jest zablokowane', 'info');
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
    ui.showModal('Reset gry', 'Czy na pewno chcesz zresetować grę?', 'Resetuj', 'btn--danger', () => {
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
        loadQuestion(0);
    });
};

window.endGameAndBackToMenu = () => {
    ui.showModal('Powrót do menu', 'Czy na pewno chcesz zakończyć grę?', 'Zakończ grę', 'btn--danger', () => {
        if (currentGameId) net.endGame(socket, currentGameId);
        backToMenuUIOnly();
    });
};

function backToMenuUIOnly() {
    currentGameId = currentHostCode = currentTvCode = null;
    gameState = createEmptyState();
    const gameScreen = $('gameScreen');
    if (gameScreen) gameScreen.classList.remove('active');
    window.location.href = '/rodziniada';
}

window.openTV = () => {
    if (!currentTvCode) return;
    window.open(`/rodziniada/tv?code=${currentTvCode}`, 'RodziniadaTV', 'width=1920,height=1080');
};

window.startDisplay = () => {
    if (currentGameId) {
        gameState.displayStarted = true;
        net.startDisplay(socket, currentGameId);
        sendStateUpdate();
    }
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
    setTimeout(() => { if (currentGameId) net.endGame(socket, currentGameId); }, 10000);
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
