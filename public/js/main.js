// ================== KARUZELA ==================
const carousel     = document.getElementById('carousel');
const cards        = document.querySelectorAll('.game-card');
const prevBtn      = document.getElementById('carouselPrev');
const nextBtn      = document.getElementById('carouselNext');
const gameDetail   = document.getElementById('gameDetail');

function rotateCarousel(direction) {
    if (!document.startViewTransition) {
        performRotation(direction);
    } else {
        document.startViewTransition(() => performRotation(direction));
    }
}

function performRotation(direction) {
    const children = Array.from(carousel.children);
    if (children.length < 3) return;

    if (direction === 'left') {
        carousel.prepend(children[children.length - 1]);
    } else if (direction === 'right') {
        carousel.appendChild(children[0]);
    }

    // Update active state to the center card
    const newChildren = Array.from(carousel.children);
    const middleCard = newChildren[Math.floor(newChildren.length / 2)];

    cards.forEach(c => c.classList.remove('active'));
    middleCard.classList.add('active');

    // Update detail panel
    const game = middleCard.dataset.game;
    document.querySelectorAll('.detail-panel').forEach(p => p.classList.remove('active'));
    
    if (middleCard.classList.contains('coming-soon')) {
        const soonPanel = document.getElementById('detail-soon');
        if (soonPanel) soonPanel.classList.add('active');
    } else {
        const panel = document.getElementById(`detail-${game}`);
        if (panel) panel.classList.add('active');
    }
}

prevBtn.addEventListener('click', () => rotateCarousel('left'));
nextBtn.addEventListener('click', () => rotateCarousel('right'));

// ================== KARTY - KLIKANIE ==================
function selectCard(card) {
    const children = Array.from(carousel.children);
    const index = children.indexOf(card);

    if (index === 0) {
        rotateCarousel('left');
    } else if (index === children.length - 1) {
        rotateCarousel('right');
    }

    setTimeout(() => {
        gameDetail.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 150);
}

// Klikanie wyłączone - nawigacja tylko strzałkami

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