/**
 * The shapes an image can leave the gallery in.
 *
 * The gallery holds PNG data URLs for its own captures and whatever was picked off
 * disk for the images that were uploaded, and the download dialog offers four
 * answers: the picture as a PNG, as a WebP, as an AVIF, or the whole selection as one
 * PDF. The PDF is `pdf.js`; the other three are here.
 *
 * WebP the browser encodes itself. AVIF it does not — `canvas.toBlob` answers a
 * request for `image/avif` with a PNG and no error at all — so that one goes through
 * `avif.js`, which drives the AV1 encoder and writes the container.
 */

import { imageToAvifBlob, canEncodeAvif } from './avif.js';

export { canEncodeAvif };

/** WebP counts its dimensions in 14 bits, so this is a wall rather than a guideline. */
const WEBP_MAX_SIDE = 16383;

/** Enough that the text in a screen capture stays readable. */
const WEBP_QUALITY = 0.92;

/** What each format is called on disk. */
const EXTENSIONS = { png: 'png', webp: 'webp', avif: 'avif' };

/** Thrown when the picture is fine but the format cannot hold it. */
export class ImageTooLargeError extends Error {}

/** Turns a title into something a file system will accept. */
export function toImageFileName(title, format) {
    const safeTitle = (title || 'screenshot')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .slice(0, 60);
    return `${safeTitle || 'screenshot'}_${Date.now()}.${EXTENSIONS[format] || 'png'}`;
}

/**
 * One image in one format.
 *
 * A capture is already a PNG, so asking for PNG hands back exactly the bytes that
 * were stored rather than passing them through a canvas for no reason. An uploaded
 * JPEG asked for as PNG really is re-encoded, because the dialog promised a PNG.
 *
 * @param {string} dataUrl
 * @param {'png'|'webp'|'avif'} format
 * @returns {Promise<Blob>}
 */
export async function encodeImage(dataUrl, format) {
    const original = await (await fetch(dataUrl)).blob();
    if (format === 'png' && original.type === 'image/png') return original;
    if (format === 'avif') return imageToAvifBlob(dataUrl);

    const bitmap = await createImageBitmap(original);
    try {
        if (format === 'webp' && (bitmap.width > WEBP_MAX_SIDE || bitmap.height > WEBP_MAX_SIDE)) {
            throw new ImageTooLargeError(`WebP tops out at ${WEBP_MAX_SIDE} pixels a side`);
        }
        const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
        canvas.getContext('2d').drawImage(bitmap, 0, 0);
        const type = format === 'webp' ? 'image/webp' : 'image/png';
        const blob = await canvas.convertToBlob({ type, quality: WEBP_QUALITY });
        // The silent fallback this module exists to guard against: a canvas that
        // cannot produce the format asked for returns a PNG without saying so.
        if (blob.type !== type) throw new Error(`This browser cannot write ${type}`);
        return blob;
    } finally {
        bitmap.close();
    }
}
