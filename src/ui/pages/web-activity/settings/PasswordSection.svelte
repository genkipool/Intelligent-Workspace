<script>
    /**
     * [AI INSTRUCTION]
     * SETTING, CHANGING AND REMOVING THE BLOCK PASSWORD.
     *
     * It sits under the rules because it is about the rules: what it guards is
     * weakening one. The section says out loud what it does and does not do — a
     * control that looks like a lock and is really a speed bump has to say so, or the
     * first person to find the settings in devtools will feel lied to.
     *
     * Removing the password needs the password. Otherwise the "off" switch of the lock
     * would be exactly the door the lock is standing in front of.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import { createLock, hasLock, verifyLock } from '../blockLock.js';

    let {
        /** `{ salt, hash }` or null. */
        lock = null,
        /** `(nextLock) => Promise<void>` — null removes it. */
        onChange,
    } = $props();

    const isSet = $derived(hasLock(lock));

    let current = $state('');
    let next = $state('');
    let repeat = $state('');
    let error = $state('');
    let busy = $state(false);

    function reset() {
        current = '';
        next = '';
        repeat = '';
        error = '';
    }

    const canSave = $derived(!busy && next.length > 0 && repeat.length > 0 && (!isSet || current.length > 0));

    async function save() {
        if (!canSave) return;
        if (next !== repeat) {
            error = $t('webActivityBlockPasswordMismatch');
            return;
        }
        busy = true;
        try {
            if (isSet && !(await verifyLock(lock, current))) {
                error = $t('webActivityBlockPasswordWrong');
                return;
            }
            await onChange(await createLock(next));
            reset();
        } finally {
            busy = false;
        }
    }

    async function remove() {
        if (busy) return;
        busy = true;
        try {
            if (!(await verifyLock(lock, current))) {
                error = $t('webActivityBlockPasswordWrong');
                return;
            }
            await onChange(null);
            reset();
        } finally {
            busy = false;
        }
    }
</script>

<div class="wa-set-block">
    <p class="wa-set-note">{$t(isSet ? 'webActivityBlockPasswordOnNote' : 'webActivityBlockPasswordOffNote')}</p>

    <div class="wa-set-rows">
        {#if isSet}
            <div class="wa-set-row">
                <span class="wa-set-row-text">
                    <span class="wa-set-row-name">{$t('webActivityBlockPasswordCurrent')}</span>
                    <span class="wa-set-row-note">{$t('webActivityBlockPasswordCurrentHint')}</span>
                </span>
                <span class="wa-set-row-control wa-set-row-control-text">
                    <input
                        class="wa-text-input"
                        type="password"
                        autocomplete="current-password"
                        spellcheck="false"
                        aria-label={$t('webActivityBlockPasswordCurrent')}
                        title={$tt('webActivityBlockPasswordCurrent')}
                        bind:value={current}
                        oninput={() => (error = '')}
                    />
                </span>
            </div>
        {/if}

        <div class="wa-set-row">
            <span class="wa-set-row-text">
                <span class="wa-set-row-name">
                    {$t(isSet ? 'webActivityBlockPasswordNew' : 'webActivityBlockPasswordSet')}
                </span>
                <span class="wa-set-row-note">{$t('webActivityBlockPasswordNewHint')}</span>
            </span>
            <span class="wa-set-row-control wa-set-row-control-text">
                <input
                    class="wa-text-input"
                    type="password"
                    autocomplete="new-password"
                    spellcheck="false"
                    aria-label={$t(isSet ? 'webActivityBlockPasswordNew' : 'webActivityBlockPasswordSet')}
                    title={$tt('webActivityBlockPasswordNewHint')}
                    bind:value={next}
                    oninput={() => (error = '')}
                />
            </span>
        </div>

        <div class="wa-set-row">
            <span class="wa-set-row-text">
                <span class="wa-set-row-name">{$t('webActivityBlockPasswordRepeat')}</span>
                <span class="wa-set-row-note">{$t('webActivityBlockPasswordRepeatHint')}</span>
            </span>
            <span class="wa-set-row-control wa-set-row-control-text">
                <input
                    class="wa-text-input"
                    class:input-error={!!error}
                    type="password"
                    autocomplete="new-password"
                    spellcheck="false"
                    aria-label={$t('webActivityBlockPasswordRepeat')}
                    title={$tt('webActivityBlockPasswordRepeat')}
                    bind:value={repeat}
                    oninput={() => (error = '')}
                    onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), save())}
                />
            </span>
        </div>
    </div>

    <p class="wa-field-warning" aria-live="polite">{error}</p>

    <div class="wa-set-actions">
        <button class="btn" type="button" disabled={!canSave} title={$tt('save')} onclick={save}>
            <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-lock"></use></svg>
            <span>{$t(isSet ? 'webActivityBlockPasswordChange' : 'webActivityBlockPasswordSave')}</span>
        </button>
        {#if isSet}
            <button
                class="btn wa-btn-danger"
                type="button"
                disabled={busy || !current}
                title={$tt('webActivityBlockPasswordRemove')}
                onclick={remove}
            >
                <svg width="12" height="12" aria-hidden="true" focusable="false"><use href="#wa-close"></use></svg>
                <span>{$t('webActivityBlockPasswordRemove')}</span>
            </button>
        {/if}
    </div>
</div>
