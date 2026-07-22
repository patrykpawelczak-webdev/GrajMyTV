(() => {
    const MAX_MISSES = 3;
    const ANSWERS_COUNT = 6;
    const START_CHALLENGE_KEY = '2026-07-19';
    const START_CHALLENGE = dateFromKey(START_CHALLENGE_KEY);
    const STORAGE_KEY = 'grajmytv:rodziniada-solo:v3';
    const LEGACY_STORAGE_KEYS = ['grajmytv:rodziniada-solo:v2', 'grajmytv:rodziniada-solo'];
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

    function clearLocalAchievements() {
        [STORAGE_KEY, ...LEGACY_STORAGE_KEYS].forEach(key => {
            try {
                const store = JSON.parse(localStorage.getItem(key) || '{}');
                if (store?.results && Object.keys(store.results).length) {
                    delete store.results;
                    localStorage.setItem(key, JSON.stringify({
                        progress: store.progress && typeof store.progress === 'object' ? store.progress : {}
                    }));
                }
            } catch {
                localStorage.removeItem(key);
            }
        });
    }

    clearLocalAchievements();

    const $ = id => document.getElementById(id);
    const els = {
        challengeNumber: $('challengeNumber'),
        prevChallenge: $('prevChallenge'),
        nextChallenge: $('nextChallenge'),
        calendarButton: $('calendarButton'),
        archiveNote: $('archiveNote'),
        questionText: $('questionText'),
        answerBoard: $('answerBoard'),
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
        resultShareButton: $('resultShareButton'),
        resultCloseButton: $('resultCloseButton'),
        rankingList: $('rankingList'),
        rankingBoard: document.querySelector('.ranking-board'),
        rankingTabs: [...document.querySelectorAll('[data-ranking-scope]')],
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
        calendar: { startDate: START_CHALLENGE_KEY, days: [] },
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
        remoteStates: {},
        rankingScope: 'day',
        message: ''
    };

    const pageLocks = new Set();
    let lockedScrollY = 0;
    let rankingHeightObserver = null;
    let rankingViewerFrame = 0;

    function syncRankingHeight() {
        if (!els.answerBoard || !els.rankingBoard) return;
        const height = Math.ceil(els.answerBoard.getBoundingClientRect().height);
        if (height > 0) {
            els.rankingBoard.style.setProperty('--ranking-board-height', `${height}px`);
        }
    }

    function observeRankingHeight() {
        syncRankingHeight();
        window.addEventListener('resize', syncRankingHeight);

        if (typeof ResizeObserver === 'undefined' || !els.answerBoard) return;
        rankingHeightObserver = new ResizeObserver(syncRankingHeight);
        rankingHeightObserver.observe(els.answerBoard);
    }

    function setPageLocked(lockName, locked) {
        if (locked) {
            pageLocks.add(lockName);
        } else {
            pageLocks.delete(lockName);
        }

        if (pageLocks.size > 0 && !document.body.classList.contains('is-page-locked')) {
            lockedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
            document.body.classList.add('is-page-locked');
            document.body.style.position = 'fixed';
            document.body.style.top = `-${lockedScrollY}px`;
            document.body.style.left = '0';
            document.body.style.right = '0';
            document.body.style.width = '100%';
            document.body.style.overflow = 'hidden';
            return;
        }

        if (pageLocks.size === 0 && document.body.classList.contains('is-page-locked')) {
            document.body.classList.remove('is-page-locked');
            document.body.style.position = '';
            document.body.style.top = '';
            document.body.style.left = '';
            document.body.style.right = '';
            document.body.style.width = '';
            document.body.style.overflow = '';
            window.scrollTo(0, lockedScrollY);
        }
    }

    function openLockedDialog(dialog, lockName) {
        if (!dialog) return;
        if (typeof dialog.showModal === 'function') {
            dialog.showModal();
        } else {
            dialog.setAttribute('open', '');
        }
        setPageLocked(lockName, true);
    }

    function closeLockedDialog(dialog, lockName) {
        if (!dialog) return;
        if (typeof dialog.close === 'function') {
            dialog.close();
        } else {
            dialog.removeAttribute('open');
        }
        setPageLocked(lockName, false);
    }

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

    function challengeOffsetFromStart(startDate, key) {
        return Math.floor((dateFromKey(key) - dateFromKey(startDate)) / 86400000);
    }

    function readStore() {
        try {
            const store = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
            return {
                results: {},
                progress: store.progress && typeof store.progress === 'object' ? store.progress : {}
            };
        } catch {
            return { results: {}, progress: {} };
        }
    }

    function writeStore(store) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({
            progress: store.progress && typeof store.progress === 'object' ? store.progress : {}
        }));
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
        const nickname = savedNickname.length >= 2 ? savedNickname : 'Gracz';

        localStorage.setItem(NICKNAME_KEY, nickname);
        return nickname;
    }

    function getStoredResult(key) {
        const remoteState = state.remoteStates[key];
        if (remoteState?.status === 'completed') return remoteState;

        return readStore().results[key] || null;
    }

    function getStoredProgress(key) {
        const remoteState = state.remoteStates[key];
        if (remoteState?.status === 'progress') return remoteState;

        return readStore().progress[key] || null;
    }

    async function getAuthToken() {
        const authState = window.GrajMyTVAuth?.getState?.();
        if (!authState?.enabled || !authState.isLoggedIn) return null;

        return window.GrajMyTVAuth?.getAccessToken?.() || null;
    }

    async function loadRemoteState(key) {
        const token = await getAuthToken();
        if (!token) return null;

        try {
            const response = await fetch(`/rodziniada/api/solo-state?challengeKey=${encodeURIComponent(key)}`, {
                cache: 'no-store',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!response.ok) return null;

            const data = await response.json();
            state.remoteStates[key] = data.state || null;
            return data.state || null;
        } catch {
            return null;
        }
    }

    async function loadRemoteStates() {
        const token = await getAuthToken();
        if (!token) return {};

        try {
            const response = await fetch('/rodziniada/api/solo-state', {
                cache: 'no-store',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!response.ok) return {};

            const data = await response.json();
            state.remoteStates = data.states && typeof data.states === 'object' ? data.states : {};
            return state.remoteStates;
        } catch {
            return {};
        }
    }

    async function saveRemoteState(status = 'progress') {
        const token = await getAuthToken();
        if (!token || !state.challengeQuestion) return;

        const body = {
            challengeKey: state.currentChallenge,
            status,
            score: state.score,
            maxScore: maxPossibleScore(),
            misses: state.misses,
            revealed: [...state.revealed],
            guesses: state.guesses,
            synced: Boolean(state.resultSynced),
            completedAt: state.lastResult?.completedAt || null
        };

        try {
            const response = await fetch('/rodziniada/api/solo-state', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(body)
            });
            if (!response.ok) return;

            const data = await response.json();
            if (data.state) {
                state.remoteStates[state.currentChallenge] = data.state;
            }
        } catch {
            // Lokalny postep nadal chroni rozgrywke, gdy zapis online chwilowo nie przejdzie.
        }
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
        saveRemoteState('progress');
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
            state.calendar = { startDate: START_CHALLENGE_KEY, days: [] };
        }
    }

    function getQuestionForChallenge(key) {
        const scheduledIndex = challengeOffsetFromStart(state.calendar.startDate || START_CHALLENGE_KEY, key);
        if (scheduledIndex >= 0 && Array.isArray(state.calendar.days)) {
            const questionId = state.calendar.days[scheduledIndex];
            const scheduledQuestion = questionId
                ? state.questions.find(question => question.id === questionId)
                : null;
            return scheduledQuestion || state.questions[scheduledIndex % state.questions.length];
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

    function rankingRow(entry, place, extraClass = '') {
        const points = Number(entry?.score || 0);
        const emptyClass = entry ? '' : ' is-empty';

        return `
            <li class="ranking-entry${emptyClass}${extraClass}" data-ranking-place="${place}">
                <span class="ranking-player">
                    <em>${place}</em>
                    <b>${entry ? escapeHtml(entry.nickname) : '&nbsp;'}</b>
                </span>
                <strong title="${entry ? `${points} pkt` : ''}">${entry ? `${points.toLocaleString('pl-PL')}<small> pkt</small>` : '&nbsp;'}</strong>
            </li>
        `;
    }

    function updateViewerRankingPosition() {
        rankingViewerFrame = 0;
        if (!els.rankingList) return;

        const viewerRow = els.rankingList.querySelector('.is-viewer-source');
        if (!viewerRow) return;

        const listRect = els.rankingList.getBoundingClientRect();
        const rowRect = viewerRow.getBoundingClientRect();
        const previousOffset = Number(viewerRow.dataset.viewerOffset || 0);
        const naturalTop = rowRect.top - previousOffset;
        const naturalBottom = rowRect.bottom - previousOffset;
        const edgeGap = Math.max(6, Number.parseFloat(getComputedStyle(document.documentElement).fontSize) * 0.5);
        let offset = 0;

        if (naturalTop < listRect.top + edgeGap) {
            offset = listRect.top + edgeGap - naturalTop;
        } else if (naturalBottom > listRect.bottom - edgeGap) {
            offset = listRect.bottom - edgeGap - naturalBottom;
        }

        const nextOffset = Number(offset.toFixed(2));
        viewerRow.dataset.viewerOffset = String(nextOffset);
        viewerRow.style.setProperty('--viewer-row-offset', `${nextOffset}px`);
        viewerRow.classList.toggle('is-viewer-floating', Math.abs(nextOffset) > 0.1);
        viewerRow.classList.toggle('is-viewer-floating-top', nextOffset > 0.1);
        viewerRow.classList.toggle('is-viewer-floating-bottom', nextOffset < -0.1);
    }

    function requestViewerRankingPositionUpdate() {
        if (rankingViewerFrame) return;
        rankingViewerFrame = requestAnimationFrame(updateViewerRankingPosition);
    }

    function renderRanking(entries = [], viewerRank = null) {
        els.rankingTabs.forEach(button => {
            const active = button.dataset.rankingScope === state.rankingScope;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        if (!els.rankingList) return;

        const rows = entries.length ? entries : [null];
        const authUserId = window.GrajMyTVAuth?.getState?.().user?.id;
        const viewerUserId = String(authUserId || viewerRank?.userId || '').trim();
        els.rankingList.innerHTML = rows.map((entry, index) => {
            const place = Number(entry?.place || index + 1);
            const entryUserId = String(entry?.userId || '').trim();
            const viewerClass = entry && viewerUserId && entryUserId === viewerUserId
                ? ' is-viewer is-viewer-source'
                : '';
            return rankingRow(entry, place, viewerClass);
        }).join('');
        els.rankingList.scrollTop = 0;
        requestViewerRankingPositionUpdate();
    }

    async function loadRanking() {
        if (!els.rankingList) return;

        try {
            const params = new URLSearchParams({
                limit: '1000',
                scope: state.rankingScope,
                challengeKey: state.currentChallenge
            });
            const token = await getAuthToken();
            const headers = token ? { Authorization: `Bearer ${token}` } : {};
            const response = await fetch(`/rodziniada/api/solo-ranking?${params.toString()}`, {
                cache: 'no-store',
                headers
            });
            if (!response.ok) throw new Error('ranking');
            const data = await response.json();
            renderRanking(data.ranking || [], data.viewerRank || null);
        } catch {
            renderRanking([], null);
        }
    }

    async function submitResultToServer() {
        if (state.currentChallenge !== getTodayKey()) return;
        if (!state.finished || state.resultSynced) return;

        try {
            const authState = window.GrajMyTVAuth?.getState?.();
            const accessToken = await window.GrajMyTVAuth?.getAccessToken?.();
            if (!authState?.enabled || !authState.isLoggedIn || !accessToken) {
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
                    revealed: [...state.revealed],
                    guesses: state.guesses
                })
            });

            if (!response.ok) throw new Error('result');
            await response.json();
            state.resultSynced = true;
            if (state.lastResult) {
                state.lastResult.synced = true;
            }
            await saveRemoteState('completed');
            await loadRanking();
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
        state.lastResult = {
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
        saveRemoteState('completed');
        submitResultToServer();
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
        openLockedDialog(els.resultDialog, 'result-dialog');
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
            button.addEventListener('click', async () => {
                await loadRemoteState(button.dataset.challenge);
                resetRunForChallenge(button.dataset.challenge);
                startChallenge();
                renderGame();
                closeLockedDialog(els.calendarDialog, 'calendar-dialog');
            });
        });
    }

    async function goToChallenge(offset) {
        const nextKey = getTodayKey(addDays(dateFromKey(state.currentChallenge), offset));
        if (!canOpenChallenge(nextKey)) return;
        await loadRemoteState(nextKey);
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
        if (!window.GrajMyTVAuth) {
            window.location.replace('/?login=required');
            return;
        }

        const authState = await window.GrajMyTVAuth.init().catch(() => null);
        if (!authState?.enabled || !authState.isLoggedIn) {
            window.location.replace('/?login=required');
            return;
        }

        document.body.classList.remove('auth-pending');
        window.GrajMyTVAuth.onChange(async nextAuthState => {
                if (!nextAuthState.isLoggedIn) {
                    window.location.replace('/?login=required');
                    return;
                }
                if (!state.questions.length) return;
                renderRanking([]);
                await loadRemoteStates();
                resetRunForChallenge(state.currentChallenge);
                startChallenge();
                renderGame();
                if (state.finished && !state.resultSynced) {
                    submitResultToServer();
                }
            });

        await loadQuestions();
        await loadRemoteStates();
        resetRunForChallenge(getTodayKey());
        startChallenge();

        els.answerForm.addEventListener('submit', submitAnswer);
        els.prevChallenge.addEventListener('click', () => goToChallenge(-1));
        els.nextChallenge.addEventListener('click', () => goToChallenge(1));
        els.calendarButton.addEventListener('click', () => {
            renderCalendar();
            openLockedDialog(els.calendarDialog, 'calendar-dialog');
        });
        els.calendarCloseButton.addEventListener('click', () => closeLockedDialog(els.calendarDialog, 'calendar-dialog'));
        els.calendarDialog.addEventListener('close', () => setPageLocked('calendar-dialog', false));
        els.rankingTabs.forEach(button => {
            button.addEventListener('click', () => {
                state.rankingScope = button.dataset.rankingScope || 'all';
                renderRanking([]);
                loadRanking();
            });
        });
        els.rankingList.addEventListener('scroll', requestViewerRankingPositionUpdate, { passive: true });
        window.addEventListener('resize', requestViewerRankingPositionUpdate);
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
            closeLockedDialog(els.resultDialog, 'result-dialog');
        });
        els.resultDialog.addEventListener('cancel', () => {
            submitResultToServer();
        });
        els.resultDialog.addEventListener('close', () => setPageLocked('result-dialog', false));
        observeRankingHeight();
    }

    init().catch(() => {
        els.roundMessage.textContent = 'Nie uda\u0142o si\u0119 wczyta\u0107 dzisiejszej ankiety.';
    });
})();
