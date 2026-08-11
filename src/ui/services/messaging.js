/**
 * MessagingService — typed message passing between UI and Service Worker.
 *
 * Why a service instead of direct chrome.runtime.sendMessage:
 * - All message actions are documented in one place
 * - Consistent error handling (timeout, disconnects)
 * - Easy to add interceptors for logging/debugging
 * - Port management for long-lived connections
 */

const DEFAULT_TIMEOUT = 5000;

class MessagingService {
    constructor() {
        this._ports = new Map();
        this._responseTimeout = DEFAULT_TIMEOUT;
    }

    /**
     * Send a message to the service worker and wait for response.
     */
    async send(action, payload = {}) {
        return new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                reject(new Error(`Messaging timeout: ${action}`));
            }, this._responseTimeout);

            try {
                chrome.runtime.sendMessage({ action, ...payload }, (response) => {
                    clearTimeout(timer);
                    if (chrome.runtime.lastError) {
                        reject(new Error(chrome.runtime.lastError.message));
                    } else {
                        resolve(response);
                    }
                });
            } catch (err) {
                clearTimeout(timer);
                reject(err);
            }
        });
    }

    /**
     * Send a fire-and-forget message (no response expected).
     */
    notify(action, payload = {}) {
        try {
            chrome.runtime.sendMessage({ action, ...payload });
        } catch (err) {
            // Silently fail for fire-and-forget
        }
    }

    /**
     * Open a long-lived port connection.
     * Returns a port object with .send() and .onMessage().
     */
    connect(name) {
        if (this._ports.has(name)) {
            return this._ports.get(name);
        }

        const port = chrome.runtime.connect({ name });

        const wrapper = {
            send: (action, payload = {}) => {
                try {
                    port.postMessage({ action, ...payload });
                } catch (err) {
                    console.error(`[Messaging] Port ${name} send failed:`, err);
                }
            },
            onMessage: (callback) => {
                port.onMessage.addListener(callback);
                return () => port.onMessage.removeListener(callback);
            },
            onDisconnect: (callback) => {
                port.onDisconnect.addListener(callback);
                return () => port.onDisconnect.removeListener(callback);
            },
            disconnect: () => {
                try {
                    port.disconnect();
                } catch (e) {
                    /* ignore */
                }
                this._ports.delete(name);
            },
        };

        this._ports.set(name, wrapper);
        return wrapper;
    }

    /**
     * Configure response timeout.
     */
    setTimeout(ms) {
        this._responseTimeout = ms;
    }
}

export const messaging = new MessagingService();

// ─── Action constants (single source of truth) ───
export const ACTIONS = {
    // Groups
    GROUP_TABS: 'groupTabs',
    FORCE_SYNC: 'forceSync',
    REGROUP_ALL: 'regroupAllTabs',
    TOGGLE_ALL_EXPAND: 'toggleAllExpand',

    // Rules
    ADD_RULE: 'addRule',
    EDIT_RULE: 'editRule',
    DELETE_RULE: 'deleteRule',
    REORDER_RULES: 'reorderRules',
    TOGGLE_RULE: 'toggleRule',
    TOGGLE_ALL_RULES: 'toggleAllRules',

    // Tabs
    CREATE_TAB: 'createNewTab',
    MUTE_ALL: 'muteAllTabs',
    TOGGLE_MUTE_CURRENT: 'toggleMuteCurrentTab',

    // Bookmarks
    GET_BOOKMARKS: 'getBookmarks',
    CREATE_BOOKMARK: 'createBookmark',
    DELETE_BOOKMARK: 'deleteBookmark',

    // History
    GET_HISTORY: 'getHistory',
    DELETE_HISTORY_ITEM: 'deleteHistoryItem',

    // Screenshots
    CAPTURE_VISIBLE: 'captureVisibleTab',
    CAPTURE_AREA: 'captureArea',

    // Gemini
    GEMINI_QUERY: 'geminiQuery',
    GEMINI_STREAM: 'geminiStream',

    // Pomodoro
    POMODORO_GET_STATE: 'pomodoroGetState',
    POMODORO_START: 'pomodoroStart',
    POMODORO_PAUSE: 'pomodoroPause',
    POMODORO_RESET: 'pomodoroReset',

    // Themes
    THEME_CHANGED: 'themeChanged',

    // Navigation
    SIDE_PANEL_PATH_UPDATED: 'sidePanelPathUpdated',

    // Settings
    HINT_STATUS_CHANGED: 'hintStatusChanged',
    LANGUAGE_CHANGED: 'languageChanged',

    // View
    TOGGLE_VIEWS: 'toggleViews',
};
