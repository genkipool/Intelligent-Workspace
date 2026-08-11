// --- START OF FILE keyboardNav.js ---

function findSpatialTarget(currentElement, focusableElements, direction) {
    if (!currentElement) return null;
    const currentRect = currentElement.getBoundingClientRect();

    // --- Pass 1: Find candidates that are visually aligned in the same column ---
    const alignedCandidates = focusableElements.filter((candidate) => {
        if (candidate === currentElement) return false;
        const candidateRect = candidate.getBoundingClientRect();

        // Check if the candidate is in the correct direction (up or down)
        const isCorrectDirection =
            direction === 'down' ? candidateRect.top > currentRect.top : candidateRect.bottom < currentRect.bottom;

        if (!isCorrectDirection) return false;

        // Check for any horizontal overlap. This is a robust way to determine if two elements are in the same "column".
        const isOverlappingHorizontally =
            Math.max(currentRect.left, candidateRect.left) < Math.min(currentRect.right, candidateRect.right);

        return isOverlappingHorizontally;
    });

    // If we found aligned candidates, sort them by vertical distance and return the closest one.
    if (alignedCandidates.length > 0) {
        alignedCandidates.sort((a, b) => {
            const aRect = a.getBoundingClientRect();
            const bRect = b.getBoundingClientRect();
            // Calculate the absolute vertical distance between the elements' centers.
            const a_dy = Math.abs(aRect.top + aRect.height / 2 - (currentRect.top + currentRect.height / 2));
            const b_dy = Math.abs(bRect.top + bRect.height / 2 - (currentRect.top + currentRect.height / 2));
            return a_dy - b_dy;
        });
        return alignedCandidates[0];
    }

    // --- Pass 2: If no strictly aligned candidates were found, use a more lenient spatial search. ---
    // This handles jumping between columns, like moving from the last button in a group to the title of the next group.
    const candidates = [];
    for (const candidate of focusableElements) {
        if (candidate === currentElement) continue;
        const candidateRect = candidate.getBoundingClientRect();

        const dx = Math.abs(candidateRect.left + candidateRect.width / 2 - (currentRect.left + currentRect.width / 2));
        const dy = candidateRect.top + candidateRect.height / 2 - (currentRect.top + currentRect.height / 2);

        // Filter for elements in the correct direction. The threshold (e.g., dy > 5) prevents selecting elements on the same line.
        if (direction === 'down' && dy > 5) {
            candidates.push({
                element: candidate,
                dx,
                dy,
            });
        } else if (direction === 'up' && dy < -5) {
            candidates.push({
                element: candidate,
                dx,
                dy: Math.abs(dy),
            });
        }
    }

    if (candidates.length === 0) return null;

    // Sort the lenient candidates. Prioritize elements that are closer horizontally first, and then vertically.
    candidates.sort((a, b) => {
        // If one element is significantly more horizontally aligned than the other, prefer it.
        if (Math.abs(a.dx - b.dx) > 20) {
            return a.dx - b.dx;
        }

        // If they are similarly aligned horizontally, choose the one that is closer vertically.
        return a.dy - b.dy;
    });

    return candidates.length > 0 ? candidates[0].element : null;
}

function handleArrowNavigation(event, focusableElements) {
    const key = event.key;
    const arrowKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (!arrowKeys.includes(key)) return;

    const activeElement = document.activeElement;

    if (activeElement) {
        const isTextInput =
            activeElement.tagName === 'INPUT' && /text|search|url|tel|email|password/i.test(activeElement.type);
        const isTextArea = activeElement.tagName === 'TEXTAREA';
        const isContentEditable = activeElement.isContentEditable;

        if ((isTextInput || isTextArea || isContentEditable) && arrowKeys.includes(key)) {
            return;
        }
    }

    if (activeElement && activeElement.closest('.color-popup')) {
        if (key === 'ArrowLeft' || key === 'ArrowRight') return;
    }

    if (focusableElements.length === 0) return;

    let targetElement = null;

    if (key === 'ArrowUp' || key === 'ArrowDown') {
        const direction = key === 'ArrowUp' ? 'up' : 'down';
        targetElement = findSpatialTarget(activeElement, focusableElements, direction);
    } else if (key === 'ArrowLeft' || key === 'ArrowRight') {
        const currentIndex = focusableElements.indexOf(activeElement);
        let newIndex =
            key === 'ArrowRight'
                ? currentIndex === -1
                    ? 0
                    : (currentIndex + 1) % focusableElements.length
                : currentIndex === -1
                  ? focusableElements.length - 1
                  : (currentIndex - 1 + focusableElements.length) % focusableElements.length;
        targetElement = focusableElements[newIndex];
    }

    if (targetElement && targetElement !== activeElement) {
        event.preventDefault();
        targetElement.focus();
    }
}

