/**
 * What the readers hand to the speech engine (src/utils/speechTuning.js).
 *
 * Chrome's network voices drop a pitch of 0 (the engine only sends a truthy pitch) and
 * speed up far more than the rate says above 1 (×2 read a sentence 3.7 times faster).
 * The curve these tests hold the mapping to was measured on Chrome 151.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const google = { name: 'Google español', lang: 'es-ES', localService: false, default: false };
const local = { name: 'eSpeak Spanish', lang: 'es-ES', localService: true, default: true };

function load(voices = [google]) {
    const context = { speechSynthesis: { getVoices: () => voices }, Math, Number, String };
    context.globalThis = context;
    vm.createContext(context);
    vm.runInContext(readFileSync('src/utils/speechTuning.js', 'utf8'), context);
    return context.ItgSpeechTuning;
}

/** How many times faster than rate 1 the network voice reads at `rate`, from the curve. */
function measuredSpeedAt(tuning, rate) {
    const curve = tuning.GOOGLE_NETWORK_CURVE;
    for (let i = 1; i < curve.length; i++) {
        const [r0, f0] = curve[i - 1];
        const [r1, f1] = curve[i];
        if (rate <= r1) return f0 + ((rate - r0) * (f1 - f0)) / (r1 - r0);
    }
    return curve[curve.length - 1][1];
}

describe('speechTuning.js', () => {
    it('never hands the engine a pitch of zero, which the network voices ignore', () => {
        const tuning = load();
        assert.ok(tuning.enginePitch(0) > 0, 'pitch 0 must reach the engine as a positive value');
        assert.ok(tuning.enginePitch(0) <= 0.01, 'and still be the bottom of the range');
        assert.equal(tuning.enginePitch(1), 1);
        assert.equal(tuning.enginePitch(2), 2);
        assert.equal(tuning.enginePitch(undefined), 1);
    });

    it('makes ×2 sound like 1.7 times the voice, and leaves ×1 and below as they are', () => {
        const tuning = load();
        assert.equal(tuning.realSpeed(1), 1);
        assert.equal(tuning.realSpeed(0.5), 0.5);
        assert.ok(Math.abs(tuning.realSpeed(2) - 1.7) < 1e-9, 'the top of the range is 1.7');
        assert.ok(Math.abs(tuning.realSpeed(1.5) - 1.35) < 1e-9, 'halfway up is halfway to 1.7');
    });

    it('reads at that real speed on a Google network voice', () => {
        const tuning = load();
        for (const speed of [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]) {
            const rate = tuning.engineRate(speed, google, 'es-ES');
            const actual = measuredSpeedAt(tuning, rate);
            const wanted = tuning.realSpeed(speed);
            assert.ok(
                Math.abs(actual - wanted) / wanted < 0.02,
                `×${speed} came out ×${actual.toFixed(2)}, wanted ×${wanted} (rate ${rate})`,
            );
        }
    });

    it('rises steadily across the whole range, beyond the measured points too', () => {
        const tuning = load();
        let previous = 0;
        for (let speed = 0.25; speed <= 4; speed += 0.05) {
            const rate = tuning.engineRate(speed, google, 'es-ES');
            assert.ok(rate > previous, `rate must grow with speed (at ×${speed.toFixed(2)})`);
            previous = rate;
        }
    });

    it('treats "automatic" as the voice Chrome will pick for the language', () => {
        assert.equal(load([google]).engineRate(2, null, 'es-ES') < 2, true, 'only network voices: mapped');
        assert.ok(
            Math.abs(load([local, google]).engineRate(2, null, 'es-ES') - 1.7) < 1e-9,
            'a local voice first: the real speed, no curve',
        );
    });

    it('hands any other voice the real speed as it is', () => {
        const tuning = load([local]);
        assert.ok(Math.abs(tuning.engineRate(2, local, 'es-ES') - 1.7) < 1e-9, 'the real speed, no curve');
        assert.equal(tuning.engineRate(1.25, local, 'es-ES'), tuning.realSpeed(1.25));
    });

    it('applies all three to an utterance', () => {
        const tuning = load();
        const utterance = tuning.applyToUtterance({ voice: google, lang: 'es-ES' }, { rate: 1, pitch: 0, volume: 0.5 });
        assert.equal(utterance.rate, 1);
        assert.ok(utterance.pitch > 0);
        assert.equal(utterance.volume, 0.5);
    });

    it('is loaded before the page reader, and by the extension pages', () => {
        const handler = readFileSync('src/core/background/handlers/read-aloud.js', 'utf8');
        assert.match(handler, /files:\s*\[\s*'src\/utils\/speechTuning\.js',\s*'src\/utils\/readAloud\.js'\s*\]/);
        assert.match(
            readFileSync('src/ui/services/speechService.js', 'utf8'),
            /import '\.\.\/\.\.\/utils\/speechTuning\.js'/,
        );
        const reader = readFileSync('src/utils/readAloud.js', 'utf8');
        assert.equal(/utterance\.(rate|pitch)\s*=/.test(reader), false, 'the reader must not set rate or pitch itself');
    });
});

