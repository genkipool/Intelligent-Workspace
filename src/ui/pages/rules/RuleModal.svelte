<script>
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { t, tt } from '../../stores/i18nStore.js';
    import { rulesStore } from './rulesStore.js';
    import { normalizeUrl, isValidUrl, validateRule, toDisplayUrls, toStoredUrl } from './ruleValidation.js';
    import { getSettings, saveSettings } from './modules/rules-api.js';
    import RuleColorPicker from './components/RuleColorPicker.svelte';

    // `prefill` opens the add form already filled in — the "create a rule for this
    // site" entry of the browser's context menu arrives that way.
    let { isOpen = false, mode = 'add', rule = null, prefill = null, onclose, onsave } = $props();
    let dialogEl = $state(null);
    let textareaEl = $state(null);
    let overlayEl = $state(null);
    let overlayLines = $state([]);
    let textareaInvalid = $state(false);

    let ruleName = $state('');
    let ruleColor = $state('blue');
    let ruleUrls = $state('');
    let isRealTimeValidation = $state(false);
    let errorMessage = $state('');
    let isNameInvalid = $state(false);

    const colors = ['blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan', 'orange'];
    // Trailing spaces in this placeholder are intentional
    const urlsPlaceholder =
        'www.example.com \n192.168.1.1 \n192.168.1.1:9080 \n[2002::1] \n[2002::1]:9080 \nfile:///home/example.txt';

    // The URLs the rule was opened with, kept whole so that saving gives an untouched
    // line back the very scheme it had instead of the default one.
    let previousUrls = $state([]);

    function initForm() {
        previousUrls = mode === 'edit' && rule ? rule.urls || [] : [];
        if (mode === 'edit' && rule) {
            ruleName = rule.name || '';
            ruleColor = rule.color || 'blue';
            ruleUrls = toDisplayUrls(rule.urls).join('\n');
        } else if (prefill) {
            ruleName = prefill.name || '';
            ruleColor = prefill.color || 'red';
            // The URL arrives whole from the context menu; the textarea shows it the
            // same way as any other.
            ruleUrls = toDisplayUrls((prefill.urls || '').split('\n')).join('\n');
        } else {
            ruleName = '';
            // Adding a rule preselects colors[1] ('red')
            ruleColor = 'red';
            ruleUrls = '';
        }
        errorMessage = '';
        isNameInvalid = false;
        textareaInvalid = false;
        overlayLines = [];

        if (isRealTimeValidation) {
            if (ruleUrls) {
                validateUrls(ruleUrls);
            }
            showFirstError();
        } else if (ruleUrls) {
            const lines = ruleUrls.split('\n');
            overlayLines = lines.map((line) => ({
                text: line || ' ',
                classes: 'url-line',
            }));
        }
    }

    $effect(() => {
        if (isOpen && dialogEl && !dialogEl.open) {
            initForm();
            dialogEl.showModal();
            requestAnimationFrame(() => {
                const nameInput = dialogEl.querySelector('#rule-name');
                if (nameInput) nameInput.focus();
            });
        }
    });

    $effect(() => {
        if (!isOpen && dialogEl && dialogEl.open) {
            dialogEl.close();
            overlayLines = [];
            textareaInvalid = false;
        }
    });

    onMount(() => {
        getSettings(['realTimeValidation']).then((settings) => {
            if (settings && typeof settings.realTimeValidation === 'boolean') {
                isRealTimeValidation = settings.realTimeValidation;
            }
        });

        const handleStorageChange = (changes) => {
            if (changes.realTimeValidation !== undefined) {
                isRealTimeValidation = Boolean(changes.realTimeValidation.newValue);
                if (isOpen && dialogEl && dialogEl.open) {
                    if (isRealTimeValidation) {
                        if (ruleUrls) {
                            validateUrls(ruleUrls);
                        }
                        showFirstError();
                    } else {
                        errorMessage = '';
                        if (ruleUrls) {
                            const lines = ruleUrls.split('\n');
                            overlayLines = lines.map((line) => ({
                                text: line || ' ',
                                classes: 'url-line',
                            }));
                            textareaInvalid = false;
                        }
                    }
                }
            }
        };

        if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
            chrome.storage.onChanged.addListener(handleStorageChange);
        }

        if (dialogEl) {
            dialogEl.addEventListener('close', () => {
                onclose?.();
            });
            dialogEl.addEventListener('keydown', (e) => {
                if (e.key === 'Escape') {
                    onclose?.();
                }
            });
        }

        return () => {
            if (typeof chrome !== 'undefined' && chrome.storage?.onChanged) {
                chrome.storage.onChanged.removeListener(handleStorageChange);
            }
        };
    });

    function validateUrls(content, force = false) {
        if (!content) {
            overlayLines = [];
            textareaInvalid = false;
            return;
        }
        if (!force && !isRealTimeValidation) {
            overlayLines = content.split('\n').map((line) => ({
                text: line || ' ',
                classes: 'url-line',
            }));
            textareaInvalid = false;
            return;
        }

        const lines = content.split('\n');
        const urls = lines.map((l) => l.trim()).filter((u) => u);
        const currentRules = $rulesStore;

        // The lines are compared in the form they would be stored in — a line left
        // untouched keeps its own scheme — while the sets stay keyed by what is on
        // screen, which is what the overlay paints.
        const storedUrls = urls.map((u) => toStoredUrl(u, previousUrls));
        const duplicatesInRule = new SvelteSet();
        const normalizedUrls = storedUrls.map(normalizeUrl);
        const urlCounts = {};
        normalizedUrls.forEach((normUrl, idx) => {
            urlCounts[normUrl] = (urlCounts[normUrl] || 0) + 1;
            if (urlCounts[normUrl] === 2) duplicatesInRule.add(urls[idx]);
        });

        const duplicatesInOtherRules = new SvelteSet();
        currentRules.forEach((existingRule) => {
            if (mode === 'edit' && rule && existingRule.name === rule.name) return;
            existingRule.urls.forEach((ruleUrl) => {
                const normalizedRuleUrl = normalizeUrl(ruleUrl);
                const idx = normalizedUrls.indexOf(normalizedRuleUrl);
                if (idx !== -1) duplicatesInOtherRules.add(urls[idx]);
            });
        });

        let hasError = false;
        overlayLines = lines.map((line) => {
            const trimmed = line.trim();
            const displayText = line || ' ';
            const isValidFormat = !trimmed || isValidUrl(trimmed);
            const isDupeInRule = duplicatesInRule.has(trimmed);
            const isDupeInOther = duplicatesInOtherRules.has(trimmed);
            const classes = ['url-line'];
            if (!isValidFormat && trimmed) {
                classes.push('invalid');
                hasError = true;
            } else if (isDupeInRule) {
                classes.push('invalid', 'duplicate');
                hasError = true;
            } else if (isDupeInOther) {
                classes.push('invalid', 'duplicate-other');
                hasError = true;
            }
            return {
                text: displayText,
                classes: classes.join(' '),
            };
        });

        textareaInvalid = hasError;
    }

    function tMsg(key, params) {
        const val = params ? $t(key, params) : $t(key);
        if (val !== key) return val;
        const fallbacks = {
            enterRuleName: 'Please enter a name for the rule.',
            ruleNameTooLongError: `Rule name cannot exceed 16 characters${params && params[0] ? ': ' + params[0] : ''}`,
            selectColor: 'Please select a color for the rule.',
            enterOneUrl: 'Please enter at least one URL.',
            invalidUrls: `URLs in red have an invalid format${params && params[0] ? ': ' + params[0] : ''}`,
            duplicateRuleName: 'A rule with this name already exists.',
            duplicateUrlsInRule: `Duplicate URLs in rule${params && params[0] ? ' ' + params[0] : ''}${params && params[1] ? ': ' + params[1] : ''}`,
            urlInOtherRule: `The URL${params && params[0] ? ' ' + params[0] : ''} is already used in the rule${params && params[1] ? ' ' + params[1] : ''}.`,
        };
        return fallbacks[key] || key;
    }

    /** The textarea read back as the URLs the rule would be saved with. */
    function collectUrls() {
        return ruleUrls
            .split('\n')
            .map((u) => u.trim())
            .filter((u) => u)
            .map((u) => toStoredUrl(u, previousUrls));
    }

    function showFirstError() {
        const name = ruleName.trim();
        const color = ruleColor;
        const urls = collectUrls();
        const currentRules = $rulesStore;
        const editingIdx = mode === 'edit' && rule ? currentRules.findIndex((r) => r.name === rule.name) : -1;
        const result = validateRule(name, color, urls, currentRules, editingIdx);
        if (!result.valid) {
            errorMessage = tMsg(result.message, result.params || []);
            if (
                result.message !== 'enterRuleName' &&
                result.message !== 'ruleNameTooLongError' &&
                result.message !== 'duplicateRuleName'
            ) {
                validateUrls(ruleUrls);
            }
        } else {
            errorMessage = '';
        }
    }

    function close() {
        if (dialogEl) {
            dialogEl.close();
        }
        overlayLines = [];
        textareaInvalid = false;
        onclose?.();
    }

    function save() {
        const name = ruleName.trim();
        const color = ruleColor;
        const urls = collectUrls();
        const currentRules = $rulesStore;
        const editingIdx = mode === 'edit' && rule ? currentRules.findIndex((r) => r.name === rule.name) : -1;
        const result = validateRule(name, color, urls, currentRules, editingIdx);
        if (result.valid) {
            const newRule = {
                name: name,
                color: color,
                active: rule ? rule.active : true,
                urls: urls,
                isStarred: rule ? rule.isStarred : false,
            };
            onsave?.(newRule);
            close();
        } else {
            errorMessage = tMsg(result.message, result.params || []);
            if (result.message === 'enterRuleName' || result.message === 'ruleNameTooLongError') {
                isNameInvalid = true;
            }
            if (
                result.message !== 'enterRuleName' &&
                result.message !== 'ruleNameTooLongError' &&
                result.message !== 'duplicateRuleName'
            ) {
                validateUrls(ruleUrls, true);
            }
        }
    }

    function handleNameKeydown(e) {
        if (e.key === ' ') {
            e.preventDefault();
        }
    }

    function handleNameInput() {
        if (isRealTimeValidation) {
            showFirstError();
        }
    }

    function selectColor(color) {
        ruleColor = color;
        if (isRealTimeValidation) {
            showFirstError();
        }
    }

    function handleUrlInput() {
        if (isRealTimeValidation) {
            validateUrls(ruleUrls);
            showFirstError();
        } else {
            const lines = ruleUrls.split('\n');
            overlayLines = lines.map((line) => ({
                text: line || ' ',
                classes: 'url-line',
            }));
        }
    }

    /**
     * Keeps the validation overlay exactly on top of the textarea.
     *
     * Syncing the scroll alone is not enough: the overlay must also copy the
     * textarea's box and font metrics, or the highlighted lines drift away from the
     * real text and the caret looks misplaced.
     */
    function syncOverlayLayout() {
        if (!overlayEl || !textareaEl) return;
        overlayEl.scrollTop = textareaEl.scrollTop;
        overlayEl.scrollLeft = textareaEl.scrollLeft;
        overlayEl.style.width = `${textareaEl.offsetWidth}px`;
        overlayEl.style.height = `${textareaEl.offsetHeight}px`;
        const style = window.getComputedStyle(textareaEl);
        for (const prop of [
            'fontFamily',
            'fontSize',
            'fontWeight',
            'lineHeight',
            'padding',
            'letterSpacing',
            'wordSpacing',
            'whiteSpace',
            'wordBreak',
            'overflowWrap',
            'textIndent',
            'boxSizing',
            'borderWidth',
        ]) {
            overlayEl.style[prop] = style[prop];
        }
    }

    function handleScroll() {
        syncOverlayLayout();
    }

    $effect(() => {
        if (!textareaEl) return;
        syncOverlayLayout();
        const observer = new ResizeObserver(syncOverlayLayout);
        observer.observe(textareaEl);
        return () => observer.disconnect();
    });

    $effect(() => {
        overlayLines;
        if (textareaEl) syncOverlayLayout();
    });

    function handleRealTimeToggle() {
        saveSettings({ realTimeValidation: isRealTimeValidation });
        if (isRealTimeValidation) {
            if (ruleUrls) {
                validateUrls(ruleUrls);
            }
            showFirstError();
        } else {
            errorMessage = '';
            if (ruleUrls) {
                const lines = ruleUrls.split('\n');
                overlayLines = lines.map((line) => ({
                    text: line || ' ',
                    classes: 'url-line',
                }));
                textareaInvalid = false;
            }
        }
    }
