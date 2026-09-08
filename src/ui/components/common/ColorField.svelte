<script>
    import { tick } from 'svelte';
    import { portal } from '../../actions/portal.js';
    import { t } from '../../stores/i18nStore.js';
    import {
        COLOR_CHANNELS,
        COLOR_FORMATS,
        channelsToHex,
        formatColor,
        hexAlpha,
        hexToChannels,
        hexToHsv,
        hsvToHex,
        isLightColor,
        normalizeHex,
        parseColor,
        withAlpha,
    } from '../../../utils/color.js';
    import { copyText } from '../../../utils/copyText.js';

    /**
     * Colour field with the extension's own picker.
     *
     * `<input type="color">` opens the browser's own dialog: an operating-system
     * window that knows nothing about the theme, cannot be placed, and in a side panel
     * opens wherever the browser feels like it. The box looks and behaves the same as
     * before — a swatch the width of its column — but clicking it opens the popup
     * below, painted with the theme tokens like every other picker on the page
     * ({@link DateField}, {@link TimeField}).
     *
     * The colour can be dialled in the square, dragged on the bars or typed in
     * whichever notation the reader thinks in; the notations come from
     * `utils/color.js`, so adding one is a table entry and nothing here.
     *
     * @typedef {object} Props
     * @property {string} value - `#rrggbb`, or `#rrggbbaa` once it is translucent.
     *   Bindable.
     * @property {string} [id] - Goes on the trigger, so a `<label for>` still works.
     * @property {string} [title]
     * @property {string} [ariaLabel]
     * @property {'hex' | 'rgb' | 'hsla'} [format] - Notation shown to start with. The
     *   reader can switch it, and the choice is theirs from then on.
     * @property {(value: string) => void} [onchange] - For callers that cannot bind.
     */
    let {
        value = $bindable('#000000'),
        id = undefined,
        title = undefined,
        ariaLabel = undefined,
        format = 'hex',
        onchange = undefined,
    } = $props();

    const FALLBACK = '#000000';

    let open = $state(false);
    let triggerEl = $state(null);
    let popupEl = $state(null);
    let areaEl = $state(null);
    let hueEl = $state(null);
    let alphaEl = $state(null);
    let popupStyle = $state('');
    let dragging = $state(null); // 'area' | 'hue' | 'alpha' | null

    // Hue, saturation and value only live while the popup is open: the colour itself
    // is always the hex in `value`. They are seeded on opening because a hex does not
    // remember the hue it was dialled in with — every grey is hue 0.
    let hsv = $state({ h: 0, s: 0, v: 0 });
    let alpha = $state(1);
    // What is in the hex field. It is a draft, not the colour: half-typed text is not
    // a colour and must not be written back to the theme.
    let draft = $state(FALLBACK);
    let notation = $state(COLOR_FORMATS.includes(format) ? format : 'hex');
    let copied = $state(false);
    let copiedTimer = null;

    const current = $derived(normalizeHex(value) ?? FALLBACK);
    /** The colour with its opacity taken off: what the square and the bars work in. */
    const opaque = $derived(current.slice(0, 7));
    const hueColor = $derived(hsvToHex(hsv.h, 1, 1));
    const cursorDark = $derived(isLightColor(opaque));
    const channels = $derived(notation === 'hex' ? null : hexToChannels(current, notation));

    function commit(hex) {
        const next = normalizeHex(hex);
        if (!next || next === current) return;
        value = next;
        onchange?.(next);
    }

    /** Moves the cursor and the bars, and writes the colour they now spell out. */
    function applyHsv(next) {
        hsv = { ...hsv, ...next };
        const hex = withAlpha(hsvToHex(hsv.h, hsv.s, hsv.v), alpha);
        draft = hex.toUpperCase();
        commit(hex);
    }

    function applyAlpha(next) {
        alpha = Math.round(Math.min(Math.max(next, 0), 1) * 100) / 100;
        const hex = withAlpha(opaque, alpha);
        draft = hex.toUpperCase();
        commit(hex);
    }

    /** Takes a colour that came from somewhere else — typed, pasted, a field — and
     *  puts the square, the bars and the text back in agreement with it. */
    function adopt(hex, { syncDraft = true } = {}) {
        const next = normalizeHex(hex);
        if (!next) return;
        hsv = hexToHsv(next);
        alpha = hexAlpha(next);
        if (syncDraft) draft = next.toUpperCase();
        commit(next);
    }

    function seed() {
        hsv = hexToHsv(current);
        alpha = hexAlpha(current);
        draft = current.toUpperCase();
    }

    function place() {
        if (!triggerEl || !popupEl) return;
        const rect = triggerEl.getBoundingClientRect();
        const pad = 6;
        const width = popupEl.offsetWidth;
        const height = popupEl.offsetHeight;

        // Below the box, and above it when the bottom of the window is in the way.
        let top = rect.bottom + pad;
        if (top + height > window.innerHeight - pad) {
            const above = rect.top - height - pad;
            top = above >= pad ? above : Math.max(pad, window.innerHeight - height - pad);
        }

        // Opens rightwards from the box's left edge. When that would run past the
        // right edge of the window — the right-hand column of the editor, in a side
        // panel barely wider than the popup — it hangs from the box's right edge and
        // opens leftwards instead, which is what a picker in the second column needs.
        let left = rect.left;
        if (left + width > window.innerWidth - pad) left = rect.right - width;
        left = Math.min(Math.max(left, pad), Math.max(pad, window.innerWidth - width - pad));

        popupStyle = `top: ${top}px; left: ${left}px;`;
    }

    function toggle() {
        open = !open;
        if (!open) return;
        seed();
        // Placed once it exists and has a size.
        tick().then(place);
    }

    function close() {
        open = false;
        dragging = null;
        clearTimeout(copiedTimer);
        copied = false;
    }

    function ratio(event, el, axis) {
        const rect = el.getBoundingClientRect();
        const size = axis === 'x' ? rect.width : rect.height;
        const offset = axis === 'x' ? event.clientX - rect.left : event.clientY - rect.top;
        if (!size) return 0;
        return Math.min(Math.max(offset / size, 0), 1);
    }

    function track(event, kind) {
        if (kind === 'area') applyHsv({ s: ratio(event, areaEl, 'x'), v: 1 - ratio(event, areaEl, 'y') });
        else if (kind === 'hue') applyHsv({ h: ratio(event, hueEl, 'x') * 360 });
        else applyAlpha(ratio(event, alphaEl, 'x'));
    }

    function startDrag(event, kind) {
        if (event.button !== undefined && event.button !== 0) return;
        // Keeps the drag alive when the pointer leaves the square, and stops the press
        // from being read as a text selection.
        event.preventDefault();
        event.currentTarget.setPointerCapture?.(event.pointerId);
        dragging = kind;
        track(event, kind);
    }

    function moveDrag(event, kind) {
        if (dragging !== kind) return;
        track(event, kind);
    }

    function endDrag(event) {
        if (!dragging) return;
        dragging = null;
        if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId);
        }
    }

    /** Arrow keys walk the square and the bars; the whole picker works without a mouse. */
    function areaKeydown(event) {
        const step = event.shiftKey ? 0.1 : 0.02;
        const moves = {
            ArrowLeft: { s: hsv.s - step },
            ArrowRight: { s: hsv.s + step },
            ArrowUp: { v: hsv.v + step },
            ArrowDown: { v: hsv.v - step },
        };
        const move = moves[event.key];
        if (!move) return;
        event.preventDefault();
        applyHsv({
            s: Math.min(Math.max(move.s ?? hsv.s, 0), 1),
            v: Math.min(Math.max(move.v ?? hsv.v, 0), 1),
        });
    }

    function barKeydown(event, kind) {
        const back = event.key === 'ArrowLeft' || event.key === 'ArrowDown';
        const forward = event.key === 'ArrowRight' || event.key === 'ArrowUp';
        if (!back && !forward) return;
        event.preventDefault();
        const step = (kind === 'hue' ? (event.shiftKey ? 10 : 2) : event.shiftKey ? 0.1 : 0.02) * (back ? -1 : 1);
        if (kind === 'hue') applyHsv({ h: hsv.h + step });
        else applyAlpha(alpha + step);
    }

    function hexInput(event) {
        draft = event.currentTarget.value;
        // Every notation is read here, not just hex: a colour pasted from anywhere is
        // still the colour the reader meant.
        const next = parseColor(draft);
        if (next) adopt(next, { syncDraft: false });
    }

    /** Half-typed text is not a colour; leaving the field puts the real one back. */
    function hexBlur() {
        draft = current.toUpperCase();
    }

    function channelInput(event, channel) {
        const text = event.currentTarget.value.trim();
        if (text === '') return;
        const number = Number(text.replace(',', '.'));
        if (!Number.isFinite(number)) return;
        adopt(channelsToHex({ [channel.key]: number }, notation, current), { syncDraft: true });
    }

    /** Leaving a field, or stepping it with the arrows, shows the number the colour
     *  really has: 300 was clamped to 255 and 25.7 is not a channel. */
    function channelBlur(event, channel) {
        event.currentTarget.value = channels[channel.key].toFixed(channel.decimals);
    }

    function channelKeydown(event, channel) {
        const back = event.key === 'ArrowDown';
        const forward = event.key === 'ArrowUp';
        if (!back && !forward) return;
        event.preventDefault();
        const step = channel.step * (event.shiftKey ? 10 : 1) * (back ? -1 : 1);
        const next = Math.min(Math.max(channels[channel.key] + step, channel.min), channel.max);
        adopt(channelsToHex({ [channel.key]: next }, notation, current));
        event.currentTarget.value = next.toFixed(channel.decimals);
    }

    /** Switches notation without touching the colour: `#297DCC`, `rgb(41, 125, 204)`
     *  and `hsl(213, 67%, 48%)` are the same thing written three ways, and the reader
     *  picks which one to read and copy. */
    function setNotation(next) {
        notation = next;
        draft = current.toUpperCase();
        // Nothing is placed again here on purpose: the popup is the same size in every
        // notation (see the stylesheet), so switching must not move it by even a pixel
        // under the pointer that is switching it.
    }

    /** Takes whatever is half-typed in the field as the colour, if it is one, and
     *  puts the picker away. */
    function applyAndClose() {
        const typed = parseColor(draft);
        if (typed) adopt(typed);
        close();
        triggerEl?.focus();
    }

    async function copy() {
        const done = await copyText(formatColor(current, notation));
        if (!done) return;
        // The confirmation is on the button itself: a page-wide notice would cover the
        // picker it came from.
        copied = true;
        clearTimeout(copiedTimer);
        copiedTimer = setTimeout(() => (copied = false), 1400);
    }

    /**
     * A click anywhere else puts the picker away, in the capture phase for the reason
     * spelled out in {@link TimeField}: the modal stops clicks from propagating so the
     * backdrop cannot be dismissed by accident, and a bubble-phase listener on the
     * window would never hear them.
     */
    function handleOutside(event) {
        if (!open) return;
        if (popupEl?.contains(event.target) || triggerEl?.contains(event.target)) return;
        close();
    }

    /**
     * Escape closes the picker and no more: the modal underneath listens for it too,
     * and the first press should not take the whole editor with it.
     */
    function handleKeydown(event) {
        if (!open || event.key !== 'Escape') return;
        event.preventDefault();
        event.stopPropagation();
        close();
        triggerEl?.focus();
    }
