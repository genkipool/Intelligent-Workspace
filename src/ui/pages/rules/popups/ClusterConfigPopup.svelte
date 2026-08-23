<script>
    import AnchoredPopup from './AnchoredPopup.svelte';
    import { defaultClusterConfig } from '../modules/clusterDefaults.js';
    import ClusterConfigSection from './ClusterConfigSection.svelte';

    let {
        show = false,
        trigger = null,
        clusterConfig = $bindable(defaultClusterConfig()),
        onclose,
        onreset,
        onchange,
    } = $props();
</script>

<!--
    Alone among these popups this one owns a sub-popup — the colour picker on each
    named grouping — and that renders outside its box. So a click on the picker, or on
    the indicator that opens it, still counts as inside, and the first Escape belongs
    to the picker rather than to this panel.
-->
<AnchoredPopup
    {show}
    {trigger}
    {onclose}
    class="cluster-config-popup"
    keepOpenFor=".color-popup, .cluster-color-indicator"
    deferEscape=".color-popup"
>
    <ClusterConfigSection bind:clusterConfig {onchange} {onreset} />
</AnchoredPopup>
