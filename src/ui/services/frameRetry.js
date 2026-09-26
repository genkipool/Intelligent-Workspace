/**
 * [AI INSTRUCTION]
 * TRY AGAIN, A LITTLE LATER, WHEN THE FRAME COMES UP AS CHROME'S "REFUSED TO CONNECT".
 *
 * Seen on x.com in the user's own browser, logged in: after the x.com tab was reloaded,
 * opening x.com in the panel showed "x.com ha rechazado la conexión", and opening it a
 * second time worked. X's service worker explains it -- its navigation handler, read
 * from the copy in the user's profile, answers AT ONCE from a cached shell
 * (`/home?precache=1`) and refreshes that shell from the network in the background.
 * A shell cached while the panel's rules were down carries `X-Frame-Options: DENY`, and
 * no rule can touch a response that never reaches the network. The background refresh
 * of that same navigation does go out, with the rules up, so the NEXT answer is a
 * framable one. That is why an immediate retry failed too (70 ms: the refresh had not
 * landed yet) and a later one worked.
 *
 * So the frame is watched. Every real document framed here runs `panelScrollbar.js` at
 * `document_start`, and it announces itself before `load`; Chrome's error page runs no
 * content script. A `load` with no announcement is the error page: the frame is hidden
 * rather than show it, and navigated again after a pause long enough for a background
 * refresh to land, with the rules put back first. Twice at most -- a site that refuses
 * for good gets its error page shown, not a reload loop.
 *
 * @param {HTMLIFrameElement} iframe The side browser's frame, before it is attached.
 * @param {string} url What it was asked to show.
 * @param {Window} [win] Where the frames' announcements arrive; the panel itself.
 * @param {{ delays?: number[] }} [options] Pause before each further try, in ms.
 */
export function retryIfFrameRefused(iframe, url, win = window, { delays = [1200, 2500] } = {}) {
    if (!/^https?:/i.test(url)) return;
    let announced = false;
    let attempt = 0;

    const onMessage = (event) => {
        if (event.source === iframe.contentWindow && event.data?.type === 'panel-scrollbar-ready') announced = true;
    };
    const stop = () => {
        win.removeEventListener('message', onMessage);
        iframe.removeEventListener('load', onLoad);
        iframe.style.visibility = '';
    };
    const onLoad = async () => {
        if (announced || !iframe.isConnected || attempt >= delays.length) {
            stop();
            return;
        }
        iframe.style.visibility = 'hidden';
        await new Promise((resolve) => setTimeout(resolve, delays[attempt++]));
        if (!iframe.isConnected) {
            stop();
            return;
        }
        const response = await chrome.runtime.sendMessage({ action: 'prepareUrlForSidePanel', url }).catch(() => null);
        if (!response?.success || !iframe.isConnected) {
            stop();
            return;
        }
        announced = false;
        iframe.src = url;
    };

    win.addEventListener('message', onMessage);
    iframe.addEventListener('load', onLoad);
}
