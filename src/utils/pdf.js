/**
 * A PDF writer just big enough for the gallery's "download as PDF" button.
 *
 * The extension's content security policy is `script-src 'self'`, so no PDF library
 * can be loaded; and a full-page capture is a single very tall image, which is the
 * one shape a PDF cannot hold on one page (the format tops out at 200 inches). So
 * this does the only two things that are needed: it slices a tall image into A4
 * pages and writes them out as a PDF whose pages are the JPEG bytes themselves,
 * handed to the viewer through the `DCTDecode` filter with no re-encoding.
 *
 * Everything here is plain bytes and byte offsets: a PDF's cross-reference table
 * records where each object starts, so the file has to be assembled once, measured
 * as it goes, and only then closed.
 */

/** A4 in PostScript points, the unit a PDF measures its pages in. */
const PAGE_WIDTH_PT = 595.28;
const PAGE_HEIGHT_PT = 841.89;

/** Enough for a screen capture to stay sharp without doubling the file size. */
const JPEG_QUALITY = 0.85;

const encoder = new TextEncoder();

/** Rounds to three decimals: PDF numbers are text, and 15 digits of float are noise. */
function pt(value) {
    return Math.round(value * 1000) / 1000;
}

/**
 * One page's worth of image, as JPEG bytes.
 *
 * The slice is taken in source pixels and the page is then sized from it, so the
 * last slice of a page — which is almost never a full A4 — gets a shorter page
 * rather than a tall band of white.
 */
async function encodeSlice(bitmap, sourceY, sourceHeight) {
    const canvas = new OffscreenCanvas(bitmap.width, sourceHeight);
    const context = canvas.getContext('2d');
    // A capture is opaque, but a PNG with transparency would otherwise turn black
    // once JPEG drops the alpha channel.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, sourceY, bitmap.width, sourceHeight, 0, 0, bitmap.width, sourceHeight);

    const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: JPEG_QUALITY });
    return {
        bytes: new Uint8Array(await blob.arrayBuffer()),
        width: bitmap.width,
        height: sourceHeight,
    };
}

/** Every page one image produces, in order. */
async function sliceImage(dataUrl) {
    const blob = await (await fetch(dataUrl)).blob();
    const bitmap = await createImageBitmap(blob);
    try {
        const scale = PAGE_WIDTH_PT / bitmap.width;
        // How much of the source fits on one page, in source pixels.
        const sliceHeight = Math.max(1, Math.floor(PAGE_HEIGHT_PT / scale));

        const slices = [];
        for (let y = 0; y < bitmap.height; y += sliceHeight) {
            const height = Math.min(sliceHeight, bitmap.height - y);
            const slice = await encodeSlice(bitmap, y, height);
            slices.push({ ...slice, pageWidth: PAGE_WIDTH_PT, pageHeight: pt(height * scale) });
        }
        return slices;
    } finally {
        bitmap.close();
    }
}

/**
 * @param {string[]} dataUrls Images, in the order they should appear.
 * @returns {Promise<Blob>} A `application/pdf` blob, one A4-wide page per slice.
 */
export async function imagesToPdfBlob(dataUrls) {
    const pages = [];
    for (const dataUrl of dataUrls) {
        pages.push(...(await sliceImage(dataUrl)));
    }
    if (pages.length === 0) throw new Error('There is nothing to put in the PDF.');

    const chunks = [];
    let size = 0;
    /** Byte offset of every object, indexed by its number; entry 0 is the free head. */
    const offsets = [0];

    const write = (data) => {
        const bytes = typeof data === 'string' ? encoder.encode(data) : data;
        chunks.push(bytes);
        size += bytes.length;
    };
    const openObject = (number, dictionary) => {
        offsets[number] = size;
        write(`${number} 0 obj\n${dictionary}\n`);
    };
    const closeObject = () => write('endobj\n');

    // The binary comment on the second line is what tells a transport that moves
    // files around that this one must not be treated as text.
    write('%PDF-1.4\n');
    write(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a]));

    // 1 = catalog, 2 = page tree, then three objects per page.
    const firstPageObject = 3;
    const pageNumbers = pages.map((_, index) => firstPageObject + index * 3);

    openObject(1, '<< /Type /Catalog /Pages 2 0 R >>');
    closeObject();

    openObject(
        2,
        `<< /Type /Pages /Count ${pages.length} /Kids [${pageNumbers.map((number) => `${number} 0 R`).join(' ')}] >>`,
    );
    closeObject();

    pages.forEach((page, index) => {
        const pageNumber = pageNumbers[index];
        const contentNumber = pageNumber + 1;
        const imageNumber = pageNumber + 2;

        openObject(
            pageNumber,
            `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pt(page.pageWidth)} ${pt(page.pageHeight)}] ` +
                `/Resources << /XObject << /Im0 ${imageNumber} 0 R >> /ProcSet [/PDF /ImageC] >> ` +
                `/Contents ${contentNumber} 0 R >>`,
        );
        closeObject();

        // The image is drawn through a transform that stretches the unit square to
        // the page; that matrix is the whole content stream.
        const content = `q\n${pt(page.pageWidth)} 0 0 ${pt(page.pageHeight)} 0 0 cm\n/Im0 Do\nQ\n`;
        const contentBytes = encoder.encode(content);
        openObject(contentNumber, `<< /Length ${contentBytes.length} >>`);
        write('stream\n');
        write(contentBytes);
        write('\nendstream\n');
        closeObject();

        openObject(
            imageNumber,
            `<< /Type /XObject /Subtype /Image /Width ${page.width} /Height ${page.height} ` +
                `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${page.bytes.length} >>`,
        );
        write('stream\n');
        write(page.bytes);
        write('\nendstream\n');
        closeObject();
    });

    const objectCount = 2 + pages.length * 3 + 1; // +1 for the free object 0
    const xrefOffset = size;
    // Every entry is exactly twenty bytes wide; a reader seeks into this table by
    // multiplying, so a single missing space makes the file unreadable.
    let xref = `xref\n0 ${objectCount}\n0000000000 65535 f \n`;
    for (let number = 1; number < objectCount; number++) {
        xref += `${String(offsets[number]).padStart(10, '0')} 00000 n \n`;
    }
    write(xref);
    write(`trailer\n<< /Size ${objectCount} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);

    return new Blob(chunks, { type: 'application/pdf' });
}

/** Turns a title into something a file system will accept. */
export function toPdfFileName(title) {
    const safeTitle = (title || 'capture')
        .replace(/[^a-z0-9]/gi, '_')
        .toLowerCase()
        .slice(0, 60);
    return `${safeTitle || 'capture'}_${Date.now()}.pdf`;
}
