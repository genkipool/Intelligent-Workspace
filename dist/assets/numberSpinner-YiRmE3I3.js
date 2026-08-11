var e=`dynamic-spinner-styles`;function t(e){return`url("data:image/svg+xml,<svg viewBox='0 0 1024 1024' xmlns='http://www.w3.org/2000/svg'><path fill='${e.replace(`#`,`%23`)}' d='m620.6 562.3 36.2 36.2L512 743.3 367.2 598.5l36.2-36.2L512 670.9zM512 353.1l108.6 108.6 36.2-36.2L512 280.7 367.2 425.5l36.2 36.2z'/></svg>")`}function n(){let n=getComputedStyle(document.documentElement).getPropertyValue(`--text-on-color`).trim();if(!n)return!1;let r=document.getElementById(e);return r||(r=document.createElement(`style`),r.id=e,document.head.appendChild(r)),r.textContent=`
        input[type="number"]::-webkit-inner-spin-button,
        input[type="number"]::-webkit-outer-spin-button {
            background-image: ${t(n)};
        }
    `,!0}function r(){n();let e=new MutationObserver(()=>n());return e.observe(document.documentElement,{attributes:!0,attributeFilter:[`data-theme`,`style`]}),()=>e.disconnect()}export{r as t};