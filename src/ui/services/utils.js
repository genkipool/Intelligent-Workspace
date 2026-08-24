export const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
    };
};

export function sanitizeFilename(filename) {
    if (!filename || filename.trim() === '') {
        return 'gemini_conversation';
    }
    return filename
        .replace(/[<>:"/\\|?*]/g, '_')
        .substring(0, 100)
        .trim();
}

export function normalizeUrl(url) {
    if (!url) return '';
    return url
        .toLowerCase()
        .replace(/^(https?:\/\/)?(www\.)?/, '')
        .replace(/\/$/, '');
}

export function isDomainInAnyRule(domain, rules) {
    if (!domain || !rules || rules.length === 0) {
        return false;
    }
    return rules.some((rule) => rule.urls.some((url) => url.includes(domain)));
}

export function correctFaviconUrl(faviconUrl) {
    if (!faviconUrl || typeof faviconUrl !== 'string') {
        return faviconUrl;
    }

    if (
        faviconUrl.toLowerCase().includes('web.whatsapp.com/favicon') ||
        faviconUrl.toLowerCase().includes('web.whatsapp.com/img/favicon') ||
        faviconUrl.toLowerCase().includes('https://web.whatsapp.com')
    ) {
        return 'https://web.whatsapp.com/favicon.ico';
    }

    return faviconUrl;
}

/**
 * Whether a tab's own favicon can be drawn on one of our pages.
 *
 * A tab belonging to another extension reports a favicon inside that extension
 * (`chrome-extension://<id>/icons/icon32.png`), and Chrome refuses to serve it to anyone
 * outside unless that extension published it in `web_accessible_resources`, which almost
 * none do. The image then fails and the refusal is written to the console of whoever
 * asked. Asking the favicon service instead costs nothing and says nothing.
 *
 * `chrome://` and `about:` pages have no favicon to give in the first place.
 */
export function isLoadableFavicon(faviconUrl) {
    if (!faviconUrl || typeof faviconUrl !== 'string') return false;
    if (faviconUrl.startsWith('chrome://') || faviconUrl.startsWith('chrome-untrusted://')) return false;
    if (faviconUrl.startsWith('about:')) return false;
    if (faviconUrl.startsWith('chrome-extension://')) {
        return faviconUrl.startsWith(`chrome-extension://${chrome.runtime.id}/`);
    }
    return true;
}

export function animateAndRemove(element, isGroup = false) {
    if (!element) return;

    if (isGroup) {
        element.style.height = `${element.offsetHeight}px`;

        requestAnimationFrame(() => {
            element.classList.add('collapsing');
        });

        element.addEventListener(
            'transitionend',
            () => {
                element.remove();
            },
            { once: true },
        );
    } else {
        element.style.transition =
            'opacity 0.2s ease, transform 0.2s ease, height 0.2s ease, padding 0.2s ease, margin 0.2s ease';
        element.style.opacity = '0';
        element.style.height = '0';
        element.style.padding = '0';
        element.style.margin = '0';
        element.addEventListener('transitionend', () => element.remove(), { once: true });
    }
}

export async function dataUrlToBlob(dataUrl) {
    const response = await fetch(dataUrl);
    return await response.blob();
}

export async function copyRichTextToClipboard(htmlContent, plainTextContent) {
    try {
        const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
        const textBlob = new Blob([plainTextContent], { type: 'text/plain' });

        const clipboardItem = new ClipboardItem({
            'text/html': htmlBlob,
            'text/plain': textBlob,
        });

        await navigator.clipboard.write([clipboardItem]);
        return true;
    } catch (error) {
        console.error('Error copying rich text, trying plain text:', error);
        try {
            await navigator.clipboard.writeText(plainTextContent);
            return true;
        } catch (fallbackError) {
            console.error('Error copying fallback plain text:', fallbackError);
            return false;
        }
    }
}

export function unhighlight(container) {
    if (!container) return;
    const highlights = container.querySelectorAll('span.search-highlight');
    highlights.forEach((span) => {
        const parent = span.parentNode;
        if (parent) {
            parent.replaceChild(document.createTextNode(span.textContent), span);
            parent.normalize();
        }
    });
}

export function highlight(node, searchTerm, isRegex) {
    if (node.nodeType === 3) {
        const text = node.nodeValue;
        let regex;
        try {
            const pattern = isRegex ? searchTerm : searchTerm.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            if (!pattern) return;
            regex = new RegExp(`(${pattern})`, 'gi');
        } catch {
            return;
        }

        if (regex.test(text)) {
            const fragment = document.createDocumentFragment();
            text.split(regex).forEach((part, index) => {
                if (index % 2 === 1) {
                    const span = document.createElement('span');
                    span.className = 'search-highlight';
                    span.textContent = part;
                    fragment.appendChild(span);
                } else if (part) {
                    fragment.appendChild(document.createTextNode(part));
                }
            });

            if (fragment.hasChildNodes() && node.parentNode) {
                node.parentNode.replaceChild(fragment, node);
            }
        }
    } else if (
        node.nodeType === 1 &&
        node.childNodes &&
        !/script|style/i.test(node.tagName) &&
        !node.classList.contains('search-highlight')
    ) {
        Array.from(node.childNodes).forEach((child) => highlight(child, searchTerm, isRegex));
    }
}

export async function getGroupInfoMap() {
    try {
        const data = await chrome.storage.session.get('groupInfoMap');
        if (data.groupInfoMap) {
            return new Map(Object.entries(data.groupInfoMap).map(([k, v]) => [parseInt(k, 10), v]));
        }
    } catch (error) {
        console.error('Error getting groupInfoMap from chrome.storage.session:', error);
    }
    return new Map();
}

export async function getGroupPrefixState() {
    try {
        const data = await chrome.storage.local.get('groupPrefixState');
        if (data.groupPrefixState) {
            return new Map(Object.entries(data.groupPrefixState));
        }
    } catch (error) {
        console.error('Error loading groupPrefixState from chrome.storage.local:', error);
    }
    return new Map();
}

export async function getTotalScreenshotCount() {
    const SCREENSHOT_STORAGE_KEY = 'groupScreenshots';
    const { [SCREENSHOT_STORAGE_KEY]: storedScreenshots = {} } =
        await chrome.storage.session.get(SCREENSHOT_STORAGE_KEY);
    let total = 0;
    for (const key in storedScreenshots) {
        if (key.startsWith('g_')) {
            total += storedScreenshots[key].length;
        }
    }
    return total;
}

export function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtDur(sec) {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    if (h > 0) return `${h}h ${m}m ${s}s`;
    if (m > 0) return `${m}m ${s}s`;
    return `${s}s`;
}

export function fmtDate(ts) {
    return ts ? new Date(ts).toLocaleString() : '—';
}

export function fmtTime(ts) {
    return ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—';
}

export function fmtHMS(secs) {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function getModeDuration(state) {
    if (state.currentMode === 'work') return state.workDuration;
    if (state.currentMode === 'short') return state.shortBreak;
    return state.longBreak;
}

export function isBreak(mode) {
    return mode === 'short' || mode === 'long';
}

export function formatDateYMD(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

export function groupHistoryByDate(historyItems) {
    const groups = new Map();

    historyItems.forEach((item) => {
        const date = new Date(item.lastVisitTime);

        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();

        const groupLabel = `${day}-${month}-${year}`;

        const groupKey = date.setHours(0, 0, 0, 0);

        if (!groups.has(groupKey)) {
            groups.set(groupKey, {
                label: groupLabel,
                timestamp: groupKey,
                items: [],
            });
        }
        groups.get(groupKey).items.push(item);
    });

    return Array.from(groups.values()).sort((a, b) => b.timestamp - a.timestamp);
}

export function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

export function linkifyHtml(text) {
    if (!text) return '';
    const escapedText = escapeHtml(text);
    const urlRegex = /(https?:\/\/[^\s]*[^.!,?;:\s])/g;

    return escapedText.replace(urlRegex, (url) => {
        return `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`;
    });
}

export function autolink(element) {
    const urlRegex = /((https?:\/\/|www\.)[\w\.-]+\.[\w\.-]+[\/\w\.-?&=#%~]*)/g;

    function traverse(node) {
        if (node.nodeName.toLowerCase() === 'a') {
            return;
        }

        const children = Array.from(node.childNodes);
        for (const child of children) {
            traverse(child);
        }

        if (node.nodeType === 3) {
            const text = node.textContent;
            if (urlRegex.test(text)) {
                const fragment = document.createDocumentFragment();
                let lastIndex = 0;

                text.replace(urlRegex, (match, url, _protocol, offset) => {
                    if (offset > lastIndex) {
                        fragment.appendChild(document.createTextNode(text.substring(lastIndex, offset)));
                    }

                    const a = document.createElement('a');
                    let href = url;
                    if (!href.startsWith('http://') && !href.startsWith('https://')) {
                        href = 'http://' + href;
                    }
                    a.href = href;
                    a.target = '_blank';
                    a.rel = 'noopener noreferrer';
                    a.textContent = url;
                    fragment.appendChild(a);

                    lastIndex = offset + match.length;
                });

                if (lastIndex < text.length) {
                    fragment.appendChild(document.createTextNode(text.substring(lastIndex)));
                }

                if (node.parentNode) {
                    node.parentNode.replaceChild(fragment, node);
                }
            }
        }
    }

    traverse(element);
}

export function getRelativeTime(timestamp) {
    if (!timestamp) return '';
    const now = Date.now();
    const diff = now - timestamp;

    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (seconds < 60) return chrome.i18n.getMessage('justNow') || 'just now';
    if (minutes < 60) return `${minutes} min ago`;
    if (hours < 24) return `${hours} h ago`;
    return `${days} days ago`;
}

/**
 * Ids of the live groups holding tabs already restored from a backup.
 *
 * Those tabs stay listed on the backup card they came from, so their group is neither
 * a card of its own nor a group left to put away.
 *
 * @param {Record<string, object>} backups
 * @returns {Set<number>}
 */
export function linkedGroupIds(backups) {
    return new Set(
        Object.values(backups || {})
            .map((data) => data?.linkedGroupId)
            .filter(Boolean),
    );
}
