/**
 * PICTURE-IN-PICTURE PLAYER CHROME
 *
 * Icons and stylesheet for the floating player built by videoPip.js. They live in
 * their own file because the PiP window is a separate document: it cannot reach the
 * page's stylesheets, so everything it needs has to be injected as one string.
 *
 * The look follows the buttons this extension already injects into YouTube's own
 * control bar — flat, white, 24px stroke icons on transparent squares that brighten
 * on hover — so the detached player reads as the same interface, not another one.
 */

/** Proper picture-in-picture glyph: outer frame with a small inset screen. */
var ITG_PIP_ICON = `<svg viewBox="0 0 24 24" width="100%" height="100%" fill="none" aria-hidden="true" focusable="false">
    <rect x="2" y="4" width="20" height="16" rx="2.5" stroke="currentColor" stroke-width="2"></rect>
    <rect x="12" y="12" width="8" height="6" rx="1" fill="currentColor"></rect>
</svg>`;

/**
 * The same glyph with the exact attributes YouTube's own control bar icons carry.
 *
 * Measured against the fullscreen button next to ours: `height="24" width="24"
 * viewBox="0 0 24 24"`, laid out as a 24px box that the button centres itself. Sized
 * at 100%/100% instead — which is what the older docs describe — the icon resolves
 * to the button's full 48x40 and spills out of it, unevenly, because that box is not
 * square. Fixed 24s are what put it in line with its neighbours.
 */
var ITG_PIP_ICON_YTP = `<svg height="24" width="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <rect x="2" y="4" width="20" height="16" rx="2.5" stroke="#fff" stroke-width="2"></rect>
    <rect x="12" y="12" width="8" height="6" rx="1" fill="#fff"></rect>
</svg>`;

