async function requestItgPipWindow(targetUrl, defaultWidth, defaultHeight) {
    const isShort =
        (typeof targetUrl === 'string' && targetUrl.includes('/shorts/')) ||
        window.location.pathname.includes('/shorts/');
    const setupResizeListener = (pipWin) => {
        let resizeTimeout;
        pipWin.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const w = pipWin.innerWidth;
                const h = pipWin.innerHeight;
                if (w > 0 && h > 0) {
                    if (isShort) {
                        chrome.storage.local.set({
                            lastShortPipWidth: w,
                            lastShortPipHeight: h,
                        });
                    } else {
                        chrome.storage.local.set({
                            lastNormalPipWidth: w,
                            lastNormalPipHeight: h,
                        });
                    }
                }
            }, 500);
        });
    };

    // If dimensions are pre-resolved and passed, call requestWindow synchronously
    // to preserve the transient user gesture required by the browser.
    if (defaultWidth && defaultHeight) {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
            width: defaultWidth,
            height: defaultHeight,
            disallowReturnToOpener: false,
        });
        setupResizeListener(pipWindow);
        return pipWindow;
    }
    const storageKeys = isShort
        ? ['lastShortPipWidth', 'lastShortPipHeight']
        : ['lastNormalPipWidth', 'lastNormalPipHeight'];
    const dims = await new Promise((resolve) => {
        if (chrome.storage && chrome.storage.local) {
            chrome.storage.local.get(storageKeys, resolve);
        } else {
            resolve({});
        }
    });
    let width, height;
    if (isShort) {
        width = dims.lastShortPipWidth || 318;
        height = dims.lastShortPipHeight || 571;
    } else {
        width = dims.lastNormalPipWidth || defaultWidth || 800;
        height = dims.lastNormalPipHeight || defaultHeight || 600;
    }
    const pipWindow = await window.documentPictureInPicture.requestWindow({
        width: width,
        height: height,
        disallowReturnToOpener: false,
    });
    setupResizeListener(pipWindow);
    return pipWindow;
}
/**
 * Moves TikTok's mini player on to the next video when one finishes.
 *
 * TikTok loops its clips, so `ended` never fires on its own — clearing `loop` is
 * what turns the end of a video into an event. The step itself is TikTok's own
 * arrow: clicking it keeps the account controls the native mini player is kept for.
 */
function itgAutoAdvanceTiktok() {
    if (window.__itgTiktokAutoAdvance) return;

    const nextButton = () =>
        document.querySelector(
            '[data-e2e="arrow-right"] button, button[data-e2e="arrow-right"], [data-e2e="arrow-right"]',
        );

    const attach = () => {
        for (const video of document.querySelectorAll('video')) {
            if (video.dataset.itgAutoAdvance) continue;
            video.dataset.itgAutoAdvance = 'true';
            video.loop = false;
            video.addEventListener('ended', () => {
                if (!document.pictureInPictureElement) return;
                nextButton()?.click();
            });
        }
    };

    attach();
    // TikTok swaps the video element on every step, so each new one needs the same.
    const observer = new MutationObserver(() => attach());
    observer.observe(document.documentElement, { childList: true, subtree: true });
    window.__itgTiktokAutoAdvance = () => observer.disconnect();
}

/**
 * Detaches the page's video into a floating window.
 *
 * TikTok keeps its own path: its native mini player carries the account controls
 * (follow, like, comments) that a bare video element cannot, so it stays the better
 * option there. Everywhere else the video node itself is moved into a Document PiP
 * window by ItgVideoPip — no iframe, no second page load, no lost position.
 */
