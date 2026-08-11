import fs from 'fs';
import path from 'path';

const htmlPath = 'src/ui/about/about.html';
const html = fs.readFileSync(htmlPath, 'utf8');

// Extract body content
let bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/);
let bodyContent = bodyMatch ? bodyMatch[1] : html;

// Remove script tags
bodyContent = bodyContent.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');

// Replace data-i18n attributes with Svelte translations
// <tag data-i18n="key">...text...</tag> -> <tag>{$t('key')}</tag>
bodyContent = bodyContent.replace(
    /(<[^>]+)data-i18n="([^"]+)"([^>]*)>(.*?)(<\/[^>]+>)/g,
    (match, startTag, key, endTag, innerText, closeTag) => {
        return `${startTag}${endTag}>{$t('${key}')}${closeTag}`;
    },
);

// For tags that just have data-i18n but maybe the regex above missed because of self closing or different structure
// Actually, data-i18n-title
bodyContent = bodyContent.replace(/(<[^>]+)data-i18n-title="([^"]+)"([^>]*>)/g, (match, startTag, key, endTag) => {
    return `${startTag}title="{$t('${key}')}"${endTag}`;
});

// aria-label
bodyContent = bodyContent.replace(/(<[^>]+)data-i18n-aria-label="([^"]+)"([^>]*>)/g, (match, startTag, key, endTag) => {
    return `${startTag}aria-label="{$t('${key}')}"${endTag}`;
});

const svelteContent = `<script>
    import { onMount } from 'svelte';
    import { i18nStore, t } from '../../stores/i18nStore.js';
    import { themeStore } from '../../stores/themeStore.js';

    onMount(async () => {
        await i18nStore.init();
        await themeStore.init();
    });

    function goBack() {
        window.history.back();
    }
</script>

${bodyContent.trim()}
`;

fs.mkdirSync('src/ui/pages/about', { recursive: true });
fs.writeFileSync('src/ui/pages/about/About.svelte', svelteContent);
fs.writeFileSync(
    'src/ui/pages/about/main.js',
    `
import About from './About.svelte';
import './about.css';
import '../../styles/fonts.css';
import '../../styles/themes.css';

const app = new About({
  target: document.body
});

export default app;
`,
);

fs.writeFileSync(
    'src/ui/pages/about/about.html',
    `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <script type="module" src="./main.js"></script>
</head>
<body>
</body>
</html>
`,
);

console.log('About page converted successfully.');
