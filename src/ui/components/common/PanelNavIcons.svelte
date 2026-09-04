<!--
    [AI INSTRUCTION]
    THE FIVE GLYPHS OF A SIDE-PANEL HEADER.

    Pin, group list, home, back — the row of buttons `sidePanelNav.js` builds — plus
    the arrow that opens the page in a full tab. Every side-panel page carries the
    same four buttons, so every one of them needs the same five symbols; they lived
    in the web activity page's own sprite and were about to be copied into the
    pomodoro panel's, which is how one header becomes two.

    Mounted once per page next to whatever page-specific sprite it has; everything
    else points at a symbol with `<use href="#panel-...">`.
-->
<svg style="display: none" aria-hidden="true">
    <defs>
        <symbol id="panel-pin" viewBox="0 0 24 24">
            <g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="4"></circle>
                <path d="M12 8v18"></path>
            </g>
        </symbol>
        <symbol id="panel-list-group" viewBox="0 0 512 512">
            <path
                fill="currentColor"
                d="M136 24H16v120h120Zm-32 88H48V56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm32 88H16v120h120Zm-32 88H48v-56h56Zm72-440.002h320v32H176zm0 88h256v32H176zm0 88h320v32H176zm0 88h256v32H176zm0 176h256v32H176zm0-88h320v32H176z"
            ></path>
        </symbol>
        <symbol id="panel-home" viewBox="2 2 20 20">
            <path
                fill="currentColor"
                fill-rule="evenodd"
                clip-rule="evenodd"
                d="m12 3.188 9.45 7.087-.45 1.35h-.75v8.625H3.75v-8.625H3l-.45-1.35zm-6.75 6.937v8.625h13.5v-8.625L12 5.063z"
            ></path>
        </symbol>
        <symbol id="panel-back" viewBox="0 0 24 24">
            <path
                d="M15 20l-8-8 8-8"
                stroke="currentColor"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
                fill="none"
            />
        </symbol>
        <symbol id="panel-resize" viewBox="1.5 1.5 21 21">
            <path
                d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6m4-3h6v6m-11 5L21 3"
                fill="none"
                stroke="currentColor"
                stroke-width="1.6"
                stroke-linecap="round"
                stroke-linejoin="round"
            />
        </symbol>
    </defs>
</svg>
