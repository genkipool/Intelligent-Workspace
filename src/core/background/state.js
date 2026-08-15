let isModeDebug = false;
let isGrouping = false; // Prevents concurrent grouping operations.
let lastActivity = {}; // Tracks the last interaction time for each group.
let activeGroupId = -1; // The currently focused group.
let enableCollapseTimer = false;
let justClosedTab = false;
let isPopupCurrentlyOpen = false;
let groupIdentifierMap = new Map(); // Session map: groupId -> customIdentifier.
let groupPrefixState = new Map(); // Persistent map: identifier -> group state (prefix, etc.).
let customIdentifier;
let isInitializing = false; // Flag to ignore events during startup.

let enablePrefixes = false;
let groupInfoMap = new Map(); // Session map: groupId -> {type, key, title, isCompact}. Tracks the "true" identity of a group.
let getTypeGroup = false;
let extensionSettings = {}; // Caches all user settings from storage.

let currentLangMessages = {};
let currentLang = 'en';

let groupTabsTimer = null; // Debounce timer for grouping operations.

let clusterConfig = {};
let lastAppliedClusterConfig = {}; // Stores the last cluster config to detect changes.

let tabsEverActive = new Set(); // Tracks tabs that have been active in the session.
let groupExpandedEver = new Map(); // Tracks groups that have been expanded in the session.
let isCreatingMenus = false;
let setupContextMenusTimer = null;
let isSidePanelActive = false;
let isInstallActive = false;
let windowsRemove = false;
let activeSidePanelPath = null;
let pendingPrefixUpdates = new Map();
let isRulesPinned = false;
let isListGroupPinned = false;
let isGeminiPinned = false;
let lastSidePanelPathBeforeFullscreen = null;
let dbPromise = null;
let currentActiveTabId = null;
let previousActiveTabId = null;
let tabModes = new Map();
let cachedConfiguredRuleStorageArea = null;

let bookmarkTreeCache = null;
let duplicateUrlSetCache = null;

// --- Constants ---
const SIDEPANEL_RULE_ID = 1;
const SPLIT_SCREEN_STATE_KEY = 'splitScreenState';
const SCREENSHOT_STORAGE_KEY = 'groupScreenshots';
const INACTIVITY_THRESHOLD_INACTIVE_GROUP = 1;
const INACTIVITY_THRESHOLD_ACTIVE_GROUP = 15;
const MAX_RETRIES = 20;
const RETRY_DELAY = 25;
const STORE_NAME = 'screenshots';
const GEMINI_SCHEDULES_KEY = 'geminiSchedules';
const CONVERSATION_STORE_NAME = 'geminiConversations';
const NOTES_STORE_NAME = 'notesStore';
const BACKUPS_STORE_NAME = 'backupsGroups';
const GEMINI_SESSION_CONVERSATIONS_KEY = 'geminiSessionConversations';

const MODE_CSS = {
    black: `
        html {
            filter: invert(1) hue-rotate(180deg) !important;
            background: #fff  !important;
        }
        html img, html video, html iframe, html [style*="background-image"] {
            filter: invert(1) hue-rotate(180deg) !important;
        }
        ::selection,
        #hint-omni-host,
        #itg-shadow-host {
            filter: invert(1) hue-rotate(180deg) !important;
        }
    `,
    sepia: `
        html {
            filter: sepia(1) !important;
        }
    `,
    paper: `
        html {
            filter: grayscale(100%) !important; 
        }
    `,
    light: `
    html {
        filter: invert(1) hue-rotate(180deg) !important;
        background: #000 !important;
        background-color: #000 !important;
        
    }   

        html img, html video, html iframe, html [style*="background-image"]{
                color: #fff !important;
            filter: invert(1) hue-rotate(180deg) !important;
        }
        ::selection,
        #hint-omni-host,
        #itg-shadow-host {
            filter: invert(1) hue-rotate(180deg) !important;
        }
`,
};

const GLOBAL_MODE_KEY = 'globalPageMode';

const DEFAULT_USER_PREFIXES = {
    lock: '🔒',
    openKey: '🗝️',
    loupe: '🔍',
    checked: '',
    warning: '⚠️',
};

