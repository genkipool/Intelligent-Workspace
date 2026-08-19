/**
 * [AI INSTRUCTION]
 * DOWNLOADS HANDLER — Manages file downloading operations.
 */

function handleGetDownloadableFiles(message, sendResponse) {
    findFilesOnPage(message.url)
        .then((response) => {
            sendResponse(response);
        })
        .catch((error) => {
            sendResponse({
                success: false,
                error: error.message,
            });
        });
}

function handleDownloadFilesBatch(message, sendResponse) {
    (async () => {
        if (message.files && Array.isArray(message.files)) {
            for (const file of message.files) {
                try {
                    await chrome.downloads.download({
                        url: file.url,
                        filename: file.name,
                    });
                } catch (e) {
                    console.error(`Error trying to download ${file.name} from ${file.url}:`, e);
                }
            }
        }
        sendResponse({
            status: 'downloads_initiated',
        });
    })();
}

function handleGetDownloads(message, sendResponse) {
    const query = {
        orderBy: ['-startTime'],
    };
    if (message.query) {
        query.query = [message.query];
    }
    if (message.state) {
        query.state = message.state;
    }
    if (message.limit) {
        query.limit = message.limit;
    }

    chrome.downloads.search(query, (results) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true, results: results || [] });
        }
    });
}

function handlePauseDownload(message, sendResponse) {
    if (!message.id) {
        sendResponse({ success: false, error: 'No download ID provided' });
        return;
    }
    chrome.downloads.pause(message.id, () => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true });
        }
    });
}

function handleResumeDownload(message, sendResponse) {
    if (!message.id) {
        sendResponse({ success: false, error: 'No download ID provided' });
        return;
    }
    chrome.downloads.resume(message.id, () => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true });
        }
    });
}

function handleCancelDownload(message, sendResponse) {
    if (!message.id) {
        sendResponse({ success: false, error: 'No download ID provided' });
        return;
    }
    chrome.downloads.cancel(message.id, () => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true });
        }
    });
}

function handleEraseDownload(message, sendResponse) {
    const query = {};
    if (message.id) {
        query.id = message.id;
    }
    chrome.downloads.erase(query, (erasedIds) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true, erasedIds });
        }
    });
}

function handleEraseAllDownloads(message, sendResponse) {
    chrome.downloads.erase({}, (erasedIds) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true, erasedIds });
        }
    });
}

function handleOpenDownload(message, sendResponse) {
    if (!message.id) {
        sendResponse({ success: false, error: 'No download ID provided' });
        return;
    }
    try {
        chrome.downloads.open(message.id);
        sendResponse({ success: true });
    } catch {
        // Fallback to show in folder
        try {
            chrome.downloads.show(message.id);
            sendResponse({ success: true, fallbackShow: true });
        } catch (err) {
            sendResponse({ success: false, error: err.message });
        }
    }
}

function handleShowDownloadFile(message, sendResponse) {
    if (!message.id) {
        sendResponse({ success: false, error: 'No download ID provided' });
        return;
    }
    try {
        chrome.downloads.show(message.id);
        sendResponse({ success: true });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

function handleOpenDownloadsFolder(message, sendResponse) {
    try {
        chrome.downloads.showDefaultFolder();
        sendResponse({ success: true });
    } catch (e) {
        sendResponse({ success: false, error: e.message });
    }
}

function handleRetryDownload(message, sendResponse) {
    if (!message.url) {
        sendResponse({ success: false, error: 'No URL provided' });
        return;
    }
    const options = {
        url: message.url,
    };
    if (message.filename) {
        options.filename = message.filename;
    }
    chrome.downloads.download(options, (downloadId) => {
        if (chrome.runtime.lastError) {
            sendResponse({ success: false, error: chrome.runtime.lastError.message });
        } else {
            sendResponse({ success: true, downloadId });
        }
    });
}
