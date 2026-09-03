import { initializeTranslations } from '../../../utils/i18n.js';
import { initializeActiveTheme } from '../../../utils/theme.js';
import { showAddToRuleModal } from '../../services/bookmarksService.js';
import { initializeAllEvents } from './listGroupInit.js';
import { initPomodoro } from './features/pomodoro/index.js';

export { initPomodoro };

export async function initListGroup() {
    await initializeAllEvents();
}

chrome.runtime.onMessage.addListener((request) => {
    if (request.action === 'themeChanged' || request.action === 'languageChanged') {
        (async () => {
            await initializeActiveTheme();
            await initializeTranslations();
        })();
    }
    if (request.action === 'open-add-to-rule-modal-shortcut') {
        showAddToRuleModal(request.url, request.title || '');
    }
});
