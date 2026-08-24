<!--
    The icon sprite for this page. Mounted once; everything else refers to a symbol
    with `<use href="#wa-...">`, so an icon used in four places is parsed once.

    It is deliberately not the extension-wide `components/Icons.svelte`: that one is
    60 KB of symbols and this page needs a dozen.
-->
<svg style="display: none" aria-hidden="true">
    <defs>
        <symbol id="wa-activity" viewBox="0 0 24 24">
            <path
                d="M3 12h4l3 8 4-16 3 8h4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-export" viewBox="0 0 24 24">
            <path
                d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-import" viewBox="0 0 24 24">
            <path
                d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 10l-5-5-5 5M12 5v12"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-refresh" viewBox="0 0 24 24">
            <path
                d="M1 4v6h6M23 20v-6h-6M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4-4.64 4.36A9 9 0 0 1 3.51 15"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-search" viewBox="0 0 24 24">
            <circle cx="11" cy="11" r="8" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="m21 21-4.35-4.35" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </symbol>
        <symbol id="wa-trash" viewBox="0 0 24 24">
            <path
                d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-clock" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M12 6v6l4 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </symbol>
        <symbol id="wa-lock" viewBox="0 0 24 24">
            <rect
                x="4"
                y="10"
                width="16"
                height="10"
                rx="2"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
            />
            <path
                d="M8 10V7a4 4 0 0 1 8 0v3"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
        </symbol>
        <symbol id="wa-shield" viewBox="0 0 24 24">
            <path
                d="M12 3l7 3v6c0 4.5-3 8-7 9-4-1-7-4.5-7-9V6z"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
            />
            <path d="M9 12h6" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </symbol>
        <symbol id="wa-plus" viewBox="0 0 24 24">
            <path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </symbol>
        <symbol id="wa-edit" viewBox="0 0 24 24">
            <path
                d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
            <path
                d="m15 5 4 4"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-close" viewBox="0 0 24 24">
            <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </symbol>
        <symbol id="wa-alert" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M12 7v6M12 16.5v.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
        </symbol>
        <symbol id="wa-columns" viewBox="0 0 24 24">
            <path
                d="M4 5h16v14H4zM10 5v14M15 5v14"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-settings" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2" />
            <path
                d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
        <symbol id="wa-gauge" viewBox="0 0 24 24">
            <path
                d="M3.5 18a9 9 0 1 1 17 0"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
            <path d="M12 14.5 16 9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <circle cx="12" cy="15.5" r="1.6" fill="currentColor" />
        </symbol>
        <symbol id="wa-snooze" viewBox="0 0 24 24">
            <circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2" />
            <path
                d="M10 10.5h4l-4 5h4"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
            <path
                d="M4.5 4.5 7 6M19.5 4.5 17 6"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
        </symbol>
        <symbol id="wa-power" viewBox="0 0 24 24">
            <path d="M12 3v9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            <path
                d="M7.5 6.4a8 8 0 1 0 9 0"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
            />
        </symbol>
        <!--
            The resize and expand-all glyphs are the extension's own, copied from
            `rules/icons.html` and `components/Icons.svelte` rather than drawn again:
            the side panel puts them in the same row as those pages do, and two
            drawings of the same button is how a product stops looking like one.
            `wa-collapse-all` is the same path, flipped, for the other half of the
            fold — that pair does not exist in the sprite, which uses one icon and an
            `aria-pressed` state.
        -->
        <!--
            The four header glyphs, copied from `rules/icons.html` and
            `components/Icons.svelte`: this page's header is that page's header, so it
            has to be the same drawings and not a second set that looks nearly right.
        -->
        <symbol id="wa-pin" viewBox="0 0 24 24">
            <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="4"></circle>
                <path d="M12 8v18"></path>
            </g>
        </symbol>
        <symbol id="wa-list-group" viewBox="0 0 512 512">
            <path
                fill="currentColor"
                d="M136 24H16v120h120Zm-32 88H48V56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm72-440.002h320v32H176zm0 88h256v32H176zm0 88h320v32H176zm0 88h256v32H176zm0 176h256v32H176zm0-88h320v32H176z"
            ></path>
        </symbol>
        <symbol id="wa-home" viewBox="2 2 20 20">
            <path
                fill="currentColor"
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="m12 3.188 9.45 7.087-.45 1.35h-.75v8.625H3.75v-8.625H3l-.45-1.35zm-6.75 6.937v8.625h13.5v-8.625L12 5.063z"
            ></path>
        </symbol>
        <symbol id="wa-back" viewBox="0 0 24 24">
            <path
                d="M15 20l-8-8 8-8"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            />
        </symbol>
        <symbol id="wa-resize" viewBox="0 0 24 24">
            <path
                fill="currentColor"
                fill-rule="nonzero"
                d="M19,19 L5,19 L5,5 L12,5 L12,3 L5,3 C3.89,3 3,3.9 3,5 L3,19 C3,20.1 3.89,21 5,21 L19,21 C20.1,21 21,20.1 21,19 L21,12 L19,12 L19,19 Z M14,3 L14,5 L17.59,5 L7.76,14.83 L9.17,16.24 L19,6.41 L19,10 L21,10 L21,3 L14,3 Z"
            ></path>
        </symbol>
        <symbol id="wa-expand-all" viewBox="0 0 32 32">
            <path
                fill="currentColor"
                d="M12 10h14a2.003 2.003 0 0 0 2-2V4a2.003 2.003 0 0 0-2-2H12a2.003 2.003 0 0 0-2 2v1H6V2H4v23a2.003 2.003 0 0 0 2 2h4v1a2.003 2.003 0 0 0 2 2h14a2.003 2.003 0 0 0 2-2v-4a2.003 2.003 0 0 0-2-2H12a2.003 2.003 0 0 0-2 2v1H6v-8h4v1a2.003 2.003 0 0 0 2 2h14a2.003 2.003 0 0 0 2-2v-4a2.003 2.003 0 0 0-2-2H12a2.003 2.003 0 0 0-2 2v1H6V7h4v1a2.003 2.003 0 0 0 2 2m0-6h14l.001 4H12Zm0 20h14l.001 4H12Zm0-10h14l.001 4H12Z"
            ></path>
        </symbol>
        <symbol id="wa-collapse-all" viewBox="0 0 32 32">
            <path
                fill="currentColor"
                transform="translate(32 0) scale(-1 1)"
                d="M12 10h14a2.003 2.003 0 0 0 2-2V4a2.003 2.003 0 0 0-2-2H12a2.003 2.003 0 0 0-2 2v1H6V2H4v23a2.003 2.003 0 0 0 2 2h4v1a2.003 2.003 0 0 0 2 2h14a2.003 2.003 0 0 0 2-2v-4a2.003 2.003 0 0 0-2-2H12a2.003 2.003 0 0 0-2 2v1H6v-8h4v1a2.003 2.003 0 0 0 2 2h14a2.003 2.003 0 0 0 2-2v-4a2.003 2.003 0 0 0-2-2H12a2.003 2.003 0 0 0-2 2v1H6V7h4v1a2.003 2.003 0 0 0 2 2m0-6h14l.001 4H12Zm0 20h14l.001 4H12Zm0-10h14l.001 4H12Z"
            ></path>
        </symbol>
        <symbol id="wa-chevron" viewBox="0 0 24 24">
            <path
                d="m6 9 6 6 6-6"
                fill="none"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
    </defs>
</svg>
