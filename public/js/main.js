document.addEventListener('DOMContentLoaded', () => {
    // Inicjalizacja ikon Lucide
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // ==========================================
    // MENU MOBILNE (HAMBURGER MENU)
    // ==========================================
    const hamburgerBtn = document.getElementById('hamburgerBtn');
    const navMenu = document.getElementById('navMenu');
    const hamburgerIcon = hamburgerBtn.querySelector('.hamburger-icon');
    const closeIcon = hamburgerBtn.querySelector('.close-icon');
    const mobileBackdrop = document.getElementById('mobileBackdrop');
    const navLinks = document.querySelectorAll('.nav-link');

    // Breakpoint musi być zgodny z CSS (@media max-width: 1100px)
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
