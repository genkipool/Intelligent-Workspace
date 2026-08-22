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
