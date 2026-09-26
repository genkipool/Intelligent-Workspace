import { applyTranslations, msg } from '../../../utils/i18n.js';

/** Swaps the button label for a moment to confirm the copy, then puts it back. */
function confirmCopy(button, doneKey, idleKey) {
    button.textContent = msg(doneKey);
    setTimeout(() => (button.textContent = msg(idleKey)), 2000);
}

function showImage(mainContent, src) {
    mainContent.replaceChildren();
    mainContent.className = 'image-container';
    const img = document.createElement('img');
    img.src = src;
    mainContent.appendChild(img);
}

document.addEventListener('DOMContentLoaded', async () => {
    // Loads the dictionary of the language picked in the extension and fills the
    // static labels, so every msg() below answers in that language.
    await applyTranslations();

    const loading = document.getElementById('loading');
    const previewId = new URLSearchParams(window.location.search).get('id');
    if (!previewId) {
        loading.textContent = msg('selectionPreviewNoId');
        return;
    }

    const key = `preview_${previewId}`;
    const data = (await chrome.storage.session.get(key))[key];
    if (!data) {
        loading.textContent = msg('selectionPreviewNotFound');
        return;
    }

    const mainContent = document.getElementById('mainContent');
    const headerTitle = document.getElementById('headerTitle');
    const copyBtn = document.getElementById('copyBtn');

    if (data.type === 'selection') {
        headerTitle.textContent = `📝 ${msg('selectionPreviewSelection')}`;
        mainContent.textContent = data.text;
        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(data.text);
            confirmCopy(copyBtn, 'copied', 'copy');
        };
    } else if (data.type === 'image') {
        headerTitle.textContent = `🖼️ ${msg('selectionPreviewImage')}`;
        showImage(mainContent, data.srcUrl);
        copyBtn.textContent = msg('copyUrl');
        copyBtn.onclick = async () => {
            await navigator.clipboard.writeText(data.srcUrl);
            confirmCopy(copyBtn, 'selectionPreviewUrlCopied', 'copyUrl');
        };
    } else if (data.type === 'screenshot') {
        // A gallery capture: only its id was stored, the image itself is too big for
        // the session area and is asked for here.
        const res = await chrome.runtime.sendMessage({ action: 'getOmnibarImageById', id: data.id });
        if (!res?.dataUrl) {
            loading.textContent = msg('selectionPreviewScreenshotNotFound');
            return;
        }
        headerTitle.textContent = `🖼️ ${msg('selectionPreviewImage')}`;
        showImage(mainContent, res.dataUrl);
        copyBtn.onclick = async () => {
            const blob = await (await fetch(res.dataUrl)).blob();
            await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
            confirmCopy(copyBtn, 'copied', 'copy');
        };
    }
});
