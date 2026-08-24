<script>
    /**
     * [AI INSTRUCTION]
     * THE SITES THE CLOCK NEVER RUNS ON.
     *
     * Reachable from the log's own rows, one button per site, which is where the
     * decision is normally made. This is the other half of that: the list of what was
     * excluded, and the only way back for a site that is no longer being visited and
     * so no longer appears in the log at all.
     *
     * Typed entries are checked before they are stored. A hostname that is not a
     * hostname would sit in the list forever matching nothing, and the user would
     * have no way of telling that from a rule that works.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let {
        domains = [],
        /** How many names stand side by side. */
        columns = 3,
        onAdd,
        onRemove,
    } = $props();

    let draft = $state('');
    let error = $state('');

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;

    /**
     * The hostname a typed entry means, or null when it is not a site.
     *
     * `URL` accepts a great deal that is not a website — `a`, `1.2`, a bare word —
     * because any of them is a valid hostname on a private network. The dot and the
     * two-letter tail are what separate "example.com" from a typo, and they are what
     * the tracker will actually be matching against.
     */
    function hostOf(raw) {
        const text = raw.trim();
        if (!text) return null;
        const host = WA.domainOf(text.includes('://') ? text : `https://${text}`);
        if (!host) return null;
        return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9-]+)*\.[a-z]{2,}$/i.test(host) ? host : null;
    }

    function submit() {
        const host = hostOf(draft);
        if (!host) {
            error = $t('webActivityIgnoredInvalid');
            return;
        }
        if (domains.includes(host)) {
            error = $t('webActivityIgnoredDuplicate');
            return;
        }
        error = '';
        draft = '';
        onAdd(host);
    }

    /** Three columns, filled left to right, so the list reads as rows of a table. */
    /** Three across a page, two across a panel: any narrower and the names ellipsise. */
    const COLUMNS = $derived(columns);

    const rows = $derived.by(() => {
        const out = [];
        for (let index = 0; index < domains.length; index += COLUMNS) {
            // Short rows are padded, or the last row's cells would stretch to fill the
            // width and stop lining up with the ones above.
            out.push(Array.from({ length: COLUMNS }, (_, offset) => domains[index + offset] ?? null));
        }
        return out;
    });
</script>

<div class="wa-set-block">
    <p class="wa-set-note">{$t('webActivitySettingsIgnoredHint')}</p>

    <div class="wa-inline-form">
        <input
            class="wa-text-input"
            type="text"
            bind:value={draft}
            placeholder="example.com"
            autocomplete="off"
            spellcheck="false"
            aria-label={$t('webActivityIgnoredAdd')}
            class:input-error={!!error}
            oninput={() => (error = '')}
            onkeydown={(e) => e.key === 'Enter' && submit()}
        />
        <button
            class="wa-add-btn"
            type="button"
            disabled={!draft.trim()}
            title={$tt('webActivityIgnoredAdd')}
            onclick={submit}
        >
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-plus"></use></svg>
            <span>{$t('webActivityIgnoredAdd')}</span>
        </button>
    </div>
    {#if error}
        <p class="wa-field-warning">{error}</p>
    {/if}

    {#if !domains.length}
        <p class="wa-empty-line">{$t('webActivityIgnoredEmpty')}</p>
    {:else}
        <table class="wa-ignored-table">
            <tbody>
                {#each rows as row, index (index)}
                    <tr>
                        {#each row as domain, column (column)}
                            <td>
                                {#if domain}
                                    <span class="wa-ignored-cell">
                                        <img class="si-favicon" src={faviconFor(domain)} alt="" loading="lazy" />
                                        <span class="wa-ignored-name" title={domain}>{domain}</span>
                                        <button
                                            class="wa-icon-btn wa-icon-btn-danger"
                                            type="button"
                                            title={$tt('webActivityUnignoreDomainBtn')}
                                            aria-label={$t('webActivityUnignoreDomainBtn')}
                                            onclick={() => onRemove(domain)}
                                        >
                                            <svg width="12" height="12" aria-hidden="true" focusable="false"
                                                ><use href="#wa-close"></use></svg
                                            >
                                        </button>
                                    </span>
                                {/if}
                            </td>
                        {/each}
                    </tr>
                {/each}
            </tbody>
        </table>
    {/if}
</div>
