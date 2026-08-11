// offscreen.js -- runs in an offscreen document, plays Pomodoro sounds via Web Audio
chrome.runtime.onMessage.addListener((msg) => {
    if (msg.action === 'pomodoroPlaySound') {
        playSound(msg.soundType);
    }
});

function playSound(type) {
    try {
        const ctx = new AudioContext();
        const master = ctx.createGain();
        master.gain.value = 0.75;
        master.connect(ctx.destination);

        const schedule = {
            work: [
                [523.25, 0],
                [659.25, 0.28],
                [783.99, 0.56],
                [1046.5, 0.84],
            ],
            break: [
                [783.99, 0],
                [659.25, 0.32],
                [523.25, 0.64],
            ],
            allDone: [
                [523.25, 0],
                [659.25, 0.15],
                [783.99, 0.3],
                [1046.5, 0.45],
                [783.99, 0.65],
                [1046.5, 0.8],
                [1318.5, 0.95],
            ],
        }[type] || [[880, 0]];

        const waveType = type === 'break' ? 'triangle' : 'sine';

        schedule.forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const g = ctx.createGain();
            osc.connect(g);
            g.connect(master);
            osc.frequency.value = freq;
            osc.type = waveType;
            const t0 = ctx.currentTime + delay;
            g.gain.setValueAtTime(0, t0);
            g.gain.linearRampToValueAtTime(0.5, t0 + 0.06);
            g.gain.exponentialRampToValueAtTime(0.001, t0 + 0.7);
            osc.start(t0);
            osc.stop(t0 + 0.75);
        });

        // Close context after all sounds finish
        const totalDuration = (schedule[schedule.length - 1][1] + 1.2) * 1000;
        setTimeout(() => ctx.close(), totalDuration);
    } catch (e) {
        console.warn('[Offscreen] Audio error:', e);
    }
}
