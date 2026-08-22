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
 * The switch lives in the isolated world, which mirrors it onto <html> as
 * `data-itg-allow-right-click`. It is read on every call rather than once at
 * install time, so turning the feature off takes effect without a reload.
 */
(() => {
    if (window.__itgAllowRightClickHook) return;
    window.__itgAllowRightClickHook = true;

    const FLAG = 'data-itg-allow-right-click';
    const CANCELLED_TYPES = new Set(['contextmenu', 'copy', 'cut', 'paste', 'selectstart', 'dragstart']);
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
                    if (result === false && event?.type === type && isPageWide(this) && isEnabled()) return undefined;
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
})();
