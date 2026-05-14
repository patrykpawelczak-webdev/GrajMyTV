import { $ } from './utils.js';

export function createEmptyState() {
    return {
        team1: { name: 'Drużyna 1', score: 0, strikes: 0 },
        team2: { name: 'Drużyna 2', score: 0, strikes: 0 },
        currentTeam: null, roundPoints: 0, multiplier: 1,
        currentQuestionIndex: -1, currentQuestion: null,
        questionRevealed: false, revealedAnswers: [],
        isStealMode: false, stealUsed: false,
        pointsAwarded: false, failedTeam: null,
        selectedQuestions: [], soundEnabled: true
    };
}

export function buildInitialStateFromSetup(currentMode, questionCategories, drawnQuestions) {
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
                        answers: q.answers.map(a => ({ text: a.text, points: a.points }))
                    });
                }
            });
        });
    } else {
        drawnQuestions.forEach(q => {
            selected.push({
                text: q.text,
                answers: q.answers.map(a => ({ text: a.text, points: a.points }))
            });
        });
    }

    state.selectedQuestions = selected;
    return state;
}
