<script>
    /**
     * Shared download format selection dialog.
     *
     * Used across the extension wherever a multi-format export/download is offered
     * (e.g. screenshot gallery captures, Gemini conversation histories).
     *
     * Formats can be chosen individually or in combination (multi-select).
     * At least one format must remain selected.
     */
    import { t } from '../../stores/i18nStore.js';
    import { canEncodeAvif } from '../../../utils/imageFormats.js';
    import ModalHeader from './ModalHeader.svelte';
    import ModalSaveButton from './ModalSaveButton.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    const DEFAULT_IMAGE_FORMATS = [
        { value: 'png', labelKey: 'downloadAsPng', descKey: 'downloadFormatPngDesc' },
        { value: 'webp', labelKey: 'downloadAsWebp', descKey: 'downloadFormatWebpDesc' },
        {
            value: 'avif',
            labelKey: 'downloadAsAvif',
            descKey: 'downloadFormatAvifDesc',
            checkAvailability: canEncodeAvif,
        },
        { value: 'pdf', labelKey: 'downloadAsPdf', descKey: 'downloadFormatPdfDesc' },
    ];

    let {
        show = false,
        title = '',
        titleKey = 'downloadFormatTitle',
        titleId = 'download-format-title',
        formats = null,
        defaultFormat = null,
        count = 1,
        confirmLabel = '',
        hint = '',
        hintKey = 'downloadFormatHint',
        onConfirm,
        onClose,
    } = $props();

    let activeFormats = $derived(formats && formats.length > 0 ? formats : DEFAULT_IMAGE_FORMATS);

    let chosen = $state({});
    let working = $state(false);
    let availabilityMap = $state({});

    $effect(() => {
        if (show) {
            working = false;
            const currentList = activeFormats;
            const initialMap = {};
            const initialChosen = {};

            const primaryDefault = defaultFormat
                ? Array.isArray(defaultFormat)
                    ? defaultFormat
                    : [defaultFormat]
                : currentList.length > 0
                  ? [currentList[0].value]
                  : [];

            for (const item of currentList) {
                initialChosen[item.value] = primaryDefault.includes(item.value);

                if (typeof item.available === 'boolean') {
                    initialMap[item.value] = item.available;
                } else if (typeof item.checkAvailability === 'function') {
                    initialMap[item.value] = item.value === 'avif' ? typeof VideoEncoder !== 'undefined' : true;
                    item.checkAvailability().then((can) => {
                        availabilityMap = { ...availabilityMap, [item.value]: can };
                    });
                } else {
                    initialMap[item.value] = true;
                }
            }

            if (!Object.values(initialChosen).some(Boolean) && currentList.length > 0) {
                initialChosen[currentList[0].value] = true;
            }

            chosen = initialChosen;
            availabilityMap = initialMap;
        }
    });

    let availableFormats = $derived(activeFormats.filter((option) => availabilityMap[option.value] !== false));

    function toggle(value) {
        const next = { ...chosen, [value]: !chosen[value] };
        if (!Object.values(next).some(Boolean)) return;
        chosen = next;
    }

    function close() {
        if (working) return;
        onClose?.();
    }

    async function confirm() {
        if (working) return;
        working = true;
        try {
            await onConfirm?.(Object.keys(chosen).filter((key) => chosen[key]));
        } finally {
            working = false;
            onClose?.();
        }
    }

    let dialogTitle = $derived(title || (titleKey ? $t(titleKey) : $t('downloadFormatTitle')));
    let dialogHint = $derived(hint || (hintKey ? $t(hintKey) : ''));
    let buttonLabel = $derived(confirmLabel || (count > 1 ? `${$t('download')} (${count})` : $t('download')));
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabindex="-1"
        use:dismissOnBackdrop={close}
        onkeydown={(e) => e.key === 'Escape' && close()}
    >
        <div class="modal-content download-format-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <ModalHeader {titleId} title={dialogTitle} onClose={close} />

            <div class="download-format-body">
                <div class="format-options" role="group" aria-labelledby={titleId}>
                    {#each availableFormats as option (option.value)}
                        <button
                            type="button"
                            class="format-option"
                            class:selected={chosen[option.value]}
                            aria-pressed={chosen[option.value]}
                            onclick={() => toggle(option.value)}
                        >
                            <span class="format-name">
                                {option.label || (option.labelKey ? $t(option.labelKey) : option.value)}
                            </span>
                            {#if option.desc || option.descKey}
                                <span class="format-desc">
                                    {option.desc || (option.descKey ? $t(option.descKey) : '')}
                                </span>
                            {/if}
                        </button>
                    {/each}
                </div>

                {#if dialogHint}
                    <p class="format-hint">{dialogHint}</p>
                {/if}

                <ModalSaveButton label={buttonLabel} disabled={working} onclick={confirm} />
            </div>
        </div>
    </div>
{/if}

<style>
    .download-format-modal {
        width: min(420px, 92vw);
        padding: 0;
    }

    .download-format-body {
        display: flex;
        flex-direction: column;
        gap: 14px;
        padding: 16px;
    }

    /* Two abreast, which still holds in a 350px side panel. */
    .format-options {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(122px, 1fr));
        gap: 10px;
    }

    .format-option {
        display: flex;
        flex-direction: column;
        gap: 4px;
        align-items: flex-start;
        text-align: left;
        padding: 12px 14px;
        border-radius: 10px;
        border: 1.5px solid var(--border-color, rgba(255, 255, 255, 0.14));
        background: var(--bg-color, rgba(255, 255, 255, 0.04));
        color: var(--text-color, #fff);
        font: inherit;
        cursor: pointer;
        transition:
            border-color 0.18s ease,
            background 0.18s ease,
            box-shadow 0.18s ease;
    }

    .format-option:hover {
        border-color: var(--action-color, var(--interactive-color, #3498db));
    }

    .format-option:focus-visible {
        outline: 2px solid var(--interactive-color, #3498db);
        outline-offset: 2px;
    }

    .format-option.selected {
        border-color: var(--action-color, var(--interactive-color, #3498db));
        background: color-mix(
            in srgb,
            var(--action-color, var(--interactive-color, #3498db)) 16%,
            var(--bg-panel-color, #1e1e1e)
        );
        box-shadow: 0 0 0 1px var(--action-color, var(--interactive-color, #3498db));
    }

    .format-hint {
        margin: -4px 0 0 0;
        font-size: 0.76rem;
        opacity: 0.6;
        color: var(--text-color, #fff);
    }

    .format-name {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--text-on-color, var(--text-color, #fff));
    }

    .format-desc {
        font-size: 0.78rem;
        line-height: 1.35;
        opacity: 0.72;
    }
</style>
