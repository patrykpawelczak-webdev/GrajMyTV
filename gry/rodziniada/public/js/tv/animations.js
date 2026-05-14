export function initGrain() {
    const canvas = document.getElementById('grainCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
    window.addEventListener('resize', resize); resize();

    function render() {
        const w = canvas.width, h = canvas.height;
        const img = ctx.createImageData(w, h);
        const data = img.data;
        for (let i = 0; i < data.length; i += 4) {
            const v = Math.random() * 25;
            data[i] = data[i+1] = data[i+2] = v;
            data[i+3] = 40;
        }
        ctx.putImageData(img, 0, 0);
        requestAnimationFrame(render);
    }
    render();
}

export function drawCountdown(canvas, text) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    
    // Prosta animacja zegara cyfrowego
    ctx.fillStyle = '#ff3b30';
    ctx.font = 'bold 300px "Courier New", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Efekt poświaty
    ctx.shadowColor = 'rgba(255, 59, 48, 0.8)';
    ctx.shadowBlur = 40;
    
    ctx.fillText(text, w / 2, h / 2);
    
    ctx.shadowBlur = 0;
}
