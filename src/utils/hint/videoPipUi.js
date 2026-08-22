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

/**
 * Loop/repeat glyph sized for YouTube's control bar — same 24×24 fixed
 * dimensions and white stroke as ITG_PIP_ICON_YTP to sit flush with its
 * neighbours.
 */
var ITG_LOOP_ICON_YTP = `<svg height="24" width="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
    <path d="M17 2l3 3-3 3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M3 11V9a4 4 0 0 1 4-4h13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M7 22l-3-3 3-3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
    <path d="M21 13v2a4 4 0 0 1-4 4H4" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
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
    volumeLow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M4 9v6h3.5L12 19V5L7.5 9z" fill="currentColor"></path><path d="M16 9.5a3.5 3.5 0 0 1 0 5"></path>
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
    like: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
    </svg>`,
    likeFilled: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path>
    </svg>`,
    dislike: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
    </svg>`,
    dislikeFilled: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7-13h3a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-3"></path>
    </svg>`,
    more: `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <circle cx="12" cy="5" r="2"></circle>
        <circle cx="12" cy="12" r="2"></circle>
        <circle cx="12" cy="19" r="2"></circle>
    </svg>`,
    loop: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M17 2l3 3-3 3"></path><path d="M3 11V9a4 4 0 0 1 4-4h13"></path>
        <path d="M7 22l-3-3 3-3"></path><path d="M21 13v2a4 4 0 0 1-4 4H4"></path>
    </svg>`,
    infinity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M12 12c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4Z"></path>
    </svg>`,
    current: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>`,
};

