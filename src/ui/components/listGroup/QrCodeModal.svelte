<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let { show = false, url = '', title = '', onClose } = $props();

    // Svelte action that renders the QR with the bundled library, picking a random
    // logo from the dino-svg / logo-svg-1..3 templates. The library weighs 278 KB and
    // is only ever needed here, so it is fetched when the modal opens rather than
    // parsed on every page load.
    async function qrCodeAction(node) {
        if (!url) return;

        try {
            const { default: QRCodeStyling } = await import('../../../lib/qr-code-styling.js');
            const logoIds = ['dino-svg', 'logo-svg-1', 'logo-svg-2', 'logo-svg-3'];
            const randomId = logoIds[Math.floor(Math.random() * logoIds.length)];
            const svgTemplate = document.getElementById(randomId);
            const svgString = svgTemplate ? svgTemplate.innerHTML : '';
            const randomSvgUri = 'data:image/svg+xml;base64,' + btoa(svgString);

            const qrCode = new QRCodeStyling({
                width: 256,
                height: 256,
                data: url,
                image: randomSvgUri,
                dotsOptions: { color: '#000000', type: 'rounded' },
                backgroundOptions: { color: '#ffffff' },
                cornersSquareOptions: { type: 'extra-rounded' },
                imageOptions: { imageSize: 0.4, margin: 4 },
            });

            node.innerHTML = '';
            qrCode.append(node);
        } catch (err) {
            console.error('Error initializing QR code:', err);
        }
    }

    function handleClose() {
        onClose?.();
    }

    function handleOverlayKeydown(e) {
        if (e.key === 'Escape') handleClose();
    }
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        tabindex="-1"
        use:dismissOnBackdrop={handleClose}
        onkeydown={handleOverlayKeydown}
    >
        <div class="modal-content qr-code-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <div class="modal-header">
                <h2>{title || $t('qrCodeForUrl')}</h2>
                <button class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button>
            </div>
            <div class="modal-body">
                <div id="qrcode-container" use:qrCodeAction></div>
                <p id="qrcode-url-display">{url}</p>
            </div>
        </div>
    </div>
{/if}
