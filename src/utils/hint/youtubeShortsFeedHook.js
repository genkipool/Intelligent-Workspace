/**
 * YOUTUBE SHORTS FEED (main world)
 *
 * A Shorts page has no watch-next sidebar: what plays after the current video is the
 * rest of the feed, and YouTube keeps that feed as a plain JavaScript property on the
 * `ytd-shorts` element (`shortsProcessedSequence`). Properties the page puts on a DOM
 * node are invisible from the extension's isolated world, which is why the floating
 * player had nothing to list on Shorts.
 *
 * Running in the page's own context, this reads that sequence and answers with the
 * video ids and thumbnails in it. It also performs the move: each entry carries the
 * navigation command YouTube itself would use, and dispatching it as `yt-navigate` on
 * `ytd-app` routes the feed the way clicking inside the page does -- without the
 * reload a plain `<a href="/shorts/...">` would cause, which would take the floating
 * window's video with it.
 *
 * Titles are not in the sequence; the isolated world fetches those separately.
 */
(() => {
    if (window.__itgShortsFeedInstalled) return;
    window.__itgShortsFeedInstalled = true;

    const sequence = () => {
        const shorts = document.querySelector('ytd-shorts');
        const seq = shorts && shorts.shortsProcessedSequence;
        return Array.isArray(seq) ? seq : [];
    };

    const currentVideoId = () =>
        location.pathname.startsWith('/shorts/') ? location.pathname.slice('/shorts/'.length) : '';

    const read = () => {
        const seq = sequence();
        const current = currentVideoId();
        const items = [];
        for (const entry of seq) {
            const videoId = entry && entry.videoId;
            if (!videoId) continue;
            const thumbnails = (entry.thumbnail && entry.thumbnail.thumbnails) || [];
            items.push({
                videoId,
                cover: (thumbnails[0] && thumbnails[0].url) || '',
            });
        }
        return { items, currentIndex: items.findIndex((item) => item.videoId === current) };
    };

    const go = (videoId) => {
        const entry = sequence().find((item) => item && item.videoId === videoId);
        const app = document.querySelector('ytd-app');
        if (!entry || !entry.command || !app) return false;
        app.dispatchEvent(
            new CustomEvent('yt-navigate', {
                bubbles: true,
                composed: true,
                detail: { endpoint: entry.command },
            }),
        );
        return true;
    };

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || typeof data !== 'object') return;

        if (data.__itgShortsFeed === 'request') {
            const payload = read();
            window.postMessage(
                {
                    __itgShortsFeed: 'response',
                    id: data.id,
                    items: payload.items,
                    currentIndex: payload.currentIndex,
                },
                '*',
            );
            return;
        }

        if (data.__itgShortsFeed === 'go' && typeof data.videoId === 'string') {
            go(data.videoId);
        }
    });
})();
