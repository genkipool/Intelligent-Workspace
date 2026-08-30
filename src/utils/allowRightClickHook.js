/**
 * RIGHT-CLICK AND COPY UNBLOCKER (main world)
 *
 * Runs in the page's own JavaScript context so it can reach the DOM machinery a
 * site uses to take the context menu, the selection and the clipboard away from
 * the user: `event.preventDefault()`, `event.returnValue = false`, an `on*`
 * handler that returns false, and `Selection.removeAllRanges()`.
 *
 * The cancellation is dropped, not the event. A content script could stop these
 * events from ever reaching the page — that is what most "allow right click"
 * extensions do — but then a code editor never sees the paste, a board never sees
 * the drag, and a site with its own context menu is left with nothing at all.
 * Here the site's handler still runs exactly as it was written; only its attempt
 * to cancel the browser's default action is ignored. That is what makes this safe
 * to leave on everywhere by default.
 *
 * Only the event types a page uses to block are touched, so the patch costs one
 * Set lookup for every other `preventDefault()` call. Right-button `mousedown` and
 * `mouseup` count too: cancelling those is only ever done to kill the menu.
 *
 * Where the cancel comes from decides whether it is one. Blocking is written once
 * for the whole page — on the document, the window, <body>, or an attribute in the
 * markup — while an application that means to replace the menu, the copy or the
 * paste hangs its handler on the element it owns: Excalidraw cancels from its own
 * root div, a code editor from its editing surface. So only page-wide cancels are
 * dropped, and those applications keep working exactly as before instead of
 * getting the browser menu on top of their own.
 *
 * Paste is the exception, and it has its own section at the end of the file: an
 * application's paste is page-wide too, so its cancel is honoured and the paste
 * is restored afterwards only if the page turned out to be blocking.
 *
 * The switch lives in the isolated world, which mirrors it onto <html> as
 * `data-itg-allow-right-click`. It is read on every call rather than once at
 * install time, so turning the feature off takes effect without a reload.
 */