function handleGenericActivation(event) {
    const target = event.target;
    if (target.isContentEditable) {
        return;
    }
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        const isButtonLike = ['button', 'submit', 'reset', 'checkbox', 'radio'].includes(target.type);
        if (!isButtonLike) return;
    }

    const isInteractive =
        target.tagName === 'BUTTON' ||
        (target.tagName === 'A' && target.href) ||
        target.getAttribute('role') === 'button' ||
        target.getAttribute('role') === 'checkbox' ||
        target.getAttribute('role') === 'radio' ||
        target.type === 'checkbox' ||
        (target.tabIndex >= 0 && target.tabIndex !== -1);

    if (isInteractive && (event.key === 'Enter' || event.key === ' ')) {
        if (event.ctrlKey || event.defaultPrevented) return;

        if ((target.type === 'checkbox' || target.type === 'radio') && event.key === ' ') {
            // Let the browser handle the space bar
        } else {
            event.preventDefault();
            target.click();
        }
    }
}

/**
 * Initializes keyboard navigation for the page.
 * @param {Object.<string, Object.<string, function(Event, HTMLElement):boolean>>} [customHandlers={}] - Custom key handlers.
 */
export function initializeKeyboardNavigation(customHandlers = {}) {
    // --- KEY CHANGE: We use 'true' to activate the CAPTURE PHASE ---
    document.addEventListener(
        'keydown',
        (event) => {
            // --- CENTRALIZED LOGIC FOR THE ESCAPE KEY ---
            if (event.key === 'Escape') {
                const activeOverlay = document.querySelector(
                    '.modal-overlay, .context-menu-overlay, #cookie-drag-drop-panel',
                );

                if (activeOverlay) {
                    // We prevent and stop the event IMMEDIATELY so it doesn't reach other listeners
                    event.preventDefault();
                    event.stopPropagation();

                    const closeBtn = activeOverlay.querySelector(
                        '.close-modal-btn, #close-gemini-schedule-modal, .close-error-btn, #back-from-cookie-import-btn',
                    );
                    if (closeBtn) {
                        closeBtn.click();
                    } else {
                        activeOverlay.remove();
                    }
                    return; // Event handled, do not continue
                }
            }

            // If it's not Escape, or if there's no modal, continue with normal logic
            const target = event.target;

            for (const selector in customHandlers) {
                if (target.matches(selector)) {
                    const handlers = customHandlers[selector];
                    if (handlers[event.key]) {
                        if (handlers[event.key](event, target) === true) {
                            return;
                        }
                    }
                }
            }

            const focusableSelector = [
                'a[href]:not([tabindex="-1"])',
                'button:not([disabled]):not([tabindex="-1"])',
                'input:not([disabled]):not([tabindex="-1"])',
                'textarea:not([disabled]):not([tabindex="-1"])',
                'select:not([disabled]):not([tabindex="-1"])',
                '[tabindex]:not([tabindex="-1"]):not([disabled])',
            ].join(', ');

            const focusableElements = Array.from(document.querySelectorAll(focusableSelector)).filter((el) => {
                const containingModal = el.closest('dialog');
                return (
                    (!containingModal || containingModal.open) &&
                    el.offsetParent !== null &&
                    getComputedStyle(el).visibility !== 'hidden'
                );
            });

            handleArrowNavigation(event, focusableElements);
            handleGenericActivation(event);
        },
        true,
    ); // <--- THIS IS THE MOST IMPORTANT LINE OF THE CHANGE
}
