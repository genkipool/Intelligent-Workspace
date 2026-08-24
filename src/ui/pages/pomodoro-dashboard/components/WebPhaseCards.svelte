<script>
    /**
     * [AI INSTRUCTION]
     * WHAT WAS BROWSED WHILE THE TIMER WAS RUNNING — one card per phase.
     *
     * Three questions the pomodoro dashboard could not answer on its own: where the
     * focus blocks actually went, and what the two kinds of break are spent on. The
     * seconds come from the web activity tracker, which banks every stretch against
     * the phase that was running at the time (`entry.p`), so nothing is inferred here.
     *
     * The three stand in one row because they are one comparison: the same sites
     * usually appear in all three, and reading them apart is the whole point.
     *
     * Time browsed with no timer going belongs to no phase and is in none of them,
     * which is why the three totals do not add up to the day.
     */
    import { t, tt } from '../../../stores/i18nStore.js';

    let {
        /** `[{ key, title, hint, total, totalLabel, rows: [{ domain, seconds, label, pct }] }]` */
        cards = [],
        emptyLabel = '',
    } = $props();
</script>

{#each cards as card, index (card.key)}
    <div class="chart-card animate-in delay-{index + 1}" data-sort-id={card.key}>
        <div class="chart-card-header">
            <div class="chart-card-title" title={card.hint}>
                <span
                    class="sort-grip"
                    data-sort-handle
                    role="button"
                    tabindex="-1"
                    aria-hidden="true"
                    title={$tt('dashboardDragPanel')}
                    aria-label={$t('dashboardDragPanel')}
                ></span>
                <span>{card.title}</span>
            </div>
            <div class="chart-card-meta">{card.totalLabel}</div>
        </div>
        {#if card.rows.length}
            <div class="wp-rows">
                {#each card.rows as row (row.domain)}
                    <div class="wp-row" title="{row.domain} · {row.label}">
                        <span class="wp-name">{row.domain}</span>
                        <span class="wp-bar"><span class="wp-bar-fill" style:width="{row.pct}%"></span></span>
                        <span class="wp-val">{row.label}</span>
                    </div>
                {/each}
            </div>
        {:else}
            <div class="no-data-msg">{emptyLabel}</div>
        {/if}
    </div>
{/each}

<style>
    .wp-rows {
        display: flex;
        flex-direction: column;
        gap: 7px;
    }

    /* The bar takes what the two texts leave, so three cards side by side keep their
       bars on the same scale even when one holds a hostname twice as long. */
    .wp-row {
        display: grid;
        grid-template-columns: minmax(0, 9rem) minmax(0, 1fr) auto;
        align-items: center;
        gap: 9px;
        font-size: 0.9rem;
    }

    .wp-name {
        font-family: var(--mono);
        color: var(--text-soft);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .wp-bar {
        height: 6px;
        border-radius: 3px;
        background: color-mix(in srgb, var(--border-color) 60%, transparent);
        overflow: hidden;
    }

    .wp-bar-fill {
        display: block;
        height: 100%;
        border-radius: 3px;
        background: var(--interactive-color);
    }

    .wp-val {
        font-family: var(--mono);
        color: var(--text-on-color);
        white-space: nowrap;
    }
</style>
