<script>
    import { lightThemeColors, darkThemeColors } from '../../services/constants.js';
    import { onMount } from 'svelte';
    import { t, tt } from '../../stores/i18nStore.js';
    import { showNotification } from '../../../utils/i18n.js';
    import { showUrlTooltip, hideUrlTooltip } from './urlTooltip.js';
    import RuleCardActions from './card/RuleCardActions.svelte';

    let {
        rule,
        index,
        isExpanded = false,
        isAlphaSort = false,
        isDraggable = true,
        isDragging = false,
        searchTerm = '',
        onupdateRuleName,
        ontoggleExpand,
        ontoggleStar,
        ondeleteRule,
        oneditRule,
        ontoggleActive,
        ondeleteDomain,
        oneditDomain,
        onchangeColor,
        ontoggleSort,
        onoverflowchange,
        ondragstart,
        ondragover,
        ondragend,
        ondrop,
    } = $props();

    let isStarred = $derived(rule.isStarred || false);
    let uniqueId = $derived(`rule-active-switch-${index}`);
    const _themeColors = window.matchMedia('(prefers-color-scheme: dark)').matches ? darkThemeColors : lightThemeColors;
    let groupColorHex = $derived(_themeColors[rule.color] || _themeColors.blue);

    let displayUrls = $derived.by(() => {
        let urls = rule.urls || [];
        if (isAlphaSort) {
            urls = [...urls].sort((a, b) => a.localeCompare(b));
        } else {
            urls = [...urls].sort((a, b) => a.length - b.length);
        }
        return urls;
    });

    let isLargeScreen = $state(true);
    let mqList;
    onMount(() => {
        mqList = window.matchMedia('(width <= 600px)');
        isLargeScreen = !mqList.matches;
        const updateMatch = (e) => (isLargeScreen = !e.matches);
        mqList.addEventListener('change', updateMatch);
        return () => mqList.removeEventListener('change', updateMatch);
    });

    let isEditingName = $state(false);
    let editingNameValue = $state('');
    let ruleNameInputEl = $state(null);

    function startEditingName() {
        isEditingName = true;
        editingNameValue = rule.name;
        setTimeout(() => {
            if (ruleNameInputEl) ruleNameInputEl.focus();
        }, 0);
    }

    function handleNameEditBlur() {
        saveEditedName();
    }

    function handleNameEditKeydown(e) {
        if (e.key === 'Enter') {
            saveEditedName();
        } else if (e.key === 'Escape') {
            isEditingName = false;
            editingNameValue = rule.name;
        }
    }

    function saveEditedName() {
        if (!isEditingName) return;
        isEditingName = false;
        const newName = editingNameValue.trim();
        if (newName && newName !== rule.name) {
            onupdateRuleName?.({ index, newName });
        }
    }

    function toggleExpand() {
        if (!rule.urls || rule.urls.length === 0) return;
        ontoggleExpand?.({ name: rule.name, index });
    }

    /**
     * Single delegated click handler: each interactive element is handled by the
     * first matching branch and whatever is left over toggles the card. The `else if`
     * chain matters — with independent guards the actions strip (and, on narrow
     * screens, the whole card) stops being clickable and the card only expands on the
     * few pixels no child element covers.
     */
    function handleCardClick(e) {
        if (isEditingName || editingDomainIndex !== -1) return;
        const target = e.target;

        if (target.closest('.rule-urls')) return; // links open on their own
        if (target.closest('.edit-icon')) {
            const wrapper = target.closest('.rule-urls-wrapper');
            const urlIndex = Number(wrapper?.dataset.urlIndex);
            if (!Number.isNaN(urlIndex)) editDomain(renderedUrls[urlIndex], urlIndex, wrapper);
        } else if (target.closest('.delete-icon')) {
            const wrapper = target.closest('.rule-urls-wrapper');
            if (wrapper?.dataset.url) deleteDomain(wrapper.dataset.url);
        } else if (target.closest('.collapse-btn')) {
            toggleExpand();
        } else if (target.closest('.star-button')) {
            toggleStar();
        } else if (target.closest('.expand-btn') || target.closest('.deploy-btn')) {
            toggleExpand();
        } else if (target.closest('.edit-button')) {
            editRule();
        } else if (target.closest('.delete-button')) {
            deleteRule();
        } else if (target.closest('.color-indicator')) {
            changeColor({ currentTarget: target.closest('.color-indicator') });
        } else if (target.closest('.sort-domains-btn')) {
            toggleSort();
        } else if (target.closest('.rule-name')) {
            e.preventDefault();
            copyRuleUrls();
        } else if (target.closest('.rule-actions')) {
            // The whole actions strip toggles, except the on/off switch.
            if (
                !target.closest('.switch-rule-actions') &&
                !target.closest('input') &&
                !target.closest('.svg-toggle-button')
            ) {
                toggleExpand();
            }
        } else if (!isLargeScreen) {
            // Narrow screens: anywhere on the card that is not interactive.
            if (!target.closest('.drag-handle') && !target.closest('input') && !target.closest('textarea')) {
                toggleExpand();
            }
        }
    }

    function toggleStar() {
        ontoggleStar?.({ index });
    }

    function deleteRule() {
        ondeleteRule?.({ index });
    }

    function editRule() {
        oneditRule?.({ index });
    }

    function toggleActive(e) {
        ontoggleActive?.({ index, active: e.target.checked });
    }

    function deleteDomain(url) {
        ondeleteDomain?.({ index, url });
    }

    let editingDomainIndex = $state(-1);
    let editingDomainUrl = $state('');

    let domainInputEl = $state(null);
    let editingDomainSize = $state({ width: 0, height: 0 });

    function editDomain(url, urlIndex, wrapperEl) {
        const wrapper = wrapperEl || cardEl?.querySelector(`.rule-urls-wrapper[data-url-index="${urlIndex}"]`);
        if (wrapper) {
            editingDomainSize = { width: wrapper.offsetWidth, height: wrapper.offsetHeight };
        }
        editingDomainIndex = urlIndex;
        editingDomainUrl = url;
    }

    // The input is created by the {#if}; focus it as soon as it exists so the caret
    // shows and Escape/blur reach it.
    $effect(() => {
        if (editingDomainIndex !== -1 && domainInputEl) {
            domainInputEl.focus();
            domainInputEl.select();
        }
    });

    function handleEditDomainKeydown(e, originalUrl) {
        if (e.key === 'Enter') {
            e.preventDefault();
            saveDomainEdit(originalUrl);
        } else if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            cancelDomainEdit();
        }
    }

    function saveDomainEdit(originalUrl) {
        if (editingDomainIndex === -1) return;
        const newUrl = editingDomainUrl.trim();
        editingDomainIndex = -1;
        if (newUrl && newUrl !== originalUrl) {
            oneditDomain?.({ index, url: originalUrl, newUrl });
        }
    }

    function cancelDomainEdit() {
        if (editingDomainIndex === -1) return;
        editingDomainIndex = -1;
        showNotification('urlUpdateCancelled');
    }

    // The edit/delete icons only exist visually while the row is hovered or focused, and
    // an element that is display:none is skipped by the arrow-key navigation. Keeping the
    // row's focus state here is what puts those two icons back on the keyboard path.
    let focusedUrlIndex = $state(-1);

    function handleUrlFocusIn(urlIndex) {
        focusedUrlIndex = urlIndex;
    }

    function handleUrlFocusOut(e, urlIndex) {
        const next = e.relatedTarget;
        if ((!next || !e.currentTarget.contains(next)) && focusedUrlIndex === urlIndex) {
            focusedUrlIndex = -1;
        }
    }

    /** Tab walks link → edit icon → delete icon inside the row, as in the original. */
    function handleUrlKeydown(e) {
        if (e.key !== 'Tab') return;
        const wrapper = e.currentTarget;
        const link = wrapper.querySelector('.rule-urls');
        const editIcon = wrapper.querySelector('.edit-icon');
        if (e.target === link && !e.shiftKey && editIcon) {
            e.preventDefault();
            editIcon.focus();
        } else if (e.target.closest('.edit-icon') && e.shiftKey && link) {
            e.preventDefault();
            link.focus();
        }
    }

    function changeColor(e) {
        const rect = e?.currentTarget?.getBoundingClientRect();
        // Anchored to the RIGHT of the
        // indicator (right + 5) and aligned with its top border.
        onchangeColor?.({ index, x: rect ? rect.right + 5 : 0, y: rect ? rect.top : 0 });
    }

    /** Copying is silent otherwise, so it looks as if the click did nothing. */
    async function copyRuleUrls() {
        const urls = rule.urls || [];
        if (urls.length === 0) return;
        try {
            await navigator.clipboard.writeText(urls.join('\n'));
            showNotification('urlsCopied', false, [urls.length]);
        } catch (error) {
            console.error('Error copying URLs:', error);
            showNotification('errorCopying', true);
        }
    }

    function openAllUrls() {
        const urls = rule.urls || [];
        urls.forEach((url) => chrome.tabs.create({ url, active: false }));
    }

    function toggleSort() {
        ontoggleSort?.({ index });
    }

    /** Splits a label around the search term so the matches can be wrapped in a mark. */
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

    /** Same shortening as the original: drop scheme, `www.` and path. */
    function displayText(url) {
        if (url.startsWith('file://')) return url.replace('file://', '').split('/').pop() || 'file://';
        return url
            .replace(/^https?:\/\//i, '')
            .replace(/^www\./i, '')
            .split('/')[0];
    }

    function toHref(url) {
        return /^[a-z]+:\/\//i.test(url) ? url : `https://${url}`;
    }

    /**
     * Opening is routed through the background for `file://` URLs, which content
     * pages are not allowed to navigate to. Ctrl+click opens in the background.
     */
    function handleUrlClick(e, url) {
        e.preventDefault();
        e.stopPropagation();
        const href = toHref(url);
        const active = !e.ctrlKey;
        if (href.startsWith('file://')) {
            chrome.runtime.sendMessage({ action: 'openFileUrl', url: href, active }, (response) => {
                if (response?.error) showNotification('errorOpeningFileUrl', true);
            });
        } else {
            chrome.tabs.create({ url: href, active });
        }
    }

    // ── URL overflow ─────────────────────────────────────────────────────────
    // Only the URLs that fit on the collapsed row are rendered, plus the ". . ."
    // button. Widths are taken with an off-screen probe instead of rendering the
    // full list first and trimming it, which would flash the extra URLs on every
    // render.
    let cardEl = $state(null);
    let urlsContainerEl = $state(null);
    let visibleUrlCount = $state(Infinity);
    let containerWidth = $state(0);
    let measuredWidth = 0;
    // The row stays invisible until the first measurement so the URLs that do not
    // fit are never painted and then removed.
    let measured = $state(false);

    // `expandedClass` is the *animated* state: it stays on until the collapse
    // transition finishes. The rendered list follows it rather than `isExpanded`,
    // otherwise collapsing would drop the extra URLs on the first frame and the
    // height would jump before the animation had a chance to run.
    let expandedClass = $state(isExpanded);

    // Nothing is rendered until the first measurement: painting the full list and
    // trimming it afterwards is what made the row flicker on every load.
    let renderedUrls = $derived(
        !measured
            ? []
            : expandedClass || visibleUrlCount === Infinity
              ? displayUrls
              : displayUrls.slice(0, visibleUrlCount),
    );
    let hasHiddenUrls = $derived(measured && !expandedClass && visibleUrlCount < displayUrls.length);
    let canExpand = $derived(measured && visibleUrlCount < displayUrls.length);

    const MORE_BUTTON_WIDTH = 55;

    /** Measures the rendered width of each label with a hidden, non-reflowing probe. */
    function measureLabelWidths(labels) {
        const sample = cardEl.querySelector('.rule-urls');
        const probe = document.createElement('span');
        probe.className = 'rule-urls';
        if (sample) {
            const cs = getComputedStyle(sample);
            probe.style.font = cs.font;
            probe.style.paddingLeft = cs.paddingLeft;
            probe.style.paddingRight = cs.paddingRight;
        }
        probe.style.position = 'absolute';
        probe.style.visibility = 'hidden';
        probe.style.whiteSpace = 'nowrap';
        probe.style.pointerEvents = 'none';
        document.body.appendChild(probe);
        const widths = labels.map((label) => {
            probe.textContent = label;
            return probe.offsetWidth;
        });
        probe.remove();
        return widths;
    }

    function measureOverflow() {
        if (!urlsContainerEl || !cardEl) return;
        measuredWidth = availableUrlWidth();
        containerWidth = Math.round(measuredWidth);

        // While expanded there is nothing to truncate, and keeping the collapsed
        // count untouched means collapsing restores the row without re-rendering
        // it — re-measuring here made the card shrink right after the animation.
        if (isExpanded) {
            measured = true;
            return;
        }
        if (displayUrls.length <= 1) {
            visibleUrlCount = Infinity;
            measured = true;
            return;
        }

        const gap = parseFloat(getComputedStyle(urlsContainerEl).columnGap) || 8;
        const widths = measureLabelWidths(displayUrls.map(displayText));
        const available = measuredWidth;

        let used = 0;
        let fitting = 0;
        for (const width of widths) {
            if (fitting === 0) {
                if (available && width + MORE_BUTTON_WIDTH > available && available > MORE_BUTTON_WIDTH) {
                    fitting = 1;
                    break;
                }
                if (available && width >= available && available <= MORE_BUTTON_WIDTH) break;
                used = width;
            } else {
                if (available && used + gap + width + MORE_BUTTON_WIDTH > available) break;
                used += gap + width;
            }
            fitting++;
        }

        visibleUrlCount = fitting < widths.length ? Math.max(1, fitting) : Infinity;
        measured = true;
    }

    function availableUrlWidth() {
        const cardStyle = getComputedStyle(cardEl);
        const paddingX = (parseFloat(cardStyle.paddingLeft) || 0) + (parseFloat(cardStyle.paddingRight) || 0);
        const gap = parseFloat(cardStyle.columnGap) || 8;
        const infoWidth = cardEl.querySelector('.rule-info')?.offsetWidth || 0;
        const actionsWidth = cardEl.querySelector('.rule-actions')?.offsetWidth || 0;
        return Math.max(0, cardEl.clientWidth - paddingX - infoWidth - actionsWidth - gap * 2 - 1);
    }

    $effect(() => {
        displayUrls;
        if (!urlsContainerEl || !cardEl) return;
        const raf = requestAnimationFrame(measureOverflow);
        return () => cancelAnimationFrame(raf);
    });

    $effect(() => {
        if (!cardEl) return;
        // Only a width change can alter how many URLs fit; observing the card rather
        // than the URL container avoids a feedback loop, since hiding the overflow
        // changes the container's own size.
        const observer = new ResizeObserver(() => {
            if (Math.abs(availableUrlWidth() - measuredWidth) > 1) measureOverflow();
        });
        observer.observe(cardEl);
        return () => observer.disconnect();
    });

    $effect(() => {
        onoverflowchange?.({ name: rule.name, hasHiddenUrls: canExpand });
    });

    // ── Expand / collapse animation ──────────────────────────────────────────
    // The `expanded` class switches the container to its grid layout, so on collapse
    // it has to stay until the height animation finishes; otherwise the row would
    // snap shut instead of sliding.
    let previousExpanded = isExpanded;

    let pendingAnimation = null;

    function animateHeight(el, expanding) {
        // Cancel whatever the previous animation still had scheduled: a stale
        // "finish" from an interrupted collapse would switch the class back off
        // right after a new expansion started.
        if (pendingAnimation) pendingAnimation.cancel();

        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            el.removeEventListener('transitionend', finish);
            clearTimeout(timer);
            pendingAnimation = null;
            el.style.maxHeight = '';
            expandedClass = expanding;
        };
        const timer = setTimeout(finish, 600);
        pendingAnimation = {
            cancel() {
                done = true;
                el.removeEventListener('transitionend', finish);
                clearTimeout(timer);
            },
        };
        el.addEventListener('transitionend', finish);

        if (expanding) {
            expandedClass = true;
            el.style.maxHeight = '0px';
            requestAnimationFrame(() => {
                if (done) return;
                el.style.maxHeight = `${el.scrollHeight}px`;
            });
        } else {
            el.style.maxHeight = `${el.scrollHeight}px`;
            requestAnimationFrame(() => {
                if (done) return;
                el.style.maxHeight = '0px';
            });
        }
    }

    $effect(() => {
        const expanding = isExpanded;
        if (expanding === previousExpanded) return;
        previousExpanded = expanding;
        if (!urlsContainerEl) {
            expandedClass = expanding;
            return;
        }
        animateHeight(urlsContainerEl, expanding);
    });
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div
    bind:this={cardEl}
    class="rule-item"
    data-index={index}
    class:expanded={isExpanded}
    class:dragging={isDragging}
    onclick={handleCardClick}
    {ondragover}
    {ondragend}
    {ondrop}
