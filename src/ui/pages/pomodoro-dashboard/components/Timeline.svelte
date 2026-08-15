<script>
    let {
        sorted = [],
        effColor = () => '',
        fmtDateShort = () => '',
        fmtTime = () => '',
        fmtDur = () => '',
        i18n = () => '',
    } = $props();

    /**
     * The three icons used to be HTML strings rendered with {@html}, which asks the
     * browser to parse the same markup again for every entry in the timeline. They
     * are snippets now: the compiler emits them as real nodes, and nothing on this
     * page goes through the HTML parser at run time.
     */
</script>

{#snippet clockIcon()}
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="flex-shrink:0;opacity:0.8"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
    </svg>
{/snippet}

{#snippet folderIcon()}
    <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="flex-shrink:0"
        aria-hidden="true"
    >
        <path
            d="M3 8.2c0-1.12 0-1.68.218-2.108a2 2 0 0 1 .874-.874C4.52 5 5.08 5 6.2 5h3.475c.489 0 .733 0 .963.055.204.05.4.13.579.24.201.123.374.296.72.642l.126.126c.346.346.519.519.72.642q.271.165.579.24c.23.055.474.055.963.055H17.8c1.12 0 1.68 0 2.108.218a2 2 0 0 1 .874.874C21 8.52 21 9.08 21 10.2v5.6c0 1.12 0 1.68-.218 2.108a2 2 0 0 1-.874.874C19.48 19 18.92 19 17.8 19H6.2c-1.12 0-1.68 0-2.108-.218a2 2 0 0 1-.874-.874C3 17.48 3 16.92 3 15.8z"
        />
    </svg>
{/snippet}

{#snippet alertIcon()}
    <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.5"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="flex-shrink:0"
        aria-hidden="true"
    >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
{/snippet}

{#each sorted as e (e.id)}
    {@const t = (e.totalFocusSeconds || 0) + (e.totalBreakSeconds || 0)}
    {@const eff = t > 0 ? Math.round(((e.totalFocusSeconds || 0) / t) * 100) : 0}
    {@const cyclesWord = (e.completedCycles || 0) !== 1 ? i18n('dashboardCycles') : i18n('dashboardCycle')}

    <div class="timeline-item">
        <div class="timeline-dot-col"><div class="tl-dot"></div></div>
        <div class="timeline-body">
            <div class="tl-project">{e.projectName || i18n('dashboardNoName')}</div>
            <div class="tl-meta">
                <span class="tl-chip">{fmtDateShort(e.savedAt)} - {fmtTime(e.savedAt)}</span>
                <span class="tl-chip" style="display:inline-flex;align-items:center;gap:4px">
                    {@render clockIcon()}
                    {fmtDur(e.totalFocusSeconds || 0)}
                </span>
                <span class="tl-chip">{e.completedCycles || 0} {cyclesWord}</span>
                <span class="tl-chip" style="color:{effColor(eff)}">{eff}% {i18n('dashboardEffLegend')}</span>
                {#if e.projectFolder}
                    <span class="tl-chip" style="opacity:.7;display:inline-flex;align-items:center;gap:4px">
                        {@render folderIcon()}
                        {e.projectFolder}
                    </span>
                {/if}
                {#if e.projectTag}
                    <span class="tl-chip tl-tag">#{e.projectTag}</span>
                {/if}
                {#if (e.interruptions || 0) > 0}
                    <span
                        class="tl-chip"
                        style="color:var(--error-color);display:inline-flex;align-items:center;gap:4px"
                    >
                        {@render alertIcon()}
                        {e.interruptions}
                    </span>
                {/if}
            </div>
        </div>
    </div>
{/each}
