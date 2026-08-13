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
                            <input
                                type="color"
                                id={colorInput.id}
                                value={editorColors[colorInput.k]}
                                oninput={(e) => onColorInput(e, colorInput.k)}
                            />
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
