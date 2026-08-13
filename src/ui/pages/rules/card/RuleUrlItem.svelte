<script>
    import { t, tt } from '../../../stores/i18nStore.js';

    let {
        url,
        urlIndex,
        ruleIndex,
        isSingleUrl = false,
        searchTerm = '',
        isEditing = false,
        editingUrl = $bindable(''),
        editingSize = { width: 0, height: 0 },
        isFocused = false,
        onfocusin = () => {},
        onfocusout = () => {},
        onkeydown = () => {},
        oneditkeydown = () => {},
        onsaveedit = () => {},
        onclickurl = () => {},
    } = $props();

    let domainInputEl = $state(null);

    $effect(() => {
        if (isEditing && domainInputEl) {
            domainInputEl.focus();
            domainInputEl.select();
        }
    });

    function splitOnTerm(text, term) {
        const value = String(text ?? '');
        if (!term) return [{ text: value, match: false, key: '0' }];
        const parts = [];
        const lower = value.toLowerCase();
        const needle = term.toLowerCase();
        let from = 0;
        let at = lower.indexOf(needle);
        while (at !== -1) {
            if (at > from) parts.push({ text: value.slice(from, at), match: false, key: `${from}` });
            parts.push({ text: value.slice(at, at + needle.length), match: true, key: `m${at}` });
            from = at + needle.length;
            at = lower.indexOf(needle, from);
        }
        if (from < value.length) parts.push({ text: value.slice(from), match: false, key: `${from}` });
        return parts;
    }

    function displayText(rawUrl) {
        if (rawUrl.startsWith('file://')) return rawUrl.replace('file://', '').split('/').pop() || 'file://';
        return rawUrl
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0];
    }

    function toHref(rawUrl) {
        return /^[a-z]+:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
    }
</script>

<div class="rule-urls-wrapper" data-url={url} data-url-index={urlIndex} {onfocusin} {onfocusout} {onkeydown}>
    {#if isEditing}
        <span
            class="edit-wrapper"
            spellcheck="false"
            translate="no"
            style="width: {editingSize.width}px; height: {editingSize.height}px;"
        >
            <input
                bind:this={domainInputEl}
                type="text"
                class="edit-input"
                id="edit-domain-input-{ruleIndex}-{urlIndex}"
                name="edit-domain-input-{ruleIndex}-{urlIndex}"
                spellcheck="false"
                autocomplete="off"
                translate="no"
                bind:value={editingUrl}
                onkeydown={oneditkeydown}
                onblur={onsaveedit}
            />
        </span>
    {:else}
        <a
            class="rule-urls"
            class:single-url={isSingleUrl}
            href={toHref(url)}
            target="_blank"
            rel="noopener noreferrer"
            tabindex="0"
            translate="no"
            data-original-text={url}
            title={$t('ctrlClickUrl', [url])}
            onclick={onclickurl}
        >
            {#each splitOnTerm(displayText(url), searchTerm) as part (part.key)}
                {#if part.match}
                    <span class="search-highlight">{part.text}</span>
                {:else}
                    {part.text}
                {/if}
            {/each}
        </a>
    {/if}
    <div class="icons-container" class:focus-visible={isFocused}>
        <button class="edit-icon" type="button" tabindex="0" title={$tt('editDomain')}>
            <svg width="30" height="30" viewBox="0 0 512 512" aria-hidden="true" focusable="false">
                <use href="#icon-url-edit"></use>
            </svg>
        </button>
        <button class="delete-icon" type="button" tabindex="0" title={$tt('deleteDomain')}>
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <use href="#icon-trash"></use>
            </svg>
        </button>
    </div>
</div>
