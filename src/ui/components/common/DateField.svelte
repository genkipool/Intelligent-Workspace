<script>
    import { tick } from 'svelte';
    import { t } from '../../stores/i18nStore.js';

    /**
     * Date field with the extension's own calendar popup.
     *
     * Native `<input type="date">` brings the browser's picker, which ignores the
     * theme and looks nothing like the rest of the UI. This is the shared version of
     * the calendar the schedule screens were each carrying their own copy of.
     *
     * @typedef {object} Props
     * @property {string} value - `YYYY-MM-DD`, or empty for no date.
     * @property {boolean} [allowPast] - Whether days before today can be picked.
     * @property {string} [id]
     * @property {(value: string) => void} [onchange] - For callers that cannot bind.
     */
    let { value = $bindable(''), allowPast = false, id = undefined, onchange = undefined } = $props();

    const PLACEHOLDER = 'YYYY-MM-DD';

    let open = $state(false);
    let triggerEl = $state(null);
    let popupEl = $state(null);
    let popupStyle = $state('');
    let month = $state(new Date());

    const selected = $derived(value ? parseDate(value) : null);

    function parseDate(text) {
        const [y, m, d] = text.split('-').map(Number);
        return y && m && d ? new Date(y, m - 1, d) : null;
    }

    function format(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    }

    const MONTH_KEYS = [
        'monthJanuary',
        'monthFebruary',
        'monthMarch',
        'monthApril',
        'monthMay',
        'monthJune',
        'monthJuly',
        'monthAugust',
        'monthSeptember',
        'monthOctober',
        'monthNovember',
        'monthDecember',
    ];
    const WEEKDAY_KEYS = [
        'daySunInitial',
        'dayMonInitial',
        'dayTueInitial',
        'dayWedInitial',
        'dayThuInitial',
        'dayFriInitial',
        'daySatInitial',
    ];

    /** Builds the month grid, padded so the 1st lands on its weekday. */
    const days = $derived.by(() => {
        const first = new Date(month.getFullYear(), month.getMonth(), 1);
        const total = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const cells = Array.from({ length: first.getDay() }, () => ({ empty: true }));
        for (let day = 1; day <= total; day++) {
            const date = new Date(month.getFullYear(), month.getMonth(), day);
            cells.push({
                day,
                date,
                isToday: date.getTime() === today.getTime(),
                isPast: !allowPast && date < today,
                isSelected: !!selected && date.getTime() === selected.getTime(),
            });
        }
        return cells;
    });

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
        month = selected ? new Date(selected) : new Date();
        tick().then(place);
    }

    function pick(date) {
        value = format(date);
        open = false;
        onchange?.(value);
    }

    function clear() {
        value = '';
        open = false;
        onchange?.(value);
    }

    function handleOutside(e) {
        if (!open) return;
        if (popupEl?.contains(e.target) || triggerEl?.contains(e.target)) return;
        open = false;
    }
</script>

<svelte:window onclick={handleOutside} onresize={place} onscroll={place} />

<div
    {id}
    bind:this={triggerEl}
    class="custom-input-trigger"
    role="button"
    tabindex="0"
    onclick={toggle}
    onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), toggle())}
>
    {#if value}
        {value}
    {:else}
        <span class="val-placeholder">{PLACEHOLDER}</span>
    {/if}
</div>

{#if open}
    <div class="custom-calendar" bind:this={popupEl} style={popupStyle}>
        <div class="calendar-header">
            <button
                type="button"
                onclick={(e) => {
                    e.stopPropagation();
                    month = new Date(month.getFullYear(), month.getMonth() - 1, 1);
                }}>&lt;</button
            >
            <span>{$t(MONTH_KEYS[month.getMonth()])} {month.getFullYear()}</span>
            <button
                type="button"
                onclick={(e) => {
                    e.stopPropagation();
                    month = new Date(month.getFullYear(), month.getMonth() + 1, 1);
                }}>&gt;</button
            >
        </div>
        <div class="calendar-weekdays">
            {#each WEEKDAY_KEYS as key}
                <span>{$t(key)}</span>
            {/each}
        </div>
        <div class="calendar-grid">
            {#each days as cell}
                {#if cell.empty}
                    <div class="calendar-day empty"></div>
                {:else if cell.isPast}
                    <div class="calendar-day disabled">{cell.day}</div>
                {:else}
                    <div
                        class="calendar-day"
                        class:today={cell.isToday}
                        class:selected={cell.isSelected}
                        role="button"
                        tabindex="0"
                        onclick={(e) => {
                            e.stopPropagation();
                            pick(cell.date);
                        }}
                        onkeydown={(e) => (e.key === 'Enter' || e.key === ' ') && pick(cell.date)}
                    >
                        {cell.day}
                    </div>
                {/if}
            {/each}
        </div>
        <div class="calendar-footer">
            <button
                type="button"
                onclick={(e) => {
                    e.stopPropagation();
                    clear();
                }}>{$t('reset')}</button
            >
        </div>
    </div>
{/if}

<style>
    /* The calendar used to exist four times over, once per screen, each with its own
       id-scoped copy of these rules. This is that same design, held once, so every
       date field looks like the one behind the history filter button. */
    .custom-calendar {
        width: 260px;
        background-color: var(--bg-panel-color);
        border: 1px solid var(--border-color);
        border-radius: 8px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
        z-index: 99999;
        padding: 10px;
        user-select: none;
    }

    .calendar-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 10px;
        color: var(--text-on-color);
        font-weight: bold;
    }

    .calendar-header button {
        background: none;
        border: none;
        color: var(--text-color);
        cursor: pointer;
        font-size: 18px;
        padding: 2px 6px;
        border-radius: 4px;
    }

    .calendar-header button:hover {
        background-color: var(--interactive-color);
    }

    .calendar-weekdays {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        text-align: center;
        font-size: 12px;
        opacity: 0.7;
        margin-bottom: 5px;
    }

    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        gap: 2px;
    }

    .calendar-day {
        aspect-ratio: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        border-radius: 4px;
        font-size: 13px;
        transition: background-color 0.15s ease;
    }

    .calendar-day.empty {
        cursor: default;
    }

    .calendar-day.disabled {
        opacity: 0.3;
        cursor: not-allowed;
    }

    .calendar-day:hover:not(.empty):not(.disabled) {
        border: 1px solid var(--action-color);
    }

    .calendar-day.selected {
        background-color: var(--action-color);
        color: var(--bg-color);
    }

    .calendar-day.today {
        border: 1.5px solid var(--action-color);
        font-weight: bold;
        color: var(--text-on-color);
    }

    .calendar-day.today:hover:not(.empty) {
        background-color: var(--interactive-color);
        color: var(--text-color);
    }

    .calendar-day.today.selected {
        background-color: var(--action-color);
        color: var(--bg-color);
    }

    .calendar-footer {
        margin-top: 10px;
        text-align: center;
        border-top: 1px solid var(--border-color);
        padding-top: 5px;
    }

    /* The reset control is a plain underlined link in the app's calendars, not a
       button with a background. */
    .calendar-footer button {
        background: none;
        border: none;
        color: var(--error-color);
        font-size: 0.8rem;
        cursor: pointer;
        text-decoration: underline;
    }
</style>