</script>

<dialog id="rule-modal" bind:this={dialogEl} closedby="any">
    <div class="modal-content">
        <div class="modal-header">
            <h2 class="title-modal" id="modal-title">
                {mode === 'add' ? $t('addRule') || 'Add Rule' : $t('editRule') || 'Edit Rule'}
            </h2>
            <span
                class="close"
                tabindex="0"
                role="button"
                aria-label={$t('closeModal') || 'Close'}
                onclick={close}
                onkeydown={(e) => e.key === 'Enter' && close()}>x</span
            >
        </div>
        <form
            class="form-rule"
            id="rule-form"
            onsubmit={(e) => {
                e.preventDefault();
                save();
            }}
        >
            <label class="form-rule-name" for="rule-name">{$t('ruleName') || 'Rule Name'}</label>
            <input
                class="form-input-name"
                class:invalid={isNameInvalid}
                type="text"
                id="rule-name"
                bind:value={ruleName}
                required
                maxlength="16"
                autofocus
                tabindex="0"
                translate="no"
                spellcheck="false"
                autocomplete="off"
                onkeydown={handleNameKeydown}
                oninput={handleNameInput}
            />

            <RuleColorPicker bind:selectedColor={ruleColor} {colors} onSelectColor={selectColor} />

            <div class="validation-option">
                <label class="label-input-url" for="rule-urls">{$t('ruleUrls') || 'URLs'}</label>
                <label
                    class="urls-validation"
                    id="label-urls-validation"
                    title={$tt('validateErrorsRealTime') || 'Validate errors'}
                >
                    <input
                        type="checkbox"
                        id="real-time-validation"
                        class="visually-hidden"
                        bind:checked={isRealTimeValidation}
                        onchange={handleRealTimeToggle}
                        aria-labelledby="label-urls-validation"
                    />
                    <span class="custom-checkbox">{$t('validateErrors') || 'Validate'}</span>
                </label>
            </div>

            <div class="url-list">
                <textarea
                    bind:this={textareaEl}
                    class="textarea-rule-urls"
                    class:is-invalid={textareaInvalid}
                    translate="no"
                    id="rule-urls"
                    spellcheck="false"
                    rows="5"
                    required
                    tabindex="0"
                    bind:value={ruleUrls}
                    oninput={handleUrlInput}
                    onscroll={handleScroll}
                    placeholder={urlsPlaceholder}
                    title={$tt('enterRuleUrls') || 'Enter rule URLs'}
                ></textarea>
                <div bind:this={overlayEl} class="error-overlay" id="urls-overlay" spellcheck="false" translate="no">
                    {#each overlayLines as line, i (i)}
                        <span class={line.classes} translate="no">{line.text}</span>
                    {/each}
                </div>
            </div>

            <button class="submit-button" id="submitButton" type="submit" tabindex="0">{$t('save') || 'Save'}</button>
            <div id="rule-form-error" class="rule-form-error" class:visible={errorMessage} role="alert">
                {errorMessage}
            </div>
        </form>
    </div>
</dialog>
