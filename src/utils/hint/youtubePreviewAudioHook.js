/**
 * YOUTUBE HOVER PREVIEW AUDIO (main world)
 *
 * Two things make the sound of a hover preview unreachable from a content script:
 *
 * 1. The preview player's API (`mute`, `unMute`, `setVolume`) is a plain JavaScript
 *    property the page puts on the `#inline-preview-player` element, and properties the
 *    page adds to a DOM node are invisible from the extension's isolated world. Every
 *    `player.unMute()` a content script writes is a no-op.
 *
 * 2. YouTube's player keeps a *forced mute* for inline previews whose player response
 *    came without `inlinePlaybackConfig.showAudioControls` -- which is the case for
 *    Shorts, and is why YouTube shows its own speaker on the big previews but not on
 *    those. The flag is enforced from the player's own `volumechange` listener, so it
 *    puts the mute back a few milliseconds after anyone clears it. Whether the sound
 *    survived was a race, which is why it worked on most Shorts and not on some.
 *
 * Running in the page's own context, this can call the same API YouTube's own preview
 * speaker uses, and hold the forced mute off the one element the user asked to hear.
 * The hold is a property override on that single `<video>`: while it is on, the player's
 * re-mute is dropped and everything else about `muted` behaves normally. It is lifted
 * as soon as the user turns the sound off, or the preview moves on.
 */
(() => {
    if (window.__itgYtPreviewAudioInstalled) return;
    window.__itgYtPreviewAudioInstalled = true;

    const nativeMuted = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'muted');
    if (!nativeMuted) return;

    let heldVideo = null;

    const release = () => {
        if (!heldVideo) return;
        delete heldVideo.muted;
        heldVideo = null;
    };

    const hold = (video) => {
        if (heldVideo === video) return;
        release();
        Object.defineProperty(video, 'muted', {
            configurable: true,
            enumerable: true,
            get() {
                return nativeMuted.get.call(this);
            },
            set(value) {
                // Only the player's forced re-mute is dropped; turning the sound off still
                // goes through `release()` first, so nothing is ever stuck unmuted.
                if (value) return;
                nativeMuted.set.call(this, value);
            },
        });
        heldVideo = video;
    };

    const getPreviewPlayer = () => document.querySelector('ytd-video-preview #inline-preview-player');

    window.addEventListener('message', (event) => {
        if (event.source !== window || !event.data || event.data.__itgYtPreviewAudio !== 'apply') return;

        const player = getPreviewPlayer();
        const video = player && player.querySelector('video');
        if (!video) return;

        const wantSound = !!event.data.sound;
        if (heldVideo && heldVideo !== video) release();

        try {
            if (wantSound) {
                const volume = event.data.volume;
                if (typeof volume === 'number' && typeof player.setVolume === 'function') {
                    player.setVolume(volume);
                }
                // The player's own state first, so it stops believing the preview is muted.
                if (typeof player.unMute === 'function') player.unMute();
                hold(video);
                nativeMuted.set.call(video, false);
            } else {
                release();
                if (typeof player.mute === 'function') player.mute();
                else nativeMuted.set.call(video, true);
            }
        } catch {}

        try {
            window.postMessage({ __itgYtPreviewAudio: 'applied', sound: wantSound }, '*');
        } catch {}
    });

    // A new video loaded into the same element is a different preview: let YouTube decide
    // again, and let the content script ask once more if the pointer is still on a Short.
    document.addEventListener(
        'emptied',
        (event) => {
            if (event.target === heldVideo) release();
        },
        true,
    );
})();
