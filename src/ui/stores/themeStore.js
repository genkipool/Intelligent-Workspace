import { writable } from 'svelte/store';
import { themesService } from '../services/themesService.js';

export const activeTheme = writable('viridian');

export const themeStore = {
    subscribe: activeTheme.subscribe,
    init: async () => {
        const themeName = await themesService.init();
        activeTheme.set(themeName);

        themesService.subscribe((theme) => {
            if (theme && theme.name) {
                activeTheme.set(theme.name);
                if (theme.colors) {
                    themesService.applyCustom(theme.colors);
                } else {
                    themesService.apply(theme.name);
                }
            }
        });
    },
    setTheme: async (themeName) => {
        activeTheme.set(themeName);
        await themesService.setTheme(themeName);
    },
};
