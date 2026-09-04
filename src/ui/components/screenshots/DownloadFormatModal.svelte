<script>
    /**
     * Which shape a capture should leave the gallery in.
     *
     * The download button used to have a PDF twin beside it, which meant two buttons
     * doing one job and a second icon to learn. Now there is one download button and
     * this asks the only question it ever had: the image, in which format, or a
     * document.
     *
     * The formats are `.format-option` buttons — the pattern the rules page uses for a
     * small exclusive choice — and the dialog confirms with the single full-width
     * button every other dialog here ends with, with the cross as the only way out.
     * The styles are scoped rather than borrowed from a page stylesheet, so the dialog
     * looks the same wherever it is opened.
     */
    import { t } from '../../stores/i18nStore.js';
    import { canEncodeAvif } from '../../../utils/imageFormats.js';
    import ModalHeader from '../common/ModalHeader.svelte';
    import ModalSaveButton from '../common/ModalSaveButton.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let {
        show = false,
        /** How many images the choice applies to, for the wording of the button. */
        count = 1,
        onConfirm,
        onClose,
    } = $props();

    /**
     * Any number of formats can be on at once — the same capture as a picture and as a
     * document — so this is a set of checks rather than a set of radios. One of them
     * always has to stay on: a download of nothing is not a download.
     */
    const NONE_CHOSEN = { png: false, webp: false, avif: false, pdf: false };
    let chosen = $state({ ...NONE_CHOSEN, png: true });
    let working = $state(false);

    /**
     * Whether this browser can write an AVIF at all.
     *
     * It is offered only where it can be produced, rather than offered everywhere and
     * failing afterwards. The cheap synchronous half of the answer is used as the
     * opening guess so the option does not appear a frame late on the browsers that
     * do have it.
     */
    let avifAvailable = $state(typeof VideoEncoder !== 'undefined');

    // A previous choice must not survive into the next opening: the button that opens
    // this is the same one for a single capture and for the whole gallery.
    $effect(() => {
        if (show) {
            chosen = { ...NONE_CHOSEN, png: true };
            working = false;
            canEncodeAvif().then((can) => (avifAvailable = can));
        }
    });

    const FORMATS = [
        { value: 'png', labelKey: 'downloadAsPng', descKey: 'downloadFormatPngDesc' },
        { value: 'webp', labelKey: 'downloadAsWebp', descKey: 'downloadFormatWebpDesc' },
        { value: 'avif', labelKey: 'downloadAsAvif', descKey: 'downloadFormatAvifDesc' },
        { value: 'pdf', labelKey: 'downloadAsPdf', descKey: 'downloadFormatPdfDesc' },
    ];

    let availableFormats = $derived(FORMATS.filter((option) => option.value !== 'avif' || avifAvailable));

    function toggle(value) {
        const next = { ...chosen, [value]: !chosen[value] };
        // The last one on stays on: a download of nothing is not a download.
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
</script>

{#if show}
    <div
        class="modal-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-format-title"
        tabindex="-1"
        use:dismissOnBackdrop={close}
        onkeydown={(e) => e.key === 'Escape' && close()}
    >
        <div class="modal-content download-format-modal" role="none" onclick={(e) => e.stopPropagation()}>
            <ModalHeader titleId="download-format-title" title={$t('downloadFormatTitle')} onClose={close} />

            <div class="download-format-body">
                <div class="format-options" role="group" aria-labelledby="download-format-title">
                    {#each availableFormats as option (option.value)}
                        <button
                            type="button"
                            class="format-option"
                            class:selected={chosen[option.value]}
                            aria-pressed={chosen[option.value]}
                            onclick={() => toggle(option.value)}
                        >
                            <span class="format-name">{$t(option.labelKey)}</span>
                            <span class="format-desc">{$t(option.descKey)}</span>
                        </button>
                    {/each}
                </div>
                <p class="format-hint">{$t('downloadFormatHint')}</p>

                <ModalSaveButton
                    label={count > 1 ? `${$t('download')} (${count})` : $t('download')}
                    disabled={working}
                    onclick={confirm}
                />
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