// Prefixes include zero-width spaces (\u200B) to act as unique markers.
let CURRENT_PREFIX_LOCK = DEFAULT_USER_PREFIXES.lock
    ? '\u200B\u200B' + DEFAULT_USER_PREFIXES.lock + ' '
    : '\u200B\u200B';
let CURRENT_PREFIX_OPENKEY = DEFAULT_USER_PREFIXES.openKey
    ? '\u200B\u200B' + DEFAULT_USER_PREFIXES.openKey + ' '
    : '\u200B\u200B';
let CURRENT_PREFIX_LOUPE = DEFAULT_USER_PREFIXES.loupe
    ? '\u200B\u200B' + DEFAULT_USER_PREFIXES.loupe + ' '
    : '\u200B\u200B';
let CURRENT_PREFIX_CHECKED = DEFAULT_USER_PREFIXES.checked
    ? '\u200B\u200B' + DEFAULT_USER_PREFIXES.checked + ' '
    : '\u200B\u200B';
let CURRENT_PREFIX_WARNING = DEFAULT_USER_PREFIXES.warning
    ? '\u200B\u200B' + DEFAULT_USER_PREFIXES.warning + ' '
    : '\u200B\u200B';

// Suffixes and prefixes to identify group types internally.
const DOMAIN_SUFFIX = '\u200B';
const RULE_PREFIX = '\u200B';
const SPECIAL_PREFIX = '\u200B';
const SPECIAL_SUFFIX = '\u200B';

let ALL_MANAGED_PREFIXES = [];
let NON_EMPTY_PREFIXES_FOR_REGEX = [];
let PREFIX_REGEX = new RegExp('^()$', 'g');

const BASE_CURRENT_PREFIX_PRIORITIES = {
    lock: 0,
    openKey: 1,
    loupe: 2,
    checked: 3,
};
let CURRENT_PREFIX_PRIORITIES = {};

const DEFAULT_SYSTEM_THEME = {
    name: 'viridian',
    colors: {
        actionColor: '#16A085',
        bgColor: '#1B2631',
        bgPanelColor: '#233240',
        borderColor: '#34495E',
        errorColor: '#E74C3C',
        headerColor: '#0E6655',
        interactiveColor: '#16A085',
        textColor: '#F5F5F5',
        textOnColor: '#16A085',
    },
};

const DEFAULT_CLUSTER_CONFIG = {
    clusteringEnabled: true,
    domainsEnabled: true,
    domainThreshold: 2,
    compactMode: { enabled: true, threshold: 12 },
    specialGroups: {
        chrome: {
            enabled: true,
            threshold: 1,
            name: 'Chrome:',
            color: 'blue',
            key: 'Chrome',
        },
        files: {
            enabled: true,
            threshold: 1,
            name: 'Files:',
            color: 'green',
            key: 'Files',
        },
        extensions: {
            enabled: true,
            threshold: 1,
            name: 'Extensions:',
            color: 'orange',
            key: 'Extensions',
        },
        misc: {
            enabled: true,
            threshold: 1,
            name: 'Misc',
            color: 'grey',
            key: 'Misc',
        },
        ipAddress: { enabled: true, threshold: 1, key: 'ipAddress' },
    },
};

const DOWNLOADABLE_EXTENSIONS = [
    // Documents
    '.pdf',
    '.doc',
    '.docx',
    '.ppt',
    '.pptx',
    '.xls',
    '.xlsx',
    '.txt',
    '.csv',
    // Compressed Files
    '.zip',
    '.rar',
    '.7z',
    '.tar',
    '.gz',
    // Disk Images and Installers
    '.iso',
    '.img',
    '.exe',
    '.dmg',
    '.apk',
    // Multimedia Files
    '.mp3',
    '.wav',
    '.ogg',
    '.mp4',
    '.mov',
    '.avi',
    '.mkv',
    // Common Images
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.svg',
    '.webp',
];

