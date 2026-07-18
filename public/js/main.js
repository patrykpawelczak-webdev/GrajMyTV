document.addEventListener('DOMContentLoaded', () => {
    const RODZINIADA_SOLO_STORAGE_KEY = 'grajmytv:rodziniada-solo:v2';
    const RODZINIADA_SOLO_LEGACY_STORAGE_KEYS = ['grajmytv:rodziniada-solo'];

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

    function openLoginDialog() {
        if (!loginDialog) return;
        if (typeof loginDialog.showModal === 'function') {
            loginDialog.showModal();
        } else {
            loginDialog.setAttribute('open', '');
        }
        loginUsername?.focus();
    }

    function closeLoginDialog() {
        if (!loginDialog) return;
        if (typeof loginDialog.close === 'function') {
            loginDialog.close();
        } else {
            loginDialog.removeAttribute('open');
        }
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
    loginDialog?.addEventListener('click', event => {
        if (event.target === loginDialog) closeLoginDialog();
    });
    logoutButton?.addEventListener('click', async () => {
        await window.GrajMyTVAuth?.signOut();
    });
    mobileLogoutButton?.addEventListener('click', async () => {
        await window.GrajMyTVAuth?.signOut();
        closeMenu();
    });
    loginForm?.addEventListener('submit', async event => {
        event.preventDefault();
        if (!window.GrajMyTVAuth) return;

        if (loginMessage) loginMessage.textContent = '';
        const submitButton = loginForm.querySelector('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;

        try {
            await window.GrajMyTVAuth.signIn(loginUsername.value.trim(), loginPassword.value);
            loginPassword.value = '';
            closeLoginDialog();
        } catch {
            if (loginMessage) {
                loginMessage.textContent = 'Nieprawidlowy e-mail lub haslo.';
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
        document.body.style.overflow = 'hidden';
        hamburgerBtn.setAttribute('aria-expanded', 'true');
    }

    function closeMenu() {
        navMenu.classList.remove('active');
        mobileBackdrop.classList.remove('active');
        hamburgerIcon.classList.remove('hidden');
        closeIcon.classList.add('hidden');
        document.body.style.overflow = '';
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

    document.querySelectorAll('[data-card-href]').forEach(card => {
        const openCard = () => {
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
    const challengeNumberEls = document.querySelectorAll('[data-daily-challenge-number]');

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

    function resolveChallengeNumber(startDate = '2026-07-01') {
        const diff = Math.floor((dateFromKey(getTodayKey()) - dateFromKey(startDate)) / 86400000) + 1;
        return Math.max(1, diff);
    }

    function setDailyChallengeNumber(number) {
        challengeNumberEls.forEach(el => {
            el.textContent = `#${number}`;
        });
    }

    function getRodziniadaSoloStore() {
        try {
            return JSON.parse(localStorage.getItem(RODZINIADA_SOLO_STORAGE_KEY) || '{}');
        } catch {
            return {};
        }
    }

    function isTodayChallengeCompleted() {
        return false;
    }

    function renderCompletedDailyChallenge() {
        if (!dailyChallengeLink || !dailyChallengeCopy || !isTodayChallengeCompleted()) return;

        dailyChallengeLink.classList.add('is-completed');
        dailyChallengeLink.setAttribute('aria-label', 'Dzisiejsze wyzwanie Rodziniady jest wykonane');
        dailyChallengeCopy.innerHTML = `
            <span class="daily-challenge-completed-title">Wyzwanie wykonane</span>
            <span class="daily-challenge-completed-subtitle">Wróć jutro po więcej</span>
        `;
    }

    async function loadDailyChallengeNumber() {
        if (!challengeNumberEls.length) return;

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
    renderCompletedDailyChallenge();
    window.addEventListener('pageshow', renderCompletedDailyChallenge);

    // ==========================================
    // ANIMACJA PRZY PRZEWIJANIU (SCROLL REVEAL)
    // ==========================================
    const revealElements = document.querySelectorAll('.reveal-on-scroll');

    const observerOptions = {
        root: null,
        rootMargin: '0rem',
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
