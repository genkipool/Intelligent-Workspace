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
chrome.windows.onCreated.addListener((win) => {
    if (win.type === 'popup') {
        lastCreatedPopupId = win.id;
    }
});

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
        let pipWinId = lastCreatedPopupId;
        // Fallback: search for the currently focused popup window if lastCreatedPopupId is missing or wrong
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
        const activePipWindows = await getActivePipWindows();
        let pipWinId = null;
        if (sender.tab && sender.tab.id) {
            for (const winId in activePipWindows) {
                if (activePipWindows[winId].openerTabId === sender.tab.id) {
                    pipWinId = Number(winId);
                    break;
                }
            }
        }
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
async function restoreOriginalFocus(originalWindowId, originalTabId, delayMs = 800) {
    if (!originalWindowId && !originalTabId) return;

    await new Promise((resolve) => setTimeout(resolve, delayMs));

    if (originalWindowId && originalWindowId !== -1) {
        try {
            await chrome.windows.update(originalWindowId, { focused: true });
        } catch (restoreErr) {
            logMessage('Could not focus original window: ' + restoreErr.message);
        }
    }
    if (originalTabId) {
        try {
            await chrome.tabs.update(originalTabId, { active: true });
        } catch (restoreErr) {
            logMessage('Could not restore focus tab: ' + restoreErr.message);
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

    const isYouTube = url && (url.includes('youtube.com') || url.includes('youtu.be'));
    const execTabId = isYouTube ? tabId : originalTabId;

    const { promise: pipOpenedPromise, listener: messageListener } = createPipListenerPair(
        'ITG_PIP_STARTED',
        execTabId,
    );

    try {
        if (isYouTube) {
            // Synchronously schedule tab activation and script execution to preserve user gesture
            chrome.windows.update(windowId, { focused: true });
            chrome.tabs.update(tabId, { active: true });
        }

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
        if (isYouTube) {
            await restoreOriginalFocus(originalWindowId, originalTabId);
        }
    }
}

// --- Video PiP Handler ---

/**
 * Opens a video-focused PiP window (wv: command).
 * Handles YouTube, TikTok (native mini-player), and generic video sites.
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
        // --- TikTok Native PiP: Use browser's native PiP API instead of Document PiP ---
        const isTiktokUrl = url && (url.includes('tiktok.com') || url.includes('tiktok.'));
        if (isTiktokUrl) {
            chrome.windows.update(windowId, { focused: true });
            chrome.tabs.update(tabId, { active: true });

            chrome.scripting.executeScript({
                target: { tabId: tabId },
                injectImmediately: true,
                func: async () => {
                    try {
                        // Try to click the native TikTok "Reproductor flotante" (mini-player) button
                        let miniPlayerBtn = document.querySelector('[data-e2e="more-menu-popover_mini-player"]');
                        if (miniPlayerBtn) {
                            miniPlayerBtn.click();
                            chrome.runtime.sendMessage({ action: 'ITG_VIDEO_PIP_STARTED' });
                            return true;
                        }
                        // If popover is not open, open the "more" menu first
                        const moreBtn = document.querySelector('[data-e2e="more-menu-icon"]');
                        if (moreBtn) {
                            moreBtn.click();
                            await new Promise((resolve) => setTimeout(resolve, 300));
                            miniPlayerBtn = document.querySelector('[data-e2e="more-menu-popover_mini-player"]');
                            if (miniPlayerBtn) {
                                miniPlayerBtn.click();
                                chrome.runtime.sendMessage({ action: 'ITG_VIDEO_PIP_STARTED' });
                                return true;
                            }
                        }
                    } catch (e) {
                        console.warn('Failed to trigger TikTok native mini-player:', e);
                    }
                    return false;
                },
            });

            await waitForPipOrTimeout(pipOpenedPromise);
            sendResponse({ success: true });
            return;
        }

        // --- Generic Video PiP (YouTube and others) ---
        // Synchronously schedule tab activation and script execution to preserve user gesture
        chrome.windows.update(windowId, { focused: true });
        chrome.tabs.update(tabId, { active: true });

        chrome.scripting.executeScript({
            target: { tabId: tabId },
            injectImmediately: true,
            args: [url],
            func: async (pipUrl) => {
                if ('documentPictureInPicture' in window) {
                    if (window.documentPictureInPicture.window) {
                        window.documentPictureInPicture.window.close();
                        chrome.runtime.sendMessage({ action: 'ITG_VIDEO_PIP_STARTED' });
                        return true;
                    }

                    // If the document is still loading, wait a maximum of 600ms for DOMContentLoaded to protect user gesture
                    if (document.readyState === 'loading') {
                        await new Promise((resolve) => {
                            document.addEventListener('DOMContentLoaded', resolve, { once: true });
                            setTimeout(resolve, 600);
                        });
                    }

                    const isShort = pipUrl.includes('/shorts/');
                    const defaultW = isShort ? 318 : 800;
                    const defaultH = isShort ? 571 : 600;

                    try {
                        // Must call requestWindow synchronously to use the active user gesture
                        const pipWindow = await window.documentPictureInPicture.requestWindow({
                            width: defaultW,
                            height: defaultH,
                            disallowReturnToOpener: false,
                        });

                        // Set up content
                        pipWindow.document.body.style.margin = '0';
                        pipWindow.document.body.style.padding = '0';
                        pipWindow.document.body.style.overflow = 'hidden';
                        pipWindow.document.body.style.backgroundColor = '#000';

                        let targetUrl = window.location.href;
                        try {
                            const video = document.querySelector('video');
                            if (video && video.currentTime > 0) {
                                const secs = Math.floor(video.currentTime);
                                const urlObj = new URL(targetUrl);
                                urlObj.searchParams.set('t', secs);
                                urlObj.searchParams.set('itg_video_pip', 'true');
                                targetUrl = urlObj.toString();
                            } else {
                                const urlObj = new URL(targetUrl);
                                urlObj.searchParams.set('itg_video_pip', 'true');
                                targetUrl = urlObj.toString();
                            }
                        } catch (e) {
                            console.warn('Failed to append current video time:', e);
                            try {
                                const urlObj = new URL(targetUrl);
                                urlObj.searchParams.set('itg_video_pip', 'true');
                                targetUrl = urlObj.toString();
                            } catch {}
                        }

                        document.querySelectorAll('video').forEach((v) => {
                            try {
                                v.pause();
                            } catch {}
                        });

                        try {
                            await chrome.runtime.sendMessage({ action: 'prepareVideoUrlForPip', url: targetUrl });
                        } catch (e) {
                            console.warn('Failed to prepare video URL for PiP in executeScript:', e);
                        }

                        const iframe = document.createElement('iframe');
                        iframe.name = 'itg-video-pip-iframe';
                        iframe.src = targetUrl;
                        iframe.style.width = '100vw';
                        iframe.style.height = '100vh';
                        iframe.style.border = 'none';
                        iframe.allow = 'fullscreen; clipboard-write; encrypted-media; autoplay; picture-in-picture;';
                        pipWindow.document.body.appendChild(iframe);

                        // [AI NOTE] Video time tracking + resume logic — similar to page PiP but
                        // includes resize persistence for video dimensions (shorts vs normal).
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
                            } catch {
                                // Suppress cross-origin warnings if they happen
                            }
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

                        // Resize asynchronously based on saved storage values
                        const storageKeys = isShort
                            ? ['lastShortPipWidth', 'lastShortPipHeight']
                            : ['lastNormalPipWidth', 'lastNormalPipHeight'];
                        chrome.storage.local.get(storageKeys, (dims) => {
                            const savedW = isShort ? dims.lastShortPipWidth : dims.lastNormalPipWidth;
                            const savedH = isShort ? dims.lastShortPipHeight : dims.lastNormalPipHeight;
                            if (savedW && savedH) {
                                pipWindow.resizeTo(savedW, savedH);
                            }
                        });

                        // Save adjustments on manual resize
                        let resizeTimeout;
                        pipWindow.addEventListener('resize', () => {
                            clearTimeout(resizeTimeout);
                            resizeTimeout = setTimeout(() => {
                                const innerW = pipWindow.innerWidth;
                                const innerH = pipWindow.innerHeight;
                                if (innerW > 0 && innerH > 0) {
                                    if (isShort) {
                                        chrome.storage.local.set({
                                            lastShortPipWidth: innerW,
                                            lastShortPipHeight: innerH,
                                        });
                                    } else {
                                        chrome.storage.local.set({
                                            lastNormalPipWidth: innerW,
                                            lastNormalPipHeight: innerH,
                                        });
                                    }
                                }
                            }, 500);
                        });

                        chrome.runtime.sendMessage({ action: 'ITG_VIDEO_PIP_STARTED' });
                        return true;
                    } catch (e) {
                        console.error('Synchronous PiP activation failed:', e);
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
        await restoreOriginalFocus(originalWindowId, originalTabId);
    }
}
