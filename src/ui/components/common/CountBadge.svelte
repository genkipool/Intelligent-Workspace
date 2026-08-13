<script>
    let {
        count = 0,
        max = 999,
        showZero = false,
        pulseOnUpdate = true,
        title = '',
        ariaLabel = '',
        className = '',
        onclick = null
    } = $props();

    let displayCount = $derived(count > max ? `${max}+` : count);
    let isVisible = $derived(showZero || count > 0);

    let isUpdated = $state(false);
    let prevCount = $state(count);

    $effect(() => {
        if (pulseOnUpdate && count !== prevCount) {
            prevCount = count;
            if (count > 0) {
                isUpdated = true;
                const timer = setTimeout(() => {
                    isUpdated = false;
                }, 500);
                return () => clearTimeout(timer);
            }
        } else {
            prevCount = count;
        }
    });
</script>

{#if isVisible}
    {#if onclick}
        <button
            type="button"
            class="badge-count {className}"
            class:updated={isUpdated}
            {title}
            aria-label={ariaLabel || title || `${count}`}
            {onclick}
        >
            {displayCount}
        </button>
    {:else}
        <span
            class="badge-count {className}"
            class:updated={isUpdated}
            {title}
            role="status"
            aria-label={ariaLabel || title || `${count}`}
        >
            {displayCount}
        </span>
    {/if}
{/if}
