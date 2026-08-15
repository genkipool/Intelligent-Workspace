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
                const vars = Object.entries(parsed).map(
                    ([k, v]) => `--${k.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${v}`,
                );
                root.style.cssText = vars.join(';');
            } catch {}
        }
    }
})();
