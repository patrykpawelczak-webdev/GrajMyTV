const tv = id => document.getElementById(id);

export function updateTeams(t1, t2, currentTeam, isStealMode) {
    const n1 = tv('tvTeam1Name'), n2 = tv('tvTeam2Name');
    const s1 = tv('tvTeam1Score'), s2 = tv('tvTeam2Score');
    const b1 = tv('tvTeam1'), b2 = tv('tvTeam2');
    
    if (n1) n1.textContent = t1.name.toUpperCase();
    if (n2) n2.textContent = t2.name.toUpperCase();
    if (s1) s1.textContent = t1.score;
    if (s2) s2.textContent = t2.score;

    if (b1) {
        b1.classList.remove('active', 'pulse', 'stealing');
        if (isStealMode) {
            if (currentTeam === 1) b1.classList.add('stealing');
        } else {
            if (currentTeam === 1) b1.classList.add('active');
        }
    }
    if (b2) {
        b2.classList.remove('active', 'pulse', 'stealing');
        if (isStealMode) {
            if (currentTeam === 2) b2.classList.add('stealing');
        } else {
            if (currentTeam === 2) b2.classList.add('active');
        }
    }
}

export function updateStrikes(t1, t2) {
    for (let i = 1; i <= 3; i++) {
        const s1 = tv(`tvTeam1Strike${i}`), s2 = tv(`tvTeam2Strike${i}`);
        if (s1) s1.classList.toggle('active', i <= t1.strikes);
        if (s2) s2.classList.toggle('active', i <= t2.strikes);
    }
}

export function updateBoard(question, revealedIndices, questionRevealed) {
    const list = tv('tvAnswers');
    const qText = tv('tvQuestionText');
    const qWrap = tv('tvQuestion');
    if (!list || !qText) return;

    if (!question) {
        list.innerHTML = ''; 
        qText.textContent = '?'; 
        qText.classList.add('question-mark');
        if (qWrap) qWrap.classList.add('hidden');
        return;
    }

    if (qWrap) qWrap.classList.remove('hidden');
    qText.textContent = questionRevealed ? question.text : '?';
    qText.classList.toggle('question-mark', !questionRevealed);

    list.innerHTML = question.answers.map((ans, i) => {
        const isRev = revealedIndices.includes(i);
        return `
            <div class="tv-answer ${isRev ? 'revealed' : ''}">
                <div class="tv-answer-card">
                    <div class="tv-answer-front">
                        <span class="tv-answer-number">${i + 1}</span>
                    </div>
                    <div class="tv-answer-back">
                        <div class="tv-answer-inner">
                            <span class="tv-answer-number-badge">${i + 1}</span>
                            <span class="tv-answer-text">${ans.text}</span>
                        </div>
                        <span class="tv-answer-points">${ans.points}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function updateRoundPoints(pts, mult) {
    const el = tv('tvRoundScore');
    if (el) el.textContent = pts;
    const m = tv('tvMultiplier');
    if (m) m.textContent = mult > 1 ? `×${mult}` : '';
}

export function showBigX(count) {
    const overlay = tv('tvBigX');
    const xContainer = tv('tvBigXContent');
    if (!overlay || !xContainer) return;
    
    // Używamy znaku Heavy Multiplication X (✖) zgodnie z designem
    xContainer.innerHTML = '✖'.repeat(count);
    
    // Zresetuj animację poprzez wyzwolenie reflow, aby re-triggerować shake
    overlay.classList.remove('show');
    xContainer.style.animation = 'none';
    void xContainer.offsetHeight; // reflow
    xContainer.style.animation = '';
    
    overlay.classList.add('show');
    
    if (window.bigXTimeout) clearTimeout(window.bigXTimeout);
    window.bigXTimeout = setTimeout(() => {
        overlay.classList.remove('show');
    }, 1500);
}

export function showWinner(name) {
    const o = tv('tvWinner');
    const n = tv('tvWinnerName');
    if (o && n) {
        n.textContent = name;
        o.classList.add('show');
    }
}
