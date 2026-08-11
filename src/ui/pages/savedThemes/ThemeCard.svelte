<script>
    let {
        theme,
        index,
        isActive = false,
        onactivate,
        onrename,
        onedit,
        ondelete,
        onschedule,
        onitemdragstart,
        onitemdragend,
        ondragenter,
        ondragover,
        ondragleave,
        ondrop,
    } = $props();

    let isEditing = $state(false);
    let labelText = $state(theme.name);
    let labelEl = $state(null);
    let clickTimer = null;

    function activateTheme() {
        if (isEditing) return;
        onactivate?.({ theme, index });
    }

    function handleClick(e) {
        if (isEditing) return;
        if (e.target === labelEl) {
            clickTimer = setTimeout(() => activateTheme(), 300);
        } else {
            activateTheme();
        }
    }

    function handleDblClick() {
        if (clickTimer) clearTimeout(clickTimer);
        isEditing = true;
        setTimeout(() => {
            if (labelEl) {
                labelEl.focus();
                const selection = window.getSelection();
                const range = document.createRange();
                range.selectNodeContents(labelEl);
                range.collapse(false);
                selection.removeAllRanges();
                selection.addRange(range);
            }
        }, 0);
    }

    function handleKeyDown(e) {
        if (!isEditing && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            activateTheme();
        } else if (isEditing) {
            if (e.key === 'Enter') {
                e.preventDefault();
                finishEditing();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                labelText = theme.name; // revert
                finishEditing(true);
            }
        }
    }

    function handleInput() {
        if (labelEl.textContent.length > 20) {
            labelEl.textContent = labelEl.textContent.substring(0, 20);
            const newRange = document.createRange();
            const sel = window.getSelection();
            newRange.selectNodeContents(labelEl);
            newRange.collapse(false);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
        labelText = labelEl.textContent;
    }

    function finishEditing(revert = false) {
        if (!isEditing) return;
        isEditing = false;
        if (revert) return;
        let newName = labelEl.textContent.trim();
        if (!newName || newName === theme.name) {
            labelText = theme.name;
            return;
        }
        onrename?.({ index, newName, oldName: theme.name });
    }

    function handleBlur() {
        finishEditing();
    }

    function handleDragStart(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/html', e.currentTarget.innerHTML);
        onitemdragstart?.({ index, event: e });
        // setTimeout to allow drag image to render before applying class
        setTimeout(() => {
            if (e.target.classList) e.target.classList.add('dragging');
        }, 0);
    }

    function handleDragEnd(e) {
        e.target.classList.remove('dragging');
        onitemdragend?.({ event: e });
    }
</script>

<div
    class="saved-theme-item {isActive ? 'active' : ''}"
    role="button"
    draggable="true"
    data-index={index}
    tabindex="0"
    onclick={handleClick}
    onkeydown={handleKeyDown}
    ondragstart={handleDragStart}
    {ondragenter}
    {ondragover}
    {ondragleave}
    {ondrop}
    ondragend={handleDragEnd}
>
    <div class="theme-color-preview" tabindex="0" style="background-color: {theme.colors.bgColor || '#cccccc'}"></div>
    <div
        class="theme-label"
        contenteditable={isEditing}
        tabindex="0"
        data-i18n-title="doubleClickToEdit"
        bind:this={labelEl}
        ondblclick={handleDblClick}
        oninput={handleInput}
        onblur={handleBlur}
        spellcheck="false"
        translate="no"
    >
        {labelText}
    </div>
    <div class="icons-container">
        <button
            type="button"
            class="schedule-theme-icon"
            data-i18n-aria-label="scheduleTheme"
            data-i18n-title="scheduleTheme"
            onclick={(e) => {
                e.stopPropagation();
                onschedule?.({ theme, index });
            }}
        >
            <svg
                width="30px"
                height="30px"
                viewBox="0 0 24 24"
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    d="M12 8V12L14.5 14.5"
                    stroke="var(--text-color)"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                ></path>
                <path
                    d="M2 12C2 7.28595 2 4.92893 3.46447 3.46447C4.92893 2 7.28595 2 12 2C16.714 2 19.0711 2 20.5355 3.46447C22 4.92893 22 7.28595 22 12C22 16.714 22 19.0711 20.5355 20.5355C19.0711 22 16.714 22 12 22C7.28595 22 4.92893 22 3.46447 20.5355C2 19.0711 2 16.714 2 12Z"
                    stroke="var(--text-color)"
                    stroke-width="1.5"
                ></path>
            </svg>
        </button>
        <button
            type="button"
            class="edit-theme-icon"
            data-i18n-aria-label="editTheme"
            data-i18n-title="editTheme"
            onclick={(e) => {
                e.stopPropagation();
                onedit?.({ theme, index });
            }}
        >
            <svg
                width="30"
                height="30"
                viewBox="0 0 512 512"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    fill="var(--text-color)"
                    d="m29.663 482.25.087.087a24.85 24.85 0 0 0 17.612 7.342 25.2 25.2 0 0 0 8.1-1.345l142.006-48.172 272.5-272.5A88.832 88.832 0 0 0 344.334 42.039l-272.5 272.5-48.168 142.002a24.84 24.84 0 0 0 5.997 25.709m337.3-417.584a56.832 56.832 0 0 1 80.371 80.373L411.5 180.873 331.127 100.5ZM99.744 331.884 308.5 123.127l80.373 80.373-208.757 208.756-121.634 41.262Z"
                />
            </svg>
        </button>
        <button
            type="button"
            class="delete-theme-icon"
            data-i18n-aria-label="deleteTheme"
            data-i18n-title="deleteTheme"
            onclick={(e) => {
                e.stopPropagation();
                ondelete?.({ theme, index });
            }}
        >
            <svg
                xmlns="http://www.w3.org/2000/svg"
                height="24"
                viewBox="0 0 24 24"
                width="24"
                aria-hidden="true"
                focusable="false"
            >
                <path
                    d="m12.71 12 8.15 8.15-.71.71L12 12.71l-8.15 8.15-.71-.71L11.29 12 3.15 3.85l.71-.71L12 11.29l8.15-8.15.71.71L12.71 12z"
                    stroke="var(--text-color)"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                ></path>
            </svg>
        </button>
    </div>
</div>
