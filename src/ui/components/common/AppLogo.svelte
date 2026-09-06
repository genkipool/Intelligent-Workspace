<script>
    /**
     * AppLogo.svelte
     *
     * Dynamic, accessible SVG logo component for Intelligent Workspace.
     * Automatically adapts to the active theme (light, dark, viridian, or custom)
     * via CSS theme variables, or can be locked to a specific theme via the `theme` prop.
     *
     * @prop {number|string} [size] - Square dimension helper (overrides width and height)
     * @prop {number|string} [width='100%'] - Width of the SVG
     * @prop {number|string} [height='100%'] - Height of the SVG
     * @prop {string} [class=''] - Additional CSS classes
     * @prop {'auto'|'original'|'light'|'dark'|'viridian'} [theme='auto'] - Specific theme override
     * @prop {string} [ariaLabel='Intelligent Workspace Logo'] - Accessibility label
     * @prop {string} [role='img'] - ARIA role
     * @prop {string} [title] - Optional hover title / <title> element
     */
    let {
        size = undefined,
        width = '100%',
        height = '100%',
        class: className = '',
        theme = 'auto',
        ariaLabel = 'Intelligent Workspace Logo',
        role = 'img',
        title = undefined,
        ...restProps
    } = $props();

    const finalWidth = $derived(size !== undefined ? size : width);
    const finalHeight = $derived(size !== undefined ? size : height);
    const themeAttr = $derived(theme && theme !== 'auto' ? theme : undefined);
</script>

<svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 536 476"
    width={finalWidth}
    height={finalHeight}
    class="app-logo-svg {className}"
    data-theme={themeAttr}
    {role}
    aria-label={ariaLabel}
    {...restProps}
>
    {#if title}
        <title>{title}</title>
    {/if}

    <!-- BACK CARD -->
    <rect x="11" y="10" width="324" height="300" rx="49" class="card-back" />

    <!-- BACK WHITE RECTANGLE -->
    <rect x="49" y="42" width="157" height="104" rx="24" class="rect-back" />

    <!-- MIDDLE CARD -->
    <rect x="80" y="87" width="324" height="300" rx="49" class="card-mid" />

    <!-- MIDDLE WHITE RECTANGLE -->
    <rect x="116" y="117" width="158" height="104" rx="24" class="rect-mid" />

    <!-- MAIN BLUE CARD -->
    <rect x="148" y="146" width="324" height="299" rx="49" class="card-front" />

    <!-- LIGHT BLUE BAR -->
    <rect x="165" y="179" width="343" height="84" rx="18" class="bar" />

    <!-- ORANGE CIRCLE -->
    <circle cx="213.5" cy="221" r="31.5" class="dot-1" />

    <!-- DARK ORANGE CIRCLE -->
    <circle cx="295.5" cy="221" r="31.5" class="dot-2" />

    <!-- YELLOW CIRCLE -->
    <circle cx="377.5" cy="221" r="31.5" class="dot-3" />

    <!-- GREEN CIRCLE -->
    <circle cx="459.5" cy="221" r="31.5" class="dot-4" />
</svg>

<style>
    .app-logo-svg {
        display: inline-block;
        vertical-align: middle;
        overflow: visible;
    }

    .card-back {
        fill: var(--logo-card-back, #5abccc);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rect-back {
        fill: var(--logo-rect-back, #ffffff);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .card-mid {
        fill: var(--logo-card-mid, #66aceb);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .rect-mid {
        fill: var(--logo-rect-mid, #ffffff);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .card-front {
        fill: var(--logo-card-front, #4474c5);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .bar {
        fill: var(--logo-bar, #9ac5ea);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dot-1 {
        fill: var(--logo-dot-1, #f48325);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dot-2 {
        fill: var(--logo-dot-2, #df5f1d);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dot-3 {
        fill: var(--logo-dot-3, #f4d54e);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    .dot-4 {
        fill: var(--logo-dot-4, #3e9d46);
        transition: fill 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    }

    /* Direct theme overrides when data-theme is placed explicitly on the logo */
    .app-logo-svg[data-theme='original'] {
        --logo-card-back: #5abccc;
        --logo-rect-back: #ffffff;
        --logo-card-mid: #66aceb;
        --logo-rect-mid: #ffffff;
        --logo-card-front: #4474c5;
        --logo-bar: #9ac5ea;
        --logo-dot-1: #f48325;
        --logo-dot-2: #df5f1d;
        --logo-dot-3: #f4d54e;
        --logo-dot-4: #3e9d46;
    }

    .app-logo-svg[data-theme='light'] {
        --logo-card-back: #5abccc;
        --logo-rect-back: #ffffff;
        --logo-card-mid: #3498db;
        --logo-rect-mid: #ffffff;
        --logo-card-front: #0658aa;
        --logo-bar: #9ac5ea;
        --logo-dot-1: #f48325;
        --logo-dot-2: #df5f1d;
        --logo-dot-3: #f4d54e;
        --logo-dot-4: #3e9d46;
    }

    .app-logo-svg[data-theme='dark'] {
        --logo-card-back: #424242;
        --logo-rect-back: #ffffff;
        --logo-card-mid: #5f6368;
        --logo-rect-mid: #ffffff;
        --logo-card-front: #2c2c2c;
        --logo-bar: #424242;
        --logo-dot-1: #f48325;
        --logo-dot-2: #df5f1d;
        --logo-dot-3: #f4d54e;
        --logo-dot-4: #3e9d46;
    }

    .app-logo-svg[data-theme='viridian'] {
        --logo-card-back: #48c9b0;
        --logo-rect-back: #ffffff;
        --logo-card-mid: #16a085;
        --logo-rect-mid: #ffffff;
        --logo-card-front: #0e6655;
        --logo-bar: #73d2be;
        --logo-dot-1: #f48325;
        --logo-dot-2: #df5f1d;
        --logo-dot-3: #f4d54e;
        --logo-dot-4: #3e9d46;
    }
</style>
