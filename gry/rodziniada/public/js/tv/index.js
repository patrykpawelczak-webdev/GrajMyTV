import * as audio from './audio.js';
import * as anim from './animations.js';
import * as render from './render.js';

const tv = id => document.getElementById(id);
const socket = io('/rodziniada');

let countdownAnimFrame = null;
let isCountingDown = false;
let introVisible = false;
let displayStarted = false;

document.addEventListener('DOMContentLoaded', () => {
    anim.initGrain();
    
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get('code');
    if (code) {
        socket.emit('joinAsTv', { code });
    }
});

socket.on('joinedTv', ({ gameId, state }) => {
    const screen = tv('joinScreen');
    if (screen) screen.classList.add('hidden');
    updateFullUI(state);
});

socket.on('gameStateUpdated', ({ state }) => {
    updateFullUI(state);
});

socket.on('startDisplay', () => {
    displayStarted = true;
    showWaitingScreen(false);
    socket.emit('requestStateUpdate');
});

socket.on('showBigX', ({ count }) => {
    render.showBigX(count);
    audio.play('strike');
});

socket.on('playRevealSound', () => {
    audio.play('reveal');
});

socket.on('showPoints', ({ points, teamName }) => {
    audio.play('points');
    // Można tu dodać jakiś efekt wizualny na TV
});

socket.on('showWinner', ({ winnerName }) => {
    render.showWinner(winnerName);
    audio.play('winner');
});

socket.on('gameEnded', () => {
    const o = tv('tvGameEnded');
    if (o) o.classList.add('show');
});

function updateFullUI(state) {
    if (introVisible) return;
    
    // Jeśli transmisja nie wystartowała LUB nie ma pytania, pokaż ekran oczekiwania
    if (!displayStarted || (!state.currentQuestion && state.currentQuestionIndex === -1)) {
        showWaitingScreen(true);
        return;
    }
    showWaitingScreen(false);

    render.updateTeams(state.team1, state.team2, state.currentTeam, state.isStealMode);
    render.updateStrikes(state.team1, state.team2);
    render.updateBoard(state.currentQuestion, state.revealedAnswers, state.questionRevealed);
    render.updateRoundPoints(state.roundPoints, state.multiplier);
}

function showWaitingScreen(show) {
    let ws = tv('tvWaitingScreen');
    if (!ws) {
        ws = document.createElement('div');
        ws.id = 'tvWaitingScreen';
        ws.className = 'tv-overlay tv-waiting-overlay';
        ws.innerHTML = `
            <div class="tv-waiting-display">
                <div class="tv-waiting-title">OCZEKIWANIE NA GRĘ</div>
                <div class="tv-waiting-subtitle">Prowadzący zaraz rozpocznie rundę...</div>
            </div>
        `;
        document.body.appendChild(ws);
    }
    ws.classList.toggle('show', show);
}

function startIntro() {
    // Funkcja zachowana dla wstecznej kompatybilności, ale nieużywana
}

function finishIntro() {
    // Funkcja zachowana dla wstecznej kompatybilności, ale nieużywana
}

window.enterFullscreen = () => {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen();
    else document.exitFullscreen();
};

window.joinWithEnteredCode = () => {
    const input = tv('joinCodeInput');
    const code = input ? input.value.trim() : '';
    if (code.length === 6) {
        window.location.href = `/rodziniada/tv?code=${code}`;
    } else {
        const err = tv('joinErrorTv');
        if (err) err.textContent = 'Kod musi mieć 6 cyfr';
    }
};

socket.on('joinError', ({ message }) => {
    const screen = tv('joinScreen');
    if (screen) screen.classList.remove('hidden');
    const err = tv('joinErrorTv');
    if (err) err.textContent = message;
});
