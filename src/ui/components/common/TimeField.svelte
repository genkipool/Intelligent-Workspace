<script>
    import { tick } from 'svelte';
    import { portal } from '../../actions/portal.js';

    /**
     * Time field with the extension's own hour/minute popup.
     *
     * Shared for the same reason as {@link DateField}: the native picker ignores the
     * theme, and every schedule screen had grown its own copy of this one.
     *
     * @typedef {object} Props
     * @property {string} value - `HH:MM`.
     * @property {string} [id]
     * @property {string} [placeholder] - Shown while there is no value. The default
     *   keeps the original behaviour of reading as midnight; a caller for whom "not
     *   set" and "midnight" are different things passes something else.
     * @property {string} [title]
     * @property {boolean} [suggestNow] - Whether opening on `00:00` offers the current
     *   time. True for a moment on the clock, where zero means "not filled in yet";
     *   false for a length of time, where zero is a real answer and jumping to 14:37
     *   would be nonsense.
     * @property {number} [maxHour] - The largest hour accepted. 23 for a time of day;
     *   a length of time can be longer than a day.
     * @property {string} [pickerLabel] - The caption under the picker.
     * @property {(value: string) => void} [onchange] - For callers that cannot bind.
     */
    let {
        value = $bindable('00:00'),
        id = undefined,
        placeholder = '00:00',
        title = undefined,
        suggestNow = true,
        maxHour = 23,
        pickerLabel = '24h',
        onchange = undefined,
    } = $props();

    let open = $state(false);
    let triggerEl = $state(null);
    let popupEl = $state(null);
    let popupStyle = $state('');
    let hour = $state('00');
    let minute = $state('00');

    function clamp(text, max) {
        const n = Number.parseInt(text, 10);
        if (Number.isNaN(n)) return '00';
        return String(Math.min(Math.max(n, 0), max)).padStart(2, '0');
    }

    function commit() {
        const next = `${clamp(hour, maxHour)}:${clamp(minute, 59)}`;
        if (next === value) return;
        value = next;
        onchange?.(value);
    }

    function place() {
        if (!triggerEl || !popupEl) return;
        const rect = triggerEl.getBoundingClientRect();
        const padding = 5;
        let top = rect.bottom + padding;
        if (top + popupEl.offsetHeight > window.innerHeight) top = rect.top - popupEl.offsetHeight - padding;
        let left = rect.left;
        if (left + popupEl.offsetWidth > window.innerWidth) left = window.innerWidth - popupEl.offsetWidth - padding;
        popupStyle = `position: fixed; top: ${top}px; left: ${Math.max(padding, left)}px;`;
    }

    function toggle() {
        open = !open;
        if (!open) return;
        // Opening on 00:00 means "not set yet", so offer the current time instead.
        const [h, m] = (value || '00:00').split(':');
        if (suggestNow && (value === '00:00' || !value)) {
            const now = new Date();
            hour = String(now.getHours()).padStart(2, '0');
            minute = String(now.getMinutes()).padStart(2, '0');
        } else if (!value) {
            hour = '00';
            minute = '00';
        } else {
            hour = h;
            minute = m;
        }
        tick().then(place);
    }

    function step(unit, delta) {
        if (unit === 'hour') hour = String((Number(hour) + delta + maxHour + 1) % (maxHour + 1)).padStart(2, '0');
        else minute = String((Number(minute) + delta + 60) % 60).padStart(2, '0');
        commit();
    }

    /** A click anywhere else keeps what was dialled in and puts the picker away. */
    function handleOutside(e) {
        if (!open) return;
        if (popupEl?.contains(e.target) || triggerEl?.contains(e.target)) return;
        hour = clamp(hour, maxHour);
        minute = clamp(minute, 59);
        commit();
        open = false;
    }
</script>

<!--
    Capture, not bubble. Inside a dialog the content stops click from propagating so a
    stray click cannot dismiss the backdrop, and a listener on `window` in the bubble
    phase therefore never hears about it: the picker stayed open, and whatever was
    dialled in was thrown away rather than applied. Capture runs on the way down, so it
    hears every click wherever it lands. The same goes for `scroll`, which does not
    bubble at all — a fixed popup has to follow a body that scrolls under it.
-->
<svelte:window onclickcapture={handleOutside} onresize={place} onscrollcapture={place} />

