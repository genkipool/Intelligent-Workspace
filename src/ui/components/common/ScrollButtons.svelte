<script>
    import { onMount } from 'svelte';
    import { t } from '../../stores/i18nStore.js';

    let { target = null, targetId = null } = $props();

    let scrollButtonsEl = $state(null);
    let scrollUpBtn = $state(null);
    let scrollDownBtn = $state(null);
    let rafId = null;

    function getInfo() {
        let el = target;
        if (!el && targetId) {
            el = document.getElementById(targetId);
        }
        if (el && el !== window) {
            return {
                target: el,
                scrollTop: el.scrollTop,
                scrollHeight: el.scrollHeight,
                clientHeight: el.clientHeight,
            };
        }
        const doc = document.documentElement;
        const body = document.body;
        return {
            target: window,
            scrollTop: window.scrollY || doc.scrollTop || body.scrollTop || 0,
            scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight),
            clientHeight: window.innerHeight || doc.clientHeight,
        };
    }

    export function updateScrollButtons() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = requestAnimationFrame(() => {
            if (!scrollButtonsEl || !scrollUpBtn || !scrollDownBtn) return;
            const info = getInfo();
            const scrollableDistance = info.scrollHeight - info.clientHeight;
            if (scrollableDistance > 20) {
                scrollButtonsEl.classList.add('visible');
                scrollUpBtn.style.display = info.scrollTop < 15 ? 'none' : 'flex';
                scrollDownBtn.style.display = info.scrollTop >= scrollableDistance - 15 ? 'none' : 'flex';
            } else {
                scrollButtonsEl.classList.remove('visible');
            }
        });
    }

    function scrollToTop() {
        const info = getInfo();
        if (info.target === window) {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
            info.target.scrollTo({ top: 0, behavior: 'smooth' });
        }
    }

    function scrollToBottom() {
        const info = getInfo();
        if (info.target === window) {
            window.scrollTo({ top: info.scrollHeight, behavior: 'smooth' });
        } else {
            info.target.scrollTo({ top: info.scrollHeight, behavior: 'smooth' });
        }
    }

    onMount(() => {
        const handler = () => updateScrollButtons();
        window.addEventListener('scroll', handler, { passive: true });
        window.addEventListener('resize', handler, { passive: true });
        document.addEventListener('scroll', handler, { capture: true, passive: true });

        updateScrollButtons();
        const t1 = setTimeout(updateScrollButtons, 100);
        const t2 = setTimeout(updateScrollButtons, 300);

        return () => {
            window.removeEventListener('scroll', handler);
            window.removeEventListener('resize', handler);
            document.removeEventListener('scroll', handler, { capture: true });
            if (rafId) cancelAnimationFrame(rafId);
            clearTimeout(t1);
            clearTimeout(t2);
        };
    });
</script>

<div bind:this={scrollButtonsEl} id="scroll-buttons" class="scroll-buttons">
    <button
        bind:this={scrollUpBtn}
        id="scroll-up"
        type="button"
        translate="no"
        onclick={scrollToTop}
        aria-label={$t('scrollToTop') || 'Scroll to top'}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square" />
        </svg>
    </button>
    <button
        bind:this={scrollDownBtn}
        id="scroll-down"
        type="button"
        translate="no"
        onclick={scrollToBottom}
        aria-label={$t('scrollToBottom') || 'Scroll to bottom'}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square" />
        </svg>
    </button>
</div>

<style>
    .scroll-buttons {
        position: fixed;
        bottom: 20px;
        right: 20px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        z-index: 1000;
        opacity: 0;
        visibility: hidden;
        transition:
            opacity 0.3s ease,
            visibility 0.3s ease;
    }

    :global(.scroll-buttons.visible) {
        opacity: 1;
        visibility: visible;
    }

    .scroll-buttons button {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        background-color: var(--bg-panel-color);
        border: 1px solid var(--border-color);
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        box-shadow: 0 2px 5px rgba(0, 0, 0, 0.2);
        transition:
            background-color 0.2s ease,
            transform 0.2s ease;
    }

    .scroll-buttons button:hover {
        background-color: var(--interactive-color);
        transform: scale(1.1);
    }

    .scroll-buttons button svg {
        width: 24px;
        height: 24px;
    }

    .scroll-buttons button svg path {
        stroke: var(--text-color);
    }
</style>
