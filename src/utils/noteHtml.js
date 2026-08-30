/**
 * The rich text that ends up inside a note.
 *
 * A note is edited in a `contenteditable` and rendered back with `innerHTML`, so
 * whatever the clipboard carries is laid out inside our card: a copied table brings its
 * column widths, a copied article brings `position`, `float` and pixel widths measured
 * against a page far wider than the panel. The card cannot contain that with CSS alone
 * — an absolutely positioned child is not clipped by `max-width` — so the layout is
 * taken out of the markup before it is ever stored, and only the formatting is kept.
 */

/** Tags kept as they are. Anything else is unwrapped, keeping the text inside. */
const ALLOWED_TAGS = new Set([
    'p',
    'br',
    'div',
    'span',
    'strong',
    'b',
    'em',
    'i',
    'u',
    's',
    'strike',
    'del',
    'ins',
    'mark',
    'small',
    'sub',
    'sup',
    'code',
    'pre',
    'blockquote',
    'q',
    'cite',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'hr',
    'ul',
    'ol',
    'li',
    'dl',
    'dt',
    'dd',
    'a',
    'img',
    'audio',
    'video',
    'source',
    'table',
    'thead',
    'tbody',
    'tfoot',
    'tr',
    'td',
    'th',
    'caption',
    'figure',
    'figcaption',
]);

/** Tags dropped together with everything inside them. */
const DROPPED_TAGS = new Set([
    'script',
    'style',
    'noscript',
    'iframe',
    'object',
    'embed',
    'link',
    'meta',
    'base',
    'form',
    'input',
    'button',
    'select',
    'option',
    'textarea',
    'svg',
    'math',
    'canvas',
    'template',
    'title',
]);

/** Which attributes survive, per tag. Everything else — `style` included — is dropped. */
const ALLOWED_ATTRS = {
    a: ['href', 'title'],
    img: ['src', 'alt', 'title'],
    audio: ['src', 'controls'],
    video: ['src', 'controls', 'poster'],
    source: ['src', 'type'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan', 'scope'],
    ol: ['start'],
};

/**
 * The style properties that say how something looks rather than where it sits.
 *
 * Dropping `style` outright would flatten a pasted quote into plain text, so the
 * declarations that only paint are kept and every one that measures or positions —
 * `width`, `position`, `float`, `margin` — goes, because those are what break out of
 * the card. `white-space` counts as measuring: code copied out of an editor arrives as
 * `pre`, and a line that will not wrap overflows however narrow the box around it is.
 * The card and the editor are `pre-wrap` already, so the indentation survives anyway.
 */
const ALLOWED_STYLES = new Set([
    'color',
    'background-color',
    'font-weight',
    'font-style',
    'font-variant',
    'text-decoration',
    'text-decoration-line',
    'text-align',
    'text-transform',
]);

/** `href` may point at a page, a mail address or one of our own attached PDFs. */
function safeHref(value) {
    const url = String(value || '').trim();
    if (/^(https?:|mailto:|tel:)/i.test(url)) return url;
    if (/^data:application\/pdf/i.test(url)) return url;
    return null;
}

/** `src` may point at a remote asset or at a file the user attached, never at a script. */
function safeSrc(value) {
    const url = String(value || '').trim();
    if (/^https?:/i.test(url)) return url;
    if (/^data:(image|audio|video)\//i.test(url)) return url;
    return null;
}

/** Keeps the declarations in `ALLOWED_STYLES` and returns them, or '' when none survive. */
function cleanStyle(value) {
    const kept = [];
    for (const declaration of String(value || '').split(';')) {
        const colon = declaration.indexOf(':');
        if (colon === -1) continue;
        const property = declaration.slice(0, colon).trim().toLowerCase();
        const setting = declaration.slice(colon + 1).trim();
        if (!setting || !ALLOWED_STYLES.has(property)) continue;
        // A value that calls out of CSS is not a colour, whatever the property says.
        if (/url\(|expression\(|javascript:/i.test(setting)) continue;
        kept.push(`${property}: ${setting}`);
    }
    return kept.join('; ');
}

/** Replaces an element with its own children, so the text it wrapped is not lost. */
function unwrap(el) {
    const parent = el.parentNode;
    if (!parent) return;
    while (el.firstChild) parent.insertBefore(el.firstChild, el);
    parent.removeChild(el);
}

function cleanElement(el) {
    const tag = el.tagName.toLowerCase();

    if (DROPPED_TAGS.has(tag)) {
        el.remove();
        return;
    }

    // Depth first: the children are cleaned while they still have this parent, and an
    // unwrapped parent leaves them where they were.
    for (const child of Array.from(el.children)) cleanElement(child);

    if (!ALLOWED_TAGS.has(tag)) {
        unwrap(el);
        return;
    }

    const allowed = ALLOWED_ATTRS[tag] || [];
    for (const attr of Array.from(el.attributes)) {
        const name = attr.name.toLowerCase();

        if (name === 'style') {
            const style = cleanStyle(attr.value);
            if (style) el.setAttribute('style', style);
            else el.removeAttribute('style');
            continue;
        }

        if (!allowed.includes(name)) {
            el.removeAttribute(attr.name);
            continue;
        }

        if (name === 'href') {
            const href = safeHref(attr.value);
            if (href) el.setAttribute('href', href);
            else el.removeAttribute('href');
        } else if (name === 'src' || name === 'poster') {
            const src = safeSrc(attr.value);
            if (src) {
                el.setAttribute(name, src);
            } else if (name === 'src') {
                // Nothing left to show, and the element would only sit there broken.
                el.remove();
                return;
            } else {
                el.removeAttribute(name);
            }
        }
    }

    if (tag === 'a') {
        // A link whose target was refused is not a link any more; the words it wrapped
        // are still the user's note.
        if (!el.getAttribute('href')) {
            unwrap(el);
            return;
        }
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer');
    }
}

/**
 * Cleans a fragment of note HTML — from the clipboard or from a note saved before this
 * existed — so it carries formatting and no layout.
 *
 * @param {string} html
 * @returns {string} The same content with the unsafe and the oversized taken out.
 */
export function sanitizeNoteHtml(html) {
    if (typeof html !== 'string' || !html) return '';

    // A parsed document is inert: nothing in it loads, and nothing in it runs.
    const doc = new DOMParser().parseFromString(`<body>${html}</body>`, 'text/html');
    for (const child of Array.from(doc.body.children)) cleanElement(child);
    return doc.body.innerHTML;
}