describe('speechTuning.js — following the voice word by word', () => {
    const fixture = JSON.parse(readFileSync('test/fixtures/readerTimingGoogleEs135.json', 'utf8'));

    it('lays out the pauses a text makes the voice take', () => {
        const tuning = load();
        const timing = tuning.timingOf(['Hola,', 'que', '"tal"', 'estás.', 'Bien']);
        const pauseBefore = (i) => +(timing.pauses[i] - (i > 0 ? timing.pauses[i - 1] : 0)).toFixed(2);
        assert.equal(pauseBefore(0), 0);
        assert.equal(pauseBefore(1), tuning.TIMING.pause.comma, 'after a comma');
        assert.equal(pauseBefore(2), tuning.TIMING.pause.quote, 'before an opening quote');
        assert.equal(pauseBefore(3), tuning.TIMING.pause.quote, 'after a closing quote');
        assert.equal(pauseBefore(4), tuning.TIMING.pause.stop, 'after a full stop');
        assert.equal(timing.units[5], 4 + 3 + 3 + 5 + 4);
        assert.ok(tuning.timingOf(['en', '2023']).units[2] > 15, 'a number takes far longer than it looks');
    });

    it('does not let a short title throw the learnt speed off', () => {
        const tuning = load();
        const learner = tuning.createSpeedLearner();
        // The recorded title that opens the fixture, read before any paragraph.
        const title = fixture.paragraphs[0];
        const words = title.text.split(/\s+/);
        const timing = tuning.timingOf(words);
        learner.learn(timing.units[words.length], title.eventSeconds - 0.09, title.speed, timing.trailing);
        const moved =
            Math.abs(learner.lettersPerSecond - tuning.TIMING.lettersPerSecond) / tuning.TIMING.lettersPerSecond;
        assert.ok(moved < 0.1, `a ${words.length}-word title moved the speed by ${(moved * 100).toFixed(0)}%`);
    });

    /**
     * The reader's clock against real audio it was not fitted on: when the voice comes
     * back from each pause, how far off the clock is about the word it resumes on.
     */
    it('follows recorded audio far better than spreading the text evenly did', () => {
        const tuning = load();
        const LEAD = 0.09;
        const pauseWords = (words) => {
            const timing = tuning.timingOf(words);
            return words.map((_, i) => i).filter((i) => i > 0 && timing.pauses[i] > timing.pauses[i - 1]);
        };
        const learner = tuning.createSpeedLearner();
        let charsPerSecond = null;
        const errorsNew = [];
        const errorsOld = [];
        for (const paragraph of fixture.paragraphs) {
            const words = paragraph.text.split(/\s+/).filter(Boolean);
            const timing = tuning.timingOf(words);
            const resumes = pauseWords(words);
            const starts = [];
            let at = 0;
            for (const word of words) {
                at = paragraph.text.indexOf(word, at);
                starts.push(at);
                at += word.length;
            }
            if (resumes.length === paragraph.pauses.length) {
                resumes.forEach((wordIndex, k) => {
                    const truth = paragraph.pauses[k][1] + LEAD;
                    const predicted =
                        LEAD + tuning.secondsBetween(timing, 0, wordIndex, paragraph.speed, learner.lettersPerSecond);
                    errorsNew.push(Math.abs(predicted - truth));
                    const cps = (charsPerSecond || 15.5) * paragraph.speed;
                    errorsOld.push(Math.abs(starts[wordIndex] / cps - truth));
                });
            }
            learner.learn(
                timing.units[words.length],
                paragraph.eventSeconds - LEAD,
                paragraph.speed,
                timing.pauses[words.length] + timing.trailing,
            );
            const measured = paragraph.text.length / paragraph.eventSeconds / paragraph.speed;
            charsPerSecond = charsPerSecond === null ? measured : charsPerSecond * 0.6 + measured * 0.4;
        }
        const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
        assert.ok(errorsNew.length >= 15, `enough pauses to judge (${errorsNew.length})`);
        assert.ok(mean(errorsNew) < 0.3, `mean error ${(mean(errorsNew) * 1000).toFixed(0)}ms must stay under 300ms`);
        assert.ok(
            mean(errorsNew) < mean(errorsOld) * 0.65,
            `${(mean(errorsNew) * 1000).toFixed(0)}ms against ${(mean(errorsOld) * 1000).toFixed(0)}ms spreading the text evenly`,
        );
    });
});
