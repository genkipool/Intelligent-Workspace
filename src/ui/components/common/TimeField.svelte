<script>
    import { tick } from 'svelte';

    /**
     * Time field with the extension's own hour/minute popup.
     *
     * Shared for the same reason as {@link DateField}: the native picker ignores the
     * theme, and every schedule screen had grown its own copy of this one.
     *
     * @typedef {object} Props
     * @property {string} value - `HH:MM`.
     * @property {string} [id]
     * @property {(value: string) => void} [onchange] - For callers that cannot bind.
     */
    let { value = $bindable('00:00'), id = undefined, onchange = undefined } = $props();

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
        const next = `${clamp(hour, 23)}:${clamp(minute, 59)}`;
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
        if (value === '00:00' || !value) {
            const now = new Date();
            hour = String(now.getHours()).padStart(2, '0');
            minute = String(now.getMinutes()).padStart(2, '0');
        } else {
            hour = h;
            minute = m;
        }
        tick().then(place);
    }

    function step(unit, delta) {
        if (unit === 'hour') hour = String((Number(hour) + delta + 24) % 24).padStart(2, '0');
        else minute = String((Number(minute) + delta + 60) % 60).padStart(2, '0');
        commit();
    }

    function handleOutside(e) {
        if (!open) return;
        if (popupEl?.contains(e.target) || triggerEl?.contains(e.target)) return;
        commit();
        open = false;
    }
</script>

<svelte:window onclick={handleOutside} onresize={place} onscroll={place} />

<div
    {id}
    bind:this={triggerEl}
    class="custom-input-trigger time-trigger"
    role="button"
    tabindex="0"
    onclick={toggle}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
>
    {value || '00:00'}
</div>

{#if open}
    <div class="custom-time-picker" bind:this={popupEl} style={popupStyle}>
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
                    maxlength="2"
                    inputmode="numeric"
                    placeholder="00"
                    bind:value={hour}
                    oninput={commit}
                    onblur={() => {
                        hour = clamp(hour, 23);
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
        <div class="time-picker-label">24h</div>
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

    .time-input-container input {
        width: 35px;
        background: transparent;
        border: none;
        color: var(--text-on-color);
        font-family: 'Roboto Mono', monospace;
        font-size: 1.5rem;
        text-align: center;
        outline: none;
        padding: 0;
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
