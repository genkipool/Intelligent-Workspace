/**
 * [AI INSTRUCTION]
 * THE OMNIBAR'S OWN PAGE, FRAMED INTO THE TAB BY OmniBarHost (omnibar-host.js).
 *
 * This frame is an extension page: its requests reach the worker as the extension's
 * own, and the page around it cannot read what it draws. What it still needs from that
 * page goes through `page`, over the port the host opens once the frame has loaded.
 *
 * The port is accepted only when it carries the nonce in this frame's address and comes
 * from this extension. A web page cannot open extension ports at all, so the nonce is
 * there to tell apart the host that made this frame from the content scripts of any
 * other frame.
 */
(() => {
    const nonce = new URLSearchParams(location.search).get('n');
    if (!nonce) return;

    let port = null;
    let seq = 0;
    const pending = new Map();
    const post = (msg) => {
        try {
            if (port) port.postMessage(msg);
        } catch {
            // The host went away with the page.
        }
    };
    const request = (op, args) =>
        new Promise((resolve) => {
            if (!port) return resolve(null);
            const id = ++seq;
            pending.set(id, resolve);
            post({ type: 'request', id, op, args });
        });

    const page = {
        pageMode: null,
        documentPip: false,
        layoutWidth: 0,
        find: (term) => request('find', { term }).then((matches) => matches || []),
        selectMatch: (index, barHeight) => post({ type: 'request', op: 'selectMatch', args: { index, barHeight } }),
        openDocumentPip: (url) => request('openDocumentPip', { url }).then(Boolean),
        openVideoPip: (url) => request('openVideoPip', { url }),
        setClip: (clip) => post({ type: 'clip', clip }),
        closed: () => post({ type: 'closed' }),
    };
    const omniBar = new OmniBar(page);

    chrome.runtime.onConnect.addListener((incoming) => {
        if (port || incoming.name !== `itg-omnibar:${nonce}` || incoming.sender?.id !== chrome.runtime.id) return;
        port = incoming;
        port.onMessage.addListener((msg) => {
            switch (msg?.type) {
                case 'open':
                    page.pageMode = msg.pageMode || null;
                    page.documentPip = !!msg.documentPip;
                    page.layoutWidth = Number(msg.layoutWidth) || 0;
                    // See `colorScheme` in omnibar-host.js.
                    if (msg.colorScheme) document.documentElement.style.colorScheme = String(msg.colorScheme);
                    omniBar.setRegistry({ getRawShortcuts: () => msg.rawShortcuts || {} });
                    omniBar.open();
                    break;
                case 'close':
                    // Not open yet, or already closed: the host still has a frame to remove.
                    if (omniBar.active) omniBar.close();
                    else page.closed();
                    break;
                case 'layout':
                    page.layoutWidth = Number(msg.layoutWidth) || 0;
                    omniBar.applyLayoutWidth();
                    break;
                case 'focus':
                    omniBar.recoverFocus();
                    break;
                case 'reply':
                    pending.get(msg.id)?.(msg.result);
                    pending.delete(msg.id);
                    break;
            }
        });
        port.onDisconnect.addListener(() => {
            port = null;
            pending.forEach((resolve) => resolve(null));
            pending.clear();
        });
        post({ type: 'ready' });
    });
})();
