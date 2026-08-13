<script>
    import { t, tt } from '../../../stores/i18nStore.js';
    import { lightThemeColors, darkThemeColors } from '../../../services/constants.js';

    let {
        selectedColor = $bindable('blue'),
        colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'],
        onSelectColor = () => {},
    } = $props();

    let themeColors = $state(
        window.matchMedia('(prefers-color-scheme: dark)').matches ? darkThemeColors : lightThemeColors,
    );

    let containerEl = $state(null);

    function selectColor(color) {
        selectedColor = color;
        onSelectColor(color);
    }

    function handleColorKeydown(e, index) {
        const ROW_LENGTH = 4;
        let newIndex = index;

        if (e.key === 'ArrowRight') {
            newIndex = (index + 1) % colors.length;
        } else if (e.key === 'ArrowLeft') {
            newIndex = (index - 1 + colors.length) % colors.length;
        } else if (e.key === 'ArrowDown') {
            newIndex = (index + ROW_LENGTH) % colors.length;
        } else if (e.key === 'ArrowUp') {
            newIndex = (index - ROW_LENGTH + colors.length) % colors.length;
        } else if (e.key === 'Enter') {
            selectColor(colors[index]);
            e.preventDefault();
            return;
        } else {
            return;
        }

        e.preventDefault();
        if (newIndex !== index && containerEl) {
            const colorBoxes = containerEl.querySelectorAll('.color-box');
            if (colorBoxes[newIndex]) {
                colorBoxes[newIndex].focus();
            }
        }
    }
</script>

<div class="form-color-grid">{$t('groupColor') || 'Group Color'}</div>
<div class="color-grid" id="color-grid" bind:this={containerEl}>
    {#each colors as color, i (color)}
        <div
            class="color-box"
            class:selected={selectedColor === color}
            role="button"
            tabindex="0"
            data-color={color}
            style="background-color: {themeColors[color]}"
            title={$tt('selectSpecificColor', [$t(color) || color])}
            aria-label={$tt('selectSpecificColor', [$t(color) || color])}
            onclick={() => selectColor(color)}
            onkeydown={(e) => handleColorKeydown(e, i)}
        ></div>
    {/each}
</div>
<input type="hidden" id="rule-color" value={selectedColor} />
