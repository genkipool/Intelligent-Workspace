<script>
    import { t } from '../../../stores/i18nStore.js';
</script>

<section class="permissions-section card">
    <h3>{$t('permissionsUsed')}</h3>
    <p>{$t('permissionsNotice')}</p>
    <p></p>
    <ul>
        <li><strong translate="no">tabs:</strong> <span>{$t('permTabs')}</span></li>
        <li><strong translate="no">tabGroups:</strong> <span>{$t('permTabGroups')}</span></li>
        <li><strong translate="no">storage:</strong> <span>{$t('permStorage')}</span></li>
        <li><strong translate="no">favicon:</strong> <span>{$t('permFavicon')}</span></li>
        <li><strong translate="no">commands:</strong> <span>{$t('permCommandsDesc')}</span></li>
        <li><strong translate="no">contextMenus:</strong> <span>{$t('permContextMenus')}</span></li>
        <li><strong translate="no">notifications:</strong> <span>{$t('permNotifications')}</span></li>
        <li><strong translate="no">sidePanel:</strong> <span>{$t('permSidePanel')}</span></li>
        <li><strong translate="no">scripting:</strong> <span>{$t('permScripting')}</span></li>
        <li><strong translate="no">downloads:</strong> <span>{$t('permDownloads')}</span></li>
        <li><strong translate="no">system.display:</strong> <span>{$t('permSystemDisplay')}</span></li>
        <li><strong translate="no">windows:</strong> <span>{$t('permWindows')}</span></li>
        <li>
            <strong translate="no">declarativeNetRequestWithHostAccess:</strong>
            <span>{$t('permDeclarativeNetRequestWithHostAccess')}</span>
        </li>
        <li><strong translate="no">cookies:</strong> <span>{$t('permCookies')}</span></li>
        <li><strong translate="no">history:</strong> <span>{$t('permHistory')}</span></li>
        <li><strong translate="no">sessions:</strong> <span>{$t('permSessions')}</span></li>
        <li><strong translate="no">bookmarks:</strong> <span>{$t('permBookmarks')}</span></li>
        <li><strong translate="no">readingList:</strong> <span>{$t('permReadingList')}</span></li>
        <li><strong translate="no">clipboardWrite:</strong> <span>{$t('permClipboardWrite')}</span></li>
        <li><strong translate="no">alarms:</strong> <span>{$t('permAlarms')}</span></li>
        <li><strong translate="no">offscreen:</strong> <span>{$t('permOffscreen')}</span></li>
        <li><strong translate="no">idle:</strong> <span>{$t('permIdle')}</span></li>
    </ul>

    <p>{$t('privacyCommitment')}</p>
</section>
