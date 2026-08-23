<script>
    /**
     * [AI INSTRUCTION]
     * THE BAR AT THE TOP OF A SIDE-PANEL PAGE.
     *
     * A title on the left and a row of icon buttons on the right — the rules page, the
     * group list and the web activity panel all had their own copy of it, and the
     * third one existed only because the first was pasted in and edited. The markup is
     * here now; each page supplies its own title and its own buttons.
     *
     * What is NOT abstracted away is the classes and the ids. The group list's buttons
     * are wired from plain JS by `getElementById`, and both pages' looks come from
     * their own stylesheets, so every caller passes the exact `id` and `class` its page
     * already used. This is markup reuse, not a new design: adopting it must not change
     * a single rendered attribute.
     *
     * `actions` is `[{ id, class, icon, viewBox, size, svgAttrs, title, i18nTitle, ariaLabel,
     * i18nAriaLabel, pressed, active, hidden, translate, tabindex, onclick }]`. `onclick` is optional
     * — the group list attaches its handlers by id from elsewhere, and passing none
     * leaves that untouched. `tabindex` is only rendered when a caller asks for it: a
     * button is focusable already, and adding it everywhere would have changed the
     * markup of every page that adopted this.
     *
     * `icons` maps an action's id to a snippet that draws its glyph, for the pages
     * with no sprite to point `<use>` at — the themes page draws all five of its icons
     * inline. Snippets only exist once the caller's template runs, which is why they
     * arrive separately from the list its `<script>` builds.
     *
     * `svgAttrs` is for a sprite whose glyph is drawn rather than filled: the popup's
     * rules icon is three bare paths, so the stroke colour and width have to come from
     * the `<svg>` that references them or nothing is painted.
     */
    let {
        /** The heading text, already translated. */
        title = '',
        titleId = undefined,
        /** Empty for the popup, whose heading is styled by the tag alone and carries no class. */
        titleClass = 'header-main-title',
        /** `data-i18n` on the heading, for the pages whose vanilla code re-translates it. */
        titleI18n = undefined,
        /** When given, the heading becomes a button — the rules page opens its tutorial. */
        onTitleClick = null,
        /** The wrapper element's class: `header-main-menu` or the group list's `header`. */
        headerClass = 'header-main-menu',
        /** A wrapper around the buttons. The group list has one; the rules page does not. */
        actionsClass = '',
        actions = [],
        icons = {},
    } = $props();
</script>

{#snippet buttons()}
    {#each actions as action (action.id ?? action.class)}
        <button
            id={action.id}
            class={action.class}
            class:hidden={action.hidden}
            class:pinned={action.pinned}
            type="button"
            translate={action.translate ?? 'no'}
            {...action.tabindex === undefined ? {} : { tabindex: action.tabindex }}
            class:active={action.active}
            aria-pressed={action.pressed}
            aria-label={action.ariaLabel}
            data-i18n-aria-label={action.i18nAriaLabel}
            title={action.title}
            data-i18n-title={action.i18nTitle}
            onclick={action.onclick}
        >
            {#if icons[action.id]}
                {@render icons[action.id]()}
            {:else}
                <svg
                    width={action.size ?? 20}
                    height={action.size ?? 20}
                    viewBox={action.viewBox}
                    {...action.svgAttrs ?? {}}
                    style="color: var(--text-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href={action.icon}></use>
                </svg>
            {/if}
        </button>
    {/each}
{/snippet}

<header class={headerClass}>
    {#if onTitleClick}
        <h1
            id={titleId}
            class={titleClass || undefined}
            style="cursor: pointer;"
            role="button"
            tabindex="0"
            data-i18n={titleI18n}
            onclick={onTitleClick}
            onkeydown={(e) => e.key === 'Enter' && onTitleClick()}
        >
            {title}
        </h1>
    {:else}
        <h1 id={titleId} class={titleClass || undefined} data-i18n={titleI18n}>{title}</h1>
    {/if}

    {#if actionsClass}
        <div class={actionsClass}>{@render buttons()}</div>
    {:else}
        {@render buttons()}
    {/if}
</header>