var ITG_PIP_STYLES = `
/* Wide enough for the three tab labels to sit on one row. */
:root { --itg-side-width: 330px; }
* { box-sizing: border-box; }
html, body {
    margin: 0; padding: 0; height: 100%; width: 100%;
    overflow: hidden; background: #000; color: #fff;
    font-family: 'Roboto', system-ui, -apple-system, sans-serif;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color, rgba(255, 255, 255, 0.25)) var(--bg-color, #1a1a1a);
}
::-webkit-scrollbar {
    width: 8px;
    height: 8px;
}
::-webkit-scrollbar-track {
    background: var(--bg-color, #1a1a1a);
    border-radius: 10px;
}
::-webkit-scrollbar-thumb {
    background-color: var(--border-color, #444);
    border-radius: 10px;
    border: 2px solid var(--bg-color, #1a1a1a);
}
::-webkit-scrollbar-thumb:hover {
    background-color: var(--action-color, var(--interactive-color, #ff4444));
    cursor: pointer;
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

.itg-pip-progress { position: relative; z-index: 10; padding: 8px 4px; margin-bottom: 2px; cursor: pointer; touch-action: none; }
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

/* Suppress popups during progress bar scrubbing */
.itg-pip-bar.is-scrubbing .itg-pip-loop-menu,
.itg-pip-bar.is-scrubbing .itg-pip-size-menu,
.itg-pip-bar.is-scrubbing .itg-pip-rate-menu,
.itg-pip-bar.is-scrubbing .itg-pip-more-menu,
.itg-pip-bar.is-scrubbing .itg-pip-volume-pop {
    opacity: 0 !important;
    pointer-events: none !important;
    transform: translateY(4px) !important;
    visibility: hidden !important;
}

.itg-pip-buttons { display: flex; align-items: center; gap: 2px; padding: 0 2px 2px; position: relative; z-index: 50; }
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
.itg-pip-rate-wrap { position: relative; display: inline-flex; align-items: center; z-index: 50; }
.itg-pip-rate-wrap:hover,
.itg-pip-rate-wrap:focus-within { z-index: 100; }
.itg-pip-rate-wrap::after {
    content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: 16px;
    pointer-events: none; z-index: 100;
}
.itg-pip-rate-wrap:hover::after,
.itg-pip-rate-wrap:focus-within::after {
    pointer-events: auto;
}
.itg-pip-rate-menu {
    position: absolute; bottom: calc(100% + 4px);
    /* Anchored to the right edge, so it grows inwards. Centred on the button it ran
       off the side of the window — which on a small floating player is most of it. */
    right: 0; left: auto;
    display: flex; flex-wrap: wrap; justify-content: flex-end;
    width: max-content; max-width: calc(100vw - 16px); gap: 2px; padding: 4px;
    border-radius: 8px; background: var(--bg-panel-color, rgba(20, 20, 20, 0.96));
    color: var(--text-color, #ffffff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    opacity: 0; pointer-events: none; visibility: hidden; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
    z-index: 100;
}
.itg-pip-rate-menu::after {
    content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 16px;
    pointer-events: auto; z-index: 100;
}
.itg-pip-rate-wrap:hover .itg-pip-rate-menu,
.itg-pip-rate-wrap:focus-within .itg-pip-rate-menu,
.itg-pip-rate-menu:hover,
.itg-pip-rate-menu:focus-within {
    opacity: 1; pointer-events: auto; visibility: visible; transform: translateY(0);
}
.itg-pip-rate-option {
    padding: 4px 7px; border: 0; border-radius: 5px; background: transparent;
    color: var(--text-color, #ffffff); font-size: 12px; font-variant-numeric: tabular-nums; white-space: nowrap; cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease;
}
.itg-pip-rate-option:hover {
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 18%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-pip-rate-option.is-active {
    background: var(--interactive-color, #ff4444);
    color: #ffffff !important;
    font-weight: 600;
}
.itg-pip-rate-option.is-active:hover {
    background: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}

/* Size menu, opened by hovering the size button. */
.itg-pip-size-wrap { position: relative; display: inline-flex; align-items: center; z-index: 50; }
.itg-pip-size-wrap:hover,
.itg-pip-size-wrap:focus-within { z-index: 100; }
.itg-pip-size-wrap::after {
    content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: 16px;
    pointer-events: none; z-index: 100;
}
.itg-pip-size-wrap:hover::after,
.itg-pip-size-wrap:focus-within::after {
    pointer-events: auto;
}
.itg-pip-size-menu {
    position: absolute; bottom: calc(100% + 4px); right: 0; left: auto;
    width: max-content; min-width: 216px; max-width: calc(100vw - 16px); padding: 8px;
    border-radius: 8px; background: var(--bg-panel-color, rgba(20, 20, 20, 0.96));
    color: var(--text-color, #ffffff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    opacity: 0; pointer-events: none; visibility: hidden; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
    z-index: 100;
    font-family: 'Roboto', system-ui, -apple-system, sans-serif;
}
.itg-pip-size-menu::after {
    content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 16px;
    pointer-events: auto; z-index: 100;
}
.itg-pip-size-wrap:hover .itg-pip-size-menu,
.itg-pip-size-wrap:focus-within .itg-pip-size-menu,
.itg-pip-size-menu:hover,
.itg-pip-size-menu:focus-within {
    opacity: 1; pointer-events: auto; visibility: visible; transform: translateY(0);
}
.itg-pip-size-header {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-color, #ffffff);
    margin-bottom: 8px;
    padding-bottom: 5px;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
    letter-spacing: 0.2px;
    text-transform: uppercase;
}
.itg-pip-size-max {
    display: block; width: 100%; margin-bottom: 6px; padding: 5px 8px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.25)); border-radius: 6px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent);
    color: var(--text-color, #ffffff); font: inherit; font-size: 12px; cursor: pointer;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
}
.itg-pip-size-max:hover {
    border-color: var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 16%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-pip-size-max.is-on {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    color: #ffffff !important;
    font-weight: 600;
}
.itg-pip-size-max.is-on:hover {
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 85%, black);
    border-color: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}
.itg-pip-size-fields { display: flex; gap: 6px; }
/* Each field takes half of whatever the menu is, so the pair fills it. */
.itg-pip-size-fields label {
    flex: 1 1 0; min-width: 0; display: flex; flex-direction: column; gap: 2px;
    font-size: 10px; font-weight: 500; color: var(--text-color, rgba(255, 255, 255, 0.65)); opacity: 0.85;
}
.itg-pip-size-fields input {
    width: 100%; padding: 5px 6px; border-radius: 6px; color: var(--text-color, #ffffff); font: inherit; font-size: 12px;
    font-variant-numeric: tabular-nums;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.22));
    background: rgba(255, 255, 255, 0.08); outline: none;
    caret-color: var(--interactive-color, #ffffff);
    transition: border-color 0.15s ease, box-shadow 0.15s ease;
}
.itg-pip-size-fields input:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
}
.itg-pip-size-note {
    display: block; margin-top: 6px; font-size: 10.5px; font-weight: 500;
    color: var(--interactive-color, #ff4444);
}
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

/* Loop menu, opened by hovering or focusing the loop button */
.itg-pip-loop-wrap { position: relative; display: inline-flex; align-items: center; z-index: 50; }
.itg-pip-loop-wrap:hover,
.itg-pip-loop-wrap:focus-within { z-index: 100; }
.itg-pip-loop-wrap::after {
    content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: 16px;
    pointer-events: none; z-index: 100;
}
.itg-pip-loop-wrap:hover::after,
.itg-pip-loop-wrap:focus-within::after {
    pointer-events: auto;
}
.itg-pip-loop-menu {
    position: absolute; bottom: calc(100% + 4px); right: 0; left: auto;
    width: 375px; max-width: calc(100vw - 16px); padding: 10px 10px 8px;
    border-radius: 12px; background: var(--bg-panel-color, rgba(20, 20, 24, 0.96));
    color: var(--text-color, #ffffff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px) saturate(180%);
    opacity: 0; pointer-events: none; visibility: hidden; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
    z-index: 100;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
}
.itg-pip-loop-menu * { box-sizing: border-box; }
.itg-pip-loop-menu::after {
    content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 16px;
    pointer-events: auto; z-index: 100;
}
.itg-pip-loop-wrap:hover .itg-pip-loop-menu,
.itg-pip-loop-wrap:focus-within .itg-pip-loop-menu,
.itg-pip-loop-menu:hover,
.itg-pip-loop-menu:focus-within {
    opacity: 1; pointer-events: auto; visibility: visible; transform: translateY(0);
}

/* Common loop popup component styling - Single row multi-loop layout */
.itg-loop-header {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin-bottom: 7px; padding-bottom: 6px;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}
.itg-loop-title {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-color, rgba(255, 255, 255, 0.9));
    transition: color 0.2s ease; white-space: nowrap;
}
.itg-loop-header.is-active .itg-loop-title,
.itg-loop-title.is-active {
    color: var(--text-on-color, #ffffff) !important;
}
.itg-loop-title-icon { width: 15px; height: 15px; display: flex; align-items: center; justify-content: center; color: var(--interactive-color, #ff4444); }
.itg-loop-title-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }

/* Sequence loop control bar (placed above the first loop) */
.itg-loop-sequence-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 6px 8px; margin-bottom: 6px; border-radius: 7px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 4%, transparent);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    transition: all 0.2s ease;
    box-sizing: border-box; width: 100%; min-height: 33px;
}
.itg-loop-sequence-bar:not(.is-disabled):hover {
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
    border-color: var(--border-color, rgba(255, 255, 255, 0.2));
}
.itg-loop-sequence-bar.is-disabled {
    opacity: 0.4;
    filter: grayscale(0.6);
    cursor: not-allowed !important;
    background: color-mix(in srgb, var(--text-color, #ffffff) 2%, transparent);
    border-color: var(--border-color, rgba(255, 255, 255, 0.05));
}
.itg-loop-sequence-bar.is-disabled * {
    pointer-events: none !important;
    cursor: not-allowed !important;
}
.itg-loop-seq-info {
    display: inline-flex; align-items: center; gap: 6px;
    color: var(--text-color, #ffffff); user-select: none;
}
.itg-loop-seq-icon {
    width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
    color: var(--interactive-color, #ff4444); flex-shrink: 0;
}
.itg-loop-seq-icon svg {
    width: 13px; height: 13px; display: block;
}
.itg-loop-seq-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--text-color, rgba(255, 255, 255, 0.95));
    white-space: nowrap;
}
.itg-loop-seq-controls {
    display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
}
.itg-loop-seq-count {
    width: 47px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: var(--bg-color, rgba(0, 0, 0, 0.25)); color: var(--text-color, #ffffff);
    font: inherit; font-size: 11px; font-weight: 600; text-align: center;
    outline: none; flex-shrink: 0; padding: 0 2px; font-variant-numeric: tabular-nums;
    -moz-appearance: textfield !important; appearance: textfield !important; box-sizing: border-box;
    caret-color: var(--interactive-color, #ff4444);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.itg-loop-seq-count::-webkit-outer-spin-button,
.itg-loop-seq-count::-webkit-inner-spin-button {
    -webkit-appearance: none !important; margin: 0 !important;
}
.itg-loop-seq-count:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 8%, var(--bg-color, #ffffff));
}
.itg-pip-loop-menu *::selection,
.itg-yt-loop-menu *::selection,
.itg-loop-seq-count::selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-pip-loop-menu *::-moz-selection,
.itg-yt-loop-menu *::-moz-selection,
.itg-loop-seq-count::-moz-selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-loop-seq-inf {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent); color: var(--text-color, rgba(255, 255, 255, 0.85));
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-seq-inf svg,
.itg-loop-row-inf svg {
    width: 14px; height: 14px; display: block;
}
.itg-loop-seq-inf:hover {
    border-color: var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 20%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-loop-seq-inf.is-active {
    background: var(--interactive-color, #ff4444) !important;
    border-color: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}

.itg-loop-list {
    display: flex; flex-direction: column; gap: 6px;
    max-height: 280px; overflow-y: auto; overflow-x: hidden;
    padding-right: 0; width: 100%; box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color, rgba(255, 255, 255, 0.25)) transparent;
}
.itg-loop-list::-webkit-scrollbar {
    width: 6px;
}
.itg-loop-list::-webkit-scrollbar-track {
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent);
    border-radius: 10px;
}
.itg-loop-list::-webkit-scrollbar-thumb {
    background-color: var(--border-color, rgba(255, 255, 255, 0.25));
    border-radius: 10px;
}
.itg-loop-list::-webkit-scrollbar-thumb:hover {
    background-color: var(--action-color, var(--interactive-color, #ff4444));
    cursor: pointer;
}

.itg-loop-row-item {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 7px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 4%, transparent);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
    box-sizing: border-box; width: 100%; min-height: 56px;
}
.itg-loop-row-item:hover {
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
}
.itg-loop-row-item.is-active {
    background: color-mix(in srgb, var(--text-color, #ffffff) 10%, transparent);
    border-color: var(--interactive-color, #ff4444);
}
.itg-loop-row-item.is-playing {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--interactive-color, #ff4444) 60%, transparent);
}
.itg-loop-row-item.is-disabled {
    opacity: 0.38;
    filter: grayscale(0.5);
    cursor: not-allowed !important;
}
.itg-loop-row-item.is-disabled * {
    pointer-events: none !important;
    cursor: not-allowed !important;
}

.itg-loop-row-num {
    font-size: 10.5px; font-weight: 700; color: var(--text-color, #ffffff);
    min-width: 20px; height: 44px; text-align: center; cursor: pointer; padding: 0 2px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    user-select: none; flex-shrink: 0; transition: all 0.15s ease;
    display: inline-flex; align-items: center; justify-content: center;
}
.itg-loop-row-num:hover,
.itg-loop-row-item.is-active .itg-loop-row-num {
    background: var(--interactive-color, #ff4444); color: #ffffff !important; border-color: var(--interactive-color, #ff4444);
}

.itg-loop-bar-column {
    flex: 1 1 auto; min-width: 90px;
    display: flex; flex-direction: column; justify-content: space-between; gap: 5px;
    padding: 0 4px; box-sizing: border-box;
}
.itg-loop-inputs-row {
    display: flex; align-items: center; justify-content: space-between; gap: 3px;
}
.itg-loop-time-input {
    flex: 1 1 0; min-width: 36px; height: 21px; padding: 1px 2px;
    border-radius: 4px; color: var(--text-color, #ffffff);
    font: inherit; font-size: 10.5px; font-weight: 500; font-variant-numeric: tabular-nums;
    text-align: center;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    background: var(--bg-color, rgba(0, 0, 0, 0.25)); outline: none;
    caret-color: var(--interactive-color, #ff4444);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    box-sizing: border-box;
}
.itg-loop-time-input::selection,
.itg-loop-row-count::selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-loop-time-input::-moz-selection,
.itg-loop-row-count::-moz-selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-loop-time-input:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 8%, var(--bg-color, #ffffff));
}
.itg-loop-time-sep {
    font-size: 10px; font-weight: bold; color: var(--text-color, rgba(255, 255, 255, 0.6));
    flex-shrink: 0; user-select: none; opacity: 0.6;
}

.itg-loop-bar-wrap {
    width: 100%; display: flex; flex-direction: column; justify-content: center;
    position: relative; cursor: pointer; padding: 5px 0; user-select: none;
    box-sizing: border-box;
}
.itg-loop-bar-track {
    position: relative; width: 100%; height: 5px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 25%, transparent);
    border-radius: 3px;
}
.itg-loop-bar-fill {
    position: absolute; top: 0; bottom: 0;
    background: var(--interactive-color, #ff4444); border-radius: 3px;
    opacity: 0.95; pointer-events: none;
}
.itg-loop-bar-playhead {
    position: absolute; top: -4px; width: 2.5px; height: 13px;
    background: var(--text-color, #ffffff); border-radius: 1px; pointer-events: none;
    transform: translateX(-50%); z-index: 3;
    box-shadow: 0 0 3px color-mix(in srgb, var(--bg-panel-color, #000000) 80%, transparent);
}
.itg-loop-handle {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--bg-panel-color, #ffffff); color: var(--text-color, #111111);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 9px; font-weight: 800; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; text-align: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); cursor: ew-resize;
    z-index: 4; transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.15s ease, color 0.15s ease;
    user-select: none; box-sizing: border-box; outline: none;
    padding: 1px 0 0 0; margin: 0;
}
.itg-loop-handle:hover,
.itg-loop-handle:focus,
.itg-loop-handle:focus-visible,
.itg-loop-handle.is-dragging {
    transform: translate(-50%, -50%) scale(1.25);
    box-shadow: 0 0 0 2px var(--interactive-color, #ff4444);
    z-index: 5;
}
.itg-loop-handle-a { border: 2px solid var(--interactive-color, #ff4444); }
.itg-loop-handle-b { border: 2px solid var(--interactive-color, #ff4444); }

/* Right Buttons Column: 2 rows of buttons */
.itg-loop-btns-column {
    display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;
}
.itg-loop-btns-row {
    display: flex; align-items: center; gap: 3px;
}
.itg-loop-btns-row-2 {
    justify-content: flex-end;
}

.itg-loop-btn-a,
.itg-loop-btn-b {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent); color: var(--text-color, #ffffff);
    font: 700 10.5px 'Roboto', sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-btn-a:hover,
.itg-loop-btn-b:hover {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}

.itg-loop-row-count {
    width: 47px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: var(--bg-color, rgba(0, 0, 0, 0.25)); color: var(--text-color, #ffffff);
    font: inherit; font-size: 11px; font-weight: 600; text-align: center;
    outline: none; flex-shrink: 0; padding: 0 2px; font-variant-numeric: tabular-nums;
    -moz-appearance: textfield !important; appearance: textfield !important; box-sizing: border-box;
    caret-color: var(--interactive-color, #ff4444);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.itg-loop-row-count::-webkit-outer-spin-button,
.itg-loop-row-count::-webkit-inner-spin-button {
    -webkit-appearance: none !important; margin: 0 !important;
}
.itg-loop-row-count:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 8%, var(--bg-color, #ffffff));
}

.itg-loop-row-inf {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent); color: var(--text-color, #ffffff);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-inf:hover {
    border-color: var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 20%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-loop-row-inf.is-active {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}

.itg-loop-row-reset {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent); color: var(--text-color, rgba(255, 255, 255, 0.7));
    font: 12px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-reset:hover {
    color: #ffffff !important; border-color: var(--interactive-color, #ff4444);
    background: var(--interactive-color, #ff4444);
}

.itg-loop-row-del {
    width: 22px; height: 21px; border-radius: 4px; border: none;
    background: transparent; color: var(--text-color, rgba(255, 255, 255, 0.5));
    font: bold 12px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-del:hover {
    color: var(--error-color, #ff5555); background: color-mix(in srgb, var(--error-color, #ff5555) 15%, transparent);
}
.itg-loop-row-del:disabled,
.itg-loop-row-del.is-disabled {
    opacity: 0.28;
    cursor: not-allowed;
    pointer-events: none;
}

.itg-loop-row-add {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.28));
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent); color: var(--text-color, #ffffff);
    font: bold 13px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-add:hover {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    border-style: solid; color: #ffffff !important;
}

.itg-loop-footer {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    margin-top: 6px; padding-top: 5px;
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
}
.itg-loop-footer-status {
    flex: 1 1 0; min-width: 0; overflow: hidden;
}
.itg-loop-status {
    font-size: 10px; font-weight: 500;
    color: var(--interactive-color, #ff4444);
    font-variant-numeric: tabular-nums;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: block;
}
.itg-loop-footer-center {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
}
.itg-loop-video-time {
    font-size: 10.5px; font-weight: 500; font-variant-numeric: tabular-nums;
    color: var(--text-color, #ffffff); opacity: 0.85;
    letter-spacing: 0.2px; white-space: nowrap; user-select: none;
    background: transparent; padding: 0; border: none;
}
.itg-loop-footer-actions {
    flex: 1 1 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; flex-shrink: 0;
}
.itg-loop-toggle-btn {
    border: 0; background: transparent;
    color: var(--text-color, #ffffff); opacity: 0.85;
    font: inherit; font-size: 10.5px; font-weight: 600;
    cursor: pointer; padding: 2px 3px; white-space: nowrap;
    text-decoration: underline; transition: opacity 0.15s ease, color 0.15s ease;
}
.itg-loop-toggle-btn:hover {
    opacity: 1; color: var(--interactive-color, #ff4444);
}
.itg-loop-toggle-btn.is-active {
    color: var(--interactive-color, #ff4444);
    opacity: 1; font-weight: 700;
}
.itg-loop-reset-all-btn {
    border: 0; background: transparent;
    color: var(--text-color, #ffffff); opacity: 0.7;
    font: inherit; font-size: 10.5px;
    cursor: pointer; padding: 2px 3px; white-space: nowrap;
    transition: opacity 0.15s ease, color 0.15s ease;
}
.itg-loop-reset-all-btn:hover {
    opacity: 1; color: var(--interactive-color, #ff4444);
}

/* Clean, robust, perfectly-centered PiP subtitles */
.itg-pip-subtitles-display {
    position: absolute !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    bottom: 50px !important;
    top: auto !important;
    max-width: min(88%, 620px) !important;
    width: auto !important;
    z-index: 10 !important;
    pointer-events: none !important;
    text-align: center !important;
    font-size: 19px !important;
    font-weight: 500 !important;
    line-height: 1.45 !important;
    color: #ffffff !important;
    background: rgba(10, 10, 10, 0.86) !important;
    padding: 6px 14px !important;
    border-radius: 8px !important;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.6) !important;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.95) !important;
    white-space: pre-wrap !important;
    word-break: normal !important;
    overflow-wrap: break-word !important;
    box-sizing: border-box !important;
    transition: bottom 0.2s ease;
}
.itg-pip-root[data-active='true'] .itg-pip-subtitles-display {
    bottom: 68px !important;
}

/* Compact, stylish YouTube bezel overlay (gear/subtitles/volume animations) */
.ytp-bezel,
div[class*='ytp-bezel'] {
    width: 44px !important;
    height: 44px !important;
    min-width: 44px !important;
    min-height: 44px !important;
    max-width: 44px !important;
    max-height: 44px !important;
    margin: -22px 0 0 -22px !important;
    left: 50% !important;
    top: 50% !important;
    padding: 8px !important;
    border-radius: 50% !important;
    background: rgba(0, 0, 0, 0.65) !important;
    backdrop-filter: blur(4px) !important;
    box-sizing: border-box !important;
    pointer-events: none !important;
}
.ytp-bezel-icon {
    width: 26px !important;
    height: 26px !important;
    margin: 1px auto !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
}
.ytp-bezel-icon svg {
    width: 100% !important;
    height: 100% !important;
    fill: #ffffff !important;
}
.ytp-bezel-text,
.ytp-bezel-text-wrapper {
    display: none !important;
}

/* The slider stays out of the way until the volume button is reached. */
.itg-pip-volume { position: relative; display: flex; align-items: center; }
.itg-pip-volume::after {
    content: ''; position: absolute; left: -8px; right: -8px; bottom: 100%; height: 14px;
}
.itg-pip-volume-pop { display: flex; align-items: center; }
.itg-pip-volume-slider {
    -webkit-appearance: none; appearance: none;
    width: 0; height: 16px; opacity: 0; margin: 0; padding: 0;
    background: transparent; cursor: pointer;
    transition: width 0.2s ease, opacity 0.2s ease;
}
.itg-pip-volume-slider::-webkit-slider-runnable-track {
    height: 4px; border-radius: 2px;
    background: linear-gradient(
        to right,
        var(--interactive-color, #ff4444) 0%,
        var(--interactive-color, #ff4444) var(--vol-pct, 100%),
        rgba(255, 255, 255, 0.3) var(--vol-pct, 100%),
        rgba(255, 255, 255, 0.3) 100%
    );
}
.itg-pip-volume-slider::-webkit-slider-thumb {
    -webkit-appearance: none; appearance: none;
    width: 12px; height: 12px; border-radius: 50%;
    background: var(--interactive-color, #ff4444);
    margin-top: -4px;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.45);
    transition: transform 0.1s ease;
}
.itg-pip-volume-slider:hover::-webkit-slider-thumb,
.itg-pip-volume-slider:active::-webkit-slider-thumb {
    transform: scale(1.25);
}
.itg-pip-volume:hover .itg-pip-volume-slider,
.itg-pip-volume:focus-within .itg-pip-volume-slider {
    width: 64px; opacity: 1; margin: 0 6px 0 2px;
}

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
.itg-pip-comment-meta { display: flex; gap: 6px; align-items: center; font-size: 11px; color: rgba(255, 255, 255, 0.55); margin-top: 4px; }
.itg-pip-comment-vote {
    display: inline-flex; align-items: center; gap: 4px; padding: 3px 6px; border: 0;
    border-radius: 12px; background: rgba(255, 255, 255, 0.06); color: rgba(255, 255, 255, 0.75);
    font-size: 11px; cursor: pointer; transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
}
.itg-pip-comment-vote:hover {
    background: rgba(255, 255, 255, 0.16); color: #fff; transform: scale(1.05);
}
.itg-pip-comment-vote.is-voted {
    color: var(--interactive-color, #ff4444); background: rgba(255, 255, 255, 0.12); font-weight: 600;
}
.itg-pip-comment-vote .itg-pip-vote-icon {
    display: inline-flex; width: 13px; height: 13px; align-items: center; justify-content: center;
}
.itg-pip-comment-vote .itg-pip-vote-icon svg {
    width: 100%; height: 100%; display: block;
}
.itg-pip-comment-likes {
    font-variant-numeric: tabular-nums; font-size: 11px;
}
.itg-pip-comment-reply {
    border: 0; background: transparent; color: rgba(255, 255, 255, 0.75);
    font-size: 11px; padding: 2px 4px; cursor: pointer; text-decoration: underline; margin-left: 2px;
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
.itg-pip-more-wrap { position: relative; display: none; align-items: center; z-index: 50; }
.itg-pip-more-wrap:hover,
.itg-pip-more-wrap:focus-within { z-index: 100; }
.itg-pip-more-wrap::after {
    content: ''; position: absolute; bottom: 100%; left: 0; right: 0; height: 16px;
    pointer-events: none; z-index: 100;
}
.itg-pip-more-wrap:hover::after,
.itg-pip-more-wrap:focus-within::after {
    pointer-events: auto;
}
.itg-pip-more-menu {
    position: absolute; bottom: calc(100% + 4px); right: 0; left: auto;
    width: max-content; min-width: 190px; max-width: calc(100vw - 16px);
    padding: 8px 6px; border-radius: 10px;
    background: var(--bg-panel-color, rgba(20, 20, 20, 0.96));
    color: var(--text-color, #ffffff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(10px);
    opacity: 0; pointer-events: none; visibility: hidden; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
    z-index: 100;
    font-family: 'Roboto', system-ui, -apple-system, sans-serif;
}
.itg-pip-more-menu::after {
    content: ''; position: absolute; top: 100%; left: 0; right: 0; height: 16px;
    pointer-events: auto; z-index: 100;
}
.itg-pip-more-wrap:hover .itg-pip-more-menu,
.itg-pip-more-wrap:focus-within .itg-pip-more-menu,
.itg-pip-more-menu:hover,
.itg-pip-more-menu:focus-within {
    opacity: 1; pointer-events: auto; visibility: visible; transform: translateY(0);
}

.itg-pip-more-section-title {
    display: block; font-size: 11px; font-weight: 600; color: var(--text-color, rgba(255, 255, 255, 0.6));
    padding: 2px 6px 6px; text-transform: uppercase; letter-spacing: 0.05em; opacity: 0.8;
}
.itg-pip-more-speed-grid {
    display: grid; grid-template-columns: repeat(4, 1fr); gap: 3px; padding: 0 2px 4px;
}
.itg-pip-more-speed-btn {
    padding: 4px 0; border: 0; border-radius: 5px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
    color: var(--text-color, #ffffff); font-size: 11.5px; font-variant-numeric: tabular-nums; cursor: pointer;
    transition: background 0.15s ease, color 0.15s ease; text-align: center;
}
.itg-pip-more-speed-btn:hover {
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 18%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-pip-more-speed-btn.is-active {
    background: var(--interactive-color, #ff4444);
    color: #ffffff !important;
    font-weight: 600;
}
.itg-pip-more-speed-btn.is-active:hover {
    background: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}

.itg-pip-more-divider {
    height: 1px; margin: 6px 0; background: var(--border-color, rgba(255, 255, 255, 0.12));
}

.itg-pip-more-item {
    display: flex; align-items: center; gap: 8px; width: 100%; padding: 7px 8px;
    border: 0; border-radius: 6px; background: transparent; color: var(--text-color, #ffffff);
    font: inherit; font-size: 12px; cursor: pointer; text-align: left;
    transition: background 0.15s ease, color 0.15s ease;
}
.itg-pip-more-item:hover {
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 14%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-pip-more-item.is-on { color: var(--interactive-color, #ff4444); font-weight: 600; }
.itg-pip-more-item[hidden] { display: none; }
.itg-pip-more-icon { width: 16px; height: 16px; flex: 0 0 16px; display: flex; align-items: center; justify-content: center; }
.itg-pip-more-icon svg { width: 100%; height: 100%; }
.itg-pip-more-label { flex: 1 1 auto; white-space: nowrap; }

/* Responsive adjustments when player is narrow */
@media (max-width: 600px) {
    .itg-pip-btn[data-act='like'],
    .itg-pip-btn[data-act='dislike'] {
        display: none !important;
    }
}
@media (max-width: 520px) {
    .itg-pip-more-wrap { display: inline-flex; }
    .itg-pip-rate-wrap,
    .itg-pip-size-wrap,
    .itg-pip-loop-wrap,
    .itg-pip-btn[data-act='comments'],
    .itg-pip-btn[data-act='captions'] {
        display: none !important;
    }
}
@media (max-width: 480px) {
    .itg-pip-volume {
        position: relative;
        display: inline-flex;
        align-items: center;
        z-index: 50;
    }
    .itg-pip-volume:hover,
    .itg-pip-volume:focus-within { z-index: 100; }
    .itg-pip-volume::after {
        content: '';
        position: absolute;
        bottom: 100%;
        left: 0;
        right: 0;
        height: 16px;
        pointer-events: none;
        z-index: 100;
    }
    .itg-pip-volume:hover::after,
    .itg-pip-volume:focus-within::after {
        pointer-events: auto;
    }
    .itg-pip-volume-pop {
        position: absolute;
        bottom: calc(100% + 4px);
        left: 50%;
        transform: translateX(-50%) translateY(4px);
        width: 28px;
        height: 96px;
        padding: 0;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 8px;
        background: var(--bg-panel-color, rgba(20, 20, 20, 0.96));
        border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
        opacity: 0;
        visibility: hidden;
        pointer-events: none;
        z-index: 100;
        transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s ease;
    }
    .itg-pip-volume-pop::after {
        content: '';
        position: absolute;
        top: 100%;
        left: 0;
        right: 0;
        height: 16px;
        pointer-events: auto;
        z-index: 100;
    }
    .itg-pip-volume:hover .itg-pip-volume-pop,
    .itg-pip-volume:focus-within .itg-pip-volume-pop,
    .itg-pip-volume-pop:hover,
    .itg-pip-volume-pop:focus-within {
        opacity: 1;
        visibility: visible;
        pointer-events: auto;
        transform: translateX(-50%) translateY(0);
    }
    .itg-pip-volume-slider {
        width: 78px !important;
        height: 16px !important;
        opacity: 1 !important;
        margin: 0 !important;
        transform: rotate(-90deg);
        transform-origin: center center;
    }
}
@media (max-width: 400px) {
    .itg-pip-btn[data-act='rewind'],
    .itg-pip-btn[data-act='forward'] {
        display: none !important;
    }
    .itg-pip-time {
        font-size: 11px;
        padding: 0 4px;
    }
}
@media (min-width: 401px) {
    .itg-pip-more-rewind,
    .itg-pip-more-forward {
        display: none !important;
    }
}
`;

