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
        <symbol id="panel-resize" viewBox="0 0 24 24">
            <path
                fill="currentColor"
                fill-rule="nonzero"
                d="M19,19 L5,19 L5,5 L12,5 L12,3 L5,3 C3.89,3 3,3.9 3,5 L3,19 C3,20.1 3.89,21 5,21 L19,21 C20.1,21 21,20.1 21,19 L21,12 L19,12 L19,19 Z M14,3 L14,5 L17.59,5 L7.76,14.83 L9.17,16.24 L19,6.41 L19,10 L21,10 L21,3 L14,3 Z"
            ></path>
        </symbol>
    </defs>
</svg>
