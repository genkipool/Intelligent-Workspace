/**
 * [AI INSTRUCTION]
 * WHAT THE READERS HAND TO THE SPEECH ENGINE, FROM WHAT THE SETTINGS SAY.
 *
 * One file for every reader — the page reader (a content script, injected with this
 * file first), the notes, the assistant and the voice test in the settings (through
 * speechService.js) — because the settings mean the same thing to all of them and the
 * engines do not take them at face value. Two things were measured on Chrome 151 with
 * its network voices ("Google español" and the rest), which are the only voices Chrome
 * has on a system without speech-dispatcher:
 *
 * PITCH 0 WAS SPOKEN AT THE NORMAL PITCH. Chrome's network voice engine builds its
 * request with `if (options.pitch) url += '&pitch=' + pitch / 2`, so zero is falsy and
 * no pitch is sent at all: the server uses its default. The request log shows it — pitch
 * 0 sends nothing, pitch 0.01 sends `pitch=0.005` and the voice changes. The lowest pitch
 * handed over is therefore a hair above zero, which every engine treats as the bottom.
 *
 * ×2 WAS NEARLY FOUR TIMES AS FAST. The same engine sends `speed = rate / 2` and the
 * server does not scale linearly above 1: the same sentence took 6.55s at rate 1 and
 * 1.75s at rate 2. So the engine's rate is read off the curve measured below, for the
 * real speed wanted; other voices take that real speed as it is.
 *
 * AND ×2 IS 1.7 TIMES, NOT TWICE. Twice the voice's own speed turned out too fast to
 * follow, and 1.7 is the fastest the user still finds comfortable. Up to ×1 the setting
 * is the speed; above it the scale is gentler and reaches 1.7 at the top of the range
 * (`realSpeed`). The labels stay ×1.25, ×1.5, ×2 — it is what they sound like that
 * changed.
 *
 * FOLLOWING THE VOICE WORD BY WORD. The network voices send no word events, so the page
 * reader moves its mark by the clock. Their audio was captured from Chrome's own network
 * log and measured against the text: playback starts about 0.09s after the start
 * event, every comma, full stop and quotation mark leaves a pause of about 0.4s at speed
 * 1 (shorter in proportion as the speed goes up), and the speech in between runs at
 * about 16 letters a second, with a number taking far longer than it looks. A clock that
 * spread a paragraph evenly over its characters, as the reader's did, ran up to three
 * words ahead or six behind; `timingOf` and `createSpeedLearner` are that measurement
 * as a model, and they halved the error on recordings they were not fitted on.
 */
