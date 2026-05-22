const sounds = {
    intro:   new Audio('/rodziniada/sounds/intro.mp3'),
    reveal:  new Audio('/rodziniada/sounds/reveal.mp3'),
    strike:  new Audio('/rodziniada/sounds/strike.mp3'),
    points:  new Audio('/rodziniada/sounds/points.mp3'),
    winner:  new Audio('/rodziniada/sounds/winner.mp3')
};

const failedSounds = {};
let audioCtx = null;
let soundVolume = 0.5;

Object.entries(sounds).forEach(([name, s]) => {
    s.load();
    s.volume = soundVolume;
    s.addEventListener('error', () => {
        failedSounds[name] = true;
    });
});

function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// programowe brzmienia syntezatora Web Audio API
function playSynthStrike() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    const duration = 0.45;
    const frequencies = [105, 157.5]; // Warm perfect-fifth interval drone
    
    // Low-pass filter to sweep down, cutting off any high-end harshness
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, now);
    filter.frequency.exponentialRampToValueAtTime(220, now + duration);
    filter.connect(ctx.destination);

    frequencies.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        // Triangle for body, Sawtooth (filtered) for television gameshow character
        osc.type = idx === 0 ? 'triangle' : 'sawtooth';
        osc.frequency.setValueAtTime(freq, now);
        osc.frequency.linearRampToValueAtTime(freq * 0.92, now + duration); // Soft slide down
        
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(soundVolume * 0.28, now + 0.03); // Softer volume, no pop
        gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
        
        osc.connect(gain);
        gain.connect(filter);
        
        osc.start(now);
        osc.stop(now + duration);
    });
}

function playSynthReveal() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Beautiful, delicate crystalline double ding (classic TV show chime)
    const chimes = [
        { delay: 0, freq: 1567.98, vol: 0.15 }, // G6 (crystalline high-frequency chime)
        { delay: 0.08, freq: 1975.53, vol: 0.18 } // B6 (sweet major-third interval response)
    ];
    
    chimes.forEach((chime) => {
        // Pure sine wave for the high-end crystalline chime ring
        const oscSine = ctx.createOscillator();
        const gainSine = ctx.createGain();
        oscSine.type = 'sine';
        oscSine.frequency.setValueAtTime(chime.freq, now + chime.delay);
        
        gainSine.gain.setValueAtTime(0, now + chime.delay);
        gainSine.gain.linearRampToValueAtTime(soundVolume * chime.vol, now + chime.delay + 0.01);
        gainSine.gain.exponentialRampToValueAtTime(0.0001, now + chime.delay + 0.35);
        
        oscSine.connect(gainSine);
        gainSine.connect(ctx.destination);
        oscSine.start(now + chime.delay);
        oscSine.stop(now + chime.delay + 0.35);
        
        // Soft triangle wave at half-frequency (one octave down) for body and warmth
        const oscTri = ctx.createOscillator();
        const gainTri = ctx.createGain();
        oscTri.type = 'triangle';
        oscTri.frequency.setValueAtTime(chime.freq / 2, now + chime.delay);
        
        gainTri.gain.setValueAtTime(0, now + chime.delay);
        gainTri.gain.linearRampToValueAtTime(soundVolume * chime.vol * 0.35, now + chime.delay + 0.015);
        gainTri.gain.exponentialRampToValueAtTime(0.0001, now + chime.delay + 0.30);
        
        oscTri.connect(gainTri);
        gainTri.connect(ctx.destination);
        oscTri.start(now + chime.delay);
        oscTri.stop(now + chime.delay + 0.30);
    });
}

function playSynthPoints() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Arcade double-ding sound
    const dings = [0, 0.12];
    dings.forEach((delay, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'sine';
        const freq = idx === 0 ? 523.25 : 659.25; // C5, then E5
        osc.frequency.setValueAtTime(freq, now + delay);
        
        gain.gain.setValueAtTime(0, now + delay);
        gain.gain.linearRampToValueAtTime(soundVolume * 0.25, now + delay + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.25);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + delay);
        osc.stop(now + delay + 0.25);
    });
}

function playSynthWinner() {
    const ctx = getAudioContext();
    const now = ctx.currentTime;
    
    // Joyful C major arpeggio arpeggiator fanfare: C5, E5, G5, C6
    const notes = [
        { time: 0.0, freq: 523.25 }, // C5
        { time: 0.1, freq: 659.25 }, // E5
        { time: 0.2, freq: 783.99 }, // G5
        { time: 0.3, freq: 1046.50 }, // C6
    ];
    
    notes.forEach((note) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.freq, now + note.time);
        
        gain.gain.setValueAtTime(0, now + note.time);
        gain.gain.linearRampToValueAtTime(soundVolume * 0.22, now + note.time + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.001, now + note.time + 0.5);
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.start(now + note.time);
        osc.stop(now + note.time + 0.5);
    });
}

export function play(name) {
    if (failedSounds[name] || !sounds[name]) {
        try {
            if (name === 'strike') playSynthStrike();
            else if (name === 'reveal') playSynthReveal();
            else if (name === 'points') playSynthPoints();
            else if (name === 'winner') playSynthWinner();
        } catch (e) {
            console.error("Synth play failed:", e);
        }
        return;
    }
    
    sounds[name].currentTime = 0;
    sounds[name].play().catch(() => {
        try {
            if (name === 'strike') playSynthStrike();
            else if (name === 'reveal') playSynthReveal();
            else if (name === 'points') playSynthPoints();
            else if (name === 'winner') playSynthWinner();
        } catch (err) {
            console.error("Synth play fallback failed:", err);
        }
    });
}

export function stop(name) {
    if (!sounds[name]) return;
    sounds[name].pause();
    sounds[name].currentTime = 0;
}

export function setVolume(v) {
    soundVolume = v;
    Object.values(sounds).forEach(s => s.volume = v);
}