async function openVideoPip(url, defaultWidth, defaultHeight) {
    if (window.location.hostname.includes('tiktok.com')) {
        try {
            // Try to click the native TikTok "Reproductor flotante" (mini-player) button
            let miniPlayerBtn = document.querySelector('[data-e2e="more-menu-popover_mini-player"]');
            if (miniPlayerBtn) {
                miniPlayerBtn.click();
                itgAutoAdvanceTiktok();
                return;
            }
            // If popover is not open, open the "more" menu first
            const moreBtn = document.querySelector('[data-e2e="more-menu-icon"]');
            if (moreBtn) {
                moreBtn.click();
                await new Promise((resolve) => setTimeout(resolve, 300));
                miniPlayerBtn = document.querySelector('[data-e2e="more-menu-popover_mini-player"]');
                if (miniPlayerBtn) {
                    miniPlayerBtn.click();
                    itgAutoAdvanceTiktok();
                    return;
                }
            }
        } catch (e) {
            console.warn('Failed to trigger TikTok native mini-player:', e);
        }
        return;
    }

    const isYouTubeUrl = url && (url.includes('youtube.com') || url.includes('youtu.be'));
    if (isYouTubeUrl && typeof window.ItgVideoPip?.open === 'function') {
        return window.ItgVideoPip.open(null, { youtubeUrl: url });
    }

    const localVideo = document.querySelector('video');
    const isCurrentPage =
        !url ||
        url === window.location.href ||
        url === window.location.href.split('#')[0] ||
        url === window.location.href.split('?')[0];

    if (isCurrentPage && localVideo && typeof window.ItgVideoPip?.open === 'function') {
        return ItgVideoPip.open(localVideo);
    }

    if (url && !isCurrentPage && 'documentPictureInPicture' in window) {
        try {
            if (window.documentPictureInPicture.window) {
                window.documentPictureInPicture.window.close();
            }
            let targetUrl = url;
            try {
                const currentCleanUrl = window.location.href.split('#')[0].split('?')[0];
                const urlObj = new URL(url);
                const targetCleanUrl = urlObj.href.split('#')[0].split('?')[0];
                if (currentCleanUrl === targetCleanUrl && localVideo && localVideo.currentTime > 0) {
                    const secs = Math.floor(localVideo.currentTime);
                    urlObj.searchParams.set('t', secs);
                    targetUrl = urlObj.toString();
                }
            } catch (e) {
                console.warn('Failed to append current video time:', e);
            }

            const pausedVideos = [];
            document.querySelectorAll('video').forEach((v) => {
                try {
                    if (!v.paused) {
                        v.pause();
                        pausedVideos.push(v);
                    }
                } catch {}
            });

            const urlObj = new URL(targetUrl);
            urlObj.searchParams.set('itg_video_pip', 'true');
            targetUrl = urlObj.toString();
            const isShort = targetUrl.includes('/shorts/');
            const width = defaultWidth || (isShort ? 318 : 800);
            const height = defaultHeight || (isShort ? 571 : 600);
            const pipWindow = await requestItgPipWindow(targetUrl, width, height);
            pipWindow.document.body.style.margin = '0';
            pipWindow.document.body.style.padding = '0';
            pipWindow.document.body.style.overflow = 'hidden';
            pipWindow.document.body.style.backgroundColor = '#000';
            pipWindow.document.body.style.position = 'relative';
            pipWindow.document.body.style.width = '100vw';
            pipWindow.document.body.style.height = '100vh';

            const resumePausedVideos = () => {
                pausedVideos.forEach((v) => {
                    try {
                        if (v.isConnected) {
                            v.play().catch(() => {});
                        }
                    } catch {}
                });
                const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
                if (player && typeof player.playVideo === 'function') {
                    try {
                        player.playVideo();
                    } catch {}
                }
            };
            pipWindow.addEventListener('pagehide', resumePausedVideos, { once: true });
            pipWindow.addEventListener('unload', resumePausedVideos, { once: true });

            await chrome.runtime.sendMessage({
                action: 'prepareVideoUrlForPip',
                url: targetUrl,
            });

            const iframe = document.createElement('iframe');
            iframe.name = 'itg-video-pip-iframe';
            iframe.style.cssText =
                'position:absolute;top:0;left:0;width:100vw;height:100vh;border:none;z-index:1;border-radius:0';
            iframe.setAttribute(
                'allow',
                'picture-in-picture; autoplay; fullscreen; encrypted-media; accelerometer; clipboard-write; gyroscope',
            );
            iframe.setAttribute('fetchpriority', 'high');
            iframe.setAttribute('loading', 'eager');
            iframe.src = targetUrl;
            pipWindow.document.body.appendChild(iframe);

            return pipWindow;
        } catch (err) {
            console.warn('Video Document PiP failed:', err);
        }
    }

    if (typeof window.ItgVideoPip?.open === 'function') {
        return ItgVideoPip.open();
    }
}
window.__itgOpenVideoPip = openVideoPip;
/**
 * @class Utils
 * @description General utilities and DOM helpers.
 */
