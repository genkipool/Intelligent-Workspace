/**
 * An AVIF writer just big enough for the gallery's "download as AVIF" button.
 *
 * Chrome will happily *decode* AVIF but it will not encode one: `canvas.toBlob`
 * answers a request for `image/avif` with a PNG and no error at all, which is the
 * worst possible failure — a file with the wrong bytes and the right name. And the
 * extension's content security policy is `script-src 'self'`, so no encoder can be
 * loaded from anywhere either. The same reasoning that made `pdf.js` write its own
 * file applies here.
 *
 * What Chrome does have is an AV1 video encoder, reachable through WebCodecs, and an
 * AVIF is a single AV1 keyframe in a HEIF container. So this asks WebCodecs for one
 * keyframe and then writes the container: `ftyp`, a `meta` box describing the one
 * picture inside, and the coded bytes in `mdat`.
 *
 * Two things have to agree with the bitstream rather than be assumed, because a
 * decoder that trusts the container gets a wrong picture rather than an error: the
 * `av1C` box repeats the profile, level and chroma layout the encoder chose, and the
 * `colr` box repeats its colour range. Both are read back out of the sequence header
 * the encoder produced, which is why there is a bit reader in here.
 */

/** The codec string asks for the one shape this writer knows: profile 0, 8-bit. */
const AV1_CODEC = 'av01.0.04M.08';

/**
 * How hard to squeeze, on AV1's 0–63 scale. Low enough that the text in a screen
 * capture survives 4:2:0 chroma, which is the thing AVIF is worst at.
 */
const DEFAULT_QUANTIZER = 22;

/** OBU types, of which only these three ever turn up in a still picture. */
const OBU_SEQUENCE_HEADER = 1;
const OBU_TEMPORAL_DELIMITER = 2;

const textEncoder = new TextEncoder();

/* ------------------------------------------------------------------ bitstream */

/** Reads the sequence header a bit at a time, most significant bit first. */
class BitReader {
    constructor(bytes) {
        this.bytes = bytes;
        this.position = 0;
    }

    /** `f(n)` in the AV1 spec: n bits as an unsigned number. */
    f(count) {
        let value = 0;
        for (let i = 0; i < count; i++) {
            const byte = this.bytes[this.position >> 3] ?? 0;
            // Multiplication rather than a shift: f(32) is a legal width here, and a
            // 32-bit shift in JavaScript comes back signed.
            value = value * 2 + ((byte >> (7 - (this.position & 7))) & 1);
            this.position++;
        }
        return value;
    }

    /** `uvlc()`: the variable-length code the timing info is written in. */
    uvlc() {
        let leadingZeros = 0;
        while (leadingZeros < 32 && this.f(1) === 0) leadingZeros++;
        if (leadingZeros >= 32) return 0xffffffff;
        return this.f(leadingZeros) + (1 << leadingZeros) - 1;
    }
}

/** The length prefix AV1 writes its OBU sizes in. */
function readLeb128(bytes, start) {
    let value = 0;
    let index = start;
    for (let i = 0; i < 8; i++) {
        const byte = bytes[index++];
        value += (byte & 0x7f) * Math.pow(2, i * 7);
        if (!(byte & 0x80)) break;
    }
    return { value, next: index };
}

/** Splits the encoder's output into the OBUs it is made of. */
function splitObus(bytes) {
    const obus = [];
    let cursor = 0;
    while (cursor < bytes.length) {
        const header = bytes[cursor];
        const type = (header >> 3) & 0x0f;
        const hasExtension = (header >> 2) & 1;
        const hasSizeField = (header >> 1) & 1;
        let payloadStart = cursor + 1 + (hasExtension ? 1 : 0);
        let size;
        if (hasSizeField) {
            const leb = readLeb128(bytes, payloadStart);
            size = leb.value;
            payloadStart = leb.next;
        } else {
            size = bytes.length - payloadStart;
        }
        const end = payloadStart + size;
        if (end > bytes.length || end <= cursor) break;
        obus.push({ type, start: cursor, payloadStart, end });
        cursor = end;
    }
    return obus;
}