(() => {
    /**
     * [rate handed to Chrome, how many times faster than rate 1 it came out], for the
     * same sentence read by "Google español" on Chrome 151 (durations 12.97s at 0.5 …
     * 6.55s at 1 … 1.75s at 2).
     */
    const GOOGLE_NETWORK_CURVE = [
        [0.5, 0.505],
        [0.6, 0.579],
        [0.75, 0.711],
        [0.9, 0.87],
        [1, 1],
        [1.25, 1.396],
        [1.5, 1.943],
        [1.75, 2.695],
        [2, 3.743],
    ];
    /** Past the last point the measured speed doubles every ~0.53 of rate. */
    const DOUBLINGS_PER_RATE = 1.9;
    /** What the top of the settings' range (×2) sounds like: this many times the voice's own speed. */
    const SPEED_AT_TOP_SETTING = 1.7;
    const TOP_SETTING = 2;
    /** The lowest pitch sent: zero is dropped by the network engine (see above). */
    const MIN_PITCH = 0.01;

    function clamp(value, low, high, fallback) {
        const number = Number(value);
        if (!Number.isFinite(number)) return fallback;
        return Math.min(high, Math.max(low, number));
    }

    function isGoogleNetworkVoice(voice) {
        return !!voice && voice.localService === false && /^Google\b/.test(voice.name || '');
    }

    /**
     * The voice that will really speak. With none chosen Chrome picks one for the
     * language, and on a system with only network voices that one is a Google voice too.
     */
    function effectiveVoice(voice, lang) {
        if (voice) return voice;
        if (typeof speechSynthesis === 'undefined') return null;
        const voices = speechSynthesis.getVoices();
        const wanted = String(lang || '').toLowerCase();
        const base = wanted.split('-')[0];
        return (
            voices.find((v) => v.lang.toLowerCase() === wanted) ||
            voices.find((v) => v.lang.toLowerCase().split('-')[0] === base) ||
            voices.find((v) => v.default) ||
            null
        );
    }

    /**
     * How many times the voice's own speed a setting stands for: the setting itself up
     * to ×1, then a straight line that reaches SPEED_AT_TOP_SETTING at ×2.
     */
    function realSpeed(setting) {
        const value = clamp(setting, 0.25, 4, 1);
        if (value <= 1) return value;
        return 1 + ((value - 1) * (SPEED_AT_TOP_SETTING - 1)) / (TOP_SETTING - 1);
    }

    /** The engine rate that makes `voice` read at the real speed a setting stands for. */
    function engineRate(speed, voice, lang) {
        const factor = realSpeed(speed);
        if (!isGoogleNetworkVoice(effectiveVoice(voice, lang))) return factor;

        const curve = GOOGLE_NETWORK_CURVE;
        if (factor <= curve[0][1]) return (factor * curve[0][0]) / curve[0][1];
        for (let i = 1; i < curve.length; i++) {
            const [r0, f0] = curve[i - 1];
            const [r1, f1] = curve[i];
            if (factor <= f1) return r0 + ((factor - f0) * (r1 - r0)) / (f1 - f0);
        }
        const [rLast, fLast] = curve[curve.length - 1];
        return rLast + Math.log2(factor / fLast) / DOUBLINGS_PER_RATE;
    }

    /** How the network voices spend their time over a text, measured at speed 1 (see above). */
    const TIMING = Object.freeze({
        lettersPerSecond: 15.9,
        startLead: 0.09,
        pause: Object.freeze({ stop: 0.42, comma: 0.42, quote: 0.35 }),
        trailing: Object.freeze({ stop: 0.62, none: 0.35 }),
        /** How many seconds of speech the starting speed counts for when learning. */
        priorSeconds: 3,
        /** A measurement outside this is noise, not a speed. */
        lettersPerSecondBounds: Object.freeze([5, 40]),
    });
    const STOP_END = /[.;:!?]["»”')\]]*$/;
    const COMMA_END = /,["»”')\]]*$/;
    const QUOTE_END = /["»”')\]]$/;
    const QUOTE_START = /^["«“'(\[]/;

    /** How long a word takes, in letters: a digit is read as several of them. */
    function wordUnits(word) {
        const digits = (word.match(/\d/g) || []).length;
        const letters = (word.match(/\p{L}/gu) || []).length;
        return Math.max(1, letters + 4.5 * digits);
    }

    /**
     * The words of a text laid out in time, at speed 1: `units[i]` is how many letters
     * come before word `i`, and `pauses[i]` how many seconds of pause the voice has made
     * by the time it reaches it. Both have one entry more than there are words, for the
     * end of the text.
     */
    function timingOf(words) {
        const count = words.length;
        const units = new Array(count + 1).fill(0);
        const pauses = new Array(count + 1).fill(0);
        for (let i = 0; i < count; i++) {
            const word = words[i];
            let pauseBefore = 0;
            if (i > 0) {
                const previous = words[i - 1];
                if (STOP_END.test(previous)) pauseBefore = TIMING.pause.stop;
                else if (COMMA_END.test(previous)) pauseBefore = TIMING.pause.comma;
                else if (QUOTE_END.test(previous) || QUOTE_START.test(word)) pauseBefore = TIMING.pause.quote;
            }
            pauses[i] = (i > 0 ? pauses[i - 1] : 0) + pauseBefore;
            units[i + 1] = units[i] + wordUnits(word);
        }
        pauses[count] = count > 0 ? pauses[count - 1] : 0;
        const last = words[count - 1] || '';
        return { units, pauses, trailing: STOP_END.test(last) ? TIMING.trailing.stop : TIMING.trailing.none };
    }

    /** Seconds the voice takes from word `from` to word `to` of a laid-out text. */
    function secondsBetween(timing, from, to, speed, lettersPerSecond) {
        return (
            (timing.pauses[to] - timing.pauses[from]) / speed +
            (timing.units[to] - timing.units[from]) / (lettersPerSecond * speed)
        );
    }

    /**
     * The voice's speed, learnt from what it has already read.
     *
     * Everything heard so far counts in proportion to its length, starting from the
     * measured speed as if it had been heard for a few seconds: a title of three words
     * barely moves it, where a running average took three paragraphs to recover from one.
     */
    function createSpeedLearner() {
        let unitsHeard = 0;
        let secondsHeard = 0;
        const learner = {
            lettersPerSecond: TIMING.lettersPerSecond,
            /**
             * `units` letters took `seconds` at `speed`, of which `silentAtSpeed1` seconds
             * (at speed 1) were pauses and the silence after the last word.
             */
            learn(units, seconds, speed, silentAtSpeed1) {
                const speech = seconds * speed - silentAtSpeed1;
                if (units < 12 || speech < 0.4) return false;
                const measured = units / speech;
                const [low, high] = TIMING.lettersPerSecondBounds;
                if (measured < low || measured > high) return false;
                unitsHeard += units;
                secondsHeard += speech;
                learner.lettersPerSecond =
                    (unitsHeard + TIMING.lettersPerSecond * TIMING.priorSeconds) / (secondsHeard + TIMING.priorSeconds);
                return true;
            },
        };
        return learner;
    }

    function enginePitch(pitch) {
        return Math.max(MIN_PITCH, clamp(pitch, 0, 2, 1));
    }

    /** Sets rate, pitch and volume on an utterance whose voice and lang are already set. */
    function applyToUtterance(utterance, settings = {}) {
        utterance.rate = engineRate(settings.rate, utterance.voice, utterance.lang);
        utterance.pitch = enginePitch(settings.pitch);
        utterance.volume = clamp(settings.volume, 0, 1, 1);
        return utterance;
    }

    globalThis.ItgSpeechTuning = {
        engineRate,
        realSpeed,
        enginePitch,
        TIMING,
        timingOf,
        secondsBetween,
        createSpeedLearner,
        applyToUtterance,
        isGoogleNetworkVoice,
        GOOGLE_NETWORK_CURVE,
    };
})();
