const tv = id => document.getElementById(id);

export function updateTeams(t1, t2) {
    const n1 = tv('tvTeam1Name'), n2 = tv('tvTeam2Name');
    const s1 = tv('tvTeam1Score'), s2 = tv('tvTeam2Score');
    if (n1) n1.textContent = t1.name.toUpperCase();
    if (n2) n2.textContent = t2.name.toUpperCase();
    if (s1) s1.textContent = t1.score;
    if (s2) s2.textContent = t2.score;
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
    if (!list || !qText) return;

    if (!question) {
        list.innerHTML = ''; qText.textContent = ''; return;
    }

    qText.textContent = questionRevealed ? question.text : '???';
    qText.classList.toggle('revealed', questionRevealed);

    list.innerHTML = question.answers.map((ans, i) => {
        const isRev = revealedIndices.includes(i);
        return `
            <div class="tv-answer-item ${isRev ? 'revealed' : ''}">
                <div class="tv-answer-num">${i + 1}</div>
                <div class="tv-answer-text">${isRev ? ans.text : ''}</div>
                <div class="tv-answer-pts">${isRev ? ans.points : ''}</div>
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
    xContainer.innerHTML = '';
    for (let i = 0; i < count; i++) {
        const span = document.createElement('span');
        span.className = 'big-x';
        span.textContent = 'X';
        xContainer.appendChild(span);
    }
    overlay.classList.add('show');
    setTimeout(() => overlay.classList.remove('show'), 1200);
}

export function showWinner(name) {
    const o = tv('tvWinner');
    const n = tv('tvWinnerName');
    if (o && n) {
        n.textContent = name;
        o.classList.add('show');
    }
}