function matchesPattern(url, pattern) {
    if (pattern === '<all_urls>') {
        return url.startsWith('http:') || url.startsWith('https:') || url.startsWith('file:');
    }

    try {
        // Converts the manifest match pattern to a robust regular expression.
        // 1. Escape all special regex characters.
        // 2. Re-convert the wildcard '\*' to '.*'.
        const regexPattern =
            '^' +
            pattern
                .replace(/[.*+?^${}()|[\]\\]/g, '\\$&') // Escape special characters
                .replace(/\\\*/g, '.*'); // Converts wildcard '*' to '.*'

        return new RegExp(regexPattern).test(url);
    } catch (e) {
        console.error(`[matchesPattern] Invalid regex pattern provided from manifest: "${pattern}"`, e);
        return false;
    }
}
async function injectContentScriptsInAllTabs() {
    logMessage('======================================================================');
    logMessage('[Injector LOG] STARTING content script injection process.');

    try {
        const manifest = chrome.runtime.getManifest();
        const contentScripts = manifest.content_scripts;

        if (!contentScripts || contentScripts.length === 0) {
            logMessage('[Injector LOG] No content scripts found in manifest. Exiting.');
            return;
        }
        logMessage(`[Injector LOG] Found ${contentScripts.length} content script configurations in manifest.`);

        const tabs = await chrome.tabs.query({
            status: 'complete',
            url: ['http://*/*', 'https://*/*', 'file://*/*'],
        });

        if (tabs.length === 0) {
            logMessage('[Injector LOG] No eligible tabs found to inject scripts into. Exiting.');
            return;
        }
        logMessage(`[Injector LOG] Found ${tabs.length} total eligible tabs to process.`);

        const injectionPromises = tabs.map((tab, index) => {
            logMessage(
                `[Injector LOG] [${index + 1}/${tabs.length}] Queuing injection task for Tab ID: ${tab.id}, URL: ${tab.url}`,
            );

            return (async () => {
                // Proceed directly with normal injection.
                for (const script of contentScripts) {
                    if (tab.url.match(/(chrome|chrome-extension):\/\//gi)) {
                        continue;
                    }
                    if (script.matches.some((pattern) => matchesPattern(tab.url, pattern))) {
                        try {
                            if (script.css && script.css.length > 0) {
                                await chrome.scripting.insertCSS({
                                    target: { tabId: tab.id, allFrames: script.all_frames || false },
                                    files: script.css,
                                });
                            }
                            if (script.js && script.js.length > 0 && !script.js.includes('src/utils/iframeSearch.js')) {
                                await chrome.scripting.executeScript({
                                    target: { tabId: tab.id, allFrames: script.all_frames || false },
                                    files: script.js,
                                });
                            }
                        } catch (err) {
                            if (
                                !err.message.includes('Cannot access a chrome:// URL') &&
                                !err.message.includes('The extensions gallery cannot be scripted.')
                            ) {
                                // Error will be thrown to be captured by allSettled.
                            }
                            throw new Error(`Injection failed: ${err.message}`);
                        }
                    }
                }
                return tab;
            })();
        });

        logMessage('[Injector LOG] All injection tasks have been queued. Awaiting results...');
        const results = await Promise.allSettled(injectionPromises);

        logMessage('[Injector LOG] --- DETAILED INJECTION REPORT ---');
        let successCount = 0;
        let failureCount = 0;

        results.forEach((result, index) => {
            const originalTab = tabs[index];
            if (result.status === 'fulfilled') {
                successCount++;
                logMessage(
                    `[Injector REPORT] [${index + 1}/${tabs.length}] [SUCCESS] Tab ID: ${originalTab.id}, URL: ${originalTab.url}`,
                );
            } else {
                failureCount++;
                logMessage(
                    `[Injector REPORT] [${index + 1}/${tabs.length}] [FAILURE] Tab ID: ${originalTab.id}, URL: ${originalTab.url}. Reason: ${result.reason.message}`,
                );
            }
        });

        logMessage('[Injector LOG] --- FINAL SUMMARY ---');
        logMessage(`[Injector SUMMARY] Total tabs processed: ${tabs.length}`);
        logMessage(`[Injector SUMMARY] Successful injections/reloads: ${successCount}`);
        logMessage(`[Injector SUMMARY] Failed injections: ${failureCount}`);
        logMessage('[Injector LOG] Injection process DEFINITIVELY FINISHED.');
        logMessage('======================================================================');
    } catch (e) {
        console.error('[Injector LOG] A CRITICAL ERROR occurred during the main injection process:', e);
    }
}
function handleGetActiveTheme(sendResponse) {
    (async () => {
        const { activeTheme } = await chrome.storage.local.get('activeTheme');
        const themeToSend = activeTheme || DEFAULT_SYSTEM_THEME;

        sendResponse(themeToSend);
    })();
}

async function updatePinState() {
    const result = await chrome.storage.local.get(['isPinned', 'isListGroupPinned', 'isGeminiPinned']);

    isRulesPinned = !!result.isPinned;
    isListGroupPinned = !!result.isListGroupPinned;
    isGeminiPinned = !!result.isGeminiPinned;

    logMessage(
        `Estado del pin actualizado en memoria: Rules=${isRulesPinned}, ListGroup=${isListGroupPinned}, Gemini=${isGeminiPinned}`,
    );

    // Removed chrome.sidePanel.setOptions({ path: ... }) to prevent
    // the active side panel from reloading when the pin state changes.

    // --- CRITICAL FIX ---
    // We ALWAYS remove the popup so the 'onClicked' event always works.
    // This allows us to decide which SidePanel to open (Rules, ListGroup or Popup).
    chrome.action.setPopup({ popup: '' });
    logMessage('Popup disabled and global SidePanel path updated.');
}

function generateCustomThemeCss(colors) {
    if (!colors) return '';

    const variables = Object.entries(colors)
        .map(([key, val]) => `--${key.replace(/([A-Z])/g, '-$1').toLowerCase()}: ${val};`)
        .join(' ');

    // Generic styles to apply theme colors to a generic web page.
    // It is aggressive to be able to override site styles.
    const overrides = `
      /* Generic styles to apply theme colors */
      body, body *, .yt-live-chat-renderer, [class*="video-stream"], [class*="html5-video-player"], [role="listbox"], [role="main"], [role="presentation"]  {
      background-color: var(--bg-color) !important;
          color: var(--text-color) !important;
          border-color: var(--border-color) !important;
      }
    [role="presentation"]:hover {
            color: var(--text-on-color) !important;
            background-color: var(--bg-panel-color) !important;

        }
      a *, button, [role="button"], a.text-secondary {
          color: var(--action-color) !important;

      }

      /* Prevents images, videos, and SVGs from getting a solid background */
      div:not(button) *, img, video, svg, canvas, [style*="background-image"]{
          background-color: transparent !important;
      }

      /* Tries to make input fields readable */
      input, textarea, select, div:has(>ul), [role="listitem"], [data-testid="hoverCardParent"], div:has(>[data-os-fs]),  [role="menu"]   {
           background-color: var(--bg-panel-color) !important;
           color: var(--text-on-color) !important;
      }
  `;

    return `:root { ${variables} } ${overrides}`;
}

async function applyPageMode(tabId, mode, customColors = null) {
    // The CSS to inject into the page.
    let css = '';

    // If customColors are provided, the custom theme CSS is generated.
    if (customColors) {
        css = generateCustomThemeCss(customColors);
    }
    // Otherwise, the predefined CSS from MODE_CSS is used for filter-based modes.
    else if (mode && MODE_CSS[mode]) {
        css = MODE_CSS[mode];
    }

    try {
        // The injection script logic remains the same. It takes the generated CSS
        // and places it in a <style> tag.
        await chrome.scripting.executeScript({
            target: { tabId: tabId },
            func: (cssToInject, appliedMode) => {
                const styleId = 'intelligent-tab-group-mode-style';
                const root = document.documentElement;

                let styleEl = document.getElementById(styleId);
                if (styleEl) {
                    styleEl.remove();
                }

                if (cssToInject) {
                    styleEl = document.createElement('style');
                    styleEl.id = styleId;
                    styleEl.textContent = cssToInject;
                    (document.head || root).appendChild(styleEl);

                    root.setAttribute('data-itg-page-mode', appliedMode || '');
                    root.setAttribute('itg-mode-applied', '');
                } else {
                    root.removeAttribute('data-itg-page-mode');
                    root.removeAttribute('itg-global-mode');
                    root.removeAttribute('itg-mode-applied');
                }
            },
            args: [css, mode],
        });
    } catch (e) {
        if (
            !e.message.includes('Cannot access a chrome:// URL') &&
            !e.message.includes('Cannot access contents of the page')
        ) {
            console.warn(`Could not apply page mode to tab ${tabId}: ${e.message}`);
        }
    }
}
