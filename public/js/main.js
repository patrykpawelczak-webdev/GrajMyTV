// ================== KARUZELA ==================
const carousel     = document.getElementById('carousel');
const cards        = document.querySelectorAll('.game-card');
const prevBtn      = document.getElementById('carouselPrev');
const nextBtn      = document.getElementById('carouselNext');
const gameDetail   = document.getElementById('gameDetail');

let currentIndex = 0;
let cardsVisible = getCardsVisible();

function getCardsVisible() {
    const w = window.innerWidth;
    if (w < 600)  return 1;
    if (w < 900)  return 2;
    return 4;
}

function updateCarousel() {
    cardsVisible = getCardsVisible();
    const maxIndex = Math.max(0, cards.length - cardsVisible);
    currentIndex = Math.min(currentIndex, maxIndex);

    cards.forEach((card, i) => {
        const isVisible = i >= currentIndex && i < currentIndex + cardsVisible;
        card.style.display = isVisible ? 'flex' : 'none';
    });

    prevBtn.disabled = currentIndex === 0;
    nextBtn.disabled = currentIndex >= cards.length - cardsVisible;
}

prevBtn.addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex--;
        updateCarousel();
    }
});

nextBtn.addEventListener('click', () => {
    if (currentIndex < cards.length - cardsVisible) {
        currentIndex++;
        updateCarousel();
    }
});

window.addEventListener('resize', updateCarousel);
updateCarousel();

// ================== KARTY - KLIKANIE ==================
function selectCard(card) {
    const game = card.dataset.game;

    // Aktywna karta
    cards.forEach(c => c.classList.remove('active'));
    if (!card.classList.contains('coming-soon')) {
        card.classList.add('active');
    }

    // Pokaż odpowiedni panel
    document.querySelectorAll('.detail-panel').forEach(p => {
        p.classList.remove('active');
    });

    if (card.classList.contains('coming-soon')) {
        const soonPanel = document.getElementById('detail-soon');
        if (soonPanel) soonPanel.classList.add('active');
    } else {
        const panel = document.getElementById(`detail-${game}`);
        if (panel) panel.classList.add('active');
    }

    // Płynne przewinięcie do opisu
    gameDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

cards.forEach(card => {
    card.addEventListener('click', () => selectCard(card));
});

// ================== COMING SOON z URL ==================
const urlParams = new URLSearchParams(window.location.search);
const soonGame  = urlParams.get('soon');
if (soonGame) {
    const soonPanel = document.getElementById('detail-soon');
    if (soonPanel) soonPanel.classList.add('active');

    const targetCard = document.querySelector(`[data-game="${soonGame}"]`);
    if (targetCard) {
        cards.forEach(c => c.classList.remove('active'));
        setTimeout(() => {
            gameDetail.scrollIntoView({ behavior: 'smooth' });
        }, 300);
    }
}

// ================== ANIMACJE WEJŚCIA ==================
const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
        if (entry.isIntersecting) {
            entry.target.style.opacity = '1';
            entry.target.style.transform = 'translateY(0)';
        }
    });
}, { threshold: 0.1 });

document.querySelectorAll('.about-card').forEach((card, i) => {
    card.style.opacity = '0';
    card.style.transform = 'translateY(20px)';
    card.style.transition = `opacity 0.5s ease ${i * 0.1}s, transform 0.5s ease ${i * 0.1}s`;
    observer.observe(card);
});