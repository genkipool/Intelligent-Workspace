/**
 * NATIVE VIDEO PICTURE-IN-PICTURE
 *
 * The previous implementation reloaded the whole page inside an <iframe> placed in
 * the Document PiP window, then hid everything but the player with DOM surgery.
 * That is what made YouTube behave oddly: a second page load (ads, cookie walls,
 * black bands, live chat re-initialising the player) racing against the hiding.
 *
 * This one moves the *real* <video> node into the PiP document instead. There is no
 * reload, no second player, no lost playback position: the same media element keeps
 * playing, it just lives in another window for a while. The site's own JavaScript
 * still holds its reference, so YouTube's player API keeps working — which is what
 * makes the side list able to switch videos by clicking the real links in the tab.
 *
 * On close the node goes back to the exact slot it came from (parent + next sibling,
 * plus its original `controls` flag and inline style), so the page is left as found.
 *
 * Player chrome is ours: the video is stripped of native controls and we draw the
 * bar, so it looks the same on every site.
 */

/** Marks the video a page's own PiP button asked for, so we can pick it up. */
var ITG_PIP_TARGET_ATTR = 'data-itg-pip-target';

/** Offered in the speed menu, slowest first, so the strip reads left to right. */
var ITG_PIP_RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * Last window size the user settled on, and the theme in force, preloaded so opening
 * stays synchronous.
 *
 * Anchored to the window for the same reason the player object is: a second
 * injection of this file re-runs these declarations, and a plain `var` would blank
 * them while the loader that fills them only ever runs once — which is how a window
 * reopened after an extension reload came back with none of the theme's colours.
 */
var itgPipSavedDims = window.__itgPipSavedDims ?? {};
window.__itgPipSavedDims = itgPipSavedDims;

var itgPipTheme = window.__itgPipTheme ?? null;
window.__itgPipTheme = itgPipTheme;

var itgPipMessages = window.__itgPipMessages ?? null;
window.__itgPipMessages = itgPipMessages;

var itgPipLang = window.__itgPipLang ?? null;
window.__itgPipLang = itgPipLang;

var itgPipLoadPromise = null;

function itgNormalizePipLang(lang) {
    if (!lang || typeof lang !== 'string') return 'en';
    return lang.trim().toLowerCase().startsWith('es') ? 'es' : 'en';
}

function itgPipMsg(key, fallback) {
    if (itgPipMessages && itgPipMessages[key]?.message) {
        return itgPipMessages[key].message;
    }
    try {
        const msg = chrome.i18n.getMessage(key);
        if (msg) return msg;
    } catch {}
    return fallback;
}
window.itgPipMsg = itgPipMsg;

function itgLoadPipMessages(lang, force = false) {
    if (!lang) {
        try {
            chrome.storage.local.get('preferred-language', (stored) => {
                const raw = stored?.['preferred-language'] || chrome.i18n.getUILanguage() || 'en';
                itgLoadPipMessages(itgNormalizePipLang(raw), force);
            });
            return;
        } catch {
            lang = itgNormalizePipLang(chrome.i18n.getUILanguage());
        }
    }
    const normalized = itgNormalizePipLang(lang);
    if (!force && itgPipMessages && itgPipLang === normalized) {
        return Promise.resolve(itgPipMessages);
    }
    if (!force && itgPipLoadPromise) {
        return itgPipLoadPromise;
    }

    itgPipLoadPromise = (async () => {
        try {
            const stored = await chrome.storage.local.get('preferred-language');
            const langVal =
                lang ||
                stored?.['preferred-language'] ||
                (chrome.i18n?.getUILanguage()?.startsWith('es') ? 'es' : 'en');
            const normalized = itgNormalizePipLang(langVal);
            try {
                const url = chrome.runtime.getURL(`_locales/${normalized}/messages.json`);
                const res = await fetch(url);
                if (res.ok) {
                    itgPipMessages = await res.json();
                    itgPipLang = normalized;
                    window.__itgPipMessages = itgPipMessages;
                    window.__itgPipLang = itgPipLang;
                } else if (normalized !== 'en') {
                    const fallbackUrl = chrome.runtime.getURL('_locales/en/messages.json');
                    const fallbackRes = await fetch(fallbackUrl);
                    if (fallbackRes.ok) {
                        itgPipMessages = await fallbackRes.json();
                        itgPipLang = 'en';
                        window.__itgPipMessages = itgPipMessages;
                        window.__itgPipLang = itgPipLang;
                    }
                }
            } catch {
                // If direct fetch fails in content script, request via background
                if (typeof chrome !== 'undefined' && chrome.runtime?.sendMessage) {
                    const bgResponse = await chrome.runtime.sendMessage({
                        action: 'getI18nMessages',
                        lang: normalized,
                    });
                    if (bgResponse?.success && bgResponse.messages) {
                        itgPipMessages = bgResponse.messages;
                        itgPipLang = bgResponse.lang || normalized;
                        window.__itgPipMessages = itgPipMessages;
                        window.__itgPipLang = itgPipLang;
                    }
                }
            }
        } catch (e) {
            if (typeof chrome !== 'undefined' && chrome.runtime?.id) {
                console.log('[videoPip] Fallback to native chrome.i18n for messages:', e?.message || e);
            }
        } finally {
            itgPipLoadPromise = null;
        }
        itgRefreshPipUiTranslations();
        return itgPipMessages;
    })();

    return itgPipLoadPromise;
}

try {
    itgLoadPipMessages();
} catch {}

function itgRefreshPipUiTranslations() {
    const menu = document.getElementById('itg-autopip-menu');
    if (menu) {
        const scrollOpt = menu.querySelector('[data-itg-auto-pip-option="scroll"]');
        if (scrollOpt) {
            const strong = scrollOpt.querySelector('strong');
            const small = scrollOpt.querySelector('small');
            if (strong) strong.textContent = itgPipMsg('autoPipOnScrollTitle', 'Open automatically on scroll');
            if (small) {
                small.textContent = itgPipMsg(
                    'autoPipOnScrollDesc',
                    'When scrolling leaves the playing video off screen. Needs a recent click — pressing play yourself counts; otherwise it opens at your next click. It goes back when the video is in view again.',
                );
            }
        }
        const hiddenOpt = menu.querySelector('[data-itg-auto-pip-option="hidden"]');
        if (hiddenOpt) {
            const strong = hiddenOpt.querySelector('strong');
            const small = hiddenOpt.querySelector('small');
            if (strong)
                strong.textContent = itgPipMsg('autoPipOnHiddenTitle', 'Open automatically when leaving the tab');
            if (small) {
                small.textContent = itgPipMsg(
                    'autoPipOnHiddenDesc',
                    'When switching to another tab or another program. It goes back on returning to the tab.',
                );
            }
        }
        const frameOpt = menu.querySelector('[data-itg-auto-pip-option="frame"]');
        if (frameOpt) {
            const strong = frameOpt.querySelector('strong');
            const small = frameOpt.querySelector('small');
            if (strong) strong.textContent = itgPipMsg('pipFrameTitle', 'Set position and size');
            if (small) {
                small.textContent = itgPipMsg(
                    'pipFrameDesc',
                    'Drag a rectangle where you want the floating window, at the size you want it.',
                );
            }
        }
    }

    const pipTitle = itgPipMsg('omnibarPrefixVideoPipTitle', 'Picture-in-Picture (Video)');
    const ytBtn = document.getElementById('itg-yt-pip-button');
    if (ytBtn) {
        ytBtn.setAttribute('title', pipTitle);
        ytBtn.setAttribute('aria-label', pipTitle);
    }
    const shortsBtn = document.getElementById('itg-yt-shorts-pip-button')?.querySelector('button');
    if (shortsBtn) {
        shortsBtn.setAttribute('title', pipTitle);
        shortsBtn.setAttribute('aria-label', pipTitle);
    }
    const genericBtn = document.getElementById('itg-generic-pip-button');
    if (genericBtn) {
        genericBtn.setAttribute('title', pipTitle);
        genericBtn.setAttribute('aria-label', pipTitle);
    }
    const tiktokBtns = document.querySelectorAll('.itg-tiktok-pip-button');
    for (const tBtn of tiktokBtns) {
        tBtn.setAttribute('title', pipTitle);
        tBtn.setAttribute('aria-label', pipTitle);
    }

    ItgVideoPip.current?.updateTitlesAndLabels();
}

/**
 * Document PiP needs the click's transient activation, and any `await` before
 * `requestWindow()` risks losing it. The sizes are read once, up front, so the
 * open path never has to wait on storage.
 */
function itgPreloadPipDims() {
    try {
        chrome.storage.local.get(
            [
                'lastNormalPipWidth',
                'lastNormalPipHeight',
                'lastShortPipWidth',
                'lastShortPipHeight',
                'activeTheme',
                'preferred-language',
            ],
            (stored) => {
                if (!stored) return;
                Object.assign(itgPipSavedDims, stored);
                itgPipTheme = stored.activeTheme ?? null;
                window.__itgPipTheme = itgPipTheme;
                const lang =
                    stored['preferred-language'] || (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');
                itgLoadPipMessages(lang);
            },
        );
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            if (changes.activeTheme) {
                itgPipTheme = changes.activeTheme.newValue ?? null;
                window.__itgPipTheme = itgPipTheme;
                ItgVideoPip.current?.applyTheme();
            }
            if (changes['preferred-language']) {
                const newLang =
                    changes['preferred-language'].newValue ||
                    (chrome.i18n.getUILanguage().startsWith('es') ? 'es' : 'en');
                itgLoadPipMessages(newLang, true);
            }
        });
    } catch {}
}

// --- Video discovery ---------------------------------------------------------

/**
 * Every video reachable from `root`, including the ones inside shadow roots and
 * same-origin iframes.
 *
 * Sites that never showed a PiP button in this extension were mostly the ones that
 * put their player in a shadow root or in an iframe of their own domain: a plain
 * `document.querySelector('video')` cannot see either.
 */
function itgFindVideos(root = document, depth = 0) {
    if (depth > 4) return [];
    const found = [];
    try {
        found.push(...root.querySelectorAll('video'));
    } catch {}

    // Shadow roots: querySelectorAll stops at the boundary, so walk them explicitly.
    try {
        for (const el of root.querySelectorAll('*')) {
            if (el.shadowRoot) found.push(...itgFindVideos(el.shadowRoot, depth + 1));
        }
    } catch {}

    // Same-origin iframes only — a cross-origin one throws on contentDocument.
    try {
        for (const frame of root.querySelectorAll('iframe')) {
            try {
                const doc = frame.contentDocument;
                if (doc) found.push(...itgFindVideos(doc, depth + 1));
            } catch {}
        }
    } catch {}

    return found;
}

/** A video worth detaching: attached, sized, and actually carrying media. */
function itgIsUsableVideo(video) {
    if (!video || video.tagName !== 'VIDEO' || !video.isConnected) return false;
    if (!video.currentSrc && !video.src && !video.querySelector('source') && !video.srcObject) return false;
    const rect = video.getBoundingClientRect();
    return rect.width >= 80 && rect.height >= 60;
}

/**
 * The video the user means: whatever a page's own PiP button flagged, else the
 * biggest one on screen — the same "largest clientHeight wins" rule that makes
 * detection work without a per-site selector.
 */
function itgPickBestVideo() {
    const flagged = document.querySelector(`video[${ITG_PIP_TARGET_ATTR}]`);
    if (flagged && itgIsUsableVideo(flagged)) return flagged;

    const candidates = itgFindVideos().filter(itgIsUsableVideo);
    if (!candidates.length) return null;

    const playing = candidates.filter((v) => !v.paused && !v.ended);
    const pool = playing.length ? playing : candidates;
    return pool.reduce((best, v) => (best.clientHeight * best.clientWidth < v.clientHeight * v.clientWidth ? v : best));
}

/**
 * The deepest element under the pointer, following shadow roots down. `e.target`
 * stops at the host of a closed-over player, which is exactly the case that used
 * to hide the video from us.
 */
function itgDeepElementFromPoint(x, y) {
    let node = document.elementFromPoint(x, y);
    let guard = 0;
    while (node?.shadowRoot && guard++ < 10) {
        const inner = node.shadowRoot.elementFromPoint?.(x, y);
        if (!inner || inner === node) break;
        node = inner;
    }
    return node;
}

/** The video under the pointer, whether the cursor is on it or on its wrapper. */
function itgVideoFromPoint(x, y) {
    const node = itgDeepElementFromPoint(x, y);
    if (!node) return null;
    if (node.tagName === 'VIDEO') return node;
    const inside = node.querySelector?.('video');
    if (inside) return inside;
    // Overlays sit on top of the player, so look outwards too.
    const container = node.closest?.('*:has(> video)');
    return container?.querySelector('video') ?? null;
}

// --- Site adapters -----------------------------------------------------------

/**
 * True when this document is the floating player's own window.
 *
 * That window is an about:blank auxiliary context of a matched page, so the content
 * scripts load into it as well. Nothing of ours belongs there: it already *is* the
 * picture-in-picture, and hints or another PiP button on top of it are noise.
 */
function itgIsInsidePipWindow() {
    return document.documentElement.hasAttribute('data-itg-pip-window');
}

/**
 * Sites whose player must not have its <video> taken away.
 *
 * X rebuilds its player from a component tree that owns those nodes: move the video
 * out and the next render finds the DOM it expected gone, which is what breaks the
 * player there. For these the node stays exactly where it is and the floating window
 * shows a capture of it instead — the page is never touched, so nothing can break.
 */
var ITG_PIP_STREAM_HOSTS = [/(^|\.)x\.com$/, /(^|\.)twitter\.com$/];

function itgPipModeFor(video) {
    if (ITG_PIP_STREAM_HOSTS.some((rule) => rule.test(location.hostname))) return 'stream';
    // Without captureStream there is no alternative to moving the node anyway.
    return typeof video.captureStream === 'function' || typeof video.mozCaptureStream === 'function' ? 'move' : 'move';
}

function itgIsYouTube() {
    return /(^|\.)youtube\.com$/.test(location.hostname) || location.hostname === 'youtu.be';
}

function itgIsYouTubeShorts() {
    return itgIsYouTube() && location.pathname.startsWith('/shorts/');
}

/** Text of the first matching child, trimmed, or ''. */
function itgText(root, selectors) {
    for (const selector of selectors) {
        const el = root.querySelector(selector);
        const text = el?.textContent?.trim();
        if (text) return text;
    }
    return '';
}

/**
 * One entry of the side list. `linkEl` is the anchor *in the tab*, not a copy:
 * clicking it lets YouTube do its own SPA navigation, which is why switching
 * video keeps the PiP window alive instead of reloading anything.
 */
function itgReadYouTubeItem(el) {
    const link = el.querySelector('a[href*="/watch"], a[href*="/shorts/"], a#thumbnail, a');
    if (!link) return null;
    const title =
        itgText(el, [
            '#video-title',
            '.yt-lockup-metadata-view-model-wiz__title',
            '.yt-lockup-metadata-view-model__title',
            'h3 span[role="text"]',
            'h3',
        ]) ||
        link.title ||
        link.getAttribute('aria-label') ||
        '';
    if (!title) return null;
    return {
        el,
        linkEl: link,
        title,
        cover: itgYouTubeCover(el, link),
        user: itgText(el, [
            '.ytd-channel-name',
            // Current sidebar markup; the -wiz- variants are the older rollout.
            '.ytContentMetadataViewModelMetadataText',
            '.yt-content-metadata-view-model-wiz__metadata-text',
            '.yt-content-metadata-view-model__metadata-text',
        ]),
        duration: itgText(el, [
            '.ytd-thumbnail-overlay-time-status-renderer',
            // Not plain `badge-shape`: the second badge on a video can be something
            // else entirely ("fundraising"), and that is what would show as a length.
            '.ytBadgeShapeThumbnailBadge',
            '.badge-shape-wiz__text',
            '.ytThumbnailOverlayBadgeViewModelBadge',
        ]),
    };
}

/**
 * YouTube only fills in a thumbnail's `src` once the row is close to the viewport,
 * so every entry below the fold arrived here with no image at all. The address is
 * derivable from the video id, which the link always carries, so the side list can
 * show a cover for a row the page itself has not bothered to load yet.
 */
