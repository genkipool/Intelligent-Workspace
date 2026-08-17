/**
 * @class LinkPreviewManager
 * @description Manages floating, debounced, glassmorphic link previews with iframes.
 */
var LinkPreviewManager = class LinkPreviewManager {
    constructor(shadowUI) {
        this.shadowUI = shadowUI;
        this.activeAnchor = null;
        this.previewEl = null;
        this.hoverTimer = null;
        this.closeTimer = null;
        this.hoverDelay = 350; // Reduced from 500ms to load previsualizations faster
        this.dismissDelay = 350; // Reduced from 350ms
        this.enabled = true;
        this.pool = new Map(); // url -> { container, lastUsed }
        this.maxPoolSize = 3;
        this._prefetchedOrigins = new Set();
        this.blacklist = [];
        this.triggerKey = '';
        this._pressedKeys = new Set();
        this.mouseX = 0;
        this.mouseY = 0;
        this._handleMouseMove = (e) => {
            this.mouseX = e.clientX;
            this.mouseY = e.clientY;
        };
        this._handleMouseOver = this._handleMouseOver.bind(this);
        this._handleMouseOut = this._handleMouseOut.bind(this);
        this._handleKeyDown = (e) => {
            if (e.key) {
                const key = e.key.toLowerCase();
                this._pressedKeys.add(key);
                if (this.triggerKey && this.triggerKey === key) {
                    const hovered = document.querySelector(':hover');
                    let anchor = hovered ? hovered.closest('a') : null;
                    if (!anchor) {
                        const hoverElements = document.querySelectorAll('a:hover');
                        if (hoverElements.length > 0) anchor = hoverElements[hoverElements.length - 1];
                    }
                    if (anchor) {
                        this._handleMouseOver({
                            target: anchor,
                        });
                    }
                }
            }
        };
        this._handleKeyUp = (e) => {
            if (e.key) {
                const key = e.key.toLowerCase();
                this._pressedKeys.delete(key);
                if (this.triggerKey && this.triggerKey === key) {
                    if (this.hoverTimer) {
                        clearTimeout(this.hoverTimer);
                        this.hoverTimer = null;
                    }
                    this.removePreview(true);
                }
            }
        };
        this._handleBlur = () => {
            this._pressedKeys.clear();
        };
    }
    init() {
        if (chrome.runtime && chrome.runtime.id) {
            chrome.storage.sync.get(['linkPreviewEnabled', 'linkPreviewBlacklist', 'linkPreviewTriggerKey'], (res) => {
                if (chrome.runtime && chrome.runtime.id) {
                    this.enabled = res.linkPreviewEnabled !== false;
                    this.blacklist = res.linkPreviewBlacklist || [];
                    this.triggerKey = (res.linkPreviewTriggerKey || '').trim().toLowerCase();
                }
            });
        }
        document.addEventListener('mouseover', this._handleMouseOver);
        document.addEventListener('mouseout', this._handleMouseOut);
        window.addEventListener('keydown', this._handleKeyDown, true);
        window.addEventListener('keyup', this._handleKeyUp, true);
        window.addEventListener('blur', this._handleBlur, true);
        window.addEventListener('mousemove', this._handleMouseMove, {
            passive: true,
        });
    }
    setBlacklist(blacklist) {
        this.blacklist = blacklist || [];
    }
    setTriggerKey(key) {
        this.triggerKey = (key || '').trim().toLowerCase();
    }
    setEnabled(enabled) {
        this.enabled = enabled;
        if (!enabled) {
            this.removePreview(true);
        }
    }
    cleanup() {
        document.removeEventListener('mouseover', this._handleMouseOver);
        document.removeEventListener('mouseout', this._handleMouseOut);
        window.removeEventListener('keydown', this._handleKeyDown, true);
        window.removeEventListener('keyup', this._handleKeyUp, true);
        window.removeEventListener('blur', this._handleBlur, true);
        window.removeEventListener('mousemove', this._handleMouseMove, {
            passive: true,
        });
        this._pressedKeys.clear();
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.removePreview(true);
        for (const item of this.pool.values()) {
            if (item.container && item.container.parentNode) {
                const iframe = item.container.querySelector('.hint-preview-iframe');
                if (iframe) iframe.src = 'about:blank';
                item.container.parentNode.removeChild(item.container);
            }
        }
        this.pool.clear();
        if (this.shadowUI && this.shadowUI.root) {
            const containers = this.shadowUI.root.querySelectorAll('.hint-preview-container');
            containers.forEach((c) => c.remove());
        }
    }
    _handleMouseOver(e) {
        if (!this.enabled) return;
        if (!chrome.runtime || !chrome.runtime.id) return; // extension context invalidated

        if (this.triggerKey && !this._pressedKeys.has(this.triggerKey)) return;
        const anchor = e.target.closest('a');

        // If hovering inside the active preview window, keep it open
        if (this.previewEl && this.previewEl.contains(e.target)) {
            if (this.closeTimer) {
                clearTimeout(this.closeTimer);
                this.closeTimer = null;
            }
            return;
        }

        // Check if current host is blacklisted
        const currentHostname = window.location.hostname;
        if (this.blacklist.includes(currentHostname)) return;
        if (!anchor) return;
        const href = anchor.getAttribute('href');
        if (!href) return;
        let absoluteUrl;
        try {
            absoluteUrl = new URL(href, window.location.href).href;
        } catch {
            return;
        }

        // Only preview valid absolute web links
        if (!absoluteUrl.startsWith('http://') && !absoluteUrl.startsWith('https://')) return;

        // Check if target host is blacklisted
        try {
            const targetHostname = new URL(absoluteUrl).hostname;
            if (this.blacklist.includes(targetHostname)) return;
        } catch {}

        // Step 1: Speculative preconnect / dns-prefetch at ms 0
        try {
            const origin = new URL(absoluteUrl).origin;
            if (!this._prefetchedOrigins.has(origin)) {
                this._prefetchedOrigins.add(origin);
                if (this._prefetchedOrigins.size > 20) this._prefetchedOrigins.clear();
                const preconnect = document.createElement('link');
                preconnect.rel = 'preconnect';
                preconnect.href = origin;
                preconnect.crossOrigin = 'anonymous';
                const dnsPrefetch = document.createElement('link');
                dnsPrefetch.rel = 'dns-prefetch';
                dnsPrefetch.href = origin;

                // Prefetch the actual document HTML, not just the connection
                const docPrefetch = document.createElement('link');
                docPrefetch.rel = 'prefetch';
                docPrefetch.href = absoluteUrl;
                docPrefetch.as = 'document';
                document.head.appendChild(preconnect);
                document.head.appendChild(dnsPrefetch);
                document.head.appendChild(docPrefetch);
                setTimeout(() => {
                    try {
                        if (preconnect.parentNode) document.head.removeChild(preconnect);
                        if (dnsPrefetch.parentNode) document.head.removeChild(dnsPrefetch);
                        if (docPrefetch.parentNode) document.head.removeChild(docPrefetch);
                    } catch {}
                }, 10000);
            }
        } catch {}
        const currentUrlNoHash = window.location.href.split('#')[0];
        const targetUrlNoHash = absoluteUrl.split('#')[0];
        if (currentUrlNoHash === targetUrlNoHash) return;

        // Clear any active timers for previous elements
        if (this.hoverTimer) clearTimeout(this.hoverTimer);
        if (this.closeTimer) clearTimeout(this.closeTimer);
        this.activeAnchor = anchor;
        this.preLoadPreview(absoluteUrl);
        this.hoverTimer = setTimeout(() => {
            this.showPreview(anchor, absoluteUrl);
        }, this.hoverDelay);
    }
    _handleMouseOut(e) {
        if (this.hoverTimer) {
            clearTimeout(this.hoverTimer);
            this.hoverTimer = null;
        }
        if (this.previewEl) {
            if (this.previewEl.dataset.pinned === 'true') return;
            if (this.closeTimer) clearTimeout(this.closeTimer);
            this.closeTimer = setTimeout(() => {
                this.removePreview();
            }, this.dismissDelay);
        }
    }
    preLoadPreview(url) {
        // If already loaded or being loaded, do nothing
        if (this.previewEl && this.previewEl.querySelector('.hint-preview-iframe')?.src === url) {
            return;
        }

        // Remove any existing preview container that is not pinned
        this.removePreview();
        if (!this.shadowUI || !this.shadowUI.root) return;
        let container;
        if (this.pool.has(url)) {
            const pooled = this.pool.get(url);
            container = pooled.container;
            this.pool.delete(url);
            const iframe = container.querySelector('.hint-preview-iframe');
            if (iframe && iframe.src !== url) {
                iframe.src = url;
            }

            // Reset loader opacity if present
            const loader = container.querySelector('.hint-preview-loader');
            if (loader) {
                loader.style.opacity = '1';
            }
        } else {
            container = document.createElement('div');
            container.className = 'hint-preview-container';
            container.dataset.shown = 'false';
            let domain = 'Link';
            try {
                domain = new URL(url).hostname;
            } catch {}
            container.innerHTML = `
                    <div class="hint-preview-header">
                        <span class="hint-preview-title">${chrome.i18n.getMessage('previewTitlePrefix') || 'Preview:'} ${domain}</span>
                        <div class="hint-preview-actions" style="display: flex; align-items: center; gap: 8px;">
                            <button class="hint-preview-action-btn hint-preview-pip-btn" title="${chrome.i18n.getMessage('openAsPipTitle') || 'Open as Picture-in-Picture'}">
                                <span style="display:block;width:14px;height:14px;">${ITG_PIP_ICON}</span>
                            </button>
                            <button class="hint-preview-action-btn hint-preview-popup-btn" title="${chrome.i18n.getMessage('openAsPopupTitle') || 'Open as popup window'}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
                                </svg>
                            </button>
                            <button class="hint-preview-action-btn hint-preview-pin-btn" title="${chrome.i18n.getMessage('pinPreviewWindow') || 'Pin preview window'}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <circle cx="12" cy="5" r="4"></circle>
                                    <path d="M12 8v18"></path>
                                </svg>
                            </button>
                            <button class="hint-preview-action-btn hint-preview-blacklist-btn" title="${chrome.i18n.getMessage('blacklistDomainTitle') || 'Disable link preview on this site'}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><line x1="4" y1="4" x2="20" y2="20"/></svg>
                            </button>
                            <label class="switch hint-preview-header-switch" title="${chrome.i18n.getMessage(this.enabled ? 'disableLinkPreview' : 'enableLinkPreview') || 'Toggle link preview'}" style="margin: 0;">
                                <input type="checkbox" id="hint-preview-quick-toggle" ${this.enabled ? 'checked' : ''}>
                                <span class="slider"><span class="slider-dot"></span></span>
                            </label>
                            <button class="hint-preview-action-btn hint-preview-open-btn" title="${chrome.i18n.getMessage('openLinkNewTab') || 'Open in new tab'}">
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                            </button>
                            <button class="hint-preview-action-btn hint-preview-close-btn" title="${chrome.i18n.getMessage('close') || 'Close'}">×</button>
                        </div>
                    </div>
                    <div class="hint-preview-body">
                        <div class="hint-preview-loader">
                            <div class="hint-preview-spinner"></div>
                            <span>${chrome.i18n.getMessage('loadingPreview') || 'Loading preview...'}</span>
                        </div>
                        <iframe class="hint-preview-iframe"></iframe>
                    </div>
                `;
            const iframe = container.querySelector('.hint-preview-iframe');
            iframe.setAttribute('allow', 'picture-in-picture; autoplay; fullscreen; encrypted-media');
            iframe.setAttribute('fetchpriority', 'high');
            iframe.setAttribute('loading', 'eager');
            iframe.setAttribute('referrerpolicy', 'no-referrer');
            iframe.src = url;
            const openBtn = container.querySelector('.hint-preview-open-btn');
            openBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                window.open(url, '_blank');
                this.removePreview(true, container);
            });
            const closeBtn = container.querySelector('.hint-preview-close-btn');
            closeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.removePreview(false, container);
            });
            const blacklistBtn = container.querySelector('.hint-preview-blacklist-btn');
            if (blacklistBtn) {
                blacklistBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    chrome.runtime.sendMessage({
                        action: 'addLinkPreviewBlacklist',
                        domain: domain,
                    });
                    this.removePreview(true, container);
                });
            }
            const quickToggle = container.querySelector('#hint-preview-quick-toggle');
            const switchLabel = container.querySelector('.hint-preview-header-switch');
            if (quickToggle && switchLabel) {
                quickToggle.addEventListener('change', (e) => {
                    e.stopPropagation();
                    const isEnabled = e.target.checked;
                    switchLabel.title =
                        chrome.i18n.getMessage(isEnabled ? 'disableLinkPreview' : 'enableLinkPreview') ||
                        'Toggle link preview';
                    chrome.runtime.sendMessage({
                        action: 'toggleLinkPreview',
                        enabled: isEnabled,
                    });
                });
            }
            container.addEventListener('click', (e) => {
                e.stopPropagation();
            });
            iframe.addEventListener('load', () => {
                const loader = container.querySelector('.hint-preview-loader');
                if (loader) {
                    loader.style.opacity = '0';
                    setTimeout(() => loader.remove(), 200);
                }
            });
            container.addEventListener('mouseover', () => {
                if (this.closeTimer) {
                    clearTimeout(this.closeTimer);
                    this.closeTimer = null;
                }
            });
            const pinBtn = container.querySelector('.hint-preview-pin-btn');
            if (pinBtn) {
                pinBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const isPinned = container.dataset.pinned === 'true';
                    if (isPinned) {
                        container.dataset.pinned = 'false';
                        pinBtn.style.color = '';
                        pinBtn.title = chrome.i18n.getMessage('pinPreviewWindow') || 'Pin preview window';
                        this.removePreview(false, container);
                    } else {
                        container.dataset.pinned = 'true';
                        pinBtn.style.color = 'var(--text-on-color)';
                        pinBtn.title = chrome.i18n.getMessage('unpinPreviewWindow') || 'Unpin preview window';
                    }
                });
            }
            if (this._activeVideoMsgListener) {
                window.removeEventListener('message', this._activeVideoMsgListener);
                this._activeVideoMsgListener = null;
            }
            this._activeVideoMsgListener = (event) => {
                if (event.data?.action === 'ITG_PREVIEW_HAS_VIDEO') container.dataset.hasVideo = 'true';
            };
            const pipBtn = container.querySelector('.hint-preview-pip-btn');
            if (pipBtn) {
                pipBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const existingIframe = container.querySelector('.hint-preview-iframe');
                    const targetUrl = existingIframe ? existingIframe.src : url;
                    const rect = container.getBoundingClientRect();
                    const isYouTubeOrVideo =
                        targetUrl.includes('youtube.com') ||
                        targetUrl.includes('youtu.be') ||
                        targetUrl.includes('tiktok.com') ||
                        container.dataset.hasVideo === 'true';

                    if (isYouTubeOrVideo) {
                        const width = Math.round(rect.width) || 640;
                        const height = Math.round(rect.height) || 360;
                        await openVideoPip(targetUrl, width, height);
                        this.removePreview(true, container);
                        return;
                    }

                    const width = Math.round(rect.width);
                    const height = Math.round(rect.height);
                    try {
                        if ('documentPictureInPicture' in window) {
                            if (window.documentPictureInPicture.window) {
                                window.documentPictureInPicture.window.close();
                            }
                            const pipWindow = await requestItgPipWindow(targetUrl, width, height);
                            pipWindow.document.body.style.margin = '0';
                            pipWindow.document.body.style.padding = '0';
                            pipWindow.document.body.style.overflow = 'hidden';
                            pipWindow.document.body.style.backgroundColor = '#1e1e1e';

                            // Move existing iframe to PiP window to prevent duplicate audio and reload
                            if (existingIframe) {
                                existingIframe.name = 'itg-page-pip-iframe';
                                existingIframe.style.width = '100vw';
                                existingIframe.style.height = '100vh';
                                existingIframe.style.borderRadius = '0';
                                pipWindow.document.body.appendChild(existingIframe);
                            }
                            this.removePreview(true, container);
                            return;
                        }
                    } catch (err) {
                        console.warn('Document PiP failed, falling back to standard popup:', err);
                    }

                    // Fallback to standard popup window if PiP fails
                    if (existingIframe) {
                        existingIframe.src = 'about:blank';
                    }
                    const left = Math.round(e.screenX - e.clientX + rect.left);
                    const top = Math.round(e.screenY - e.clientY + rect.top);
                    chrome.runtime.sendMessage({
                        action: 'openPopupWindow',
                        url: targetUrl,
                        width: width,
                        height: height,
                        left: left,
                        top: top,
                    });
                    this.removePreview(true, container);
                });
            }
            const popupBtn = container.querySelector('.hint-preview-popup-btn');
            if (popupBtn) {
                popupBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const rect = container.getBoundingClientRect();
                    const width = Math.round(rect.width);
                    const height = Math.round(rect.height);

                    // Stop audio immediately in the old iframe before removing it
                    const oldIframe = container.querySelector('.hint-preview-iframe');
                    if (oldIframe) {
                        oldIframe.src = 'about:blank';
                    }
                    const left = Math.round(e.screenX - e.clientX + rect.left);
                    const top = Math.round(e.screenY - e.clientY + rect.top);
                    chrome.runtime.sendMessage({
                        action: 'openPopupWindow',
                        url: url,
                        width: width,
                        height: height,
                        left: left,
                        top: top,
                    });
                    this.removePreview(true, container);
                });
            }
            container.addEventListener('mouseout', (e) => {
                if (container.dataset.pinned === 'true') return;
                const related = e.relatedTarget;
                if (
                    related &&
                    (container.contains(related) || (this.activeAnchor && this.activeAnchor.contains(related)))
                ) {
                    return;
                }
                if (this.closeTimer) clearTimeout(this.closeTimer);
                this.closeTimer = setTimeout(() => {
                    this.removePreview(false, container);
                }, this.dismissDelay);
            });

            // --- Drag Logic ---
            const header = container.querySelector('.hint-preview-header');
            header.style.cursor = 'grab';
            let isDragging = false;
            let startX, startY, initialLeft, initialTop;
            const dragStart = (e) => {
                if (e.target.closest('.hint-preview-actions')) return;
                isDragging = true;
                header.style.cursor = 'grabbing';
                startX = e.clientX;
                startY = e.clientY;
                const rect = container.getBoundingClientRect();
                initialLeft = rect.left;
                initialTop = rect.top;
                container.style.transition = 'none';
            };
            const drag = (e) => {
                if (!isDragging) return;
                e.preventDefault();
                const dx = e.clientX - startX;
                const dy = e.clientY - startY;
                container.style.left = `${initialLeft + dx}px`;
                container.style.top = `${initialTop + dy}px`;
                container.style.bottom = 'auto';
                container.style.right = 'auto';
            };
            const dragEnd = () => {
                if (!isDragging) return;
                isDragging = false;
                header.style.cursor = 'grab';
                container.style.transition = ''; // restore CSS transition
            };
            header.addEventListener('mousedown', dragStart);
            document.addEventListener('mousemove', drag);
            document.addEventListener('mouseup', dragEnd);
        }
        this.previewEl = container;
        if (!container.parentNode) {
            this.shadowUI.root.appendChild(container);
        }
    }
    showPreview(anchor, url) {
        // Ensure pre-loaded
        this.preLoadPreview(url);
        const container = this.previewEl;
        if (!container) return;
        container.dataset.shown = 'true';
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const previewWidth = 450;
        const previewHeight = 320;

        // Position the preview relative to the mouse pointer with a safe offset
        // to guarantee the mouse cursor is never directly over the preview window.
        let left = this.mouseX + 15;
        let top = this.mouseY + 15;
        if (top + previewHeight > viewportHeight) {
            top = this.mouseY - previewHeight - 15;
        }
        if (left + previewWidth > viewportWidth) {
            left = this.mouseX - previewWidth - 15;
        }

        // Boundary checks to keep it fully within the viewport
        if (left < 16) left = 16;
        if (top < 8) top = 8;

        // Extra safety overlap check: if the mouse is still inside, push it away
        const margin = 15;
        if (
            this.mouseX >= left - margin &&
            this.mouseX <= left + previewWidth + margin &&
            this.mouseY >= top - margin &&
            this.mouseY <= top + previewHeight + margin
        ) {
            if (this.mouseX < left + previewWidth / 2) {
                left = this.mouseX + margin;
            } else {
                left = this.mouseX - previewWidth - margin;
            }
            if (this.mouseY < top + previewHeight / 2) {
                top = this.mouseY + margin;
            } else {
                top = this.mouseY - previewHeight - margin;
            }
            if (left < 16) left = 16;
            if (top < 8) top = 8;
        }
        container.style.top = `${top}px`;
        container.style.left = `${left}px`;
        requestAnimationFrame(() => {
            container.classList.add('visible');
        });
    }
    removePreview(forceDestroy = false, specificContainer = null) {
        if (this._activeVideoMsgListener) {
            window.removeEventListener('message', this._activeVideoMsgListener);
            this._activeVideoMsgListener = null;
        }
        const el = specificContainer || this.previewEl;
        if (!el) return;
        if (!specificContainer && el.dataset.pinned === 'true') {
            this.previewEl = null;
            return;
        }
        const activeUrl = el.querySelector('.hint-preview-iframe')?.src;

        // Universally dispatch pause instruction to the preview iframe regardless of its domain
        const iframe = el.querySelector('.hint-preview-iframe');
        if (iframe && iframe.contentWindow) {
            try {
                iframe.contentWindow.postMessage(
                    {
                        action: 'pauseMedia',
                    },
                    '*',
                );
            } catch {}
            // FIX: Definitively stop all background media/audio by clearing the iframe source
            iframe.src = 'about:blank';
        }
        if (el === this.previewEl) {
            this.previewEl = null;
        }
        el.classList.remove('visible');
        if (activeUrl && this.enabled && !forceDestroy && el.dataset.shown === 'true') {
            this.pool.set(activeUrl, {
                container: el,
                lastUsed: Date.now(),
            });
            if (this.pool.size > this.maxPoolSize) {
                let oldestUrl = null;
                let oldestTime = Infinity;
                for (const [pUrl, pData] of this.pool.entries()) {
                    if (pData.lastUsed < oldestTime) {
                        oldestTime = pData.lastUsed;
                        oldestUrl = pUrl;
                    }
                }
                if (oldestUrl) {
                    const oldData = this.pool.get(oldestUrl);
                    if (oldData.container && oldData.container.parentNode) {
                        const oldIframe = oldData.container.querySelector('.hint-preview-iframe');
                        if (oldIframe) oldIframe.src = 'about:blank';
                        oldData.container.parentNode.removeChild(oldData.container);
                    }
                    this.pool.delete(oldestUrl);
                }
            }
        } else {
            setTimeout(() => {
                try {
                    if (el && el.parentNode && (!this.pool.has(activeUrl) || forceDestroy)) {
                        const targetIframe = el.querySelector('.hint-preview-iframe');
                        if (targetIframe) targetIframe.src = 'about:blank';
                        el.parentNode.removeChild(el);
                    }
                } catch {}
            }, 250);
        }
        this.activeAnchor = null;
    }
};

/**
 * @class CommandRegistry
 */
/**
 * @class CommandRegistry
 */
