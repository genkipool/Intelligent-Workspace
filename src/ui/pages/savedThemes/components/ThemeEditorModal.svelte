<script>
    import ModalHeader from '../../../components/common/ModalHeader.svelte';
    import ColorField from '../../../components/common/ColorField.svelte';
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';
    import { pickScreenColor } from '../../../services/colorPickerService.js';
    import { showNotification } from '../../../../utils/i18n.js';
    import { t } from '../../../stores/i18nStore.js';

    /**
     * The nine slots a theme is made of, in the order they are shown. The list used to
     * be written inline in the `{#each}`; it is up here because the picker also needs
     * it, to offer the theme's own colours as swatches.
     */
    const COLOR_SLOTS = [
        { id: 'bg-color', key: 'bgColor' },
        { id: 'bg-panel-color', key: 'bgPanelColor' },
        { id: 'text-color', key: 'textColor' },
        { id: 'text-on-color', key: 'textOnColor' },
        { id: 'action-color', key: 'actionColor' },
        { id: 'interactive-color', key: 'interactiveColor' },
        { id: 'border-color', key: 'borderColor' },
        { id: 'error-color', key: 'errorColor' },
        { id: 'header-color', key: 'headerColor' },
    ];

    let {
        show = false,
        editorState = { mode: 'create', themeIndex: -1, originalName: '' },
        editorColors = $bindable({}),
        onClose = () => {},
        onSave = () => {},
        onRandom = () => {},
        onColorInput = () => {},
    } = $props();

    /**
     * The pipette used to call `new EyeDropper()` here and give up without a word
     * when the class was missing. It is missing on Linux — Chrome only ships the
     * EyeDropper API on Windows, macOS and ChromeOS — so the button did nothing at
     * all on those machines. pickScreenColor() opens the extension's own magnifier
     * instead, the same one on every platform, and leaves the colour on the
     * clipboard.
     */
    async function pickColor(e, key) {
        if (e) {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation?.();
        }
        const { color, copied, reason } = await pickScreenColor();
        if (color) {
            editorColors[key] = color;
            onColorInput({ target: { value: color } }, key);
            const hex = color.toUpperCase();
            showNotification(copied ? 'colorPickedAndCopied' : 'colorPicked', false, [hex]);
            return;
        }
        // Cancelling is not a failure and says nothing; being unable to open the
        // magnifier at all is worth explaining, or the button looks broken again.
        if (reason === 'unsupportedPage' || reason === 'injectionFailed') {
            showNotification('colorPickerUnsupportedPage', true);
        } else if (reason === 'captureFailed') {
            showNotification('colorPickerCaptureFailed', true);
        }
    }
</script>

{#if show}
    <div id="theme-editor-modal" class="modal-overlay" style="display: flex;" use:dismissOnBackdrop={onClose}>
        <div class="modal-content">
            <ModalHeader
                titleId="theme-editor-title"
                title={$t(editorState.mode === 'edit' ? 'editThemeTitle' : 'createThemeTitle')}
                {onClose}
            />
            <section class="section" style="border-bottom: none; padding-bottom: 0;">
                <div class="color-options">
                    {#each COLOR_SLOTS as slot (slot.id)}
                        <div class="color-option">
                            <label for={slot.id} data-i18n={slot.key}></label>
                            <div class="color-input-wrapper">
                                <ColorField
                                    id={slot.id}
                                    value={editorColors[slot.key]}
                                    title={$t(slot.key)}
                                    ariaLabel={$t(slot.key)}
                                    onchange={(color) => onColorInput({ target: { value: color } }, slot.key)}
                                />
                                <button
                                    type="button"
                                    class="button-eyedropper"
                                    data-i18n-title="pickColorEyeDropper"
                                    data-i18n-aria-label="pickColorEyeDropper"
                                    onmousedown={(e) => e.stopPropagation()}
                                    onclick={(e) => pickColor(e, slot.key)}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        width="15"
                                        height="15"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2.2"
                                        stroke-linecap="round"
                                        stroke-linejoin="round"
                                        aria-hidden="true"
                                        focusable="false"
                                    >
                                        <path d="m14 7 3 3" />
                                        <path
                                            d="M12 9 6.5 14.5a2.12 2.12 0 0 0-.6 1.2L5 20l4.3-.9c.4-.1.8-.3 1.2-.6L16 13"
                                        />
                                        <path d="m19 8 1-1a2.12 2.12 0 0 0 0-3 2.12 2.12 0 0 0-3 0l-1 1" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    {/each}
                    <div class="color-option">
                        <label for="random-theme" data-i18n="randomTheme"></label>
                        <button
                            id="random-theme-btn"
                            class="button button-random"
                            type="button"
                            data-i18n="randomTheme"
                            onclick={onRandom}
                        ></button>
                    </div>
                </div>
                <button
                    id="save-edited-theme-btn"
                    class="button button-save"
                    type="button"
                    data-i18n={editorState.mode === 'edit' ? 'updateCustomTheme' : 'saveCustomTheme'}
                    onclick={onSave}
                ></button>
            </section>
        </div>
    </div>
{/if}

<style>
    .color-input-wrapper {
        position: relative;
        width: 100%;
        height: 32px;
        display: flex;
        align-items: center;
    }

    .button-eyedropper {
        position: absolute;
        right: 7px;
        top: 50%;
        transform: translateY(-50%);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        background: transparent;
        border: none;
        outline: none;
        padding: 0;
        margin: 0;
        cursor: pointer;
        color: #ffffff;
        filter: drop-shadow(0 1px 2px rgba(0, 0, 0, 0.95)) drop-shadow(0 0 1px rgba(0, 0, 0, 0.85));
        transition:
            transform 0.15s ease,
            filter 0.15s ease,
            opacity 0.15s ease;
        z-index: 2;
        box-shadow: none;
    }

    .button-eyedropper:hover {
        transform: translateY(-50%) scale(1.22);
        filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 1)) drop-shadow(0 0 2px var(--interactive-color, #3498db));
        color: #ffffff;
        background: transparent;
        box-shadow: none;
        border: none;
    }

    .button-eyedropper:focus-visible {
        outline: none;
        transform: translateY(-50%) scale(1.22);
        filter: drop-shadow(0 0 3px var(--interactive-color, #3498db));
    }

    .button-eyedropper:active {
        transform: translateY(-50%) scale(1.05);
    }

    .button-eyedropper svg {
        display: block;
        pointer-events: none;
        width: 15px;
        height: 15px;
    }
</style>
