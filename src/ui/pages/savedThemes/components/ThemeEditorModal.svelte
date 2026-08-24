<script>
    import ModalHeader from '../../../components/common/ModalHeader.svelte';
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';
    import { pickScreenColor } from '../../../services/colorPickerService.js';
    import { showNotification } from '../../../../utils/i18n.js';
    import { t } from '../../../stores/i18nStore.js';

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
                    {#each [{ id: 'bg-color', k: 'bgColor', l: 'bgColor' }, { id: 'bg-panel-color', k: 'bgPanelColor', l: 'bgPanelColor' }, { id: 'text-color', k: 'textColor', l: 'textColor' }, { id: 'text-on-color', k: 'textOnColor', l: 'textOnColor' }, { id: 'action-color', k: 'actionColor', l: 'actionColor' }, { id: 'interactive-color', k: 'interactiveColor', l: 'interactiveColor' }, { id: 'border-color', k: 'borderColor', l: 'borderColor' }, { id: 'error-color', k: 'errorColor', l: 'errorColor' }, { id: 'header-color', k: 'headerColor', l: 'headerColor' }] as colorInput (colorInput.id)}
                        <div class="color-option">
                            <label for={colorInput.id} data-i18n={colorInput.l}></label>
                            <div class="color-input-wrapper">
                                <input
                                    type="color"
                                    id={colorInput.id}
                                    value={editorColors[colorInput.k]}
                                    oninput={(e) => onColorInput(e, colorInput.k)}
                                />
                                <button
                                    type="button"
                                    class="button-eyedropper"
                                    data-i18n-title="pickColorEyeDropper"
                                    data-i18n-aria-label="pickColorEyeDropper"
                                    onmousedown={(e) => e.stopPropagation()}
                                    onclick={(e) => pickColor(e, colorInput.k)}
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

    .color-input-wrapper input[type='color'] {
        width: 100%;
        height: 100%;
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        background-color: transparent;
        box-sizing: border-box;
        padding: 0;
        margin: 0;
    }

    .color-input-wrapper input[type='color']:hover {
        border-color: var(--border-color, #ccc);
        transform: translateY(-1px);
        box-shadow: 0 0 5px 1px var(--interactive-color, #3498db);
    }

    .color-input-wrapper input[type='color']:focus-visible {
        outline: none;
        border-color: var(--border-color, #ccc);
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    .color-input-wrapper input[type='color']::-webkit-color-swatch-wrapper {
        padding: 0;
    }

    .color-input-wrapper input[type='color']::-webkit-color-swatch {
        border: none;
        border-radius: 5px;
    }

    .color-input-wrapper input[type='color']::-moz-color-swatch {
        border: none;
        border-radius: 5px;
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
