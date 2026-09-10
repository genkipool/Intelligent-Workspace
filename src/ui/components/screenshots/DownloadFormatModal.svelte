<script>
    /**
     * Re-export of shared DownloadFormatModal for backwards compatibility.
     */
    import DownloadFormatModal from '../common/DownloadFormatModal.svelte';

    let props = $props();
</script>

<DownloadFormatModal {...props} />
