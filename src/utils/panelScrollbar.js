/**
 * THE SCROLLBAR OF THE SIDE BROWSER
 *
 * The "Navegador Lateral" is a real web page inside an iframe of the side panel, so the
 * bar it scrolls with is the site's own — the browser default, or whatever thin grey
 * thing the site asked for. Next to the group list, whose bar is a rounded thumb
 * outlined in the border colour, it looked like a different product had been bolted on.
 *
 * A framed document cannot read the panel's CSS variables and the panel cannot reach
 * into a cross-origin document, so the colours travel between them as a message: the
 * frame says it is ready, the panel answers with the palette it is currently painted
 * with (`frameScrollbar.js`), and this script writes the rules. The palette is sent
 * again whenever the theme changes, so the bar follows it without a reload.
 *
 * Everything below the guard costs nothing anywhere else: in a normal tab, and in any
 * frame the extension did not put on the page, the file stops at the first line.
 *
 * All of it inside a function, and nothing declared at the top level. A content script
 * shares one isolated world with the others and with itself, and a frame can be
 * injected into twice — a page that rewrites a frame with `document.write()` reuses the
 * world it already had. A top-level `const` then throws "Identifier has already been
 * declared" and the whole script dies, which is what genbeta.com showed.
 */
(() => {
    const EXTENSION_ORIGIN = chrome.runtime.getURL('').slice(0, -1);

    if (window.self === window.top || location.ancestorOrigins?.[0] !== EXTENSION_ORIGIN) return;

    const STYLE_ID = 'itg-panel-scrollbar';

    /* The values arrive from our own page, but they end up inside a stylesheet: anything
       that could close a declaration and start another one is not a colour. */
    const clean = (value, fallback) =>
        typeof value === 'string' && value.length <= 64 && !/[;{}<>@]/.test(value)
            ? value.trim() || fallback
            : fallback;

    function paint(palette = {}) {
        const width = clean(palette.width, '6px');
        const track = clean(palette.track, '#1b2631');
        const border = clean(palette.border, '#34495e');
        const hover = clean(palette.hover, '#16a085');

        /* `scrollbar-width` is forced back to `auto` on the page's own scroller because
           the moment a scroller asks for the standard scrollbar Chrome stops honouring
           `::-webkit-scrollbar` on it — the two ways of styling one cannot be mixed.
           Only the document scroller is forced: a carousel that hides its bar with
           `scrollbar-width: none` is doing it on purpose and keeps doing it. */
        // The group list draws its thumb as a 2px outline around the background colour.
        // At this width the outline would be the whole thumb, so the outline's colour
        // becomes the thumb's: the same two colours, read the same way, in less room.
        // Nothing here is a comment on purpose — this string is written into somebody
        // else's page, so it carries no more than the rules.
        const css = `
html {
    scrollbar-width: auto !important;
    scrollbar-color: auto !important;
}

::-webkit-scrollbar {
    width: ${width} !important;
    height: ${width} !important;
}

::-webkit-scrollbar-track {
    background: ${track} !important;
    border-radius: 10px !important;
}

::-webkit-scrollbar-thumb {
    background-color: ${border} !important;
    border-radius: 10px !important;
    border: none !important;
}

::-webkit-scrollbar-thumb:hover {
    background-color: ${hover} !important;
    cursor: default !important;
}

::-webkit-scrollbar-corner {
    background: ${track} !important;
}
`;

        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            /* At `document_start` there is no `<head>` yet, and a stylesheet in
               `<html>` applies just the same. */
            (document.head || document.documentElement).appendChild(style);
        } else if (style.textContent === css) {
            return;
        }
        style.textContent = css;
    }

    window.addEventListener('message', (event) => {
        if (event.origin !== EXTENSION_ORIGIN) return;
        if (event.data?.type !== 'panel-scrollbar-theme') return;
        paint(event.data.payload);
    });

    /* The panel answers this with the palette. Asking, rather than waiting to be told,
       is what keeps the two ends from racing: the frame's `load` can fire before this
       script runs, and then a palette sent on `load` would arrive to nobody. */
    window.parent.postMessage({ type: 'panel-scrollbar-ready' }, EXTENSION_ORIGIN);
})();