var ITG_LOOP_POPUP_STYLES = `
.itg-yt-loop-menu {
    position: fixed; z-index: 2147483647; width: 375px; max-width: calc(100vw - 16px); padding: 10px 10px 8px;
    border-radius: 12px;
    background: var(--bg-panel-color, rgba(20, 20, 24, 0.96));
    color: var(--text-color, #fff);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    box-shadow: 0 12px 36px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(255, 255, 255, 0.05);
    backdrop-filter: blur(16px) saturate(180%);
    font: 500 12px/1.35 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    opacity: 0; visibility: hidden; transform: translateY(4px);
    transition: opacity 0.15s ease, transform 0.15s ease, visibility 0.15s;
    pointer-events: none;
    box-sizing: border-box;
}
.itg-yt-loop-menu * { box-sizing: border-box; }
.itg-yt-loop-menu.is-open {
    opacity: 1; visibility: visible; transform: translateY(0);
    pointer-events: auto;
}
.itg-yt-loop-menu::after {
    content: ''; position: absolute; left: -12px; right: -12px; top: 100%; height: 20px;
}
.itg-yt-loop-menu[data-place='below']::after {
    top: auto; bottom: 100%;
}

.itg-loop-header {
    display: flex; align-items: center; justify-content: space-between; gap: 8px;
    margin-bottom: 7px; padding-bottom: 6px;
    border-bottom: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
}
.itg-loop-title {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 11px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.06em; color: var(--text-color, rgba(255, 255, 255, 0.9));
    transition: color 0.2s ease; white-space: nowrap;
}
.itg-loop-header.is-active .itg-loop-title,
.itg-loop-title.is-active {
    color: var(--text-on-color, #ffffff) !important;
}
.itg-loop-title-icon { width: 15px; height: 15px; display: flex; align-items: center; justify-content: center; color: var(--interactive-color, #ff4444); }
.itg-loop-title-icon svg { width: 100%; height: 100%; display: block; fill: currentColor; }

/* Sequence loop control bar (placed above the first loop) */
.itg-loop-sequence-bar {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    padding: 6px 8px; margin-bottom: 6px; border-radius: 7px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 4%, transparent);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    transition: all 0.2s ease;
    box-sizing: border-box; width: 100%; min-height: 33px;
}
.itg-loop-sequence-bar:not(.is-disabled):hover {
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
    border-color: var(--border-color, rgba(255, 255, 255, 0.2));
}
.itg-loop-sequence-bar.is-disabled {
    opacity: 0.4;
    filter: grayscale(0.6);
    cursor: not-allowed !important;
    background: color-mix(in srgb, var(--text-color, #ffffff) 2%, transparent);
    border-color: var(--border-color, rgba(255, 255, 255, 0.05));
}
.itg-loop-sequence-bar.is-disabled * {
    pointer-events: none !important;
    cursor: not-allowed !important;
}
.itg-loop-seq-info {
    display: inline-flex; align-items: center; gap: 6px;
    color: var(--text-color, #ffffff); user-select: none;
}
.itg-loop-seq-icon {
    width: 16px; height: 16px; display: flex; align-items: center; justify-content: center;
    color: var(--interactive-color, #ff4444); flex-shrink: 0;
}
.itg-loop-seq-icon svg {
    width: 13px; height: 13px; display: block;
}
.itg-loop-seq-label {
    font-size: 11px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; color: var(--text-color, rgba(255, 255, 255, 0.95));
    white-space: nowrap;
}
.itg-loop-seq-controls {
    display: inline-flex; align-items: center; gap: 3px; flex-shrink: 0;
}
.itg-loop-seq-count {
    width: 47px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: var(--bg-color, rgba(0, 0, 0, 0.25)); color: var(--text-color, #ffffff);
    font: inherit; font-size: 11px; font-weight: 600; text-align: center;
    outline: none; flex-shrink: 0; padding: 0 2px; font-variant-numeric: tabular-nums;
    -moz-appearance: textfield !important; appearance: textfield !important; box-sizing: border-box;
    caret-color: var(--interactive-color, #ff4444);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.itg-loop-seq-count::-webkit-outer-spin-button,
.itg-loop-seq-count::-webkit-inner-spin-button {
    -webkit-appearance: none !important; margin: 0 !important;
}
.itg-loop-seq-count:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 8%, var(--bg-color, #ffffff));
}
.itg-yt-loop-menu *::selection,
.itg-loop-seq-count::selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-yt-loop-menu *::-moz-selection,
.itg-loop-seq-count::-moz-selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-loop-seq-inf {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent); color: var(--text-color, rgba(255, 255, 255, 0.85));
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-seq-inf svg,
.itg-loop-row-inf svg {
    width: 14px; height: 14px; display: block;
}
.itg-loop-seq-inf:hover {
    border-color: var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 20%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-loop-seq-inf.is-active {
    background: var(--interactive-color, #ff4444) !important;
    border-color: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}

.itg-loop-list {
    display: flex; flex-direction: column; gap: 6px;
    max-height: 280px; overflow-y: auto; overflow-x: hidden;
    padding-right: 0; width: 100%; box-sizing: border-box;
    scrollbar-width: thin;
    scrollbar-color: var(--border-color, rgba(255, 255, 255, 0.25)) transparent;
}
.itg-loop-list::-webkit-scrollbar {
    width: 6px;
}
.itg-loop-list::-webkit-scrollbar-track {
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent);
    border-radius: 10px;
}
.itg-loop-list::-webkit-scrollbar-thumb {
    background-color: var(--border-color, rgba(255, 255, 255, 0.25));
    border-radius: 10px;
}
.itg-loop-list::-webkit-scrollbar-thumb:hover {
    background-color: var(--action-color, var(--interactive-color, #ff4444));
    cursor: pointer;
}

.itg-loop-row-item {
    display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-radius: 7px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 4%, transparent);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.1));
    transition: background 0.15s ease, border-color 0.15s ease, box-shadow 0.15s ease, opacity 0.2s ease;
    box-sizing: border-box; width: 100%; min-height: 56px;
}
.itg-loop-row-item:hover {
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
}
.itg-loop-row-item.is-active {
    background: color-mix(in srgb, var(--text-color, #ffffff) 10%, transparent);
    border-color: var(--interactive-color, #ff4444);
}
.itg-loop-row-item.is-playing {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 1.5px color-mix(in srgb, var(--interactive-color, #ff4444) 60%, transparent);
}
.itg-loop-row-item.is-disabled {
    opacity: 0.38;
    filter: grayscale(0.5);
    cursor: not-allowed !important;
}
.itg-loop-row-item.is-disabled * {
    pointer-events: none !important;
    cursor: not-allowed !important;
}

.itg-loop-row-num {
    font-size: 10.5px; font-weight: 700; color: var(--text-color, #ffffff);
    min-width: 20px; height: 44px; text-align: center; cursor: pointer; padding: 0 2px;
    border-radius: 5px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent);
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
    user-select: none; flex-shrink: 0; transition: all 0.15s ease;
    display: inline-flex; align-items: center; justify-content: center;
}
.itg-loop-row-num:hover,
.itg-loop-row-item.is-active .itg-loop-row-num {
    background: var(--interactive-color, #ff4444); color: #ffffff !important; border-color: var(--interactive-color, #ff4444);
}

.itg-loop-bar-column {
    flex: 1 1 auto; min-width: 90px;
    display: flex; flex-direction: column; justify-content: space-between; gap: 5px;
    padding: 0 4px; box-sizing: border-box;
}
.itg-loop-inputs-row {
    display: flex; align-items: center; justify-content: space-between; gap: 3px;
}
.itg-loop-time-input {
    flex: 1 1 0; min-width: 36px; height: 21px; padding: 1px 2px;
    border-radius: 4px; color: var(--text-color, #ffffff);
    font: inherit; font-size: 10.5px; font-weight: 500; font-variant-numeric: tabular-nums;
    text-align: center;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.2));
    background: var(--bg-color, rgba(0, 0, 0, 0.25)); outline: none;
    caret-color: var(--interactive-color, #ff4444);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
    box-sizing: border-box;
}
.itg-loop-time-input::selection,
.itg-loop-row-count::selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-loop-time-input::-moz-selection,
.itg-loop-row-count::-moz-selection {
    background: var(--interactive-color, #ff4444) !important;
    color: #ffffff !important;
}
.itg-loop-time-input:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 8%, var(--bg-color, #ffffff));
}
.itg-loop-time-sep {
    font-size: 10px; font-weight: bold; color: var(--text-color, rgba(255, 255, 255, 0.6));
    flex-shrink: 0; user-select: none; opacity: 0.6;
}

.itg-loop-bar-wrap {
    width: 100%; display: flex; flex-direction: column; justify-content: center;
    position: relative; cursor: pointer; padding: 5px 0; user-select: none;
    box-sizing: border-box;
}
.itg-loop-bar-track {
    position: relative; width: 100%; height: 5px;
    background: color-mix(in srgb, var(--text-color, #ffffff) 25%, transparent);
    border-radius: 3px;
}
.itg-loop-bar-fill {
    position: absolute; top: 0; bottom: 0;
    background: var(--interactive-color, #ff4444); border-radius: 3px;
    opacity: 0.95; pointer-events: none;
}
.itg-loop-bar-playhead {
    position: absolute; top: -4px; width: 2.5px; height: 13px;
    background: var(--text-color, #ffffff); border-radius: 1px; pointer-events: none;
    transform: translateX(-50%); z-index: 3;
    box-shadow: 0 0 3px color-mix(in srgb, var(--bg-panel-color, #000000) 80%, transparent);
}
.itg-loop-handle {
    position: absolute; top: 50%; transform: translate(-50%, -50%);
    width: 16px; height: 16px; border-radius: 50%;
    background: var(--bg-panel-color, #ffffff); color: var(--text-color, #111111);
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
    font-size: 9px; font-weight: 800; line-height: 1;
    display: inline-flex; align-items: center; justify-content: center; text-align: center;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.6); cursor: ew-resize;
    z-index: 4; transition: transform 0.1s ease, box-shadow 0.1s ease, background 0.15s ease, color 0.15s ease;
    user-select: none; box-sizing: border-box; outline: none;
    padding: 1px 0 0 0; margin: 0;
}
.itg-loop-handle:hover,
.itg-loop-handle:focus,
.itg-loop-handle:focus-visible,
.itg-loop-handle.is-dragging {
    transform: translate(-50%, -50%) scale(1.25);
    box-shadow: 0 0 0 2px var(--interactive-color, #ff4444);
    z-index: 5;
}
.itg-loop-handle-a { border: 2px solid var(--interactive-color, #ff4444); }
.itg-loop-handle-b { border: 2px solid var(--interactive-color, #ff4444); }

/* Right Buttons Column: 2 rows of buttons */
.itg-loop-btns-column {
    display: flex; flex-direction: column; gap: 4px; flex-shrink: 0;
}
.itg-loop-btns-row {
    display: flex; align-items: center; gap: 3px;
}
.itg-loop-btns-row-2 {
    justify-content: flex-end;
}

.itg-loop-btn-a,
.itg-loop-btn-b {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent); color: var(--text-color, #ffffff);
    font: 700 10.5px 'Roboto', sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-btn-a:hover,
.itg-loop-btn-b:hover {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}

.itg-loop-row-count {
    width: 47px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: var(--bg-color, rgba(0, 0, 0, 0.25)); color: var(--text-color, #ffffff);
    font: inherit; font-size: 11px; font-weight: 600; text-align: center;
    outline: none; flex-shrink: 0; padding: 0 2px; font-variant-numeric: tabular-nums;
    -moz-appearance: textfield !important; appearance: textfield !important; box-sizing: border-box;
    caret-color: var(--interactive-color, #ff4444);
    transition: border-color 0.15s ease, box-shadow 0.15s ease, background 0.15s ease;
}
.itg-loop-row-count::-webkit-outer-spin-button,
.itg-loop-row-count::-webkit-inner-spin-button {
    -webkit-appearance: none !important; margin: 0 !important;
}
.itg-loop-row-count:focus {
    border-color: var(--interactive-color, #ff4444);
    box-shadow: 0 0 0 2px color-mix(in srgb, var(--interactive-color, #ff4444) 35%, transparent);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 8%, var(--bg-color, #ffffff));
}

.itg-loop-row-inf {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.18));
    background: color-mix(in srgb, var(--text-color, #ffffff) 8%, transparent); color: var(--text-color, #ffffff);
    display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-inf:hover {
    border-color: var(--interactive-color, #ff4444);
    background: color-mix(in srgb, var(--interactive-color, #ff4444) 20%, transparent);
    color: var(--interactive-color, #ff4444);
}
.itg-loop-row-inf.is-active {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    color: #ffffff !important;
}

.itg-loop-row-reset {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px solid var(--border-color, rgba(255, 255, 255, 0.14));
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent); color: var(--text-color, rgba(255, 255, 255, 0.7));
    font: 12px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-reset:hover {
    color: #ffffff !important; border-color: var(--interactive-color, #ff4444);
    background: var(--interactive-color, #ff4444);
}

.itg-loop-row-del {
    width: 22px; height: 21px; border-radius: 4px; border: none;
    background: transparent; color: var(--text-color, rgba(255, 255, 255, 0.5));
    font: bold 12px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-del:hover {
    color: var(--error-color, #ff5555); background: color-mix(in srgb, var(--error-color, #ff5555) 15%, transparent);
}
.itg-loop-row-del:disabled,
.itg-loop-row-del.is-disabled {
    opacity: 0.28;
    cursor: not-allowed;
    pointer-events: none;
}

.itg-loop-row-add {
    width: 22px; height: 21px; border-radius: 4px;
    border: 1px dashed var(--border-color, rgba(255, 255, 255, 0.28));
    background: color-mix(in srgb, var(--text-color, #ffffff) 6%, transparent); color: var(--text-color, #ffffff);
    font: bold 13px system-ui, sans-serif; display: flex; align-items: center; justify-content: center;
    cursor: pointer; flex-shrink: 0; transition: all 0.15s ease; padding: 0;
}
.itg-loop-row-add:hover {
    background: var(--interactive-color, #ff4444);
    border-color: var(--interactive-color, #ff4444);
    border-style: solid; color: #ffffff !important;
}

.itg-loop-footer {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    margin-top: 6px; padding-top: 5px;
    border-top: 1px solid var(--border-color, rgba(255, 255, 255, 0.12));
}
.itg-loop-footer-status {
    flex: 1 1 0; min-width: 0; overflow: hidden;
}
.itg-loop-status {
    font-size: 10px; font-weight: 500;
    color: var(--interactive-color, #ff4444);
    font-variant-numeric: tabular-nums;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    display: block;
}
.itg-loop-footer-center {
    flex: 0 0 auto; display: flex; align-items: center; justify-content: center;
}
.itg-loop-video-time {
    font-size: 10.5px; font-weight: 500; font-variant-numeric: tabular-nums;
    color: var(--text-color, #ffffff); opacity: 0.85;
    letter-spacing: 0.2px; white-space: nowrap; user-select: none;
    background: transparent; padding: 0; border: none;
}
.itg-loop-footer-actions {
    flex: 1 1 0; display: inline-flex; align-items: center; justify-content: flex-end; gap: 6px; flex-shrink: 0;
}
.itg-loop-toggle-btn {
    border: 0; background: transparent;
    color: var(--text-color, #ffffff); opacity: 0.85;
    font: inherit; font-size: 10.5px; font-weight: 600;
    cursor: pointer; padding: 2px 3px; white-space: nowrap;
    text-decoration: underline; transition: opacity 0.15s ease, color 0.15s ease;
}
.itg-loop-toggle-btn:hover {
    opacity: 1; color: var(--interactive-color, #ff4444);
}
.itg-loop-toggle-btn.is-active {
    color: var(--interactive-color, #ff4444);
    opacity: 1; font-weight: 700;
}
.itg-loop-reset-all-btn {
    border: 0; background: transparent;
    color: var(--text-color, #ffffff); opacity: 0.7;
    font: inherit; font-size: 10.5px;
    cursor: pointer; padding: 2px 3px; white-space: nowrap;
    transition: opacity 0.15s ease, color 0.15s ease;
}
.itg-loop-reset-all-btn:hover {
    opacity: 1; color: var(--interactive-color, #ff4444);
}
`;

