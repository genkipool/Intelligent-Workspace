/**
 * [AI INSTRUCTION]
 * PIP HANDLER — Picture-in-Picture window management.
 *
 * REUSE: Both page PiP and video PiP share core infrastructure via helper
 * functions in this file. When adding new PiP variants, use:
 *   - `createPipListenerPair()` for promise + message listener setup
 *   - `waitForPipOrTimeout()` for PiP open waiting
 *   - `restoreOriginalFocus()` for window/tab focus restoration
 *   - `buildPipIframeScript()` is NOT shared because the injected func
 *     runs in the content script context and must be self-contained.
 *     However, the structure is documented for consistency.
 *
 * Dependencies: getActivePipWindows(), setActivePipWindows(),
 *               lastCreatedPopupId (global from messaging.js),
 *               logMessage() (global from utils.js)
 */

// --- Shared PiP Infrastructure ---

// Picture-in-Picture window tracking helpers for session persistence (Manifest V3 compatible)
let lastCreatedPopupId = null;
let lastCreatedWindowId = null;
chrome.windows.onCreated.addListener((win) => {
    lastCreatedWindowId = win.id;
    if (win.type === 'popup') {
        lastCreatedPopupId = win.id;
    }
});

/**
 * Finds the floating player's window.
 *
 * A document picture-in-picture window is reported by the windows API as `type:
 * "normal"`, not "popup" — which is what the popup-only tracking above was waiting
 * for, so the window was never registered and everything that needed its id (full
 * screen, most visibly) quietly did nothing. What does single it out is its content:
 * one tab, on about:blank, in a window that is not the one that opened it.
 */
async function findPipWindowId(openerTabId, openerWindowId) {
    const activePipWindows = await getActivePipWindows();
    for (const winId in activePipWindows) {
        if (activePipWindows[winId].openerTabId === openerTabId) return Number(winId);
    }

    try {
        const windows = await chrome.windows.getAll({ populate: true });
        const candidate = windows.find(
            (win) =>
                win.id !== openerWindowId &&
                (win.tabs || []).length === 1 &&
                (win.tabs[0].url === 'about:blank' || win.tabs[0].url === ''),
        );
        if (candidate) {
            activePipWindows[candidate.id] = { openerTabId, focusChangedBeforeClose: false };
            await setActivePipWindows(activePipWindows);
            return candidate.id;
        }
    } catch (e) {
        console.warn('Could not look for the PiP window:', e);
    }
    return null;
}

async function getActivePipWindows() {
    try {
        const result = await chrome.storage.session.get('activePipWindows');
        return result.activePipWindows || {};
    } catch {
        return {};
    }
}

async function setActivePipWindows(data) {
    try {
        await chrome.storage.session.set({
            activePipWindows: data,
        });
    } catch {}
}

chrome.windows.onFocusChanged.addListener(async (windowId) => {
    const activePipWindows = await getActivePipWindows();
    let changed = false;
    for (const pipWinId in activePipWindows) {
        const data = activePipWindows[pipWinId];
        if (Number(pipWinId) === windowId) {
            if (data.focusChangedBeforeClose) {
                data.focusChangedBeforeClose = false;
                changed = true;
            }
        } else if (windowId !== chrome.windows.WINDOW_ID_NONE) {
            if (!data.focusChangedBeforeClose) {
                data.focusChangedBeforeClose = true;
                changed = true;
            }
        }
    }
    if (changed) {
        await setActivePipWindows(activePipWindows);
    }
});

chrome.windows.onRemoved.addListener(async (windowId) => {
    const activePipWindows = await getActivePipWindows();
    if (activePipWindows[windowId]) {
        const data = activePipWindows[windowId];
        delete activePipWindows[windowId];
        await setActivePipWindows(activePipWindows);

        // Notify the opener tab that the PiP window was closed, passing the isBackToTab flag
        chrome.tabs
            .sendMessage(data.openerTabId, {
                action: 'pipWindowClosed',
                isBackToTab: data.focusChangedBeforeClose,
            })
            .catch((err) => {
                // Ignore errors if the opener tab was closed
            });
    }
});

function handleRegisterPipWindow(message, sender, sendResponse) {
    (async () => {
        // A document PiP window arrives as "normal", so the popup id is only the
        // first guess; the last window created is the next one, and failing that the
        // about:blank window gives it away.
        let pipWinId = lastCreatedPopupId || lastCreatedWindowId;
        if (!pipWinId) {
            const windows = await chrome.windows.getAll({ populate: false });
            const focusedPopup = windows.find((w) => w.type === 'popup' && w.focused);
            if (focusedPopup) {
                pipWinId = focusedPopup.id;
            }
        }
        if (pipWinId && sender.tab && sender.tab.id) {
            const activePipWindows = await getActivePipWindows();
            activePipWindows[pipWinId] = {
                openerTabId: sender.tab.id,
                focusChangedBeforeClose: false,
            };
            await setActivePipWindows(activePipWindows);
        }
        sendResponse({ success: true });
    })();
}