/**
 * The handful of sequence-header fields the container has to repeat.
 *
 * Everything up to `color_config` has to be walked through even though almost none of
 * it is wanted, because the fields are bit-packed with no offsets: the only way to
 * reach the colour description is to read past everything in front of it. This
 * follows section 5.5 of the AV1 specification in order.
 */
function parseSequenceHeader(payload) {
    const reader = new BitReader(payload);

    const seqProfile = reader.f(3);
    reader.f(1); // still_picture
    const reducedStillPictureHeader = reader.f(1);

    let seqLevelIdx = 0;
    let seqTier = 0;
    let decoderModelInfoPresent = 0;

    if (reducedStillPictureHeader) {
        seqLevelIdx = reader.f(5);
    } else {
        const timingInfoPresent = reader.f(1);
        if (timingInfoPresent) {
            reader.f(32); // num_units_in_display_tick
            reader.f(32); // time_scale
            if (reader.f(1)) reader.uvlc(); // equal_picture_interval / num_ticks_per_picture
            decoderModelInfoPresent = reader.f(1);
            if (decoderModelInfoPresent) {
                reader.f(5); // buffer_delay_length_minus_1
                reader.f(32); // num_units_in_decoding_tick
                reader.f(5); // buffer_removal_time_length_minus_1
                reader.f(5); // frame_presentation_time_length_minus_1
            }
        }
        const initialDisplayDelayPresent = reader.f(1);
        const operatingPointsCount = reader.f(5) + 1;
        for (let i = 0; i < operatingPointsCount; i++) {
            reader.f(12); // operating_point_idc
            const level = reader.f(5);
            const tier = level > 7 ? reader.f(1) : 0;
            if (i === 0) {
                seqLevelIdx = level;
                seqTier = tier;
            }
            if (decoderModelInfoPresent && reader.f(1)) {
                // operating_parameters_info, whose widths came from the decoder model
                // block above. A still picture never carries one, so rather than keep
                // those widths around this gives up and lets the defaults stand.
                return null;
            }
            if (initialDisplayDelayPresent && reader.f(1)) reader.f(4);
        }
    }

    const frameWidthBits = reader.f(4) + 1;
    const frameHeightBits = reader.f(4) + 1;
    reader.f(frameWidthBits); // max_frame_width_minus_1
    reader.f(frameHeightBits); // max_frame_height_minus_1

    const frameIdNumbersPresent = reducedStillPictureHeader ? 0 : reader.f(1);
    if (frameIdNumbersPresent) {
        reader.f(4); // delta_frame_id_length_minus_2
        reader.f(3); // additional_frame_id_length_minus_1
    }

    reader.f(1); // use_128x128_superblock
    reader.f(1); // enable_filter_intra
    reader.f(1); // enable_intra_edge_filter

    if (!reducedStillPictureHeader) {
        reader.f(1); // enable_interintra_compound
        reader.f(1); // enable_masked_compound
        reader.f(1); // enable_warped_motion
        reader.f(1); // enable_dual_filter
        const enableOrderHint = reader.f(1);
        if (enableOrderHint) {
            reader.f(1); // enable_jnt_comp
            reader.f(1); // enable_ref_frame_mvs
        }
        const seqChooseScreenContentTools = reader.f(1);
        const seqForceScreenContentTools = seqChooseScreenContentTools ? 2 : reader.f(1);
        if (seqForceScreenContentTools > 0) {
            if (!reader.f(1)) reader.f(1); // seq_choose_integer_mv / seq_force_integer_mv
        }
        if (enableOrderHint) reader.f(3); // order_hint_bits_minus_1
    }

    reader.f(1); // enable_superres
    reader.f(1); // enable_cdef
    reader.f(1); // enable_restoration

    // color_config()
    const highBitdepth = reader.f(1);
    const twelveBit = seqProfile === 2 && highBitdepth ? reader.f(1) : 0;
    const bitDepth = seqProfile === 2 && highBitdepth ? (twelveBit ? 12 : 10) : highBitdepth ? 10 : 8;
    const monochrome = seqProfile === 1 ? 0 : reader.f(1);

    const colorDescriptionPresent = reader.f(1);
    let colorPrimaries = 2; // CP_UNSPECIFIED
    let transferCharacteristics = 2; // TC_UNSPECIFIED
    let matrixCoefficients = 2; // MC_UNSPECIFIED
    if (colorDescriptionPresent) {
        colorPrimaries = reader.f(8);
        transferCharacteristics = reader.f(8);
        matrixCoefficients = reader.f(8);
    }

    let colorRange;
    let subsamplingX;
    let subsamplingY;
    let chromaSamplePosition = 0;

    if (monochrome) {
        colorRange = reader.f(1);
        subsamplingX = 1;
        subsamplingY = 1;
    } else if (colorPrimaries === 1 && transferCharacteristics === 13 && matrixCoefficients === 0) {
        // The one combination that means "untouched RGB": no subsampling, full range.
        colorRange = 1;
        subsamplingX = 0;
        subsamplingY = 0;
    } else {
        colorRange = reader.f(1);
        if (seqProfile === 0) {
            subsamplingX = 1;
            subsamplingY = 1;
        } else if (seqProfile === 1) {
            subsamplingX = 0;
            subsamplingY = 0;
        } else if (bitDepth === 12) {
            subsamplingX = reader.f(1);
            subsamplingY = subsamplingX ? reader.f(1) : 0;
        } else {
            subsamplingX = 1;
            subsamplingY = 0;
        }
        if (subsamplingX && subsamplingY) chromaSamplePosition = reader.f(2);
    }

    return {
        seqProfile,
        seqLevelIdx,
        seqTier,
        highBitdepth,
        twelveBit,
        monochrome,
        subsamplingX,
        subsamplingY,
        chromaSamplePosition,
        colorPrimaries,
        transferCharacteristics,
        matrixCoefficients,
        colorRange,
    };
}

