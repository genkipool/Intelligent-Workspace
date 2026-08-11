<script>
    import { notificationStore } from '../../stores/notificationStore.js';

    let { visible, message, type, key } = $derived($notificationStore);
</script>

{#key key}
    {#if visible}
        <div
            class="notification"
            class:notification-error={type === 'error'}
            class:notification-success={type !== 'error'}
            onmouseenter={() => notificationStore.pause()}
            onmouseleave={() => notificationStore.resume()}
        >
            {message}
        </div>
    {/if}
{/key}
