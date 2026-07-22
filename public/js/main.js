document.addEventListener('DOMContentLoaded', () => {
    const RODZINIADA_SOLO_STORAGE_KEY = 'grajmytv:rodziniada-solo:v3';
    const RODZINIADA_SOLO_LEGACY_STORAGE_KEYS = ['grajmytv:rodziniada-solo:v2', 'grajmytv:rodziniada-solo'];

    function redirectHashRoute() {
        const hash = window.location.hash || '';
        if (hash === '#/konta' || hash.endsWith('/konta')) {
            window.location.replace('/konta');
        }
    }

    redirectHashRoute();

    function clearRodziniadaSoloProgressFromUrl() {
        const params = new URLSearchParams(window.location.search);
        if (!params.has('resetRodziniadaSolo')) return;

        [RODZINIADA_SOLO_STORAGE_KEY, ...RODZINIADA_SOLO_LEGACY_STORAGE_KEYS].forEach(key => localStorage.removeItem(key));
        params.delete('resetRodziniadaSolo');
        const nextQuery = params.toString();
        const nextUrl = `${window.location.pathname}${nextQuery ? `?${nextQuery}` : ''}${window.location.hash}`;
        window.history.replaceState({}, '', nextUrl);
    }

    clearRodziniadaSoloProgressFromUrl();

    function clearLocalRodziniadaSoloAchievements() {
        [RODZINIADA_SOLO_STORAGE_KEY, ...RODZINIADA_SOLO_LEGACY_STORAGE_KEYS].forEach(key => {
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

    clearLocalRodziniadaSoloAchievements();

    // Inicjalizacja ikon Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    const pageLocks = new Set();
    let lockedScrollY = 0;

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

    // ==========================================
    // LOGOWANIE TESTEROW
    // ==========================================
    const authWidget = document.getElementById('authWidget');
    const openLoginButton = document.getElementById('openLoginButton');
    const authUser = document.getElementById('authUser');
    const authUserName = document.getElementById('authUserName');
    const logoutButton = document.getElementById('logoutButton');
    const mobileAuthWidget = document.getElementById('mobileAuthWidget');
    const mobileOpenLoginButton = document.getElementById('mobileOpenLoginButton');
    const mobileAuthUser = document.getElementById('mobileAuthUser');
    const mobileAuthUserName = document.getElementById('mobileAuthUserName');
    const mobileLogoutButton = document.getElementById('mobileLogoutButton');
    const loginDialog = document.getElementById('loginDialog');
    const loginForm = document.getElementById('loginForm');
    const loginUsername = document.getElementById('loginUsername');
    const loginPassword = document.getElementById('loginPassword');
    const loginMessage = document.getElementById('loginMessage');
    const loginCloseButton = document.getElementById('loginCloseButton');
    const toggleLoginPassword = document.getElementById('toggleLoginPassword');
    let loginRedirectToSolo = false;

    function openLoginDialog() {
        if (!loginDialog) return;
        if (typeof loginDialog.showModal === 'function') {
            loginDialog.showModal();
        } else {
            loginDialog.setAttribute('open', '');
        }
        setPageLocked('login-dialog', true);
        loginUsername?.focus();
    }

    function closeLoginDialog() {
        if (!loginDialog) return;
        if (typeof loginDialog.close === 'function') {
            loginDialog.close();
        } else {
            loginDialog.removeAttribute('open');
        }
        setPageLocked('login-dialog', false);
    }

    function renderAuth(state = {}) {
        if (authWidget) authWidget.hidden = false;
        if (mobileAuthWidget) mobileAuthWidget.hidden = false;
        const loggedIn = Boolean(state.isLoggedIn);
        if (openLoginButton) openLoginButton.hidden = loggedIn;
        if (mobileOpenLoginButton) mobileOpenLoginButton.hidden = loggedIn;
        if (authUser) authUser.hidden = !loggedIn;
        if (mobileAuthUser) mobileAuthUser.hidden = !loggedIn;
        if (authUserName) authUserName.textContent = state.nickname || 'Tester';
        if (mobileAuthUserName) mobileAuthUserName.textContent = state.nickname || 'Tester';
    }

    if (window.GrajMyTVAuth) {
        window.GrajMyTVAuth.onChange(renderAuth);
        window.GrajMyTVAuth.init().then(state => {
            if (!state.enabled && authWidget) {
                authWidget.hidden = true;
            }
            if (!state.enabled && mobileAuthWidget) {
                mobileAuthWidget.hidden = true;
            }
            if (new URLSearchParams(window.location.search).get('login') === 'required' && !state.isLoggedIn) {
                loginRedirectToSolo = true;
                if (loginMessage) loginMessage.textContent = 'Zaloguj się, aby uruchomić Rodziniadę.';
                openLoginDialog();
            }
        }).catch(() => {
            if (authWidget) authWidget.hidden = true;
            if (mobileAuthWidget) mobileAuthWidget.hidden = true;
        });
    }

    openLoginButton?.addEventListener('click', openLoginDialog);
    mobileOpenLoginButton?.addEventListener('click', () => {
        closeMenu();
        openLoginDialog();
    });
    loginCloseButton?.addEventListener('click', closeLoginDialog);
    toggleLoginPassword?.addEventListener('click', () => {
        if (!loginPassword) return;
        const isPassword = loginPassword.type === 'password';
        loginPassword.type = isPassword ? 'text' : 'password';
        toggleLoginPassword.setAttribute('aria-pressed', String(isPassword));
        toggleLoginPassword.setAttribute('aria-label', isPassword ? 'Ukryj hasło' : 'Pokaż hasło');
        toggleLoginPassword.innerHTML = `<i data-lucide="${isPassword ? 'eye-off' : 'eye'}"></i>`;
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });
    loginDialog?.addEventListener('click', event => {
        if (event.target === loginDialog) closeLoginDialog();
    });
    loginDialog?.addEventListener('close', () => setPageLocked('login-dialog', false));
    logoutButton?.addEventListener('click', async () => {
        await window.GrajMyTVAuth?.signOut();
    });
    mobileLogoutButton?.addEventListener('click', async () => {
        await window.GrajMyTVAuth?.signOut();
        closeMenu();
    });
    loginForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!window.GrajMyTVAuth) {
            if (loginMessage) {
                loginMessage.textContent = 'Logowanie chwilowo niedostepne. Odśwież stronę i spróbuj ponownie.';
            }
            return;
        }

        if (loginMessage) loginMessage.textContent = '';
        const submitButton = loginForm.querySelector('button[type="submit"]');
        const username = loginUsername?.value.trim() || '';
        const password = loginPassword?.value || '';
        if (!username || !password) {
            if (loginMessage) {
                loginMessage.textContent = 'Podaj nazwe uzytkownika i haslo.';
            }
            return;
        }

        if (submitButton) submitButton.disabled = true;

        try {
            if (loginMessage) loginMessage.textContent = 'Logowanie...';
            await window.GrajMyTVAuth.signIn(username, password);
            loginPassword.value = '';
            if (loginMessage) loginMessage.textContent = '';
            closeLoginDialog();
            if (loginRedirectToSolo) {
                window.location.href = resolveAppUrl('/rodziniada/solo');
            }
        } catch (error) {
            if (loginMessage) {
                loginMessage.textContent = error.message || 'Nieprawidlowa nazwa uzytkownika lub haslo.';
            }
        } finally {
            if (submitButton) submitButton.disabled = false;
        }
    });

    // ==========================================
    // MENU MOBILNE (HAMBURGER MENU)
    // ==========================================
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navMenu');
    const hamburgerIcon = hamburgerBtn.querySelector('.hamburger-icon');
    const closeIcon = hamburgerBtn.querySelector('.close-icon');
    const mobileBackdrop = document.getElementById('mobileBackdrop');
    const navLinks = document.querySelectorAll('.nav-link');

    // Breakpoint musi być zgodny z CSS (@media max-width: 68.75rem)
    const MOBILE_BREAKPOINT = 1100;

    function openMenu() {
        navMenu.classList.add('active');
        mobileBackdrop.classList.add('active');
        hamburgerIcon.classList.add('hidden');
        closeIcon.classList.remove('hidden');
        setPageLocked('mobile-menu', true);
        hamburgerBtn.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        navMenu.classList.remove('active');
        mobileBackdrop.classList.remove('active');
        hamburgerIcon.classList.remove('hidden');
        closeIcon.classList.add('hidden');
        setPageLocked('mobile-menu', false);
        hamburgerBtn.setAttribute('aria-expanded', 'false');
    }

    function toggleMenu() {
        if (navMenu.classList.contains('active')) {
            closeMenu();
        } else {
            openMenu();
        }
    }

    hamburgerBtn.addEventListener('click', toggleMenu);

    // Zamknij po kliknięciu w backdrop
    mobileBackdrop.addEventListener('click', closeMenu);

    // Zamknij po naciśnięciu klawisza Escape
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && navMenu.classList.contains('active')) {
            closeMenu();
        }
    });

    // Zamknij i zresetuj przy powiększeniu okna powyżej breakpointa
    window.addEventListener('resize', () => {
        if (window.innerWidth > MOBILE_BREAKPOINT && navMenu.classList.contains('active')) {
            closeMenu();
        }
    });

    // Zamknij menu po kliknięciu w link nawigacyjny
    navLinks.forEach(link => {
        link.addEventListener('click', () => {
            if (navMenu.classList.contains('active')) {
                closeMenu();
            }
            navLinks.forEach(l => l.classList.remove('active'));
            link.classList.add('active');
        });
    });

    // Podświetlanie aktywnego linku podczas przewijania
    const sections = document.querySelectorAll('section[id]');
    window.addEventListener('scroll', () => {
        let scrollY = window.pageYOffset;
        sections.forEach(current => {
            const sectionHeight = current.offsetHeight;
            const sectionTop = current.offsetTop - 100;
            const sectionId = current.getAttribute('id');

            if (scrollY > sectionTop && scrollY <= sectionTop + sectionHeight) {
                document.querySelector(`.nav-menu a[href*=${sectionId}]`)?.classList.add('active');
            } else {
                document.querySelector(`.nav-menu a[href*=${sectionId}]`)?.classList.remove('active');
            }
        });
    });







    // ==========================================
    // FILTROWANIE KATALOGU GIER
    // ==========================================
    const gameModeTabs = document.querySelectorAll('[data-mode-filter]');
    const gameCards = document.querySelectorAll('.game-card[data-game-variant="true"]');

    function setGameMode(mode) {
        gameModeTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.modeFilter === mode);
        });

        gameCards.forEach(card => {
            const modes = (card.dataset.gameModes || '').split(' ');
            card.classList.toggle('hidden-by-mode', !modes.includes(mode));
        });
    }

    gameModeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setGameMode(tab.dataset.modeFilter);
        });
    });

    setGameMode('solo');

    function resolveAppUrl(path) {
        if (window.location.protocol === 'file:') {
            return `http://localhost:3000${path}`;
        }

        return path;
    }

    document.querySelectorAll('a[href^="/"]').forEach(link => {
        link.href = resolveAppUrl(link.getAttribute('href'));
    });

    function openSoloOrLogin(event) {
        const authState = window.GrajMyTVAuth?.getState?.();
        if (authState?.enabled && authState.isLoggedIn) return true;

        event?.preventDefault();
        loginRedirectToSolo = true;
        if (loginMessage) loginMessage.textContent = 'Zaloguj się, aby uruchomić Rodziniadę.';
        openLoginDialog();
        return false;
    }

    document.querySelectorAll('a[href$="/rodziniada/solo"]').forEach(link => {
        link.addEventListener('click', openSoloOrLogin);
    });

    document.querySelectorAll('[data-card-href]').forEach(card => {
        const openCard = () => {
            if (card.dataset.cardHref === '/rodziniada/solo' && !openSoloOrLogin()) return;
            window.location.href = resolveAppUrl(card.dataset.cardHref);
        };

        card.addEventListener('click', event => {
            if (event.target.closest('a, button')) return;
            openCard();
        });

        card.addEventListener('keydown', event => {
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                openCard();
            }
        });
    });

    // ==========================================
    // NUMER DZISIEJSZEGO WYZWANIA RODZINIADY
    // ==========================================
    const dailyChallengeLink = document.querySelector('.daily-challenge-link');
    const dailyChallengeCopy = document.querySelector('.daily-challenge-copy');
    const dailyChallengeDefaultHtml = dailyChallengeCopy?.innerHTML || '';
    const dailyChallengeDefaultLabel = dailyChallengeLink?.getAttribute('aria-label') || '';
    let currentDailyChallengeNumber = 1;

    function dateFromKey(key) {
        const [year, month, day] = key.split('-').map(Number);
        return new Date(year, month - 1, day);
    }

    function getTodayKey(date = new Date()) {
        return [
            date.getFullYear(),
            String(date.getMonth() + 1).padStart(2, '0'),
            String(date.getDate()).padStart(2, '0')
        ].join('-');
    }

    function resolveChallengeNumber(startDate = '2026-07-19') {
        const diff = Math.floor((dateFromKey(getTodayKey()) - dateFromKey(startDate)) / 86400000) + 1;
        return Math.max(1, diff);
    }

    function setDailyChallengeNumber(number) {
        currentDailyChallengeNumber = number;
        document.querySelectorAll('[data-daily-challenge-number]').forEach(el => {
            el.textContent = `#${number}`;
        });
    }

    function renderCompletedDailyChallenge(completed = false) {
        if (!dailyChallengeLink || !dailyChallengeCopy) return;

        dailyChallengeLink.classList.toggle('is-completed', completed);
        if (!completed) {
            dailyChallengeLink.setAttribute('aria-label', dailyChallengeDefaultLabel);
            dailyChallengeCopy.innerHTML = dailyChallengeDefaultHtml;
            setDailyChallengeNumber(currentDailyChallengeNumber);
            return;
        }

        dailyChallengeLink.setAttribute('aria-label', 'Dzisiejsze wyzwanie Rodziniady jest wykonane');
        dailyChallengeCopy.innerHTML = `
            <span class="daily-challenge-completed-title">Wyzwanie wykonane</span>
            <span class="daily-challenge-completed-subtitle">Wróć jutro po więcej</span>
        `;
    }

    async function refreshDailyChallengeCompletion() {
        const authState = window.GrajMyTVAuth?.getState?.();
        const token = await window.GrajMyTVAuth?.getAccessToken?.();
        if (!authState?.enabled || !authState.isLoggedIn || !token) {
            renderCompletedDailyChallenge(false);
            return;
        }

        try {
            const response = await fetch(resolveAppUrl(`/rodziniada/api/solo-state?challengeKey=${getTodayKey()}`), {
                cache: 'no-store',
                headers: {
                    Authorization: `Bearer ${token}`
                }
            });
            if (!response.ok) {
                renderCompletedDailyChallenge(false);
                return;
            }

            const data = await response.json();
            renderCompletedDailyChallenge(data.state?.status === 'completed');
        } catch {
            renderCompletedDailyChallenge(false);
        }
    }

    async function loadDailyChallengeNumber() {
        if (!document.querySelector('[data-daily-challenge-number]')) return;

        setDailyChallengeNumber(resolveChallengeNumber());

        try {
            const response = await fetch(resolveAppUrl('/rodziniada/api/solo-calendar'), { cache: 'no-store' });
            if (!response.ok) return;

            const calendar = await response.json();
            setDailyChallengeNumber(resolveChallengeNumber(calendar.startDate));
        } catch {
            setDailyChallengeNumber(resolveChallengeNumber());
        }
    }

    loadDailyChallengeNumber();
    refreshDailyChallengeCompletion();
    window.GrajMyTVAuth?.onChange?.(() => refreshDailyChallengeCompletion());
    window.addEventListener('pageshow', () => refreshDailyChallengeCompletion());

    // ==========================================
    // ANIMACJA PRZY PRZEWIJANIU (SCROLL REVEAL)
    // ==========================================
    const revealElements = document.querySelectorAll('.reveal-on-scroll');

    const observerOptions = {
        root: null,
        rootMargin: '0px',
        threshold: 0.1
    };

    const revealObserver = new IntersectionObserver((entries, observer) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
                // Przestań obserwować po pokazaniu
                observer.unobserve(entry.target);
            }
        });
    }, observerOptions);

    revealElements.forEach(el => {
        revealObserver.observe(el);
    });
});
