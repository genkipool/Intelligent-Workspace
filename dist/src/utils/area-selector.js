// area-selector.js

(() => {
    // Prevents the script from running multiple times on the same page
    if (document.querySelector('.area-selector-overlay-itg')) {
        return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'area-selector-overlay-itg';
    document.body.appendChild(overlay);

    const selectionBox = document.createElement('div');
    selectionBox.className = 'area-selector-box-itg';
    overlay.appendChild(selectionBox);

    const tooltip = document.createElement('div');
    tooltip.className = 'area-selector-tooltip-itg';
    overlay.appendChild(tooltip);

    let startX,
        startY,
        isDrawing = false;

    const cleanup = () => {
        if (overlay) {
            overlay.remove();
        }

        document.removeEventListener('keydown', handleKeydown);
    };

    // Store dataUrl in session storage for the side panel to copy after focus restoration
    chrome.runtime.onMessage.addListener(function onAreaFinish(msg) {
        if (msg.action === 'areaScreenshotProcessFinished') {
            chrome.runtime.onMessage.removeListener(onAreaFinish);
        }
    });

    const handleKeydown = (e) => {
        if (e.key === 'Escape') {
            cleanup();
        }
    };

    overlay.addEventListener('mousedown', (e) => {
        e.preventDefault();
        isDrawing = true;
        startX = e.clientX;
        startY = e.clientY;
        selectionBox.style.left = `${startX}px`;
        selectionBox.style.top = `${startY}px`;
        selectionBox.style.width = '0px';
        selectionBox.style.height = '0px';
        tooltip.style.display = 'block';
    });

    overlay.addEventListener('mousemove', (e) => {
        if (!isDrawing) return;
        const currentX = e.clientX;
        const currentY = e.clientY;

        const width = Math.abs(currentX - startX);
        const height = Math.abs(currentY - startY);
        const left = Math.min(currentX, startX);
        const top = Math.min(currentY, startY);

        selectionBox.style.width = `${width}px`;
        selectionBox.style.height = `${height}px`;
        selectionBox.style.left = `${left}px`;
        selectionBox.style.top = `${top}px`;

        tooltip.textContent = `${Math.round(width)} x ${Math.round(height)}`;
        tooltip.style.left = `${left + 5}px`;
        tooltip.style.top = `${top + 5}px`;
    });

    overlay.addEventListener('mouseup', (e) => {
        if (!isDrawing) return;
        isDrawing = false;

        const rect = selectionBox.getBoundingClientRect();

        // Do not capture if the area is too small
        if (rect.width < 10 || rect.height < 10) {
            cleanup();
            return;
        }

        const selectedArea = {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height,
        };

        // Important: Hide the overlay layer *before* taking the screenshot
        overlay.style.display = 'none';

        setTimeout(() => {
            chrome.runtime.sendMessage({
                action: 'captureAreaScreenshot',
                data: {
                    area: selectedArea,
                    devicePixelRatio: window.devicePixelRatio,
                },
            });
            cleanup();
        }, 100); // Small delay to ensure the layer is visually hidden
    });

    document.addEventListener('keydown', handleKeydown);
})();
