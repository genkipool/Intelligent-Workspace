<script>
    /**
     * [AI INSTRUCTION]
     * THE PAUSE BEFORE A BLOCK COMES OFF.
     *
     * One field and one button, in the same chrome as the two rule dialogs. It does
     * not say which rule it is guarding: the click that opened it did, and repeating
     * it here would only make the dialog longer than the decision.
     *
     * A wrong password says so and keeps the dialog open. There is no attempt counter
     * and no lockout — see `blockLock.js` for why this is a pause and not a security
     * boundary.
     */
    import { t, tt } from '../../../stores/i18nStore.js';
    import RuleModalShell from './RuleModalShell.svelte';

    let {
        /** `(password) => Promise<boolean>` — true closes the dialog and lets the action run. */
        onSubmit,
        onClose,
        title = '',
        prompt = '',
    } = $props();

    let password = $state('');
    let error = $state('');
    let checking = $state(false);
    let inputEl = $state(null);

    $effect(() => {
        inputEl?.focus();
    });

    async function submit() {
        if (checking) return;
        checking = true;
        try {
            const accepted = await onSubmit(password);
            if (!accepted) {
                error = $t('webActivityBlockPasswordWrong');
                password = '';
                inputEl?.focus();
            }
        } finally {
            checking = false;
        }
    }
</script>

<RuleModalShell
    titleId="wa-password-title"
    title={title || $t('webActivityBlockPasswordPrompt')}
    applyLabel={$t('confirm')}
    disabled={!password || checking || !!error}
    danger={!!error}
    variant="wa-password-modal"
    onApply={submit}
    {onClose}
>
    <div class="form-group">
        <label for="wa-password-input">{prompt || $t('webActivityBlockPasswordLabel')}</label>
        <input
            id="wa-password-input"
            bind:this={inputEl}
            class="wa-text-input"
            class:input-error={!!error}
            type="password"
            autocomplete="current-password"
            spellcheck="false"
            title={$tt('webActivityBlockPasswordLabel')}
            bind:value={password}
            oninput={() => (error = '')}
            onkeydown={(e) => e.key === 'Enter' && (e.preventDefault(), submit())}
        />
        <!-- Always in the layout, spoken only when there is something to say, so a
             wrong password does not shove the button out from under the pointer. -->
        <p class="wa-field-warning" aria-live="polite">{error}</p>
    </div>
</RuleModalShell>
