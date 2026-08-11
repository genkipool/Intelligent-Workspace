<script>
    let { tags = [], activeTag = '', allTagsLabel = 'All tags' } = $props();
</script>

<option value="">{allTagsLabel}</option>
{#each tags as t}
    <option value={t} selected={activeTag === t}>#{t}</option>
{/each}