function itgYouTubeCover(el, link) {
    const loaded = el.querySelector('img[src*="ytimg.com"], img[src^="data:"]');
    if (loaded?.src) return loaded.src;
    try {
        const href = link.getAttribute('href') || '';
        const url = new URL(href, location.origin);
        const id = url.searchParams.get('v') || (url.pathname.startsWith('/shorts/') ? url.pathname.slice(8) : '');
        if (id) return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/mqdefault.jpg`;
    } catch {}
    return '';
}

/**
 * The lists YouTube already has in the page: the playlist panel, when a playlist is
 * open, and the watch-next sidebar. Both markups are read because YouTube has been
 * migrating the sidebar from `ytd-compact-video-renderer` to `yt-lockup-view-model`
 * and either can be live depending on the rollout.
 */
function itgReadYouTubeLists() {
    const lists = [];

    const playlist = [...document.querySelectorAll('ytd-playlist-panel-video-renderer')]
        .map((el) => {
            const item = itgReadYouTubeItem(el);
            if (item) item.isActive = el.hasAttribute('selected');
            return item;
        })
        .filter(Boolean);
    if (playlist.length) {
        lists.push({ category: itgPipMsg('pipPlaylist', 'Playlist'), items: playlist, mainList: true });
    }

    const secondary = document.querySelector('ytd-watch-next-secondary-results-renderer') || document;
    const seen = new Set();
    const recommended = [
        ...secondary.querySelectorAll('ytd-compact-video-renderer, yt-lockup-view-model, ytd-compact-radio-renderer'),
    ]
        .map(itgReadYouTubeItem)
        .filter((item) => {
            if (!item) return false;
            const href = item.linkEl.getAttribute('href') || item.title;
            if (seen.has(href)) return false;
            seen.add(href);
            return true;
        });
    if (recommended.length) {
        lists.push({ category: itgPipMsg('pipRecommended', 'Recommended'), items: recommended });
    }

    return lists;
}

/**
 * The comment threads YouTube has already rendered into the page.
 *
 * They are read rather than fetched: the page is signed in and its threads are
 * already there, so there is no API key, no quota and no second copy of the data to
 * keep in step. `el` is kept because replying drives that same thread's own box.
 */
function itgReadYouTubeComments(limit = 40) {
    const threads = [...document.querySelectorAll('ytd-comment-thread-renderer')].slice(0, limit);
    return threads
        .map((el) => {
            const text = itgText(el, ['#content-text', 'yt-attributed-string#content-text']);
            if (!text) return null;
            const likeBtn = el.querySelector(
                '#like-button button, like-button-shape button, ytd-toggle-button-renderer#like-button button',
            );
            const dislikeBtn = el.querySelector(
                '#dislike-button button, dislike-button-shape button, ytd-toggle-button-renderer#dislike-button button',
            );
            const isLiked =
                likeBtn?.getAttribute('aria-pressed') === 'true' ||
                likeBtn?.classList.contains('yt-spec-button-shape-next--tonal');
            const isDisliked =
                dislikeBtn?.getAttribute('aria-pressed') === 'true' ||
                dislikeBtn?.classList.contains('yt-spec-button-shape-next--tonal');
            return {
                el,
                author: itgText(el, ['#author-text', 'a#author-text span', '#header-author a']),
                text,
                avatar: el.querySelector('#author-thumbnail img')?.src || '',
                likes: itgText(el, [
                    '#vote-count-middle',
                    '#vote-count-left',
                    '.yt-spec-button-shape-next__button-text-content',
                ]),
                when: itgText(el, ['.published-time-text a', '#published-time-text a']),
                isLiked: !!isLiked,
                isDisliked: !!isDisliked,
            };
        })
        .filter(Boolean);
}

/**
 * The replies already loaded under a thread.
 *
 * Scoped to `#replies`, because the top-level comment is a `ytd-comment-view-model`
 * of its own and would otherwise come back as the first reply to itself.
 */
function itgReadYouTubeReplies(thread) {
    return [...thread.querySelectorAll('#replies ytd-comment-view-model, #replies ytd-comment-renderer')]
        .map((el) => {
            const text = itgText(el, ['#content-text']);
            if (!text) return null;
            const likeBtn = el.querySelector(
                '#like-button button, like-button-shape button, ytd-toggle-button-renderer#like-button button',
            );
            const dislikeBtn = el.querySelector(
                '#dislike-button button, dislike-button-shape button, ytd-toggle-button-renderer#dislike-button button',
            );
            const isLiked =
                likeBtn?.getAttribute('aria-pressed') === 'true' ||
                likeBtn?.classList.contains('yt-spec-button-shape-next--tonal');
            const isDisliked =
                dislikeBtn?.getAttribute('aria-pressed') === 'true' ||
                dislikeBtn?.classList.contains('yt-spec-button-shape-next--tonal');
            return {
                el,
                author: itgText(el, ['#author-text', 'a#author-text span']),
                text,
                avatar: el.querySelector('#author-thumbnail img')?.src || '',
                likes: itgText(el, [
                    '#vote-count-middle',
                    '#vote-count-left',
                    '.yt-spec-button-shape-next__button-text-content',
                ]),
                when: itgText(el, ['.published-time-text a', '#published-time-text a']),
                isLiked: !!isLiked,
                isDisliked: !!isDisliked,
            };
        })
        .filter(Boolean);
}

function itgGetYouTubeVideoLikeButton() {
    return (
        document.querySelector('like-button-view-model button') ||
        document.querySelector(
            'ytd-watch-metadata #top-level-buttons-computed segmented-like-dislike-button-view-model button:first-of-type',
        ) ||
        document.querySelector('#segmented-like-button button') ||
        document.querySelector('ytd-toggle-button-renderer#like-button button') ||
        document.querySelector('#like-button button') ||
        document.querySelector('ytd-like-button-renderer button')
    );
}

function itgGetYouTubeVideoDislikeButton() {
    return (
        document.querySelector('dislike-button-view-model button') ||
        document.querySelector(
            'ytd-watch-metadata #top-level-buttons-computed segmented-like-dislike-button-view-model button:last-of-type',
        ) ||
        document.querySelector('#segmented-dislike-button button') ||
        document.querySelector('ytd-toggle-button-renderer#dislike-button button') ||
        document.querySelector('#dislike-button button') ||
        document.querySelector('ytd-dislike-button-renderer button')
    );
}

function itgGetYouTubeVideoVoteStatus() {
    const likeBtn = itgGetYouTubeVideoLikeButton();
    const dislikeBtn = itgGetYouTubeVideoDislikeButton();
    const isLiked =
        likeBtn?.getAttribute('aria-pressed') === 'true' ||
        likeBtn?.classList.contains('yt-spec-button-shape-next--tonal') ||
        likeBtn?.parentElement?.classList?.contains('style-default-active');
    const isDisliked =
        dislikeBtn?.getAttribute('aria-pressed') === 'true' ||
        dislikeBtn?.classList.contains('yt-spec-button-shape-next--tonal') ||
        dislikeBtn?.parentElement?.classList?.contains('style-default-active');
    return {
        isLiked: !!isLiked,
        isDisliked: !!isDisliked,
        hasLike: !!likeBtn,
        hasDislike: !!dislikeBtn,
    };
}

function itgVoteYouTubeComment(commentEl, voteType) {
    if (!commentEl) return false;
    const selector =
        voteType === 'like'
            ? '#like-button button, like-button-shape button, ytd-toggle-button-renderer#like-button button'
            : '#dislike-button button, dislike-button-shape button, ytd-toggle-button-renderer#dislike-button button';
    const btn = commentEl.querySelector(selector);
    if (btn) {
        btn.click();
        return true;
    }
    return false;
}

/**
 * The thread as it exists right now.
 *
 * YouTube recycles the comment list as the page scrolls, so the element captured
 * when the panel was built may already be detached by the time the user asks for its
 * replies — and expanding a detached thread does nothing, which is exactly what
 * "the replies do not appear" looks like. Matching on the comment's own text finds
 * the live node that replaced it.
 */
function itgResolveThread(comment) {
    if (comment.el?.isConnected) return comment.el;
    const match = [...document.querySelectorAll('ytd-comment-thread-renderer')].find(
        (el) => itgText(el, ['#content-text']) === comment.text,
    );
    if (match) comment.el = match;
    return match ?? null;
}

/** The "N replies" control, when the thread has replies still to load. */
function itgYouTubeRepliesButton(thread) {
    return (
        thread.querySelector('#more-replies yt-button-shape button') ||
        thread.querySelector('#more-replies button') ||
        null
    );
}

/**
 * Makes YouTube fetch a thread's replies.
 *
 * They are not in the page until its own button is pressed — the placeholder it
 * leaves behind is literally called `yt-ghost-comments` — so the button is pressed
 * and the result waited for, rather than guessed at.
 */
async function itgExpandYouTubeReplies(thread) {
    const button = itgYouTubeRepliesButton(thread);
    if (!button) return itgReadYouTubeReplies(thread);

    // Pressing the button on a thread the tab is not showing loads nothing at all:
    // the comment list is virtualised, and YouTube only fetches for what is on
    // screen. Bringing it into view first is the difference between ten replies and
    // none, which is why the button appeared to do nothing.
    try {
        thread.scrollIntoView({ block: 'center' });
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 250));

    (itgYouTubeRepliesButton(thread) ?? button).click();
    await itgWaitFor(() => itgReadYouTubeReplies(thread).length > 0, 8000);
    return itgReadYouTubeReplies(thread);
}

/** Waits for something to appear, polling, and gives up rather than hanging. */
function itgWaitFor(get, timeoutMs = 3000) {
    return new Promise((resolve) => {
        const started = Date.now();
        const tick = () => {
            let value = null;
            try {
                value = get();
            } catch {}
            if (value) return resolve(value);
            if (Date.now() - started > timeoutMs) return resolve(null);
            setTimeout(tick, 120);
        };
        tick();
    });
}

/**
 * Posts a reply by driving YouTube's own reply box in the tab.
 *
 * Nothing here talks to an API: it opens the box the page already has, types into
 * it and presses its send button, so the comment is posted as the signed-in user
 * with whatever checks YouTube applies to a real one.
 *
 * The typing is done twice over because the editor is a contenteditable that only
 * reacts to real edits: execCommand is the one that behaves like typing, but it
 * needs the tab focused, and the tab is not focused while the floating player is —
 * so assigning the text and firing `input` is the fallback. Whether either worked is
 * decided by the send button, which YouTube keeps disabled until it sees content.
 */
async function itgReplyToYouTubeComment(thread, text) {
    const replyButton = thread.querySelector(
        '#reply-button-end button, ytd-button-renderer#reply-button-end button, #reply-button button',
    );
    if (!replyButton) return false;
    replyButton.click();

    const editor = await itgWaitFor(() => thread.querySelector('ytd-commentbox #contenteditable-root'));
    if (!editor) return false;

    editor.focus();
    let typed = false;
    try {
        typed = document.execCommand('insertText', false, text);
    } catch {}
    if (!typed) {
        editor.textContent = text;
        editor.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
    }

    const submit = await itgWaitFor(() => {
        const button = thread.querySelector('ytd-commentbox #submit-button button');
        return button && !button.disabled && button.getAttribute('aria-disabled') !== 'true' ? button : null;
    });
    if (!submit) return false;
    submit.click();
    return true;
}

/**
 * Searches YouTube without touching the page.
 *
 * The results page is fetched and read rather than navigated to: opening it in the
 * tab would tear down the player, and the player is the video currently in the
 * floating window. YouTube ships its data as a `ytInitialData` blob in the HTML, and
 * the tab is already on youtube.com, so the request is same-origin and carries the
 * user's session — the results are the ones they would see themselves.
 */
async function itgSearchYouTube(query) {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    const response = await fetch(url, { credentials: 'include' });
    const html = await response.text();

    const match = html.match(/var ytInitialData\s*=\s*({.+?});\s*<\/script>/s);
    if (!match) return [];

    let data;
    try {
        data = JSON.parse(match[1]);
    } catch {
        return [];
    }

    // The shape of that blob changes often, so the videos are collected by walking it
    // for anything carrying a videoId and a title rather than by a fixed path.
    const found = [];
    const seen = new Set();
    const walk = (node, depth = 0) => {
        if (!node || depth > 14 || found.length >= 30) return;
        if (Array.isArray(node)) {
            for (const child of node) walk(child, depth + 1);
            return;
        }
        if (typeof node !== 'object') return;

        const renderer = node.videoRenderer || node.compactVideoRenderer;
        if (renderer?.videoId && !seen.has(renderer.videoId)) {
            const title = renderer.title?.runs?.[0]?.text ?? renderer.title?.simpleText ?? '';
            if (title) {
                seen.add(renderer.videoId);
                found.push({
                    id: renderer.videoId,
                    title,
                    user: renderer.ownerText?.runs?.[0]?.text ?? renderer.shortBylineText?.runs?.[0]?.text ?? '',
                    duration: renderer.lengthText?.simpleText ?? '',
                    cover:
                        renderer.thumbnail?.thumbnails?.at(-1)?.url ??
                        `https://i.ytimg.com/vi/${renderer.videoId}/mqdefault.jpg`,
                });
            }
        }
        for (const value of Object.values(node)) walk(value, depth + 1);
    };
    walk(data);
    return found;
}

/**
 * Opens a video seamlessly inside the current tab and PiP player without a full-page reload,
 * keeping the floating Picture-in-Picture window alive and playing.
 */
function itgOpenYouTubeVideo(videoId, session = null) {
    if (!videoId) return;

    if (itgIsYouTube()) {
        // 1. If an anchor with this video exists in the YouTube DOM, clicking it works via YouTube's native handlers
        const inDomLink = document.querySelector(
            `a[href*="${videoId}"], a[href*="/watch?v=${videoId}"], a[href*="/shorts/${videoId}"]`,
        );
        if (inDomLink) {
            inDomLink.click();
        } else {
            // 2. Request background service worker to execute in MAIN world (bypassing YouTube's CSP)
            try {
                chrome.runtime.sendMessage({ action: 'playYouTubeVideoInPage', videoId }, () => {
                    if (chrome.runtime.lastError) {
                        console.warn('[ITG PiP] Background script error:', chrome.runtime.lastError);
                    }
                });
            } catch (err) {
                console.warn('[ITG PiP] sendMessage error:', err);
            }
        }

        // Also trigger PiP UI update
        if (session) {
            setTimeout(() => {
                session.comments = [];
                if (session.sideTab === 'comments') {
                    session.loadComments();
                    session.renderSide();
                }
                session.refreshLists();
            }, 600);
        }
    } else if (session) {
        // Non-YouTube page: embed the YouTube video directly in the PiP window
        session.embedYouTubeVideo(videoId);
    }
}

/** Extracts YouTube video ID from various YouTube URL formats. */
function itgExtractYouTubeVideoId(urlStr) {
    if (!urlStr) return '';
    try {
        const url = new URL(urlStr, window.location.href);
        if (url.hostname.includes('youtube.com') || url.hostname.includes('youtu.be')) {
            if (url.pathname.startsWith('/shorts/')) {
                return url.pathname.slice(8).split('/')[0].split('?')[0];
            }
            if (url.pathname.startsWith('/embed/')) {
                return url.pathname.slice(7).split('/')[0].split('?')[0];
            }
            if (url.pathname.startsWith('/v/')) {
                return url.pathname.slice(3).split('/')[0].split('?')[0];
            }
            if (url.searchParams.has('v')) {
                return url.searchParams.get('v');
            }
            if (url.hostname.includes('youtu.be')) {
                return url.pathname.slice(1).split('/')[0].split('?')[0];
            }
        }
    } catch {}
    return '';
}

/** Shorts has no side list: its next/previous are the feed's own arrows. */
function itgShortsNavButton(direction) {
    const id = direction === 'next' ? 'navigation-button-down' : 'navigation-button-up';
    const host = document.querySelector(`#${id}`);
    return host?.querySelector('button') ?? null;
}

// --- The PiP session ---------------------------------------------------------

var ItgVideoPipSession = class ItgVideoPipSession {
    constructor(video, { initialYouTubeVideoId = null } = {}) {
        this.video = video || (initialYouTubeVideoId ? document.createElement('video') : null);
        this.initialYouTubeVideoId = initialYouTubeVideoId;
        this.pipWindow = null;
        this.origin = null;
        this.lists = [];
        this.comments = [];
        this.searchResults = [];
        this.sideTab = 'videos';
        this.adoptions = [];
        this.disposers = [];
        this.hideTimer = null;
        this.dragging = false;
        this.isYouTube = itgIsYouTube();
        this.isShorts = itgIsYouTubeShorts();
        this.mode = video ? itgPipModeFor(video) : 'embed';
        this.configuredSize = { mode: 'max', w: 800, h: 600 };
    }

    // -- lifecycle --

    /**
     * Must run inside the click that triggered it: `requestWindow()` consumes the
     * transient activation and nothing may be awaited before it.
     */
    async open() {
        const { width, height } = this.preferredSize();
        this.defaultSize = { width, height };
        this.pipWindow = await window.documentPictureInPicture.requestWindow({
            width,
            height,
            disallowReturnToOpener: false,
        });

        this.placeAtChosenFrame();
        this.buildDocument();
        if (this.initialYouTubeVideoId) {
            this.embedYouTubeVideo(this.initialYouTubeVideoId);
        } else if (this.mode === 'stream') {
            this.streamVideoIn(this.video);
        } else {
            this.captureOrigin(this.video);
            // Before the move, while the node is still in place and has a painted frame.
            this.freezeOriginalSlot(this.video);
            this.moveVideoIn(this.video);
            this.adoptCaptions();
        }
        if (this.video && !this.initialYouTubeVideoId) {
            this.bindVideo();
        }
        this.bindWindow();
        if (!this.initialYouTubeVideoId) {
            this.watchForVideoSwap();
        }
        if (this.isYouTube) this.watchLists();
        this.refreshLists();
        this.render();
        this.loadConfiguredSize();
        this.loadMaxSize();
        this.watchForReturn();
        this.wake();

        try {
            chrome.runtime.sendMessage({ action: 'registerPipWindow' });
        } catch {}
        return this.pipWindow;
    }

    /**
     * Puts the window where the rectangle was left.
     *
     * Chrome ignores moveTo on a picture-in-picture window — measured: the same call
     * that resized it left its position untouched — and places it where the user last
     * dragged one instead. The request is made anyway, in case that changes, and
     * costs nothing when it is refused.
     */
    placeAtChosenFrame() {
        if (!itgPipFrame || !this.pipWindow) return;
        const { screenLeft, screenTop } = itgPipFrame;
        if (typeof screenLeft !== 'number' || typeof screenTop !== 'number') return;

        const win = this.pipWindow;
        const target = { x: Math.max(0, Math.round(screenLeft)), y: Math.max(0, Math.round(screenTop)) };
        try {
            win.moveTo(target.x, target.y);
        } catch {
            /* not allowed for this kind of window */
        }

        // Find out whether the request meant anything, and remember the answer so the
        // rectangle can stop promising a position it will not get.
        setTimeout(() => {
            if (!win || win.closed) return;
            const moved = Math.abs(win.screenX - target.x) < 24 && Math.abs(win.screenY - target.y) < 24;
            try {
                chrome.storage.local.set({ itgPipCanPlace: moved });
            } catch {}
        }, 500);
    }

    /** Aspect ratio of the media, scaled to the last size the user chose. */
    preferredSize() {
        // A shape the user drew is the most explicit answer there is.
        if (itgPipFrame?.width && itgPipFrame?.height) {
            return { width: itgPipFrame.width, height: itgPipFrame.height };
        }
        const vw = this.video?.videoWidth || this.video?.clientWidth || 16;
        const vh = this.video?.videoHeight || this.video?.clientHeight || 9;
        const portrait = vh > vw;
        const savedW = portrait ? itgPipSavedDims.lastShortPipWidth : itgPipSavedDims.lastNormalPipWidth;
        const savedH = portrait ? itgPipSavedDims.lastShortPipHeight : itgPipSavedDims.lastNormalPipHeight;
        if (savedW && savedH) return { width: savedW, height: savedH };
        const width = portrait ? 360 : 800;
        return { width, height: Math.round((width * vh) / vw) };
    }

    close() {
        try {
            this.pipWindow?.close();
        } catch {}
    }

    /**
     * Puts everything back: the node in its slot, its controls flag, its inline
     * style. Runs at most once, from whichever of pagehide/unload fires first.
     */
    restore() {
        if (this.restored) return;
        this.restored = true;

        for (const dispose of this.disposers.splice(0)) {
            try {
                dispose();
            } catch {}
        }

        this.releaseCaptions();
        this.removePlaceholder();

        if (this.mode === 'stream') {
            try {
                this.mirror?.srcObject?.getTracks?.().forEach((track) => track.stop());
            } catch {}
            this.mirror = null;
        }

        const origin = this.origin;
        const video = this.video;
        if (this.mode !== 'stream' && origin && video) {
            try {
                video.controls = origin.controls;
                if (origin.style === null) video.removeAttribute('style');
                else video.setAttribute('style', origin.style);
                video.removeAttribute(ITG_PIP_TARGET_ATTR);
                if (origin.parent.isConnected) {
                    if (origin.nextSibling && origin.nextSibling.parentNode === origin.parent) {
                        origin.parent.insertBefore(video, origin.nextSibling);
                    } else {
                        origin.parent.appendChild(video);
                    }
                }
            } catch (e) {
                console.warn('[ITG PiP] Could not return the video to the page:', e);
            }
        }

        // Players that size themselves on layout (YouTube among them) need a nudge
        // once the node is back, or they paint a black band where it used to be.
        setTimeout(() => window.dispatchEvent(new Event('resize')), 0);
        setTimeout(() => window.dispatchEvent(new Event('resize')), 300);

        if (ItgVideoPip.current === this) ItgVideoPip.current = null;
    }

    // -- the video node --

    captureOrigin(video) {
        this.origin = {
            parent: video.parentElement,
            nextSibling: video.nextSibling,
            controls: video.controls,
            style: video.getAttribute('style'),
        };
    }

    /**
     * Leaves the last frame behind in the player's hole.
     *
     * Taking the node out is what makes this seamless, but it also leaves the page
     * with an empty black rectangle where the video was, which reads as "it broke".
     * A canvas holding the frame it was on keeps the tab looking like a paused
     * video — which is exactly what it is.
     *
     * Painting a cross-origin frame taints the canvas, and that is fine: the canvas
     * is only ever displayed, never read back.
     */
    freezeOriginalSlot(video) {
        const origin = this.origin;
        if (!origin?.parent || !video.videoWidth) return;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

            const rect = video.getBoundingClientRect();
            canvas.dataset.itgPipPlaceholder = 'true';
            // Mirrors the box the video occupied, so the layout does not jump.
            canvas.setAttribute(
                'style',
                `${origin.style ? origin.style + ';' : ''}width:${rect.width}px;height:${rect.height}px;` +
                    'object-fit:contain;background:#000;pointer-events:none;',
            );

            if (origin.nextSibling && origin.nextSibling.parentNode === origin.parent) {
                origin.parent.insertBefore(canvas, origin.nextSibling);
            } else {
                origin.parent.appendChild(canvas);
            }
            this.placeholder = canvas;
        } catch (e) {
            // A DRM-protected frame cannot be painted; the hole is the lesser evil.
            console.warn('[ITG PiP] Could not freeze the original frame:', e);
        }
    }

    removePlaceholder() {
        try {
            this.placeholder?.remove();
        } catch {}
        this.placeholder = null;
    }

    /**
     * Shows the page's video without taking it out of the page.
     *
     * `captureStream()` hands back a live stream of what the element is playing,
     * which a video in the floating window can render. The page keeps its own node,
     * untouched, so a player that manages its own DOM has nothing to trip over.
     *
     * Sound stays with the page's element — the copy here is muted, because both
     * playing the same audio is an echo — and every control still drives the page's
     * video, which is what the stream is following.
     */
    streamVideoIn(source) {
        const capture = source.captureStream?.bind(source) ?? source.mozCaptureStream?.bind(source);
        if (!capture) {
            // Nothing to capture with: moving the node is the only way left.
            this.mode = 'move';
            this.captureOrigin(source);
            this.freezeOriginalSlot(source);
            this.moveVideoIn(source);
            return;
        }

        const mirror = this.pipWindow.document.createElement('video');
        mirror.autoplay = true;
        mirror.playsInline = true;
        mirror.muted = true;
        mirror.setAttribute('style', 'width:100%;height:100%;object-fit:contain;background:#000;display:block;');
        try {
            mirror.srcObject = capture();
        } catch (e) {
            console.warn('[ITG PiP] Could not capture the video:', e);
        }
        this.holder.appendChild(mirror);
        this.mirror = mirror;
        mirror.play?.().catch(() => {});
    }

    moveVideoIn(video) {
        video.controls = false;
        video.setAttribute(
            'style',
            'width:100%;height:100%;max-width:100%;max-height:100%;object-fit:contain;background:#000;display:block;position:static;inset:auto;transform:none;',
        );
        this.holder.appendChild(video);
    }

    /**
     * Sites that rebuild their player (YouTube does on every navigation) drop a
     * brand-new <video> into the old container. Without this the PiP window would
     * be left holding a detached, dead element.
     *
     * Only the original container is watched, never the whole page: YouTube's
     * sidebar thumbnails are videos too, and adopting one of those would hijack
     * the window on a mere hover.
     */
    watchForVideoSwap() {
        // In stream mode the node was never moved, so its own parent is the one to watch.
        const parent = this.origin?.parent ?? this.video.parentElement;
        if (!parent) return;

        const observer = new MutationObserver(() => {
            const replacement = parent.querySelector('video') || this.youtubePlayerVideo();
            if (replacement && replacement !== this.video && itgIsUsableVideo(replacement)) {
                this.adopt(replacement);
            }
        });
        observer.observe(parent, { childList: true });
        this.disposers.push(() => observer.disconnect());

        // The container itself can be replaced, which the observer above cannot see.
        if (this.isYouTube) {
            const onNavigate = () => {
                setTimeout(() => {
                    const replacement = this.youtubePlayerVideo();
                    if (replacement && replacement !== this.video && itgIsUsableVideo(replacement)) {
                        this.adopt(replacement);
                    }
                    // The comments belong to the video that just left.
                    this.comments = [];
                    if (this.sideTab === 'comments') {
                        this.loadComments();
                        this.renderSide();
                    }
                    this.refreshLists();
                }, 400);
            };
            window.addEventListener('yt-navigate-finish', onNavigate);
            this.disposers.push(() => window.removeEventListener('yt-navigate-finish', onNavigate));
        }
    }

    youtubePlayerVideo() {
        return document.querySelector('#movie_player video, #shorts-player video, .html5-video-container video');
    }

    /**
     * Takes over the page's new video element. Rate limited the way dmMiniPlayer
     * does it: a site that recreates the node on every steal would otherwise put us
     * in a loop, so three swaps within five seconds ends the session instead.
     */
    adopt(next) {
        const now = Date.now();
        this.adoptions = this.adoptions.filter((t) => now - t < 5000);
        this.adoptions.push(now);
        if (this.adoptions.length > 3) {
            console.warn('[ITG PiP] The page keeps replacing the video element; closing.');
            this.close();
            return;
        }

        const previous = this.video;
        try {
            previous.pause();
        } catch {}
        if (this.mode !== 'stream') {
            try {
                previous.remove();
            } catch {}
        }

        this.unbindVideo?.();
        this.removePlaceholder();
        this.video = next;
        if (this.mode === 'stream') {
            this.mirror?.remove();
            this.streamVideoIn(next);
        } else {
            this.captureOrigin(next);
            this.freezeOriginalSlot(next);
            this.moveVideoIn(next);
        }
        this.bindVideo();
        this.render();
        next.play?.().catch(() => {});
    }

    // -- the PiP document --

    buildDocument() {
        const doc = this.pipWindow.document;
        doc.body.innerHTML = '';

        // The content scripts also load into this window (it is an about:blank
        // auxiliary context of a matched page), and without this marker they would
        // inject the page's own picture-in-picture button on top of the player that
        // already is the picture-in-picture. Set before anything else can run.
        doc.documentElement.setAttribute('data-itg-pip-window', 'true');

        const style = doc.createElement('style');
        style.textContent = ITG_PIP_STYLES;
        doc.head.appendChild(style);

        doc.body.innerHTML = `
            <div class="itg-pip-root" data-active="true">
                <div class="itg-pip-stage">
                    <div class="itg-pip-holder"></div>
                    <div class="itg-pip-flash"></div>
                </div>
                <div class="itg-pip-side-area" hidden>
                    <div class="itg-pip-side-grip">${ITG_PIP_ICONS.chevronLeft}</div>
                    <div class="itg-pip-side">
                        <div class="itg-pip-side-head">
                            <span class="itg-pip-side-search-icon">${ITG_PIP_ICONS.search}</span>
                            <input class="itg-pip-side-search" type="search" />
                        </div>
                        <div class="itg-pip-side-tabs"></div>
                        <div class="itg-pip-side-body"></div>
                    </div>
                </div>
                <div class="itg-pip-bar">
                    <div class="itg-pip-progress" role="slider" tabindex="0">
                        <div class="itg-pip-progress-track">
                            <div class="itg-pip-buffered"></div>
                            <div class="itg-pip-played"></div>
                            <div class="itg-pip-knob"></div>
                        </div>
                    </div>
                    <div class="itg-pip-buttons">
                        <button class="itg-pip-btn" data-act="playpause" type="button"></button>
                        <button class="itg-pip-btn" data-act="prev" type="button" hidden></button>
                        <button class="itg-pip-btn" data-act="next" type="button" hidden></button>
                        <button class="itg-pip-btn" data-act="rewind" type="button"></button>
                        <button class="itg-pip-btn" data-act="forward" type="button"></button>
                        <div class="itg-pip-volume">
                            <button class="itg-pip-btn" data-act="mute" type="button"></button>
                            <div class="itg-pip-volume-pop">
                                <input class="itg-pip-volume-slider" type="range" min="0" max="100" step="1" />
                            </div>
                        </div>
                        <span class="itg-pip-time">0:00 / 0:00</span>
                        <span class="itg-pip-spacer"></span>
                        <button class="itg-pip-btn" data-act="like" type="button" hidden></button>
                        <button class="itg-pip-btn" data-act="dislike" type="button" hidden></button>
                        <button class="itg-pip-btn" data-act="comments" type="button" hidden></button>
                        <button class="itg-pip-btn" data-act="captions" type="button" hidden></button>
                        <button class="itg-pip-btn" data-act="loop" type="button"></button>
                        <span class="itg-pip-rate-wrap">
                            <span class="itg-pip-rate-menu"></span>
                            <button class="itg-pip-btn itg-pip-rate" data-act="rate" type="button">1x</button>
                        </span>
                        <span class="itg-pip-size-wrap">
                            <div class="itg-pip-size-menu">
                                <div class="itg-pip-size-header" data-i18n-text="pipFullscreenSizeHeader">Configure fullscreen size</div>
                                <button class="itg-pip-size-max" data-act="sizemax" type="button"></button>
                                <div class="itg-pip-size-fields">
                                    <label><span class="itg-pip-size-label-w"></span><input class="itg-pip-size-w" type="number" min="200" step="1" inputmode="numeric" pattern="[0-9]*" /></label>
                                    <label><span class="itg-pip-size-label-h"></span><input class="itg-pip-size-h" type="number" min="150" step="1" inputmode="numeric" pattern="[0-9]*" /></label>
                                </div>
                                <small class="itg-pip-size-note"></small>
                            </div>
                            <button class="itg-pip-btn" data-act="size" type="button"></button>
                        </span>
                        <span class="itg-pip-more-wrap">
                            <div class="itg-pip-more-menu">
                                <div class="itg-pip-more-speed-section">
                                    <span class="itg-pip-more-section-title"></span>
                                    <div class="itg-pip-more-speed-grid"></div>
                                </div>
                                <div class="itg-pip-more-divider"></div>
                                <button class="itg-pip-more-item" data-act="sizemax" type="button">
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.fullscreen}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipMaxSize">Maximize</span>
                                </button>
                                <button class="itg-pip-more-item" data-act="like" type="button" hidden>
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.like}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipLike">Like</span>
                                </button>
                                <button class="itg-pip-more-item" data-act="dislike" type="button" hidden>
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.dislike}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipDislike">Dislike</span>
                                </button>
                                <button class="itg-pip-more-item" data-act="captions" type="button" hidden>
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.captions}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipCaptions">Subtitles</span>
                                </button>
                                <button class="itg-pip-more-item" data-act="comments" type="button" hidden>
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.comments}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipComments">Comments</span>
                                </button>
                                <button class="itg-pip-more-item itg-pip-more-rewind" data-act="rewind" type="button">
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.rewind}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipRewind">Back 10s</span>
                                </button>
                                <button class="itg-pip-more-item itg-pip-more-forward" data-act="forward" type="button">
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.forward}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipForward">Forward 10s</span>
                                </button>
                                <button class="itg-pip-more-item itg-pip-more-loop" data-act="loop" type="button">
                                    <span class="itg-pip-more-icon">${ITG_PIP_ICONS.loop}</span>
                                    <span class="itg-pip-more-label" data-i18n-text="pipLoop">Loop</span>
                                </button>
                            </div>
                            <button class="itg-pip-btn itg-pip-more" data-act="more" type="button"></button>
                        </span>
                    </div>
                </div>
            </div>`;

        this.root = doc.querySelector('.itg-pip-root');
        this.holder = doc.querySelector('.itg-pip-holder');
        this.flash = doc.querySelector('.itg-pip-flash');
        this.bar = doc.querySelector('.itg-pip-bar');
        this.sideArea = doc.querySelector('.itg-pip-side-area');
        this.side = doc.querySelector('.itg-pip-side');
        this.sideTabs = doc.querySelector('.itg-pip-side-tabs');
        this.sideSearchInput = doc.querySelector('.itg-pip-side-search');
        this.sideBody = doc.querySelector('.itg-pip-side-body');
        this.progress = doc.querySelector('.itg-pip-progress');
        this.played = doc.querySelector('.itg-pip-played');
        this.knob = doc.querySelector('.itg-pip-knob');
        this.buffered = doc.querySelector('.itg-pip-buffered');
        this.timeLabel = doc.querySelector('.itg-pip-time');
        this.volumeSlider = doc.querySelector('.itg-pip-volume-slider');
        this.buttons = {};
        for (const btn of doc.querySelectorAll('.itg-pip-btn')) {
            this.buttons[btn.dataset.act] = btn;
        }

        this.buttons.rewind.innerHTML = ITG_PIP_ICONS.rewind;
        this.buttons.forward.innerHTML = ITG_PIP_ICONS.forward;
        this.buttons.prev.innerHTML = ITG_PIP_ICONS.previous;
        this.buttons.next.innerHTML = ITG_PIP_ICONS.next;
        if (this.buttons.like) this.buttons.like.innerHTML = ITG_PIP_ICONS.like;
        if (this.buttons.dislike) this.buttons.dislike.innerHTML = ITG_PIP_ICONS.dislike;
        this.buttons.comments.innerHTML = ITG_PIP_ICONS.comments;
        this.buttons.captions.innerHTML = ITG_PIP_ICONS.captions;
        if (this.buttons.loop) this.buttons.loop.innerHTML = ITG_PIP_ICONS.loop;
        if (this.buttons.more) this.buttons.more.innerHTML = ITG_PIP_ICONS.more;

        this.isLooping = false;

        if (typeof this.buildRateMenu === 'function') this.buildRateMenu();
        if (typeof this.buildSizeMenu === 'function') this.buildSizeMenu();
        if (typeof this.buildMoreMenu === 'function') this.buildMoreMenu();
        if (typeof this.buildSearch === 'function') this.buildSearch();
        if (typeof this.updateTitlesAndLabels === 'function') this.updateTitlesAndLabels();
        if (typeof this.applyTheme === 'function') this.applyTheme();
    }

    updateTitlesAndLabels() {
        if (!this.buttons || !this.pipWindow) return;
        const doc = this.pipWindow.document;
        if (this.buttons.playpause) this.buttons.playpause.title = itgPipMsg('pipPlayPause', 'Play / pause');
        if (this.buttons.prev) this.buttons.prev.title = itgPipMsg('pipPrevious', 'Previous video');
        if (this.buttons.next) this.buttons.next.title = itgPipMsg('pipNext', 'Next video');
        if (this.buttons.rewind) this.buttons.rewind.title = itgPipMsg('pipRewind', 'Back 10 seconds');
        if (this.buttons.forward) this.buttons.forward.title = itgPipMsg('pipForward', 'Forward 10 seconds');
        if (this.buttons.like) this.buttons.like.title = itgPipMsg('pipLike', 'Like');
        if (this.buttons.dislike) this.buttons.dislike.title = itgPipMsg('pipDislike', 'Dislike');
        if (this.buttons.rate) this.buttons.rate.title = itgPipMsg('pipSpeed', 'Playback speed');
        if (this.buttons.comments) this.buttons.comments.title = itgPipMsg('pipComments', 'Comments');
        if (this.buttons.captions) this.buttons.captions.title = itgPipMsg('pipCaptions', 'Subtitles');
        if (this.buttons.loop) this.buttons.loop.title = itgPipMsg('pipLoop', 'Loop video');
        if (this.buttons.size) this.buttons.size.title = itgPipMsg('pipSize', 'Window size');
        if (this.buttons.more) this.buttons.more.title = itgPipMsg('pipMoreOptions', 'More options');
        if (this.buttons.mute) {
            const muted = this.video?.muted || this.video?.volume === 0;
            this.buttons.mute.title = itgPipMsg(muted ? 'pipUnmute' : 'pipMute', muted ? 'Unmute' : 'Mute');
        }
        const labelW = doc.querySelector('.itg-pip-size-label-w');
        if (labelW) labelW.textContent = itgPipMsg('pipWidth', 'Width');
        const labelH = doc.querySelector('.itg-pip-size-label-h');
        if (labelH) labelH.textContent = itgPipMsg('pipHeight', 'Height');
        const moreSectionTitle = doc.querySelector('.itg-pip-more-section-title');
        if (moreSectionTitle) moreSectionTitle.textContent = itgPipMsg('pipSpeed', 'Playback speed');
        for (const el of doc.querySelectorAll('[data-i18n-text]')) {
            const key = el.getAttribute('data-i18n-text');
            if (key) el.textContent = itgPipMsg(key, el.textContent);
        }
        this.renderSize();
        this.updateVideoVotes();
        const searchInput = doc.querySelector('.itg-pip-search-input');
        if (searchInput) searchInput.placeholder = itgPipMsg('pipSearch', 'Search videos');
        const liveBadge = doc.querySelector('.itg-pip-live-badge');
        if (liveBadge) liveBadge.textContent = itgPipMsg('pipLive', 'Live');

        if (this.sideArea && !this.sideArea.hidden && this.lists) {
            const hasLists = this.lists.some((list) => list.items.length);
            const canComment = this.isYouTube && !this.isShorts;
            this.renderSideTabs(hasLists, canComment);
        }
    }

    buildMoreMenu() {
        const doc = this.pipWindow.document;
        const grid = doc.querySelector('.itg-pip-more-speed-grid');
        if (grid) {
            grid.innerHTML = '';
            for (const rate of ITG_PIP_RATES) {
                const opt = doc.createElement('button');
                opt.type = 'button';
                opt.className = 'itg-pip-more-speed-btn';
                opt.dataset.rate = String(rate);
                opt.textContent = `${rate}x`;
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.video.playbackRate = rate;
                });
                grid.appendChild(opt);
            }
        }
        for (const item of doc.querySelectorAll('.itg-pip-more-item')) {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const act = item.dataset.act;
                if (act === 'sizemax') {
                    this.toggleFullscreenSize();
                } else {
                    this.runAction(act);
                }
            });
        }
    }

    /**
     * The player wears the theme the rest of the extension wears. applyThemeToHost
     * writes the same custom properties it writes for the hint overlay, so the
     * progress bar and the active markers follow whatever the user picked instead of
     * being a hard-coded red.
     */
    applyTheme() {
        if (!this.root) return;
        try {
            const pageMode = document.documentElement.getAttribute('data-itg-page-mode');
            Utils.applyThemeToHost(this.root, itgPipTheme, pageMode);
            this.applySpinnerArrows();
        } catch (e) {
            console.warn('[ITG PiP] Could not apply the theme:', e);
        }

        // Painted with nothing means the cache was lost somewhere along the way;
        // read it again and paint properly rather than leave the window colourless.
        if (!itgPipTheme) {
            try {
                chrome.storage.local.get(['activeTheme'], (res) => {
                    if (!res?.activeTheme || itgPipTheme) return;
                    itgPipTheme = res.activeTheme;
                    window.__itgPipTheme = itgPipTheme;
                    if (this.root) this.applyTheme();
                });
            } catch {}
        }
    }

    /**
     * Tints the number fields' arrows.
     *
     * A stylesheet cannot recolour the browser's spinner, so the arrows are a
     * background image drawn in the theme's colour and written in here, where the
     * resolved value is available — the same thing the rules page does for its own
     * number inputs.
     */
    applySpinnerArrows() {
        const win = this.pipWindow;
        if (!win || !this.root) return;
        const style = win.getComputedStyle(this.root);
        const interactiveColor = (
            style.getPropertyValue('--interactive-color') ||
            style.getPropertyValue('--text-on-color') ||
            '#ff4444'
        ).trim();

        // Calculate contrasting text color against interactiveColor
        const getContrastText = (colorStr) => {
            if (!colorStr) return '#ffffff';
            let r = 255,
                g = 68,
                b = 68;
            if (colorStr.startsWith('#')) {
                let hex = colorStr.replace('#', '').trim();
                if (hex.length === 3)
                    hex = hex
                        .split('')
                        .map((c) => c + c)
                        .join('');
                if (hex.length === 6) {
                    r = parseInt(hex.substring(0, 2), 16);
                    g = parseInt(hex.substring(2, 4), 16);
                    b = parseInt(hex.substring(4, 6), 16);
                }
            } else if (colorStr.startsWith('rgb')) {
                const parts = colorStr.match(/\d+/g);
                if (parts && parts.length >= 3) {
                    r = +parts[0];
                    g = +parts[1];
                    b = +parts[2];
                }
            }
            const yiq = (r * 299 + g * 587 + b * 114) / 1000;
            return yiq >= 140 ? '#000000' : '#ffffff';
        };

        const textOnColor = getContrastText(interactiveColor);
        const arrows =
            `url("data:image/svg+xml,<svg viewBox='0 0 1024 1024' xmlns='http://www.w3.org/2000/svg'>` +
            `<path fill='${interactiveColor.replace('#', '%23')}' d='m620.6 562.3 36.2 36.2L512 743.3 367.2 598.5l36.2-36.2L512 670.9zM512 353.1l108.6 108.6 36.2-36.2L512 280.7 367.2 425.5l36.2 36.2z'/></svg>")`;

        let tag = win.document.getElementById('itg-pip-spinner-styles');
        if (!tag) {
            tag = win.document.createElement('style');
            tag.id = 'itg-pip-spinner-styles';
            win.document.head.appendChild(tag);
        }
        tag.textContent = `
            ::selection { background: ${interactiveColor} !important; color: ${textOnColor} !important; }
            input::selection, textarea::selection, .itg-pip-size-fields input::selection { background: ${interactiveColor} !important; color: ${textOnColor} !important; }
            .itg-pip-size-fields input::-webkit-inner-spin-button,
            .itg-pip-size-fields input::-webkit-outer-spin-button { background-image: ${arrows}; }
        `;
    }

    /**
     * The speeds as a strip above the button rather than a cycle through them: a
     * button that only steps forward makes going from 2x back to 1x a five-click
     * trip. Hover opens it, so it costs nothing when unused.
     */
    buildRateMenu() {
        const doc = this.pipWindow.document;
        const menu = doc.querySelector('.itg-pip-rate-menu');
        for (const rate of ITG_PIP_RATES) {
            const option = doc.createElement('button');
            option.type = 'button';
            option.className = 'itg-pip-rate-option';
            option.dataset.rate = String(rate);
            option.textContent = `${rate}x`;
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                this.video.playbackRate = rate;
            });
            menu.appendChild(option);
        }
        this.rateMenu = menu;
    }

    // -- wiring --

    bindVideo() {
        const video = this.video;
        const onUpdate = () => this.renderProgress();
        const onState = () => this.renderPlayState();
        const onVolume = () => this.renderVolume();
        const onRate = () => this.renderRate();
        const onEnded = () => this.handleEnded();

        video.addEventListener('timeupdate', onUpdate);
        video.addEventListener('progress', onUpdate);
        video.addEventListener('durationchange', onUpdate);
        video.addEventListener('play', onState);
        video.addEventListener('pause', onState);
        video.addEventListener('volumechange', onVolume);
        video.addEventListener('ratechange', onRate);
        video.addEventListener('ended', onEnded);

        this.unbindVideo = () => {
            video.removeEventListener('timeupdate', onUpdate);
            video.removeEventListener('progress', onUpdate);
            video.removeEventListener('durationchange', onUpdate);
            video.removeEventListener('play', onState);
            video.removeEventListener('pause', onState);
            video.removeEventListener('volumechange', onVolume);
            video.removeEventListener('ratechange', onRate);
            video.removeEventListener('ended', onEnded);
        };
        this.disposers.push(() => this.unbindVideo());
    }

    bindWindow() {
        const win = this.pipWindow;
        const doc = win.document;

        const finish = () => this.restore();
        win.addEventListener('pagehide', finish);
        win.addEventListener('unload', finish);

        // Controls fade out while playing and come back on any pointer movement.
        const wake = () => this.wake();
        doc.addEventListener('mousemove', wake);
        doc.addEventListener('mouseleave', () => this.sleep());

        this.holder.addEventListener('click', () => this.togglePlay());

        for (const [act, btn] of Object.entries(this.buttons)) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.runAction(act);
            });
        }

        this.volumeSlider.addEventListener('input', () => {
            const val = Number(this.volumeSlider.value);
            this.video.volume = val / 100;
            if (this.video.volume > 0) this.video.muted = false;
            this.volumeSlider.style.setProperty('--vol-pct', `${val}%`);
        });

        const volumeWrap = doc.querySelector('.itg-pip-volume');
        if (volumeWrap) {
            volumeWrap.addEventListener(
                'wheel',
                (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    this.nudgeVolume(e.deltaY < 0 ? 0.05 : -0.05);
                },
                { passive: false },
            );
        }

        this.bindSeeking();
        this.bindKeys();
        this.bindResize();
    }

    bindSeeking() {
        const seekTo = (clientX) => {
            const rect = this.progress.getBoundingClientRect();
            const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
            const duration = this.video.duration;
            if (Number.isFinite(duration)) this.video.currentTime = ratio * duration;
        };
        this.progress.addEventListener('pointerdown', (e) => {
            this.dragging = true;
            this.progress.setPointerCapture(e.pointerId);
            seekTo(e.clientX);
        });
        this.progress.addEventListener('pointermove', (e) => {
            if (this.dragging) seekTo(e.clientX);
        });
        const stop = () => (this.dragging = false);
        this.progress.addEventListener('pointerup', stop);
        this.progress.addEventListener('pointercancel', stop);
    }

    bindKeys() {
        const onKey = (e) => {
            if (e.target?.tagName === 'INPUT') return;
            const map = {
                ' ': () => this.togglePlay(),
                k: () => this.togglePlay(),
                ArrowLeft: () => this.seekBy(-5),
                ArrowRight: () => this.seekBy(5),
                j: () => this.seekBy(-10),
                l: () => this.seekBy(10),
                ArrowUp: () => this.nudgeVolume(0.05),
                ArrowDown: () => this.nudgeVolume(-0.05),
                f: () => this.toggleFullscreenSize(),
                m: () => this.runAction('mute'),
                n: () => this.runAction('next'),
                p: () => this.runAction('prev'),
                Escape: () => this.close(),
            };
            const action = map[e.key] || map[e.key.toLowerCase?.()];
            if (action) {
                e.preventDefault();
                action();
                this.wake();
            }
        };
        this.pipWindow.document.addEventListener('keydown', onKey);
    }

    /** The size the user drags the window to is the size it reopens at. */
    bindResize() {
        let timer;
        const onResize = () => {
            clearTimeout(timer);
            timer = setTimeout(() => {
                const w = this.pipWindow.innerWidth;
                const h = this.pipWindow.innerHeight;
                if (!w || !h) return;
                const portrait = h > w;
                const dims = portrait
                    ? { lastShortPipWidth: w, lastShortPipHeight: h }
                    : { lastNormalPipWidth: w, lastNormalPipHeight: h };
                Object.assign(itgPipSavedDims, dims);
                try {
                    chrome.storage.local.set(dims);
                } catch {}
            }, 500);
        };
        this.pipWindow.addEventListener('resize', onResize);
    }

    // -- actions --

    runAction(act) {
        switch (act) {
            case 'playpause':
                this.togglePlay();
                break;
            case 'rewind':
                this.seekBy(-10);
                break;
            case 'forward':
                this.seekBy(10);
                break;
            case 'mute':
                this.video.muted = !this.video.muted;
                break;
            case 'rate':
                this.cycleRate();
                break;
            case 'like':
                this.toggleVideoLike();
                break;
            case 'dislike':
                this.toggleVideoDislike();
                break;
            case 'captions':
                this.toggleCaptions();
                break;
            case 'comments':
                this.toggleComments();
                break;
            case 'next':
                this.goToSibling(1);
                break;
            case 'prev':
                this.goToSibling(-1);
                break;
            case 'size':
            case 'sizemax':
                this.toggleFullscreenSize();
                break;
            case 'loop':
                this.toggleLoop();
                break;
        }
    }

    toggleVideoLike() {
        const btn = itgGetYouTubeVideoLikeButton();
        if (btn) {
            btn.click();
            setTimeout(() => this.updateVideoVotes(), 180);
        }
    }

    toggleVideoDislike() {
        const btn = itgGetYouTubeVideoDislikeButton();
        if (btn) {
            btn.click();
            setTimeout(() => this.updateVideoVotes(), 180);
        }
    }

    updateVideoVotes() {
        if (!this.buttons?.like || !this.buttons?.dislike) return;
        const canVote = this.isYouTube;
        this.buttons.like.hidden = !canVote;
        this.buttons.dislike.hidden = !canVote;

        const doc = this.pipWindow?.document;
        const moreLike = doc?.querySelector('.itg-pip-more-item[data-act="like"]');
        const moreDislike = doc?.querySelector('.itg-pip-more-item[data-act="dislike"]');
        if (moreLike) moreLike.hidden = !canVote;
        if (moreDislike) moreDislike.hidden = !canVote;

        if (!canVote) return;

        const status = itgGetYouTubeVideoVoteStatus();
        this.buttons.like.classList.toggle('is-on', status.isLiked);
        this.buttons.dislike.classList.toggle('is-on', status.isDisliked);
        this.buttons.like.innerHTML = status.isLiked ? ITG_PIP_ICONS.likeFilled : ITG_PIP_ICONS.like;
        this.buttons.dislike.innerHTML = status.isDisliked ? ITG_PIP_ICONS.dislikeFilled : ITG_PIP_ICONS.dislike;

        if (moreLike) {
            moreLike.classList.toggle('is-on', status.isLiked);
            const icon = moreLike.querySelector('.itg-pip-more-icon');
            if (icon) icon.innerHTML = status.isLiked ? ITG_PIP_ICONS.likeFilled : ITG_PIP_ICONS.like;
        }
        if (moreDislike) {
            moreDislike.classList.toggle('is-on', status.isDisliked);
            const icon = moreDislike.querySelector('.itg-pip-more-icon');
            if (icon) icon.innerHTML = status.isDisliked ? ITG_PIP_ICONS.dislikeFilled : ITG_PIP_ICONS.dislike;
        }
    }

    togglePlay() {
        if (this.video.paused) this.video.play().catch(() => {});
        else this.video.pause();
        this.showFlash(this.video.paused ? ITG_PIP_ICONS.pause : ITG_PIP_ICONS.play);
    }

    seekBy(seconds) {
        const duration = this.video.duration;
        const next = this.video.currentTime + seconds;
        this.video.currentTime = Number.isFinite(duration) ? Math.min(duration, Math.max(0, next)) : Math.max(0, next);
    }

    nudgeVolume(delta) {
        this.video.volume = Math.min(1, Math.max(0, this.video.volume + delta));
        if (this.video.volume > 0) this.video.muted = false;
    }

    cycleRate() {
        const index = ITG_PIP_RATES.indexOf(this.video.playbackRate);
        this.video.playbackRate = ITG_PIP_RATES[(index + 1) % ITG_PIP_RATES.length];
    }

    /**
     * The size menu and dimensions configuration.
     */
    async loadConfiguredSize() {
        try {
            const res = await chrome.storage.local.get(['itgPipConfiguredSize']);
            if (res?.itgPipConfiguredSize) {
                this.configuredSize = res.itgPipConfiguredSize;
            } else {
                const w = this.pipWindow?.innerWidth || 800;
                const h = this.pipWindow?.innerHeight || 450;
                this.configuredSize = {
                    mode: this.maxSize ? 'max' : 'custom',
                    w: this.maxSize?.w || w,
                    h: this.maxSize?.h || h,
                };
            }
        } catch {
            this.configuredSize = {
                mode: 'custom',
                w: this.pipWindow?.innerWidth || 800,
                h: this.pipWindow?.innerHeight || 450,
            };
        }
    }

    saveConfiguredSize() {
        if (!this.configuredSize) return;
        try {
            chrome.storage.local.set({ itgPipConfiguredSize: this.configuredSize });
        } catch {}
    }

    buildSizeMenu() {
        const doc = this.pipWindow?.document;
        if (!doc) return;
        this.sizeWrap = doc.querySelector('.itg-pip-size-wrap');
        this.sizeMenu = doc.querySelector('.itg-pip-size-menu');
        this.sizeMaxButton = doc.querySelector('.itg-pip-size-max');
        this.sizeWidth = doc.querySelector('.itg-pip-size-w');
        this.sizeHeight = doc.querySelector('.itg-pip-size-h');
        this.sizeNote = doc.querySelector('.itg-pip-size-note');

        if (!this.sizeMaxButton || !this.sizeWidth || !this.sizeHeight) return;

        const win = this.pipWindow;
        const curW = win?.innerWidth || 800;
        const curH = win?.innerHeight || 450;
        const config = this.configuredSize || { mode: 'custom', w: curW, h: curH };
        const max = this.maxSize;

        if (config.mode === 'max' && max) {
            this.sizeMaxButton.classList.add('is-on');
            this.sizeWidth.value = String(max.w);
            this.sizeHeight.value = String(max.h);
        } else if (config.mode === 'max') {
            this.sizeMaxButton.classList.add('is-on');
            this.sizeWidth.value = String(config.w || curW);
            this.sizeHeight.value = String(config.h || curH);
        } else {
            this.sizeMaxButton.classList.remove('is-on');
            this.sizeWidth.value = String(config.w || curW);
            this.sizeHeight.value = String(config.h || curH);
        }

        const getMaxForField = (field) => {
            const isWidth = field === this.sizeWidth;
            if (this.maxSize) {
                return isWidth ? this.maxSize.w : this.maxSize.h;
            }
            const screen = win?.screen;
            return isWidth ? screen?.availWidth || 3840 : screen?.availHeight || 2160;
        };

        const sanitizeFieldValue = (field) => {
            const raw = field.value;
            // Strip any decimals, commas, negative signs, letters, exponents, etc.
            const digits = raw.replace(/\D/g, '');
            if (!digits) {
                field.value = '';
                return;
            }
            const maxVal = getMaxForField(field);
            let num = parseInt(digits, 10);
            if (num > maxVal) {
                num = maxVal;
            }
            field.value = String(num);
        };

        // Toggle Maximum mode button
        this.sizeMaxButton.addEventListener('click', (e) => {
            e.stopPropagation();
            this.wake();
            const isNowMax = !this.sizeMaxButton.classList.contains('is-on');
            this.sizeMaxButton.classList.toggle('is-on', isNowMax);
            if (!this.configuredSize) this.configuredSize = {};
            if (isNowMax) {
                this.configuredSize.mode = 'max';
                if (this.maxSize) {
                    this.sizeWidth.value = String(this.maxSize.w);
                    this.sizeHeight.value = String(this.maxSize.h);
                    this.configuredSize.w = this.maxSize.w;
                    this.configuredSize.h = this.maxSize.h;
                }
            } else {
                this.configuredSize.mode = 'custom';
                this.configuredSize.w = Math.round(+this.sizeWidth.value) || win?.innerWidth || 800;
                this.configuredSize.h = Math.round(+this.sizeHeight.value) || win?.innerHeight || 450;
            }
            this.saveConfiguredSize();
            this.renderSize();
        });

        // Save dimensions when user finishes editing and leaves popup or presses Enter
        const commitConfiguredSize = () => {
            if (!this.configuredSize) this.configuredSize = {};
            const maxW = getMaxForField(this.sizeWidth);
            const maxH = getMaxForField(this.sizeHeight);
            if (this.sizeMaxButton.classList.contains('is-on')) {
                this.configuredSize.mode = 'max';
                if (this.maxSize) {
                    this.configuredSize.w = this.maxSize.w;
                    this.configuredSize.h = this.maxSize.h;
                    this.sizeWidth.value = String(this.maxSize.w);
                    this.sizeHeight.value = String(this.maxSize.h);
                }
            } else {
                this.configuredSize.mode = 'custom';
                let w = parseInt(this.sizeWidth.value.replace(/\D/g, ''), 10) || win?.innerWidth || 800;
                let h = parseInt(this.sizeHeight.value.replace(/\D/g, ''), 10) || win?.innerHeight || 450;
                w = Math.max(200, Math.min(maxW, w));
                h = Math.max(150, Math.min(maxH, h));
                this.sizeWidth.value = String(w);
                this.sizeHeight.value = String(h);
                this.configuredSize.w = w;
                this.configuredSize.h = h;
            }
            this.saveConfiguredSize();
            this.renderSize();
        };

        for (const field of [this.sizeWidth, this.sizeHeight]) {
            field.addEventListener('focus', () => this.wake());

            // Block decimal separators (.,), signs (+-), exponents (eE)
            field.addEventListener('keydown', (e) => {
                this.wake();
                if (['.', ',', 'e', 'E', '+', '-'].includes(e.key)) {
                    e.preventDefault();
                    return;
                }
                if (e.key === 'Enter') {
                    field.blur();
                    commitConfiguredSize();
                }
                e.stopPropagation();
            });

            // Prevent typing decimals or symbols via composition/mobile inputs
            field.addEventListener('beforeinput', (e) => {
                if (e.data && /[\.,eE\+\-]/.test(e.data)) {
                    e.preventDefault();
                }
            });

            // Intercept paste: remove non-digits, cap to max
            field.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.clipboardData || window.clipboardData)?.getData('text') || '';
                const digits = text.replace(/\D/g, '');
                if (!digits) return;
                const maxVal = getMaxForField(field);
                let num = parseInt(digits, 10);
                if (num > maxVal) num = maxVal;
                field.value = String(num);
                field.dispatchEvent(new Event('input', { bubbles: true }));
            });

            field.addEventListener('input', () => {
                this.wake();
                sanitizeFieldValue(field);
                // When typing custom dimensions, deactivate max mode button
                this.sizeMaxButton.classList.remove('is-on');
                if (!this.configuredSize) this.configuredSize = {};
                this.configuredSize.mode = 'custom';
            });
        }

        let leaveTimer = null;
        const handleWrapLeave = () => {
            clearTimeout(leaveTimer);
            leaveTimer = setTimeout(() => {
                const currentDoc = this.pipWindow?.document;
                if (!currentDoc) return;
                const isHovered =
                    currentDoc.querySelector('.itg-pip-size-wrap:hover') ||
                    currentDoc.querySelector('.itg-pip-size-menu:hover');
                const isFocused =
                    currentDoc.activeElement === this.sizeWidth || currentDoc.activeElement === this.sizeHeight;
                if (!isHovered && !isFocused) {
                    commitConfiguredSize();
                }
            }, 300);
        };

        if (this.sizeWrap) {
            this.sizeWrap.addEventListener('mouseleave', handleWrapLeave);
        }
        if (this.sizeMenu) {
            this.sizeMenu.addEventListener('mouseenter', () => {
                clearTimeout(leaveTimer);
                this.wake();
            });
            this.sizeMenu.addEventListener('mouseleave', handleWrapLeave);
        }
    }

    /**
     * Closes the window when the user scrolls back to where the video was.
     */
    watchForReturn() {
        if (this.auto !== 'scroll' || !this.placeholder) return;

        let first = true;
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (first) {
                    first = false;
                    return;
                }
                if (entry.isIntersecting) this.close();
            },
            { threshold: 0 },
        );
        observer.observe(this.placeholder);
        this.disposers.push(() => observer.disconnect());
    }

    /** Where the measured ceiling for this screen is kept between sessions. */
    maxSizeKey() {
        const screen = this.pipWindow.screen;
        return `itgPipMax_${screen.availWidth}x${screen.availHeight}`;
    }

    /** Reads back a ceiling measured on an earlier run, if there is one. */
    async loadMaxSize() {
        try {
            const key = this.maxSizeKey();
            const cached = await chrome.storage.local.get([key]);
            if (cached?.[key]?.w) {
                this.maxSize = cached[key];
                this.renderSize();
            }
        } catch {}
    }

    /**
     * Applies the user-configured size: either maximum screen size or the specified custom dimensions.
     */
    async applyConfiguredSize() {
        const win = this.pipWindow;
        if (!win || win.closed) return;
        const config = this.configuredSize || { mode: 'max' };

        if (config.mode === 'max') {
            try {
                win.resizeTo(win.screen.availWidth, win.screen.availHeight);
            } catch (e) {
                console.warn('[ITG PiP] The window refused to resize:', e);
            }
            await new Promise((resolve) => setTimeout(resolve, 250));
            if (win && !win.closed) {
                this.maxSize = { w: win.innerWidth, h: win.innerHeight };
                try {
                    chrome.storage.local.set({ [this.maxSizeKey()]: this.maxSize });
                } catch {}
            }
        } else {
            const w = Math.max(200, Math.round(+config.w) || 800);
            const h = Math.max(150, Math.round(+config.h) || 600);
            try {
                win.resizeTo(w, h);
            } catch (e) {
                console.warn('[ITG PiP] The window refused to resize:', e);
            }
        }
        setTimeout(() => this.renderSize(), 200);
    }

    /**
     * Toggles between the configured size (maximum or custom) and the default initial size.
     */
    async toggleFullscreenSize() {
        const win = this.pipWindow;
        if (!win || win.closed) return;
        const config = this.configuredSize || { mode: 'custom' };
        const max = this.maxSize;
        const curW = win.innerWidth;
        const curH = win.innerHeight;
        const targetW = config.mode === 'max' && max ? max.w : +config.w || curW;
        const targetH = config.mode === 'max' && max ? max.h : +config.h || curH;

        const isAtTarget =
            config.mode === 'max' && max
                ? win.innerWidth >= max.w - 20 && win.innerHeight >= max.h - 20
                : Math.abs(win.innerWidth - targetW) <= 20 && Math.abs(win.innerHeight - targetH) <= 20;

        if (isAtTarget) {
            const defW = this.defaultSize?.width || this.defaultSize?.w || 800;
            const defH = this.defaultSize?.height || this.defaultSize?.h || 450;
            this.applySize(defW, defH);
        } else {
            await this.applyConfiguredSize();
        }
    }

    /** Resizes the window to specific dimensions. */
    applySize(width, height) {
        if (!width || !height || !this.pipWindow || this.pipWindow.closed) return;
        const w = Math.max(200, Math.round(width));
        const h = Math.max(150, Math.round(height));
        try {
            this.pipWindow.resizeTo(w, h);
        } catch {}
        setTimeout(() => this.renderSize(), 200);
    }

    renderSize() {
        if (!this.sizeMenu || !this.pipWindow || this.pipWindow.closed) return;
        const win = this.pipWindow;
        const max = this.maxSize;
        const doc = win?.document;
        const curW = win.innerWidth;
        const curH = win.innerHeight;
        const config = this.configuredSize || { mode: 'custom', w: curW, h: curH };

        const isEditing =
            doc?.activeElement === this.sizeWidth ||
            doc?.activeElement === this.sizeHeight ||
            doc?.querySelector('.itg-pip-size-wrap:hover') ||
            doc?.querySelector('.itg-pip-size-menu:hover');

        if (!isEditing) {
            if (config.mode === 'max' && max) {
                this.sizeMaxButton.classList.add('is-on');
                this.sizeWidth.value = String(max.w);
                this.sizeHeight.value = String(max.h);
            } else if (config.mode === 'max') {
                this.sizeMaxButton.classList.add('is-on');
                this.sizeWidth.value = String(config.w || curW);
                this.sizeHeight.value = String(config.h || curH);
            } else {
                this.sizeMaxButton.classList.remove('is-on');
                this.sizeWidth.value = String(config.w || curW);
                this.sizeHeight.value = String(config.h || curH);
            }
        }

        const moreSize = doc?.querySelector('.itg-pip-more-item[data-act="sizemax"]');
        const moreSizeLabel = moreSize?.querySelector('.itg-pip-more-label');

        const targetW = config.mode === 'max' && max ? max.w : +config.w || curW;
        const targetH = config.mode === 'max' && max ? max.h : +config.h || curH;

        const maxW = max?.w || win?.screen?.availWidth || 3840;
        const maxH = max?.h || win?.screen?.availHeight || 2160;
        this.sizeWidth.max = String(maxW);
        this.sizeHeight.max = String(maxH);

        if (max) {
            this.sizeMaxButton.textContent = `${itgPipMsg('pipMaxSize', 'Maximum')} (${max.w}×${max.h})`;
            this.sizeNote.textContent = `${itgPipMsg('pipMaxSizeNote', 'Largest a floating window can be')}: ${max.w}×${max.h}`;
        } else {
            this.sizeMaxButton.textContent = itgPipMsg('pipMaxSize', 'Maximum');
            this.sizeNote.textContent = itgPipMsg(
                'pipMaxSizeUnknown',
                'Press Maximum to find the largest size allowed',
            );
        }

        if (moreSizeLabel) {
            moreSizeLabel.textContent = `${itgPipMsg('pipMaxSize', 'Maximize')} (${targetW}×${targetH})`;
        }

        const isAtTarget =
            config.mode === 'max' && max
                ? win.innerWidth >= max.w - 20 && win.innerHeight >= max.h - 20
                : Math.abs(win.innerWidth - targetW) <= 20 && Math.abs(win.innerHeight - targetH) <= 20;

        if (moreSize) moreSize.classList.toggle('is-on', isAtTarget);
        if (this.buttons.size) {
            this.buttons.size.innerHTML = isAtTarget ? ITG_PIP_ICONS.fullscreenExit : ITG_PIP_ICONS.fullscreen;
        }
    }

    /**
     * Plays the next video when this one runs out, or restarts it when loop
     * mode is active.
     *
     * YouTube may do it on its own when autoplay is on, so this waits a moment and
     * only steps in if nothing happened — otherwise both would fire and a video
     * would be skipped.
     */
    handleEnded() {
        if (this.isLooping) {
            this.video.currentTime = 0;
            this.video.play().catch(() => {});
            return;
        }
        if (!this.isYouTube) return;
        if (!this.isShorts && !this.siblingItem(1)) return;
        const endedAt = this.video.currentTime;
        setTimeout(() => {
            if (!this.pipWindow || this.pipWindow.closed) return;
            const video = this.video;
            const movedOn = video.currentTime < endedAt - 1 || !video.paused;
            if (!movedOn) this.goToSibling(1);
        }, 1200);
    }

    /**
     * Toggles the loop/repeat mode. When active, the video restarts from the
     * beginning once it reaches the end instead of advancing to the next one.
     */
    toggleLoop() {
        this.isLooping = !this.isLooping;

        // Update bar button
        if (this.buttons.loop) {
            this.buttons.loop.classList.toggle('is-on', this.isLooping);
        }

        // Update more-menu item
        const doc = this.pipWindow?.document;
        const moreLoop = doc?.querySelector('.itg-pip-more-loop');
        if (moreLoop) {
            moreLoop.classList.toggle('is-on', this.isLooping);
        }

        // Show a flash icon to confirm the action
        this.showFlash(ITG_PIP_ICONS.loop);
    }

    /**
     * Subtitles stay YouTube's own: its caption container is moved into this window
     * next to the video, and the button toggles the page's real subtitle control, so
     * the language and styling the user already chose are the ones that show up.
     */
    toggleCaptions() {
        const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
        if (player && typeof player.toggleSubtitles === 'function') {
            try {
                player.toggleSubtitles();
            } catch {
                const control = this.captionsControl();
                if (control) control.click();
            }
        } else {
            const control = this.captionsControl();
            if (control) control.click();
        }
        setTimeout(() => {
            this.adoptCaptions();
            this.renderCaptions();
        }, 150);
    }

    captionsControl() {
        return document.querySelector('#movie_player .ytp-subtitles-button, #shorts-player .ytp-subtitles-button');
    }

    /**
     * Replicates YouTube's captions cleanly in the PiP window without moving
     * or mutating the original player's DOM. Watches YouTube's caption container
     * in the host page and mirrors the active text into our own PiP subtitle element.
     */
    adoptCaptions() {
        if (!this.isYouTube || !this.pipWindow) return;
        if (!this.subtitlesEl) {
            this.subtitlesEl = this.pipWindow.document.createElement('div');
            this.subtitlesEl.className = 'itg-pip-subtitles-display';
            this.subtitlesEl.style.display = 'none';
            this.holder.appendChild(this.subtitlesEl);
        }

        const updateCaptions = () => {
            if (!this.subtitlesEl) return;
            const container = document.querySelector('.ytp-caption-window-container');
            if (!container) {
                this.subtitlesEl.textContent = '';
                this.subtitlesEl.style.display = 'none';
                return;
            }
            const activeWindows = container.querySelectorAll('.caption-window');
            const lines = [];
            activeWindows.forEach((win) => {
                if (
                    win.getAttribute('aria-hidden') === 'true' ||
                    win.style.display === 'none' ||
                    win.style.visibility === 'hidden'
                ) {
                    return;
                }
                const segments = win.querySelectorAll('.ytp-caption-segment');
                const text = Array.from(segments)
                    .map((s) => s.textContent.trim())
                    .filter(Boolean)
                    .join(' ');
                if (text) lines.push(text);
            });
            const fullText = lines.join('\n').trim();
            if (fullText) {
                this.subtitlesEl.textContent = fullText;
                this.subtitlesEl.style.display = 'inline-block';
            } else {
                this.subtitlesEl.textContent = '';
                this.subtitlesEl.style.display = 'none';
            }
        };

        updateCaptions();

        if (!this.captionsWatcher) {
            const target = document.querySelector('#movie_player, #shorts-player') || document.body;
            this.captionsWatcher = new MutationObserver(() => {
                updateCaptions();
            });
            this.captionsWatcher.observe(target, { childList: true, subtree: true, characterData: true });
            this.disposers.push(() => {
                this.captionsWatcher?.disconnect();
                this.captionsWatcher = null;
            });
        }
    }

    releaseCaptions() {
        this.captionsWatcher?.disconnect();
        this.captionsWatcher = null;
        if (this.subtitlesEl) {
            try {
                this.subtitlesEl.remove();
            } catch {}
            this.subtitlesEl = null;
        }
    }

    /**
     * Switching video is a click on the page's own link, not a navigation of ours:
     * the site routes it, replaces the media, and `watchForVideoSwap` follows.
     */
    goToSibling(offset) {
        if (this.isShorts) {
            itgShortsNavButton(offset > 0 ? 'next' : 'prev')?.click();
            return;
        }
        const target = this.siblingItem(offset);
        if (target) target.linkEl.click();
    }

    siblingItem(offset) {
        const main = this.lists.find((list) => list.mainList);
        if (main) {
            const index = main.items.findIndex((item) => item.isActive);
            if (index !== -1) return main.items[index + offset] ?? null;
        }
        // With no playlist, "next" means the first recommendation — the same thing
        // YouTube's own autoplay would pick. There is nothing sensible for "previous".
        if (offset > 0) {
            const recommended = this.lists.find((list) => !list.mainList);
            return recommended?.items[0] ?? null;
        }
        return null;
    }

    // -- the side list --

    watchLists() {
        const secondary = document.querySelector('ytd-watch-next-secondary-results-renderer');
        if (!secondary) return;
        let timer;
        const observer = new MutationObserver(() => {
            clearTimeout(timer);
            timer = setTimeout(() => this.refreshLists(), 500);
        });
        observer.observe(secondary, { childList: true, subtree: true, attributes: true });
        this.disposers.push(() => {
            clearTimeout(timer);
            observer.disconnect();
        });
    }

    refreshLists() {
        if (!this.pipWindow || this.pipWindow.closed) return;
        this.lists = this.isYouTube && !this.isShorts ? itgReadYouTubeLists() : [];
        // Rebuilding the panel while comments are open would wipe a reply half
        // written in it, and the sidebar mutates constantly on YouTube.
        if (this.sideTab !== 'comments') this.renderSide();
        this.renderNavButtons();
    }

    /**
     * Opens the comments in the side panel and pins it there.
     *
     * Pinned because the panel otherwise lives on hover, and a panel that slides away
     * when the pointer drifts is no place to read a thread, let alone write in one.
     */
    toggleComments() {
        const showing = this.sideTab === 'comments' && this.sideArea.dataset.pinned === 'true';
        if (showing) {
            this.sideArea.dataset.pinned = 'false';
            this.sideTab = 'videos';
        } else {
            this.sideArea.dataset.pinned = 'true';
            this.sideTab = 'comments';
            this.loadComments();
        }
        this.buttons.comments.classList.toggle('is-on', !showing);
        const doc = this.pipWindow?.document;
        const moreComments = doc?.querySelector('.itg-pip-more-item[data-act="comments"]');
        if (moreComments) moreComments.classList.toggle('is-on', !showing);
        this.renderSide();
    }

    /**
     * YouTube only builds the comment threads once they are scrolled near, so a
     * video opened straight into the floating player has none in its DOM yet. The
     * page is nudged down to make it render them, then watched for the result.
     */
    loadComments() {
        this.comments = itgReadYouTubeComments();
        if (this.comments.length) return;

        const section = document.querySelector('ytd-comments#comments, #comments');
        if (!section) return;
        try {
            section.scrollIntoView({ block: 'center' });
        } catch {}

        if (this.commentsObserver) return;
        this.commentsObserver = new MutationObserver(() => {
            const found = itgReadYouTubeComments();
            if (!found.length) return;
            this.comments = found;
            if (this.sideTab === 'comments') this.renderSide();
        });
        this.commentsObserver.observe(section, { childList: true, subtree: true });
        this.disposers.push(() => {
            this.commentsObserver?.disconnect();
            this.commentsObserver = null;
        });
    }

    /** The search field, always present at the top of the panel. */
    buildSearch() {
        const input = this.sideSearchInput;
        input.placeholder = itgPipMsg('pipSearch', 'Search videos');
        // The player's own shortcuts must not fire while a query is being typed.
        input.addEventListener('keydown', (e) => {
            e.stopPropagation();
            if (e.key === 'Enter') this.runSearch(input.value.trim());
            if (e.key === 'Escape') input.blur();
        });
    }

    async runSearch(query) {
        if (!query) return;
        this.sideTab = 'search';
        this.searchResults = [];
        this.searching = true;
        this.renderSide();
        try {
            this.searchResults = await itgSearchYouTube(query);
        } catch (e) {
            console.warn('[ITG PiP] Search failed:', e);
        }
        this.searching = false;
        if (this.sideTab === 'search') this.renderSide();
    }

    playYouTubeVideo(videoId) {
        itgOpenYouTubeVideo(videoId, this);
    }

    embedYouTubeVideo(videoId) {
        const doc = this.pipWindow?.document;
        if (!doc || !this.holder) return;

        this.unbindVideo?.();
        this.removePlaceholder?.();

        this.holder.innerHTML = '';
        const iframe = doc.createElement('iframe');
        iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?autoplay=1&enablejsapi=1`;
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.allowFullscreen = true;
        this.holder.appendChild(iframe);
    }

    renderSearch() {
        const doc = this.pipWindow.document;
        this.sideBody.innerHTML = '';
        if (this.searching || !this.searchResults.length) {
            const note = doc.createElement('p');
            note.className = 'itg-pip-side-note';
            note.textContent = this.searching
                ? itgPipMsg('pipSearching', 'Searching…')
                : itgPipMsg('pipNoResults', 'Nothing found');
            this.sideBody.appendChild(note);
            return;
        }
        this.renderItems([
            {
                category: itgPipMsg('pipResults', 'Results'),
                items: this.searchResults.map((r) => ({ ...r, open: () => this.playYouTubeVideo(r.id) })),
            },
        ]);
    }

    renderSide() {
        const hasLists = this.lists.some((list) => list.items.length);
        const canComment = this.isYouTube && !this.isShorts;
        this.buttons.comments.hidden = !canComment;
        this.sideArea.hidden = !hasLists && !canComment;
        if (this.sideArea.hidden) return;

        this.renderSideTabs(hasLists, canComment);
        if (this.sideTab === 'comments') this.renderComments();
        else if (this.sideTab === 'search') this.renderSearch();
        else this.renderVideoLists();
    }

    renderSideTabs(hasLists, canComment) {
        const doc = this.pipWindow.document;
        this.sideTabs.innerHTML = '';
        // A single available panel needs no chooser above it.
        if (!hasLists || !canComment) return;

        const tabs = [
            ['videos', itgPipMsg('pipRecommended', 'Recommended')],
            ['comments', itgPipMsg('pipComments', 'Comments')],
        ];
        if (this.sideTab === 'search' || this.searchResults.length) {
            tabs.push(['search', itgPipMsg('pipResults', 'Results')]);
        }
        for (const [tab, label] of tabs) {
            const button = doc.createElement('button');
            button.type = 'button';
            button.className = 'itg-pip-side-tab';
            button.classList.toggle('is-active', this.sideTab === tab);
            button.textContent = label;
            button.addEventListener('click', () => {
                this.sideTab = tab;
                if (tab === 'comments') this.loadComments();
                this.renderSide();
            });
            this.sideTabs.appendChild(button);
        }
    }

    /**
     * Builds the thread list, and keeps building it.
     *
     * Entries are appended rather than re-rendered because a reply may be half
     * written in one of them, and rebuilding would throw it away every time YouTube
     * touched the comment section — which it does constantly.
     */
    renderComments() {
        const doc = this.pipWindow.document;
        this.commentEntries ??= new Map();

        // A tab switch empties the body, so anything remembered from before is gone.
        if (!this.sideBody.querySelector('.itg-pip-comment')) {
            this.sideBody.innerHTML = '';
            this.commentEntries.clear();
        }

        // YouTube rebuilds the section on its own account, and every thread it
        // replaces leaves an entry here pointing at a node that is no longer in the
        // page: stale to look at, and — since the new threads are unknown keys — a
        // second copy of the list waiting to be appended below it.
        for (const [thread, entry] of this.commentEntries) {
            if (thread.isConnected) continue;
            entry.remove();
            this.commentEntries.delete(thread);
        }

        if (!this.comments.length) {
            if (!this.sideBody.querySelector('.itg-pip-side-note')) {
                const note = doc.createElement('p');
                note.className = 'itg-pip-side-note';
                note.textContent = itgPipMsg('pipCommentsLoading', 'Loading comments…');
                this.sideBody.appendChild(note);
            }
            return;
        }
        this.sideBody.querySelector('.itg-pip-side-note')?.remove();
        this.watchCommentScroll();

        for (const comment of this.comments) {
            if (this.commentEntries.has(comment.el)) continue;
            const entry = doc.createElement('div');
            entry.className = 'itg-pip-comment';
            entry.innerHTML = `
                <span class="itg-pip-comment-avatar"></span>
                <div class="itg-pip-comment-body">
                    <div class="itg-pip-comment-head">
                        <span class="itg-pip-comment-author"></span>
                        <span class="itg-pip-comment-when"></span>
                    </div>
                    <div class="itg-pip-comment-text"></div>
                    <div class="itg-pip-comment-meta">
                        <button class="itg-pip-comment-vote itg-pip-comment-like" type="button" title="${itgPipMsg('pipLike', 'Like')}">
                            <span class="itg-pip-vote-icon">${comment.isLiked ? ITG_PIP_ICONS.likeFilled : ITG_PIP_ICONS.like}</span>
                            <span class="itg-pip-comment-likes">${comment.likes || ''}</span>
                        </button>
                        <button class="itg-pip-comment-vote itg-pip-comment-dislike" type="button" title="${itgPipMsg('pipDislike', 'Dislike')}">
                            <span class="itg-pip-vote-icon">${comment.isDisliked ? ITG_PIP_ICONS.dislikeFilled : ITG_PIP_ICONS.dislike}</span>
                        </button>
                        <button class="itg-pip-comment-reply" type="button"></button>
                    </div>
                    <div class="itg-pip-reply-box">
                        <textarea rows="2"></textarea>
                        <button class="itg-pip-reply-send" type="button">${ITG_PIP_ICONS.send}</button>
                    </div>
                    <button class="itg-pip-show-replies" type="button" hidden></button>
                    <div class="itg-pip-replies"></div>
                </div>`;

            // Comment bodies are other people's text: set as text, never as markup.
            if (comment.avatar) {
                const img = doc.createElement('img');
                img.setAttribute('src', comment.avatar);
                img.setAttribute('alt', '');
                img.setAttribute('loading', 'lazy');
                entry.querySelector('.itg-pip-comment-avatar').appendChild(img);
            }
            entry.querySelector('.itg-pip-comment-author').textContent = comment.author;
            entry.querySelector('.itg-pip-comment-when').textContent = comment.when;
            entry.querySelector('.itg-pip-comment-text').textContent = comment.text;

            this.wireCommentVotes(entry, () => itgResolveThread(comment), comment);
            this.wireReplyBox(entry, () => itgResolveThread(comment));

            this.wireReplies(entry, comment);
            this.commentEntries.set(comment.el, entry);
            this.sideBody.appendChild(entry);
        }

        this.fillCommentAvatars();
    }

    /**
     * Wires up the interactive like and dislike buttons for a comment or reply.
     */
    wireCommentVotes(entry, getTarget, comment) {
        const likeBtn = entry.querySelector('.itg-pip-comment-like');
        const dislikeBtn = entry.querySelector('.itg-pip-comment-dislike');
        const likesSpan = entry.querySelector('.itg-pip-comment-likes');
        if (!likeBtn || !dislikeBtn) return;

        likeBtn.classList.toggle('is-voted', !!comment?.isLiked);
        dislikeBtn.classList.toggle('is-voted', !!comment?.isDisliked);

        likeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = getTarget();
            if (target) {
                itgVoteYouTubeComment(target, 'like');
                setTimeout(() => {
                    const resolved = getTarget() || target;
                    const likeShape = resolved.querySelector(
                        '#like-button button, like-button-shape button, ytd-toggle-button-renderer#like-button button',
                    );
                    const isNowLiked =
                        likeShape?.getAttribute('aria-pressed') === 'true' ||
                        likeShape?.classList.contains('yt-spec-button-shape-next--tonal');
                    const newLikes = itgText(resolved, [
                        '#vote-count-middle',
                        '#vote-count-left',
                        '.yt-spec-button-shape-next__button-text-content',
                    ]);

                    likeBtn.classList.toggle('is-voted', !!isNowLiked);
                    dislikeBtn.classList.remove('is-voted');
                    const likeIcon = likeBtn.querySelector('.itg-pip-vote-icon');
                    if (likeIcon) likeIcon.innerHTML = isNowLiked ? ITG_PIP_ICONS.likeFilled : ITG_PIP_ICONS.like;
                    const dislikeIcon = dislikeBtn.querySelector('.itg-pip-vote-icon');
                    if (dislikeIcon) dislikeIcon.innerHTML = ITG_PIP_ICONS.dislike;
                    if (likesSpan) likesSpan.textContent = newLikes || '';
                }, 180);
            }
        });

        dislikeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const target = getTarget();
            if (target) {
                itgVoteYouTubeComment(target, 'dislike');
                setTimeout(() => {
                    const resolved = getTarget() || target;
                    const dislikeShape = resolved.querySelector(
                        '#dislike-button button, dislike-button-shape button, ytd-toggle-button-renderer#dislike-button button',
                    );
                    const isNowDisliked =
                        dislikeShape?.getAttribute('aria-pressed') === 'true' ||
                        dislikeShape?.classList.contains('yt-spec-button-shape-next--tonal');
                    const newLikes = itgText(resolved, [
                        '#vote-count-middle',
                        '#vote-count-left',
                        '.yt-spec-button-shape-next__button-text-content',
                    ]);

                    dislikeBtn.classList.toggle('is-voted', !!isNowDisliked);
                    likeBtn.classList.remove('is-voted');
                    const dislikeIcon = dislikeBtn.querySelector('.itg-pip-vote-icon');
                    if (dislikeIcon)
                        dislikeIcon.innerHTML = isNowDisliked ? ITG_PIP_ICONS.dislikeFilled : ITG_PIP_ICONS.dislike;
                    const likeIcon = likeBtn.querySelector('.itg-pip-vote-icon');
                    if (likeIcon) likeIcon.innerHTML = ITG_PIP_ICONS.like;
                    if (likesSpan) likesSpan.textContent = newLikes || '';
                }, 180);
            }
        });
    }

    /**
     * The reply control and its box, for a comment or for one of its replies.
     *
     * `getTarget` is called at send time rather than captured, because the node the
     * reply belongs to may have been recycled by the page in between.
     */
    wireReplyBox(entry, getTarget) {
        const replyButton = entry.querySelector('.itg-pip-comment-reply');
        const box = entry.querySelector('.itg-pip-reply-box');
        if (!replyButton || !box) return;
        const field = box.querySelector('textarea');
        const send = box.querySelector('.itg-pip-reply-send');
        replyButton.textContent = itgPipMsg('pipReply', 'Reply');
        field.placeholder = itgPipMsg('pipReply', 'Reply');

        replyButton.addEventListener('click', () => {
            box.classList.toggle('is-open');
            if (box.classList.contains('is-open')) field.focus();
        });
        field.addEventListener('keydown', (e) => e.stopPropagation());
        send.addEventListener('click', async () => {
            const text = field.value.trim();
            if (!text) return;
            send.disabled = true;
            const target = getTarget();
            const posted = target ? await itgReplyToYouTubeComment(target, text) : false;
            send.disabled = false;
            if (posted) {
                field.value = '';
                box.classList.remove('is-open');
                replyButton.textContent = itgPipMsg('pipReplySent', 'Reply sent');
            } else {
                replyButton.textContent = itgPipMsg('pipReplyFailed', 'Reply in the tab');
            }
        });
    }

    /** The "N replies" control, and the list it fills in when pressed. */
    wireReplies(entry, comment) {
        const doc = this.pipWindow.document;
        const toggle = entry.querySelector('.itg-pip-show-replies');
        const list = entry.querySelector('.itg-pip-replies');

        const label = itgYouTubeRepliesButton(comment.el)?.textContent?.trim();
        const already = itgReadYouTubeReplies(comment.el);
        if (!label && !already.length) return;

        toggle.hidden = false;
        toggle.textContent = label || itgPipMsg('pipShowReplies', 'Show replies');

        let open = false;
        toggle.addEventListener('click', async () => {
            if (open) {
                list.innerHTML = '';
                open = false;
                toggle.textContent = label || itgPipMsg('pipShowReplies', 'Show replies');
                return;
            }
            toggle.disabled = true;
            const thread = itgResolveThread(comment);
            const replies = thread ? await itgExpandYouTubeReplies(thread) : [];
            toggle.disabled = false;
            if (!replies.length) {
                toggle.textContent = itgPipMsg('pipNoReplies', 'No replies');
                return;
            }
            open = true;
            toggle.textContent = itgPipMsg('pipHideReplies', 'Hide replies');
            list.innerHTML = '';
            for (const reply of replies) {
                const node = doc.createElement('div');
                node.className = 'itg-pip-comment itg-pip-reply';
                node.innerHTML = `
                    <span class="itg-pip-comment-avatar"></span>
                    <div class="itg-pip-comment-body">
                        <div class="itg-pip-comment-head">
                            <span class="itg-pip-comment-author"></span>
                            <span class="itg-pip-comment-when"></span>
                        </div>
                        <div class="itg-pip-comment-text"></div>
                        <div class="itg-pip-comment-meta">
                            <button class="itg-pip-comment-vote itg-pip-comment-like" type="button" title="${itgPipMsg('pipLike', 'Like')}">
                                <span class="itg-pip-vote-icon">${reply.isLiked ? ITG_PIP_ICONS.likeFilled : ITG_PIP_ICONS.like}</span>
                                <span class="itg-pip-comment-likes">${reply.likes || ''}</span>
                            </button>
                            <button class="itg-pip-comment-vote itg-pip-comment-dislike" type="button" title="${itgPipMsg('pipDislike', 'Dislike')}">
                                <span class="itg-pip-vote-icon">${reply.isDisliked ? ITG_PIP_ICONS.dislikeFilled : ITG_PIP_ICONS.dislike}</span>
                            </button>
                            <button class="itg-pip-comment-reply" type="button"></button>
                        </div>
                        <div class="itg-pip-reply-box">
                            <textarea rows="2"></textarea>
                            <button class="itg-pip-reply-send" type="button">${ITG_PIP_ICONS.send}</button>
                        </div>
                    </div>`;
                // Each reply has its own reply button in the page, so answering one
                // answers that reply rather than the thread it sits under. If YouTube
                // has recycled the node by then, the thread is the fallback.
                this.wireCommentVotes(
                    node,
                    () => (reply.el?.isConnected ? reply.el : itgResolveThread(comment)),
                    reply,
                );
                this.wireReplyBox(node, () => (reply.el?.isConnected ? reply.el : itgResolveThread(comment)));
                if (reply.avatar) {
                    const img = doc.createElement('img');
                    img.setAttribute('src', reply.avatar);
                    img.setAttribute('alt', '');
                    node.querySelector('.itg-pip-comment-avatar').appendChild(img);
                }
                node.querySelector('.itg-pip-comment-author').textContent = reply.author;
                node.querySelector('.itg-pip-comment-when').textContent = reply.when;
                node.querySelector('.itg-pip-comment-text').textContent = reply.text;
                list.appendChild(node);
            }
        });
    }

    /**
     * Fills in the avatars YouTube had not loaded yet.
     *
     * Comment pictures arrive the same way the sidebar thumbnails do — only once the
     * page decides to load them — but unlike a video thumbnail there is no address to
     * derive from an id, so the only thing to do is look again later and put in
     * whatever has turned up. The image is added to the entry already on screen, so
     * nothing else about it is disturbed.
     */
    fillCommentAvatars() {
        const doc = this.pipWindow.document;
        const missing = [];
        for (const [thread, entry] of this.commentEntries) {
            const slot = entry.querySelector('.itg-pip-comment-avatar');
            if (!slot || slot.querySelector('img')) continue;
            const src = thread.querySelector('#author-thumbnail img')?.src;
            if (!src) {
                missing.push(thread);
                continue;
            }
            const img = doc.createElement('img');
            img.setAttribute('src', src);
            img.setAttribute('alt', '');
            slot.appendChild(img);
        }

        clearTimeout(this.avatarTimer);
        if (!missing.length || this.sideTab !== 'comments') return;

        // Waiting alone is not enough: YouTube loads a comment's picture when its
        // thread comes near the tab's viewport, and our panel scrolls on its own, so
        // for a thread the tab never reaches the picture never arrives. Bringing the
        // thread into view in the tab is what makes it load — one at a time, since
        // each one moves the page.
        try {
            missing[0].scrollIntoView({ block: 'nearest' });
        } catch {}
        this.avatarTimer = setTimeout(() => this.fillCommentAvatars(), 900);
    }

    /**
     * More threads exist than YouTube has built. Reaching the end of our panel scrolls
     * the tab on, which is what makes the page render the next batch for us to read.
     */
    watchCommentScroll() {
        if (this.commentScrollBound) return;
        this.commentScrollBound = true;
        let loading = false;
        this.side.addEventListener('scroll', () => {
            if (this.sideTab !== 'comments' || loading) return;
            const nearEnd = this.side.scrollTop + this.side.clientHeight >= this.side.scrollHeight - 120;
            if (!nearEnd) return;
            loading = true;
            try {
                const last = this.comments.at(-1)?.el;
                last?.scrollIntoView({ block: 'end' });
            } catch {}
            setTimeout(() => {
                loading = false;
                const found = itgReadYouTubeComments(200);
                if (found.length > this.comments.length) {
                    this.comments = found;
                    this.renderComments();
                }
            }, 900);
        });
    }

    renderVideoLists() {
        this.sideBody.innerHTML = '';
        this.renderItems(this.lists);
    }

    renderItems(lists) {
        const doc = this.pipWindow.document;
        for (const list of lists) {
            if (!list.items.length) continue;
            const section = doc.createElement('section');
            section.className = 'itg-pip-side-section';
            const heading = doc.createElement('h3');
            heading.textContent = list.category;
            section.appendChild(heading);

            for (const item of list.items) {
                const entry = doc.createElement('button');
                entry.type = 'button';
                entry.className = 'itg-pip-side-item';
                if (item.isActive) entry.classList.add('is-active');
                entry.innerHTML = `
                    <span class="itg-pip-thumb"></span>
                    <span class="itg-pip-meta">
                        <span class="itg-pip-item-title"></span>
                        <span class="itg-pip-item-user"></span>
                    </span>`;
                // Everything below comes from the page, so it is set as text or through
                // setAttribute — never interpolated into markup.
                const thumb = entry.querySelector('.itg-pip-thumb');
                if (item.cover) {
                    const img = doc.createElement('img');
                    img.setAttribute('src', item.cover);
                    img.setAttribute('alt', '');
                    img.setAttribute('loading', 'lazy');
                    thumb.appendChild(img);
                }
                if (item.duration) {
                    const badge = doc.createElement('span');
                    badge.className = 'itg-pip-duration';
                    badge.textContent = item.duration;
                    thumb.appendChild(badge);
                }
                entry.querySelector('.itg-pip-item-title').textContent = item.title;
                entry.querySelector('.itg-pip-item-user').textContent = item.user || '';
                entry.title = item.title;
                entry.addEventListener('click', () => (item.open ? item.open() : item.linkEl.click()));
                section.appendChild(entry);
            }
            this.sideBody.appendChild(section);
        }
    }

    renderNavButtons() {
        const hasNav = this.isShorts || !!this.siblingItem(1) || !!this.siblingItem(-1);
        this.buttons.next.hidden = !hasNav;
        this.buttons.prev.hidden = !hasNav;
        if (hasNav) {
            this.buttons.next.disabled = !this.isShorts && !this.siblingItem(1);
            this.buttons.prev.disabled = !this.isShorts && !this.siblingItem(-1);
        }
        const canComment = this.isYouTube && !this.isShorts;
        const doc = this.pipWindow?.document;
        const moreComments = doc?.querySelector('.itg-pip-more-item[data-act="comments"]');
        if (moreComments) {
            moreComments.hidden = !canComment;
            moreComments.classList.toggle(
                'is-on',
                this.sideTab === 'comments' && this.sideArea?.dataset.pinned === 'true',
            );
        }
    }

    // -- rendering --

    render() {
        this.renderPlayState();
        this.renderProgress();
        this.renderVolume();
        this.renderRate();
        this.renderCaptions();
        this.renderSize();
        this.renderNavButtons();
    }

    renderCaptions() {
        const control = this.captionsControl();
        this.buttons.captions.hidden = !control;
        const isOn = control?.getAttribute('aria-pressed') === 'true';
        this.buttons.captions.classList.toggle('is-on', isOn);
        const doc = this.pipWindow?.document;
        const moreCaptions = doc?.querySelector('.itg-pip-more-item[data-act="captions"]');
        if (moreCaptions) {
            moreCaptions.hidden = !control;
            moreCaptions.classList.toggle('is-on', isOn);
        }
    }

    renderPlayState() {
        this.buttons.playpause.innerHTML = this.video.paused ? ITG_PIP_ICONS.play : ITG_PIP_ICONS.pause;
        if (this.video.paused) this.wake();
    }

    renderProgress() {
        const { currentTime, duration } = this.video;
        const live = !Number.isFinite(duration) || duration === 0;
        const ratio = live ? 0 : currentTime / duration;
        this.played.style.width = `${ratio * 100}%`;
        this.knob.style.left = `${ratio * 100}%`;
        try {
            const buffered = this.video.buffered;
            const end = buffered.length ? buffered.end(buffered.length - 1) : 0;
            this.buffered.style.width = live ? '0%' : `${(end / duration) * 100}%`;
        } catch {}
        this.timeLabel.textContent = live
            ? itgPipMsg('pipLive', 'Live')
            : `${itgFormatTime(currentTime)} / ${itgFormatTime(duration)}`;
    }

    renderVolume() {
        const muted = this.video.muted || this.video.volume === 0;
        this.buttons.mute.innerHTML = muted ? ITG_PIP_ICONS.muted : ITG_PIP_ICONS.volume;
        this.buttons.mute.title = itgPipMsg(muted ? 'pipUnmute' : 'pipMute', muted ? 'Unmute' : 'Mute');
        const val = Math.round((muted ? 0 : this.video.volume) * 100);
        this.volumeSlider.value = String(val);
        this.volumeSlider.style.setProperty('--vol-pct', `${val}%`);
    }

    renderRate() {
        const rate = this.video.playbackRate;
        this.buttons.rate.textContent = `${rate}x`;
        if (this.rateMenu) {
            for (const option of this.rateMenu.children) {
                option.classList.toggle('is-active', Number(option.dataset.rate) === rate);
            }
        }
        const doc = this.pipWindow?.document;
        if (doc) {
            for (const option of doc.querySelectorAll('.itg-pip-more-speed-btn')) {
                option.classList.toggle('is-active', Number(option.dataset.rate) === rate);
            }
        }
    }

    showFlash(icon) {
        this.flash.innerHTML = icon;
        this.flash.classList.remove('is-shown');
        void this.flash.offsetWidth;
        this.flash.classList.add('is-shown');
    }

    wake() {
        this.root.dataset.active = 'true';
        clearTimeout(this.hideTimer);
        this.hideTimer = setTimeout(() => this.sleep(), 2500);
    }

    sleep() {
        if (this.video.paused || this.dragging) return;
        const doc = this.pipWindow?.document;
        if (!doc) return;

        const active = doc.activeElement;
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable)) {
            return;
        }

        const isHovered = (sel) => {
            try {
                return !!doc.querySelector(sel);
            } catch {
                return false;
            }
        };

        if (
            isHovered('.itg-pip-size-wrap:hover') ||
            isHovered('.itg-pip-size-menu:hover') ||
            isHovered('.itg-pip-rate-wrap:hover') ||
            isHovered('.itg-pip-rate-menu:hover') ||
            isHovered('.itg-pip-more-wrap:hover') ||
            isHovered('.itg-pip-more-menu:hover') ||
            isHovered('.itg-pip-bar:hover')
        ) {
            return;
        }

        this.root.dataset.active = 'false';
    }
};

function itgFormatTime(seconds) {
    if (!Number.isFinite(seconds)) return '0:00';
    const total = Math.floor(seconds);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

// --- Entry point -------------------------------------------------------------

/**
 * One player per document, however many times this file is injected.
 *
 * Reloading the extension injects the content scripts again into tabs that already
 * have them, and `var ItgVideoPip = {...}` on that second pass would replace this
 * object with a fresh one whose `current` is null — orphaning a window that is open
 * and playing, with nothing left holding the session that knows how to put the video
 * back. Anchoring it to the window makes the second injection reuse the first.
 */
var ItgVideoPip = {
    current: window.__itgVideoPip?.current ?? null,

    supported() {
        return 'documentPictureInPicture' in window;
    },

    /**
     * Opens (or closes, when already open) the floating player. Called straight
     * from a click handler so the activation is still live.
     */
    async open(video, { auto = null, youtubeUrl = null, videoId = null } = {}) {
        if (!this.supported()) return false;

        let targetId = videoId || (youtubeUrl ? itgExtractYouTubeVideoId(youtubeUrl) : null);
        if (typeof video === 'string') {
            targetId = itgExtractYouTubeVideoId(video) || video;
            video = null;
        }

        // If a session is already active in the floating window
        if (this.current) {
            if (targetId) {
                this.current.playYouTubeVideo(targetId);
                return true;
            }
            if (auto) return true;
            try {
                window.documentPictureInPicture.window?.close();
            } catch {}
            return true;
        }

        if (window.documentPictureInPicture.window) {
            if (auto) return true;
            try {
                window.documentPictureInPicture.window.close();
            } catch {}
            if (this.current) return true;
        }

        let target = video && itgIsUsableVideo(video) ? video : itgPickBestVideo();
        if (!target && !targetId) {
            console.warn('[ITG PiP] No playable video found on this page.');
            return false;
        }

        if (!target && targetId) {
            target = document.createElement('video');
        }

        const session = new ItgVideoPipSession(target, {
            initialYouTubeVideoId: itgIsYouTube() ? null : targetId,
        });
        session.auto = auto;
        this.current = session;
        try {
            await session.open();
            if (targetId && itgIsYouTube()) {
                session.playYouTubeVideo(targetId);
            }
            return true;
        } catch (e) {
            // A DOMException logs as "[object DOMException]" and says nothing; the
            // name is what distinguishes "the browser refused for want of a click"
            // from anything else.
            const detail = e?.name ? `${e.name}: ${e.message}` : String(e);
            if (e?.name === 'NotAllowedError') {
                console.warn(
                    `[ITG PiP] The browser would not open the window without a recent click (${detail}). ` +
                        'Playback started by the user is what earns it: press play yourself, or press the button.',
                );
            } else {
                console.warn('[ITG PiP] Could not open the picture-in-picture window:', detail, e);
            }
            session.restore();
            // Only if it is still ours: a failed attempt must not drop the reference
            // to a session that is alive and working.
            if (this.current === session) this.current = null;
            return false;
        }
    },
};
window.__itgVideoPip = ItgVideoPip;

// --- The button's hover menu -------------------------------------------------

var ITG_AUTO_PIP_MENU_STYLES = `
.itg-autopip-menu {
    position: fixed; z-index: 2147483647; width: 264px; padding: 8px;
    border-radius: 10px;
    background: var(--bg-panel-color, #1c1c1c);
    color: var(--text-color, #fff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.15));
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.5);
    font: 500 12px/1.35 'Roboto', system-ui, -apple-system, sans-serif;
    opacity: 0; visibility: hidden; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
}
.itg-autopip-menu.is-open { opacity: 1; visibility: visible; transform: translateY(0); }
/* An invisible strip over the gap, so the pointer can travel from the button to
   the menu without passing through nothing and closing it on the way. */
.itg-autopip-menu::after { content: ''; position: absolute; left: -12px; right: -12px; top: 100%; height: 20px; }
.itg-autopip-menu[data-place='below']::after { top: auto; bottom: 100%; }

/* Keep YouTube, TikTok, and generic player control bars visible and active while the popup menu is open/hovered */
html[data-itg-autopip-open='true'] .ytp-chrome-bottom,
html[data-itg-autopip-open='true'] .ytp-gradient-bottom,
html[data-itg-autopip-open='true'] .ytp-chrome-top,
html[data-itg-autopip-open='true'] ytd-shorts-player-controls,
html[data-itg-autopip-open='true'] div[class*="DivPlayerContainer"] div[class*="DivBottom"],
html[data-itg-autopip-open='true'] div[class*="DivPlayerContainer"] div[class*="DivButtonContainer"],
html[data-itg-autopip-open='true'] div[class*="DivPlayerContainer"] div[class*="ControlMask"] {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
}

/* Selectable buttons rather than checkboxes: the state is the button, which reads
   at a glance on a control bar and takes the theme's colours as its own. */
.itg-autopip-option {
    display: block; width: 100%; margin: 0; padding: 8px 10px; text-align: left;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    border-radius: 8px; background: transparent; color: inherit;
    font: inherit; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.itg-autopip-option + .itg-autopip-option { margin-top: 6px; }
.itg-autopip-option:hover { border-color: var(--interactive-color, #fff); }
/* A tint of the accent rather than the accent itself, and the theme's ordinary text
   colour on top: several themes set text-on-color to the same value as the accent,
   and a selected option written in its own background colour cannot be read. */
.itg-autopip-option.is-on {
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 22%, transparent);
    border-color: var(--interactive-color, #ff4444);
    color: var(--text-color, #fff);
}
.itg-autopip-option strong { display: block; font-weight: 600; }
.itg-autopip-option small { display: block; opacity: 0.75; font-weight: 400; margin-top: 3px; }

/* --- The frame the window is cut to --- */
.itg-pip-frame-backdrop {
    position: fixed; inset: 0; z-index: 2147483646; background: rgba(0, 0, 0, 0.45);
    font: 500 12px/1.35 'Roboto', system-ui, -apple-system, sans-serif;
}
.itg-pip-frame {
    position: absolute; box-sizing: border-box; cursor: move;
    border: 2px solid var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 14%, transparent);
    box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.12);
}
.itg-pip-frame-size {
    position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
    padding: 4px 10px; border-radius: 6px; white-space: nowrap;
    background: var(--bg-panel-color, #1c1c1c); color: var(--text-color, #fff);
    font-variant-numeric: tabular-nums;
}
.itg-pip-frame-grip {
    position: absolute; right: -7px; bottom: -7px; width: 16px; height: 16px;
    border-radius: 3px; cursor: nwse-resize;
    background: var(--interactive-color, #ff4444);
}
.itg-pip-frame-actions {
    position: absolute; left: 0; top: calc(100% + 8px); display: flex; gap: 6px;
}
.itg-pip-frame-actions button {
    padding: 5px 12px; border-radius: 6px; cursor: pointer; font: inherit;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.25));
    background: var(--bg-panel-color, #1c1c1c); color: var(--text-color, #fff);
}
.itg-pip-frame-actions button.primary {
    border-color: var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 30%, transparent);
}
.itg-pip-frame-hint {
    position: absolute; left: 50%; top: 24px; transform: translateX(-50%);
    padding: 8px 14px; border-radius: 8px; max-width: 70vw; text-align: center;
    background: var(--bg-panel-color, #1c1c1c); color: var(--text-color, #fff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.25));
}
`;

var itgAutoPipKeepAliveTimer = null;
var itgAutoPipHideTimer = null;
var itgAutoPipActiveButton = null;

function itgStartAutoPipKeepAlive() {
    document.documentElement.setAttribute('data-itg-autopip-open', 'true');
    if (!itgAutoPipKeepAliveTimer) {
        const wake = () => {
            const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
            if (player) {
                player.wakeUpControls?.();
            }
        };
        wake();
        itgAutoPipKeepAliveTimer = setInterval(wake, 800);
    }
}

function itgStopAutoPipKeepAlive() {
    document.documentElement.removeAttribute('data-itg-autopip-open');
    if (itgAutoPipKeepAliveTimer) {
        clearInterval(itgAutoPipKeepAliveTimer);
        itgAutoPipKeepAliveTimer = null;
    }
}

function itgScheduleAutoPipHide(delay = 500) {
    clearTimeout(itgAutoPipHideTimer);
    itgAutoPipHideTimer = setTimeout(() => {
        const menu = document.getElementById('itg-autopip-menu');
        if (!menu) return;
        // Verify if pointer is currently hovering menu or button before closing
        const isHoveringMenu = menu.matches(':hover');
        const isHoveringButton = itgAutoPipActiveButton && itgAutoPipActiveButton.matches(':hover');
        if (isHoveringMenu || isHoveringButton) {
            return;
        }
        menu.classList.remove('is-open');
        itgStopAutoPipKeepAlive();
        itgAutoPipActiveButton = null;
    }, delay);
}

function itgCancelAutoPipHide() {
    clearTimeout(itgAutoPipHideTimer);
    itgAutoPipHideTimer = null;
    itgStartAutoPipKeepAlive();
}

/**
 * The two automatic triggers, offered where the button for the manual one is.
 *
 * One menu is built and shared by every picture-in-picture button on the page — the
 * player's, the Shorts one, the floating one — because they all mean the same thing
 * and the settings are global.
 */
function itgAttachAutoPipMenu(button) {
    if (!button || button.dataset.itgAutoPipMenu) return;
    button.dataset.itgAutoPipMenu = 'true';

    const menu = itgAutoPipMenu();
    const show = () => {
        itgCancelAutoPipHide();
        itgAutoPipActiveButton = button;
        itgRefreshPipUiTranslations();
        for (const name of ['scroll', 'hidden']) {
            const opt = menu.querySelector(`[data-itg-auto-pip-option='${name}']`);
            opt?.itgPaint?.(itgAutoPipSettings[name] === true);
        }
        const rect = button.getBoundingClientRect();
        menu.classList.add('is-open');
        const height = menu.offsetHeight || 120;
        // Above the button when there is room, below it when there is not.
        const above = rect.top > height + 16;
        menu.dataset.place = above ? 'above' : 'below';
        menu.style.top = above ? `${rect.top - height - 10}px` : `${rect.bottom + 10}px`;
        const width = menu.offsetWidth || 250;
        menu.style.left = `${Math.max(8, Math.min(window.innerWidth - width - 8, rect.left + rect.width / 2 - width / 2))}px`;
    };

    button.addEventListener('mouseenter', show);
    button.addEventListener('mouseleave', (e) => {
        if (menu.contains(e.relatedTarget)) {
            return;
        }
        itgScheduleAutoPipHide(500);
    });
    button.addEventListener('mousemove', () => {
        itgCancelAutoPipHide();
    });
}

function itgAutoPipMenu() {
    let menu = document.getElementById('itg-autopip-menu');
    if (menu) return menu;

    if (!document.getElementById('itg-autopip-menu-styles')) {
        const style = document.createElement('style');
        style.id = 'itg-autopip-menu-styles';
        style.textContent = ITG_AUTO_PIP_MENU_STYLES;
        document.head?.appendChild(style);
    }

    menu = document.createElement('div');
    menu.id = 'itg-autopip-menu';
    menu.className = 'itg-autopip-menu';

    for (const [name, titleKey, titleFallback, descKey, descFallback] of [
        [
            'scroll',
            'autoPipOnScrollTitle',
            'Open automatically on scroll',
            'autoPipOnScrollDesc',
            'When scrolling leaves the playing video off screen. Needs a recent click — pressing play yourself counts; otherwise it opens at your next click. It goes back when the video is in view again.',
        ],
        [
            'hidden',
            'autoPipOnHiddenTitle',
            'Open automatically when leaving the tab',
            'autoPipOnHiddenDesc',
            'When switching to another tab or another program. It goes back on returning to the tab.',
        ],
    ]) {
        const option = document.createElement('button');
        option.type = 'button';
        option.className = 'itg-autopip-option';
        option.dataset.itgAutoPipOption = name;

        const title = document.createElement('strong');
        title.textContent = itgPipMsg(titleKey, titleFallback);
        const desc = document.createElement('small');
        desc.textContent = itgPipMsg(descKey, descFallback);
        option.append(title, desc);

        const paint = (on) => {
            option.classList.toggle('is-on', on);
            option.setAttribute('aria-pressed', String(on));
        };
        paint(itgAutoPipSettings[name]);

        option.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            const on = !itgAutoPipSettings[name];
            itgAutoPipSettings[name] = on;
            paint(on);
            try {
                chrome.storage.local.set({ [ITG_AUTO_PIP_KEYS[name]]: on });
            } catch {}
            itgWatchAutoPipTriggers();
        });

        option.itgPaint = paint;
        menu.appendChild(option);
    }

    // Draw the window's shape rather than type it.
    const frameOption = document.createElement('button');
    frameOption.type = 'button';
    frameOption.className = 'itg-autopip-option';
    frameOption.dataset.itgAutoPipOption = 'frame';
    const frameTitle = document.createElement('strong');
    frameTitle.textContent = itgPipMsg('pipFrameTitle', 'Set position and size');
    const frameDesc = document.createElement('small');
    frameDesc.textContent = itgPipMsg(
        'pipFrameDesc',
        'Drag a rectangle where you want the floating window, at the size you want it.',
    );
    frameOption.append(frameTitle, frameDesc);
    frameOption.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        menu.classList.remove('is-open');
        itgOpenFramePicker();
    });
    menu.appendChild(frameOption);

    // Mouse listeners on menu attached once
    menu.addEventListener('mouseenter', () => {
        itgCancelAutoPipHide();
    });
    menu.addEventListener('mouseleave', (e) => {
        if (itgAutoPipActiveButton && itgAutoPipActiveButton.contains(e.relatedTarget)) {
            return;
        }
        itgScheduleAutoPipHide(500);
    });
    menu.addEventListener('mousemove', () => {
        itgCancelAutoPipHide();
    });

    // The menu is a page-level element with no stylesheet of its own, so the theme
    // variables its colours are written against are put on it directly.
    try {
        Utils.applyThemeToHost(menu, itgPipTheme, document.documentElement.getAttribute('data-itg-page-mode'));
    } catch {}

    document.documentElement.appendChild(menu);

    // Toggled from the settings page or a keyboard command while this menu exists.
    try {
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            for (const name of ['scroll', 'hidden']) {
                const change = changes[ITG_AUTO_PIP_KEYS[name]];
                if (!change) continue;
                const option = menu.querySelector(`[data-itg-auto-pip-option='${name}']`);
                option?.itgPaint?.(change.newValue === true);
            }
        });
    } catch {}

    return menu;
}

/** The shape the user drew for the floating window, if they drew one. */
var itgPipFrame = window.__itgPipFrame ?? null;

function itgLoadPipFrame() {
    try {
        chrome.storage.local.get(['itgPipFrame'], (res) => {
            itgPipFrame = res?.itgPipFrame ?? null;
            window.__itgPipFrame = itgPipFrame;
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local' || !changes.itgPipFrame) return;
            itgPipFrame = changes.itgPipFrame.newValue ?? null;
            window.__itgPipFrame = itgPipFrame;
        });
    } catch {}
}

/**
 * Lets the user draw the floating window instead of typing numbers at it.
 *
 * A rectangle over the page, dragged and resized to taste; where it is left and how
 * big it is left is what the window is asked for. Size is honoured exactly. Position
 * is remembered and asked for, but the browser has the last word there: a document
 * picture-in-picture window ignores moveTo, and Chrome places it where the user last
 * dragged one — measured, not assumed.
 */
function itgOpenFramePicker() {
    document.getElementById('itg-pip-frame-backdrop')?.remove();

    const maxKey = `itgPipMax_${window.screen.availWidth}x${window.screen.availHeight}`;
    chrome.storage.local.get([maxKey, 'itgPipCanPlace'], (stored) => {
        const max = stored?.[maxKey] ?? null;
        // Set the first time a window is opened with a chosen position, by checking
        // whether it actually went there. On Wayland it never will — the protocol
        // gives a program no way to place its own windows — and Chrome ignores the
        // request for picture-in-picture windows regardless of platform.
        const canPlace = stored?.itgPipCanPlace !== false;
        const start = itgPipFrame ?? {
            width: Math.min(800, Math.round(window.innerWidth * 0.5)),
            height: Math.min(450, Math.round(window.innerHeight * 0.5)),
            left: Math.round(window.innerWidth * 0.25),
            top: Math.round(window.innerHeight * 0.25),
        };

        const backdrop = document.createElement('div');
        backdrop.id = 'itg-pip-frame-backdrop';
        backdrop.className = 'itg-pip-frame-backdrop';
        backdrop.innerHTML = `
            <div class="itg-pip-frame-hint"></div>
            <div class="itg-pip-frame">
                <span class="itg-pip-frame-size"></span>
                <span class="itg-pip-frame-grip"></span>
                <div class="itg-pip-frame-actions">
                    <button type="button" class="primary" data-act="save"></button>
                    <button type="button" data-act="cancel"></button>
                </div>
            </div>`;

        const frame = backdrop.querySelector('.itg-pip-frame');
        const readout = backdrop.querySelector('.itg-pip-frame-size');
        backdrop.querySelector('.itg-pip-frame-hint').textContent = canPlace
            ? itgPipMsg(
                  'pipFrameHint',
                  'Move and resize the rectangle, then save. Its size is the size the floating window opens at.',
              )
            : itgPipMsg(
                  'pipFrameHintSizeOnly',
                  'Resize the rectangle to set the size of the floating window. Where it appears is decided by the system, not by the page — drag the window itself once and it will reopen there.',
              );
        backdrop.querySelector('[data-act="save"]').textContent = itgPipMsg('pipFrameSave', 'Save');
        backdrop.querySelector('[data-act="cancel"]').textContent = itgPipMsg('pipFrameCancel', 'Cancel');

        const box = { ...start };
        const paint = () => {
            // Never larger than the window can actually be, when that is known.
            if (max) {
                box.width = Math.min(box.width, max.w);
                box.height = Math.min(box.height, max.h);
            }
            box.width = Math.max(200, box.width);
            box.height = Math.max(150, box.height);
            box.left = Math.max(0, Math.min(window.innerWidth - box.width, box.left));
            box.top = Math.max(0, Math.min(window.innerHeight - box.height, box.top));

            frame.style.left = `${box.left}px`;
            frame.style.top = `${box.top}px`;
            frame.style.width = `${box.width}px`;
            frame.style.height = `${box.height}px`;
            readout.textContent = `${box.width} × ${box.height}`;
        };
        paint();

        let drag = null;
        const onDown = (e, mode) => {
            e.preventDefault();
            e.stopPropagation();
            drag = { mode, x: e.clientX, y: e.clientY, ...box };
            backdrop.setPointerCapture?.(e.pointerId);
        };
        frame.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.itg-pip-frame-actions')) return;
            onDown(e, e.target.classList.contains('itg-pip-frame-grip') ? 'resize' : 'move');
        });
        backdrop.addEventListener('pointermove', (e) => {
            if (!drag) return;
            const dx = e.clientX - drag.x;
            const dy = e.clientY - drag.y;
            if (drag.mode === 'move') {
                box.left = drag.left + dx;
                box.top = drag.top + dy;
            } else {
                box.width = drag.width + dx;
                box.height = drag.height + dy;
            }
            paint();
        });
        const stop = () => (drag = null);
        backdrop.addEventListener('pointerup', stop);
        backdrop.addEventListener('pointercancel', stop);

        const close = () => backdrop.remove();
        backdrop.querySelector('[data-act="cancel"]').addEventListener('click', close);
        backdrop.querySelector('[data-act="save"]').addEventListener('click', () => {
            itgPipFrame = { ...box, screenLeft: window.screenX + box.left, screenTop: window.screenY + box.top };
            window.__itgPipFrame = itgPipFrame;
            try {
                chrome.storage.local.set({ itgPipFrame });
            } catch {}
            close();
        });
        // Clicking the dimmed area outside the rectangle gives up on it.
        backdrop.addEventListener('pointerdown', (e) => {
            if (e.target === backdrop) close();
        });
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape' && backdrop.isConnected) close();
            },
            { once: true },
        );

        document.documentElement.appendChild(backdrop);
        try {
            Utils.applyThemeToHost(backdrop, itgPipTheme, document.documentElement.getAttribute('data-itg-page-mode'));
        } catch {}
    });
}

// --- Opening it without being asked ------------------------------------------

/** The two automatic triggers, off unless the user turns them on. */
var itgAutoPipSettings = window.__itgAutoPipSettings ?? { scroll: false, hidden: false };
window.__itgAutoPipSettings = itgAutoPipSettings;

var ITG_AUTO_PIP_KEYS = { scroll: 'itgAutoPipOnScroll', hidden: 'itgAutoPipOnHidden' };

function itgLoadAutoPipSettings() {
    try {
        chrome.storage.local.get(Object.values(ITG_AUTO_PIP_KEYS), (stored) => {
            itgAutoPipSettings = {
                scroll: stored?.[ITG_AUTO_PIP_KEYS.scroll] === true,
                hidden: stored?.[ITG_AUTO_PIP_KEYS.hidden] === true,
            };
            window.__itgAutoPipSettings = itgAutoPipSettings;
            const menu = document.getElementById('itg-autopip-menu');
            if (menu) {
                for (const name of ['scroll', 'hidden']) {
                    const opt = menu.querySelector(`[data-itg-auto-pip-option='${name}']`);
                    opt?.itgPaint?.(itgAutoPipSettings[name] === true);
                }
            }
            itgWatchAutoPipTriggers();
        });
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area !== 'local') return;
            let changed = false;
            if (changes[ITG_AUTO_PIP_KEYS.scroll] !== undefined) {
                itgAutoPipSettings.scroll = changes[ITG_AUTO_PIP_KEYS.scroll].newValue === true;
                changed = true;
            }
            if (changes[ITG_AUTO_PIP_KEYS.hidden] !== undefined) {
                itgAutoPipSettings.hidden = changes[ITG_AUTO_PIP_KEYS.hidden].newValue === true;
                changed = true;
            }
            if (changed) {
                window.__itgAutoPipSettings = itgAutoPipSettings;
                const menu = document.getElementById('itg-autopip-menu');
                if (menu) {
                    for (const name of ['scroll', 'hidden']) {
                        const opt = menu.querySelector(`[data-itg-auto-pip-option='${name}']`);
                        opt?.itgPaint?.(itgAutoPipSettings[name] === true);
                    }
                }
                itgWatchAutoPipTriggers();
            }
        });
    } catch {}
}

/**
 * Opens the floating player when the video would otherwise be out of sight, and
 * puts it back when it is in sight again.
 *
 * Two ways for a playing video to disappear, and one rule for each: scrolled past
 * (an IntersectionObserver on the element) and the tab itself left for another tab
 * or another program (`visibilitychange`). Coming back reverses whichever one fired
 * — but only that one, so a window opened on purpose is never closed for the user.
 *
 * Whether the browser lets this happen at all is not up to us: requesting the
 * window needs a recent interaction with the page, and a scroll or a switch away is
 * not one. When it is refused, the video simply stays where it is.
 */
function itgWatchAutoPipTriggers() {
    if (window.top !== window || itgIsInsidePipWindow()) return;

    itgAutoPipState.dispose?.();
    itgAutoPipState.dispose = null;
    if (!itgAutoPipSettings.scroll && !itgAutoPipSettings.hidden) return;

    const disposers = [];

    if (itgAutoPipSettings.scroll) {
        /**
         * Watches whatever is playing right now, not whatever was playing when the
         * setting was read; and once the window is open, watches the frame left in
         * its place instead.
         *
         * Two things had to be got right here. Only a real transition counts —
         * `observe()` reports the current state immediately, so re-attaching while
         * the video is already off screen looked exactly like scrolling past it. And
         * the element to watch changes the moment the window opens: the video itself
         * leaves the page for the floating window, and the reports it produces from
         * there are meaningless in this document — read as "it is back in view" they
         * closed the window a moment after it opened. What stays behind in the page,
         * in the same place and the same size, is the frozen frame, so that is what
         * says when the user has scrolled back.
         */
        const seen = new WeakMap();
        const observer = new IntersectionObserver(
            (entries) => {
                if (!itgAutoPipSettings.scroll) return;
                for (const entry of entries) {
                    const el = entry.target;
                    const was = seen.get(el);
                    seen.set(el, entry.isIntersecting);
                    if (was === undefined || was === entry.isIntersecting) continue;

                    if (entry.isIntersecting) {
                        itgAutoPipClose('scroll');
                    } else if (el instanceof HTMLVideoElement && !ItgVideoPip.current && !el.muted && !el.paused) {
                        itgAutoPipOpen('scroll');
                        // From here the session watches the frame left behind; this
                        // element is about to leave the page for the other window.
                        observer.unobserve(el);
                        seen.delete(el);
                        if (observed === el) observed = null;
                    }
                }
            },
            { threshold: 0 },
        );

        let observed = null;
        const observe = (event) => {
            const candidate = event?.target instanceof HTMLVideoElement ? event.target : itgPickBestVideo();
            if (!candidate || candidate === observed) return;
            if (observed) {
                observer.unobserve(observed);
                seen.delete(observed);
            }
            seen.delete(candidate);
            observer.observe(candidate);
            observed = candidate;
        };

        // Capture phase: these events do not bubble out of the media element.
        document.addEventListener('play', observe, true);
        document.addEventListener('volumechange', observe, true);
        observe();

        // The events alone are not enough: a video that was already playing before
        // the setting was read never fires another `play`, so nothing would ever be
        // attached to. A slow tick picks those up, and costs nothing when the element
        // has not changed.
        const recheck = setInterval(() => {
            if (!ItgVideoPip.current) observe();
        }, 3000);

        disposers.push(() => {
            clearInterval(recheck);
            document.removeEventListener('play', observe, true);
            document.removeEventListener('volumechange', observe, true);
            observer.disconnect();
        });
    }

    if (itgAutoPipSettings.hidden) {
        /**
         * Leaving the tab is handled through the media session, not through
         * `visibilitychange`.
         *
         * Opening a floating window normally needs a recent click — measured here,
         * neither a scroll, nor a tab switch, nor even a script injected from the
         * background carries one, and the browser answers "requires user activation".
         * The one exception the browser grants is this action: when the tab becomes
         * occluded it calls the handler itself with the reason `contentoccluded`, and
         * inside it the window may be opened. It is the same door the reference
         * extension goes through, and it only exists while something is playing.
         */
        const handler = (details) => {
            const reason = details?.enterPictureInPictureReason;
            if (reason === 'contentoccluded' && !itgAutoPipSettings.hidden) return;
            itgAutoPipOpen(reason === 'contentoccluded' ? 'hidden' : 'useraction');
        };
        const register = () => {
            try {
                navigator.mediaSession.setActionHandler('enterpictureinpicture', handler);
            } catch {
                /* the browser has no such action */
            }
        };

        register();
        // The site sets its own media session handlers, and there is only one slot:
        // whoever registers last wins, so YouTube replacing ours on every navigation
        // is enough to make this look broken. Claiming it again on the events that
        // rebuild the session — and on a slow tick — keeps it ours.
        const onPlay = () => register();
        document.addEventListener('play', onPlay, true);
        window.addEventListener('yt-navigate-finish', onPlay);
        const reclaim = setInterval(register, 5000);
        disposers.push(() => {
            clearInterval(reclaim);
            document.removeEventListener('play', onPlay, true);
            window.removeEventListener('yt-navigate-finish', onPlay);
            try {
                navigator.mediaSession.setActionHandler('enterpictureinpicture', null);
            } catch {}
        });

        // Coming back to the tab puts the video back where it was.
        const onVisibility = () => {
            if (document.visibilityState === 'visible') itgAutoPipClose('hidden');
        };
        document.addEventListener('visibilitychange', onVisibility);
        disposers.push(() => document.removeEventListener('visibilitychange', onVisibility));
    }

    itgAutoPipState.dispose = () => disposers.forEach((fn) => fn());
}

var itgAutoPipState = window.__itgAutoPipState ?? {
    dispose: null,
    armed: false,
    disarm: null,
    opening: false,
};
window.__itgAutoPipState = itgAutoPipState;

async function itgAutoPipOpen(reason) {
    // Two triggers can land at once (the tab is hidden *and* the video is off
    // screen); the second must not take apart what the first just opened.
    if (ItgVideoPip.current || itgAutoPipState.opening) return;
    itgAutoPipState.opening = true;
    setTimeout(() => (itgAutoPipState.opening = false), 1500);
    const video = itgPickBestVideo();
    // Only for something actually playing: a paused video nobody is watching has no
    // business opening a window, and a muted one has no media session to open it with.
    if (!video || video.paused || video.ended) return;

    const opened = await ItgVideoPip.open(video, { auto: reason });
    if (!opened) {
        if (reason === 'scroll') itgArmAutoPipOnInteraction(video);
        return;
    }
}

/**
 * Waits for a click to do what scrolling is not allowed to.
 *
 * The browser opens a floating window only from a recent interaction, and scrolling
 * is not one — measured, not assumed: the request comes back "requires user
 * activation" from a scroll handler, from a tab switch, and even from a script the
 * background injects. Leaving the tab has a way around it (the media session's
 * occlusion action); scrolling past a video has none. So instead of failing
 * silently, the intent is remembered and honoured at the first press, and dropped
 * as soon as the video is back in view.
 */
function itgArmAutoPipOnInteraction(video) {
    if (itgAutoPipState.armed) return;

    const disarm = () => {
        itgAutoPipState.armed = false;
        document.removeEventListener('pointerdown', onInteract, true);
        document.removeEventListener('keydown', onInteract, true);
    };
    const onInteract = () => {
        disarm();
        // Still out of sight, still playing, or there is nothing to do.
        const rect = video.getBoundingClientRect();
        const visible = rect.bottom > 0 && rect.top < window.innerHeight;
        if (visible || video.paused || !video.isConnected) return;
        ItgVideoPip.open(video, { auto: 'scroll' });
    };

    itgAutoPipState.armed = true;
    itgAutoPipState.disarm = disarm;
    document.addEventListener('pointerdown', onInteract, true);
    document.addEventListener('keydown', onInteract, true);
}

function itgAutoPipClose(reason) {
    if (reason === 'scroll') itgAutoPipState.disarm?.();
    const session = ItgVideoPip.current;
    if (session?.auto === reason) session.close();
}

/**
 * Bridge for the MAIN-world hook: a page's own picture-in-picture button flags its
 * video and asks us to take over. The gesture that started it is still transient,
 * so `open()` can request the window from here.
 */
function itgListenForNativePipRequests() {
    if (window.__itgPipListenerAttached) return;
    window.__itgPipListenerAttached = true;
    window.addEventListener('message', async (event) => {
        if (event.source !== window || event.data?.__itgPip !== 'request') return;
        const video = document.querySelector(`video[${ITG_PIP_TARGET_ATTR}]`);
        const ok = await ItgVideoPip.open(video);
        video?.removeAttribute(ITG_PIP_TARGET_ATTR);
        window.postMessage({ __itgPip: 'response', id: event.data.id, ok }, '*');
    });
}

/**
 * The main-world hook cannot read chrome.storage, so the preference is mirrored
 * onto <html> for it. Off by default it is not: taking over a site's own PiP button
 * is what makes videos reachable on pages we have no selector for.
 */
function itgSyncNativePipHookFlag() {
    const apply = (enabled) => {
        if (enabled === false) document.documentElement.setAttribute('data-itg-no-pip-hook', 'true');
        else document.documentElement.removeAttribute('data-itg-no-pip-hook');
    };
    try {
        chrome.storage.local.get('itgHijackNativePip', (res) => apply(res?.itgHijackNativePip));
        chrome.storage.onChanged.addListener((changes, area) => {
            if (area === 'local' && changes.itgHijackNativePip) apply(changes.itgHijackNativePip.newValue);
        });
    } catch {}
}

function itgCleanupOldPipDom() {
    try {
        document.getElementById('itg-autopip-menu')?.remove();
        document.getElementById('itg-autopip-menu-styles')?.remove();
        document.getElementById('itg-pip-frame')?.remove();
        document.getElementById('itg-pip-frame-styles')?.remove();
        for (const btn of document.querySelectorAll('[data-itg-auto-pip-menu]')) {
            delete btn.dataset.itgAutoPipMenu;
        }
    } catch {}
}

/**
 * The content scripts are injected again when the extension reloads, into tabs that
 * already have them, so this file runs twice in one document. Top-level bindings are
 * `var` for that reason.
 */
if (window.top === window) {
    itgCleanupOldPipDom();
    itgLoadPipMessages(null, true);
    itgPreloadPipDims();
    itgListenForNativePipRequests();
    itgSyncNativePipHookFlag();
    itgLoadAutoPipSettings();
    itgLoadPipFrame();
}