/* ---------------------------------------------------------------- ISOBMFF boxes */

function concat(parts) {
    const total = parts.reduce((sum, part) => sum + part.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const part of parts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

function u8(...values) {
    return Uint8Array.from(values);
}

function u16(value) {
    return u8((value >> 8) & 0xff, value & 0xff);
}

function u32(value) {
    return u8((value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff);
}

/** A box is its own length, its four-letter name, and whatever it contains. */
function box(type, ...parts) {
    const body = concat(parts);
    return concat([u32(body.length + 8), textEncoder.encode(type), body]);
}

/** A full box is a box that starts with a version byte and three flag bytes. */
function fullBox(type, version, flags, ...parts) {
    return box(type, u8(version, (flags >> 16) & 0xff, (flags >> 8) & 0xff, flags & 0xff), ...parts);
}

/**
 * The `av1C` box: the four bytes of AV1 configuration, then the sequence header the
 * decoder needs before it can read anything in `mdat`.
 */
function av1ConfigBox(header, sequenceHeaderObu) {
    return box(
        'av1C',
        u8(
            0x81, // marker = 1, version = 1
            (header.seqProfile << 5) | header.seqLevelIdx,
            (header.seqTier << 7) |
                (header.highBitdepth << 6) |
                (header.twelveBit << 5) |
                (header.monochrome << 4) |
                (header.subsamplingX << 3) |
                (header.subsamplingY << 2) |
                header.chromaSamplePosition,
            0x00, // no initial presentation delay
        ),
        sequenceHeaderObu,
    );
}

/**
 * The `colr` box, so a viewer knows how to turn the stored YUV back into colour.
 *
 * The encoder leaves the description unspecified, and a file that says "unspecified"
 * is a file every viewer guesses at. The guess that matches what Chrome actually did
 * to the canvas is sRGB over BT.709, so that is what gets written; the range comes
 * from the bitstream, because getting that one wrong is a visibly washed-out picture.
 */
function colourBox(header) {
    const primaries = header.colorPrimaries === 2 ? 1 : header.colorPrimaries;
    const transfer = header.transferCharacteristics === 2 ? 13 : header.transferCharacteristics;
    const matrix = header.matrixCoefficients === 2 ? 1 : header.matrixCoefficients;
    return box(
        'colr',
        textEncoder.encode('nclx'),
        u16(primaries),
        u16(transfer),
        u16(matrix),
        u8(header.colorRange ? 0x80 : 0x00),
    );
}

/**
 * Wraps one coded keyframe as an AVIF file.
 *
 * Built twice on purpose: the `iloc` box has to record where in the finished file the
 * picture starts, and that offset is not known until everything in front of it has
 * been measured. Every field is fixed-width, so the second pass is the same size as
 * the first — measure, then write.
 */
function buildAvif({ width, height, header, sequenceHeaderObu, mdatBytes }) {
    const write = (payloadOffset) => {
        const ftyp = box(
            'ftyp',
            textEncoder.encode('avif'),
            u32(0),
            textEncoder.encode('avif'),
            textEncoder.encode('mif1'),
            textEncoder.encode('miaf'),
        );

        const hdlr = fullBox('hdlr', 0, 0, u32(0), textEncoder.encode('pict'), u32(0), u32(0), u32(0), u8(0));
        const pitm = fullBox('pitm', 0, 0, u16(1));
        const iloc = fullBox(
            'iloc',
            0,
            0,
            u8(0x44, 0x00), // four-byte offsets and lengths, no base offset
            u16(1), // one item
            u16(1), // item 1
            u16(0), // data reference: this file
            u16(1), // one extent
            u32(payloadOffset),
            u32(mdatBytes.length),
        );
        const infe = fullBox('infe', 2, 0, u16(1), u16(0), textEncoder.encode('av01'), u8(0));
        const iinf = fullBox('iinf', 0, 0, u16(1), infe);

        const ispe = fullBox('ispe', 0, 0, u32(width), u32(height));
        const pixi = fullBox('pixi', 0, 0, u8(3, 8, 8, 8));
        const av1C = av1ConfigBox(header, sequenceHeaderObu);
        const colr = colourBox(header);
        const ipco = box('ipco', ispe, pixi, av1C, colr);
        // The properties above, in order, associated with item 1. Only `av1C` is
        // essential: a reader that does not understand it must not show the picture,
        // whereas one that ignores the size or the colour still shows something.
        const ipma = fullBox('ipma', 0, 0, u32(1), u16(1), u8(4), u8(0x01, 0x02, 0x83, 0x04));
        const iprp = box('iprp', ipco, ipma);

        const meta = fullBox('meta', 0, 0, hdlr, pitm, iloc, iinf, iprp);
        const mdat = box('mdat', mdatBytes);
        return { file: concat([ftyp, meta, mdat]), payloadOffset: ftyp.length + meta.length + 8 };
    };

    const measured = write(0);
    return write(measured.payloadOffset).file;
}

/* ------------------------------------------------------------------- encoding */

/** Whether this browser can produce an AVIF at all. */
export async function canEncodeAvif() {
    if (typeof VideoEncoder === 'undefined') return false;
    try {
        const support = await VideoEncoder.isConfigSupported({
            codec: AV1_CODEC,
            width: 64,
            height: 64,
            bitrateMode: 'quantizer',
        });
        return !!support?.supported;
    } catch {
        return false;
    }
}

/** Runs one bitmap through the AV1 encoder and hands back the coded keyframe. */
function encodeKeyframe(bitmap, quantizer) {
    return new Promise((resolve, reject) => {
        let settled = false;
        const encoder = new VideoEncoder({
            output: (chunk) => {
                if (settled) return;
                settled = true;
                const bytes = new Uint8Array(chunk.byteLength);
                chunk.copyTo(bytes);
                resolve(bytes);
            },
            error: (error) => {
                if (settled) return;
                settled = true;
                reject(error);
            },
        });

        try {
            encoder.configure({
                codec: AV1_CODEC,
                // AV1 codes in whole superblocks; an odd width or height is stored by
                // rounding up and cropping, which the container's `ispe` box then has
                // to state. Keeping the coded size even avoids the whole question.
                width: bitmap.width + (bitmap.width % 2),
                height: bitmap.height + (bitmap.height % 2),
                bitrateMode: 'quantizer',
                latencyMode: 'quality',
            });
            const frame = new VideoFrame(bitmap, { timestamp: 0 });
            encoder.encode(frame, { keyFrame: true, av1: { quantizer } });
            frame.close();
            encoder.flush().catch(reject);
        } catch (error) {
            if (!settled) {
                settled = true;
                reject(error);
            }
        }
    });
}

/**
 * One image, as AVIF bytes.
 *
 * @param {string} dataUrl The picture as it is held in the gallery.
 * @param {{quantizer?: number}} [options]
 * @returns {Promise<Blob>}
 */
export async function imageToAvifBlob(dataUrl, options = {}) {
    if (typeof VideoEncoder === 'undefined') throw new Error('This browser has no AV1 encoder');

    const source = await createImageBitmap(await (await fetch(dataUrl)).blob());
    let bitmap = null;
    try {
        // Every picture goes through a canvas first, for two reasons that both end in
        // a wrong picture rather than an error. A capture is opaque, but an uploaded
        // PNG with transparency has nowhere to put its alpha in a 4:2:0 frame, and
        // what the encoder would then read is the colour premultiplied against black —
        // so it is laid on white, the way `pdf.js` does before it writes a JPEG. And
        // the coded size has to be even, so an odd picture is padded by repeating its
        // last row or column rather than by letting the fill bleed into the edge.
        const width = source.width + (source.width % 2);
        const height = source.height + (source.height % 2);
        const canvas = new OffscreenCanvas(width, height);
        const context = canvas.getContext('2d');
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, width, height);
        context.drawImage(source, 0, 0);
        if (width !== source.width)
            context.drawImage(source, source.width - 1, 0, 1, source.height, source.width, 0, 1, source.height);
        if (height !== source.height)
            context.drawImage(canvas, 0, source.height - 1, width, 1, 0, source.height, width, 1);
        bitmap = await createImageBitmap(canvas);

        const coded = await encodeKeyframe(bitmap, options.quantizer ?? DEFAULT_QUANTIZER);
        const obus = splitObus(coded);
        const sequence = obus.find((obu) => obu.type === OBU_SEQUENCE_HEADER);
        if (!sequence) throw new Error('The AV1 encoder produced no sequence header');

        const header = parseSequenceHeader(coded.subarray(sequence.payloadStart, sequence.end));
        if (!header) throw new Error('The AV1 sequence header could not be read');

        // The temporal delimiter belongs to a video; a still picture has nothing to
        // delimit, and AVIF asks for it to be left out.
        const payload = concat(
            obus.filter((obu) => obu.type !== OBU_TEMPORAL_DELIMITER).map((obu) => coded.subarray(obu.start, obu.end)),
        );

        return new Blob(
            [
                buildAvif({
                    // The stated size is the real one: the padding above is coded but
                    // cropped away on display.
                    width: source.width,
                    height: source.height,
                    header,
                    sequenceHeaderObu: coded.subarray(sequence.start, sequence.end),
                    mdatBytes: payload,
                }),
            ],
            { type: 'image/avif' },
        );
    } finally {
        bitmap?.close();
        source.close();
    }
}
