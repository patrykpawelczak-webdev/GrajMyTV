const sounds = {
    intro:   new Audio('/rodziniada/sounds/intro.mp3'),
    reveal:  new Audio('/rodziniada/sounds/reveal.mp3'),
    strike:  new Audio('/rodziniada/sounds/strike.mp3'),
    points:  new Audio('/rodziniada/sounds/points.mp3'),
    winner:  new Audio('/rodziniada/sounds/winner.mp3')
};

Object.values(sounds).forEach(s => { s.load(); s.volume = 0.5; });

export function play(name) {
    if (!sounds[name]) return;
    sounds[name].currentTime = 0;
    sounds[name].play().catch(() => {});
}

export function stop(name) {
    if (!sounds[name]) return;
    sounds[name].pause();
    sounds[name].currentTime = 0;
}

export function setVolume(v) {
    Object.values(sounds).forEach(s => s.volume = v);
}
