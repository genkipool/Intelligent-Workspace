<script>
    import { t } from '../../../stores/i18nStore.js';

    /** Every permission in manifest.json, with the message that explains it. */
    const PERMISSIONS = [
        ['tabs', 'permTabs'],
        ['tabGroups', 'permTabGroups'],
        ['storage', 'permStorage'],
        ['favicon', 'permFavicon'],
        ['contextMenus', 'permContextMenus'],
        ['notifications', 'permNotifications'],
        ['sidePanel', 'permSidePanel'],
        ['scripting', 'permScripting'],
        ['downloads', 'permDownloads'],
        ['downloads.open', 'permDownloadsOpen'],
        ['system.display', 'permSystemDisplay'],
        ['declarativeNetRequestWithHostAccess', 'permDeclarativeNetRequestWithHostAccess'],
        ['cookies', 'permCookies'],
        ['history', 'permHistory'],
        ['sessions', 'permSessions'],
        ['bookmarks', 'permBookmarks'],
        ['readingList', 'permReadingList'],
        ['clipboardWrite', 'permClipboardWrite'],
        ['alarms', 'permAlarms'],
        ['offscreen', 'permOffscreen'],
        ['idle', 'permIdle'],
        ['<all_urls>', 'permAllUrls'],
    ];
</script>

<section class="permissions-section card">
    <h3>{$t('permissionsUsed')}</h3>
    <p>{$t('permissionsNotice')}</p>
    <p></p>
    <ul>
        {#each PERMISSIONS as [name, messageKey] (name)}
            <li><strong translate="no">{name}:</strong> <span>{$t(messageKey)}</span></li>
        {/each}
    </ul>

    <p>{$t('privacyCommitment')}</p>
</section>
