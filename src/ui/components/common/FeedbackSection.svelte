<script>
    import { t, tt } from '../../stores/i18nStore.js';
    import { notificationStore } from '../../stores/notificationStore.js';
    import { copyText } from '../../../utils/copyText.js';

    let { email = '', notificationKey = 'addressCopied', variant = 'popup' } = $props();

    // The about page and the popup each ship their own stylesheet for this block. The
    // component emits whichever class names the host expects rather than inventing a
    // third set that neither stylesheet targets.
    const isAbout = $derived(variant === 'about');
    const containerClass = $derived(isAbout ? 'feedback-links-container' : 'feedback-links');
    const linkClass = $derived(isAbout ? 'feedback-link' : 'feedback-btn');

    async function handleCopyEmail() {
        const ok = await copyText(email);
        notificationStore.show($t(ok ? notificationKey : 'errorCopyingAddress'), ok ? 'success' : 'error');
    }

    function handleEmailKeydown(e) {
        if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleCopyEmail();
        }
    }
</script>

<div class={containerClass} id={isAbout ? 'feedback-links-container' : undefined}>
    <svelte:element this={isAbout ? 'div' : 'span'} class={isAbout ? 'github-link-wrapper' : 'contents'}>
        <a
            href="https://github.com/luisrb85/intelligent-tab-group/issues"
            target="_blank"
            rel="noopener noreferrer"
            class={linkClass}
            class:button={variant === 'popup'}
            id={variant === 'popup' ? 'report-issue-btn' : undefined}
            title={$tt('reportAnIssue')}
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">bug_report</span>
            <span>{$t('reportAnIssue')}</span>
        </a>
    </svelte:element>
    <div
        class={isAbout ? 'email-link-wrapper' : 'feedback-btn email-group'}
        class:button={variant === 'popup'}
        class:email-button-group={variant === 'popup'}
        id={variant === 'popup' ? 'email-button-container' : undefined}
    >
        <a
            href="mailto:{email}"
            class={isAbout ? linkClass : 'email-link-overlay'}
            id={variant === 'popup' ? 'send-email-btn' : undefined}
            title={$tt('sendAnEmail')}
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">email</span>
            <span>{$t('sendAnEmail')}</span>
        </a>
        <button
            type="button"
            class={isAbout ? 'copy-button' : 'copy-action-btn'}
            id={variant === 'popup' ? 'copy-email-btn-popup' : undefined}
            title={$tt('copyEmailAddress')}
            aria-label={$t('copyEmailAddress')}
            onclick={handleCopyEmail}
            onkeydown={handleEmailKeydown}
        >
            <span class="material-icons-sharp" translate="no" aria-hidden="true">content_copy</span>
        </button>
    </div>
</div>

<style>
    .feedback-links {
        display: flex;
        flex-direction: column;
        gap: 8px;
    }
    .feedback-btn {
        box-sizing: border-box;
        width: 100%;
        justify-content: center;
        text-decoration: none;
        font-size: 13px;
        padding: 8px 16px;
        background-color: var(--action-color);
        border: 1px solid var(--border-color);
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: 8px;
        color: var(--text-color);
        transition:
            background-color 0.3s ease,
            transform 0.2s ease,
            box-shadow 0.2s ease;
        cursor: pointer;
    }
    .feedback-btn:focus-visible {
        outline: none;
        box-shadow: 0 0 0 2px var(--interactive-color);
    }
    .feedback-btn:hover {
        background-color: hsl(from var(--interactive-color) h s calc(l - 10%));
        color: var(--text-on-color);
    }
    .feedback-btn .material-icons-sharp {
        font-size: 18px;
        margin: 0;
    }

    /* Email Group Overrides */
    .email-group {
        padding: 0 !important;
        overflow: hidden !important; /* Keep hidden to crop child backgrounds cleanly */
        align-items: stretch !important;
    }
    /* Apply outer focus ring to the entire group when any child is focused via keyboard */
    .email-group:has(:focus-visible) {
        box-shadow: 0 0 0 2px var(--interactive-color);
    }

    .email-link-overlay {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 8px 0 8px 36px;
        text-decoration: none;
        gap: 8px;
        color: inherit;
        transition: background-color 0.2s;
    }
    .email-link-overlay:focus-visible {
        outline: none;
        background-color: rgba(255, 255, 255, 0.1);
    }

    .copy-action-btn {
        background: transparent;
        border: none;
        padding: 0 12px;
        cursor: pointer;
        color: inherit;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: background-color 0.2s;
    }
    .copy-action-btn:hover {
        background-color: rgba(255, 255, 255, 0.1);
    }
    .copy-action-btn:focus-visible {
        background-color: rgba(255, 255, 255, 0.1);
        outline: none;
    }
    .copy-action-btn .material-icons-sharp {
        font-size: 18px;
    }

    /* About variant spacing */
    .variant-about {
        gap: var(--spacing-md, 12px);
    }
    .variant-about .feedback-btn {
        font-weight: 500;
    }
</style>
