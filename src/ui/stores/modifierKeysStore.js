import { readable } from 'svelte/store';

/**
 * Whether Ctrl/Cmd is being held right now.
 *
 * Read-aloud buttons swap their icon for a stop button while the key is down, and
 * there can be one button per conversation entry: a single document listener shared
 * by all of them beats one listener per component.
 */
export const isCtrlHeld = readable(false, (set) => {
    const onKeyDown = (e) => {
        if (e.key === 'Control' || e.key === 'Meta') set(true);
    };
    const onKeyUp = (e) => {
        if (e.key === 'Control' || e.key === 'Meta') set(false);
    };
    // Leaving the window swallows the keyup, which would leave the icon stuck.
    const onBlur = () => set(false);

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('blur', onBlur);
    };
});
