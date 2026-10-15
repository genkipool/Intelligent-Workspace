(function () {
    const theme = localStorage.getItem('theme-mirror') || 'viridian';
    const root = document.documentElement;
    if (theme === 'system') {
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.setAttribute('data-theme', prefersDark ? 'dark' : 'light');
    } else {
        root.setAttribute('data-theme', theme);
        const colors = localStorage.getItem('theme-custom-colors');
        if (colors) {
            try {
                const parsed = JSON.parse(colors);
                // Same check as theme.js (this runs before any module can be imported): a
                // mirror written by an older version may still hold an unvalidated value.
                for (const [k, v] of Object.entries(parsed)) {
                    if (typeof v !== 'string' || /[;{}<>\\]/.test(v) || !CSS.supports('color', v)) continue;
                    root.style.setProperty(`--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}`, v);
                }
            } catch {}
        }
    }
})();