var Utils = class Utils {
    /** path -> Promise<cssText>, so each frame reads a stylesheet at most once. */
    static _cssCache = new Map();

    static debounce(func, delay) {
        let timeout;
        return function (...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), delay);
        };
    }
    static isInputLikeElement(element) {
        if (!element) return false;
        const tagName = element.tagName;
        if (['INPUT', 'TEXTAREA', 'SELECT'].includes(tagName)) return true;
        if (element.isContentEditable) return true;
        if (element.getAttribute) {
            const role = element.getAttribute('role');
            if (role === 'textbox' || role === 'searchbox' || role === 'combobox') return true;
        }
        return false;
    }
    static isVisible(el, isYouTubeControl = false) {
        if (el.closest('[aria-hidden="true"]')) return false;
        const parentDetails = el.closest('details');
        if (parentDetails && !parentDetails.open) {
            const summaryAncestor = el.closest('summary');
            if (!summaryAncestor || summaryAncestor.parentElement !== parentDetails) return false;
        }
        if (typeof el.getBoundingClientRect !== 'function') return false;
        const rect = el.getBoundingClientRect();
        let hasDimensions = rect.width >= 1 && rect.height >= 1;
        if (!hasDimensions && el.children.length > 0) {
            const descendants = el.querySelectorAll('*');
            for (const descendant of descendants) {
                if (descendant.getBoundingClientRect().width >= 1) {
                    hasDimensions = true;
                    break;
                }
            }
        }
        if (!hasDimensions) return false;
        let current = el;
        while (current) {
            const style = window.getComputedStyle(current);
            if (style.display === 'none' || style.visibility === 'hidden') return false;
            if (!isYouTubeControl && parseFloat(style.opacity) < 0.1) return false;
            current = current.parentElement;
        }
        return true;
    }
    static querySelectorAllDeep(selector, root = document) {
        let elements = Array.from(root.querySelectorAll(selector));
        const traverse = (node) => {
            if (node.shadowRoot) {
                elements = elements.concat(Array.from(node.shadowRoot.querySelectorAll(selector)));
            }
            Array.from(node.children).forEach(traverse);
        };
        traverse(root);
        return elements;
    }

    /**
     * NEW: Helper to force updates in React-controlled inputs.
     * This gets the native setter ignoring React's override.
     */
    static setReactValue(element, value) {
        const proto = Object.getPrototypeOf(element);
        const valueSetter = Object.getOwnPropertyDescriptor(proto, 'value')?.set;
        if (valueSetter && valueSetter !== element.value) {
            const prototypeValueSetter = Object.getOwnPropertyDescriptor(
                element.tagName === 'INPUT' ? window.HTMLInputElement.prototype : window.HTMLTextAreaElement.prototype,
                'value',
            ).set;
            if (prototypeValueSetter) {
                prototypeValueSetter.call(element, value);
            } else {
                element.value = value;
            }
        } else {
            element.value = value;
        }
        element.dispatchEvent(
            new Event('input', {
                bubbles: true,
            }),
        );
    }

    /**
     * Escapes HTML characters to insert safe text
     */
    static escapeHtml(text) {
        if (!text) return '';
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    /**
     * Applies theme colors to a shadow host as CSS variables.
     * Supports overriding based on page modes (black/light).
     */
    static applyThemeToHost(host, theme, overrideMode) {
        if (!host) return;

        // Safe fallback hex colors in case themes.css fails to load or for initial render
        const darkThemeColors = {
            actionColor: '#5F6368',
            textColor: '#a8a8a8',
            textOnColor: '#d3d1d1',
            bgColor: '#000000',
            bgPanelColor: '#2C2C2C',
            borderColor: '#1a1818',
            interactiveColor: '#5F6368',
            errorColor: '#6b0d1e',
            headerColor: '#424242',
            successColor: '#03DAC6',
        };
        const lightThemeColors = {
            actionColor: '#3498DB',
            textColor: '#000000',
            textOnColor: '#3498DB',
            bgColor: '#F5F5F5',
            bgPanelColor: '#FFF',
            borderColor: '#DDD',
            interactiveColor: '#3498DB',
            errorColor: '#E74C3C',
            headerColor: '#0658AA',
            successColor: '#188038',
        };

        // 1. Set data-theme for standard variable application via themes.css
        const themeName =
            overrideMode === 'black' ? 'dark' : overrideMode === 'light' ? 'light' : theme?.name || 'light';
        host.setAttribute('data-theme', themeName);

        // 2. Determine which colors to apply (custom or default fallbacks)
        const fallbackColors = themeName === 'dark' || themeName === 'viridian' ? darkThemeColors : lightThemeColors;
        const colors =
            theme && theme.colors && !['black', 'light'].includes(overrideMode) ? theme.colors : fallbackColors;

        // 3. Apply variables via inline styles (highest priority and works as fallback)
        Object.entries(colors).forEach(([key, val]) => {
            const cssVar = '--' + key.replace(/([A-Z])/g, '-$1').toLowerCase();
            host.style.setProperty(cssVar, val);
        });
    }

    /**
     * Reads a stylesheet that ships with the extension.
     *
     * These scripts run in every frame, so asking the service worker for the file
     * meant two messages per frame: a page with a handful of iframes produced
     * dozens, and every worker restart re-injected the scripts and repeated them
     * all. Any message still in flight when the worker was torn down failed with
     * "the message port closed before a response was received", which is what
     * flooded the console.
     *
     * The files are in web_accessible_resources, so the content script can read
     * them itself: from its isolated world the fetch works even under a hostile
     * page CSP. The worker is only asked if that direct read fails.
     */
    static async readExtensionCss(path) {
        if (!chrome.runtime || !chrome.runtime.id) {
            throw new Error('Extension context invalidated.');
        }

        if (Utils._cssCache.has(path)) return Utils._cssCache.get(path);

        const load = (async () => {
            try {
                const res = await fetch(chrome.runtime.getURL(path));
                if (res.ok) return await res.text();
            } catch {
                // Falls through to the background, below.
            }

            const response = await new Promise((resolve) => {
                chrome.runtime.sendMessage({ action: 'getExtensionFileContent', path }, (res) => {
                    if (chrome.runtime.lastError || !res || !res.success) {
                        resolve({
                            success: false,
                            error: chrome.runtime.lastError?.message || 'Failed',
                        });
                    } else {
                        resolve(res);
                    }
                });
            });
            if (!response.success) {
                throw new Error(response.error || `Failed to fetch ${path}.`);
            }
            return response.text;
        })();

        // Cached as a promise so the frame never asks twice, not even concurrently.
        Utils._cssCache.set(path, load);
        try {
            return await load;
        } catch (e) {
            Utils._cssCache.delete(path);
            throw e;
        }
    }

    /**
     * Loads and adapts themes.css for Shadow DOM.
     */
    static async loadThemes(shadow) {
        try {
            let cssText = await Utils.readExtensionCss('src/styles/themes.css');

            // Transform [data-theme="..."] to :host([data-theme="..."]) for shadow host support
            // We keep the original too just in case elements inside have the attribute
            cssText = cssText.replace(/\[data-theme="([^"]+)"\]/g, ':host([data-theme="$1"]), [data-theme="$1"]');
            const styleElement = document.createElement('style');
            styleElement.id = 'itg-themes-style';
            styleElement.textContent = cssText;
            shadow.appendChild(styleElement);
            return true;
        } catch (e) {
            console.warn('[Hint] Failed to load themes.css', e);
            return false;
        }
    }

    /**
     * Robustly loads a stylesheet into a shadow root (CSP immune). See
     * readExtensionCss for why this no longer goes through the worker by default.
     */
    static async loadStyle(shadow, url) {
        try {
            let path = url;
            if (url.startsWith('chrome-extension://')) {
                const urlObj = new URL(url);
                path = urlObj.pathname.startsWith('/') ? urlObj.pathname.slice(1) : urlObj.pathname;
            }

            const cssText = await Utils.readExtensionCss(path);
            const styleElement = document.createElement('style');
            styleElement.textContent = cssText;
            shadow.appendChild(styleElement);
            return true;
        } catch (e) {
            console.warn('[Hint] Failed to load stylesheet, falling back to link', e);
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = url;
            shadow.appendChild(link);
            return false;
        }
    }
};

