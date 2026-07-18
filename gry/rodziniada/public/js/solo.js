(() => {
    const MAX_MISSES = 3;
    const ANSWERS_COUNT = 6;
    const JULY_CHALLENGE_YEAR = 2026;
    const JULY_CHALLENGE_MONTH = 6;
    const JULY_CHALLENGE_DAYS = 31;
    const START_CHALLENGE = new Date(JULY_CHALLENGE_YEAR, JULY_CHALLENGE_MONTH, 1);
    const STORAGE_KEY = 'grajmytv:rodziniada-solo:v2';
    const LEGACY_STORAGE_KEYS = ['grajmytv:rodziniada-solo'];
    const PLAYER_KEY = 'grajmytv:rodziniada-solo:player';
    const NICKNAME_KEY = 'grajmytv:rodziniada-solo:nickname';

    function clearProgressFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('resetRodziniadaSolo')) return;

        [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach(key => localStorage.removeItem(key));
        params.delete('resetRodziniadaSolo');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
    }

    clearProgressFromUrl();

    const $ = id => document.getElementById(id);
    const els = {
        challengeNumber: $('challengeNumber'),
        prevChallenge: $('prevChallenge'),
        nextChallenge: $('nextChallenge'),
        calendarButton: $('calendarButton'),
        archiveNote: $('archiveNote'),
        questionText: $('questionText'),
        answersBoard: $('answersBoard'),
        answerForm: $('answerForm'),
        answerInput: $('answerInput'),
        submitButton: $('submitButton'),
        roundMessage: $('roundMessage'),
        shareButton: $('shareButton'),
        calendarDialog: $('calendarDialog'),
        calendarTitle: $('calendarTitle'),
        calendarGrid: $('calendarGrid'),
        calendarHint: $('calendarHint'),
        calendarCloseButton: $('calendarCloseButton'),
        resultDialog: $('resultDialog'),
        resultScore: $('resultScore'),
        resultPoints: $('resultPoints'),
        resultAnswers: $('resultAnswers'),
        resultMisses: $('resultMisses'),
        nicknameInput: $('nicknameInput'),
        resultShareButton: $('resultShareButton'),
        resultCloseButton: $('resultCloseButton'),
        rankingList: $('rankingList'),
        rankingBoard: document.querySelector('.ranking-board'),
        rankingBadge: document.querySelector('.ranking-head span'),
        rankingSummary: document.querySelector('.ranking-board p'),
        strikes: [$('strike1'), $('strike2'), $('strike3')]
    };

    const COMMON_ALIASES = {
        auto: ['samochod', 'samochodem', 'auta', 'autem'],
        samochod: ['auto', 'auta', 'autem'],
        telefon: ['komorka', 'komorke', 'smartfon', 'smartfona', 'telefon komorkowy'],
        telewizor: ['tv', 'telewizja'],
        pieniadze: ['kasa', 'hajs', 'gotowka'],
        praca: ['robota'],
        sklep: ['zakupy', 'market'],
        dom: ['mieszkanie', 'chata'],
        internet: ['net', 'sieci'],
        wakacje: ['urlop'],
        jedzenie: ['posilek', 'obiad'],
        mama: ['matka'],
        tata: ['ojciec']
    };

    const SHORT_WORDS = new Set(['i', 'w', 'we', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'u', 'o', 'a']);

    const state = {
        questions: [],
        calendar: { startDate: '2026-07-01', days: [] },
        currentChallenge: getTodayKey(),
        challengeQuestion: null,
        started: false,
        finished: false,
        archiveUnlocked: false,
        lastResult: null,
        misses: 0,
        score: 0,
        revealed: new Set(),
        guesses: [],
        justRevealed: null,
        resultSynced: false,
        message: ''
    };

    function getTodayKey(date = new Date()) {
        const parts = new Intl.DateTimeFormat('pl-PL', {
            timeZone: 'Europe/Warsaw',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).formatToParts(date);
        const part = type => parts.find(item => item.type === type)?.value;

        return [part('year'), part('month'), part('day')].join('-');
    }

    function dateFromKey(key) {
        const [year, month, day] = key.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    function addDays(date, amount) {
        const next = new Date(date);
        next.setDate(next.getDate() + amount);
        return next;
    }

    function monthName(date) {
        return date.toLocaleDateString('pl-PL', { month: 'long', year: 'numeric' });
    }

    function challengeNumber(key = state.currentChallenge) {
        const date = dateFromKey(key);
        const diff = Math.floor((date - START_CHALLENGE) / 86400000) + 1;
        return Math.max(1, diff);
    }

    function isBeforeRelease(key) {
        return dateFromKey(key) < START_CHALLENGE;
    }

    function isJulyChallenge(key) {
        const date = dateFromKey(key);
        return date.getFullYear() === JULY_CHALLENGE_YEAR
            && date.getMonth() === JULY_CHALLENGE_MONTH
            && date.getDate() >= 1
            && date.getDate() <= JULY_CHALLENGE_DAYS;
    }

    function readStore() {
        try {
            const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                results: store.results && typeof store.results === 'object' ? store.results : {},
                progress: store.progress && typeof store.progress === 'object' ? store.progress : {}
            };
        } catch {
            return { results: {}, progress: {} };
        }
    }

    function writeStore(store) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
        state.lastResult = store.results[state.currentChallenge] || null;
    }

    function getPlayerId() {
        const savedId = localStorage.getItem(PLAYER_KEY);
        if (savedId) return savedId;

        const generatedId = window.crypto?.randomUUID
            ? window.crypto.randomUUID()
            : `player-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

        localStorage.setItem(PLAYER_KEY, generatedId);
        return generatedId;
    }

    function cleanNickname(value) {
        return String(value || '')
            .replace(/\s+/g, ' ')
            .replace(/[<>]/g, '')
            .trim()
            .slice(0, 24);
    }

    function getNickname() {
        const authNickname = cleanNickname(window.GrajMyTVAuth?.getState?.().nickname);
        if (authNickname.length >= 2) return authNickname;

        const savedNickname = cleanNickname(localStorage.getItem(NICKNAME_KEY));
        const typedNickname = cleanNickname(els.nicknameInput?.value);
        const nickname = typedNickname.length >= 2
            ? typedNickname
            : savedNickname.length >= 2
                ? savedNickname
                : 'Gracz';

        localStorage.setItem(NICKNAME_KEY, nickname);
        return nickname;
    }

    function getStoredResult(key) {
        return readStore().results[key] || null;
    }

    function getStoredProgress(key) {
        return readStore().progress[key] || null;
    }

    function applyStoredState(savedState, finished = false) {
        state.started = true;
        state.finished = finished;
        state.misses = savedState.misses || 0;
        state.score = savedState.score || 0;
        state.revealed = new Set(Array.isArray(savedState.revealed) ? savedState.revealed : []);
        state.guesses = Array.isArray(savedState.guesses) ? [...savedState.guesses] : [];
        state.justRevealed = null;
        state.resultSynced = finished && Boolean(savedState.synced);
        state.message = finished ? 'To wyzwanie jest już zapisane.' : 'Postęp został przywrócony.';
        state.lastResult = finished ? savedState : null;
    }

    function saveProgress() {
        if (state.finished) return;

        const store = readStore();
        store.progress[state.currentChallenge] = {
            score: state.score,
            misses: state.misses,
            revealed: [...state.revealed],
            guesses: state.guesses,
            updatedAt: new Date().toISOString()
        };
        writeStore(store);
    }

    function normalize(value) {
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0142/g, 'l')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    function answerVariants(answerText) {
        const variants = new Set();
        const base = normalize(answerText);
        if (!base) return variants;

        variants.add(base);

        base.split(/\s+\/\s+|\/|,|;|\s+albo\s+|\s+lub\s+/).forEach(part => {
            const normalized = normalize(part);
            if (normalized.length >= 2) variants.add(normalized);
        });

        const words = base.split(' ').filter(word => word.length >= 3 && !SHORT_WORDS.has(word));
        words.forEach(word => {
            variants.add(word);
            (COMMON_ALIASES[word] || []).forEach(alias => variants.add(normalize(alias)));
        });

        Object.entries(COMMON_ALIASES).forEach(([word, aliases]) => {
            if (base.includes(word)) {
                aliases.forEach(alias => variants.add(normalize(alias)));
            }
        });

        return variants;
    }

    function hashString(value) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function seededRandom(seedText) {
        let value = hashString(seedText);
        return () => {
            value += 0x6D2B79F5;
            let next = value;
            next = Math.imul(next ^ (next >>> 15), next | 1);
            next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
            return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
        };
    }

    function seededItem(items, seedText) {
        const random = seededRandom(seedText);
        return items[Math.floor(random() * items.length)];
    }

    function flattenQuestions(data) {
        return (data.categories || []).flatMap(category => {
            return (category.questions || []).map(question => ({
                id: question.id,
                category: category.name,
                text: question.text,
                answers: [...question.answers]
                    .sort((a, b) => b.points - a.points)
                    .slice(0, ANSWERS_COUNT)
            }));
        }).filter(question => question.answers.length > 0);
    }

    async function loadQuestions() {
        if (state.questions.length) return;

        const [questionsResponse, calendarResponse] = await Promise.all([
            fetch('/rodziniada/api/questions', { cache: 'no-store' }),
            fetch('/rodziniada/api/solo-calendar', { cache: 'no-store' })
        ]);
        const data = await questionsResponse.json();
        state.questions = flattenQuestions(data);

        try {
            const calendar = await calendarResponse.json();
            if (calendar && Array.isArray(calendar.days)) {
                state.calendar = calendar;
            }
        } catch {
            state.calendar = { startDate: '2026-07-01', days: [] };
        }
    }

    function getQuestionForChallenge(key) {
        if (isJulyChallenge(key)) {
            const day = dateFromKey(key).getDate();
            const questionId = state.calendar.days[day - 1];
            const scheduledQuestion = questionId
                ? state.questions.find(question => question.id === questionId)
                : null;
            return scheduledQuestion || state.questions[(day - 1) % state.questions.length];
        }

        return seededItem(state.questions, `rodziniada-solo:${key}`);
    }

    function todayCompleted() {
        return state.archiveUnlocked || Boolean(getStoredResult(getTodayKey()));
    }

    function canOpenChallenge(key) {
        if (isBeforeRelease(key)) return false;
        if (key === getTodayKey()) return true;
        if (dateFromKey(key) > dateFromKey(getTodayKey())) return false;
        return todayCompleted();
    }

    function resetRunForChallenge(key = getTodayKey()) {
        if (!canOpenChallenge(key)) return;

        state.currentChallenge = key;
        state.challengeQuestion = getQuestionForChallenge(key);
        const storedResult = getStoredResult(key);
        const storedProgress = getStoredProgress(key);
        state.started = false;
        state.finished = false;
        state.misses = 0;
        state.score = 0;
        state.revealed = new Set();
        state.guesses = [];
        state.justRevealed = null;
        state.resultSynced = false;
        state.message = '';

        state.lastResult = storedResult;
        if (storedResult) {
            applyStoredState(storedResult, true);
        } else if (storedProgress) {
            applyStoredState(storedProgress, false);
        }

        loadRanking(key);
        if (storedResult && key === getTodayKey() && !state.resultSynced) {
            submitResultToServer();
        }
    }

    function renderStrikes() {
        els.strikes.forEach((strike, index) => {
            strike.classList.toggle('empty', index >= state.misses);
        });
    }

    function flashLatestStrike() {
        const strike = els.strikes[state.misses - 1];
        if (!strike) return;

        strike.classList.remove('just-hit');
        void strike.offsetWidth;
        strike.classList.add('just-hit');
    }

    function renderBoard() {
        const answers = state.challengeQuestion?.answers || [];
        els.answersBoard.innerHTML = answers.map((answer, index) => {
            const revealed = state.revealed.has(index);
            const missed = state.finished && state.misses >= MAX_MISSES && !revealed;
            const visible = revealed || missed;
            const justRevealed = state.justRevealed === index;
            const className = ['answer-row', revealed ? 'revealed' : '', missed ? 'missed' : '', justRevealed ? 'just-revealed' : ''].filter(Boolean).join(' ');
            return `
                <div class="${className}">
                    <div class="answer-index">${index + 1}</div>
                    <div class="answer-text">${visible ? answer.text : '?'}</div>
                    <div class="answer-points">${revealed ? answer.points : missed ? '0' : '---'}</div>
                </div>
            `;
        }).join('');
    }

    function escapeHtml(value) {
        const element = document.createElement('span');
        element.textContent = String(value || '');
        return element.innerHTML;
    }

    function renderRanking(entries = []) {
        if (els.rankingBadge) {
            els.rankingBadge.textContent = 'Dzisiaj';
        }
        if (els.rankingSummary) {
            const authState = window.GrajMyTVAuth?.getState?.();
            els.rankingSummary.textContent = authState?.enabled && !authState.isLoggedIn
                ? 'Ranking liczy tylko zalogowanych testerow.'
                : 'Najlepsze wyniki dzisiejszego wyzwania.';
        }
        if (!els.rankingList) return;

        if (!entries.length) {
            els.rankingList.innerHTML = '<li><span>Brak wynikow</span><strong>---</strong></li>';
            return;
        }

        els.rankingList.innerHTML = entries.map((entry, index) => {
            const place = entry.place || index + 1;
            const points = Number(entry.score || 0);
            return `<li><span>${place}. ${escapeHtml(entry.nickname)}</span><strong>${points} pkt</strong></li>`;
        }).join('');
    }

    async function loadRanking(key = state.currentChallenge) {
        if (!els.rankingList) return;

        try {
            const response = await fetch(`/rodziniada/api/solo-ranking?date=${encodeURIComponent(key)}&limit=10`, {
                cache: 'no-store'
            });
            if (!response.ok) throw new Error('ranking');
            const data = await response.json();
            renderRanking(data.ranking || []);
        } catch {
            renderRanking([]);
            if (els.rankingSummary) {
                els.rankingSummary.textContent = 'Ranking jest chwilowo niedostepny.';
            }
        }
    }

    async function submitResultToServer() {
        if (state.currentChallenge !== getTodayKey()) return;
        if (!state.finished || state.resultSynced) return;

        try {
            const authState = window.GrajMyTVAuth?.getState?.();
            const accessToken = await window.GrajMyTVAuth?.getAccessToken?.();
            if (authState?.enabled && !accessToken) {
                if (els.rankingSummary) {
                    els.rankingSummary.textContent = 'Zaloguj sie na stronie glownej, aby wynik trafil do rankingu.';
                }
                return;
            }

            const headers = { 'Content-Type': 'application/json' };
            if (accessToken) {
                headers.Authorization = `Bearer ${accessToken}`;
            }

            const response = await fetch('/rodziniada/api/solo-results', {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    playerId: getPlayerId(),
                    nickname: getNickname(),
                    challengeKey: state.currentChallenge,
                    misses: state.misses,
                    revealed: [...state.revealed]
                })
            });

            if (!response.ok) throw new Error('result');
            const data = await response.json();
            renderRanking(data.ranking || []);
            state.resultSynced = true;
            const store = readStore();
            if (store.results[state.currentChallenge]) {
                store.results[state.currentChallenge].synced = true;
                writeStore(store);
            }
        } catch {
            await loadRanking();
        }
    }

    function renderGame() {
        const todayKey = getTodayKey();
        const isToday = state.currentChallenge === todayKey;
        const result = state.lastResult && state.finished ? state.lastResult : null;
        const archiveUnlocked = todayCompleted();
        const canPlayCurrent = isToday || archiveUnlocked;
        const prevKey = getTodayKey(addDays(dateFromKey(state.currentChallenge), -1));
        const nextKey = getTodayKey(addDays(dateFromKey(state.currentChallenge), 1));

        els.challengeNumber.textContent = `#${challengeNumber()}`;
        els.questionText.textContent = state.started || result
            ? state.challengeQuestion.text
            : '\u0141adowanie pytania...';

        els.prevChallenge.disabled = !canOpenChallenge(prevKey);
        els.nextChallenge.disabled = !canOpenChallenge(nextKey);
        els.answerInput.disabled = !state.started || state.finished || !canPlayCurrent;
        els.submitButton.disabled = els.answerInput.disabled;
        els.shareButton.disabled = !(isToday && state.finished);
        if (archiveUnlocked) {
            els.archiveNote.textContent = 'Archiwum jest odblokowane. Do klasyfikacji liczy si\u0119 tylko dzisiejsze wyzwanie.';
        } else {
            els.archiveNote.textContent = 'Archiwum odblokuje si\u0119 po uko\u0144czeniu dzisiejszego wyzwania.';
        }

        if (state.finished) {
            els.roundMessage.textContent = `Wyzwanie zako\u0144czone. Wynik: ${state.score} pkt, odkryte ${state.revealed.size}/${ANSWERS_COUNT}.`;
        } else if (!isToday && !archiveUnlocked) {
            els.roundMessage.textContent = 'To wyzwanie jest dost\u0119pne dopiero po uko\u0144czeniu dzisiejszej gry.';
        } else if (!isToday) {
            els.roundMessage.textContent = state.started
                ? state.message || 'Grasz w archiwum. Wynik nie liczy si\u0119 do dzisiejszej klasyfikacji.'
                : 'Archiwum jest odblokowane. Mo\u017cesz rozegra\u0107 poprzednie wyzwanie.';
        } else if (state.started) {
            els.roundMessage.textContent = state.message || 'Wpisz odpowied\u017a i sprawd\u017a, czy jest na tablicy.';
        } else {
            els.roundMessage.textContent = 'Jedno pytanie dziennie. Trzy b\u0142\u0119dy ko\u0144cz\u0105 gr\u0119.';
        }

        renderStrikes();
        renderBoard();
        renderCalendar();
    }

    function findAnswer(value) {
        const normalizedInput = normalize(value);
        if (normalizedInput.length < 2) return -1;

        return state.challengeQuestion.answers.findIndex((answer, index) => {
            if (state.revealed.has(index)) return false;
            const variants = answerVariants(answer.text);
            return [...variants].some(variant => {
                return variant === normalizedInput
                    || (normalizedInput.length >= 4 && variant.includes(normalizedInput))
                    || (variant.length >= 4 && normalizedInput.includes(variant));
            });
        });
    }

    function submitAnswer(event) {
        event.preventDefault();
        if (!state.started || state.finished) return;

        const value = els.answerInput.value.trim();
        els.answerInput.value = '';
        if (!value) return;

        const answerIndex = findAnswer(value);
        state.guesses.push(value);

        if (answerIndex >= 0) {
            const answer = state.challengeQuestion.answers[answerIndex];
            state.revealed.add(answerIndex);
            state.score += answer.points;
            state.message = `Trafione: ${answer.text} za ${answer.points} pkt.`;
            state.justRevealed = answerIndex;
        } else {
            state.misses += 1;
            state.message = 'Pud\u0142o. Masz trzy b\u0142\u0119dy jak w prawdziwym programie.';
            state.justRevealed = null;
            flashLatestStrike();
        }

        if (state.revealed.size === ANSWERS_COUNT || state.misses >= MAX_MISSES) {
            finishChallenge();
            return;
        }

        saveProgress();
        renderGame();
        state.justRevealed = null;
    }

    function finishChallenge() {
        state.finished = true;
        state.started = true;
        const store = readStore();
        const maxScore = maxPossibleScore();
        if (state.currentChallenge === getTodayKey()) {
            state.archiveUnlocked = true;
        }
        store.results[state.currentChallenge] = {
            score: state.score,
            maxScore,
            misses: state.misses,
            revealed: [...state.revealed],
            guesses: state.guesses,
            synced: false,
            completedAt: new Date().toISOString()
        };
        delete store.progress[state.currentChallenge];
        writeStore(store);
        renderGame();
        showResult();
        state.justRevealed = null;
    }

    function maxPossibleScore() {
        return state.challengeQuestion.answers.reduce((sum, answer) => sum + answer.points, 0);
    }

    function showResult() {
        const maxScore = maxPossibleScore();
        els.resultScore.textContent = state.score;
        els.resultPoints.textContent = `${state.score}/${maxScore}`;
        els.resultAnswers.textContent = `${state.revealed.size}/${ANSWERS_COUNT}`;
        els.resultMisses.textContent = `${state.misses}/${MAX_MISSES}`;
        if (els.nicknameInput) {
            els.nicknameInput.value = getNickname() === 'Gracz' ? '' : getNickname();
        }
        if (typeof els.resultDialog.showModal === 'function') {
            els.resultDialog.showModal();
        }
    }

    function startChallenge() {
        if (!canOpenChallenge(state.currentChallenge)) return;
        if (state.finished && state.lastResult) {
            renderGame();
            return;
        }

        state.started = true;
        els.answerInput.disabled = false;
        els.submitButton.disabled = false;
        els.answerInput.focus();
        renderGame();
    }

    function renderCalendar() {
        const currentDate = dateFromKey(state.currentChallenge);
        const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const startOffset = (first.getDay() + 6) % 7;
        const cells = [];

        els.calendarTitle.textContent = monthName(currentDate);
        els.calendarHint.textContent = todayCompleted()
            ? 'Wybierz poprzednie wyzwanie. Dzisiejsze pozostaje jedynym liczonym do klasyfikacji.'
            : 'Poprzednie dni b\u0119d\u0105 dost\u0119pne po uko\u0144czeniu dzisiejszego wyzwania.';

        for (let i = 0; i < startOffset; i += 1) {
            cells.push('<span></span>');
        }

        for (let day = 1; day <= last.getDate(); day += 1) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            const key = getTodayKey(date);
            const result = Boolean(getStoredResult(key));
            const progress = !result && Boolean(getStoredProgress(key));
            const isCurrent = key === state.currentChallenge;
            const disabled = !canOpenChallenge(key);
            const className = ['calendar-day', result ? 'done' : '', progress ? 'in-progress' : '', isCurrent ? 'current' : '', disabled ? 'locked' : ''].filter(Boolean).join(' ');
            cells.push(`<button type="button" class="${className}" data-challenge="${key}" ${disabled ? 'disabled' : ''}>${day}</button>`);
        }

        els.calendarGrid.innerHTML = cells.join('');
        els.calendarGrid.querySelectorAll('[data-challenge]').forEach(button => {
            button.addEventListener('click', () => {
                resetRunForChallenge(button.dataset.challenge);
                startChallenge();
                renderGame();
                els.calendarDialog.close();
            });
        });
    }

    function goToChallenge(offset) {
        const nextKey = getTodayKey(addDays(dateFromKey(state.currentChallenge), offset));
        if (!canOpenChallenge(nextKey)) return;
        resetRunForChallenge(nextKey);
        startChallenge();
        renderGame();
    }

    function buildShareText() {
        const result = state.currentChallenge === getTodayKey() && state.finished ? state.lastResult : null;
        if (!result) return '';
        const misses = Math.min(result.misses || 0, MAX_MISSES);
        const gameUrl = `${window.location.origin}/rodziniada/solo`;
        return [
            `Rodziniada #${challengeNumber()}`,
            `Wynik: ${result.score}/${result.maxScore} pkt`,
            `Odkryte: ${result.revealed.length}/${ANSWERS_COUNT}`,
            `Pudła: ${misses}/${MAX_MISSES}`,
            `Zagraj: ${gameUrl}`
        ].join('\n');
    }

    async function shareResult() {
        const text = buildShareText();
        if (!text) return;

        if (navigator.share) {
            await navigator.share({ text });
            return;
        }

        await navigator.clipboard.writeText(text);
        els.roundMessage.textContent = 'Wynik skopiowany do schowka.';
    }

    async function init() {
        if (window.GrajMyTVAuth) {
            await window.GrajMyTVAuth.init().catch(() => null);
            window.GrajMyTVAuth.onChange(() => {
                renderRanking([]);
                if (state.finished && !state.resultSynced) {
                    submitResultToServer();
                }
            });
        }

        await loadQuestions();
        resetRunForChallenge(getTodayKey());
        startChallenge();

        els.answerForm.addEventListener('submit', submitAnswer);
        els.prevChallenge.addEventListener('click', () => goToChallenge(-1));
        els.nextChallenge.addEventListener('click', () => goToChallenge(1));
        els.calendarButton.addEventListener('click', () => {
            renderCalendar();
            els.calendarDialog.showModal();
        });
        els.calendarCloseButton.addEventListener('click', () => els.calendarDialog.close());
        els.answerInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                els.answerForm.requestSubmit();
            }
        });
        els.shareButton.addEventListener('click', shareResult);
        els.resultShareButton.addEventListener('click', async () => {
            await submitResultToServer();
            await shareResult();
        });
        els.resultCloseButton.addEventListener('click', async () => {
            await submitResultToServer();
            els.resultDialog.close();
        });
        els.resultDialog.addEventListener('cancel', () => {
            submitResultToServer();
        });
    }

    init().catch(() => {
        els.roundMessage.textContent = 'Nie uda\u0142o si\u0119 wczyta\u0107 dzisiejszej ankiety.';
    });
})();
