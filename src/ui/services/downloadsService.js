import { get } from 'svelte/store';

import { applyTranslations, showNotification } from '../../utils/i18n.js';

import { currentDownloadModal, currentColorPopup } from '../stores/appStore.svelte.js';

import { closeColorPopup } from './groupsService.js';
import { handleGeminiQuery } from './geminiService.js';

export async function showDownloadPopup(button, url) {
    if (get(currentDownloadModal)) closeDownloadModal();
    if (get(currentColorPopup)) closeColorPopup();
    if (button.classList.contains('loading')) return;

    button.classList.add('loading');

    try {
        const response = await chrome.runtime.sendMessage({ action: 'getDownloadableFiles', url: url });

        if (chrome.runtime.lastError) throw new Error(chrome.runtime.lastError.message);
        if (!response.success) throw new Error(response.error || 'Unknown error');

        const files = response.files;
        if (!files || files.length === 0) {
            showNotification('noDownloadsAvailable', true);
            return;
        }

        const _downloadPopupTemplate = document.getElementById('download-popup-template');
        const _downloadFilterButtonTemplate = document.getElementById('download-filter-button-template');
        const _downloadItemTemplate = document.getElementById('download-item-template');

        if (!_downloadPopupTemplate || !_downloadFilterButtonTemplate || !_downloadItemTemplate) return;

        const modalOverlay = _downloadPopupTemplate.content.cloneNode(true).firstElementChild;
        const modal = modalOverlay.querySelector('.download-modal-content');
        const listContainer = modal.querySelector('.download-list');
        const filterContainer = modal.querySelector('.download-filter-container');
        const downloadBtn = modal.querySelector('.download-action-btn');
        const selectAllBtn = modal.querySelector('.select-all-btn');
        const closeModalBtn = modal.querySelector('.close-modal-btn');

        const extensions = [
            ...new Set(
                files
                    .map((file) => {
                        const parts = file.name.split('.');
                        return parts.length > 1 ? `.${parts.pop().toLowerCase()}` : '';
                    })
                    .filter((ext) => ext),
            ),
        ];

        const allBtn = _downloadFilterButtonTemplate.content.cloneNode(true).firstElementChild;
        allBtn.textContent = chrome.i18n.getMessage('all') || 'All';
        allBtn.classList.add('active');
        allBtn.dataset.filter = '*';
        filterContainer.appendChild(allBtn);

        extensions.forEach((ext) => {
            const filterBtn = _downloadFilterButtonTemplate.content.cloneNode(true).firstElementChild;
            filterBtn.textContent = ext.toUpperCase();
            filterBtn.dataset.filter = ext;
            filterContainer.appendChild(filterBtn);
        });

        files.forEach((file) => {
            const item = _downloadItemTemplate.content.cloneNode(true).firstElementChild;
            const extension = file.name.includes('.') ? `.${file.name.split('.').pop().toLowerCase()}` : '';
            item.dataset.extension = extension;
            item.dataset.url = file.url;
            item.dataset.name = file.name;

            const filenameEl = item.querySelector('.download-filename');
            filenameEl.textContent = file.name;
            filenameEl.title = file.name;

            item.querySelector('.download-file-extension').textContent = extension.replace('.', '').toUpperCase();
            item.classList.add('selected');
            listContainer.appendChild(item);

            item.addEventListener('click', () => {
                item.classList.toggle('selected');
                updateModalUI(modal);
            });
        });

        closeModalBtn.addEventListener('click', closeDownloadModal);

        let mouseDownOnOverlay = false;
        modalOverlay.addEventListener('mousedown', (e) => {
            if (e.target === modalOverlay) {
                mouseDownOnOverlay = true;
            }
        });

        modalOverlay.addEventListener('mouseup', (e) => {
            if (e.target === modalOverlay && mouseDownOnOverlay) {
                closeDownloadModal();
            }
            mouseDownOnOverlay = false;
        });

        filterContainer.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-btn')) {
                const filter = e.target.dataset.filter;
                filterContainer.querySelector('.active').classList.remove('active');
                e.target.classList.add('active');

                let hasVisibleFiles = false;
                listContainer.querySelectorAll('.download-item').forEach((item) => {
                    const isVisible = filter === '*' || item.dataset.extension === filter;
                    item.classList.toggle('hidden', !isVisible);
                    if (isVisible) hasVisibleFiles = true;
                });
                const noFilesMessage = modal.querySelector('.no-files-filtered-message');
                if (noFilesMessage) noFilesMessage.classList.toggle('hidden', hasVisibleFiles);
                updateModalUI(modal);
            }
        });

        selectAllBtn.addEventListener('click', () => {
            const visibleItems = [...listContainer.querySelectorAll('.download-item:not(.hidden)')];
            const allSelected = visibleItems.every((item) => item.classList.contains('selected'));

            visibleItems.forEach((item) => {
                item.classList.toggle('selected', !allSelected);
            });
            updateModalUI(modal);
        });

        downloadBtn.addEventListener('click', () => {
            const selectedItems = [...listContainer.querySelectorAll('.download-item.selected')];
            const filesToDownload = selectedItems.map((item) => ({ url: item.dataset.url, name: item.dataset.name }));

            if (filesToDownload.length > 0) {
                downloadFiles(filesToDownload);
                closeDownloadModal();
            }
        });

        document.body.appendChild(modalOverlay);
        currentDownloadModal.set(modalOverlay);
        updateModalUI(modal);
        applyTranslations();
    } catch (error) {
        console.error('Error fetching downloadable files:', error);
        showNotification('errorFetchingDownloads', true);
    } finally {
        button.classList.remove('loading');
    }
}

export function updateModalUI(modal) {
    if (!modal) return;
    const listContainer = modal.querySelector('.download-list');
    const downloadBtn = modal.querySelector('.download-action-btn');
    const selectAllBtn = modal.querySelector('.select-all-btn');

    const visibleItems = [...listContainer.querySelectorAll('.download-item:not(.hidden)')];
    const selectedItems = visibleItems.filter((item) => item.classList.contains('selected'));

    downloadBtn.disabled = selectedItems.length === 0;
    const downloadTextSpan = downloadBtn.querySelector('span');
    const downloadText = chrome.i18n.getMessage('download') || 'Download';
    downloadTextSpan.textContent = `${downloadText} (${selectedItems.length})`;

    if (visibleItems.length > 0 && selectedItems.length === visibleItems.length) {
        selectAllBtn.textContent = chrome.i18n.getMessage('deselectAll') || 'Deselect All';
    } else {
        selectAllBtn.textContent = chrome.i18n.getMessage('selectAll') || 'Select All';
    }
}

export function closeDownloadModal() {
    const modal = get(currentDownloadModal);
    if (modal) {
        modal.remove();
        currentDownloadModal.set(null);
    }
}

export async function handleGeminiSummaryRequest(url) {
    if (!url || !url.startsWith('http')) {
        showNotification('geminiInvalidUrlForSummary', true);
        return;
    }

    const promptTemplate = chrome.i18n.getMessage('geminiSummaryPrompt');

    const prompt = promptTemplate.replace('{url}', url);

    await handleGeminiQuery(prompt);
}

export async function downloadFiles(filesToDownload) {
    if (!filesToDownload || filesToDownload.length === 0) return;

    try {
        await chrome.runtime.sendMessage({
            action: 'downloadFilesBatch',
            files: filesToDownload,
        });

        showNotification('downloadsStarted', false, [filesToDownload.length]);
    } catch (error) {
        console.error('Error sending download request to background script:', error);
        showNotification('errorStartingDownload', true);
    }
}
