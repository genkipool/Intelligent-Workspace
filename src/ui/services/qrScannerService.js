/**
 * qrScannerService.js
 *
 * Dedicated service for scanning and decoding QR codes and Barcodes from images,
 * video streams, or image URLs / Data URLs.
 * Uses a multi-tiered decoding strategy:
 * 1. Native `window.BarcodeDetector` (supported in Chromium/Chrome)
 * 2. jsQR library fallback (bundled locally in src/lib/jsQR.js) for 100% reliable QR decoding in all extension contexts.
 */

import jsQR from '../../lib/jsQR.js';

/**
 * Checks if the browser natively supports BarcodeDetector.
 * @returns {Promise<boolean>}
 */
export async function isBarcodeDetectorSupported() {
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            return formats.includes('qr_code');
        } catch {
            return true;
        }
    }
    return false;
}

/**
 * Decodes barcode/QR codes using the fallback jsQR engine.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData|ImageBitmap} source
 * @returns {Array<{ rawValue: string, format: string }>}
 */
function decodeWithJsQR(source) {
    try {
        let imageData = null;
        let width = source.width || 0;
        let height = source.height || 0;

        if (source instanceof ImageData) {
            imageData = source;
            width = source.width;
            height = source.height;
        } else {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) return [];
            ctx.drawImage(source, 0, 0, width, height);
            imageData = ctx.getImageData(0, 0, width, height);
        }

        if (!imageData || width <= 0 || height <= 0) return [];

        const qrFn = typeof jsQR === 'function' ? jsQR : jsQR?.default || window.jsQR;
        if (typeof qrFn !== 'function') return [];

        const code = qrFn(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'attemptBoth',
        });

        if (code && code.data) {
            return [
                {
                    rawValue: code.data,
                    format: 'qr_code',
                    location: code.location || null,
                },
            ];
        }
    } catch (err) {
        console.warn('jsQR fallback scanning failed:', err);
    }
    return [];
}

/**
 * Supported barcode / QR formats for BarcodeDetector.
 */
export const SUPPORTED_FORMATS = [
    'qr_code',
    'ean_13',
    'ean_8',
    'code_128',
    'code_39',
    'code_93',
    'codabar',
    'data_matrix',
    'itf',
    'pdf417',
    'aztec',
    'upc_a',
    'upc_e',
];

/**
 * Decodes barcode/QR codes from an Image, Canvas, ImageData, or ImageBitmap.
 * @param {ImageBitmapSource|HTMLImageElement|HTMLCanvasElement|ImageData} imageSource
 * @returns {Promise<Array<{ rawValue: string, format: string, cornerPoints?: Array<{x: number, y: number}> }>>}
 */
export async function decodeBarcodeFromSource(imageSource) {
    // 1. Try native BarcodeDetector if available
    if (typeof window !== 'undefined' && 'BarcodeDetector' in window) {
        try {
            const supported = await window.BarcodeDetector.getSupportedFormats();
            const formatsToUse = SUPPORTED_FORMATS.filter((fmt) => supported.includes(fmt));
            const detector = new window.BarcodeDetector({
                formats: formatsToUse.length > 0 ? formatsToUse : ['qr_code'],
            });

            const results = await detector.detect(imageSource);
            if (results && results.length > 0) {
                return results.map((item) => ({
                    rawValue: item.rawValue,
                    format: item.format,
                    cornerPoints: item.cornerPoints || [],
                    boundingBox: item.boundingBox || null,
                }));
            }
        } catch (detectorErr) {
            console.warn('Native BarcodeDetector failed, falling back to jsQR:', detectorErr);
        }
    }

    // 2. Fallback to jsQR
    const fallbackResults = decodeWithJsQR(imageSource);
    return fallbackResults;
}

/**
 * Decodes barcode/QR codes from a Data URL or Image URL.
 * @param {string} dataUrlOrUrl
 * @returns {Promise<Array<{ rawValue: string, format: string }>>}
 */
export async function decodeBarcodeFromDataUrl(dataUrlOrUrl) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = async () => {
            try {
                const barcodes = await decodeBarcodeFromSource(img);
                resolve(barcodes);
            } catch (err) {
                reject(err);
            }
        };
        img.onerror = () => {
            reject(new Error('Failed to load image for QR/barcode scanning.'));
        };
        img.src = dataUrlOrUrl;
    });
}

/**
 * Decodes barcode/QR codes from a File or Blob.
 * @param {Blob|File} file
 * @returns {Promise<Array<{ rawValue: string, format: string }>>}
 */
export async function decodeBarcodeFromFile(file) {
    // Convert Blob/File to Image element via Object URL for maximum compatibility
    return new Promise((resolve, reject) => {
        const objectUrl = URL.createObjectURL(file);
        const img = new Image();
        img.onload = async () => {
            try {
                const results = await decodeBarcodeFromSource(img);
                URL.revokeObjectURL(objectUrl);
                resolve(results);
            } catch (err) {
                URL.revokeObjectURL(objectUrl);
                reject(err);
            }
        };
        img.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error('Failed to parse uploaded image file.'));
        };
        img.src = objectUrl;
    });
}