function handleMinimizePipWindow(message, sender, sendResponse) {
    (async () => {
        // Same lookup as everywhere else: a document PiP window is reported as
        // "normal", so relying on the registration alone left this doing nothing
        // whenever the popup-shaped guess had not caught it.
        const pipWinId = await findPipWindowId(sender.tab?.id, sender.tab?.windowId);
        if (pipWinId) {
            try {
                await chrome.windows.update(pipWinId, { state: 'minimized' });
            } catch (e) {
                console.warn('Failed to minimize PiP window:', e);
            }
        }
        sendResponse({ success: true });
    })();
}
/**
 * Creates a promise + listener pair for waiting on a PiP window to start.
 * Returns { promise, listener, resolve } so callers can clean up the listener.
 *
 * @param {string} actionName - The message action to listen for (e.g. 'ITG_PIP_STARTED')
 * @param {number} targetTabId - The tab ID expected to send the message
 */
function createPipListenerPair(actionName, targetTabId) {
    let resolveFunc;
    const promise = new Promise((resolve) => {
        resolveFunc = resolve;
    });
    const listener = (msg, msgSender) => {
        if (msg.action === actionName && msgSender.tab?.id === targetTabId) {
            resolveFunc(true);
        }
    };
    chrome.runtime.onMessage.addListener(listener);
    return { promise, listener, resolve: resolveFunc };
}

/**
 * Waits for PiP to open or times out.
 * @param {Promise} pipPromise - The promise that resolves when PiP opens
 * @param {number} [timeoutMs=3000] - Maximum wait time in ms
 */
function waitForPipOrTimeout(pipPromise, timeoutMs = 3000) {
    return Promise.race([pipPromise, new Promise((resolve) => setTimeout(resolve, timeoutMs))]);
}

/**
 * Restores focus to the original window and tab after PiP creation.
 * Used in the `finally` block of both PiP handlers.
 *
 * @param {number|null} originalWindowId - Window to refocus
 * @param {number|null} originalTabId - Tab to reactivate
 * @param {number} [delayMs=800] - Delay before restoring focus
 */
