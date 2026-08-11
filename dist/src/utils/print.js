chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'injectContentForPrinting') {
        const contentDiv = document.getElementById('content');
        if (contentDiv) {
            if (request.title) {
                document.title = request.title;
            }
            contentDiv.innerHTML = request.htmlContent;
            window.print();
            chrome.runtime.sendMessage({ action: 'printingComplete' });
        }
    }
});
