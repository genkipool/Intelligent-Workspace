/**
 * Popup window that asks for the microphone permission used by the assistant's
 * voice dictation. The side panel cannot request it directly, so it opens this
 * page in a window of its own (see voiceInputService.requestMicrophonePermission).
 */
import { applyTranslations } from '../../../utils/i18n.js';
import { initializeActiveTheme } from '../../../utils/theme.js';

document.addEventListener('DOMContentLoaded', async () => {
    try {
        await initializeActiveTheme();
    } catch (e) {
        console.error('Error initializing theme:', e);
    }

    try {
        await applyTranslations();
    } catch (e) {
        console.error('Error applying translations:', e);
    }

    const requestBtn = document.getElementById('request-btn');
    const statusDiv = document.getElementById('status');

    async function requestPermission() {
        try {
            statusDiv.textContent = '';
            statusDiv.className = 'status';

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            stream.getTracks().forEach((track) => track.stop());

            statusDiv.textContent =
                chrome.i18n.getMessage('permissionGranted') || '¡Permiso concedido! Cerrando esta ventana...';
            statusDiv.className = 'status success';

            setTimeout(() => window.close(), 1000);
        } catch (err) {
            console.error('Error requesting microphone permission:', err);
            statusDiv.textContent =
                chrome.i18n.getMessage('permissionDenied') ||
                "Error al conceder permiso. Por favor, haz clic en 'Permitir' en la ventana emergente.";
            statusDiv.className = 'status error';
        }
    }

    requestBtn.addEventListener('click', requestPermission);

    // Ask straight away, so the user does not need an extra click.
    requestPermission();
});
