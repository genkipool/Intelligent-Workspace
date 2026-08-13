<script>
    import ThemeCard from '../ThemeCard.svelte';

    let {
        savedThemes = [],
        activeTheme = null,
        onactivate = () => {},
        onrename = () => {},
        ondelete = () => {},
        onedit = () => {},
        onschedule = () => {},
        onitemdragstart = () => {},
        ondrop = () => {},
    } = $props();
</script>

<div id="saved-themes-grid" class="saved-themes-grid">
    {#if savedThemes.length === 0}
        <p id="no-saved-themes-message" class="no-themes-message" data-i18n="noSavedThemes"></p>
    {/if}
    {#each savedThemes as theme, i (theme.name + i)}
        <ThemeCard
            {theme}
            index={i}
            isActive={activeTheme &&
                activeTheme.name === theme.name &&
                JSON.stringify(activeTheme.colors) === JSON.stringify(theme.colors)}
            {onactivate}
            {onrename}
            {ondelete}
            onedit={() => onedit(theme, i)}
            onschedule={() => onschedule(theme.name)}
            onitemdragstart={({ event }) => onitemdragstart(event, i)}
            ondrop={(e) => ondrop(e, i)}
            ondragover={(e) => e.preventDefault()}
        />
    {/each}
</div>