async function restoreOriginalFocus(originalWindowId, originalTabId, delayMs = 250) {
    if (!originalWindowId && !originalTabId) return;

    if (delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    if (originalTabId) {
        try {
            await chrome.tabs.update(originalTabId, { active: true });
        } catch (restoreErr) {
            logMessage('Could not restore focus tab: ' + restoreErr.message);
        }
    }

    if (originalWindowId && originalWindowId !== -1) {
        try {
            await chrome.windows.update(originalWindowId, { focused: true });
        } catch (restoreErr) {
            logMessage('Could not focus original window: ' + restoreErr.message);
        }
    }
}

// --- Page PiP Handler ---

/**
 * Opens a page in a Document PiP window (wp: command).
 * The injected script creates an iframe with the page URL inside the PiP window.
 */
async function handleOpenPipWindow(message, sender, sendResponse) {
    const {
        tabId,
        windowId,
        width = 450,
        height = 600,
        originalTabId: msgTabId,
        originalWindowId: msgWinId,
        url,
    } = message;
    const originalWindowId = msgWinId || sender?.tab?.windowId;
    const originalTabId = msgTabId || sender?.tab?.id;

    const isVideoSite = url && (url.includes('youtube.com') || url.includes('youtu.be') || url.includes('tiktok.com'));
    if (isVideoSite && tabId && windowId) {
        return handleOpenVideoPipWindow(
            {
                tabId,
                windowId,
                url,
                originalTabId,
                originalWindowId,
            },
            sender,
            sendResponse,
        );
    }

    const execTabId = originalTabId;

    const { promise: pipOpenedPromise, listener: messageListener } = createPipListenerPair(
        'ITG_PIP_STARTED',
        execTabId,
    );

    try {
        chrome.scripting.executeScript({
            target: { tabId: execTabId },
            injectImmediately: true,
            args: [width, height, url],
            func: async (w, h, targetUrl) => {
                if ('documentPictureInPicture' in window) {
                    if (window.documentPictureInPicture.window) {
                        window.documentPictureInPicture.window.close();
                        chrome.runtime.sendMessage({ action: 'ITG_PIP_STARTED' });
                        return true;
                    }

                    // If the document is still loading, wait a maximum of 600ms for DOMContentLoaded to protect user gesture
                    if (document.readyState === 'loading') {
                        await new Promise((resolve) => {
                            document.addEventListener('DOMContentLoaded', resolve, { once: true });
                            setTimeout(resolve, 600);
                        });
                    }

                    try {
                        let targetUrlWithTime = targetUrl || window.location.href;
                        try {
                            const video = document.querySelector('video');
                            if (video && video.currentTime > 0) {
                                const urlObj = new URL(targetUrlWithTime);
                                const secs = Math.floor(video.currentTime);
                                urlObj.searchParams.set('t', secs);
                                targetUrlWithTime = urlObj.toString();
                            }
                        } catch (timeErr) {
                            console.warn('Failed to append time to targetUrl:', timeErr);
                        }

                        document.querySelectorAll('video').forEach((v) => {
                            try {
                                v.pause();
                            } catch {}
                        });

                        const pipWindow = await window.documentPictureInPicture.requestWindow({
                            width: w,
                            height: h,
                        });
                        pipWindow.document.body.style.margin = '0';
                        pipWindow.document.body.style.padding = '0';
                        pipWindow.document.body.style.overflow = 'hidden';
                        pipWindow.document.body.style.backgroundColor = '#1e1e1e';

                        const iframe = document.createElement('iframe');
                        iframe.name = 'itg-page-pip-iframe';
                        iframe.src = targetUrlWithTime;
                        iframe.style.width = '100vw';
                        iframe.style.height = '100vh';
                        iframe.style.border = 'none';
                        iframe.allow = 'fullscreen; clipboard-write; encrypted-media;';
                        pipWindow.document.body.appendChild(iframe);

                        // [AI NOTE] Video time tracking + resume logic for PiP close.
                        // This block is similar to handleOpenVideoPipWindow but NOT identical:
                        // - Page PiP does NOT set itg_video_pip param
                        // - Page PiP does NOT handle resize persistence
                        // - Page PiP does NOT handle TikTok native PiP
                        let lastKnownTime = 0;
                        const originalPauseInterval = setInterval(() => {
                            document.querySelectorAll('video').forEach((v) => {
                                try {
                                    if (!v.paused) {
                                        v.pause();
                                    }
                                } catch {}
                            });
                        }, 100);

                        const timeTrackerInterval = setInterval(() => {
                            try {
                                if (!pipWindow || pipWindow.closed) {
                                    clearInterval(timeTrackerInterval);
                                    clearInterval(originalPauseInterval);
                                    return;
                                }
                                const pipIframe = pipWindow.document.querySelector('iframe');
                                if (pipIframe) {
                                    const innerDoc = pipIframe.contentDocument || pipIframe.contentWindow?.document;
                                    const pipVideo = innerDoc?.querySelector('video');
                                    if (pipVideo && !isNaN(pipVideo.currentTime) && pipVideo.currentTime > 0) {
                                        lastKnownTime = pipVideo.currentTime;
                                    }
                                }
                            } catch {}
                        }, 250);

                        let didResume = false;
                        const resumeOriginalVideo = (shouldPlay) => {
                            if (didResume) return;
                            didResume = true;
                            clearInterval(timeTrackerInterval);
                            clearInterval(originalPauseInterval);
                            try {
                                const localVideo = document.querySelector('video');
                                if (localVideo) {
                                    if (lastKnownTime > 0) {
                                        localVideo.currentTime = lastKnownTime;
                                    }
                                    if (shouldPlay) {
                                        localVideo.play().catch((e) => {
                                            console.warn('Failed to autoplay original video on PiP close:', e);
                                        });
                                    } else {
                                        localVideo.pause();
                                    }
                                }
                            } catch (e) {
                                console.warn('Error resuming original video:', e);
                            }
                        };

                        pipWindow.addEventListener('pagehide', () => {
                            resumeOriginalVideo(!document.hidden);
                        });
                        pipWindow.addEventListener('unload', () => {
                            resumeOriginalVideo(!document.hidden);
                        });

                        chrome.runtime.sendMessage({ action: 'ITG_PIP_STARTED' });
                        return true;
                    } catch (e) {
                        console.warn('Target tab PiP failed:', e);
                        return false;
                    }
                }
                return false;
            },
        });

        await waitForPipOrTimeout(pipOpenedPromise);
        sendResponse({ success: true });
    } catch (e) {
        logMessage('Execution in target tab failed: ' + e.message);
        sendResponse({ success: false });
    } finally {
        chrome.runtime.onMessage.removeListener(messageListener);
    }
}

// --- Video PiP Handler ---

/**
 * Opens a video-focused PiP window (wv: command).
 *
 * The window itself is built in the page by ItgVideoPip, which moves the real
 * <video> node into a Document PiP window instead of reloading the page inside an
 * iframe. All this handler still does is focus the tab — which is what gives the
 * injected script the transient activation requestWindow() insists on — and call
 * the same opener the in-player buttons use.
 *
 * executeScript runs in the isolated world, the one the content scripts share, so
 * `window.__itgOpenVideoPip` is already defined there; TikTok's own mini player is
 * handled inside it too.
 */
async function handleOpenVideoPipWindow(message, sender, sendResponse) {
    const { tabId, windowId, url, originalTabId: msgTabId, originalWindowId: msgWinId } = message;
    const originalWindowId = msgWinId || sender?.tab?.windowId;
    const originalTabId = msgTabId || sender?.tab?.id;

    const { promise: pipOpenedPromise, listener: messageListener } = createPipListenerPair(
        'ITG_VIDEO_PIP_STARTED',
        tabId,
    );

    try {
        // Both calls stay synchronous so the user gesture is not lost on the way.
        chrome.windows.update(windowId, { focused: true });
        chrome.tabs.update(tabId, { active: true });

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            injectImmediately: true,
            args: [url],
            func: async (pipUrl) => {
                if (typeof window.__itgOpenVideoPip !== 'function') {
                    console.warn('ITG video PiP opener is not available in this tab.');
                    return false;
                }
                try {
                    await window.__itgOpenVideoPip(pipUrl);
                    chrome.runtime.sendMessage({ action: 'ITG_VIDEO_PIP_STARTED' });
                    return true;
                } catch (e) {
                    console.warn('Video PiP activation failed:', e);
                    return false;
                }
            },
        });

        await waitForPipOrTimeout(pipOpenedPromise);
        sendResponse({ success: true });
    } catch (e) {
        logMessage('Execution in target tab failed: ' + e.message);
        sendResponse({ success: false });
    } finally {
        chrome.runtime.onMessage.removeListener(messageListener);
        await restoreOriginalFocus(originalWindowId, originalTabId);
    }
}

