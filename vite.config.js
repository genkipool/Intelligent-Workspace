import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default defineConfig({
    plugins: [
        svelte(),
        crx({ manifest }),
        viteStaticCopy({
            targets: [
                {
                    src: 'src/core/background/*',
                    dest: 'background',
                    rename: { stripBase: true },
                },
                {
                    src: 'src/core/background/handlers/*',
                    dest: 'background/handlers',
                    rename: { stripBase: true },
                },
                {
                    src: 'src/core/services/*',
                    dest: 'services',
                    rename: { stripBase: true },
                },
                {
                    src: 'src/core/agent-backend.js',
                    dest: '',
                    rename: { stripBase: true },
                },
                {
                    src: 'src/utils/*',
                    dest: 'src/utils',
                    rename: { stripBase: true },
                },
                {
                    src: 'src/styles/*',
                    dest: 'src/styles',
                    rename: { stripBase: true },
                },
                {
                    src: 'assets/images/*',
                    dest: 'assets/images',
                    rename: { stripBase: true },
                },
                {
                    src: 'assets/fonts/*',
                    dest: 'assets/fonts',
                    rename: { stripBase: true },
                },
            ],
        }),
    ],
    resolve: {
        alias: {
            '@': resolve(__dirname, './src'),
        },
    },
    build: {
        rollupOptions: {
            input: {
                popup: resolve(__dirname, 'src/ui/pages/popup/popup.html'),
                about: resolve(__dirname, 'src/ui/pages/about/about.html'),
                listGroup: resolve(__dirname, 'src/ui/pages/listGroup/listGroup.html'),
                rules: resolve(__dirname, 'src/ui/pages/rules/rules.html'),
                customize_hints: resolve(__dirname, 'src/ui/pages/customize_hints/customize_hints.html'),
                offscreen: resolve(__dirname, 'src/ui/pages/offscreen/offscreen.html'),
                dashboard: resolve(__dirname, 'src/ui/pages/pomodoro-dashboard/dashboard.html'),
                webActivity: resolve(__dirname, 'src/ui/pages/web-activity/web-activity.html'),
                webActivityBlocked: resolve(__dirname, 'src/ui/pages/web-activity/blocked.html'),
                preview: resolve(__dirname, 'src/ui/pages/selection-preview/preview.html'),
                savedThemes: resolve(__dirname, 'src/ui/pages/savedThemes/savedThemes.html'),
                permission: resolve(__dirname, 'src/ui/pages/permission/permission.html'),
            },
        },
    },
});
