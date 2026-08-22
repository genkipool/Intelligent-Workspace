<script>
    import { dismissOnBackdrop } from '../../../actions/dismissOnBackdrop.js';

    let {
        show = false,
        editorState = { mode: 'create', themeIndex: -1, originalName: '' },
        editorColors = $bindable({}),
        onClose = () => {},
        onSave = () => {},
        onRandom = () => {},
        onColorInput = () => {},
    } = $props();

    async function pickColor(key, id) {
        if (typeof window !== 'undefined' && 'EyeDropper' in window) {
            try {
                const eyeDropper = new window.EyeDropper();
                const result = await eyeDropper.open();
                if (result?.sRGBHex) {
                    editorColors[key] = result.sRGBHex;
                    onColorInput({ target: { value: result.sRGBHex } }, key);
                }
            } catch {
                // User aborted or canceled the eyedropper
            }
        } else {
            document.getElementById(id)?.click();
        }
    }
</script>

{#if show}
    <div id="theme-editor-modal" class="modal-overlay" style="display: flex;" use:dismissOnBackdrop={onClose}>
        <div class="modal-content">
            <section class="section" style="border-bottom: none; padding-bottom: 0;">
                <div class="section-title">
                    <span
                        id="theme-editor-title"
                        class="createThemeTitle"
                        data-i18n={editorState.mode === 'edit' ? 'editThemeTitle' : 'createThemeTitle'}
                    ></span>
                    <button id="close-theme-editor-btn" class="close-button" type="button" onclick={onClose}>x</button>
                </div>
                <div class="color-options">
                    {#each [{ id: 'bg-color', k: 'bgColor', l: 'bgColor' }, { id: 'bg-panel-color', k: 'bgPanelColor', l: 'bgPanelColor' }, { id: 'text-color', k: 'textColor', l: 'textColor' }, { id: 'text-on-color', k: 'textOnColor', l: 'textOnColor' }, { id: 'action-color', k: 'actionColor', l: 'actionColor' }, { id: 'interactive-color', k: 'interactiveColor', l: 'interactiveColor' }, { id: 'border-color', k: 'borderColor', l: 'borderColor' }, { id: 'error-color', k: 'errorColor', l: 'errorColor' }, { id: 'header-color', k: 'headerColor', l: 'headerColor' }] as colorInput (colorInput.id)}
                        <div class="color-option">
                            <label for={colorInput.id} data-i18n={colorInput.l}></label>
                            <div class="color-input-group">
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
                                    onclick={() => pickColor(colorInput.k, colorInput.id)}
                                >
                                    <svg
                                        viewBox="0 0 24 24"
                                        width="16"
                                        height="16"
                                        fill="none"
                                        stroke="currentColor"
                                        stroke-width="2"
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
    .color-input-group {
        display: flex;
        align-items: center;
        gap: 6px;
        width: 100%;
    }

    .color-input-group input[type='color'] {
        width: 100%;
        flex: 1 1 auto;
        min-width: 0;
        height: 32px;
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        overflow: hidden;
        background-color: transparent;
        box-sizing: border-box;
    }

    .color-input-group input[type='color']:hover {
        border-color: var(--border-color, #ccc);
        transform: translateY(-1px);
        box-shadow: 0 0 5px 1px var(--interactive-color, #3498db);
    }

    .color-input-group input[type='color']:focus-visible {
        outline: none;
        border-color: var(--border-color, #ccc);
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    .button-eyedropper {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        flex-shrink: 0;
        background-color: var(--bg-color, #f5f5f5);
        border: 1px solid var(--border-color, #ccc);
        border-radius: 6px;
        color: var(--text-color, #000);
        cursor: pointer;
        padding: 0;
        transition: all 0.2s ease;
        box-sizing: border-box;
    }

    .button-eyedropper:hover {
        background-color: var(--interactive-color, #3498db);
        border-color: var(--interactive-color, #3498db);
        color: var(--text-on-color, #ffffff);
        transform: translateY(-1px);
        box-shadow: 0 0 5px 1px var(--interactive-color, #3498db);
    }

    .button-eyedropper:focus-visible {
        outline: none;
        border-color: var(--interactive-color, #3498db);
        box-shadow: 0 0 0 2px var(--interactive-color, #3498db);
    }

    .button-eyedropper:active {
        transform: translateY(0);
    }

    .button-eyedropper svg {
        display: block;
        pointer-events: none;
    }
</style>