async function handlePlayYouTubeVideoInPage(message, sender, sendResponse) {
    const { videoId } = message;
    const tabId = sender?.tab?.id;
    if (!tabId || !videoId) {
        sendResponse?.({ success: false });
        return;
    }

    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: 'MAIN',
            args: [videoId],
            func: (id) => {
                // 1. YouTube HTML5 Player API (direct in-page control)
                const player = document.getElementById('movie_player') || document.querySelector('.html5-video-player');
                if (player && typeof player.loadVideoById === 'function') {
                    try {
                        player.loadVideoById(id);
                        const targetUrl = `/watch?v=${encodeURIComponent(id)}`;
                        window.history.pushState(null, '', targetUrl);
                        window.dispatchEvent(
                            new CustomEvent('yt-navigate-finish', {
                                detail: { endpoint: { watchEndpoint: { videoId: id } } },
                            }),
                        );
                        return true;
                    } catch (err) {
                        console.warn('[ITG PiP MainWorld] player.loadVideoById failed:', err);
                    }
                }

                // 2. YouTube Polymer SPA navigation
                const ytdApp = document.querySelector('ytd-app');
                if (ytdApp) {
                    if (typeof ytdApp.navigate === 'function') {
                        try {
                            ytdApp.navigate({
                                commandMetadata: {
                                    webCommandMetadata: {
                                        url: `/watch?v=${encodeURIComponent(id)}`,
                                        webPageType: 'WEB_PAGE_TYPE_WATCH',
                                    },
                                },
                                watchEndpoint: { videoId: id },
                            });
                            return true;
                        } catch (err) {}
                    }
                    if (typeof ytdApp.fire === 'function') {
                        try {
                            ytdApp.fire('yt-navigate', {
                                endpoint: {
                                    commandMetadata: {
                                        webCommandMetadata: {
                                            url: `/watch?v=${encodeURIComponent(id)}`,
                                            webPageType: 'WEB_PAGE_TYPE_WATCH',
                                        },
                                    },
                                    watchEndpoint: { videoId: id },
                                },
                            });
                            return true;
                        } catch (err) {}
                    }
                }

                // 3. Fallback: simulate click on existing video link
                const existingLink = document.querySelector(`a[href*="${id}"]`);
                if (existingLink) {
                    existingLink.click();
                    return true;
                }

                return false;
            },
        });
        sendResponse?.({ success: true });
    } catch (e) {
        console.warn('Failed to execute playYouTubeVideoInPage:', e);
        sendResponse?.({ success: false });
    }
}