</script>

<svelte:window
    onclickcapture={handleOutside}
    onkeydowncapture={handleKeydown}
    onresize={place}
    onscrollcapture={place}
/>

<button
    {id}
    bind:this={triggerEl}
    type="button"
    class="color-field-trigger cp-checker"
    style="--cp-color: {current};"
    title={title ?? formatColor(current, 'hex')}
    aria-label={ariaLabel ?? undefined}
    aria-haspopup="dialog"
    aria-expanded={open}
    onclick={toggle}
></button>

{#if open}
    <!-- Out at the body (see `actions/portal.js`): the modal that opens it clips and
         restyles anything declared inside it. -->
    <div
        class="color-picker"
        role="dialog"
        aria-label={$t('colorPickerTitle')}
        use:portal
        bind:this={popupEl}
        style={popupStyle}
    >
        <div
            class="cp-area"
            bind:this={areaEl}
            role="slider"
            tabindex="0"
            aria-label={$t('colorPickerSaturation')}
            aria-valuetext={formatColor(current, notation)}
            style="background-color: {hueColor};"
            onpointerdown={(e) => startDrag(e, 'area')}
            onpointermove={(e) => moveDrag(e, 'area')}
            onpointerup={endDrag}
            onpointercancel={endDrag}
            onkeydown={areaKeydown}
        >
            <div class="cp-area-white"></div>
            <div class="cp-area-black"></div>
            <div
                class="cp-cursor"
                class:on-light={cursorDark}
                style="left: {hsv.s * 100}%; top: {(1 - hsv.v) * 100}%; background-color: {opaque};"
            ></div>
        </div>

        <div
            class="cp-bar cp-hue"
            bind:this={hueEl}
            role="slider"
            tabindex="0"
            aria-label={$t('colorPickerHue')}
            aria-valuemin="0"
            aria-valuemax="360"
            aria-valuenow={Math.round(hsv.h)}
            onpointerdown={(e) => startDrag(e, 'hue')}
            onpointermove={(e) => moveDrag(e, 'hue')}
            onpointerup={endDrag}
            onpointercancel={endDrag}
            onkeydown={(e) => barKeydown(e, 'hue')}
        >
            <div
                class="cp-thumb"
                style="left: calc(6px + (100% - 12px) * {hsv.h / 360}); background-color: {hueColor};"
            ></div>
        </div>

        <div
            class="cp-bar cp-alpha"
            bind:this={alphaEl}
            role="slider"
            tabindex="0"
            aria-label={$t('colorPickerAlpha')}
            aria-valuemin="0"
            aria-valuemax="1"
            aria-valuenow={alpha}
            style="--cp-color: {opaque};"
            onpointerdown={(e) => startDrag(e, 'alpha')}
            onpointermove={(e) => moveDrag(e, 'alpha')}
            onpointerup={endDrag}
            onpointercancel={endDrag}
            onkeydown={(e) => barKeydown(e, 'alpha')}
        >
            <div class="cp-alpha-tint"></div>
            <div class="cp-thumb" style="left: calc(6px + (100% - 12px) * {alpha}); background-color: {opaque};"></div>
        </div>

        <div class="cp-title">{$t('colorPickerValue')}</div>
        <div class="cp-fields">
            {#if notation === 'hex'}
                <label class="cp-field cp-field-hex">
                    <input
                        class="cp-input"
                        type="text"
                        spellcheck="false"
                        autocomplete="off"
                        maxlength="28"
                        title={$t('colorPickerValue')}
                        aria-label={$t('colorPickerValue')}
                        value={draft}
                        oninput={hexInput}
                        onblur={hexBlur}
                        onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), close())}
                    />
                </label>
            {:else}
                {#each COLOR_CHANNELS[notation] as channel (channel.key)}
                    <label class="cp-field">
                        <span class="cp-field-label">{channel.label}</span>
                        <input
                            class="cp-input"
                            type="text"
                            inputmode="decimal"
                            spellcheck="false"
                            autocomplete="off"
                            maxlength="5"
                            title={channel.title}
                            value={channels[channel.key].toFixed(channel.decimals)}
                            oninput={(e) => channelInput(e, channel)}
                            onblur={(e) => channelBlur(e, channel)}
                            onkeydown={(e) => channelKeydown(e, channel)}
                        />
                    </label>
                {/each}
            {/if}

            <button
                type="button"
                class="cp-copy"
                class:is-copied={copied}
                title={copied ? $t('copied') : $t('colorPickerCopy')}
                aria-label={copied ? $t('copied') : $t('colorPickerCopy')}
                onclick={copy}
            >
                <!-- The same two squares the rest of the extension copies with
                     (`Icons.svelte`, `#icon-copy`), inline because the popup lives out
                     at the body and cannot count on the page's sprite. Both squares are
                     the same size and their union is centred on the viewBox, which is
                     what makes the icon sit in the middle of its button; an outlined
                     back sheet behind a solid front one does not, whatever its box
                     says. -->
                <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" focusable="false">
                    {#if copied}
                        <path
                            d="M20 7 9 18l-5-5"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                        />
                    {:else}
                        <path
                            d="M7.4 6.6c0-2.198 1.75-4 3.934-4h5.333c2.184 0 3.934 1.802 3.934 4v6.8c0 2.198-1.75 4-3.934 4a0.6 0.6 0 0 1 0-1.2c1.498 0 2.734-1.242 2.734-2.8v-6.8c0-1.558-1.235-2.8-2.734-2.8h-5.333c-1.498 0-2.734 1.242-2.734 2.8a0.6 0.6 0 0 1-1.2 0"
                            fill="currentColor"
                        />
                        <path
                            d="M3.4 10.6c0-2.198 1.75-4 3.934-4h5.333c2.184 0 3.934 1.802 3.934 4v6.8c0 2.198-1.75 4-3.934 4H7.334c-2.184 0-3.934-1.802-3.934-4zm3.934-2.8c-1.498 0-2.734 1.242-2.734 2.8v6.8c0 1.558 1.235 2.8 2.734 2.8h5.333c1.498 0 2.734-1.242 2.734-2.8v-6.8c0-1.558-1.235-2.8-2.734-2.8z"
                            fill="currentColor"
                        />
                    {/if}
                </svg>
            </button>
        </div>

        <!-- The same colour written three ways, under the value they rewrite: the
             field says what the colour is, and the buttons under it say how it is
             being written. A fourth notation is one more entry in COLOR_FORMATS and
             its channels, and nothing here. -->
        <div class="cp-formats" role="group" aria-label={$t('colorPickerFormat')}>
            {#each COLOR_FORMATS as option (option)}
                <button
                    type="button"
                    class="cp-format"
                    class:is-active={notation === option}
                    aria-pressed={notation === option}
                    onclick={() => setNotation(option)}>{option.toUpperCase()}</button
                >
            {/each}
        </div>

        <!-- The colour is already on the page — every drag and every keystroke writes
             it — so this is the way out that says "that one", the same as clicking
             away or pressing Escape. It is here because a picker without a button to
             finish with looks unfinished, and because it is the one target that is
             always in the same place. -->
        <button type="button" class="cp-apply" onclick={applyAndClose}>{$t('apply')}</button>
    </div>
{/if}

<style>
    /* The grey chequerboard behind anything that can be see-through, so a colour at
       10% opacity does not read as "nearly white". The colour itself is painted over
       it as a flat gradient, which keeps both on one element. */
    .cp-checker {
        background-image:
            linear-gradient(var(--cp-color, transparent), var(--cp-color, transparent)),
            conic-gradient(
                from 90deg,
                rgba(255, 255, 255, 0.22) 25%,
                rgba(0, 0, 0, 0.22) 0 50%,
                rgba(255, 255, 255, 0.22) 0 75%,
                rgba(0, 0, 0, 0.22) 0
            );
        background-size:
            auto,
            10px 10px;
    }

    /* The trigger keeps the shape the native colour box had in the editor, borders,
       hover lift and focus ring included, so replacing the picker changed nothing
       about how the form reads. */
    .color-field-trigger {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 32px;
        padding: 0;
        margin: 0;
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        box-sizing: border-box;
        cursor: pointer;
        transition: all 0.2s ease;
    }

    .color-field-trigger:hover {
        border-color: var(--border-color, #ccc);
        transform: translateY(-1px);
        box-shadow: 0 0 5px 1px var(--interactive-color, #3498db);
    }

    .color-field-trigger:focus-visible {
        outline: none;
        border-color: var(--border-color, #ccc);
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    /* Everything below is stated outright — sizes, fonts, borders — because the popup
       is a guest at the body and the page it belongs to must not be able to reach in
       and change it. */
    .color-picker {
        /* Fixed in the stylesheet, not only through the inline style: the popup is
           measured the moment it exists, and while it is still a plain child of the
           body it is stretched by whatever layout the page has (85x800 in the themes
           side panel, which sent the first frame to the wrong corner). Off-screen
           until placed, so that first frame is never seen either. */
        position: fixed;
        top: -9999px;
        left: -9999px;
        width: 248px;
        box-sizing: border-box;
        background-color: var(--bg-panel-color, #fff);
        border: 1px solid var(--border-color, #ccc);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        padding: 10px;
        /* Above the modal that opens it (`.modal-overlay` sits at 2000). */
        z-index: 99999;
        display: flex;
        flex-direction: column;
        gap: 8px;
    }

    .cp-area {
        position: relative;
        width: 100%;
        height: 110px;
        border-radius: 6px;
        cursor: crosshair;
        touch-action: none;
        outline: none;
    }

    .cp-area:focus-visible {
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    /* White to the left, black to the bottom, hue underneath: the square every picker
       draws, in two gradients instead of a canvas. */
    .cp-area-white,
    .cp-area-black {
        position: absolute;
        inset: 0;
        border-radius: 6px;
        pointer-events: none;
    }

    .cp-area-white {
        background: linear-gradient(to right, #fff, rgba(255, 255, 255, 0));
    }

    .cp-area-black {
        background: linear-gradient(to top, #000, rgba(0, 0, 0, 0));
    }

    .cp-cursor {
        position: absolute;
        width: 12px;
        height: 12px;
        margin: -6px 0 0 -6px;
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
        pointer-events: none;
    }

    /* On a pale colour a white ring vanishes; the cursor swaps to black there. */
    .cp-cursor.on-light {
        border-color: #000;
        box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.6);
    }

    .cp-bar {
        position: relative;
        width: 100%;
        height: 12px;
        border-radius: 6px;
        cursor: ew-resize;
        touch-action: none;
        outline: none;
    }

    .cp-bar:focus-visible {
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    .cp-hue {
        background: linear-gradient(
            to right,
            #f00 0%,
            #ff0 16.66%,
            #0f0 33.33%,
            #0ff 50%,
            #00f 66.66%,
            #f0f 83.33%,
            #f00 100%
        );
    }

    /* The opacity bar wears the chequerboard alone; the colour goes on top as a fade,
       so the bar reads left to right as the opacity it sets. */
    .cp-alpha {
        --cp-color: transparent;
        background-image: conic-gradient(
            from 90deg,
            rgba(255, 255, 255, 0.22) 25%,
            rgba(0, 0, 0, 0.22) 0 50%,
            rgba(255, 255, 255, 0.22) 0 75%,
            rgba(0, 0, 0, 0.22) 0
        );
        background-size: 10px 10px;
    }

    .cp-alpha-tint {
        position: absolute;
        inset: 0;
        border-radius: 6px;
        background: linear-gradient(to right, transparent, var(--cp-color));
        pointer-events: none;
    }

    /* The thumb is kept inside the bar: its centre travels from 6px to 6px short of
       the far end, so at either extreme it does not hang over the popup's padding. */
    .cp-thumb {
        position: absolute;
        top: 50%;
        width: 12px;
        height: 12px;
        transform: translate(-50%, -50%);
        border: 2px solid #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.5);
        pointer-events: none;
    }

    /* The popup is one size, always. Every line of it is a stated height and every
       piece of text is kept on one line: a longer word in another language, or a
       notation with four fields instead of one, must not move the walls — a popup that
       resizes under the pointer is a popup that has to be placed again. */
    .cp-title {
        height: 11px;
        line-height: 11px;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        opacity: 0.6;
        color: var(--text-color, #333);
        margin-bottom: -2px;
    }

    .cp-formats {
        display: flex;
        gap: 4px;
    }

    .cp-format {
        flex: 1 1 0;
        min-width: 0;
        height: 22px;
        padding: 0 2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        background-color: var(--bg-color, #f5f5f5);
        border: 1px solid var(--border-color, #ccc);
        border-radius: 5px;
        color: var(--text-color, #333);
        font-family: inherit;
        font-size: 10px;
        font-weight: 600;
        letter-spacing: 0.5px;
        cursor: pointer;
        transition:
            background-color 0.15s ease,
            color 0.15s ease,
            border-color 0.15s ease;
    }

    .cp-format:hover {
        border-color: var(--interactive-color, #3498db);
    }

    .cp-format:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    .cp-format.is-active {
        background-color: var(--interactive-color, #3498db);
        border-color: var(--interactive-color, #3498db);
        color: var(--text-color, #fff);
    }

    /* One field per number, each under its own letter: R, G, B, A. Typing a colour is
       three or four small numbers, not one string to get exactly right. */
    .cp-fields {
        display: flex;
        align-items: flex-end;
        gap: 6px;
        /* Room for a caption over a field even when there is none: HEX is one field
           without a letter and RGB is four with one, and the popup is the same height
           in both. */
        min-height: 40px;
    }

    .cp-field {
        display: flex;
        flex: 1 1 0;
        min-width: 0;
        flex-direction: column;
        gap: 3px;
        cursor: text;
    }

    .cp-field-hex {
        flex: 1 1 auto;
    }

    .cp-field-label {
        height: 11px;
        line-height: 11px;
        white-space: nowrap;
        overflow: hidden;
        font-size: 9px;
        font-weight: 600;
        letter-spacing: 0.5px;
        text-transform: uppercase;
        text-align: center;
        opacity: 0.6;
        color: var(--text-color, #333);
    }

    .cp-input {
        width: 100%;
        min-width: 0;
        text-overflow: ellipsis;
        height: 26px;
        box-sizing: border-box;
        padding: 0 6px;
        background-color: var(--bg-color, #f5f5f5);
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        color: var(--text-on-color, #333);
        font-family: 'Roboto Mono', monospace;
        font-size: 12px;
        letter-spacing: 0.3px;
        text-align: center;
        outline: none;
    }

    .cp-field-hex .cp-input {
        text-align: left;
        padding: 0 8px;
    }

    .cp-input:focus,
    .cp-input:focus-visible {
        outline: none;
        border-color: var(--interactive-color, #3498db);
    }

    .cp-copy {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        flex: 0 0 auto;
        width: 26px;
        height: 26px;
        padding: 0;
        line-height: 0;
        background-color: var(--bg-color, #f5f5f5);
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        color: var(--text-color, #333);
        cursor: pointer;
        transition:
            color 0.15s ease,
            border-color 0.15s ease;
    }

    /* No lift on hover — the button sits in a row of fields and moving it drags the
       eye off them. It answers with its border and its icon instead. */
    .cp-copy:hover {
        border-color: var(--interactive-color, #3498db);
        color: var(--text-on-color, #333);
    }

    .cp-copy:focus-visible {
        outline: none;
        border-color: var(--interactive-color, #3498db);
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    /* The tick is the whole confirmation; nothing covers the picker. */
    .cp-copy.is-copied {
        color: var(--interactive-color, #3498db);
        border-color: var(--interactive-color, #3498db);
    }

    .cp-copy svg {
        display: block;
        pointer-events: none;
    }

    /* Full width and no companion, which is the shape every dialog in the extension
       closes with (see the modal convention: one button, no Cancel beside it). */
    .cp-apply {
        width: 100%;
        height: 28px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        margin-top: 2px;
        padding: 0;
        background-color: var(--interactive-color, #3498db);
        border: 1px solid var(--interactive-color, #3498db);
        border-radius: 6px;
        color: var(--text-color, #fff);
        font-family: inherit;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        transition:
            filter 0.15s ease,
            box-shadow 0.15s ease;
    }

    .cp-apply:hover {
        filter: brightness(1.1);
    }

    .cp-apply:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    .cp-apply:active {
        filter: brightness(0.95);
    }
</style>