(() => {
    if (window.__itgAllowRightClickHook) return;
    window.__itgAllowRightClickHook = true;

    const FLAG = 'data-itg-allow-right-click';
    const CANCELLED_TYPES = new Set(['contextmenu', 'copy', 'cut', 'selectstart', 'dragstart']);
    const ON_PROPS = {
        oncontextmenu: 'contextmenu',
        oncopy: 'copy',
        oncut: 'cut',
        onpaste: 'paste',
        onselectstart: 'selectstart',
        ondragstart: 'dragstart',
    };

    const isEnabled = () => document.documentElement?.hasAttribute(FLAG) === true;

    /** Whether a handler on this node speaks for the whole page. */
    const isPageWide = (node) =>
        node === document || node === window || node === document.documentElement || node === document.body;

    /** True when cancelling this event would be a block rather than normal behaviour. */
    const isBlockAttempt = (event) => {
        const type = event?.type;
        const cancellable =
            CANCELLED_TYPES.has(type) ||
            // A left button press is cancelled by every drag handle and slider out
            // there; the right one has no such use.
            ((type === 'mousedown' || type === 'mouseup') && event.button === 2);
        return cancellable && isPageWide(event.currentTarget) && isEnabled();
    };

    // preventDefault()
    try {
        const native = Event.prototype.preventDefault;
        const patched = function preventDefault() {
            if (isBlockAttempt(this)) return;
            return native.call(this);
        };
        Object.defineProperty(Event.prototype, 'preventDefault', {
            value: patched,
            writable: true,
            configurable: true,
            enumerable: false,
        });
    } catch (e) {
        console.warn('[ITG] allow right-click: preventDefault', e);
    }

    // event.returnValue = false — the pre-DOM2 way of saying the same thing.
    try {
        const descriptor = Object.getOwnPropertyDescriptor(Event.prototype, 'returnValue');
        if (descriptor?.set && descriptor.get) {
            Object.defineProperty(Event.prototype, 'returnValue', {
                configurable: true,
                enumerable: descriptor.enumerable,
                get() {
                    return descriptor.get.call(this);
                },
                set(value) {
                    if (value === false && isBlockAttempt(this)) return;
                    descriptor.set.call(this, value);
                },
            });
        }
    } catch (e) {
        console.warn('[ITG] allow right-click: returnValue', e);
    }

    /**
     * `document.oncontextmenu = () => false` cancels the event without ever calling
     * preventDefault, so the property setters are wrapped to swallow that false.
     * The getter hands back the site's own function, so code that reads the handler
     * back — or removes it by comparison — still sees what it installed.
     */
    const wrapHandlerProperty = (target, prop, type) => {
        const descriptor = Object.getOwnPropertyDescriptor(target, prop);
        if (!descriptor?.set || !descriptor.get) return;
        Object.defineProperty(target, prop, {
            configurable: true,
            enumerable: descriptor.enumerable,
            get() {
                const current = descriptor.get.call(this);
                return current?.__itgOriginal ?? current;
            },
            set(handler) {
                if (typeof handler !== 'function') {
                    descriptor.set.call(this, handler);
                    return;
                }
                const wrapped = function (event) {
                    const result = handler.apply(this, arguments);
                    if (
                        result === false &&
                        event?.type === type &&
                        CANCELLED_TYPES.has(type) &&
                        isPageWide(this) &&
                        isEnabled()
                    )
                        return undefined;
                    return result;
                };
                wrapped.__itgOriginal = handler;
                descriptor.set.call(this, wrapped);
            },
        });
    };

    for (const [prop, type] of Object.entries(ON_PROPS)) {
        for (const target of [
            typeof HTMLElement !== 'undefined' && HTMLElement.prototype,
            typeof SVGElement !== 'undefined' && SVGElement.prototype,
            typeof Document !== 'undefined' && Document.prototype,
            typeof Window !== 'undefined' && Window.prototype,
        ]) {
            if (!target) continue;
            try {
                wrapHandlerProperty(target, prop, type);
            } catch (e) {
                console.warn('[ITG] allow right-click: on-handler', prop, e);
            }
        }
    }

    /**
     * `<body oncontextmenu="return false">` never goes through the setter above:
     * the parser installs the handler itself, and it survives the attribute being
     * removed once the browser has compiled it. Assigning null to the property is
     * what actually retires it, and only the page's own context can do that —
     * Chrome keeps a separate handler slot per world, so a content script clearing
     * it from the isolated side leaves the page's copy running.
     *
     * The attribute is remembered, so switching the feature off puts the page back
     * exactly as it was written.
     */
    {
        const ATTRIBUTES = Object.keys(ON_PROPS);
        const stripped = new Map();
        let observer = null;

        const strip = (root) => {
            if (!root?.querySelectorAll) return;
            const selector = ATTRIBUTES.map((name) => `[${name}]`).join(',');
            const found = root.matches?.(selector)
                ? [root, ...root.querySelectorAll(selector)]
                : root.querySelectorAll(selector);
            for (const element of found) {
                for (const name of ATTRIBUTES) {
                    const value = element.getAttribute(name);
                    if (value === null) continue;
                    let saved = stripped.get(element);
                    if (!saved) stripped.set(element, (saved = {}));
                    if (!(name in saved)) saved[name] = value;
                    element.removeAttribute(name);
                    element[name] = null;
                }
            }
        };

        const restore = () => {
            for (const [element, saved] of stripped) {
                for (const [name, value] of Object.entries(saved)) {
                    if (!element.hasAttribute(name)) element.setAttribute(name, value);
                }
            }
            stripped.clear();
        };

        const sweep = () => strip(document.documentElement);

        const activate = () => {
            if (observer) return;
            observer = new MutationObserver((records) => {
                for (const record of records) {
                    if (record.target.hasAttribute(record.attributeName)) strip(record.target);
                }
            });
            observer.observe(document.documentElement, {
                attributes: true,
                subtree: true,
                attributeFilter: ATTRIBUTES,
            });
            // The parser sets its attributes before inserting the node, so those
            // never produce a mutation record and the document is swept instead.
            sweep();
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', sweep, { once: true });
            }
        };

        const deactivate = () => {
            if (!observer) return;
            observer.disconnect();
            observer = null;
            document.removeEventListener('DOMContentLoaded', sweep);
            restore();
        };

        const follow = () => (isEnabled() ? activate() : deactivate());
        try {
            new MutationObserver(follow).observe(document.documentElement, {
                attributes: true,
                attributeFilter: [FLAG],
            });
            follow();
        } catch (e) {
            console.warn('[ITG] allow right-click: inline handlers', e);
        }
    }

    /**
     * Clearing the selection is the other half of copy blocking, but it is also
     * something rich text editors do for their own reasons. The call is only
     * ignored while the page is reacting to the selection being made or copied —
     * an editor has no reason to wipe the selection there, and a blocker has no
     * other moment to do it.
     */
    try {
        let reacting = false;
        const arm = () => {
            if (reacting) return;
            reacting = true;
            setTimeout(() => {
                reacting = false;
            }, 0);
        };
        for (const type of ['selectionchange', 'copy', 'cut', 'contextmenu']) {
            document.addEventListener(type, arm, true);
        }

        for (const name of ['removeAllRanges', 'empty']) {
            const native = Selection.prototype[name];
            if (typeof native !== 'function') continue;
            Object.defineProperty(Selection.prototype, name, {
                value: function () {
                    if (reacting && isEnabled()) return;
                    return native.apply(this, arguments);
                },
                writable: true,
                configurable: true,
                enumerable: false,
            });
        }
    } catch (e) {
        console.warn('[ITG] allow right-click: selection', e);
    }
    /**
     * PASTE
     *
     * Paste is the one cancel that must not be dropped. An application that builds
     * its own paste cancels the event and inserts the clipboard itself, and it does
     * so page-wide by design: Telegram listens on `document` for every
     * contenteditable in the app, and a framework that delegates its events —
     * Telegram Web A does — routes every onPaste through `document` as well. Ignore
     * that cancel and both insertions happen, so the text lands twice. No test on
     * where the handler sits can tell those apart, because they really are on the
     * document.
     *
     * The cancel is therefore left alone, and the paste is put back afterwards
     * instead. Once the event is over, a paste that was cancelled by a page that
     * never once looked at the clipboard, into a field still holding exactly what it
     * held before, was a block and nothing else — and only then is the text typed in
     * here. Anything that pastes for itself has to read the clipboard to do it, and
     * reading it is what marks the event as handled.
     *
     * What comes back is the plain text, not the formatting: a page that blocks
     * pasting is asking for a string in a field, and inserting it as typed input is
     * also what leaves the page's own oninput validation with something to react to.
     */
    try {
        const HANDLED = Symbol('itgClipboardRead');
        /** Set while this file is the one reading, so our own read marks nothing. */
        let internal = false;
        /** The cancelled paste still waiting to be judged, if any. */
        let pending = null;

        const markHandled = (event) => {
            if (!internal && event) event[HANDLED] = true;
        };

        // Reading `event.clipboardData` is the page saying it will do the paste.
        const descriptor = Object.getOwnPropertyDescriptor(ClipboardEvent.prototype, 'clipboardData');
        if (descriptor?.get) {
            Object.defineProperty(ClipboardEvent.prototype, 'clipboardData', {
                configurable: true,
                enumerable: descriptor.enumerable,
                get() {
                    markHandled(this);
                    return descriptor.get.call(this);
                },
            });
        }

        // The asynchronous way of reading it counts the same, as long as it is asked
        // for while a cancelled paste is still being judged.
        for (const name of ['read', 'readText']) {
            const native = typeof Clipboard !== 'undefined' && Clipboard.prototype[name];
            if (typeof native !== 'function') continue;
            Object.defineProperty(Clipboard.prototype, name, {
                value: function () {
                    markHandled(pending);
                    return native.apply(this, arguments);
                },
                writable: true,
                configurable: true,
                enumerable: false,
            });
        }

        /** The field the paste was aimed at, or null if it cannot receive text. */
        const editableTarget = (event) => {
            const node = event.target?.nodeType === Node.ELEMENT_NODE ? event.target : document.activeElement;
            const element = node?.closest?.('input, textarea, [contenteditable]');
            if (!element) return null;
            if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
                return element.readOnly || element.disabled ? null : element;
            }
            return element.isContentEditable ? element : null;
        };

        /** Enough of the field to tell whether anything was inserted after all. */
        const contentOf = (element) =>
            element.tagName === 'INPUT' || element.tagName === 'TEXTAREA' ? element.value : element.innerHTML;

        window.addEventListener(
            'paste',
            (event) => {
                if (!isEnabled()) return;
                const target = editableTarget(event);
                if (!target) return;

                // The clipboard is only alive while the event is being dispatched.
                internal = true;
                const text = event.clipboardData?.getData('text/plain') ?? '';
                internal = false;
                if (!text) return;

                const before = contentOf(target);
                pending = event;
                setTimeout(() => {
                    pending = null;
                    if (!event.defaultPrevented || event[HANDLED]) return;
                    if (document.activeElement !== target || contentOf(target) !== before) return;
                    document.execCommand('insertText', false, text);
                });
            },
            true,
        );
    } catch (e) {
        console.warn('[ITG] allow right-click: paste', e);
    }
})();
