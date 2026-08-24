<script>
    /**
     * Reading voice settings.
     *
     * One place decides how everything in the extension sounds: the page reader, the
     * notes and the AI assistant all build their utterances through
     * `speechService.createUtterance()`, which reads exactly the object this section
     * writes. Left on "automatic" the browser keeps choosing, which is what it did
     * before this section existed.
     *
     * The voices come from `speechSynthesis.getVoices()`, so the list is the one the
     * operating system installed — it differs between machines, and on a cold
     * profile it arrives a moment after the page does.
     */
    import { onMount } from 'svelte';
    import SelectField from '../../../components/common/SelectField.svelte';
    import { showNotification } from '../../../../utils/i18n.js';
    import { DEFAULT_SPEECH_SETTINGS, SPEECH_SETTINGS_KEY } from '../../../services/speechService.js';

    /** What each slider may be set to, in the order the markup lays them out. */
    const SLIDERS = [
        { key: 'rate', i18n: 'speechRateLabel', min: 0.5, max: 2, step: 0.05 },
        { key: 'pitch', i18n: 'speechPitchLabel', min: 0, max: 2, step: 0.05 },
        { key: 'volume', i18n: 'speechVolumeLabel', min: 0, max: 1, step: 0.05 },
    ];

    let settings = $state({ ...DEFAULT_SPEECH_SETTINGS });
    let voices = $state([]);
    let ready = $state(false);

    /**
     * Voices grouped by language, because a machine can easily report sixty of them
     * and a flat list of sixty is not a list anybody reads.
     */
    let voiceOptions = $derived.by(() => {
        const auto = { value: '', label: chrome.i18n.getMessage('speechVoiceAuto') || 'Automatic' };
        if (voices.length === 0) return [auto];

        const byLanguage = {};
        voices.forEach((voice) => {
            (byLanguage[voice.lang] ||= []).push({
                value: voice.voiceURI,
                // The star marks the one the system would have used on its own.
                label: voice.default ? `${voice.name} ★` : voice.name,
            });
        });

        const groups = Object.keys(byLanguage)
            .sort((a, b) => a.localeCompare(b))
            .map((lang) => ({ label: lang, options: byLanguage[lang] }));

        return [auto, ...groups];
    });

    /** The chosen voice may have been uninstalled since it was picked. */
    let missingVoice = $derived(
        ready && settings.voiceURI !== '' && !voices.some((voice) => voice.voiceURI === settings.voiceURI),
    );

    function save(next) {
        settings = next;
        chrome.storage.sync.set({ [SPEECH_SETTINGS_KEY]: { ...next } });
    }

    function pickVoice(voiceURI) {
        save({ ...settings, voiceURI });
    }

    function setSlider(key, value) {
        save({ ...settings, [key]: Number(value) });
    }

    function reset() {
        save({ ...DEFAULT_SPEECH_SETTINGS });
        showNotification('speechSettingsSaved');
    }

    /** Reads a sample sentence with exactly the settings above, as they are now. */
    function test() {
        speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(
            chrome.i18n.getMessage('speechTestPhrase') || 'This is how the chosen voice reads.',
        );
        const voice = voices.find((candidate) => candidate.voiceURI === settings.voiceURI);
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        } else {
            utterance.lang = chrome.i18n.getUILanguage() || 'en-US';
        }
        utterance.rate = settings.rate;
        utterance.pitch = settings.pitch;
        utterance.volume = settings.volume;
        speechSynthesis.speak(utterance);
    }

    function readVoices() {
        voices = speechSynthesis.getVoices();
    }

    onMount(() => {
        chrome.storage.sync.get([SPEECH_SETTINGS_KEY], (data) => {
            settings = { ...DEFAULT_SPEECH_SETTINGS, ...(data?.[SPEECH_SETTINGS_KEY] || {}) };
            ready = true;
        });

        readVoices();
        speechSynthesis.addEventListener('voiceschanged', readVoices);

        return () => {
            speechSynthesis.removeEventListener('voiceschanged', readVoices);
            speechSynthesis.cancel();
        };
    });
</script>

<section class="section itg-manage-section">
    <div class="section-header">
        <div class="section-header-alignment">
            <h2 class="section-title" data-i18n="speechSectionTitle">Reading voice</h2>
        </div>
    </div>
    <p class="section-desc" data-i18n="speechSectionDesc"></p>

    <div class="voice-grid">
        <div class="voice-row">
            <span class="voice-label" data-i18n="speechVoiceLabel">Voice</span>
            <SelectField
                id="speech-voice-select"
                wide
                value={settings.voiceURI}
                options={voiceOptions}
                disabled={!ready}
                ariaLabel={chrome.i18n.getMessage('speechVoiceLabel') || 'Voice'}
                onchange={pickVoice}
            />
        </div>

        {#if voices.length === 0 && ready}
            <p class="voice-warning" data-i18n="speechVoicesUnavailable"></p>
        {:else if missingVoice}
            <p class="voice-warning" data-i18n="speechVoicesUnavailable"></p>
        {/if}

        {#each SLIDERS as slider (slider.key)}
            <div class="voice-row">
                <span class="voice-label" data-i18n={slider.i18n}></span>
                <input
                    class="voice-slider"
                    type="range"
                    min={slider.min}
                    max={slider.max}
                    step={slider.step}
                    value={settings[slider.key]}
                    disabled={!ready}
                    aria-label={chrome.i18n.getMessage(slider.i18n) || slider.key}
                    oninput={(event) => setSlider(slider.key, event.currentTarget.value)}
                />
                <output class="voice-value">{Number(settings[slider.key]).toFixed(2)}</output>
            </div>
        {/each}

        <div class="voice-actions">
            <button type="button" class="button button-secondary" onclick={test} data-i18n="speechTestVoice"></button>
            <button type="button" class="button button-secondary" onclick={reset} data-i18n="speechResetDefaults"
            ></button>
        </div>
    </div>
</section>

<style>
    .section-desc {
        font-size: 12px;
        line-height: 1.45;
        color: var(--text-color, #fff);
        opacity: 0.72;
        margin: 8px 0 12px 0;
        max-width: 70ch;
    }

    .voice-grid {
        display: flex;
        flex-direction: column;
        gap: 12px;
        padding-bottom: 12px;
        max-width: 640px;
    }

    /* The label keeps its column until the row no longer fits, and then everything
       stacks — the page is also the side panel, which is narrow. */
    .voice-row {
        display: grid;
        grid-template-columns: minmax(80px, 140px) 1fr auto;
        align-items: center;
        gap: 10px;
    }

    .voice-label {
        font-size: 13px;
        color: var(--text-color, #fff);
    }

    .voice-value {
        font-size: 12px;
        min-width: 4ch;
        text-align: right;
        opacity: 0.75;
        font-variant-numeric: tabular-nums;
        color: var(--text-color, #fff);
    }

    .voice-slider {
        width: 100%;
        accent-color: var(--action-color, var(--interactive-color, #3498db));
        cursor: pointer;
    }

    .voice-slider:disabled {
        opacity: 0.5;
        cursor: default;
    }

    .voice-warning {
        margin: 0;
        font-size: 12px;
        color: var(--error-color, #e74c3c);
    }

    .voice-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
    }

    @media (max-width: 520px) {
        .voice-row {
            grid-template-columns: 1fr auto;
        }

        .voice-label {
            grid-column: 1 / -1;
        }
    }
</style>
