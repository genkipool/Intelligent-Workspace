<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';
    import { decodeBarcodeFromFile, decodeBarcodeFromDataUrl } from '../../services/qrScannerService.js';
    import { showNotification } from '../../../utils/i18n.js';

    let { show = false, url = '', title = '', initialTab = 'generate', onClose } = $props();

    let activeTab = $state(initialTab || (url ? 'generate' : 'scan'));
    let scanResults = $state([]);
    let isScanning = $state(false);
    let isDragging = $state(false);
    let fileInputEl = $state(null);

    $effect(() => {
        if (show) {
            activeTab = initialTab || (url ? 'generate' : 'scan');
            scanResults = [];
            isScanning = false;
        }
    });

    // Svelte action that renders the QR with the bundled library
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

    async function handleFileSelect(e) {
        const file = e.target?.files?.[0];
        if (!file) return;
        await processFileForQr(file);
    }

    async function processFileForQr(file) {
        if (!file.type.startsWith('image/')) {
            showNotification('invalidImageFile', true);
            return;
        }
        isScanning = true;
        scanResults = [];
        try {
            const results = await decodeBarcodeFromFile(file);
            if (results && results.length > 0) {
                scanResults = results;
                showNotification('qrScanSuccess');
            } else {
                showNotification('noQrFound', true);
            }
        } catch (err) {
            console.error('QR scan error:', err);
            showNotification('errorScanningQr', true);
        } finally {
            isScanning = false;
        }
    }

    function handleDrop(e) {
        e.preventDefault();
        isDragging = false;
        const file = e.dataTransfer?.files?.[0];
        if (file) {
            processFileForQr(file);
        }
    }

    function handleDragOver(e) {
        e.preventDefault();
        isDragging = true;
    }

    function handleDragLeave() {
        isDragging = false;
    }

    async function handleScreenAreaScan() {
        isScanning = true;
        try {
            const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tabs || tabs.length === 0) {
                showNotification('errorFindingTabForScreenshot', true);
                isScanning = false;
                return;
            }

            const activeTabToCapture = tabs[0];

            await new Promise((resolve) => {
                const listener = async (message) => {
                    // Escape closes the selector without capturing anything; the scan
                    // is simply off, and nothing went wrong worth a message.
                    if (message.action === 'areaSelectionCancelled') {
                        chrome.runtime.onMessage.removeListener(listener);
                        resolve();
                        return;
                    }
                    if (message.action === 'areaScreenshotProcessFinished') {
                        chrome.runtime.onMessage.removeListener(listener);
                        if (message.success && message.dataUrl) {
                            try {
                                const results = await decodeBarcodeFromDataUrl(message.dataUrl);
                                if (results && results.length > 0) {
                                    scanResults = results;
                                    showNotification('qrScanSuccess');
                                } else {
                                    showNotification('noQrFound', true);
                                }
                            } catch (scanErr) {
                                console.error('Error decoding captured area:', scanErr);
                                showNotification('noQrFound', true);
                            }
                        } else {
                            showNotification('errorTakingScreenshot', true);
                        }
                        resolve();
                    }
                };
                chrome.runtime.onMessage.addListener(listener);

                chrome.runtime.sendMessage({
                    action: 'injectAreaSelector',
                    tabId: activeTabToCapture.id,
                    saveToGallery: false,
                });
            });
        } catch (err) {
            console.error('Error initiating area scan:', err);
            showNotification('errorTakingScreenshot', true);
        } finally {
            isScanning = false;
        }
    }

    async function copyToClipboard(text) {
        const shortText = text.length > 40 ? text.substring(0, 37) + '...' : text;
        try {
            await navigator.clipboard.writeText(text);
            showNotification('textCopied', false, [shortText]);
        } catch {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            showNotification('textCopied', false, [shortText]);
        }
    }

    function openResultUrl(targetUrl) {
        if (/^https?:\/\//i.test(targetUrl)) {
            chrome.tabs.create({ url: targetUrl });
        } else {
            chrome.tabs.create({ url: `https://www.google.com/search?q=${encodeURIComponent(targetUrl)}` });
        }
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
                <h2>{title || (activeTab === 'generate' ? $t('qrCodeForUrl') : $t('qrScanTitle'))}</h2>
                <button type="button" class="close-modal-btn" title={$tt('close')} onclick={handleClose}>&times;</button
                >
            </div>

            <!-- Tabs: Generate / Scan -->
            <div class="qr-modal-tabs">
                <button
                    type="button"
                    class="qr-modal-tab-btn"
                    class:active={activeTab === 'generate'}
                    onclick={() => (activeTab = 'generate')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="3" y="3" width="7" height="7"></rect>
                        <rect x="14" y="3" width="7" height="7"></rect>
                        <rect x="14" y="14" width="7" height="7"></rect>
                        <rect x="3" y="14" width="7" height="7"></rect>
                    </svg>
                    <span>{$t('qrTabGenerate')}</span>
                </button>
                <button
                    type="button"
                    class="qr-modal-tab-btn"
                    class:active={activeTab === 'scan'}
                    onclick={() => (activeTab = 'scan')}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                        <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                        <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                        <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                        <line x1="7" y1="12" x2="17" y2="12"></line>
                    </svg>
                    <span>{$t('qrTabScan')}</span>
                </button>
            </div>

            <div class="modal-body">
                {#if activeTab === 'generate'}
                    {#if url}
                        <div id="qrcode-container" use:qrCodeAction></div>
                        <p id="qrcode-url-display">{url}</p>
                    {:else}
                        <p class="qr-no-url">{$t('noUrlForQr')}</p>
                    {/if}
                {:else}
                    <!-- Scan Tab Content -->
                    <div class="qr-scanner-content">
                        <!-- Action buttons for scan methods -->
                        <div class="qr-scan-actions">
                            <button
                                type="button"
                                class="qr-action-btn primary"
                                onclick={handleScreenAreaScan}
                                disabled={isScanning}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path d="M21 11V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6"></path>
                                    <circle cx="12" cy="12" r="3"></circle>
                                </svg>
                                <span>{$t('qrScanScreenArea')}</span>
                            </button>

                            <button
                                type="button"
                                class="qr-action-btn secondary"
                                onclick={() => fileInputEl?.click()}
                                disabled={isScanning}
                            >
                                <svg
                                    width="16"
                                    height="16"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="2"
                                >
                                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                                    <polyline points="17 8 12 3 7 8"></polyline>
                                    <line x1="12" y1="3" x2="12" y2="15"></line>
                                </svg>
                                <span>{$t('qrUploadImage')}</span>
                            </button>
                            <input
                                bind:this={fileInputEl}
                                type="file"
                                accept="image/*"
                                class="visually-hidden"
                                onchange={handleFileSelect}
                            />
                        </div>

                        <!-- Drag and Drop Dropzone -->
                        <div
                            class="qr-dropzone"
                            class:dragging={isDragging}
                            role="region"
                            aria-label={$t('qrDragDropPlaceholder')}
                            ondrop={handleDrop}
                            ondragover={handleDragOver}
                            ondragleave={handleDragLeave}
                            onclick={() => fileInputEl?.click()}
                            onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && fileInputEl?.click()}
                            tabindex="0"
                        >
                            {#if isScanning}
                                <div class="qr-scanning-spinner">
                                    <span>{$t('qrScanningInProgress')}</span>
                                </div>
                            {:else}
                                <svg
                                    width="32"
                                    height="32"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke="currentColor"
                                    stroke-width="1.5"
                                >
                                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                                    <polyline points="21 15 16 10 5 21"></polyline>
                                </svg>
                                <p>{$t('qrDragDropPlaceholder')}</p>
                            {/if}
                        </div>

                        <!-- Results List -->
                        {#if scanResults.length > 0}
                            <div class="qr-results-container">
                                <h3>{$t('qrResultsTitle')}</h3>
                                <div class="qr-results-list">
                                    {#each scanResults as res, i (i)}
                                        <div class="qr-result-item">
                                            <div class="qr-result-format-badge">
                                                {res.format.replace('_', ' ').toUpperCase()}
                                            </div>
                                            <div class="qr-result-text" title={res.rawValue}>
                                                {res.rawValue}
                                            </div>
                                            <div class="qr-result-item-actions">
                                                <button
                                                    type="button"
                                                    class="qr-item-btn"
                                                    title={$tt('copy')}
                                                    onclick={() => copyToClipboard(res.rawValue)}
                                                >
                                                    <svg
                                                        width="14"
                                                        height="14"
                                                        viewBox="0 0 24 24"
                                                        fill="none"
                                                        stroke="currentColor"
                                                        stroke-width="2"
                                                    >
                                                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                                                        <path
                                                            d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"
                                                        ></path>
                                                    </svg>
                                                </button>
                                                {#if /^https?:\/\//i.test(res.rawValue)}
                                                    <button
                                                        type="button"
                                                        class="qr-item-btn primary"
                                                        title={$tt('openUrl')}
                                                        onclick={() => openResultUrl(res.rawValue)}
                                                    >
                                                        <svg
                                                            width="14"
                                                            height="14"
                                                            viewBox="0 0 24 24"
                                                            fill="none"
                                                            stroke="currentColor"
                                                            stroke-width="2"
                                                        >
                                                            <path
                                                                d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"
                                                            ></path>
                                                            <polyline points="15 3 21 3 21 9"></polyline>
                                                            <line x1="10" y1="14" x2="21" y2="3"></line>
                                                        </svg>
                                                    </button>
                                                {/if}
                                            </div>
                                        </div>
                                    {/each}
                                </div>
                            </div>
                        {/if}
                    </div>
                {/if}
            </div>
        </div>
    </div>
{/if}

<style>
    .qr-modal-tabs {
        display: flex;
        border-bottom: 1px solid var(--border-color, #333);
        background: var(--bg-color, #1a1a1a);
    }

    .qr-modal-tab-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 10px 14px;
        background: transparent;
        border: none;
        border-bottom: 2px solid transparent;
        color: var(--text-secondary-color, #888);
        font-size: 0.85rem;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .qr-modal-tab-btn:hover {
        color: var(--text-color, #eee);
        background: var(--interactive-color-hover, rgba(255, 255, 255, 0.05));
    }

    .qr-modal-tab-btn.active {
        color: var(--interactive-color, #4f6ef7);
        border-bottom-color: var(--interactive-color, #4f6ef7);
        font-weight: 600;
    }

    .qr-scanner-content {
        display: flex;
        flex-direction: column;
        gap: 14px;
        width: 100%;
    }

    .qr-scan-actions {
        display: flex;
        gap: 8px;
        width: 100%;
    }

    .qr-action-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.8rem;
        cursor: pointer;
        border: 1px solid var(--border-color, #444);
        background: var(--bg-panel-color, #222);
        color: var(--text-color, #eee);
        transition: background-color 0.15s;
    }

    .qr-action-btn.primary {
        background: var(--interactive-color, #3f51b5);
        border-color: var(--interactive-color, #3f51b5);
        color: #fff;
    }

    .qr-action-btn:hover:not(:disabled) {
        opacity: 0.9;
    }

    .qr-action-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }

    .qr-dropzone {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 20px;
        border: 2px dashed var(--border-color, #444);
        border-radius: 8px;
        background: var(--bg-color, #181818);
        cursor: pointer;
        color: var(--text-secondary-color, #888);
        font-size: 0.8rem;
        transition: all 0.2s ease;
    }

    .qr-dropzone:hover,
    .qr-dropzone.dragging {
        border-color: var(--interactive-color, #4f6ef7);
        background: var(--interactive-color-hover, rgba(79, 110, 247, 0.08));
        color: var(--text-color, #eee);
    }

    .qr-results-container {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-top: 4px;
        text-align: left;
    }

    .qr-results-container h3 {
        font-size: 0.85rem;
        color: var(--text-color, #eee);
        margin: 0;
    }

    .qr-results-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        max-height: 140px;
        overflow-y: auto;
    }

    .qr-result-item {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 10px;
        background: var(--bg-panel-color, #242424);
        border: 1px solid var(--border-color, #333);
        border-radius: 6px;
    }

    .qr-result-format-badge {
        font-size: 0.65rem;
        padding: 2px 4px;
        background: var(--interactive-color, #3f51b5);
        color: #fff;
        border-radius: 3px;
        font-weight: bold;
    }

    .qr-result-text {
        flex: 1;
        font-size: 0.8rem;
        color: var(--text-color, #eee);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        font-family: monospace;
    }

    .qr-result-item-actions {
        display: flex;
        gap: 4px;
    }

    .qr-item-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 26px;
        height: 26px;
        border-radius: 4px;
        border: 1px solid var(--border-color, #444);
        background: transparent;
        color: var(--text-color, #eee);
        cursor: pointer;
    }

    .qr-item-btn:hover {
        background: var(--interactive-color-hover, rgba(255, 255, 255, 0.1));
    }

    .qr-item-btn.primary {
        background: var(--interactive-color, #3f51b5);
        border-color: var(--interactive-color, #3f51b5);
        color: #fff;
    }

    .qr-no-url {
        font-size: 0.85rem;
        color: var(--text-secondary-color, #888);
        font-style: italic;
    }
</style>
