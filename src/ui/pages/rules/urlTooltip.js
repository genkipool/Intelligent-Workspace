/**
 * The panel listing a rule's URLs while the pointer rests on its name.
 *
 * The browser's own `title` cannot show one URL per line, which is why the original
 * builds its own panel; the styles for `.tooltip` are already in rules.css. Only one
 * is ever on screen, so a single module-level element is enough.
 */
let tooltipEl = null;
let tooltipTarget = null;

const OFFSET = 8;

function place() {
    if (!tooltipEl || !tooltipTarget || !document.body.contains(tooltipTarget)) {
        hideUrlTooltip();
        return;
    }
    const target = tooltipTarget.getBoundingClientRect();
    const panel = tooltipEl.getBoundingClientRect();

    let left = target.right + OFFSET + window.scrollX;
    if (left + panel.width > window.innerWidth + window.scrollX) {
        left = window.innerWidth + window.scrollX - panel.width - OFFSET;
    }
    left = Math.max(window.scrollX + OFFSET, left);

    let top = target.top + target.height / 2 - panel.height / 2 + window.scrollY;
    if (top + panel.height > window.innerHeight + window.scrollY) {
        top = window.innerHeight + window.scrollY - panel.height - OFFSET;
    }
    top = Math.max(window.scrollY + OFFSET, top);

    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
}

export function showUrlTooltip(target, urls) {
    const content = (urls || []).join('\n');
    if (!content.trim()) return;
    if (tooltipTarget === target && tooltipEl) return;
    hideUrlTooltip();

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'tooltip';
    tooltipEl.setAttribute('translate', 'no');
    tooltipEl.textContent = content;
    tooltipTarget = target;
    document.body.appendChild(tooltipEl);

    requestAnimationFrame(() => {
        if (!tooltipEl) return;
        place();
        tooltipEl.classList.add('visible');
    });

    window.addEventListener('scroll', hideUrlTooltip, true);
    window.addEventListener('resize', hideUrlTooltip, true);
}

export function hideUrlTooltip() {
    window.removeEventListener('scroll', hideUrlTooltip, true);
    window.removeEventListener('resize', hideUrlTooltip, true);
    tooltipEl?.remove();
    tooltipEl = null;
    tooltipTarget = null;
}
