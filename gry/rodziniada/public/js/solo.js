(() => {
    const MAX_MISSES = 3;
    const ANSWERS_COUNT = 6;
    const START_CHALLENGE_KEY = '2026-07-19';
    const START_CHALLENGE = dateFromKey(START_CHALLENGE_KEY);
    const STORAGE_KEY = 'grajmytv:rodziniada-solo:v3';
    const LEGACY_STORAGE_KEYS = ['grajmytv:rodziniada-solo:v2', 'grajmytv:rodziniada-solo'];
    const PLAYER_KEY = 'grajmytv:rodziniada-solo:player';
    const NICKNAME_KEY = 'grajmytv:rodziniada-solo:nickname';
    const RANKING_REFRESH_MS = 5000;

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
        currentScore: $('currentScore'),
        answerBoard: $('answerBoard'),
        answersBoard: $('answersBoard'),
        answerForm: $('answerForm'),
        answerInput: $('answerInput'),
        submitButton: $('submitButton'),
        startChallengeButton: $('startChallengeButton'),
        roundMessage: $('roundMessage'),
        shareButton: $('shareButton'),
        calendarDialog: $('calendarDialog'),
        calendarTitle: $('calendarTitle'),
        calendarGrid: $('calendarGrid'),
        calendarHint: $('calendarHint'),
        calendarPrevMonth: $('calendarPrevMonth'),
        calendarNextMonth: $('calendarNextMonth'),
        calendarCloseButton: $('calendarCloseButton'),
        resultDialog: $('resultDialog'),
        resultScore: $('resultScore'),
        resultRank: $('resultRank'),
        resultAnswers: $('resultAnswers'),
        resultMisses: $('resultMisses'),
        resultCloseButton: $('resultCloseButton'),
        rankingList: $('rankingList'),
        rankingBoard: document.querySelector('.ranking-board'),
        rankingTabs: [...document.querySelectorAll('[data-ranking-scope]')],
        strikes: [$('strike1'), $('strike2'), $('strike3')],
        helpButton: $('helpButton'),
        helpDialog: $('helpDialog'),
        helpCloseButton: $('helpCloseButton'),
        helpStartButton: $('helpStartButton')
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
        calendarViewDate: dateFromKey(getTodayKey()),
        message: ''
    };

    const pageLocks = new Set();
    let lockedScrollY = 0;
    let rankingHeightObserver = null;
    let rankingViewerFrame = 0;
    let rankingRefreshTimer = null;
    let rankingSignature = '';
    let rankingRequestId = 0;
    let rankingScrollProgrammatic = false;
    let rankingAutoFocusLocked = false;

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

    function getStorageKey() {
        const authId = window.GrajMyTVAuth?.getState?.()?.user?.id;
        return authId ? `${STORAGE_KEY}_${authId}` : STORAGE_KEY;
    }

    function readStore() {
        try {
            const store = JSON.parse(localStorage.getItem(getStorageKey()) || '{}');
            return {
                results: {},
                progress: store.progress && typeof store.progress === 'object' ? store.progress : {}
            };
        } catch {
            return { results: {}, progress: {} };
        }
    }

    function writeStore(store) {
        localStorage.setItem(getStorageKey(), JSON.stringify({
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

    function comparableNickname(value) {
        return cleanNickname(value).toLocaleLowerCase('pl-PL');
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
        if (remoteState?.status === 'completed' || remoteState?.status === 'finished' || remoteState?.synced) return remoteState;

        const authState = window.GrajMyTVAuth?.getState?.();
        const authId = authState?.user?.id;
        const myRank = state.ranking?.find(r => authId ? r.userId === authId : r.playerId === getPlayerId());
        
        if (myRank && key === getTodayKey()) {
            return {
                status: 'completed',
                score: myRank.score,
                maxScore: myRank.maxScore,
                misses: myRank.misses,
                revealed: myRank.revealed,
                synced: true,
                guesses: []
            };
        }

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

    function answerVariants(answer) {
        const variants = new Set();
        const base = normalize(answer.text || '');
        if (!base) return variants;

        variants.add(base);

        if (Array.isArray(answer.variants)) {
            answer.variants.forEach(variant => {
                const normalized = normalize(variant);
                if (normalized.length >= 2) variants.add(normalized);
            });
        }

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
            fetch('/rodziniada/api/solo-questions', { cache: 'no-store' }),
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
            const days = [...state.calendar.days];
            while (days.length <= scheduledIndex) days.push('');

            for (let i = 0; i <= scheduledIndex; i++) {
                if (!days[i]) {
                    const windowStart = Math.max(0, i - 90);
                    const usedInWindow = new Set();
                    for (let j = windowStart; j < i; j++) {
                        if (days[j]) usedInWindow.add(days[j]);
                    }
                    let fallbackQ = state.questions.find(q => !usedInWindow.has(q.id));
                    if (!fallbackQ) fallbackQ = state.questions[0];
                    if (fallbackQ) days[i] = fallbackQ.id;
                }
            }

            const scheduledId = days[scheduledIndex];
            const scheduledQuestion = state.questions.find(question => question.id === scheduledId);
            if (scheduledQuestion) return scheduledQuestion;
        }

        return state.questions[0] || null;
    }

    function todayCompleted() {
        return state.archiveUnlocked || Boolean(getStoredResult(getTodayKey()));
    }

    function getUnfinishedChallengeKey() {
        const localProgress = readStore().progress || {};
        for (const k of Object.keys(localProgress)) {
            if (!getStoredResult(k)) return k;
        }
        for (const k of Object.keys(state.remoteStates || {})) {
            if (state.remoteStates[k]?.status === 'progress') return k;
        }
        return null;
    }

    function canOpenChallenge(key) {
        if (isBeforeRelease(key)) return false;

        const unfinishedKey = getUnfinishedChallengeKey();
        if (unfinishedKey && unfinishedKey !== key) return false;
        if (unfinishedKey && unfinishedKey === key) return true;

        if (key === getTodayKey()) return true;
        if (dateFromKey(key) > dateFromKey(getTodayKey())) return false;
        return todayCompleted();
    }

    function isRunLocked() {
        return state.started && !state.finished;
    }

    function canLeaveCurrentChallenge() {
        return !isRunLocked();
    }

    function setBlockedSwitchMessage() {
        state.message = 'Dokończ rozpoczęte wyzwanie, zanim wybierzesz inny dzień.';
        renderGame();
    }

    function resetRunForChallenge(key = getTodayKey()) {
        if (!canOpenChallenge(key)) return;

        state.currentChallenge = key;
        state.calendarViewDate = dateFromKey(key);
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

        loadRanking();
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
        els.answerBoard?.classList.toggle('is-covered', !state.started && !state.finished);
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

        viewerRow.classList.remove('is-viewer-floating', 'is-viewer-floating-top', 'is-viewer-floating-bottom');

        const rowTop = viewerRow.offsetParent === els.rankingList
            ? viewerRow.offsetTop
            : viewerRow.offsetTop - els.rankingList.offsetTop;
        const naturalTop = rowTop - els.rankingList.scrollTop;
        const naturalBottom = naturalTop + viewerRow.offsetHeight;
        const listTop = 0;
        const listBottom = els.rankingList.clientHeight;
        const edgeTolerance = 4;
        const maxScrollTop = Math.max(0, els.rankingList.scrollHeight - els.rankingList.clientHeight);
        const canStickToTop = els.rankingList.scrollTop > edgeTolerance;
        const canStickToBottom = els.rankingList.scrollTop < maxScrollTop - edgeTolerance;
        const sticksToTop = canStickToTop && naturalTop <= listTop + edgeTolerance;
        const sticksToBottom = canStickToBottom && naturalBottom >= listBottom - edgeTolerance;

        viewerRow.style.removeProperty('--viewer-row-offset');
        viewerRow.classList.toggle('is-viewer-floating', sticksToTop || sticksToBottom);
        viewerRow.classList.toggle('is-viewer-floating-top', sticksToTop);
        viewerRow.classList.toggle('is-viewer-floating-bottom', sticksToBottom);
    }

    function requestViewerRankingPositionUpdate() {
        if (rankingViewerFrame) return;
        rankingViewerFrame = requestAnimationFrame(updateViewerRankingPosition);
    }

    function ensureViewerRankingVisible() {
        if (!els.rankingList) return;

        const viewerRow = els.rankingList.querySelector('.is-viewer-source');
        if (!viewerRow) return;

        viewerRow.classList.remove('is-viewer-floating', 'is-viewer-floating-top', 'is-viewer-floating-bottom');

        const list = els.rankingList;
        const listRect = list.getBoundingClientRect();
        const rowRect = viewerRow.getBoundingClientRect();
        const maxScrollTop = Math.max(0, list.scrollHeight - list.clientHeight);
        const targetScrollTop = list.scrollTop + (rowRect.top - listRect.top) - ((list.clientHeight / 2) - (rowRect.height / 2));

        rankingScrollProgrammatic = true;
        list.scrollTop = Math.max(0, Math.min(targetScrollTop, maxScrollTop));
        window.requestAnimationFrame(() => {
            rankingScrollProgrammatic = false;
            requestViewerRankingPositionUpdate();
        });
    }

    function renderRanking(entries = [], viewerRank = null, options = {}) {
        state.viewerRank = viewerRank;
        if (els.resultRank) {
            if (state.currentChallenge !== getTodayKey()) {
                els.resultRank.textContent = '-';
            } else {
                els.resultRank.textContent = viewerRank ? `#${viewerRank.place}` : '-';
            }
        }
        
        els.rankingTabs.forEach(button => {
            const active = button.dataset.rankingScope === state.rankingScope;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        });
        if (!els.rankingList) return;

        const previousScrollTop = els.rankingList.scrollTop;
        const rows = entries.length ? entries : [null];
        const authState = window.GrajMyTVAuth?.getState?.();
        const authUserId = authState?.user?.id;
        const authNickname = comparableNickname(authState?.nickname);
        const viewerNickname = comparableNickname(viewerRank?.nickname);
        const viewerUserId = String(authUserId || viewerRank?.userId || '').trim();
        let viewerIndex = -1;
        if (viewerUserId) {
            viewerIndex = rows.findIndex(entry => String(entry?.userId || '').trim() === viewerUserId);
        }
        if (viewerIndex < 0 && authNickname) {
            viewerIndex = rows.findIndex(entry => comparableNickname(entry?.nickname) === authNickname);
        }
        if (viewerIndex < 0 && viewerNickname) {
            viewerIndex = rows.findIndex(entry => comparableNickname(entry?.nickname) === viewerNickname);
        }

        els.rankingList.innerHTML = rows.map((entry, index) => {
            const place = Number(entry?.place || index + 1);
            const viewerClass = entry && index === viewerIndex
                ? ' is-viewer is-viewer-source'
                : '';
            return rankingRow(entry, place, viewerClass);
        }).join('');
        els.rankingList.querySelector('.is-viewer-source')?.removeAttribute('data-viewer-offset');

        const viewerRow = els.rankingList.querySelector('.is-viewer-source');
        if (viewerRow) {
            if (options.focusViewer !== false && !rankingAutoFocusLocked) {
                ensureViewerRankingVisible();
                return;
            }
            requestViewerRankingPositionUpdate();
            return;
        }

        els.rankingList.scrollTop = options.preserveScroll ? previousScrollTop : 0;
        requestViewerRankingPositionUpdate();
    }

    async function loadRanking(options = {}) {
        if (!els.rankingList) return;
        const requestId = rankingRequestId + 1;
        rankingRequestId = requestId;

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
            if (requestId !== rankingRequestId) return;
            const nextRanking = data.ranking || [];
            const nextViewerRank = data.viewerRank || null;
            const nextSignature = JSON.stringify({
                scope: state.rankingScope,
                challenge: state.currentChallenge,
                ranking: nextRanking,
                viewerRank: nextViewerRank
            });
            if (options.preserveScroll && nextSignature === rankingSignature) {
                if (options.focusViewer !== false && els.rankingList.querySelector('.is-viewer-source')) {
                    ensureViewerRankingVisible();
                } else {
                    requestViewerRankingPositionUpdate();
                }
                return;
            }
            rankingSignature = nextSignature;
            renderRanking(nextRanking, nextViewerRank, options);
        } catch {
            if (requestId !== rankingRequestId) return;
            if (!options.preserveScroll) {
                rankingSignature = '';
                renderRanking([], null);
            }
        }
    }

    function refreshRankingLive() {
        if (document.hidden) return;
        loadRanking({ preserveScroll: true, focusViewer: false });
    }

    function startRankingLiveRefresh() {
        if (rankingRefreshTimer) return;
        rankingRefreshTimer = window.setInterval(refreshRankingLive, RANKING_REFRESH_MS);
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) refreshRankingLive();
        });
        window.addEventListener('focus', refreshRankingLive);
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
            : '?';
        if (els.currentScore) {
            els.currentScore.textContent = Number(state.score || 0).toLocaleString('pl-PL');
        }

        els.prevChallenge.style.visibility = '';
        els.prevChallenge.disabled = !canOpenChallenge(prevKey) || !canLeaveCurrentChallenge();
        els.nextChallenge.style.visibility = '';
        els.nextChallenge.disabled = !canOpenChallenge(nextKey) || !canLeaveCurrentChallenge();
        els.answerInput.disabled = !state.started || state.finished || !canPlayCurrent;
        els.submitButton.disabled = els.answerInput.disabled;
        if (els.startChallengeButton) {
            els.startChallengeButton.hidden = state.started || state.finished || !canPlayCurrent;
        }
        els.shareButton.disabled = !(isToday && state.finished);
        if (els.archiveNote) {
            if (archiveUnlocked) {
                els.archiveNote.textContent = 'Archiwum jest odblokowane. Do klasyfikacji liczy si\u0119 tylko dzisiejsze wyzwanie.';
            } else {
                els.archiveNote.textContent = 'Archiwum odblokuje si\u0119 po uko\u0144czeniu dzisiejszego wyzwania.';
            }
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
            els.roundMessage.textContent = state.message || 'Naciśnij play, aby odkryć tablicę i rozpocząć wyzwanie.';
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
            const variants = answerVariants(answer);
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
        if (state.currentChallenge === getTodayKey()) {
            submitResultToServer();
        } else {
            saveRemoteState('completed');
        }
        state.justRevealed = null;
    }

    function maxPossibleScore() {
        return state.challengeQuestion.answers.reduce((sum, answer) => sum + answer.points, 0);
    }

    function showResult() {
        const maxScore = maxPossibleScore();
        
        const scoreStr = String(state.score);
        let scoreHtml = '<div class="score-digits">';
        for (let i = 0; i < scoreStr.length; i++) {
            const digit = parseInt(scoreStr[i], 10);
            
            // All digits wait for dialog to open (0.4s) and start spinning simultaneously.
            // But they finish sequentially. Rightmost digit stops first.
            // Rightmost: index = scoreStr.length - 1
            // Leftmost: index = 0
            // Rightmost duration: 1.0s, next: 1.4s, next: 1.8s
            const cascadeDuration = 1.0 + (scoreStr.length - 1 - i) * 0.4;
            const delay = 0.4; 
            
            let colHtml = '';
            // put dummy digits to create the scrolling illusion
            for(let loops = 0; loops < 2; loops++) {
                for(let d = 0; d <= 9; d++) colHtml += `<div>${d}</div>`;
            }
            for(let d = 0; d <= digit; d++) colHtml += `<div>${d}</div>`;
            
            const totalItems = 20 + digit + 1;
            // Each div is 1em high. Translate up by (totalItems - 1) em.
            const targetY = -(totalItems - 1);
            
            scoreHtml += `<span class="digit-col">
                <span class="digit-col-inner" style="transform: translateY(0); animation: scrollDigit ${cascadeDuration}s cubic-bezier(0.1, 0.8, 0.2, 1) ${delay}s forwards; --targetY: ${targetY}em;">
                    ${colHtml}
                </span>
            </span>`;
        }
        scoreHtml += '</div><div class="score-label">pkt</div>';
        els.resultScore.innerHTML = scoreHtml;
        
        els.resultAnswers.textContent = `${state.revealed.size}/${ANSWERS_COUNT}`;
        els.resultMisses.textContent = `${state.misses}/${MAX_MISSES}`;
        
        const noticeEl = $('resultNotice');
        if (noticeEl) {
            if (state.currentChallenge !== getTodayKey()) {
                noticeEl.textContent = 'To wyzwanie jest archiwalne. Twój wynik w tej grze nie jest brany pod uwagę w rankingach.';
                noticeEl.style.display = 'block';
                els.resultRank.textContent = '-';
            } else {
                noticeEl.style.display = 'none';
                els.resultRank.textContent = state.viewerRank ? `#${state.viewerRank.place}` : '...';
            }
        }
        
        openLockedDialog(els.resultDialog, 'result-dialog');
    }

    function startChallenge() {
        if (!canOpenChallenge(state.currentChallenge)) return;
        if (state.finished && state.lastResult) {
            renderGame();
            return;
        }

        state.started = true;
        state.message = '';
        saveProgress();
        els.answerInput.disabled = false;
        els.submitButton.disabled = false;
        els.answerInput.focus();
        renderGame();
    }

    function renderCalendar() {
        const currentDate = state.calendarViewDate || dateFromKey(state.currentChallenge);
        const todayDate = dateFromKey(getTodayKey());
        const first = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
        const last = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
        const startOffset = (first.getDay() + 6) % 7;
        const cells = [];

        els.calendarTitle.textContent = monthName(currentDate);
        if (els.calendarPrevMonth) {
            const previousMonthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth(), 0);
            els.calendarPrevMonth.disabled = previousMonthEnd < START_CHALLENGE || !canLeaveCurrentChallenge();
        }
        if (els.calendarNextMonth) {
            const nextMonthStart = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1);
            const todayMonthStart = new Date(todayDate.getFullYear(), todayDate.getMonth(), 1);
            els.calendarNextMonth.disabled = nextMonthStart > todayMonthStart || !canLeaveCurrentChallenge();
        }
        els.calendarHint.textContent = todayCompleted()
            ? 'Wybierz poprzednie wyzwanie. Dzisiejsze pozostaje jedynym liczonym do klasyfikacji.'
            : 'Poprzednie dni b\u0119d\u0105 dost\u0119pne po uko\u0144czeniu dzisiejszego wyzwania.';

        for (let i = 0; i < startOffset; i += 1) {
            cells.push('<span></span>');
        }

        for (let day = 1; day <= last.getDate(); day += 1) {
            const date = new Date(currentDate.getFullYear(), currentDate.getMonth(), day);
            const key = getTodayKey(date);
            const result = getStoredResult(key);
            const isCurrent = key === state.currentChallenge;
            const disabled = !canOpenChallenge(key) || (key !== state.currentChallenge && !canLeaveCurrentChallenge());
            
            let statusClass = '';
            let pointsText = '';
            
            if (result) {
                pointsText = result.score !== undefined ? `${result.score} pkt` : '---';
                let doneOnTime = false;
                if (result.completedAt) {
                    const completedKey = getTodayKey(new Date(result.completedAt));
                    if (completedKey === key) {
                        doneOnTime = true;
                    }
                } else {
                    doneOnTime = true;
                }
                statusClass = doneOnTime ? 'done-ontime' : 'done-late';
            } else if (date < todayDate) {
                statusClass = 'missed';
            }

            const className = ['calendar-day', statusClass, isCurrent ? 'current' : '', disabled ? 'locked' : ''].filter(Boolean).join(' ');
            const cNum = challengeNumber(key);
            cells.push(`<button type="button" class="${className}" data-challenge="${key}" ${disabled ? 'disabled' : ''}>
                <div class="day-top">
                    <span class="day-number">${day}</span>
                    <span class="day-challenge">#${cNum}</span>
                </div>
                <span class="day-points">${pointsText}</span>
            </button>`);
        }

        els.calendarGrid.innerHTML = cells.join('');
        els.calendarGrid.querySelectorAll('[data-challenge]').forEach(button => {
            button.addEventListener('click', async () => {
                if (button.dataset.challenge !== state.currentChallenge && !canLeaveCurrentChallenge()) {
                    setBlockedSwitchMessage();
                    return;
                }
                rankingAutoFocusLocked = false;
                await loadRemoteState(button.dataset.challenge);
                resetRunForChallenge(button.dataset.challenge);
                renderGame();
            });
        });
    }

    async function goToChallenge(offset) {
        if (!canLeaveCurrentChallenge()) {
            setBlockedSwitchMessage();
            return;
        }
        const nextKey = getTodayKey(addDays(dateFromKey(state.currentChallenge), offset));
        if (!canOpenChallenge(nextKey)) return;
        rankingAutoFocusLocked = false;
        await loadRemoteState(nextKey);
        resetRunForChallenge(nextKey);
        renderGame();
    }

    function changeCalendarMonth(offset) {
        if (!canLeaveCurrentChallenge()) {
            setBlockedSwitchMessage();
            return;
        }

        const currentDate = state.calendarViewDate || dateFromKey(state.currentChallenge);
        state.calendarViewDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + offset, 1);
        renderCalendar();
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
                await loadRanking();
                resetRunForChallenge(getUnfinishedChallengeKey() || state.currentChallenge || getTodayKey());
                renderGame();
                if (state.finished && !state.resultSynced) {
                    submitResultToServer();
                }
            });

        await loadQuestions();
        await loadRemoteStates();
        await loadRanking();
        resetRunForChallenge(getUnfinishedChallengeKey() || getTodayKey());
        renderGame();

        const socket = io('/rodziniada');
        
        const joinSoloRoom = () => {
            const authState = window.GrajMyTVAuth ? window.GrajMyTVAuth.getState() : null;
            if (authState && authState.user) {
                console.log(`[RODZINIADA SOLO] Wymuszam dolaczenie do pokoju solo: solo_${authState.user.id}`);
                socket.emit('joinSolo', { userId: authState.user.id });
            } else {
                console.warn(`[RODZINIADA SOLO] Odrzucono joinSolo: brak zalogowanego usera.`);
            }
        };

        socket.on('connect', () => {
            console.log(`[RODZINIADA SOLO] Polaczono przez socket.io! ID sesji: ${socket.id}`);
            joinSoloRoom();
        });
        
        if (socket.connected) {
            joinSoloRoom();
        }

        socket.on('soloStateUpdated', (remoteState) => {
            console.log(`[RODZINIADA SOLO] Otrzymano zdarzenie soloStateUpdated z serwera:`, remoteState);
            if (!remoteState || remoteState.challengeKey !== state.currentChallenge || state.finished) {
                console.warn(`[RODZINIADA SOLO] Zignorowano zdarzenie soloStateUpdated (nie pasuje do obecnego wyzwania lub wyzwanie zakonczone)`);
                return;
            }

            state.remoteStates[remoteState.challengeKey] = remoteState;

            const wasFinished = state.finished;

            if (remoteState.status === 'completed' || remoteState.status === 'finished' || remoteState.synced) {
                console.log(`[RODZINIADA SOLO] Wykryto, ze wyzwanie na serwerze jest juz zakonczone. Resetuje widok.`);
                resetRunForChallenge(state.currentChallenge);
                renderGame();
                if (!wasFinished) {
                    showResult();
                }
                return;
            }

            const rRevealed = Array.isArray(remoteState.revealed) ? remoteState.revealed : [];
            const rMisses = remoteState.misses || 0;
            console.log(`[RODZINIADA SOLO] Analiza stanu z serwera: rRevealed.length=${rRevealed.length}, state.revealed.size=${state.revealed.size}, rMisses=${rMisses}, state.misses=${state.misses}`);

            if (rRevealed.length > state.revealed.size || rMisses > state.misses) {
                if (!state.started) state.started = true;
                state.revealed = new Set(rRevealed);
                state.misses = rMisses;
                state.score = remoteState.score || 0;
                if (remoteState.guesses) {
                    state.guesses = [...remoteState.guesses];
                }
                
                const store = readStore();
                store.progress[state.currentChallenge] = {
                    score: state.score,
                    misses: state.misses,
                    revealed: [...state.revealed],
                    guesses: state.guesses,
                    updatedAt: new Date().toISOString()
                };
                writeStore(store);

                renderGame();
            }
        });

        els.answerForm.addEventListener('submit', submitAnswer);
        els.startChallengeButton?.addEventListener('click', startChallenge);
        els.prevChallenge.addEventListener('click', () => goToChallenge(-1));
        els.nextChallenge.addEventListener('click', () => goToChallenge(1));
        els.calendarButton.addEventListener('click', () => {
            renderCalendar();
            openLockedDialog(els.calendarDialog, 'calendar-dialog');
        });
        els.calendarPrevMonth?.addEventListener('click', () => changeCalendarMonth(-1));
        els.calendarNextMonth?.addEventListener('click', () => changeCalendarMonth(1));
        els.calendarCloseButton.addEventListener('click', () => closeLockedDialog(els.calendarDialog, 'calendar-dialog'));
        els.calendarDialog.addEventListener('close', () => setPageLocked('calendar-dialog', false));
        els.rankingTabs.forEach(button => {
            button.addEventListener('click', () => {
                state.rankingScope = button.dataset.rankingScope || 'all';
                rankingAutoFocusLocked = false;
                renderRanking([]);
                loadRanking();
            });
        });
        els.rankingList.addEventListener('scroll', () => {
            if (rankingScrollProgrammatic) {
                requestViewerRankingPositionUpdate();
                return;
            }
            rankingAutoFocusLocked = true;
            requestViewerRankingPositionUpdate();
        }, { passive: true });
        window.addEventListener('resize', requestViewerRankingPositionUpdate);
        els.answerInput.addEventListener('keydown', event => {
            if (event.key === 'Enter') {
                event.preventDefault();
                els.answerForm.requestSubmit();
            }
        });
        els.shareButton.addEventListener('click', () => {}); // Keep empty if needed or remove. Share button in main ui?

        els.resultCloseButton.addEventListener('click', async () => {
            await submitResultToServer();
            closeLockedDialog(els.resultDialog, 'result-dialog');
        });
        els.resultDialog.addEventListener('cancel', () => {
            submitResultToServer();
        });
        els.resultDialog.addEventListener('close', () => setPageLocked('result-dialog', false));
        
        const closeHelpDialog = () => {
            closeLockedDialog(els.helpDialog, 'help-dialog');
            localStorage.setItem('grajmytv_solo_help_seen', 'true');
        };
        els.helpButton.addEventListener('click', () => openLockedDialog(els.helpDialog, 'help-dialog'));
        els.helpCloseButton.addEventListener('click', closeHelpDialog);
        els.helpStartButton.addEventListener('click', closeHelpDialog);
        els.helpDialog.addEventListener('close', () => setPageLocked('help-dialog', false));
        
        const hasHistory = Object.keys(readStore().results || {}).length > 0 || Object.keys(state.remoteStates || {}).length > 0;
        if (!localStorage.getItem('grajmytv_solo_help_seen')) {
            if (hasHistory) {
                localStorage.setItem('grajmytv_solo_help_seen', 'true');
            } else {
                openLockedDialog(els.helpDialog, 'help-dialog');
            }
        }

        observeRankingHeight();
        startRankingLiveRefresh();
    }

    init().catch(() => {
        els.roundMessage.textContent = 'Nie uda\u0142o si\u0119 wczyta\u0107 dzisiejszej ankiety.';
    });
})();