>
    <div class="rule-info" class:header-expanded={isExpanded} class:is-empty={!rule.urls || rule.urls.length === 0}>
        <button
            id="starButton"
            class="star-button"
            type="button"
            data-index={index}
            title={$tt(isStarred ? 'unstarRule' : 'starRule')}
            aria-label={$t(isStarred ? 'unstarRule' : 'starRule')}
            aria-pressed={isStarred}
        >
            <svg
                class="star-svg"
                class:starred={isStarred}
                width="25"
                height="25"
                viewBox="0 0 100 100"
                fill={isStarred ? 'var(--action-color)' : 'var(--bg-color)'}
                stroke={isStarred ? 'var(--action-color)' : 'var(--bg-color)'}
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-star"></use>
            </svg>
        </button>
        <button
            class="drag-handle"
            draggable={isDraggable}
            tabindex="0"
            type="button"
            title={$tt('reorderRule')}
            aria-label={$t('dragRule')}
            {ondragstart}
        >
            <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                style="color: var(--action-color);"
                aria-hidden="true"
                focusable="false"
            >
                <use href="#icon-drag"></use>
            </svg>
        </button>
        <span
            class="color-indicator"
            id="colorIndicator"
            data-index={index}
            style="background-color: {groupColorHex}"
            tabindex="0"
            role="button"
            title={$tt('changeRuleColor')}
            aria-label={$t('changeColor')}
            onkeydown={(e) => e.key === 'Enter' && changeColor({ currentTarget: e.currentTarget })}
        ></span>

        {#if isEditingName}
            <input
                bind:this={ruleNameInputEl}
                class="rule-name-edit"
                type="text"
                bind:value={editingNameValue}
                onkeydown={handleNameEditKeydown}
                onblur={handleNameEditBlur}
                spellcheck="false"
                translate="no"
                autocomplete="off"
            />
        {:else}
            <h3
                id="ruleName"
                class="rule-name"
                tabindex="0"
                role="button"
                data-original-text={rule.name}
                data-urls={(rule.urls || []).join('\n')}
                title={$tt('ruleNameTooltip')}
                aria-label={$tt('ruleNameTooltip')}
                ondblclick={startEditingName}
                oncontextmenu={(e) => {
                    e.preventDefault();
                    openAllUrls();
                }}
                onkeydown={(e) => e.key === 'Enter' && copyRuleUrls()}
                onmouseenter={(e) => showUrlTooltip(e.currentTarget, rule.urls)}
                onmouseleave={hideUrlTooltip}
                onfocus={(e) => showUrlTooltip(e.currentTarget, rule.urls)}
                onblur={hideUrlTooltip}
            >
                {@render highlighted(rule.name)}
            </h3>
        {/if}

        <button
            class="sort-domains-btn"
            type="button"
            aria-pressed={isAlphaSort}
            style="display: {isExpanded ? 'inline-block' : 'none'};"
            title={$tt(isAlphaSort ? 'viewOriginalOrder' : 'sortAlphabeticallyButton')}
        >
            <!-- The icon is drawn with currentColor, so the pressed state is a colour
                 change on the svg and lives in the shared stylesheet. -->
            <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" focusable="false">
                <use href="#icon-sort"></use>
            </svg>
        </button>
        <button
            class="collapse-btn"
            type="button"
            tabindex="0"
            data-index={index}
            style="display: {isExpanded && isLargeScreen ? 'inline-block' : 'none'};"
            title={$tt('collapseSection')}
            aria-label={$t('collapseSection')}
        >
            <span class="svg-deploy">
                <svg
                    width="28"
                    height="28"
                    viewBox="0 0 24 24"
                    style="color: var(--text-on-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-chevron-up"></use>
                </svg>
            </span>
        </button>
    </div>

    <div
        bind:this={urlsContainerEl}
        id="ruleUrlsContainer"
        class="rule-urls-container"
        class:expanded={expandedClass}
        data-expanded={isExpanded}
        data-original-width={containerWidth}
    >
        {#if displayUrls.length === 0}
            <span class="rule-urls">{$t('noUrlsAssociated') || 'No URLs associated'}</span>
        {:else}
            {#each renderedUrls as url, urlIndex (url)}
                <div
                    class="rule-urls-wrapper"
                    data-url={url}
                    data-url-index={urlIndex}
                    onfocusin={() => handleUrlFocusIn(urlIndex)}
                    onfocusout={(e) => handleUrlFocusOut(e, urlIndex)}
                    onkeydown={handleUrlKeydown}
                >
                    {#if editingDomainIndex === urlIndex}
                        <!--
                            The editor keeps the size the link had, otherwise swapping it
                            in reflows the whole card.
                        -->
                        <span
                            class="edit-wrapper"
                            spellcheck="false"
                            translate="no"
                            style="width: {editingDomainSize.width}px; height: {editingDomainSize.height}px;"
                        >
                            <input
                                bind:this={domainInputEl}
                                type="text"
                                class="edit-input"
                                id="edit-domain-input-{index}-{urlIndex}"
                                name="edit-domain-input-{index}-{urlIndex}"
                                spellcheck="false"
                                autocomplete="off"
                                translate="no"
                                bind:value={editingDomainUrl}
                                onkeydown={(e) => handleEditDomainKeydown(e, url)}
                                onblur={() => saveDomainEdit(url)}
                            />
                        </span>
                    {:else}
                        <a
                            class="rule-urls"
                            class:single-url={displayUrls.length === 1}
                            href={toHref(url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            tabindex="0"
                            translate="no"
                            data-original-text={url}
                            title={$t('ctrlClickUrl', [url])}
                            onclick={(e) => handleUrlClick(e, url)}>{@render highlighted(displayText(url))}</a
                        >
                    {/if}
                    <div class="icons-container" class:focus-visible={focusedUrlIndex === urlIndex}>
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
            {/each}
        {/if}
        {#if expandedClass}
            <button
                class="expand-btn"
                type="button"
                tabindex="0"
                title={$tt('collapseUrlsButton')}
                aria-label={$t('showLessUrls')}>^</button
            >
        {:else if hasHiddenUrls}
            <button
                class="expand-btn"
                type="button"
                tabindex="0"
                title={$tt('expandUrlsButton')}
                aria-label={$t('showMoreUrls')}>. . .</button
            >
        {/if}
    </div>

    <RuleCardActions {rule} {index} {isExpanded} {isLargeScreen} {ontoggleActive} {oneditRule} {ondeleteRule} />
</div>

{#snippet highlighted(text)}
    {#each splitOnTerm(text, searchTerm) as part (part.key)}
        {#if part.match}
            <span class="search-highlight">{part.text}</span>
        {:else}
            {part.text}
        {/if}
    {/each}
{/snippet}
