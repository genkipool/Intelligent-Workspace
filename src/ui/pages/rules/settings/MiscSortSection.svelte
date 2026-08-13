<script>
    import { t } from '../../../stores/i18nStore.js';

    let { isSortGroupsEnabled = $bindable(true), miscSortOption = $bindable('start'), onset = () => {} } = $props();

    function setMiscSort(option) {
        miscSortOption = option;
        onset(option);
    }
</script>

<div class="settings-section" id="modal-sort-section">
    <div class="settings-entry-general" class:switch-on={isSortGroupsEnabled}>
        <div class="setting-label-group">
            <span class="svg-settings-container button-rules-header">
                <svg
                    width="30"
                    height="30"
                    viewBox="-51.2 -51.2 614.4 614.4"
                    style="color: var(--text-color); --icon-bg: var(--bg-panel-color);"
                    aria-hidden="true"
                    focusable="false"
                >
                    <use href="#icon-sort-groups"></use>
                </svg>
            </span>
            <span class="setting-text-label">{$t('toggleSortGroups') || 'Sort Groups'}</span>
        </div>
        <label class="switch">
            <input type="checkbox" class="input-settings-container" bind:checked={isSortGroupsEnabled} />
            <span class="slider">
                <span class="switch-text-on">on</span>
                <span class="switch-text-off">off</span>
                <span class="switch-handle"><span class="switch-light"></span></span>
            </span>
        </label>
        <button
            type="button"
            class="svg-toggle-button"
            aria-pressed={isSortGroupsEnabled}
            onclick={() => (isSortGroupsEnabled = !isSortGroupsEnabled)}
        >
            <svg width="20" height="20" viewBox="0 0 24 24"
                ><text
                    class="svg-toggle-text"
                    x="50%"
                    y="55%"
                    text-anchor="middle"
                    dominant-baseline="middle"
                    fill="var(--text-on-color)">{isSortGroupsEnabled ? 'ON' : 'OFF'}</text
                ></svg
            >
        </button>
    </div>
    <div class="misc-sort-popup">
        <h3>{$t('miscSortTitle')}</h3>
        <div class="misc-sort-options-container">
            <button
                type="button"
                class="option-button"
                data-value="start"
                class:selected={miscSortOption === 'start'}
                onclick={() => setMiscSort('start')}>{$t('miscSortStart') || 'Start'}</button
            >
            <button
                type="button"
                class="option-button"
                data-value="end"
                class:selected={miscSortOption === 'end'}
                onclick={() => setMiscSort('end')}>{$t('miscSortEnd') || 'End'}</button
            >
            <button
                type="button"
                class="option-button"
                data-value="alpha"
                class:selected={miscSortOption === 'alpha'}
                onclick={() => setMiscSort('alpha')}>{$t('miscSortAlpha') || 'Alphabetical'}</button
            >
        </div>
    </div>
</div>
