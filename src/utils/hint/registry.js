/**
 * @class CommandRegistry
 */
/**
 * @class CommandRegistry
 */
var CommandRegistry = class CommandRegistry {
    constructor(scrollManager, hintEngine, omniBar, helpModal, shadowUI = null) {
        this.scrollManager = scrollManager;
        this.hintEngine = hintEngine;
        this.omniBar = omniBar;
        if (this.omniBar) this.omniBar.setRegistry(this);
        this.helpModal = helpModal;
        this.shadowUI = shadowUI;
        this.mappings = this._getDefaultMappings();
        this.rawCustomShortcuts = {}; // NEW: Stores all raw overrides
    }
    setHelpModal(modal) {
        this.helpModal = modal;
    }

    // NEW METHOD: Updates based on description ID (e.g.: 'prefixSearchGoogle')
    // Used both by regular commands and by the omnibar
    async updateShortcut(descKey, newKey) {
        // Update raw memory
        if (newKey) {
            this.rawCustomShortcuts[descKey] = newKey;
        } else {
            delete this.rawCustomShortcuts[descKey];
        }

        // If it is a mapping command (j, k, f...), also update this.mappings
        // First, we check if any old key pointed to this description and delete it
        const oldKeyMapping = Object.keys(this.mappings).find((k) => this.mappings[k].description === descKey);
        if (oldKeyMapping) {
            const actionRef = this.mappings[oldKeyMapping];
            delete this.mappings[oldKeyMapping];
            this.mappings[newKey] = actionRef;
        } else {
            // If it didn't exist (maybe reset), we try to reload mappings from defaults
            // to re-associate the action if it is a standard command.
            const defaults = this._getDefaultMappings();
            // Find in defaults who has this descKey
            const defEntry = Object.entries(defaults).find(([k, v]) => v.description === descKey);
            if (defEntry) {
                this.mappings[newKey] = defEntry[1];
            }
        }
        await this._saveCustomShortcuts();
    }

    // OBSOLETE METHOD (kept for compatibility if something external calls it, but we'll use the one above)
    updateKey(oldKey, newKey) {
        // This method was the problem, we will no longer use it from the Modal
        const entry = this.mappings[oldKey];
        if (entry) {
            this.updateShortcut(entry.description, newKey);
        }
    }
    async _saveCustomShortcuts() {
        // We directly save the raw version that contains EVERYTHING (Omnibar + Mappings)
        await chrome.storage.sync.set({
            'itg-ui-custom-shortcuts': this.rawCustomShortcuts,
        });
        chrome.runtime.sendMessage({
            action: 'hintCommandsUpdated',
        });
    }
    async resetToDefaults() {
        await chrome.storage.sync.remove('itg-ui-custom-shortcuts');
        this.rawCustomShortcuts = {}; // Clear raw
        this.mappings = this._getDefaultMappings();
        chrome.runtime.sendMessage({
            action: 'hintCommandsUpdated',
        });
    }
    _getDefaultMappings() {
        //
        return {
            j: {
                action: () => this.scrollManager.scroll(0, 75),
                description: 'hintDesc_j',
            },
            k: {
                action: () => this.scrollManager.scroll(0, -75),
                description: 'hintDesc_k',
            },
            h: {
                action: () => {
                    if (this.scrollManager.canScrollX(-1)) {
                        this.scrollManager.scroll(-75, 0);
                    } else {
                        this._send('previousTab');
                    }
                },
                description: 'hintDesc_h_tab',
            },
            l: {
                action: () => {
                    if (this.scrollManager.canScrollX(1)) {
                        this.scrollManager.scroll(75, 0);
                    } else {
                        this._send('nextTab');
                    }
                },
                description: 'hintDesc_l_tab',
            },
            d: {
                action: () => this.scrollManager.scrollToEdge(false),
                description: 'hintDesc_d',
            },
            u: {
                action: () => this.scrollManager.scrollToEdge(true),
                description: 'hintDesc_u',
            },
            r: {
                action: () => location.reload(),
                description: 'hintDesc_r',
            },
            R: {
                action: () => location.reload(true),
                description: 'hintDesc_R',
            },
            H: {
                action: () => history.back(),
                description: 'hintDesc_h_tab_page',
            },
            L: {
                action: () => history.forward(),
                description: 'hintDesc_l_tab_page',
            },
            c: {
                action: () => navigator.clipboard.writeText(window.location.href),
                description: 'hintDesc_c',
            },
            vs: {
                action: () =>
                    this._send('openUrl', {
                        url: 'view-source:' + window.location.href,
                    }),
                description: 'hintDesc_vs',
            },
            vp: {
                action: () =>
                    chrome.runtime.sendMessage({
                        action: 'toggleLinkPreviewFromKey',
                    }),
                description: 'hintDesc_vp',
            },
            bg: {
                action: () =>
                    chrome.runtime.sendMessage({
                        action: 'backupAllGroupsFromKey',
                    }),
                description: 'hintDesc_bg',
            },
            br: {
                action: () =>
                    chrome.runtime.sendMessage({
                        action: 'restoreAllGroupsFromKey',
                    }),
                description: 'hintDesc_br',
            },
            cr: {
                action: () =>
                    chrome.runtime.sendMessage({
                        action: 'createRuleFromShortcut',
                        url: window.location.href,
                    }),
                description: 'hintDesc_ar',
            },
            ae: {
                action: () =>
                    chrome.runtime.sendMessage({
                        action: 'openAddToRuleFromShortcut',
                        url: window.location.href,
                        title: document.title,
                    }),
                description: 'hintDesc_ae',
            },
            cs: {
                action: () => {
                    chrome.runtime.sendMessage(
                        {
                            action: 'captureFullPageFromShortcut',
                        },
                        async (response) => {
                            if (response && response.success && response.dataUrl) {
                                try {
                                    const res = await fetch(response.dataUrl);
                                    const blob = await res.blob();
                                    await navigator.clipboard.write([
                                        new ClipboardItem({
                                            [blob.type]: blob,
                                        }),
                                    ]);
                                } catch (err) {
                                    console.error('Error copying full page capture to clipboard:', err);
                                }
                            }
                        },
                    );
                },
                description: 'hintDesc_cs',
            },
            ca: {
                action: () => this._send('captureAreaFromShortcut'),
                description: 'hintDesc_ca',
            },
            wp: {
                action: async () => {
                    try {
                        if ('documentPictureInPicture' in window) {
                            if (window.documentPictureInPicture.window) {
                                window.documentPictureInPicture.window.close();
                            }
                            let targetUrl = window.location.href;
                            try {
                                const video = document.querySelector('video');
                                if (video && video.currentTime > 0) {
                                    const urlObj = new URL(targetUrl);
                                    const secs = Math.floor(video.currentTime);
                                    urlObj.searchParams.set('t', secs);
                                    targetUrl = urlObj.toString();
                                }
                            } catch (e) {
                                console.warn('Failed to append current video time:', e);
                            }
                            document.querySelectorAll('video').forEach((v) => {
                                try {
                                    v.pause();
                                } catch {}
                            });
                            const width = Math.round(window.innerWidth * 0.8) || 800;
                            const height = Math.round(window.innerHeight * 0.8) || 600;
                            const pipWindow = await requestItgPipWindow(targetUrl, width, height);
                            pipWindow.document.body.style.margin = '0';
                            pipWindow.document.body.style.padding = '0';
                            pipWindow.document.body.style.overflow = 'hidden';
                            pipWindow.document.body.style.backgroundColor = '#1e1e1e';
                            const iframe = document.createElement('iframe');
                            iframe.name = 'itg-page-pip-iframe';
                            iframe.src = targetUrl;
                            iframe.style.width = '100vw';
                            iframe.style.height = '100vh';
                            iframe.style.border = 'none';
                            iframe.allow = 'fullscreen; clipboard-write; encrypted-media;';
                            pipWindow.document.body.appendChild(iframe);
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
                        }
                    } catch (err) {
                        console.warn('Document PiP failed from shortcut:', err);
                    }
                },
                description: 'hintDesc_wp',
            },
            wv: {
                action: async () => {
                    await openVideoPip(window.location.href);
                },
                description: 'hintDesc_wv',
            },
            we: {
                action: () => {
                    const width = Math.round(window.innerWidth * 0.8) || 800;
                    const height = Math.round(window.innerHeight * 0.8) || 600;
                    const left = Math.round((window.screen.width - width) / 2) || 100;
                    const top = Math.round((window.screen.height - height) / 2) || 100;
                    chrome.runtime.sendMessage({
                        action: 'openPopupWindow',
                        url: window.location.href,
                        width: width,
                        height: height,
                        left: left,
                        top: top,
                    });
                },
                description: 'hintDesc_we',
            },
            at: {
                action: () => this._translatePage(),
                description: 'hintDesc_at',
            },
            f: {
                action: () => this.hintEngine.activate('click'),
                description: 'hintDesc_f',
            },
            cf: {
                action: () => this.hintEngine.activate('copyLink'),
                description: 'hintDesc_cf',
            },
            t: {
                action: () => this._send('createNewTab'),
                description: 'hintDesc_t',
            },
            x: {
                action: () => this._send('closeCurrentTab'),
                description: 'hintDesc_x',
            },
            yt: {
                action: () => this._send('duplicateTab'),
                description: 'hintDesc_yt',
            },
            s: {
                action: () => this._send('swapToPreviousTab'),
                description: 'hintDesc_s',
            },
            i: {
                action: () => this._focusFirstInput(),
                description: 'hintDesc_i',
            },
            pp: {
                action: () => this._send('focusSidePanel'),
                description: 'hintDesc_pp',
            },
            pt: {
                action: () =>
                    this._send('openSidePanel', {
                        type: 'themes',
                    }),
                description: 'hintDesc_pt',
            },
            pl: {
                action: () =>
                    this._send('openSidePanel', {
                        type: 'listgroup',
                    }),
                description: 'hintDesc_pl',
            },
            pa: {
                action: () =>
                    this._send('openSidePanel', {
                        type: 'listgroup-ia',
                    }),
                description: 'hintDesc_pa',
            },
            pg: {
                action: () =>
                    this._send('openSidePanel', {
                        type: 'rules',
                    }),
                description: 'hintDesc_pg',
            },
            pn: {
                action: () =>
                    this._send('openSidePanel', {
                        type: 'customize-hint',
                    }),
                description: 'hintDesc_pn',
            },
            o: {
                action: () => this.omniBar.open(),
                description: 'hintDesc_o',
            },
            gy: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://www.youtube.com',
                    }),
                description: 'hintDesc_gy',
            },
            gm: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://mail.google.com',
                    }),
                description: 'hintDesc_gm',
            },
            gp: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://www.google.com/maps',
                    }),
                description: 'hintDesc_gp',
            },
            gx: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://x.com',
                    }),
                description: 'hintDesc_gx',
            },
            gi: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://www.instagram.com',
                    }),
                description: 'hintDesc_gi',
            },
            gu: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://www.udemy.com',
                    }),
                description: 'hintDesc_gu',
            },
            gc: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://chat.openai.com',
                    }),
                description: 'hintDesc_gc',
            },
            gg: {
                action: () =>
                    this._send('openUrl', {
                        url: 'https://gemini.google.com',
                    }),
                description: 'hintDesc_gg',
            },
            dg: {
                action: () => this._send('deleteCurrentTabGroup'),
                description: 'hintDesc_dg',
            },
            mb: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'black',
                        scope: 'tab',
                    }),
                description: 'hintDesc_mb',
            },
            mB: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'black',
                        scope: 'global',
                    }),
                description: 'hintDesc_mB',
            },
            ms: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'sepia',
                        scope: 'tab',
                    }),
                description: 'hintDesc_ms',
            },
            mS: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'sepia',
                        scope: 'global',
                    }),
                description: 'hintDesc_mS',
            },
            mp: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'paper',
                        scope: 'tab',
                    }),
                description: 'hintDesc_mp',
            },
            mP: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'paper',
                        scope: 'global',
                    }),
                description: 'hintDesc_mP',
            },
            ml: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'light',
                        scope: 'tab',
                    }),
                description: 'hintDesc_ml',
            },
            mL: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'light',
                        scope: 'global',
                    }),
                description: 'hintDesc_mL',
            },
            me: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'custom',
                        scope: 'tab',
                    }),
                description: 'hintDesc_me',
            },
            mE: {
                action: () =>
                    this._send('setPageMode', {
                        mode: 'custom',
                        scope: 'global',
                    }),
                description: 'hintDesc_mE',
            },
            so: {
                action: () => this._send('muteAllTabs'),
                description: 'hintDesc_so',
            },
            st: {
                action: () => this._send('toggleMuteCurrentTab'),
                description: 'hintDesc_st',
            },
            ctrl_hint: {
                action: null,
                description: 'hintNewTabDesc',
            },
            shift_hint: {
                action: null,
                description: 'hintNewWindowDesc',
            },
            cf_hint: {
                action: null,
                description: 'hintCopyUrlDesc',
            },
            shift_cf_hint: {
                action: null,
                description: 'hintCopyTextDesc',
            },
        };
    }
    async addUserCommand(keys, url, description) {
        await HintCommon.Commands.add(keys, url, description);
        await this.loadUserCommands();
    }
    async removeUserCommand(keys) {
        await HintCommon.Commands.remove(keys);
        await this.loadUserCommands();
    }
    async loadUserCommands() {
        try {
            const uiData = await chrome.storage.sync.get('itg-ui-custom-shortcuts');
            const uiShortcuts = uiData['itg-ui-custom-shortcuts'] || {};

            // NEW: Keep raw reference of all overrides
            this.rawCustomShortcuts = uiShortcuts;
            const defaults = this._getDefaultMappings();

            // Rebuild mappings based on defaults + rawCustomShortcuts
            const newMappings = {};

            // Iterate over defaults to see if they have overrides
            for (const [defKey, defVal] of Object.entries(defaults)) {
                // See if an override exists for this description
                const customKey = uiShortcuts[defVal.description];
                if (customKey) {
                    newMappings[customKey] = defVal;
                } else {
                    // If not, use default
                    newMappings[defKey] = defVal;
                }
            }
            this.mappings = newMappings;
            const userCmds = await HintCommon.Commands.getAll();
            userCmds.forEach((cmd) => {
                // Avoid collision if the user assigned a custom key to a built-in command
                if (!this.mappings[cmd.keys]) {
                    this.mappings[cmd.keys] = {
                        action: () =>
                            this._send('openUrl', {
                                url: cmd.url,
                            }),
                        description: cmd.description,
                    };
                }
            });
        } catch (e) {
            console.error('Error loading commands', e);
        }
    }
    getMappings() {
        return this.mappings;
    }
    // NEW: Getter for raw access
    getRawShortcuts() {
        return this.rawCustomShortcuts;
    }
    _send(action, payload = {}) {
        try {
            if (chrome.runtime && chrome.runtime.id) {
                chrome.runtime.sendMessage({
                    action,
                    ...payload,
                });
            }
        } catch (e) {
            console.warn('[Hint] Failed to send message (context invalidated)', e);
        }
    }
    _translatePage() {
        const targetLang = navigator.language.split('-')[0] || 'en';
        const url = `https://translate.google.com/translate?sl=auto&tl=${targetLang}&u=${encodeURIComponent(window.location.href)}`;
        this._send('openUrl', {
            url,
            inNewTab: false,
        });
    }
    _focusFirstInput() {
        const selectors = [
            'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="image"])',
            'textarea',
            'select',
            '[contenteditable="true"]',
            '[role="textbox"]',
            '[role="searchbox"]',
        ];
        const candidates = document.querySelectorAll(selectors.join(', '));
        for (const input of candidates) {
            if (!Utils.isVisible(input)) continue;
            input.focus();
            if (['INPUT', 'TEXTAREA'].includes(input.tagName)) input.select();
            break;
        }
    }
};
/**
 * @class Main
 * @description Main class that orchestrates all modules.
 */
