export function extractYouTubeVideoId(doc) {
    let videoId = null;
    try {
        // Priority 1: Open Graph video URL (very reliable)
        const ogVideoUrl = doc.querySelector('meta[property="og:video:url"]');
        if (ogVideoUrl && ogVideoUrl.content) {
            const url = new URL(ogVideoUrl.content);
            if (url.hostname.includes('youtube.com') && url.pathname.includes('/embed/')) {
                videoId = url.pathname.split('/embed/')[1].split(/[?&]/)[0];
            }
        }

        // Priority 2: Canonical URL (if it points to YouTube)
        if (!videoId) {
            const canonicalUrl = doc.querySelector('link[rel="canonical"]');
            if (canonicalUrl && canonicalUrl.href) {
                const url = new URL(canonicalUrl.href);
                if (url.hostname.includes('youtube.com') && url.searchParams.has('v')) {
                    videoId = url.searchParams.get('v');
                }
            }
        }

        // Priority 3: Open Graph image URL (often contains the ID)
        if (!videoId) {
            const ogImageUrl = doc.querySelector('meta[property="og:image"]');
            if (ogImageUrl && ogImageUrl.content && ogImageUrl.content.includes('/vi/')) {
                // The URL is usually like https://i.ytimg.com/vi/VIDEO_ID/maxresdefault.jpg
                const potentialId = ogImageUrl.content.split('/vi/')[1].split('/')[0];
                if (potentialId && potentialId.length === 11) {
                    // YouTube IDs are 11 characters
                    videoId = potentialId;
                }
            }
        }
    } catch (e) {
        console.warn('Error extracting YouTube video ID:', e);
    }
    return videoId;
}

export function extractYouTubeVideoIdFromUrl(url) {
    if (!url) return null;
    // Regular expression to match various YouTube URL formats.
    const youtubeRegex =
        /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:watch\?v=|embed\/|v\/)|youtu\.be\/)([^"&?\/\s]{11})/;
    const match = url.match(youtubeRegex);
    if (match && match[1]) {
        return match[1];
    }
    return null;
}

export function createYouTubeEmbed(videoId) {
    if (!videoId) return null;

    const videoContainer = document.createElement('div');
    // This container defines the 16:9 aspect ratio
    videoContainer.style.position = 'relative';
    videoContainer.style.width = '100%';
    videoContainer.style.maxWidth = '100vw';
    videoContainer.style.overflow = 'hidden';
    videoContainer.style.paddingTop = '56.25%'; // 16:9 aspect ratio (9 / 16 * 100)
    videoContainer.style.margin = '1em 0';
    videoContainer.style.backgroundColor = '#000'; // Dark background for video
    videoContainer.style.borderRadius = '8px';

    const iframe = document.createElement('iframe');
    // Using nocookie and a very minimal parameter set to avoid redirects and configuration errors
    iframe.src = `https://www.youtube-nocookie.com/embed/${videoId}?rel=0`;

    // Use attributes for dimensions as well as styles for maximum compatibility
    iframe.setAttribute('width', '100%');
    iframe.setAttribute('height', '100%');
    iframe.style.position = 'absolute';
    iframe.style.top = '0';
    iframe.style.left = '0';
    iframe.style.width = '100vw';
    iframe.style.height = '100%';
    iframe.style.border = '0';

    iframe.setAttribute('title', 'YouTube video player');
    // Combined permissions in 'allow' attribute; removed redundant 'allowfullscreen'
    iframe.setAttribute(
        'allow',
        'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen',
    );
    // Minimal referrerpolicy
    iframe.setAttribute('referrerpolicy', 'no-referrer');

    videoContainer.appendChild(iframe);
    return videoContainer;
}
