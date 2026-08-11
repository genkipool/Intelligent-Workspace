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
