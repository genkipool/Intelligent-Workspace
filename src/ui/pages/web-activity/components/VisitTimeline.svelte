<script>
    /**
     * The most recent visits, newest first — the "what was I doing" view that a daily
     * total cannot give you.
     */
    import { t, currentLang } from '../../../stores/i18nStore.js';
    import { fmtDateShort, fmtTime } from '../../../services/dashboard/format.js';

    let { visits = [], limit = 40 } = $props();

    const shown = $derived(visits.slice(0, limit));

    /** The path of a URL, which is what tells two visits to the same site apart. */
    function pathOf(url) {
        try {
            const parsed = new URL(url);
            return (parsed.pathname + parsed.search).replace(/^\/$/, '');
        } catch {
            return '';
        }
    }
</script>

<div class="timeline">
    {#each shown as visit, index (visit.at + '|' + index)}
        <div class="timeline-item">
            <div class="timeline-dot-col"><div class="tl-dot"></div></div>
            <div class="timeline-body">
                <div class="tl-project" title={visit.t || visit.u}>{visit.t || visit.d}</div>
                <div class="tl-meta">
                    <span class="tl-chip"
                        >{fmtDateShort(visit.at, $currentLang)} - {fmtTime(visit.at, $currentLang)}</span
                    >
                    <span class="tl-chip tl-tag">{visit.d}</span>
                    {#if pathOf(visit.u)}
                        <span class="tl-chip wa-truncate" title={visit.u}>{pathOf(visit.u)}</span>
                    {/if}
                </div>
            </div>
        </div>
    {/each}
    {#if !shown.length}
        <div class="no-data-msg">{$t('webActivityNoVisits')}</div>
    {/if}
</div>
