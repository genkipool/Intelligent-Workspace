<script>
    /**
     * [AI INSTRUCTION]
     * THE SETTINGS DRAWER — one dialog, one animation, wherever settings are opened.
     *
     * A `<dialog>` that slides in from the right edge and fills the height of the
     * window, with the page dimmed behind it. It is the shape the rules page's settings
     * button has always opened, and the shape every other settings button now opens
     * too: the web activity side panel had a centred modal of its own, which is how two
     * settings screens in one extension end up feeling like two products.
     *
     * WHY IT CARRIES THE ANIMATION ITSELF. The slide used to live in `rules.css` on
     * `dialog.import-modal`, so it belonged to that page and nowhere else. Here it is
     * scoped to the component and written against its own class name, so the drawer
     * behaves the same on a page that has never heard of `rules.css` — which is the
     * whole point of moving it.
     *
     * `@starting-style` is what makes the *entry* animate. Without it a dialog only
     * animates on the way out — the browser has nothing to interpolate from for an
     * element that was `display: none` a frame ago — and the drawer appeared instantly
     * and left gracefully, which reads as a glitch rather than a design.
     *
     * Under 600px it comes up from the bottom instead: a drawer pinned to the right of
     * a 350px panel would be the whole panel anyway, and rising from the edge it is
     * attached to is what a sheet that narrow is expected to do.
     */
    import ModalHeader from './ModalHeader.svelte';
    import { dismissOnBackdrop } from '../../actions/dismissOnBackdrop.js';

    let {
        open = false,
        title,
        titleId = undefined,
        /** An extra class on the body, for pages that style their own settings rows. */
        bodyClass = '',
        onClose,
        children,
    } = $props();

    let dialogEl = $state(null);

    // `showModal()` is what makes it a modal — the backdrop, the top layer and Escape
    // all come from it — so the open prop is applied to the element rather than to the
    // markup.
    $effect(() => {
        if (!dialogEl) return;
        if (open && !dialogEl.open) dialogEl.showModal();
        if (!open && dialogEl.open) dialogEl.close();
    });
</script>

<dialog
    class="itg-settings-dialog"
    bind:this={dialogEl}
    onclose={onClose}
    use:dismissOnBackdrop={onClose}
    aria-label={title}
>
    <div class="itg-settings-dialog-content">
        <ModalHeader {titleId} {title} {onClose} />
        <div class="itg-settings-dialog-body {bodyClass}">
            {@render children()}
        </div>
    </div>
</dialog>

<style>
    /* `dialog.` rather than a bare class throughout, so a page that styles `dialog`
       cannot reach in. The rules page does — `dialog:not([open]) { opacity: 0 }` — and
       that one declaration was enough to break the closing animation everywhere: with
       opacity snapping to nought the drawer vanished on the spot and the slide it was
       still running played to an empty room. */
    dialog.itg-settings-dialog {
        position: fixed;
        inset: 0 0 0 auto;
        /* Sized to what it holds, as it always was. */
        width: fit-content;
        max-width: none;
        height: 100vh;
        max-height: 100vh;
        box-sizing: border-box;
        margin: 0 0 0 auto;
        padding: 0;
        border: 1px solid var(--border-color);
        border-radius: 0;
        background-color: var(--bg-panel-color);
        color: var(--text-color);
        outline: none;
        overflow: hidden;
        opacity: 1;
        transform: translateX(100%);
        transition:
            transform 0.8s ease,
            display 0.8s allow-discrete,
            overlay 0.8s allow-discrete;
    }

    /* Closed, it is still fully opaque: what animates is where it is, not whether it
       can be seen through. */
    dialog.itg-settings-dialog:not([open]) {
        opacity: 1;
    }

    dialog.itg-settings-dialog[open] {
        transform: translateX(0);
    }

    /* The frame it comes *from*. Everything else about the entry is the same
       transition as the exit, run the other way. */
    @starting-style {
        dialog.itg-settings-dialog[open] {
            transform: translateX(100%);
        }
    }

    dialog.itg-settings-dialog::backdrop {
        background-color: rgba(0, 0, 0, 0.6);
        transition:
            background-color 0.8s ease,
            display 0.8s allow-discrete,
            overlay 0.8s allow-discrete;
    }

    dialog.itg-settings-dialog:not([open])::backdrop {
        background-color: rgba(0, 0, 0, 0);
    }

    @starting-style {
        dialog.itg-settings-dialog[open]::backdrop {
            background-color: rgba(0, 0, 0, 0);
        }
    }

    dialog.itg-settings-dialog .itg-settings-dialog-content {
        display: flex;
        flex-direction: column;
        width: 100%;
        height: 100%;
        box-sizing: border-box;
    }

    dialog.itg-settings-dialog .itg-settings-dialog-body {
        flex: 1 1 auto;
        min-height: 0;
        overflow-y: auto;
        padding: 14px 16px 20px;
    }

    /* A panel is too narrow for a drawer at its side, so it becomes a sheet. */
    @media (max-width: 600px) {
        dialog.itg-settings-dialog {
            inset: auto 0 0 0;
            width: 100%;
            height: 96vh;
            max-height: 96vh;
            margin: 0;
            border-radius: 12px 12px 0 0;
            transform: translateY(100%);
        }

        dialog.itg-settings-dialog[open] {
            transform: translateY(0);
        }

        @starting-style {
            dialog.itg-settings-dialog[open] {
                transform: translateY(100%);
            }
        }

        dialog.itg-settings-dialog .itg-settings-dialog-body {
            padding: 12px 12px 18px;
        }
    }
</style>
