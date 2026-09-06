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
                    /*
                     * The licence and provenance notices travel with the package, not just
                     * with the repository.
                     *
                     * Two of the bundled libraries are Apache-2.0, whose section 4(d) asks
                     * for the notices to accompany the distribution — and the package *is*
                     * the distribution; the repository is not what a user installs. It also
                     * answers, inside the zip where the question gets asked, why
                     * `src/lib/tesseract-core.wasm.js` is 4.6 MB of base64: it names the
                     * package and version it was built from, with a hash to check it
                     * against. Unexplained, a blob that size reads as obfuscation.
                     */
                    src: 'THIRD-PARTY-NOTICES.md',
                    dest: '.',
                },
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
                    // The glob above only takes the files directly under src/utils.
                    src: 'src/utils/hint/*',
                    dest: 'src/utils/hint',
                    rename: { stripBase: true },
                },
                {
                    src: 'src/styles/*',
                    dest: 'src/styles',
                    rename: { stripBase: true },
                },
                {
                    /*
                     * The two files the OCR engine loads BY URL rather than by import.
                     *
                     * Everything else in `src/lib` is imported as a module and the
                     * bundler emits it into `assets/`, so copying the folder wholesale
                     * would ship a second, unused megabyte. These two cannot work that
                     * way: `Tesseract.createWorker` is handed `workerPath` and
                     * `corePath` as `chrome.runtime.getURL(...)` strings and fetches
                     * them at run time, so they have to exist at that exact path
                     * inside the package.
                     *
                     * They were not copied at all, so both URLs 404'd, `createWorker`
                     * threw, and the OCR button in the gallery failed for every user
                     * while working perfectly from source. Worth stating plainly:
                     * without them Tesseract's own defaults point at a CDN, and an
                     * extension that fetches its WASM core from the network is remote
                     * code — which Manifest V3 forbids outright. Keeping these local
                     * is what keeps the package self-contained.
                     */
                    src: 'src/lib/{worker.min.js,tesseract-core.wasm.js}',
                    dest: 'src/lib',
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
                {
                    src: 'assets/icons/*',
                    dest: 'assets/icons',
                    rename: { stripBase: true },
                },
                {
                    src: 'assets/icons/themes/*',
                    dest: 'assets/icons/themes',
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
        chunkSizeWarningLimit: 1000,
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
