// Global cross-frame media controller listener
// Injected into all child frames via manifest (all_frames: true) to universally pause media on preview close
window.addEventListener('message', (event) => {
    if (event.data && event.data.action === 'pauseMedia') {
        document.querySelectorAll('video, audio').forEach((media) => {
            try {
                if (!media.paused) media.pause();
            } catch {}
        });
        document.querySelectorAll('iframe').forEach((subIframe) => {
            try {
                if (subIframe.contentWindow) {
                    subIframe.contentWindow.postMessage(
                        {
                            action: 'pauseMedia',
                        },
                        '*',
                    );
                }
            } catch {}
        });
    }
});

/**
 * @class LinkPreviewManager
 * @description Manages floating, debounced, glassmorphic link previews with iframes.
 */

/**
 * @class Main
 * @description Main class that orchestrates all modules.
 */
var Main = class Main {
    constructor() {
        this.insertMode = false;
        this.hintsGloballyEnabled = true;
        this.keySequence = '';
        this.keyTimeout = null;
        this.shadowUI = new ShadowUI();
        this.scrollManager = new ScrollManager();
        this.hintEngine = new HintEngine(this.shadowUI);
        this.omniBar = new OmniBar();
        this.snippetManager = new SnippetManager(this.shadowUI);
        this.commands = new CommandRegistry(this.scrollManager, this.hintEngine, this.omniBar, null, this.shadowUI);
        this.linkPreviewManager = new LinkPreviewManager(this.shadowUI);
        this.helpModal = new HelpModal(this.shadowUI, this.commands, this.snippetManager, this.linkPreviewManager);
        this.commands.setHelpModal(this.helpModal);
        this._ytPipObserver = null;
        this._ytLoopObserver = null;
        this._mediaStorageListener = null;
        this._altSequenceBuffer = '';
        this._altSequenceTimer = null;
        this._isAltHeld = false;
        this.videoPipEnabled = true;
        this.youtubeLoopEnabled = true;
        this._setupMediaFeaturesStorageListener();
    }
    async init() {
        // The floating player's window loads these scripts too; it needs none of them.
        if (itgIsInsidePipWindow()) return;
        // Robust PiP mode detection: check if window name matches, search param matches, or url contains itg_pip / itg_video_pip / itg_page_pip
        const isVideoPipMode =
            window.name === 'itg-video-pip-iframe' ||
            new URLSearchParams(window.location.search).get('itg_video_pip') === 'true' ||
            window.location.href.includes('itg_video_pip=true');
        const isPagePipMode =
            window.name === 'itg-page-pip-iframe' ||
            window.name === 'itg-pip-iframe' ||
            new URLSearchParams(window.location.search).get('itg_pip') === 'true' ||
            window.location.href.includes('itg_pip=true');
        const isPipMode = isVideoPipMode || isPagePipMode;
        if (!isPipMode) {
            this.shadowUI.init();
            chrome.storage.local.get(['globalPageMode', 'activeTheme'], (res) => {
                if (res.globalPageMode) document.documentElement.setAttribute('itg-global-mode', res.globalPageMode);
                if (res.activeTheme) this.shadowUI.applyTheme(res.activeTheme);
            });
            const data = await chrome.storage.sync.get(['hintsEnabled', 'videoPipEnabled', 'youtubeLoopEnabled']);
            this.hintsGloballyEnabled = data.hintsEnabled !== false;
            this.videoPipEnabled = data.videoPipEnabled !== false;
            this.youtubeLoopEnabled = data.youtubeLoopEnabled !== false;
            await this.commands.loadUserCommands();

            // * NEW: Synchronize hint letters with current commands
            this.hintEngine.updateHintChars(this.commands.getMappings());
            if (Utils.isInputLikeElement(document.activeElement)) {
                this.insertMode = true;
            }
            this._attachListeners();
            this.linkPreviewManager.init();
            const checkForVideo = () => {
                if (document.querySelector('video')) {
                    if (window.parent && window !== window.parent) {
                        window.parent.postMessage(
                            {
                                action: 'ITG_PREVIEW_HAS_VIDEO',
                            },
                            '*',
                        );
                    }
                }
            };
            this._videoCheckInterval = setInterval(checkForVideo, 1000);
            checkForVideo();
            if (this.videoPipEnabled) {
                this._injectYoutubePipButton();
                this._injectTiktokPipButton();
                this._injectGenericVideoPipButton();
            }
            if (this.youtubeLoopEnabled) {
                this._injectYoutubeLoopButton();
            }
            this._injectYoutubeInlineVolumeControl();
        }
        if (isVideoPipMode) {
            document.documentElement.style.overflow = 'hidden';
            if (document.body) {
                document.body.style.overflow = 'hidden';
                document.body.style.backgroundColor = '#000';
            }
            const style = document.createElement('style');
            style.textContent = `
                    video::-webkit-media-controls,
                    video::-webkit-media-controls-enclosure,
                    video::-webkit-media-controls-panel,
                    video::-webkit-media-controls-timeline,
                    video::-webkit-media-controls-current-time-display,
                    video::-webkit-media-controls-time-remaining-display,
                    video::-webkit-media-controls-play-button,
                    video::-webkit-media-controls-mute-button,
                    video::-webkit-media-controls-volume-slider,
                    video::-webkit-media-controls-fullscreen-button {
                        transition: opacity 0.3s ease-in-out !important;
                        pointer-events: auto !important;
                        cursor: pointer !important;
                    }
                    video[itg-hover="true"]::-webkit-media-controls,
                    video[itg-hover="true"]::-webkit-media-controls-enclosure,
                    video[itg-hover="true"]::-webkit-media-controls-panel {
                        display: flex !important;
                        opacity: 1 !important;
                        visibility: visible !important;
                        pointer-events: auto !important;
                    }
                    video[itg-hover="false"]::-webkit-media-controls,
                    video[itg-hover="false"]::-webkit-media-controls-enclosure,
                    video[itg-hover="false"]::-webkit-media-controls-panel {
                        opacity: 0 !important;
                        pointer-events: none !important;
                    }
                `;
            document.head.appendChild(style);
            let _pipVideoAttempts = 0;
            let _pipVideoResolved = false;
            let findAndMaximizeVideo = null;
            const executeMaximize = (video, delayMs = 0) => {
                console.log(`[ITG PiP Debug] executeMaximize triggered on video:`, video, `with delay: ${delayMs}ms`);
                if (_pipVideoResolved) {
                    console.log(`[ITG PiP Debug] executeMaximize: already resolved, returning`);
                    return;
                }
                _pipVideoResolved = true;
                if (findAndMaximizeVideo) {
                    console.log(`[ITG PiP Debug] executeMaximize: clearing polling interval`);
                    clearInterval(findAndMaximizeVideo);
                    findAndMaximizeVideo = null;
                }
                if (delayMs > 0) {
                    setTimeout(() => {
                        console.log(`[ITG PiP Debug] executeMaximize: calling _maximizeVideoForPip after delay`);
                        this._maximizeVideoForPip(video);
                    }, delayMs);
                } else {
                    console.log(`[ITG PiP Debug] executeMaximize: calling _maximizeVideoForPip immediately`);
                    this._maximizeVideoForPip(video);
                }
            };
            const getActiveVideo = () => {
                const videos = Array.from(document.querySelectorAll('video'));
                if (videos.length === 0) return null;
                if (videos.length === 1) return videos[0];
                const playing = videos.find((v) => !v.paused && v.currentTime > 0);
                if (playing) return playing;
                const activePlayerVideo = videos.find((v) => {
                    const player = v.closest('ytd-player');
                    if (player) {
                        return player.getAttribute('aria-hidden') !== 'true' && player.style.visibility !== 'hidden';
                    }
                    return false;
                });
                if (activePlayerVideo) return activePlayerVideo;
                const visible = videos.find((v) => {
                    const rect = v.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
                if (visible) return visible;
                return videos[0];
            };

            // Event-driven fast path: fire immediately when video is ready
            const tryAttachVideoListeners = () => {
                // Completely bypass event-driven fast path on YouTube to prevent any premature triggers
                if (window.location.hostname.includes('youtube.com')) {
                    return;
                }
                const v = getActiveVideo();
                if (!v) return;
                const onReady = () => {
                    if (document.readyState !== 'complete') return;
                    const isLive = v.duration === Infinity || !!document.querySelector('.ytp-live');
                    if (!isLive) {
                        // VOD: video is ready as soon as it can play, wait 1 second to maximize
                        executeMaximize(v, 1000);
                    }
                };
                v.addEventListener('canplay', onReady);
                v.addEventListener('playing', onReady);
                window.addEventListener('load', onReady);
                // If already ready and document is complete, fire immediately (VOD/Live only)
                if (v.readyState >= 3 && v.currentTime > 0 && document.readyState === 'complete') onReady();
            };
            tryAttachVideoListeners();
            let pipStartTime = null;
            let pipShortsReadyTime = null;
            // Polling fallback (also required for live streams to check chat readiness)
            findAndMaximizeVideo = setInterval(() => {
                if (_pipVideoResolved) {
                    if (findAndMaximizeVideo) clearInterval(findAndMaximizeVideo);
                    return;
                }
                if (document.readyState !== 'complete') return;
                if (!pipStartTime) {
                    pipStartTime = Date.now();
                    console.log(`[ITG PiP Debug] Polling loop started. pipStartTime initialized.`);
                }
                _pipVideoAttempts++;
                const video = getActiveVideo();
                if (!video || !document.body) {
                    console.log(
                        `[ITG PiP Debug] Polling tick ${_pipVideoAttempts}: No video element or document.body found.`,
                    );
                    tryAttachVideoListeners();
                    return;
                }

                // Detect live streams (duration is Infinity or .ytp-live badge present)
                const isLive = video.duration === Infinity || !!document.querySelector('.ytp-live');
                const isShort = window.location.pathname.includes('/shorts/') || !!document.querySelector('ytd-shorts');
                let isReady;
                if (isLive) {
                    // For live: wait until actively playing AND chat panel is FULLY loaded.
                    const videoPlaying = video.readyState >= 3 && video.currentTime > 0 && !video.paused;

                    // Chat panel: wait at least 2 seconds before checking if chat exists
                    const elapsedMs = Date.now() - pipStartTime;
                    let chatReady = false;
                    if (elapsedMs >= 2000) {
                        const chatContainer = document.querySelector('#chat, ytd-live-chat-frame');
                        if (!chatContainer) {
                            // Chat container does not exist after 2 seconds, assume no chat
                            chatReady = true;
                        } else {
                            const chatIframe = chatContainer.querySelector('iframe');
                            if (!chatIframe) {
                                // Chat container exists but iframe not injected yet
                                chatReady = false;
                            } else {
                                // Iframe exists — check if it has fully loaded its content
                                try {
                                    const iframeDoc = chatIframe.contentDocument || chatIframe.contentWindow?.document;
                                    // Check if the iframe document has real content (not blank)
                                    chatReady =
                                        iframeDoc &&
                                        iframeDoc.readyState === 'complete' &&
                                        iframeDoc.body &&
                                        iframeDoc.body.children.length > 0;
                                } catch {
                                    // Cross-origin: can't access contentDocument.
                                    // Fall back to checking if the iframe has a src and has had time to load.
                                    chatReady = !!chatIframe.src && chatIframe.src !== 'about:blank';
                                }
                            }
                        }
                    }
                    isReady = videoPlaying && chatReady;
                } else if (isShort) {
                    // Shorts: wait until video is ready to play, comments loaded (if open), and masthead is loaded
                    const videoPlaying = video.readyState >= 2 || (video.currentTime > 0 && !video.paused);
                    const commentsPanel = document.querySelector(
                        'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
                    );
                    const masthead = document.querySelector('ytd-masthead');
                    let commentsHidden = false;
                    let mastheadReady = false;

                    // STRICT CHECK: Ensure elements exist in DOM before assessing readiness
                    if (!masthead || !commentsPanel) {
                        isReady = false;
                    } else {
                        const commentsExpanded =
                            commentsPanel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED';
                        if (commentsExpanded) {
                            console.log(`[ITG PiP Debug] Comments panel expanded, clicking close button.`);
                            const closeBtn = commentsPanel.querySelector('#close-button, yt-icon-button, button');
                            if (closeBtn) closeBtn.click();
                        }
                        commentsHidden =
                            commentsPanel.getAttribute('visibility') !== 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' ||
                            commentsPanel.offsetWidth === 0 ||
                            commentsPanel.getBoundingClientRect().width === 0;
                        mastheadReady = masthead.classList.contains('masthead-finish');
                        isReady = videoPlaying && commentsHidden && mastheadReady;
                    }
                    console.log(
                        `[ITG PiP Debug] Polling tick ${_pipVideoAttempts} | VideoPlaying: ${videoPlaying} | Masthead: ${!!masthead} (ready: ${mastheadReady}) | CommentsPanel: ${!!commentsPanel} (hidden: ${commentsHidden}) | isReady: ${isReady} | ReadyTime: ${pipShortsReadyTime ? Date.now() - pipShortsReadyTime + 'ms ago' : 'Not started'}`,
                    );

                    // Delay execution: once everything is ready, wait 2 seconds before maximizing
                    if (isReady) {
                        if (!pipShortsReadyTime) {
                            pipShortsReadyTime = Date.now();
                            console.log(`[ITG PiP Debug] Conditions met. Starting 2-second stability delay.`);
                        }
                        if (Date.now() - pipShortsReadyTime < 2000) {
                            return;
                        }
                    } else {
                        if (pipShortsReadyTime) {
                            console.log(`[ITG PiP Debug] Conditions broken. Resetting stability delay.`);
                        }
                        pipShortsReadyTime = null;
                        return; // Not ready yet
                    }
                } else {
                    // VOD: readyState >= 2 (has current frame data) is enough.
                    isReady = video.readyState >= 2 || (video.currentTime > 0 && !video.paused);
                }

                // Fallback: 8s for VOD, 15s for Shorts, 30s for live
                const maxAttempts = isLive ? 60 : isShort ? 100 : 16;
                console.log(
                    `[ITG PiP Debug] Evaluating triggers. Attempt: ${_pipVideoAttempts}/${maxAttempts} | isReady: ${isReady}`,
                );
                if (!isReady && _pipVideoAttempts < maxAttempts) return;
                if (_pipVideoResolved) return;

                // If timed out on Shorts but DOM layout elements are still missing, do not maximize yet
                if (
                    isShort &&
                    (!document.querySelector('ytd-masthead') ||
                        !document.querySelector(
                            'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
                        ))
                ) {
                    console.log(
                        `[ITG PiP Debug] Timeout reached but ytd-masthead or commentsPanel still missing in DOM. Waiting...`,
                    );
                    return;
                }
                const delay = !isLive ? (isShort ? 0 : 1000) : 0;
                console.log(`[ITG PiP Debug] Proceeding to maximize. Delay: ${delay}ms`);
                executeMaximize(video, delay);
            }, 150); // Poll every 150ms instead of 500ms for faster readiness detection
            this._findVideoInterval = findAndMaximizeVideo;

            // Safety fallback: if not maximized after 15 seconds, force maximize now (if components are in DOM for Shorts)
            setTimeout(() => {
                if (!_pipVideoResolved) {
                    const video = getActiveVideo();
                    if (video) {
                        const isShort = window.location.pathname.includes('/shorts/');
                        console.log(`[ITG PiP Debug] 15s safety fallback triggered. isShort: ${isShort}`);
                        if (
                            !isShort ||
                            (document.querySelector('ytd-masthead') &&
                                document.querySelector(
                                    'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-comments-section"]',
                                ))
                        ) {
                            executeMaximize(video, 0);
                        }
                    }
                }
            }, 15000);
        }
        if (!isPipMode) {
            this._boundMessageHandler = (msg) => {
                if (msg.action === 'updateHintStatus') this.hintsGloballyEnabled = msg.enabled;
                if (msg.action === 'linkPreviewStatusChanged') {
                    if (this.linkPreviewManager) this.linkPreviewManager.setEnabled(msg.enabled);
                    if (this.helpModal) this.helpModal.updateLinkPreviewToggle(msg.enabled);
                }
                if (msg.action === 'linkPreviewBlacklistUpdated') {
                    if (this.linkPreviewManager) this.linkPreviewManager.setBlacklist(msg.blacklist);
                    if (this.helpModal) this.helpModal.updateLinkPreviewBlacklist(msg.blacklist);
                }
                if (msg.action === 'linkPreviewTriggerKeyUpdated') {
                    if (this.linkPreviewManager) this.linkPreviewManager.setTriggerKey(msg.triggerKey);
                    if (this.helpModal) this.helpModal.updateLinkPreviewTriggerKey(msg.triggerKey);
                }
                if (msg.action === 'hintCommandsUpdated') {
                    (async () => {
                        await this.commands.loadUserCommands();
                        this.hintEngine.updateHintChars(this.commands.getMappings());
                        // The shortcuts panel opened with `?` is a view of the same
                        // data, so a key changed from the customise page has to show
                        // up here too. Reloading the mappings alone left the open
                        // panel displaying the old key until it was closed and
                        // reopened — the other direction already worked, because the
                        // panel is what wrote the change.
                        if (this.helpModal?.visible) this.helpModal._refreshUI();
                    })();
                }
                if (msg.action === 'themeChanged') {
                    if (msg.theme) {
                        this.shadowUI.applyTheme(msg.theme);
                    } else {
                        chrome.storage.local.get(['activeTheme'], (res) => {
                            if (res.activeTheme) this.shadowUI.applyTheme(res.activeTheme);
                        });
                    }
                }
            };
            chrome.runtime.onMessage.addListener(this._boundMessageHandler);
        }

        // Handle comments and live chat close button interactions when inside the PiP iframe or its sub-frames
        const checkIsPagePip = (win) => {
            if (!win) return false;
            try {
                return (
                    win.name === 'itg-page-pip-iframe' ||
                    win.name === 'itg-pip-iframe' ||
                    (win.location &&
                        win.location.search &&
                        new URLSearchParams(win.location.search).get('itg_pip') === 'true') ||
                    (win.location && win.location.href && win.location.href.includes('itg_pip=true'))
                );
            } catch {
                try {
                    return win.name === 'itg-page-pip-iframe' || win.name === 'itg-pip-iframe';
                } catch {
                    return false;
                }
            }
        };
        const isInsidePagePip = checkIsPagePip(window) || (window.parent && checkIsPagePip(window.parent));
        if (isInsidePagePip) {
            const isSubFrame = window.parent && checkIsPagePip(window.parent) && window !== window.parent;
            if (isSubFrame) {
                // Sub-frame context (e.g. YouTube live chat iframe)
                document.addEventListener(
                    'click',
                    (e) => {
                        const path = e.composedPath();
                        const closeBtn = path.find(
                            (el) =>
                                el &&
                                (el.id === 'close-button' ||
                                    (el.getAttribute &&
                                        (el.getAttribute('aria-label') === 'Cerrar' ||
                                            el.getAttribute('aria-label') === 'Close'))),
                        );
                        if (closeBtn) {
                            console.log(
                                '[ITG PiP] Close button clicked inside sub-frame. Sending ITG_CLOSE_CHAT message to parent.',
                            );
                            window.parent.postMessage(
                                {
                                    action: 'ITG_CLOSE_CHAT',
                                },
                                '*',
                            );
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    },
                    true,
                );
            } else {
                // Main page iframe context (itg-page-pip-iframe)
                window.addEventListener('message', (e) => {
                    if (e.data && e.data.action === 'ITG_CLOSE_CHAT') {
                        console.log('[ITG PiP] Received ITG_CLOSE_CHAT message. Closing chat panel.');

                        // 1. Try to click native toggle button
                        const showHideBtn = document.querySelector(
                            '#show-hide-button button, ytd-live-chat-frame #show-hide-button, #chat-container #show-hide-button',
                        );
                        if (showHideBtn) {
                            try {
                                showHideBtn.click();
                            } catch {}
                        }

                        // 2. Direct style fallback to guarantee visibility hides
                        const chatSelectors = '#chat, #chat-container, ytd-live-chat-frame, #chatframe';
                        document.querySelectorAll(chatSelectors).forEach((el) => {
                            try {
                                el.style.setProperty('display', 'none', 'important');
                            } catch {}
                        });
                    }
                });

                // Handle comments close button clicks on the main watch page
                document.addEventListener(
                    'click',
                    (e) => {
                        const path = e.composedPath();
                        const commentsCloseBtn = path.find(
                            (el) =>
                                el &&
                                el.closest &&
                                ((el.id === 'close-button' &&
                                    el.closest('ytd-engagement-panel-section-list-renderer')) ||
                                    (el.getAttribute &&
                                        (el.getAttribute('aria-label') === 'Cerrar' ||
                                            el.getAttribute('aria-label') === 'Close') &&
                                        el.closest('ytd-engagement-panel-section-list-renderer'))),
                        );
                        if (commentsCloseBtn) {
                            console.log(
                                '[ITG PiP] Comments close button clicked on main page. Hiding engagement panel.',
                            );
                            e.preventDefault();
                            e.stopPropagation();
                            const panel = commentsCloseBtn.closest('ytd-engagement-panel-section-list-renderer');
                            if (panel) {
                                try {
                                    panel.setAttribute('visibility', 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN');
                                } catch {}
                                try {
                                    panel.style.setProperty('display', 'none', 'important');
                                } catch {}
                            }
                        }
                    },
                    true,
                );
            }
        }
    }
    _maximizeVideoForPip(video) {
        try {
            if (window.location.hostname.includes('youtube.com')) {
                const isShort = window.location.pathname.includes('/shorts/') || !!document.querySelector('ytd-shorts');
                if (isShort) {
                    this._maximizeShortsForPip(video);
                    return;
                }
                const ytPlayer =
                    video.closest('#movie_player, .html5-video-player, ytd-player, #player') ||
                    document.querySelector('#movie_player, .html5-video-player, ytd-player, #player');
                const targetElem = ytPlayer || video;

                // Aggressively suppress the live chat panel.
                // YouTube dynamically re-creates chat elements, so a one-time
                // removal is not enough. We use CSS + MutationObserver to ensure
                // the chat iframe never initializes (which triggers a player
                // layout recalculation that causes the black screen).
                const chatKillStyle = document.createElement('style');
                chatKillStyle.textContent = `
                                #chat, #chat-container, ytd-live-chat-frame,
                                yt-live-chat-renderer, #chatframe {
                                    display: none !important;
                                    width: 0 !important;
                                    height: 0 !important;
                                    visibility: hidden !important;
                                    pointer-events: none !important;
                                }
                            `;
                document.head.appendChild(chatKillStyle);

                // Remove existing chat elements
                const chatSelectors = '#chat, #chat-container, ytd-live-chat-frame, #chatframe';
                document.querySelectorAll(chatSelectors).forEach((el) => {
                    try {
                        el.remove();
                    } catch {}
                });

                // Watch for YouTube re-injecting chat elements and remove them
                const chatObserver = new MutationObserver((mutations) => {
                    for (const m of mutations) {
                        for (const node of m.addedNodes) {
                            if (node.nodeType === 1) {
                                if (node.matches && node.matches(chatSelectors)) {
                                    try {
                                        node.remove();
                                    } catch {}
                                }
                                // Also check children
                                const inner = node.querySelectorAll ? node.querySelectorAll(chatSelectors) : [];
                                inner.forEach((el) => {
                                    try {
                                        el.remove();
                                    } catch {}
                                });
                            }
                        }
                    }
                });
                chatObserver.observe(document.documentElement, {
                    childList: true,
                    subtree: true,
                });

                // Move player to body root for clean fullscreen overlay
                document.body.appendChild(targetElem);
                targetElem.style.position = 'fixed';
                targetElem.style.top = '0';
                targetElem.style.left = '0';
                targetElem.style.width = '100vw';
                targetElem.style.height = '100vh';
                targetElem.style.zIndex = '2147483647';
                targetElem.style.backgroundColor = '#000';
                targetElem.style.margin = '0';
                targetElem.style.padding = '0';
                targetElem.style.pointerEvents = 'auto';
                video.style.width = '100%';
                video.style.height = '100%';
                video.style.left = '0';
                video.style.top = '0';
                video.style.pointerEvents = 'auto';

                // Hide other body children
                Array.from(document.body.children).forEach((child) => {
                    if (child !== targetElem && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
                        child.style.display = 'none';
                    }
                });

                // Tell YouTube to recalculate player dimensions
                // after the reparent (fixes left black band)
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                }, 200);
                setTimeout(() => {
                    window.dispatchEvent(new Event('resize'));
                }, 800);
            } else {
                document.body.appendChild(video);
                video.style.position = 'fixed';
                video.style.top = '0';
                video.style.left = '0';
                video.style.width = '100vw';
                video.style.height = '100vh';
                video.style.zIndex = '2147483647';
                video.style.backgroundColor = '#000';
                video.style.objectFit = 'contain';
                video.style.margin = '0';
                video.style.padding = '0';
                video.style.pointerEvents = 'auto';
                video.controls = true;
                video.setAttribute('itg-hover', 'true');
                let hoverTimeout;
                const handleHover = () => {
                    try {
                        if (document.activeElement !== video) video.focus();
                    } catch {}
                    video.setAttribute('itg-hover', 'true');
                    clearTimeout(hoverTimeout);
                    hoverTimeout = setTimeout(() => {
                        if (!video.paused) {
                            video.setAttribute('itg-hover', 'false');
                        }
                    }, 2500);
                };
                window.addEventListener('mousemove', handleHover, true);
                video.addEventListener('mousemove', handleHover, true);
                video.addEventListener('play', handleHover, true);
                video.addEventListener('pause', handleHover, true);

                // YouTube's own player handles click-to-play/pause natively on its player overlay.
                // Adding our own click listener on YouTube elements causes double-toggle (instant pause on click).
                if (!window.location.hostname.includes('youtube.com')) {
                    video.addEventListener('click', (e) => {
                        const rect = video.getBoundingClientRect();
                        const clickY = e.clientY - rect.top;
                        if (clickY < rect.height * 0.8) {
                            if (video.paused) video.play();
                            else video.pause();
                        }
                    });
                }
                video.play().catch((e) => console.log('Autoplay bloqueado por el navegador'));
                Array.from(document.body.children).forEach((child) => {
                    if (child !== video && child.tagName !== 'SCRIPT' && child.tagName !== 'STYLE') {
                        child.style.display = 'none';
                    }
                });
            }
        } catch (err) {
            console.warn('Error maximizing video in PiP:', err);
        }
    }
    _maximizeShortsForPip(video) {
        console.log(`[ITG PiP Debug] _maximizeShortsForPip called with video:`, video);
        try {
            if (document.body.classList.contains('itg-pip-shorts')) {
                console.log(`[ITG PiP Debug] _maximizeShortsForPip: already has itg-pip-shorts class, returning`);
                return;
            }

            // 1. Hide the header/masthead immediately
            document.body.classList.add('itg-hide-masthead');

            // Inject full-screen layout styles for Shorts feed keeping controls
            if (!document.getElementById('itg-pip-shorts-styles')) {
                const style = document.createElement('style');
                style.id = 'itg-pip-shorts-styles';
                style.textContent = `
                        /* 1. Hide header, guide sidebar, and panels immediately */
                        body.itg-hide-masthead ytd-masthead,
                        body.itg-hide-masthead #masthead-container,
                        body.itg-hide-masthead ytd-mini-guide-renderer,
                        body.itg-hide-masthead ytd-guide-renderer,
                        body.itg-hide-masthead #guide,
                        body.itg-pip-shorts ytd-engagement-panel-section-list-renderer,
                        body.itg-pip-shorts #watch-metadata,
                        body.itg-pip-shorts #panels {
                            display: none !important;
                            opacity: 0 !important;
                            visibility: hidden !important;
                            height: 0 !important;
                            width: 0 !important;
                        }

                        /* 2. Full-screen layout styles */
                        body.itg-pip-shorts,
                        body.itg-pip-shorts ytd-app,
                        body.itg-pip-shorts #content,
                        body.itg-pip-shorts #page-manager,
                        body.itg-pip-shorts ytd-shorts,
                        body.itg-pip-shorts #shorts-container {
                            background-color: #000 !important;
                            background: #000 !important;
                        }

                        body.itg-pip-shorts ytd-page-manager,
                        body.itg-pip-shorts ytd-app,
                        body.itg-pip-shorts #content,
                        body.itg-pip-shorts #page-manager {
                            margin: 0 !important;
                            padding: 0 !important;
                            width: 100vw !important;
                            height: 100vh !important;
                        }

                        body.itg-pip-shorts ytd-shorts,
                        body.itg-pip-shorts #shorts-container {
                            width: 100vw !important;
                            height: 100vh !important;
                            margin: 0 !important;
                            padding: 0 !important;
                            overflow-y: scroll !important;
                            scrollbar-width: none !important;
                        }
                        body.itg-pip-shorts ytd-shorts::-webkit-scrollbar,
                        body.itg-pip-shorts #shorts-container::-webkit-scrollbar {
                            display: none !important;
                        }

                        body.itg-pip-shorts .reel-video-in-sequence-new {
                            margin: 0 auto !important;
                        }

                        /* Force horizontal centering of player and video tag to override YouTube's inline offsets */
                        body.itg-pip-shorts .video-stream.html5-main-video,
                        body.itg-pip-shorts .html5-video-player,
                        body.itg-pip-shorts ytd-player,
                        body.itg-pip-shorts #player-container {
                            left: 0 !important;
                            right: 0 !important;
                            margin: 0 auto !important;
                        }

                        body.itg-pip-shorts #cinematic-container,
                        body.itg-pip-shorts .cinematic-container,
                        body.itg-pip-shorts #cinematic-shorts-scrim,
                        body.itg-pip-shorts .pip-blur-filter,
                        body.itg-pip-shorts .reel-video-in-sequence-thumbnail {
                            display: none !important;
                            opacity: 0 !important;
                            visibility: hidden !important;
                        }

                        body.itg-pip-shorts ytd-reel-player-overlay-renderer,
                        body.itg-pip-shorts .player-controls,
                        body.itg-pip-shorts #scrubber {
                            opacity: 0 !important;
                            transition: opacity 0.25s ease !important;
                            pointer-events: none !important;
                        }

                        body.itg-pip-shorts .reel-video-in-sequence-new:hover ytd-reel-player-overlay-renderer,
                        body.itg-pip-shorts .reel-video-in-sequence-new:hover .player-controls,
                        body.itg-pip-shorts .reel-video-in-sequence-new:hover #scrubber {
                            opacity: 1 !important;
                            pointer-events: auto !important;
                        }
                    `;
                document.head.appendChild(style);
            }

            // 2. Enter full screen immediately to trigger correct layout reflow
            const proceedToFullscreen = () => {
                console.log(`[ITG PiP Debug] proceedToFullscreen: adding itg-pip-shorts to body`);
                document.body.classList.add('itg-pip-shorts');
                // Reset scroll position to target active card, avoiding off-screen misalignment
                const card = video.closest('.reel-video-in-sequence-new');
                if (card) {
                    console.log(`[ITG PiP Debug] proceedToFullscreen: scrolling active card into view`);
                    card.scrollIntoView({
                        behavior: 'auto',
                        block: 'start',
                    });
                } else {
                    console.log(`[ITG PiP Debug] proceedToFullscreen: active card container NOT found`);
                }
                // Dispatch multiple resize events with progressive delays to force YouTube's player
                // layout handler to recalculate coordinates on the newly cleaned layout context.
                console.log(`[ITG PiP Debug] proceedToFullscreen: dispatching progressive resize events`);
                window.dispatchEvent(new Event('resize'));
                setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 150);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 400);
                setTimeout(() => window.dispatchEvent(new Event('resize')), 1000);
            };
            proceedToFullscreen();
            const setupAutoAdvance = (v) => {
                // Always disable native loop attribute to allow ended event to fire
                if (v.loop) {
                    v.loop = false;
                }
                if (v.hasAttribute('loop')) {
                    v.removeAttribute('loop');
                }
                if (v.hasAttribute('itg-auto-advance-setup')) return;
                v.setAttribute('itg-auto-advance-setup', 'true');
                const onEnded = () => {
                    const currentShort = v.closest('.reel-video-in-sequence-new');
                    let scrolled = false;
                    if (currentShort) {
                        const nextShort = currentShort.nextElementSibling;
                        if (nextShort && nextShort.classList.contains('reel-video-in-sequence-new')) {
                            nextShort.scrollIntoView({
                                behavior: 'smooth',
                                block: 'start',
                            });
                            scrolled = true;
                        }
                    }
                    if (!scrolled) {
                        const container =
                            document.getElementById('shorts-container') || document.querySelector('ytd-shorts');
                        if (container) {
                            container.scrollBy({
                                top: container.clientHeight || window.innerHeight,
                                behavior: 'smooth',
                            });
                        }
                    }
                };
                v.addEventListener('ended', onEnded);

                // Fallback using timeupdate for video end transition
                v.addEventListener('timeupdate', () => {
                    if (v.loop) {
                        v.loop = false;
                    }
                    if (v.hasAttribute('loop')) {
                        v.removeAttribute('loop');
                    }
                    if (v.duration && v.currentTime && v.duration - v.currentTime < 0.25) {
                        if (!v.hasAttribute('itg-transitioning')) {
                            v.setAttribute('itg-transitioning', 'true');
                            onEnded();
                            setTimeout(() => {
                                v.removeAttribute('itg-transitioning');
                            }, 2000);
                        }
                    }
                });
            };

            // Setup the initially playing video
            setupAutoAdvance(video);
            const getActiveVideo = () => {
                const videos = Array.from(document.querySelectorAll('video'));
                if (videos.length === 0) return null;
                if (videos.length === 1) return videos[0];
                const playing = videos.find((v) => !v.paused && v.currentTime > 0);
                if (playing) return playing;
                const activePlayerVideo = videos.find((v) => {
                    const player = v.closest('ytd-player');
                    if (player) {
                        return player.getAttribute('aria-hidden') !== 'true' && player.style.visibility !== 'hidden';
                    }
                    return false;
                });
                if (activePlayerVideo) return activePlayerVideo;
                const visible = videos.find((v) => {
                    const rect = v.getBoundingClientRect();
                    return rect.width > 0 && rect.height > 0;
                });
                if (visible) return visible;
                return videos[0];
            };

            // Keep checking periodically for video changes during scrolls / auto-advances
            this._shortsCheckInterval = setInterval(() => {
                const activeVideo = getActiveVideo();
                if (activeVideo) {
                    setupAutoAdvance(activeVideo);
                }
            }, 500);
        } catch (err) {
            console.warn('Error in _maximizeShortsForPip:', err);
        }
    }
    _attachListeners() {
        this._boundFocusInHandler = (e) => {
            if (!chrome.runtime || !chrome.runtime.id) {
                this.cleanup();
                return;
            }
            const target = (e.composedPath && e.composedPath()[0]) || e.target;
            if (Utils.isInputLikeElement(target)) this.insertMode = true;
        };
        this._boundFocusOutHandler = (e) => {
            if (!chrome.runtime || !chrome.runtime.id) {
                this.cleanup();
                return;
            }
            const target = (e.composedPath && e.composedPath()[0]) || e.target;
            if (Utils.isInputLikeElement(target)) this.insertMode = false;
        };
        this._boundMainKeyDownHandler = (e) => this._handleKeyDown(e);
        this._boundMainKeyUpHandler = (e) => this._handleKeyUp(e);
        document.addEventListener('focusin', this._boundFocusInHandler);
        document.addEventListener('focusout', this._boundFocusOutHandler);
        document.addEventListener('keydown', this._boundMainKeyDownHandler, true);
        document.addEventListener('keyup', this._boundMainKeyUpHandler, true);
    }
    _handleKeyUp(event) {
        if (event.key === 'Alt') {
            this._isAltHeld = false;
            if (this._altSequenceTimer) clearTimeout(this._altSequenceTimer);
            this._altSequenceTimer = setTimeout(() => {
                this._altSequenceBuffer = '';
            }, 1500);
        }
    }
    _injectYoutubePipButton() {
        if (itgIsInsidePipWindow()) return;
        if (this.videoPipEnabled === false) return;
        if (!window.location.hostname.includes('youtube.com')) return;
        const pipTitle =
            (typeof itgPipMsg === 'function'
                ? itgPipMsg('omnibarPrefixVideoPipTitle', 'Picture-in-Picture (Video)')
                : null) ||
            chrome.i18n.getMessage('omnibarPrefixVideoPipTitle') ||
            'Picture-in-Picture (Video)';
        // The old glyph was the screen-share one (a screen with an arrow beside it),
        // which reads as "cast", not picture-in-picture. ITG_PIP_ICON is the frame
        // with the inset screen every player uses for this, and it is the same icon
        // in the Shorts button, the TikTok button and the generic overlay.
        const videoSvgIcon = ITG_PIP_ICON;
        const handlePipClick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            if (typeof window.ItgVideoPip?.open === 'function') {
                window.ItgVideoPip.open();
            } else if (typeof window.__itgOpenVideoPip === 'function') {
                window.__itgOpenVideoPip();
            } else {
                console.warn('ItgVideoPip is not available.');
            }
        };

        // --- Regular YouTube player button ---
        const addPlayerButton = () => {
            if (document.getElementById('itg-yt-pip-button')) return;
            const rightControls = document.querySelector('.ytp-right-controls');
            if (!rightControls) return;
            const btn = document.createElement('button');
            btn.id = 'itg-yt-pip-button';
            btn.className = 'ytp-button';
            btn.setAttribute('title', pipTitle);
            btn.setAttribute('aria-label', pipTitle);
            btn.innerHTML = ITG_PIP_ICON_YTP;
            btn.addEventListener('click', handlePipClick);
            itgAttachAutoPipMenu(btn);
            const fullscreenButton = document.querySelector('.ytp-fullscreen-button');
            if (fullscreenButton && fullscreenButton.parentNode) {
                fullscreenButton.parentNode.insertBefore(btn, fullscreenButton);
            } else {
                const rightControlsRight = document.querySelector('.ytp-right-controls-right') || rightControls;
                rightControlsRight.appendChild(btn);
            }
        };

        // --- YouTube Shorts button ---
        const addShortsButton = () => {
            if (document.getElementById('itg-yt-shorts-pip-button')) return;
            const shortsRightControls = document.querySelector('ytd-shorts-player-controls #right-controls');
            if (!shortsRightControls) return;
            const fullscreenShape = shortsRightControls.querySelector('#fullscreen-button-shape');
            if (!fullscreenShape) return;
            const wrapper = document.createElement('div');
            wrapper.id = 'itg-yt-shorts-pip-button';
            wrapper.style.cssText =
                'display: flex; align-items: center; justify-content: center; position: relative; z-index: 2147483647; pointer-events: auto;';
            const btn = document.createElement('button');
            btn.className =
                'ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextOverlayDark ytSpecButtonShapeNextSizeL ytSpecButtonShapeNextIconButton';
            btn.setAttribute('title', pipTitle);
            btn.setAttribute('aria-label', pipTitle);
            btn.style.cssText =
                'color: rgb(255, 255, 255); background-color: transparent; position: relative; z-index: 2147483647; pointer-events: auto; cursor: pointer;';
            btn.innerHTML = `
                    <div aria-hidden="true" class="ytSpecButtonShapeNextIcon">
                        <span class="ytIconWrapperHost" style="width: 24px; height: 24px;">
                            <span class="yt-icon-shape ytSpecIconShapeHost">
                                <div style="width: 100%; height: 100%; display: block; filter: drop-shadow(0px 1px 4px rgba(0, 0, 0, 0.3)); fill: currentcolor;">
                                    ${videoSvgIcon}
                                </div>
                            </span>
                        </span>
                    </div>
                `;
            btn.addEventListener('click', handlePipClick);
            itgAttachAutoPipMenu(btn);
            wrapper.appendChild(btn);
            shortsRightControls.insertBefore(wrapper, fullscreenShape);
        };
        const addAllButtons = () => {
            if (this.videoPipEnabled === false) return;
            addPlayerButton();
            addShortsButton();
        };
        if (this._ytPipObserver) {
            this._ytPipObserver.disconnect();
            this._ytPipObserver = null;
        }
        addAllButtons();
        this._ytPipObserver = new MutationObserver(() => {
            if (this.videoPipEnabled === false) return;
            addAllButtons();
        });
        this._ytPipObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    _injectYoutubeLoopButton() {
        if (itgIsInsidePipWindow()) return;
        if (this.youtubeLoopEnabled === false) return;
        if (!window.location.hostname.includes('youtube.com')) return;

        const loopTitle =
            (typeof itgPipMsg === 'function' ? itgPipMsg('pipLoop', 'Loop video') : null) ||
            chrome.i18n.getMessage('pipLoop') ||
            'Loop video';

        const updateLoopVisual = (state) => {
            const isLooping = state
                ? !!state.isLooping
                : typeof itgVideoLoop !== 'undefined'
                  ? itgVideoLoop.isLooping
                  : false;
            const btn = document.getElementById('itg-yt-loop-button');
            if (btn) {
                btn.style.color = isLooping ? 'var(--interactive-color, #ff4444)' : '#fff';
                btn.classList.toggle('ytp-loop-active', isLooping);
                btn.setAttribute('aria-pressed', String(isLooping));
            }
            const shortsBtn = document.getElementById('itg-yt-shorts-loop-button');
            if (shortsBtn) {
                shortsBtn.style.color = isLooping ? 'var(--interactive-color, #ff4444)' : '#fff';
                shortsBtn.classList.toggle('ytp-loop-active', isLooping);
                shortsBtn.setAttribute('aria-pressed', String(isLooping));
            }
        };

        if (typeof itgVideoLoop !== 'undefined') {
            itgVideoLoop.subscribe((state) => {
                updateLoopVisual(state);
            });
        }

        // --- Regular YouTube player loop button ---
        const addLoopButton = () => {
            const video = document.querySelector('video');
            if (video && typeof itgVideoLoop !== 'undefined') {
                itgVideoLoop.attachVideo(video);
            }

            if (document.getElementById('itg-yt-loop-button')) return;
            const rightControls = document.querySelector('.ytp-right-controls');
            if (!rightControls) return;

            const btn = document.createElement('button');
            btn.id = 'itg-yt-loop-button';
            btn.className = 'ytp-button';
            btn.setAttribute('title', loopTitle);
            btn.setAttribute('aria-label', loopTitle);
            btn.innerHTML = ITG_LOOP_ICON_YTP;
            btn.style.color = '#fff';

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (typeof itgVideoLoop !== 'undefined') {
                    itgVideoLoop.toggleLoop();
                }
            });

            if (typeof itgAttachLoopMenu === 'function') {
                itgAttachLoopMenu(btn);
            }

            updateLoopVisual();

            // Place to the left of the cast-to-TV button; fall back to before PiP
            const castButton = rightControls.querySelector('.ytp-remote-button, .ytp-miniplayer-button');
            const pipButton = document.getElementById('itg-yt-pip-button');
            const refButton = castButton || pipButton;
            if (refButton && refButton.parentNode) {
                refButton.parentNode.insertBefore(btn, refButton);
            } else {
                rightControls.appendChild(btn);
            }
        };

        // --- YouTube Shorts loop button ---
        const addShortsLoopButton = () => {
            if (document.getElementById('itg-yt-shorts-loop-button')) return;
            const shortsRightControls = document.querySelector('ytd-shorts-player-controls #right-controls');
            if (!shortsRightControls) return;
            const fullscreenShape = shortsRightControls.querySelector('#fullscreen-button-shape');
            if (!fullscreenShape) return;

            const wrapper = document.createElement('div');
            wrapper.id = 'itg-yt-shorts-loop-wrapper';
            wrapper.style.cssText =
                'display: flex; align-items: center; justify-content: center; position: relative; z-index: 2147483647; pointer-events: auto;';
            const btn = document.createElement('button');
            btn.id = 'itg-yt-shorts-loop-button';
            btn.className =
                'ytSpecButtonShapeNextHost ytSpecButtonShapeNextTonal ytSpecButtonShapeNextOverlayDark ytSpecButtonShapeNextSizeL ytSpecButtonShapeNextIconButton';
            btn.setAttribute('title', loopTitle);
            btn.setAttribute('aria-label', loopTitle);
            btn.style.cssText =
                'color: rgb(255, 255, 255); background-color: transparent; position: relative; z-index: 2147483647; pointer-events: auto; cursor: pointer;';
            btn.innerHTML = `
                    <div aria-hidden="true" class="ytSpecButtonShapeNextIcon">
                        <span class="ytIconWrapperHost" style="width: 24px; height: 24px;">
                            <span class="yt-icon-shape ytSpecIconShapeHost">
                                <div style="width: 100%; height: 100%; display: block; filter: drop-shadow(0px 1px 4px rgba(0, 0, 0, 0.3)); fill: currentcolor;">
                                    ${ITG_LOOP_ICON_YTP}
                                </div>
                            </span>
                        </span>
                    </div>
                `;

            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                if (typeof itgVideoLoop !== 'undefined') {
                    itgVideoLoop.toggleLoop();
                }
            });

            if (typeof itgAttachLoopMenu === 'function') {
                itgAttachLoopMenu(btn);
            }

            wrapper.appendChild(btn);
            const pipWrapper = document.getElementById('itg-yt-shorts-pip-button');
            const targetBefore = pipWrapper || fullscreenShape;
            shortsRightControls.insertBefore(wrapper, targetBefore);
            updateLoopVisual();
        };

        const addAllLoopButtons = () => {
            if (this.youtubeLoopEnabled === false) return;
            addLoopButton();
            addShortsLoopButton();
        };

        if (this._ytLoopObserver) {
            this._ytLoopObserver.disconnect();
            this._ytLoopObserver = null;
        }
        addAllLoopButtons();
        this._ytLoopObserver = new MutationObserver(() => {
            if (this.youtubeLoopEnabled === false) return;
            addAllLoopButtons();
        });
        this._ytLoopObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }

    _injectYoutubeInlineVolumeControl() {
        if (itgIsInsidePipWindow()) return;
        if (!window.location.hostname.includes('youtube.com')) return;
        if (this._ytInlineVolumeBound) return;
        this._ytInlineVolumeBound = true;

        if (!document.getElementById('itg-yt-inline-volume-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'itg-yt-inline-volume-styles';
            styleEl.textContent = typeof ITG_INLINE_VOLUME_STYLES !== 'undefined' ? ITG_INLINE_VOLUME_STYLES : '';
            (document.head || document.documentElement).appendChild(styleEl);
        }

        // YouTube keeps a single hover preview (`ytd-video-preview`) parked at the root of
        // `ytd-app` and moves it over whichever card the pointer is on. It never lives inside
        // the card, so the only trustworthy way to know whether the preview belongs to a Short
        // is to look at the card under the pointer, not at the player.
        const SHORT_CARD =
            'ytm-shorts-lockup-view-model-v2, ytm-shorts-lockup-view-model, ytd-reel-item-renderer, ytd-rich-grid-slim-media';
        const ANY_CARD =
            SHORT_CARD +
            ', ytd-rich-item-renderer, ytd-video-renderer, ytd-grid-video-renderer, ytd-compact-video-renderer, ytd-playlist-video-renderer, ytd-rich-grid-media';
        // Everything YouTube paints on top of the hovered card: while the pointer is in there
        // it is still hovering the same card.
        const PREVIEW_OVERLAY =
            'ytd-video-preview, ytd-video-preview-loader, .ytdVideoPreviewLoaderVideoPreviewContainer, #inline-preview-player, .itg-yt-short-volume-btn';

        const isFeedPage = () => {
            const path = window.location.pathname || '';
            return !path.startsWith('/watch') && !path.startsWith('/shorts');
        };

        const isShortCard = (card) =>
            !!card &&
            (card.matches(SHORT_CARD) ||
                !!card.querySelector(SHORT_CARD + ', a[href^="/shorts/"], a.reel-item-endpoint'));

        // The hover preview player, and nothing else: never `movie_player`, never the real
        // Shorts player, never a channel trailer.
        const getPreviewPlayer = () => document.querySelector('ytd-video-preview #inline-preview-player');

        // YouTube fades the preview in only once it really starts, and fades it back out when it
        // stops. Hanging the button there outside that window left an invisible control on top
        // of the thumbnail that ate the click instead of opening the Short.
        let lastOnScreen = 0;
        const isPreviewOnScreen = () => {
            const preview = document.querySelector('ytd-video-preview');
            if (!preview) return false;
            const rect = preview.getBoundingClientRect();
            if (rect.width < 40 || rect.height < 40) return false;
            if (parseFloat(getComputedStyle(preview).opacity || '0') <= 0.5) return false;
            lastOnScreen = Date.now();
            return true;
        };

        // The volume the user actually chose on YouTube. Forcing 100 made every Short shout
        // over whatever was playing.
        const getUserVolume = () => {
            const mainPlayer = document.getElementById('movie_player');
            if (mainPlayer && typeof mainPlayer.getVolume === 'function') {
                try {
                    const volume = mainPlayer.getVolume();
                    if (typeof volume === 'number' && volume > 0) return volume;
                } catch {}
            }
            try {
                const entry = JSON.parse(localStorage.getItem('yt-player-volume') || 'null');
                const data = entry && entry.data ? JSON.parse(entry.data) : null;
                if (data && typeof data.volume === 'number' && data.volume > 0) return data.volume;
            } catch {}
            return 100;
        };

        // What the user asked for. It survives moving from one Short to the next, but it is
        // only ever applied to the preview of a Short.
        let soundOn = false;
        let hoveredCard = null;

        const hasSound = () => {
            const player = getPreviewPlayer();
            const video = player && player.querySelector('video');
            if (!video) return soundOn;
            return !video.muted && video.volume > 0;
        };

        // The button is on screen exactly while the preview belongs to a hovered Short, so its
        // presence is the condition for touching the audio at all: no button, no sound.
        const wantsSound = () => soundOn && !!document.querySelector('.itg-yt-short-volume-btn');

        // The preview's mute state belongs to YouTube's player, whose API is a page property
        // on the element and therefore invisible from here (see youtubePreviewAudioHook.js).
        // The hook in the page's own context does the actual call; writing `video.muted` from
        // this side only wins the first round, because the player still believes the preview
        // is muted and puts that back. Nothing is muted that this control did not unmute
        // itself, so every other preview is left exactly as YouTube wants it.
        let weUnmuted = false;
        let hookAnswered = false;

        window.addEventListener('message', (event) => {
            if (event.source === window && event.data && event.data.__itgYtPreviewAudio === 'applied') {
                hookAnswered = true;
            }
        });

        const applySound = () => {
            const player = getPreviewPlayer();
            if (!player) return;
            const wantSound = wantsSound();
            if (!wantSound && !weUnmuted) return;

            window.postMessage(
                {
                    __itgYtPreviewAudio: 'apply',
                    sound: wantSound,
                    volume: wantSound ? getUserVolume() : null,
                },
                '*',
            );
            weUnmuted = wantSound;

            // If the page-side hook never answers, do what this control used to do rather than
            // leave the button dead.
            setTimeout(() => {
                if (hookAnswered) return;
                const video = getPreviewPlayer()?.querySelector('video');
                if (video && video.muted === wantSound) video.muted = !wantSound;
            }, 300);
        };

        // YouTube re-applies its "previews are muted" rule whenever the Short loops, stalls or
        // the player changes state, and it does it several times in a row. Answering each of
        // those events turns into a write-for-write fight, so the choice is re-stated on a slow
        // beat instead, and only while the pointer is still on the Short.
        let holdTimer = 0;
        const holdSound = () => {
            clearInterval(holdTimer);
            holdTimer = setInterval(() => {
                if (!soundOn || !hoveredCard) {
                    clearInterval(holdTimer);
                    holdTimer = 0;
                    return;
                }
                const player = getPreviewPlayer();
                const video = player && player.querySelector('video');
                if (video && video.muted && wantsSound()) applySound();
            }, 300);
        };

        const getMsg = (key, fallback) => {
            return (
                (typeof itgPipMsg === 'function' ? itgPipMsg(key, fallback) : null) ||
                chrome.i18n.getMessage(key) ||
                fallback
            );
        };
        const iconMarkup = (label, path) =>
            `<span class="ytIconWrapperHost ytdVolumeControlsMuteIcon" role="img" aria-label="${label}"><span class="yt-icon-shape ytSpecIconShapeHost"><div class="itg-yt-spec-icon-wrapper" style="width: 100%; height: 100%; display: block; fill: currentcolor;"><svg xmlns="http://www.w3.org/2000/svg" height="24" viewBox="0 0 24 24" width="24" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="${path}"></path></svg></div></span></span>`;
        const PATH_MUTED =
            'M12.493 2.13a1 1 0 00-1.008.013L3.913 6.686A6 6 0 001 11.83v.338a6 6 0 002.913 5.145l7.573 4.544A1 1 0 0013 21V3a1 1 0 00-.507-.87Zm3.214 7.577a1 1 0 011.414 0l1.379 1.379 1.379-1.379a1 1 0 111.414 1.414l-1.379 1.379 1.379 1.379a1 1 0 01-1.414 1.414l-1.379-1.379-1.379 1.379a1 1 0 01-1.414-1.414l1.379-1.379-1.379-1.379a1 1 0 010-1.414Z';
        const PATH_UNMUTED =
            'M12.493 2.13a1 1 0 00-1.008.013L3.913 6.686A6 6 0 001 11.83v.338a6 6 0 002.913 5.145l7.573 4.544A1 1 0 0013 21V3a1 1 0 00-.507-.87Zm3.043 4.92a1 1 0 000 1.414 5.001 5.001 0 010 7.072 1 1 0 101.414 1.414 6.999 6.999 0 000-9.9 1 1 0 00-1.414 0Z';

        const updateButton = (button) => {
            const sound = hasSound();
            const state = sound ? 'on' : 'off';
            const title = sound ? getMsg('pipMute', 'Silenciar') : getMsg('pipUnmute', 'Activar sonido');
            button.setAttribute('title', title);
            button.setAttribute('aria-label', title);
            button.setAttribute('aria-pressed', sound ? 'true' : 'false');
            if (button.dataset.itgSoundState === state) return;
            button.dataset.itgSoundState = state;
            button.innerHTML = sound ? iconMarkup(title, PATH_UNMUTED) : iconMarkup(title, PATH_MUTED);
        };

        const createButton = () => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ytdVolumeControlsMuteIconButton itg-yt-short-volume-btn';
            button.setAttribute('data-itg-short-volume', 'true');

            // The preview sits inside YouTube's own link to the video, so every pointer event
            // has to die on the button or the click opens the Short.
            const swallow = (event) => {
                event.preventDefault();
                event.stopPropagation();
                event.stopImmediatePropagation();
            };
            for (const type of [
                'pointerdown',
                'mousedown',
                'mouseup',
                'pointerup',
                'dblclick',
                'auxclick',
                'contextmenu',
                'dragstart',
            ]) {
                button.addEventListener(type, swallow, true);
            }
            button.addEventListener(
                'click',
                (event) => {
                    swallow(event);
                    soundOn = !hasSound();
                    applySound();
                    if (soundOn) holdSound();
                    updateButton(button);
                },
                true,
            );
            return button;
        };

        // Where the button belongs, in one place. It waits for the preview to be painted the
        // first time (otherwise it would be an invisible control on top of the thumbnail), and
        // then stays put while the same Short is hovered, so a loop restart does not make it
        // blink. Anything found anywhere else is a leftover -- an older preview, or the real
        // Shorts player the SPA keeps alive -- and is removed.
        let attachedHost = null;

        const desiredHost = () => {
            if (!isFeedPage() || !hoveredCard) return null;
            const player = getPreviewPlayer();
            const host = player ? player.closest('ytd-video-preview') : null;
            if (!host) return null;
            if (isPreviewOnScreen()) return host;
            // A short gap while the preview repositions or the Short loops should not make the
            // button blink, but a preview that is really gone has to take the button with it.
            return host === attachedHost && Date.now() - lastOnScreen < 700 ? host : null;
        };

        const sync = () => {
            const host = desiredHost();
            attachedHost = host;

            for (const stale of document.querySelectorAll('.itg-yt-short-volume-btn, [data-itg-short-volume="true"]')) {
                if (stale.parentElement !== host) stale.remove();
            }
            if (host && !host.querySelector(':scope > .itg-yt-short-volume-btn')) {
                if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
                host.appendChild(createButton());
            }
            const button = host ? host.querySelector(':scope > .itg-yt-short-volume-btn') : null;
            if (button) updateButton(button);
            if (isFeedPage()) applySound();
        };

        // The preview shows up (and moves, and restarts) without any event of its own, so while
        // a Short is hovered keep checking where the button belongs. It stops as soon as the
        // pointer leaves the card.
        let watchToken = 0;
        const watchForPreview = () => {
            const token = ++watchToken;
            const tick = () => {
                if (token !== watchToken || !hoveredCard) return;
                const button = document.querySelector('.itg-yt-short-volume-btn');
                if ((button ? button.parentElement : null) !== desiredHost()) sync();
                setTimeout(tick, 200);
            };
            tick();
        };

        const setHoveredCard = (card) => {
            if (card === hoveredCard) return;
            hoveredCard = card;
            // Each new card has to earn the button again: the preview has to be painted over
            // it before the control appears.
            attachedHost = null;
            sync();
            if (hoveredCard) {
                watchForPreview();
                if (soundOn) holdSound();
            } else {
                watchToken++;
            }
        };

        // The preview is painted on top of the card, so `event.target` is the preview as soon
        // as it shows up. The card has to be looked up underneath it, or moving from one Short
        // to the next goes unnoticed.
        const cardUnderPointer = (x, y) => {
            for (const element of document.elementsFromPoint(x, y)) {
                if (element.closest && element.closest(PREVIEW_OVERLAY)) continue;
                const card = element.closest && element.closest(ANY_CARD);
                if (card) return card;
            }
            return null;
        };

        document.addEventListener(
            'pointerover',
            (event) => {
                if (!(event.target instanceof Element)) return;
                if (!isFeedPage()) {
                    setHoveredCard(null);
                    return;
                }
                const card = cardUnderPointer(event.clientX, event.clientY);
                setHoveredCard(isShortCard(card) ? card : null);
            },
            true,
        );

        document.documentElement.addEventListener('pointerleave', () => setHoveredCard(null));

        // Shorts previews loop, and YouTube re-applies its own muted state on every restart.
        document.addEventListener(
            'play',
            (event) => {
                if (!hoveredCard || !isFeedPage()) return;
                const player = getPreviewPlayer();
                if (!player || !(event.target instanceof HTMLVideoElement) || !player.contains(event.target)) return;
                applySound();
                sync();
            },
            true,
        );

        document.addEventListener(
            'volumechange',
            (event) => {
                const player = getPreviewPlayer();
                if (!player || !(event.target instanceof HTMLVideoElement) || !player.contains(event.target)) return;
                const button = document.querySelector('.itg-yt-short-volume-btn');
                if (button) updateButton(button);
            },
            true,
        );

        const onNavigate = () => setHoveredCard(null);
        window.addEventListener('yt-navigate-start', onNavigate);
        window.addEventListener('yt-navigate-finish', onNavigate);
        window.addEventListener('popstate', onNavigate);

        sync();
    }

    _injectTiktokPipButton() {
        if (itgIsInsidePipWindow()) return;
        if (this.videoPipEnabled === false) return;
        if (!window.location.hostname.includes('tiktok.com')) return;
        if (!document.getElementById('itg-tiktok-pip-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'itg-tiktok-pip-styles';
            styleEl.textContent = `
                    /* Hide TikTok's native picture-in-picture controls by default */
                    div[class*="DivPlayerContainer"] div[class*="DivBottom"],
                    div[class*="DivPlayerContainer"] div[class*="DivButtonContainer"],
                    div[class*="DivPlayerContainer"] div[class*="ControlMask"] {
                        opacity: 0 !important;
                        visibility: hidden !important;
                        transition: opacity 0.25s ease-in-out, visibility 0.25s ease-in-out !important;
                    }

                    /* Reveal the controls while hovering the picture-in-picture video */
                    div[class*="DivPlayerContainer"]:hover div[class*="DivBottom"],
                    div[class*="DivPlayerContainer"]:hover div[class*="DivButtonContainer"],
                    div[class*="DivPlayerContainer"]:hover div[class*="ControlMask"] {
                        opacity: 1 !important;
                        visibility: visible !important;
                    }
                `;
            document.head.appendChild(styleEl);
        }
        const pipTitle =
            (typeof itgPipMsg === 'function'
                ? itgPipMsg('omnibarPrefixVideoPipTitle', 'Picture-in-Picture (Video)')
                : null) ||
            chrome.i18n.getMessage('omnibarPrefixVideoPipTitle') ||
            'Picture-in-Picture (Video)';
        const videoSvgIcon = `<span style="display:block;width:24px;height:24px;">${ITG_PIP_ICON}</span>`;
        const handlePipClick = async (e) => {
            e.preventDefault();
            e.stopPropagation();
            try {
                // Try to click the native TikTok "Reproductor flotante" (mini-player) button
                let miniPlayerBtn = document.querySelector('[data-e2e="more-menu-popover_mini-player"]');
                if (miniPlayerBtn) {
                    miniPlayerBtn.click();
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
                        return;
                    }
                }
            } catch (err) {
                console.warn('Failed to trigger TikTok native mini-player:', err);
            }
        };
        const addTiktokButtons = () => {
            const avatarLinks = document.querySelectorAll('a[data-e2e="video-author-avatar"]');
            avatarLinks.forEach((avatarLink) => {
                const container = avatarLink.closest('[class*="DivAvatarActionItemContainer"]');
                if (!container) return;
                if (container.querySelector('.itg-tiktok-pip-button')) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'itg-tiktok-pip-button css-1ydks0-7937d88b--ButtonActionItem efpxn6t0';
                btn.setAttribute('title', pipTitle);
                btn.setAttribute('aria-label', pipTitle);
                btn.style.cssText = `
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                        width: 48px;
                        height: 78px;
                        background-color: rgba(0, 0, 0, 0);
                        border: none;
                        padding: 0px;
                        margin: 0px 0px 8px 0px;
                        cursor: pointer;
                        position: relative;
                        transition: opacity 0.25s ease, transform 0.2s ease;
                        opacity: 1;
                        pointer-events: auto;
                        z-index: 10;
                    `;
                const iconWrapper = document.createElement('span');
                iconWrapper.className = 'css-1au6o1s-7937d88b--SpanIconWrapper efpxn6t1';
                iconWrapper.style.cssText = `
                        display: flex;
                        justify-content: center;
                        align-items: center;
                        width: 48px;
                        height: 48px;
                        border-radius: 50%;
                        margin-top: 8px;
                        margin-bottom: 6px;
                        background-color: rgba(255, 255, 255, 0.12);
                        color: rgba(255, 255, 255, 0.9);
                        transition: background-color 200ms ease-in-out;
                    `;
                iconWrapper.innerHTML = videoSvgIcon;
                const label = document.createElement('strong');
                label.className = 'css-f1vcu2-7937d88b--StrongText efpxn6t2';
                label.style.cssText = `
                        display: block;
                        color: rgba(255, 255, 255, 0.75);
                        font-family: TikTokFont, Arial, Tahoma, PingFangSC, sans-serif;
                        font-size: 12px;
                        font-weight: 700;
                        line-height: 16px;
                        text-align: center;
                    `;
                label.textContent = 'PiP';
                btn.appendChild(iconWrapper);
                btn.appendChild(label);
                btn.addEventListener('mouseenter', () => {
                    iconWrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.2)';
                    btn.style.transform = 'scale(1.06)';
                });
                btn.addEventListener('mouseleave', () => {
                    iconWrapper.style.backgroundColor = 'rgba(255, 255, 255, 0.12)';
                    btn.style.transform = 'scale(1)';
                });
                btn.addEventListener('click', handlePipClick);

                // Always keep the PiP button visible
                btn.style.opacity = '1';
                btn.style.pointerEvents = 'auto';

                // Insert "arriba arriba de foto de perfil" (above avatar link)
                container.insertBefore(btn, avatarLink);
            });
        };
        addTiktokButtons();
        let _tiktokDebounceTimer = null;
        this._tiktokPipObserver = new MutationObserver(() => {
            if (_tiktokDebounceTimer) return;
            _tiktokDebounceTimer = setTimeout(() => {
                _tiktokDebounceTimer = null;
                addTiktokButtons();
            }, 800);
        });
        this._tiktokPipObserver.observe(document.body, {
            childList: true,
            subtree: true,
        });
    }
    /**
     * Picture-in-Picture button for every other site.
     *
     * Injecting into a player's own control bar only works for players we have a
     * selector for, which is why so many sites never showed the button. This finds
     * the video the way the reference extension does — from the pointer, following
     * shadow roots down — so a player hidden inside a custom element is reached
     * without knowing anything about the site.
     *
     * One button element is reused and simply repositioned, and the whole thing is
     * top-frame only: the content scripts run in every frame, and a per-frame
     * mousemove listener would multiply the work for no gain.
     */
    _injectGenericVideoPipButton() {
        if (window.top !== window || itgIsInsidePipWindow()) return;
        if (this.videoPipEnabled === false) return;
        // These two have buttons inside their own player controls already.
        if (window.location.hostname.includes('youtube.com') || window.location.hostname.includes('tiktok.com')) return;

        const pipTitle =
            (typeof itgPipMsg === 'function'
                ? itgPipMsg('omnibarPrefixVideoPipTitle', 'Picture-in-Picture (Video)')
                : null) ||
            chrome.i18n.getMessage('omnibarPrefixVideoPipTitle') ||
            'Picture-in-Picture (Video)';
        let button = null;
        let hoveredVideo = null;
        let hideTimer = null;

        const ensureButton = () => {
            if (button && button.isConnected) return button;
            button = document.createElement('button');
            button.type = 'button';
            button.id = 'itg-generic-pip-button';
            button.title = pipTitle;
            button.setAttribute('aria-label', pipTitle);
            button.style.cssText = [
                'position:fixed',
                'z-index:2147483646',
                'display:none',
                'align-items:center',
                'justify-content:center',
                'width:36px',
                'height:36px',
                'padding:7px',
                'margin:0',
                'border:0',
                'border-radius:8px',
                'background:rgba(0,0,0,0.62)',
                'color:#fff',
                'cursor:pointer',
                'opacity:0.85',
                'transition:opacity 0.15s ease, transform 0.15s ease',
            ].join(';');
            button.innerHTML = ITG_PIP_ICON;
            button.addEventListener('mouseenter', () => {
                button.style.opacity = '1';
                button.style.transform = 'scale(1.08)';
                clearTimeout(hideTimer);
            });
            button.addEventListener('mouseleave', () => {
                button.style.opacity = '0.85';
                button.style.transform = 'scale(1)';
                scheduleHide();
            });
            button.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // Straight from the click: Document PiP needs the live activation.
                ItgVideoPip.open(hoveredVideo);
                hide();
            });
            document.documentElement.appendChild(button);
            itgAttachAutoPipMenu(button);
            return button;
        };

        const hide = () => {
            if (button) button.style.display = 'none';
            hoveredVideo = null;
        };

        const scheduleHide = () => {
            clearTimeout(hideTimer);
            hideTimer = setTimeout(hide, 1200);
        };

        const showFor = (video) => {
            const rect = video.getBoundingClientRect();
            // Thumbnails and autoplaying decorations are not what the button is for.
            if (rect.width < 200 || rect.height < 140) return hide();
            const el = ensureButton();
            hoveredVideo = video;
            el.style.display = 'flex';
            el.style.top = `${Math.max(8, rect.top + 10)}px`;
            el.style.left = `${Math.min(window.innerWidth - 44, rect.right - 46)}px`;
            clearTimeout(hideTimer);
            scheduleHide();
        };

        const onMove = Utils.debounce((e) => {
            if (ItgVideoPip.current || itgIsInsidePipWindow()) return hide();
            const video = itgVideoFromPoint(e.clientX, e.clientY);
            if (video && itgIsUsableVideo(video)) showFor(video);
        }, 180);

        window.addEventListener('mousemove', onMove, { passive: true });
        this._genericPipCleanup = () => {
            window.removeEventListener('mousemove', onMove);
            clearTimeout(hideTimer);
            button?.remove();
        };
    }

    _setupMediaFeaturesStorageListener() {
        if (this._mediaStorageListener) return;
        this._mediaStorageListener = (changes, area) => {
            if (changes.videoPipEnabled !== undefined) {
                this.videoPipEnabled = changes.videoPipEnabled.newValue !== false;
                this._updateVideoPipState();
            }
            if (changes.youtubeLoopEnabled !== undefined) {
                this.youtubeLoopEnabled = changes.youtubeLoopEnabled.newValue !== false;
                this._updateYoutubeLoopState();
            }
        };
        try {
            chrome.storage.onChanged.addListener(this._mediaStorageListener);
        } catch {}
    }

    _updateVideoPipState() {
        if (this.videoPipEnabled) {
            this._injectYoutubePipButton();
            this._injectTiktokPipButton();
            this._injectGenericVideoPipButton();
        } else {
            if (this._ytPipObserver) {
                this._ytPipObserver.disconnect();
                this._ytPipObserver = null;
            }
            if (this._tiktokPipObserver) {
                this._tiktokPipObserver.disconnect();
                this._tiktokPipObserver = null;
            }
            if (this._genericPipCleanup) {
                this._genericPipCleanup();
                this._genericPipCleanup = null;
            }
            document
                .querySelectorAll(
                    '#itg-yt-pip-button, #itg-yt-shorts-pip-button, .itg-tiktok-pip-button, #itg-generic-pip-button, #itg-autopip-menu',
                )
                .forEach((el) => el.remove());
        }
    }

    _updateYoutubeLoopState() {
        if (this.youtubeLoopEnabled) {
            this._injectYoutubeLoopButton();
        } else {
            if (this._ytLoopObserver) {
                this._ytLoopObserver.disconnect();
                this._ytLoopObserver = null;
            }
            document
                .querySelectorAll(
                    '#itg-yt-loop-button, #itg-yt-shorts-loop-wrapper, #itg-yt-shorts-loop-button, #itg-yt-loop-menu, #itg-pip-loop-popup, .itg-yt-loop-menu, .ytp-loop-active',
                )
                .forEach((el) => el.remove());
            if (typeof itgVideoLoop !== 'undefined' && itgVideoLoop.isLooping) {
                itgVideoLoop.setLoop(false);
            }
        }
    }

    cleanup() {
        this._isCleanedUp = true;
        console.log('[HintMain] Cleaning up previous content script instance...');
        if (this._mediaStorageListener) {
            try {
                chrome.storage.onChanged.removeListener(this._mediaStorageListener);
            } catch {}
            this._mediaStorageListener = null;
        }
        if (this._boundFocusInHandler) document.removeEventListener('focusin', this._boundFocusInHandler);
        if (this._boundFocusOutHandler) document.removeEventListener('focusout', this._boundFocusOutHandler);
        if (this._boundMainKeyDownHandler) document.removeEventListener('keydown', this._boundMainKeyDownHandler, true);
        if (this._boundMessageHandler) {
            try {
                chrome.runtime.onMessage.removeListener(this._boundMessageHandler);
            } catch {}
        }
        if (this._videoCheckInterval) clearInterval(this._videoCheckInterval);
        if (this._findVideoInterval) clearInterval(this._findVideoInterval);
        if (this._shortsCheckInterval) clearInterval(this._shortsCheckInterval);
        if (this._ytPipObserver) {
            this._ytPipObserver.disconnect();
            this._ytPipObserver = null;
        }
        if (this._ytLoopObserver) {
            this._ytLoopObserver.disconnect();
            this._ytLoopObserver = null;
        }
        if (this._tiktokPipObserver) {
            this._tiktokPipObserver.disconnect();
            this._tiktokPipObserver = null;
        }
        if (this._genericPipCleanup) {
            this._genericPipCleanup();
            this._genericPipCleanup = null;
        }
        try {
            document.body.classList.remove('itg-pip-shorts');
            document.body.classList.remove('itg-hide-masthead');
        } catch {}
        if (this._boundMainKeyUpHandler) {
            document.removeEventListener('keyup', this._boundMainKeyUpHandler, true);
            this._boundMainKeyUpHandler = null;
        }
        if (this._altSequenceTimer) {
            clearTimeout(this._altSequenceTimer);
            this._altSequenceTimer = null;
        }
        this._altSequenceBuffer = '';
        this._isAltHeld = false;
        if (this.shadowUI) this.shadowUI.cleanup();
        if (this.hintEngine) this.hintEngine.cleanup();
        if (this.snippetManager) this.snippetManager.cleanup();
        if (this.helpModal) this.helpModal.cleanup();
        if (this.omniBar) this.omniBar.cleanup();
        if (this.linkPreviewManager) this.linkPreviewManager.cleanup();
    }
    async _handleKeyDown(event) {
        if (this._isCleanedUp) return;
        if (!chrome.runtime || !chrome.runtime.id) {
            this.cleanup();
            return;
        }
        if (!this.hintsGloballyEnabled) return;

        // 0. Alt sequence for navigating to group tabs: Alt + [group prefix] + [tab index] + Enter
        if (event.key === 'Alt') {
            this._isAltHeld = true;
        }
        if (
            event.altKey ||
            this._isAltHeld ||
            (this._altSequenceBuffer && (event.key === 'Enter' || event.code === 'Enter'))
        ) {
            if (event.key === 'Enter' || event.code === 'Enter') {
                if (this._altSequenceBuffer) {
                    // The digits are optional: the letters alone name the group and land
                    // on its first tab, and `0` is the shorthand for its last one.
                    const match = this._altSequenceBuffer.match(/^([a-zA-Z\u00C0-\u024F\s_-]+)(\d*)$/);
                    if (match) {
                        const groupPrefix = match[1].trim();
                        const tabIndex = match[2] === '' ? 1 : parseInt(match[2], 10);
                        chrome.runtime.sendMessage({
                            action: 'navigateToGroupTab',
                            groupPrefix,
                            tabIndex,
                        });
                        this._altSequenceBuffer = '';
                        if (this._altSequenceTimer) clearTimeout(this._altSequenceTimer);
                        event.preventDefault();
                        event.stopPropagation();
                        return;
                    }
                }
            } else if (event.key === 'Backspace') {
                if (this._altSequenceBuffer) {
                    this._altSequenceBuffer = this._altSequenceBuffer.slice(0, -1);
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            } else if (event.key !== 'Alt' && !event.ctrlKey && !event.metaKey) {
                let char = '';
                if (event.code && event.code.startsWith('Key')) {
                    char = event.code.slice(3).toLowerCase();
                } else if (event.code && event.code.startsWith('Digit')) {
                    char = event.code.slice(5);
                } else if (event.code && event.code.startsWith('Numpad') && !isNaN(event.code.slice(6))) {
                    char = event.code.slice(6);
                } else if (event.key && event.key.length === 1 && /[a-zA-Z0-9_\-\s]/.test(event.key)) {
                    char = event.key.toLowerCase();
                }
                if (char) {
                    this._altSequenceBuffer += char;
                    if (this._altSequenceTimer) clearTimeout(this._altSequenceTimer);
                    this._altSequenceTimer = setTimeout(() => {
                        this._altSequenceBuffer = '';
                    }, 3000);
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }
            }
        }

        // 1. Priority: Own Help Modal
        if (this.helpModal.visible) {
            if (event.key === 'Escape') {
                await this.helpModal.toggle();
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }

        // 2. Priority: Own Omnibar
        if (this.omniBar.active) {
            // Escape is handled here at the document level
            if (event.key === 'Escape') {
                this.omniBar.close();
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const sel = window.getSelection();
            const isTextSelected = sel && !sel.isCollapsed;
            if (event.key === 'i' && isTextSelected) {
                this.omniBar.recoverFocus();
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // DO NOT call stopPropagation() here for the rest of the keys:
            // the keydown listener on the shadow DOM <input> (internal capture phase)
            // needs to receive the event. stopPropagation() in document capture
            // would kill the event before it reaches the input.
            // The input's own _handleKey calls stopPropagation() for the
            // keys it manages, preventing them from triggering page shortcuts.
            return;
        }

        // 3. Global but non-intrusive ESCAPE key management
        if (event.key === 'Escape') {
            if (this.hintEngine.active) {
                this.hintEngine.clear();
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) {
                sel.removeAllRanges();
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            const target = (event.composedPath && event.composedPath()[0]) || event.target;
            if (
                this.insertMode ||
                Utils.isInputLikeElement(target) ||
                Utils.isInputLikeElement(document.activeElement)
            ) {
                this.insertMode = false;
                if (target && typeof target.blur === 'function') {
                    target.blur();
                }
                if (document.activeElement && typeof document.activeElement.blur === 'function') {
                    document.activeElement.blur();
                }
                try {
                    if (document.body && typeof document.body.click === 'function') {
                        document.body.click();
                    } else if (document.documentElement && typeof document.documentElement.click === 'function') {
                        document.documentElement.click();
                    }
                } catch {}
                event.preventDefault();
                event.stopPropagation();
                return;
            }

            // Cancel active page mode (dark, sepia, paper, light, extension)
            chrome.runtime.sendMessage(
                {
                    action: 'cancelTabPageMode',
                },
                (response) => {
                    if (chrome.runtime.lastError) return;
                    // No additional action needed; background notifies 'pageModeChanged'
                },
            );
            return;
        }
        const activeTarget = (event.composedPath && event.composedPath()[0]) || event.target;
        if (this.insertMode || Utils.isInputLikeElement(activeTarget)) {
            return;
        }
        if (event.shiftKey && event.key === '?') {
            // Don't open the help modal if the omnibar is active
            if (this.omniBar && this.omniBar.active) {
                return;
            }
            // Don't open if focus is inside any shadow root (e.g., omnibar input)
            const composedTarget = event.composedPath && event.composedPath()[0];
            if (composedTarget && composedTarget !== event.target) {
                return; // event originated inside a shadow DOM
            }
            event.preventDefault();
            event.stopPropagation();
            this.helpModal.toggle();
            return;
        }
        if (this.hintEngine.active) {
            if (this.hintEngine.handleKey(event)) {
                return;
            }
        }
        if (event.altKey) {
            if (event.key === 'j') {
                chrome.runtime.sendMessage({
                    action: 'previousTab',
                });
                event.preventDefault();
                event.stopPropagation();
            } else if (event.key === 'k') {
                chrome.runtime.sendMessage({
                    action: 'nextTab',
                });
                event.preventDefault();
                event.stopPropagation();
            }
            return;
        }
        if (event.ctrlKey || event.metaKey) return;
        if (event.key === 'Tab') {
            if (this._handleTabSearch(event)) return;
        }
        const sel = window.getSelection();
        if (sel.rangeCount > 0 && !sel.isCollapsed) {
            if (this._handleSelectionKeys(event, sel)) {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
        }
        if (event.key.length === 1 && !event.altKey) {
            const mappings = this.commands.getMappings();
            if (event.repeat) {
                if (mappings[event.key]) {
                    mappings[event.key].action();
                    event.preventDefault();
                    event.stopPropagation();
                }
                return;
            }
            clearTimeout(this.keyTimeout);
            this.keySequence += event.key;
            const possible = Object.keys(mappings).filter((k) => k.startsWith(this.keySequence));
            if (possible.length === 1 && possible[0] === this.keySequence) {
                mappings[this.keySequence].action();
                this.keySequence = '';
                event.preventDefault();
                event.stopPropagation();
            } else if (possible.length > 0) {
                this.keyTimeout = setTimeout(() => {
                    if (mappings[this.keySequence]) mappings[this.keySequence].action();
                    this.keySequence = '';
                }, 400);
                event.preventDefault();
                event.stopPropagation();
            } else {
                this.keySequence = '';
            }
        }
    }
    _handleTabSearch(event) {
        const sel = window.getSelection();
        if (sel && !sel.isCollapsed) {
            const text = sel.toString().trim();
            if (text) {
                const matches = this._findAllTextOccurrences(text);
                if (matches.length > 1) {
                    const currentRange = sel.getRangeAt(0);
                    let idx = matches.findIndex(
                        (r) =>
                            r.startContainer === currentRange.startContainer &&
                            r.startOffset === currentRange.startOffset,
                    );
                    if (idx === -1) idx = 0;
                    const nextIdx = event.shiftKey
                        ? (idx - 1 + matches.length) % matches.length
                        : (idx + 1) % matches.length;
                    const nextRange = matches[nextIdx];
                    sel.removeAllRanges();
                    sel.addRange(nextRange);
                    nextRange.startContainer.parentElement.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center',
                    });
                }
                event.preventDefault();
                event.stopPropagation();
                return true;
            }
        }
        return false;
    }
    _handleSelectionKeys(event, selection) {
        let handled = true;
        switch (event.key) {
            case 'j':
                selection.modify('extend', 'forward', 'line');
                break;
            case 'k':
                selection.modify('extend', 'backward', 'line');
                break;
            case 'h':
                selection.modify('extend', 'backward', 'character');
                break;
            case 'l':
                selection.modify('extend', 'forward', 'character');
                break;
            case 'e':
                selection.modify('extend', 'forward', 'word');
                break;
            case 'u':
                selection.modify('extend', 'backward', 'documentboundary');
                break;
            case 'd':
                selection.modify('extend', 'forward', 'documentboundary');
                break;
            case 'n':
                selection.modify('extend', 'forward', 'paragraph');
                break;
            case 'p':
                selection.modify('extend', 'backward', 'paragraph');
                break;
            case 'c':
                document.execCommand('copy');
                break;
            default:
                handled = false;
                break;
        }
        return handled;
    }
    _findAllTextOccurrences(term) {
        if (!term) return [];
        const ranges = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
            acceptNode: (node) => {
                if (['SCRIPT', 'STYLE'].includes(node.parentNode.tagName)) return NodeFilter.FILTER_REJECT;
                if (!Utils.isVisible(node.parentNode)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            },
        });
        const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
        let node;
        while ((node = walker.nextNode())) {
            let match;
            regex.lastIndex = 0;
            while ((match = regex.exec(node.textContent)) !== null) {
                const r = document.createRange();
                r.setStart(node, match.index);
                r.setEnd(node, match.index + match[0].length);
                ranges.push(r);
            }
        }
        return ranges;
    }
};

// Protected instantiation against reloads
if (window.__itgHintMainInstance) {
    try {
        window.__itgHintMainInstance.cleanup();
    } catch (e) {
        console.error('[HintMain] Error cleaning up previous instance:', e);
    }
}
var initMain = () => {
    window.__itgHintMainInstance = new Main();
    window.__itgHintMainInstance.init();
};
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initMain);
} else {
    initMain();
}
