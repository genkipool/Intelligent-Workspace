<script>
    import { onMount } from 'svelte';
    import { SvelteSet } from 'svelte/reactivity';
    import { t, tt } from '../../stores/i18nStore.js';
    import { rulesStore } from './rulesStore.js';
    import RuleColorPicker from './components/RuleColorPicker.svelte';

    let { isOpen = false, mode = 'add', rule = null, onclose, onsave } = $props();
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
        'https://www.example.com \nhttps://192.168.1.1 \nhttps://192.168.1.1:9080 \nhttps://[2002::1] \nhttps://[2002::1]:9080 \nfile:///home/example.txt';
    function initForm() {
        if (mode === 'edit' && rule) {
            ruleName = rule.name || '';
            ruleColor = rule.color || 'blue';
            ruleUrls = (rule.urls || []).join('\n');
        } else {
            ruleName = '';
            // Adding a rule preselects colors[1] ('red')
            ruleColor = 'red';
            ruleUrls = '';
        }
        errorMessage = '';
        isRealTimeValidation = false;
        isNameInvalid = false;
        textareaInvalid = false;
        overlayLines = [];
        if (mode === 'edit' && rule && rule.urls && rule.urls.length > 0) {
            validateUrls(rule.urls.join('\n'));
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
    });

    function normalizeUrl(url) {
        try {
            // The fragment is dropped by cutting the normalised href rather than by
            // assigning to u.hash, so the URL is never mutated after it is built.
            // Checked to give the same answer for http, file, chrome and bracketed
            // IPv6 addresses, with and without a fragment.
            return new URL(url).href.split('#')[0].replace(/\/$/, '');
        } catch {
            return url.trim().toLowerCase();
        }
    }

    // URL validation shared with the background rule matcher
    function isValidUrl(urlString) {
        if (!urlString || typeof urlString !== 'string') return false;
        const trimmedUrl = urlString.trim();
        if (trimmedUrl.includes(' ')) return false;
        const isHttp = trimmedUrl.startsWith('http://');
        const isHttps = trimmedUrl.startsWith('https://');
        const isFile = trimmedUrl.startsWith('file:///');
        const isChrome = trimmedUrl.startsWith('chrome://');
        const isChromeExtensions = trimmedUrl.startsWith('chrome-extension://');
        if (!(isHttp || isHttps || isFile || isChrome || isChromeExtensions)) return false;
        try {
            const url = new URL(trimmedUrl);
            if (isFile) return true;
            if (isChrome) return true;
            if (isChromeExtensions) return true;
            if ((isHttp || isHttps) && url.hostname && url.hostname.length > 0) return true;
            return false;
        } catch {
            return false;
        }
    }

    function validateUrls(content) {
        if (!content) {
            overlayLines = [];
            textareaInvalid = false;
            return;
        }
        if (!isRealTimeValidation && !(mode === 'edit')) {
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

        const duplicatesInRule = new SvelteSet();
        const normalizedUrls = urls.map(normalizeUrl);
        const urlCounts = {};
        normalizedUrls.forEach((normUrl, idx) => {
            urlCounts[normUrl] = (urlCounts[normUrl] || 0) + 1;
            if (urlCounts[normUrl] === 2) duplicatesInRule.add(urls[idx]);
        });

        const duplicatesInOtherRules = new SvelteSet();
        currentRules.forEach((existingRule) => {
            if (mode === 'edit' && rule && existingRule.name === rule.name) return;
            existingRule.urls.forEach((ruleUrl) => {
                if (normalizedUrls.includes(normalizeUrl(ruleUrl))) {
                    const conflictingUrl = urls.find((u) => normalizeUrl(u) === normalizeUrl(ruleUrl));
                    if (conflictingUrl) duplicatesInOtherRules.add(conflictingUrl);
                }
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

    function validateRule(name, color, urls, rules, editingIdx) {
        if (!name) return { valid: false, message: 'enterRuleName', params: [] };
        if (name.length > 16) return { valid: false, message: 'ruleNameTooLongError', params: [name] };
        if (!color) return { valid: false, message: 'selectColor', params: [] };
        if (urls.length === 0) return { valid: false, message: 'enterOneUrl', params: [] };

        const invalidUrls = urls.filter((u) => !isValidUrl(u));
        if (invalidUrls.length > 0) return { valid: false, message: 'invalidUrls', params: [invalidUrls.join(', ')] };

        const currentNameLower = name.toLowerCase();
        const isDuplicateName = rules.some((r, idx) => r.name.toLowerCase() === currentNameLower && idx !== editingIdx);
        if (isDuplicateName) return { valid: false, message: 'duplicateRuleName' };

        const normUrls = urls.map(normalizeUrl);
        const uniqueUrls = new Set(normUrls);
        if (uniqueUrls.size !== normUrls.length) {
            const counts = {};
            const duplicates = [];
            urls.forEach((u) => {
                const norm = normalizeUrl(u);
                counts[norm] = (counts[norm] || 0) + 1;
                if (counts[norm] === 2) duplicates.push(u);
            });
            return { valid: false, message: 'duplicateUrlsInRule', params: [name, duplicates.join(', ')] };
        }

        for (let i = 0; i < rules.length; i++) {
            if (i === editingIdx) continue;
            const otherRule = rules[i];
            for (const otherUrl of otherRule.urls) {
                if (normUrls.includes(normalizeUrl(otherUrl))) {
                    const conflictingUrl = urls.find((u) => normalizeUrl(u) === normalizeUrl(otherUrl));
                    return {
                        valid: false,
                        message: 'urlInOtherRule',
                        params: [conflictingUrl || otherUrl, otherRule.name],
                    };
                }
            }
        }

        return { valid: true };
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

    function showFirstError() {
        const name = ruleName.trim();
        const color = ruleColor;
        const urls = ruleUrls
            .split('\n')
            .map((u) => u.trim())
            .filter((u) => u);
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
        const urls = ruleUrls
            .split('\n')
            .map((u) => u.trim())
            .filter((u) => u);
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
                validateUrls(ruleUrls);
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
        if (isRealTimeValidation) {
            if (ruleUrls) {
                validateUrls(ruleUrls);
            }
            showFirstError();
        } else {
            errorMessage = '';
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
