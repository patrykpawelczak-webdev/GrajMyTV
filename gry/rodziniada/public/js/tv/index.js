import * as audio from './audio.js';
import * as anim from './animations.js';
import * as render from './render.js';

const tv = id => document.getElementById(id);
const socket = io('/rodziniada');

let countdownAnimFrame = null;
let isCountingDown = false;
let introVisible = false;

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
    startIntro();
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
    render.updateTeams(state.team1, state.team2);
    render.updateStrikes(state.team1, state.team2);
    render.updateBoard(state.currentQuestion, state.revealedAnswers, state.questionRevealed);
    render.updateRoundPoints(state.roundPoints, state.multiplier);
}

function startIntro() {
    introVisible = true;
    const intro = tv('tvIntro');
    const countdownCanvas = tv('countdownCanvas');
    if (intro) {
        intro.style.display = 'flex';
        intro.style.opacity = '1';
        intro.style.visibility = 'visible';
        intro.classList.add('show');
    }
    
    audio.play('intro');
    
    let seconds = 3;
    isCountingDown = true;
    
    function loop() {
        if (!isCountingDown) return;
        anim.drawCountdown(countdownCanvas, seconds > 0 ? seconds.toString() : 'START');
        countdownAnimFrame = requestAnimationFrame(loop);
    }
    loop();

    const timer = setInterval(() => {
        seconds--;
        if (seconds < 0) {
            clearInterval(timer);
            setTimeout(finishIntro, 1000);
        }
    }, 1000);
}

function finishIntro() {
    isCountingDown = false;
    if (countdownAnimFrame) {
        cancelAnimationFrame(countdownAnimFrame);
        countdownAnimFrame = null;
    }

    const splitLeft = tv('introSplitLeft');
    const splitRight = tv('introSplitRight');
    const intro = tv('tvIntro');

    if (splitLeft) splitLeft.classList.add('exit');
    if (splitRight) splitRight.classList.add('exit');

    setTimeout(() => {
        if (intro) {
            intro.style.opacity = '0';
            intro.style.visibility = 'hidden';
            intro.classList.remove('show');
        }
        introVisible = false;
        // Po intro upewnij się że plansza jest zaktualizowana
        socket.emit('requestStateUpdate'); 
    }, 800);
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

socket.on('joinedTv', ({ gameId, state }) => {
    const screen = tv('joinScreen');
    if (screen) screen.classList.add('hidden');
    updateFullUI(state);
});