var ITG_PIP_ICONS = {
    play: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"></path></svg>`,
    pause: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.5v14H7zm6.5 0H17v14h-3.5z"></path></svg>`,
    previous: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 6h2v12H7zm3.5 6L19 6v12z"></path></svg>`,
    next: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M15 6h2v12h-2zM5 6l8.5 6L5 18z"></path></svg>`,
    rewind: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M11.5 5a7 7 0 1 1-6.9 8.2"></path><path d="M11.5 2 8 5l3.5 3"></path>
        <text x="12" y="15.5" text-anchor="middle" font-size="7" stroke="none" fill="currentColor" font-family="system-ui, sans-serif">10</text>
    </svg>`,
    forward: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12.5 5a7 7 0 1 0 6.9 8.2"></path><path d="M12.5 2 16 5l-3.5 3"></path>
        <text x="12" y="15.5" text-anchor="middle" font-size="7" stroke="none" fill="currentColor" font-family="system-ui, sans-serif">10</text>
    </svg>`,
    volume: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9v6h3.5L12 19V5L7.5 9z" fill="currentColor"></path><path d="M16 9.5a3.5 3.5 0 0 1 0 5"></path><path d="M18.5 7a7 7 0 0 1 0 10"></path>
    </svg>`,
    muted: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9v6h3.5L12 19V5L7.5 9z" fill="currentColor"></path><path d="m16 9.5 5 5m0-5-5 5"></path>
    </svg>`,
    captions: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true">
        <rect x="2.5" y="5" width="19" height="14" rx="2.5"></rect>
        <path d="M10 10.5a2 2 0 0 0-3.5 1.5A2 2 0 0 0 10 13.5M18 10.5a2 2 0 0 0-3.5 1.5 2 2 0 0 0 3.5 1.5" stroke-linecap="round"></path>
    </svg>`,
    comments: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M21 12a8 8 0 0 1-8 8H8l-4 3v-5.5A8 8 0 0 1 11 4h2a8 8 0 0 1 8 8z"></path>
    </svg>`,
    send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="m4 12 16-8-6 16-2.5-6.5z"></path>
    </svg>`,
    fullscreen: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M3 9V4h5M21 9V4h-5M3 15v5h5M21 15v5h-5"></path>
    </svg>`,
    fullscreenExit: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M8 3v5H3m13-5v5h5M8 21v-5H3m13 5v-5h5"></path>
    </svg>`,
    search: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
        <circle cx="11" cy="11" r="6.5"></circle><path d="m16 16 4.5 4.5"></path>
    </svg>`,
    chevronLeft: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m14.5 6-5 6 5 6"></path></svg>`,
    more: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2"></circle>
        <circle cx="12" cy="12" r="2"></circle>
        <circle cx="12" cy="19" r="2"></circle>
    </svg>`,
};

var ITG_PIP_STYLES = `
/* Wide enough for the three tab labels to sit on one row. */
:root { --itg-side-width: 330px; }
* { box-sizing: border-box; }
html, body {
    margin: 0; padding: 0; height: 100%; width: 100%;
    overflow: hidden; background: #000; color: #fff;
    font-family: 'Roboto', system-ui, -apple-system, sans-serif;
}
::selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
input::selection,
textarea::selection,
.itg-pip-size-fields input::selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-pip-root { position: relative; width: 100%; height: 100%; overflow: hidden; }

.itg-pip-stage { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.itg-pip-holder { position: absolute; inset: 0; }
.itg-pip-holder video { width: 100%; height: 100%; object-fit: contain; background: #000; }

/* Momentary play/pause glyph in the middle, the way site players confirm the tap. */
.itg-pip-flash {
    position: absolute; top: 50%; left: 50%; width: 64px; height: 64px; margin: -32px 0 0 -32px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 50%; background: rgba(0, 0, 0, 0.55); color: #fff;
    opacity: 0; pointer-events: none;
}
.itg-pip-flash svg { width: 32px; height: 32px; }
.itg-pip-flash.is-shown { animation: itg-pip-flash 0.5s ease-out; }
@keyframes itg-pip-flash {
    from { opacity: 1; transform: scale(0.8); }
    to { opacity: 0; transform: scale(1.35); }
}

/* --- Control bar --- */
.itg-pip-bar {
    position: absolute; left: 0; right: 0; bottom: 0; z-index: 12;
    padding: 24px 8px 4px;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.85), rgba(0, 0, 0, 0));
    opacity: 0; transform: translateY(6px);
    transition: opacity 0.2s ease, transform 0.2s ease;
    pointer-events: none;
}
.itg-pip-root[data-active='true'] .itg-pip-bar,
.itg-pip-root .itg-pip-bar:hover,
.itg-pip-root .itg-pip-bar:focus-within {
    opacity: 1;
    transform: none;
    pointer-events: auto;
}

.itg-pip-progress { padding: 6px 4px; cursor: pointer; touch-action: none; }
.itg-pip-progress-track { position: relative; height: 4px; border-radius: 2px; background: rgba(255, 255, 255, 0.28); }
.itg-pip-buffered, .itg-pip-played {
    position: absolute; left: 0; top: 0; height: 100%; border-radius: 2px; width: 0;
}
.itg-pip-buffered { background: rgba(255, 255, 255, 0.4); }
.itg-pip-played { background: var(--interactive-color, #ff4444); }
.itg-pip-knob {
    position: absolute; top: 50%; left: 0; width: 12px; height: 12px; margin: -6px 0 0 -6px;
    border-radius: 50%; background: var(--interactive-color, #ff4444); opacity: 0; transition: opacity 0.15s ease;
}
.itg-pip-progress:hover .itg-pip-knob { opacity: 1; }
.itg-pip-progress:hover .itg-pip-progress-track { height: 6px; }

.itg-pip-buttons { display: flex; align-items: center; gap: 2px; padding: 0 2px 2px; }
.itg-pip-btn {
    display: inline-flex; align-items: center; justify-content: center;
    width: 34px; height: 34px; padding: 6px; flex: 0 0 auto;
    border: 0; background: transparent; color: #fff; cursor: pointer;
    opacity: 0.9; transition: opacity 0.15s ease, transform 0.15s ease;
}
.itg-pip-btn:hover { opacity: 1; transform: scale(1.08); }
.itg-pip-btn:disabled { opacity: 0.3; cursor: default; transform: none; }
.itg-pip-btn[hidden] { display: none; }
.itg-pip-btn svg { width: 100%; height: 100%; display: block; }
.itg-pip-btn.is-on { color: var(--interactive-color, #ff4444); opacity: 1; }
/* Fixed, not auto: "1.75x" is wider than "1x", and letting the button grow shoved
   every control after it sideways each time the speed changed. */
.itg-pip-rate {
    flex: 0 0 44px; width: 44px; padding: 6px 2px;
    font-size: 12px; font-weight: 600; text-align: center; font-variant-numeric: tabular-nums;
}

/* Speed menu: a horizontal strip above the button, on hover, no click needed. */
.itg-pip-rate-wrap { position: relative; display: inline-flex; align-items: center; }
/* Invisible bridge over the gap: without it the pointer leaves the wrapper on the
   way up to the menu and the menu closes before it can be reached. */
.itg-pip-rate-wrap::after { content: ''; position: absolute; left: -8px; right: -8px; bottom: 100%; height: 12px; }
.itg-pip-rate-menu {
    position: absolute; bottom: calc(100% + 8px);
    /* Anchored to the right edge, so it grows inwards. Centred on the button it ran
       off the side of the window — which on a small floating player is most of it. */
    right: 0; left: auto;
    /* max-content, or it would not be one strip at all: an absolutely positioned box
       is offered the width of its containing block, and that is the 34px button, so
       every speed wrapped onto its own line. It folds only if the window is narrower
       than the eight of them. */
    display: flex; flex-wrap: wrap; justify-content: flex-end;
    width: max-content; max-width: calc(100vw - 16px); gap: 2px; padding: 4px;
    border-radius: 8px; background: rgba(20, 20, 20, 0.95);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    opacity: 0; pointer-events: none; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
}
.itg-pip-rate-wrap:hover .itg-pip-rate-menu,
.itg-pip-rate-menu:hover { opacity: 1; pointer-events: auto; transform: translateY(0); }
.itg-pip-rate-option {
    padding: 4px 7px; border: 0; border-radius: 5px; background: transparent;
    color: #fff; font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
}
.itg-pip-rate-option:hover { background: rgba(255, 255, 255, 0.18); }
.itg-pip-rate-option.is-active { background: var(--interactive-color, #ff4444); font-weight: 600; }

/* Size menu, opened by hovering the size button. */
.itg-pip-size-wrap { position: relative; display: inline-flex; align-items: center; }
.itg-pip-size-wrap::after { content: ''; position: absolute; left: -10px; right: -10px; bottom: 100%; height: 16px; }
.itg-pip-size-menu {
    position: absolute; bottom: calc(100% + 8px); right: 0; left: auto;
    width: max-content; min-width: 216px; max-width: calc(100vw - 16px); padding: 8px;
    border-radius: 8px; background: rgba(20, 20, 20, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
    opacity: 0; pointer-events: none; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 20;
}
.itg-pip-size-wrap:hover .itg-pip-size-menu,
.itg-pip-size-wrap:focus-within .itg-pip-size-menu,
.itg-pip-size-menu:hover,
.itg-pip-size-menu:focus-within { opacity: 1; pointer-events: auto; transform: translateY(0); }
.itg-pip-size-max {
    display: block; width: 100%; margin-bottom: 6px; padding: 5px 8px;
    border: 1px solid rgba(255, 255, 255, 0.25); border-radius: 6px;
    background: transparent; color: #fff; font: inherit; font-size: 12px; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease;
}
.itg-pip-size-max:hover { border-color: var(--interactive-color, #fff); }
.itg-pip-size-max.is-on {
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 25%, transparent);
    border-color: var(--interactive-color, #ff4444);
}
.itg-pip-size-fields { display: flex; gap: 6px; }
/* Each field takes half of whatever the menu is, so the pair fills it. */
.itg-pip-size-fields label { flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px; font-size: 10px; color: rgba(255, 255, 255, 0.65); }
.itg-pip-size-fields input {
    width: 100%; padding: 5px 6px; border-radius: 6px; color: #fff; font: inherit; font-size: 12px;
    border: 1px solid var(--interactive-color, rgba(255, 255, 255, 0.25));
    background: rgba(255, 255, 255, 0.08); outline: none;
}
.itg-pip-size-fields input:focus {
    border-color: var(--interactive-color, #fff);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #fff) 35%, transparent);
}
.itg-pip-size-note { display: block; margin-top: 6px; font-size: 10px; color: rgba(255, 255, 255, 0.6); }
/* The browser's own spinner cannot be tinted, so it is hidden and the arrows come
   in as a background image the theme colours — the same arrangement the rules page
   uses for its number fields. The image itself is written in by applyTheme(). */
.itg-pip-size-fields input::-webkit-inner-spin-button,
.itg-pip-size-fields input::-webkit-outer-spin-button {
    opacity: 1; appearance: none; margin: 0; padding: 0; cursor: pointer;
    width: 20px; height: 26px;
    background-color: transparent; background-size: contain;
    background-repeat: no-repeat; background-position: right center;
}

/* YouTube's own caption container, moved in beside the video. */
.itg-pip-captions {
    position: absolute; inset: 0; z-index: 5; pointer-events: none; overflow: hidden;
}
.itg-pip-captions .caption-window { pointer-events: none; }

/* The slider stays out of the way until the volume button is reached. */
.itg-pip-volume { display: flex; align-items: center; }
.itg-pip-volume-slider {
    width: 0; opacity: 0; margin: 0; accent-color: #fff; cursor: pointer;
    transition: width 0.2s ease, opacity 0.2s ease;
}
.itg-pip-volume:hover .itg-pip-volume-slider { width: 64px; opacity: 1; margin: 0 6px 0 2px; }

.itg-pip-time { font-size: 12px; padding: 0 8px; white-space: nowrap; font-variant-numeric: tabular-nums; }
.itg-pip-spacer { flex: 1 1 auto; }

/* --- Side list --- */
.itg-pip-side-area {
    position: absolute; top: 0; height: 100%; z-index: 11;
    right: calc(var(--itg-side-width) * -1);
    width: calc(var(--itg-side-width) + 18px);
    display: flex; align-items: stretch;
    transition: right 0.35s ease;
}
.itg-pip-side-area:hover { right: 0; }
.itg-pip-side-area[hidden] { display: none; }
/* Reading comments, and above all writing one, cannot depend on keeping the pointer
   inside the panel — the comments button pins it open instead. */
.itg-pip-side-area[data-pinned='true'] { right: 0; }

.itg-pip-side-grip {
    align-self: center; width: 18px; height: 44px; flex: 0 0 18px;
    display: flex; align-items: center; justify-content: center;
    border-radius: 6px 0 0 6px; background: rgba(0, 0, 0, 0.55); color: #fff;
    opacity: 0; transition: opacity 0.2s ease;
}
.itg-pip-side-grip svg { width: 14px; height: 14px; }
.itg-pip-root[data-active='true'] .itg-pip-side-grip { opacity: 1; }
.itg-pip-side-area:hover .itg-pip-side-grip { opacity: 0; }

.itg-pip-side {
    width: var(--itg-side-width); height: 100%; overflow-y: auto; overscroll-behavior: contain;
    padding: 10px 8px; background: rgba(0, 0, 0, 0.82);
    border-left: 1px solid rgba(255, 255, 255, 0.18);
    backdrop-filter: blur(6px);
}
.itg-pip-side::-webkit-scrollbar { width: 6px; }
.itg-pip-side::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.3); border-radius: 3px; }

.itg-pip-side-section + .itg-pip-side-section { margin-top: 14px; }
.itg-pip-side-section h3 {
    margin: 0 0 6px; font-size: 12px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.06em; color: rgba(255, 255, 255, 0.65);
}
.itg-pip-side-item {
    display: flex; gap: 8px; width: 100%; margin-bottom: 6px; padding: 4px;
    border: 0; border-radius: 6px; background: transparent; color: #fff;
    text-align: left; cursor: pointer; transition: background 0.15s ease;
}
.itg-pip-side-item:hover { background: rgba(255, 255, 255, 0.14); }
.itg-pip-side-item.is-active { background: var(--interactive-color, #ff4444); }
.itg-pip-thumb { position: relative; flex: 0 0 92px; width: 92px; height: 52px; border-radius: 4px; overflow: hidden; background: #222; }
.itg-pip-thumb img { width: 100%; height: 100%; object-fit: cover; display: block; }
.itg-pip-duration {
    position: absolute; right: 2px; bottom: 2px; padding: 0 3px; border-radius: 2px;
    background: rgba(0, 0, 0, 0.8); font-size: 10px; line-height: 14px;
}
.itg-pip-meta { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.itg-pip-item-title {
    font-size: 12px; line-height: 1.3; display: -webkit-box;
    -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.itg-pip-item-user { font-size: 11px; color: rgba(255, 255, 255, 0.6); }

/* --- Side search --- */
/* The field is always there rather than behind a magnifier: one less press for the
   thing the panel is most likely to be opened for. */
.itg-pip-side-head { position: relative; display: flex; align-items: center; padding-bottom: 8px; }
.itg-pip-side-search {
    flex: 1 1 auto; min-width: 0; padding: 6px 8px 6px 28px;
    border: 1px solid var(--interactive-color, rgba(255, 255, 255, 0.25)); border-radius: 6px;
    background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 12px; outline: none;
}
.itg-pip-side-search::-webkit-search-cancel-button { filter: invert(1); opacity: 0.6; }
.itg-pip-side-search-icon {
    position: absolute; left: 7px; top: 50%; width: 14px; height: 14px; margin-top: -11px;
    color: rgba(255, 255, 255, 0.6); pointer-events: none;
}
.itg-pip-side-search-icon svg { width: 100%; height: 100%; display: block; }

/* --- Side tabs --- */
.itg-pip-side-tabs {
    display: flex; gap: 4px; margin-bottom: 10px; position: sticky; top: -10px;
    padding: 10px 0 6px; background: rgba(0, 0, 0, 0.92); z-index: 1;
}
.itg-pip-side-tab {
    flex: 1 1 auto; padding: 5px 8px; border: 0; border-radius: 6px;
    background: rgba(255, 255, 255, 0.1); color: rgba(255, 255, 255, 0.75);
    font-size: 12px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease;
}
.itg-pip-side-tab:hover { background: rgba(255, 255, 255, 0.2); }
.itg-pip-side-tab.is-active { background: var(--interactive-color, #ff4444); color: #fff; font-weight: 600; }

/* --- Comments --- */
.itg-pip-comment { display: flex; gap: 8px; padding: 6px 4px; border-radius: 6px; }
.itg-pip-comment:hover { background: rgba(255, 255, 255, 0.07); }
.itg-pip-comment-avatar {
    flex: 0 0 28px; width: 28px; height: 28px; border-radius: 50%; overflow: hidden; background: #333;
}
.itg-pip-comment-avatar img { width: 100%; height: 100%; object-fit: cover; display: block; }
.itg-pip-comment-body { min-width: 0; flex: 1 1 auto; }
.itg-pip-comment-head { display: flex; gap: 6px; align-items: baseline; font-size: 11px; color: rgba(255, 255, 255, 0.6); }
.itg-pip-comment-author { font-weight: 600; color: #fff; }
.itg-pip-comment-text { font-size: 12px; line-height: 1.4; margin: 2px 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.itg-pip-comment-meta { display: flex; gap: 10px; align-items: center; font-size: 11px; color: rgba(255, 255, 255, 0.55); }
.itg-pip-comment-reply {
    border: 0; background: transparent; color: rgba(255, 255, 255, 0.75);
    font-size: 11px; padding: 2px 0; cursor: pointer; text-decoration: underline;
}
.itg-pip-comment-reply:hover { color: #fff; }
.itg-pip-reply-box { display: none; gap: 4px; margin-top: 6px; }
.itg-pip-reply-box.is-open { display: flex; }
.itg-pip-reply-box textarea {
    flex: 1 1 auto; min-height: 46px; resize: vertical; padding: 5px 6px;
    /* Themed, like the progress bar and the active markers. */
    border: 1px solid var(--interactive-color, rgba(255, 255, 255, 0.25)); border-radius: 6px;
    background: rgba(255, 255, 255, 0.08); color: #fff; font: inherit; font-size: 12px;
    outline: none;
}
.itg-pip-reply-box textarea:focus {
    border-color: var(--interactive-color, #fff);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #fff) 35%, transparent);
}
.itg-pip-reply-send {
    flex: 0 0 30px; width: 30px; height: 30px; padding: 6px; align-self: flex-end;
    border: 0; border-radius: 6px; background: var(--interactive-color, #ff4444); color: #fff; cursor: pointer;
}
.itg-pip-reply-send svg { width: 100%; height: 100%; }
.itg-pip-side-note { font-size: 12px; color: rgba(255, 255, 255, 0.6); padding: 6px 4px; }
.itg-pip-show-replies {
    margin-top: 4px; padding: 2px 0; border: 0; background: transparent;
    color: var(--interactive-color, #8ab4f8); font-size: 11px; font-weight: 600; cursor: pointer;
}
.itg-pip-show-replies:hover { text-decoration: underline; }
.itg-pip-show-replies[hidden] { display: none; }
.itg-pip-show-replies:disabled { opacity: 0.5; cursor: default; }
.itg-pip-replies { margin-top: 4px; }
.itg-pip-comment.itg-pip-reply {
    padding-left: 8px; margin-left: 2px;
    border-left: 2px solid rgba(255, 255, 255, 0.15);
}
.itg-pip-comment.itg-pip-reply .itg-pip-comment-avatar { flex: 0 0 22px; width: 22px; height: 22px; }

/* --- More options menu (3 vertical dots) --- */
.itg-pip-more-wrap { position: relative; display: none; align-items: center; }
.itg-pip-more-wrap::after { content: ''; position: absolute; left: -10px; right: -10px; bottom: 100%; height: 16px; }
.itg-pip-more-menu {
    position: absolute; bottom: calc(100% + 8px); right: 0; left: auto;
    width: max-content; min-width: 190px; max-width: calc(100vw - 16px);
    padding: 8px 6px; border-radius: 10px;
    background: rgba(20, 20, 20, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.15);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(8px);
    opacity: 0; pointer-events: none; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease;
    z-index: 20;
}
.itg-pip-more-wrap:hover .itg-pip-more-menu,
.itg-pip-more-menu:hover { opacity: 1; pointer-events: auto; transform: translateY(0); }

.itg-pip-more-section-title {
    display: block; font-size: 11px; font-weight: 600; color: rgba(255, 255, 255, 0.6);
    padding: 2px 6px 6px; text-transform: uppercase; letter-spacing: 0.05em;
}
.itg-pip-more-speed-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding: 0 2px 4px;
}
.itg-pip-more-speed-btn {
    padding: 4px 0; border: 0; border-radius: 5px; background: rgba(255, 255, 255, 0.08);
    color: #fff; font-size: 11.5px; font-variant-numeric: tabular-nums; cursor: pointer;
    transition: background 0.15s ease; text-align: center;
}
.itg-pip-more-speed-btn:hover { background: rgba(255, 255, 255, 0.22); }
.itg-pip-more-speed-btn.is-active { background: var(--interactive-color, #ff4444); font-weight: 600; }

.itg-pip-more-divider {
    height: 1px; margin: 6px 0; background: rgba(255, 255, 255, 0.12);
}

.itg-pip-more-item {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px;
    border: 0; border-radius: 6px; background: transparent; color: #fff;
    font: inherit; font-size: 12px; cursor: pointer; text-align: left;
    transition: background 0.15s ease;
}
.itg-pip-more-item:hover { background: rgba(255, 255, 255, 0.14); }
.itg-pip-more-item.is-on { color: var(--interactive-color, #ff4444); font-weight: 600; }
.itg-pip-more-item[hidden] { display: none; }
.itg-pip-more-icon { width: 16px; height: 16px; flex: 0 0 16px; display: flex; align-items: center; justify-content: center; }
.itg-pip-more-icon svg { width: 100%; height: 100%; }
.itg-pip-more-label { flex: 1 1 auto; white-space: nowrap; }

/* Responsive adjustments when player is narrow */
@media (max-width: 520px) {
    .itg-pip-more-wrap { display: inline-flex; }
    .itg-pip-rate-wrap,
    .itg-pip-size-wrap,
    .itg-pip-btn[data-act='comments'],
    .itg-pip-btn[data-act='captions'] {
        display: none !important;
    }
}
@media (max-width: 400px) {
    .itg-pip-btn[data-act='rewind'],
    .itg-pip-btn[data-act='forward'],
    .itg-pip-volume-slider {
        display: none !important;
    }
}
@media (min-width: 401px) {
    .itg-pip-more-rewind,
    .itg-pip-more-forward {
        display: none !important;
    }
}
`;
