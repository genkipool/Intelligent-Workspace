if (window.self !== window.top) {
    const extensionOrigin = chrome.runtime.getURL('').slice(0, -1);

    // STATE: Maintains the list of results and the current index
    let iframeSearchState = {
        results: [],
        currentIndex: -1,
    };

    // STYLES: Defines styles for highlights
    const highlightStyle = {
        backgroundColor: '#007bff', // Blue for normal matches
        color: 'white',
        borderRadius: '2px',
    };
    const currentHighlightStyle = {
        backgroundColor: '#ff9800', // Orange for the active match
        color: 'black',
        outline: '2px solid #c56200',
    };

    function unhighlight(container) {
        const highlights = container.querySelectorAll('span.search-highlight-iframe');
        highlights.forEach((span) => {
            const parent = span.parentNode;
            if (parent) {
                parent.replaceChild(document.createTextNode(span.textContent), span);
                parent.normalize();
            }
        });
    }

    function highlight(node, searchTerm, isRegex) {
        if (node.nodeType === 3) {
            // Node.TEXT_NODE
            const text = node.nodeValue;
            let regex;
            try {
                const pattern = isRegex ? searchTerm : searchTerm.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
                if (!pattern) return;
                regex = new RegExp(`(${pattern})`, 'gi');
            } catch (e) {
                return;
            }

            if (regex.test(text)) {
                const fragment = document.createDocumentFragment();
                text.split(regex).forEach((part) => {
                    if (part.match(regex)) {
                        const span = document.createElement('span');
                        span.className = 'search-highlight-iframe';
                        Object.assign(span.style, highlightStyle);
                        span.textContent = part;
                        fragment.appendChild(span);
                    } else if (part) {
                        fragment.appendChild(document.createTextNode(part));
                    }
                });
                if (fragment.hasChildNodes() && node.parentNode) {
                    node.parentNode.replaceChild(fragment, node);
                }
            }
        } else if (
            node.nodeType === 1 &&
            node.childNodes &&
            !/script|style/i.test(node.tagName) &&
            !node.classList.contains('search-highlight-iframe')
        ) {
            Array.from(node.childNodes).forEach((child) => highlight(child, searchTerm, isRegex));
        }
    }

    function findNextInIframe() {
        if (iframeSearchState.results.length === 0) return;

        const previousResult = iframeSearchState.results[iframeSearchState.currentIndex];
        if (previousResult) {
            Object.assign(previousResult.style, highlightStyle);
        }

        iframeSearchState.currentIndex++;
        if (iframeSearchState.currentIndex >= iframeSearchState.results.length) {
            iframeSearchState.currentIndex = 0;
        }

        const currentResult = iframeSearchState.results[iframeSearchState.currentIndex];
        if (currentResult) {
            Object.assign(currentResult.style, currentHighlightStyle);
            currentResult.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }

    // Listens for messages from the side panel
    window.addEventListener('message', (event) => {
        if (event.origin !== extensionOrigin) return;

        const { type, payload } = event.data;

        if (type === 'search-in-iframe') {
            const { term, isRegex } = payload;

            unhighlight(document.body);
            iframeSearchState = { results: [], currentIndex: -1 };

            if (term) {
                highlight(document.body, term, isRegex);
                iframeSearchState.results = Array.from(document.querySelectorAll('.search-highlight-iframe'));
                if (iframeSearchState.results.length > 0) {
                    findNextInIframe();
                }
            }

            // *** NEW LOGIC ADDED ***
            // Informs the side panel (parent) about the search result.
            window.parent.postMessage(
                {
                    type: 'iframe-search-result',
                    payload: {
                        count: iframeSearchState.results.length,
                        term: term, // Return the term so the parent knows which search it corresponds to
                    },
                },
                extensionOrigin,
            );
        } else if (type === 'find-next-in-iframe') {
            findNextInIframe();
        }
    });
}
