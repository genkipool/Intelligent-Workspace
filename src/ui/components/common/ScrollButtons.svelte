<script module>
    /**
     * THE PAIR OF SCROLL BUTTONS
     *
     * The round "up" and "down" buttons that float over a long page. Four copies of
     * this used to live in the tree — the rules page, the side panel, the hints page
     * and the about page — each with its own listeners, its own rAF and its own way
     * of hiding an arrow that points nowhere. What differed between them was never
     * the behaviour: it was which element scrolls, how much slack counts as
     * scrollable, and the look. Those are the props.
     *
     * The look is deliberately not here. Each page already dresses `.scroll-buttons`
     * in its own stylesheet — centred at the bottom on the rules page, in the corner
     * on the about page — and a scoped style block would outrank all of it. The
     * wrapper takes the class the page asks for and the page's CSS stands.
     *
     * Page code outside Svelte asks for a refresh through the module-level
     * `updateScrollButtons()` below, which is what `viewsService` re-exports to its
     * two dozen callers.
     */
    const instances = [];

    /** Makes every mounted pair look at its target again. */
    export function updateScrollButtons() {
        for (const update of instances) update();
    }
</script>

<script>
    import { onMount } from 'svelte';
    import { t } from '../../stores/i18nStore.js';

    let {
        /**
         * What scrolls: an element, a CSS selector, or a function returning either —
         * a function when the answer changes as the page does, as it does in the side
         * panel, where every view scrolls in its own container. Left out, the window
         * scrolls. Named but missing means there is nothing to scroll, and the
         * buttons stay hidden.
         */
        target = null,
        class: className = 'scroll-buttons',
        /** Slack below which the page is not worth a button at all. */
        minScroll = 20,
        /** How close to an end counts as being at it, so its arrow can go. */
        edge = 15,
        /** Run after each update, for a page that has to place the buttons itself. */
        onupdate = null,
    } = $props();

    let container = $state(null);
    let upButton = $state(null);
    let downButton = $state(null);
    let frame = null;

    /** The scrollable thing and its measurements, or null when there is none. */
    function measure() {
        const asked = typeof target === 'function' ? target() : target;
        const element = typeof asked === 'string' ? document.querySelector(asked) : asked;

        if (element && element !== window) {
            return {
                target: element,
                scrollTop: element.scrollTop,
                scrollHeight: element.scrollHeight,
                clientHeight: element.clientHeight,
            };
        }
        // A page that named its container and has not got it has nothing to scroll.
        if (!element && target !== null && target !== undefined) return null;

        const doc = document.documentElement;
        const body = document.body;
        return {
            target: window,
            scrollTop: window.scrollY || doc.scrollTop || body.scrollTop || 0,
            scrollHeight: Math.max(doc.scrollHeight, body.scrollHeight),
            clientHeight: window.innerHeight || doc.clientHeight,
        };
    }

    function update() {
        if (frame) cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
            if (!container || !upButton || !downButton) return;

            const info = measure();
            const distance = info ? info.scrollHeight - info.clientHeight : 0;

            if (distance > minScroll) {
                container.classList.add('visible');
                upButton.style.display = info.scrollTop < edge ? 'none' : 'flex';
                downButton.style.display = info.scrollTop >= distance - edge ? 'none' : 'flex';
            } else {
                container.classList.remove('visible');
            }

            onupdate?.();
        });
    }

    function scrollTo(top) {
        const info = measure();
        info?.target.scrollTo({ top, behavior: 'smooth' });
    }

    onMount(() => {
        instances.push(update);
        const handler = () => update();
        window.addEventListener('scroll', handler, { passive: true });
        window.addEventListener('resize', handler, { passive: true });
        // Scroll does not bubble, so a container of its own is only heard down here.
        document.addEventListener('scroll', handler, { capture: true, passive: true });

        update();
        // The page is still settling: what is scrollable now may not be in a moment.
        const settling = [setTimeout(update, 100), setTimeout(update, 300)];

        return () => {
            instances.splice(instances.indexOf(update), 1);
            window.removeEventListener('scroll', handler);
            window.removeEventListener('resize', handler);
            document.removeEventListener('scroll', handler, { capture: true });
            if (frame) cancelAnimationFrame(frame);
            for (const timer of settling) clearTimeout(timer);
        };
    });
</script>

<div bind:this={container} id="scroll-buttons" class={className}>
    <button
        bind:this={upButton}
        id="scroll-up"
        type="button"
        translate="no"
        onclick={() => scrollTo(0)}
        aria-label={$t('scrollToTop') || 'Scroll to top'}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M6 15L12 9L18 15" stroke="var(--text-color)" stroke-linecap="square" />
        </svg>
    </button>
    <button
        bind:this={downButton}
        id="scroll-down"
        type="button"
        translate="no"
        onclick={() => scrollTo(measure()?.scrollHeight ?? 0)}
        aria-label={$t('scrollToBottom') || 'Scroll to bottom'}
    >
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
            <path d="M6 9L12 15L18 9" stroke="var(--text-color)" stroke-linecap="square" />
        </svg>
    </button>
</div>