/**
 * @class SnippetManager
 * @description Handles text expansion (snippets) in inputs and textareas.
 */
/**
 * @class SnippetManager
 * @description Handles text expansion (snippets) in inputs and textareas.
 * MODIFIED: Autocomplete on space press for all cases (with and without variables).
 */
/**
 * @class SnippetExpander
 * @description Handles text expansion (snippets) with full support for formatted HTML
 * using Clipboard API for compatibility with Google Docs and other advanced editors.
 */

/**
 * @class OmniBar
 */
// -- Markdown mini-parser for omnibar responses ------------------
function _omniParseMarkdown(text) {
    if (!text) return '';
    const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    // Split into code blocks and non-code blocks
    const blocks = [];
    const codeRe = /```(\w*)\n?([\s\S]*?)```/g;
    let last = 0,
        m;
    while ((m = codeRe.exec(text)) !== null) {
        if (m.index > last)
            blocks.push({
                type: 'text',
                content: text.slice(last, m.index),
            });
        blocks.push({
            type: 'code',
            lang: m[1],
            content: m[2],
        });
        last = m.index + m[0].length;
    }
    if (last < text.length)
        blocks.push({
            type: 'text',
            content: text.slice(last),
        });
    return blocks
        .map((block) => {
            if (block.type === 'code') {
                return `<pre><code>${esc(block.content.trimEnd())}</code></pre>`;
            }
            let html = esc(block.content);
            // Inline code
            html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
            // Bold & italic
            html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
            html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
            // Headings
            html = html.replace(/^#{3}\s+(.+)$/gm, '<h4>$1</h4>');
            html = html.replace(/^#{2}\s+(.+)$/gm, '<h3>$1</h3>');
            html = html.replace(/^#{1}\s+(.+)$/gm, '<h2>$1</h2>');
            // Unordered lists
            html = html.replace(/^[\*\-]\s+(.+)$/gm, '<li>$1</li>');
            html = html.replace(/(<li>.*<\/li>(\n|$))+/g, (match) => `<ul>${match}</ul>`);
            // Ordered lists
            html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');
            // Horizontal rule
            html = html.replace(/^---+$/gm, '<hr>');
            // Paragraphs: split by double newlines
            const parts = html.split(/\n{2,}/);
            return parts
                .map((p) => {
                    if (p.match(/^<(h[1-4]|ul|ol|pre|hr)/)) return p;
                    const inner = p.replace(/\n/g, '<br>');
                    return inner.trim() ? `<p>${inner}</p>` : '';
                })
                .join('');
        })
        .join('');
}

// -- Copy as both plain-text (markdown) and HTML -----------------
function _omniCopyRich(plainText, htmlText) {
    try {
        const item = new ClipboardItem({
            'text/plain': new Blob([plainText], {
                type: 'text/plain',
            }),
            'text/html': new Blob([htmlText], {
                type: 'text/html',
            }),
        });
        return navigator.clipboard.write([item]);
    } catch {
        return navigator.clipboard.writeText(plainText);
    }
}
var OMNI_COPY_SVG = `<svg width="16" height="16" viewBox="-2.4 -2.4 28.80 28.80" fill="none" xmlns="http://www.w3.org/2000/svg"><g fill-rule="evenodd" clip-rule="evenodd" fill="var(--text-color)"><path d="M6.25 5.25c0-2.747 2.187-5 4.917-5h6.666c2.73 0 4.917 2.253 4.917 5v8.5c0 2.747-2.187 5-4.917 5a.75.75 0 0 1 0-1.5c1.873 0 3.417-1.553 3.417-3.5v-8.5c0-1.947-1.544-3.5-3.417-3.5h-6.666c-1.873 0-3.417 1.553-3.417 3.5a.75.75 0 0 1-1.5 0"/><path d="M1.25 10.25c0-2.747 2.187-5 4.917-5h6.666c2.73 0 4.917 2.253 4.917 5v8.5c0 2.747-2.187 5-4.917 5H6.167c-2.73 0-4.917-2.253-4.917-5zm4.917-3.5c-1.873 0-3.417 1.553-3.417 3.5v8.5c0 1.947 1.544 3.5 3.417 3.5h6.666c1.873 0 3.417-1.553 3.417-3.5v-8.5c0-1.947-1.544-3.5-3.417-3.5z"/></g></svg>`;
var OMNI_DB_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><g stroke="currentColor" stroke-width="1.5"><path d="M4 18V6m16 0v12" stroke-linecap="round"></path><path d="M12 10c4.418 0 8-1.79 8-4s-3.582-4-8-4-8 1.79-8 4 3.582 4 8 4Zm8 2c0 2.21-3.582 4-8 4s-8-1.79-8-4m16 6c0 2.21-3.582 4-8 4s-8-1.79-8-4"></path></g></svg>`;