<div
    {id}
    bind:this={triggerEl}
    class="custom-input-trigger time-trigger"
    class:is-empty={!value}
    role="button"
    tabindex="0"
    {title}
    onclick={toggle}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
>
    {value || placeholder}
</div>

{#if open}
    <!--
        Out at the body (see `actions/portal.js`). Declared here, it lived inside
        whatever dialog opened it and wore that dialog's input rules: the same picker
        was 24px green digits on the themes page and 12px grey ones inside the web
        activity dialog. It is `position: fixed` and placed by hand, so where it sits
        in the tree was never doing anything for it anyway.
    -->
    <div class="custom-time-picker" use:portal bind:this={popupEl} style={popupStyle}>
        <div class="time-picker-main-row">
            <div class="time-arrows">
                <button class="time-arrow-btn" type="button" onclick={(e) => (e.stopPropagation(), step('hour', 1))}
                    >▲</button
                >
                <button class="time-arrow-btn" type="button" onclick={(e) => (e.stopPropagation(), step('hour', -1))}
                    >▼</button
                >
            </div>
            <div class="time-input-container">
                <input
                    type="text"
                    maxlength={String(maxHour).length}
                    inputmode="numeric"
                    placeholder="00"
                    bind:value={hour}
                    oninput={commit}
                    onblur={() => {
                        hour = clamp(hour, maxHour);
                        commit();
                    }}
                />
                <span>:</span>
                <input
                    type="text"
                    maxlength="2"
                    inputmode="numeric"
                    placeholder="00"
                    bind:value={minute}
                    oninput={commit}
                    onblur={() => {
                        minute = clamp(minute, 59);
                        commit();
                    }}
                />
            </div>
            <div class="time-arrows">
                <button class="time-arrow-btn" type="button" onclick={(e) => (e.stopPropagation(), step('minute', 1))}
                    >▲</button
                >
                <button class="time-arrow-btn" type="button" onclick={(e) => (e.stopPropagation(), step('minute', -1))}
                    >▼</button
                >
            </div>
        </div>
        <!-- The original shows the bare format, not the sentence in messages.json. -->
        <div class="time-picker-label">{pickerLabel}</div>
    </div>
{/if}

<style>
    /* Same story as the calendar: one copy of the design the schedule, cookie and
       pomodoro screens each used to carry. */
    .custom-time-picker {
        width: 190px;
        background-color: var(--bg-panel-color);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 99999;
        padding: 12px 10px 8px;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
    }

    .time-picker-main-row {
        display: flex;
        align-items: center;
        gap: 8px;
    }

    .time-arrows {
        display: flex;
        flex-direction: column;
        gap: 2px;
    }

    .time-arrow-btn {
        background: var(--bg-color);
        border: 1px solid var(--border-color);
        color: var(--text-on-color);
        cursor: pointer;
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        line-height: 1;
        transition: all 0.15s;
    }

    .time-arrow-btn:hover {
        background-color: var(--interactive-color);
        color: var(--text-color);
    }

    .time-arrow-btn:active {
        transform: scale(0.9);
    }

    .time-input-container {
        display: flex;
        align-items: center;
        gap: 5px;
        background-color: var(--bg-color);
        padding: 5px 8px;
        border-radius: 6px;
        border: 1px solid var(--border-color);
    }

    /* Everything is stated, including the things an unstyled input would already do:
       a page's own `input` rules are what this popup is being kept away from, and the
       ones that still reach it (a bare `input { }`, a `:focus-visible` ring) must not
       be able to change what it looks like. */
    .time-input-container input {
        width: 42px;
        height: auto;
        box-sizing: content-box;
        background: transparent;
        border: none;
        border-radius: 0;
        color: var(--text-on-color);
        font-family: 'Roboto Mono', monospace;
        font-size: 1.5rem;
        font-weight: 400;
        line-height: 1.15;
        text-align: center;
        outline: none;
        padding: 0;
    }

    .time-input-container input:focus,
    .time-input-container input:focus-visible {
        outline: none;
        border: none;
    }

    .time-input-container span {
        color: var(--text-color);
        font-size: 1.5rem;
        font-weight: bold;
        padding-bottom: 4px;
    }

    .time-picker-label {
        font-size: 10px;
        opacity: 0.6;
        color: var(--text-color);
        text-transform: uppercase;
        letter-spacing: 1px;
    }
</style>