var ITG_INLINE_VOLUME_STYLES = `
.shortsLockupViewModelHostThumbnailParentContainer,
.shortsLockupViewModelHost,
ytm-shorts-lockup-view-model-v2,
ytm-shorts-lockup-view-model,
.ytThumbnailViewModelHost,
ytd-rich-item-renderer,
ytd-rich-grid-slim-media,
ytd-reel-item-renderer {
    position: relative !important;
}
.itg-yt-short-volume-btn {
    position: absolute !important;
    right: 12px !important;
    bottom: 12px !important;
    left: auto !important;
    top: auto !important;
    z-index: 2147483647 !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    width: 36px !important;
    height: 36px !important;
    padding: 0 !important;
    margin: 0 !important;
    border: none !important;
    outline: none !important;
    background: rgba(0, 0, 0, 0.7) !important;
    backdrop-filter: blur(8px) !important;
    -webkit-backdrop-filter: blur(8px) !important;
    border-radius: 50% !important;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5) !important;
    color: #ffffff !important;
    cursor: pointer !important;
    opacity: 0 !important;
    visibility: hidden !important;
    pointer-events: none !important;
    user-select: none !important;
    box-sizing: border-box !important;
    transition: opacity 0.2s ease, visibility 0.2s ease, background-color 0.2s ease, transform 0.15s ease !important;
}
ytm-shorts-lockup-view-model-v2:hover .itg-yt-short-volume-btn,
ytm-shorts-lockup-view-model:hover .itg-yt-short-volume-btn,
.shortsLockupViewModelHost:hover .itg-yt-short-volume-btn,
.shortsLockupViewModelHostThumbnailParentContainer:hover .itg-yt-short-volume-btn,
ytd-rich-item-renderer:hover .itg-yt-short-volume-btn,
ytd-rich-grid-slim-media:hover .itg-yt-short-volume-btn,
ytd-reel-item-renderer:hover .itg-yt-short-volume-btn,
.html5-video-player:hover .itg-yt-short-volume-btn,
#inline-preview-player:hover .itg-yt-short-volume-btn,
ytd-video-preview:hover .itg-yt-short-volume-btn,
#video-preview-container:hover .itg-yt-short-volume-btn,
#player-container:hover .itg-yt-short-volume-btn,
ytd-player:hover .itg-yt-short-volume-btn,
.itg-yt-short-volume-btn:hover,
.itg-yt-short-volume-btn:focus-within {
    opacity: 1 !important;
    visibility: visible !important;
    pointer-events: auto !important;
}
.itg-yt-short-volume-btn:hover {
    background-color: rgba(0, 0, 0, 0.9) !important;
    transform: scale(1.08) !important;
}
.itg-yt-short-volume-btn:active {
    transform: scale(0.95) !important;
}
.itg-yt-short-volume-btn .itg-yt-short-volume-icon,
.itg-yt-short-volume-btn .ytdVolumeControlsMuteIcon,
.itg-yt-short-volume-btn .ytIconWrapperHost,
.itg-yt-short-volume-btn .ytSpecIconShapeHost,
.itg-yt-short-volume-btn .itg-yt-spec-icon-wrapper {
    width: 22px !important;
    height: 22px !important;
    display: flex !important;
    align-items: center !important;
    justify-content: center !important;
    pointer-events: none !important;
}
.itg-yt-short-volume-btn svg {
    width: 22px !important;
    height: 22px !important;
    display: block !important;
    pointer-events: none !important;
    fill: #ffffff !important;
}
`;
