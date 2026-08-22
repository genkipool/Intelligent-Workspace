<script>
    /**
     * The sites, grouped by category, with the time each one took.
     *
     * Selecting a category or a site narrows the whole dashboard; selecting the same
     * one again clears it, so there is never a filter the user cannot get out of.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { SvelteMap, SvelteSet } from 'svelte/reactivity';
    import { fmtDur } from '../../../services/dashboard/format.js';

    let {
        sites = [],
        totalSeconds = 0,
        query = '',
        selectedSite = null,
        selectedCategory = '',
        openCategories = new SvelteSet(),
        onQuery,
        onSelectSite,
        onSelectCategory,
        onToggleCategory,
    } = $props();

    /** Sites that match the search box, grouped under the category they belong to. */
    const grouped = $derived.by(() => {
        const needle = query.trim().toLowerCase();
        const matching = needle ? sites.filter((site) => site.domain.includes(needle)) : sites;
        const byCategory = new SvelteMap();
        for (const site of matching) {
            if (!byCategory.has(site.category)) byCategory.set(site.category, { seconds: 0, sites: [] });
            const bucket = byCategory.get(site.category);
            bucket.seconds += site.seconds;
            bucket.sites.push(site);
        }
        return [...byCategory.entries()]
            .map(([category, bucket]) => ({ category, ...bucket }))
            .sort((a, b) => b.seconds - a.seconds);
    });

    /** A search always opens what it found; otherwise the user's own choice stands. */
    const isOpen = (category) => !!query.trim() || openCategories.has(category) || selectedCategory === category;

    const share = (seconds) => (totalSeconds > 0 ? Math.round((seconds / totalSeconds) * 100) : 0);

    const faviconFor = (domain) =>
        `chrome-extension://${chrome.runtime.id}/_favicon/?pageUrl=${encodeURIComponent('https://' + domain)}&size=16`;
</script>

<aside class="sidebar">
    <div class="sidebar-header">
        <div class="sidebar-top-label">{$t('webActivitySites')}</div>
        <div class="sidebar-search">
            <svg class="search-icon" width="12" height="12" aria-hidden="true" focusable="false"
                ><use href="#wa-search"></use></svg
            >
            <input
                type="text"
                placeholder={$t('webActivitySearchSites')}
                value={query}
                oninput={(e) => onQuery(e.currentTarget.value)}
            />
        </div>
    </div>

    <div class="sidebar-all">
        <div
            class="sidebar-item"
            class:active={!selectedSite && !selectedCategory}
            role="button"
            tabindex="0"
            title={$tt('webActivityAllSites')}
            onclick={() => {
                onSelectSite(null);
                onSelectCategory('');
            }}
            onkeydown={(e) => {
                if (e.key === 'Enter') {
                    onSelectSite(null);
                    onSelectCategory('');
                }
            }}
        >
            <span class="si-name">{$t('webActivityAllSites')}</span>
            <span class="si-count">{fmtDur(totalSeconds)}</span>
        </div>
    </div>

    <div class="sidebar-scroll">
        {#each grouped as group (group.category)}
            <div class="folder-block" class:open={isOpen(group.category)}>
                <div
                    class="folder-row"
                    class:active={selectedCategory === group.category}
                    role="button"
                    tabindex="0"
                    title={$tt('webActivityFilterByCategory')}
                    onclick={() => onSelectCategory(group.category)}
                    onkeydown={(e) => e.key === 'Enter' && onSelectCategory(group.category)}
                >
                    <span
                        class="folder-arrow"
                        role="button"
                        tabindex="0"
                        onclick={(e) => {
                            e.stopPropagation();
                            onToggleCategory(group.category);
                        }}
                        onkeydown={(e) => {
                            if (e.key === 'Enter') {
                                e.stopPropagation();
                                onToggleCategory(group.category);
                            }
                        }}
                    >
                        <svg width="10" height="10" aria-hidden="true" focusable="false"
                            ><use href="#wa-chevron"></use></svg
                        >
                    </span>
                    <span class="folder-label">{$t('webActivityCategory_' + group.category)}</span>
                    <span class="folder-count">
                        {fmtDur(group.seconds)}
                    </span>
                </div>
                <div class="folder-children">
                    {#each group.sites as site (site.domain)}
                        <div
                            class="sidebar-item"
                            class:active={selectedSite === site.domain}
                            role="button"
                            tabindex="0"
                            title="{site.domain} — {share(site.seconds)}%"
                            onclick={() => onSelectSite(site.domain)}
                            onkeydown={(e) => e.key === 'Enter' && onSelectSite(site.domain)}
                        >
                            <img class="si-icon si-favicon" src={faviconFor(site.domain)} alt="" loading="lazy" />
                            <span class="si-name">{site.domain}</span>
                            <span class="si-count">{fmtDur(site.seconds)}</span>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
        {#if !grouped.length}
            <div class="no-data-msg">{$t('webActivityNoSites')}</div>
        {/if}
    </div>
</aside>
