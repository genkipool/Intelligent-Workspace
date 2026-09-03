<script>
    /**
     * [AI INSTRUCTION]
     * HOW THE CLOCK BEHAVES.
     *
     * Every setting here changes a number the dashboard shows, which is the test for
     * whether a setting belongs on this page at all. They are written
     * through the service worker rather than straight to storage: the idle threshold
     * is a browser-level setting and turning the tracking off has to stop the clock
     * now, not at the next tab switch.
     */
    import '../../../../core/services/webActivitySchema.js';
    import { t, tt } from '../../../stores/i18nStore.js';
    import NumberField from '../../../components/common/NumberField.svelte';
    import ToggleButton from '../../../components/common/ToggleButton.svelte';

    const WA = globalThis.ITG_WEB_ACTIVITY;

    let { settings = {}, onChange } = $props();

    const set = (patch) => onChange(patch);

    /**
     * The stored value, or the shipped default — never a number written out here. A
     * fallback typed into the markup is a second place the default lives, and it
     * drifts: this file still said 60 seconds long after the default became 300, so
     * a fresh profile showed a number the tracker was not using.
     */
    const valueOf = (key) => settings[key] ?? WA.DEFAULT_SETTINGS[key];
    const isOn = (key) => (settings[key] ?? WA.DEFAULT_SETTINGS[key]) !== false;
</script>

<div class="set-block">
    <div class="set-rows">
        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivityTrackingEnabled')}</span>
                <span class="set-row-note">{$t('webActivityTrackingEnabledHint')}</span>
            </span>
            <span class="set-row-control">
                <ToggleButton
                    variant="rounded"
                    pressed={isOn('enabled')}
                    label={$t(isOn('enabled') ? 'toggleOn' : 'toggleOff')}
                    title={$tt('webActivityTrackingEnabled')}
                    onchange={(next) => set({ enabled: next })}
                />
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivityIdleSeconds')}</span>
                <span class="set-row-note">{$t('webActivityIdleSecondsHint')}</span>
            </span>
            <span class="set-row-control">
                <NumberField
                    wide
                    value={valueOf('idleSeconds')}
                    min={15}
                    max={900}
                    step={15}
                    digits={3}
                    ariaLabel={$t('webActivityIdleSeconds')}
                    onchange={(next) => set({ idleSeconds: next })}
                />
                <span class="set-unit">{$t('unitSecondsShort')}</span>
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivityCountAudible')}</span>
                <span class="set-row-note">{$t('webActivityCountAudibleHint')}</span>
            </span>
            <span class="set-row-control">
                <ToggleButton
                    variant="rounded"
                    pressed={isOn('countAudible')}
                    label={$t(isOn('countAudible') ? 'toggleOn' : 'toggleOff')}
                    title={$tt('webActivityCountAudible')}
                    onchange={(next) => set({ countAudible: next })}
                />
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivityNotifyAtDefault')}</span>
                <span class="set-row-note">{$t('webActivityNotifyAtDefaultHint')}</span>
            </span>
            <span class="set-row-control">
                <NumberField
                    wide
                    value={valueOf('notifyAtPercent')}
                    min={0}
                    max={100}
                    step={5}
                    digits={3}
                    ariaLabel={$t('webActivityNotifyAtDefault')}
                    onchange={(next) => set({ notifyAtPercent: next })}
                />
                <span class="set-unit">%</span>
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivitySnoozeMinutes')}</span>
                <span class="set-row-note">{$t('webActivitySnoozeMinutesHint')}</span>
            </span>
            <span class="set-row-control">
                <NumberField
                    wide
                    value={valueOf('snoozeMinutes')}
                    min={0}
                    max={120}
                    step={5}
                    digits={3}
                    ariaLabel={$t('webActivitySnoozeMinutes')}
                    onchange={(next) => set({ snoozeMinutes: next })}
                />
                <span class="set-unit">{$t('unitMinutesShort')}</span>
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivitySnoozePasswordAfter')}</span>
                <span class="set-row-note">{$t('webActivitySnoozePasswordAfterHint')}</span>
            </span>
            <span class="set-row-control">
                <NumberField
                    wide
                    value={valueOf('snoozePasswordAfter')}
                    min={0}
                    max={20}
                    step={1}
                    digits={2}
                    ariaLabel={$t('webActivitySnoozePasswordAfter')}
                    onchange={(next) => set({ snoozePasswordAfter: next })}
                />
                <span class="set-unit">{$t('webActivitySnoozeUsesShort')}</span>
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivitySyncEnabled')}</span>
                <span class="set-row-note">{$t('webActivitySyncEnabledHint')}</span>
            </span>
            <span class="set-row-control">
                <ToggleButton
                    variant="rounded"
                    pressed={settings.syncEnabled === true}
                    label={$t(settings.syncEnabled === true ? 'toggleOn' : 'toggleOff')}
                    title={$tt('webActivitySyncEnabled')}
                    onchange={(next) => set({ syncEnabled: next })}
                />
            </span>
        </div>

        <div class="set-row">
            <span class="set-row-text">
                <span class="set-row-name">{$t('webActivityRetentionDays')}</span>
                <span class="set-row-note">{$t('webActivityRetentionDaysHint')}</span>
            </span>
            <span class="set-row-control">
                <NumberField
                    wide
                    value={valueOf('retentionDays')}
                    min={7}
                    max={730}
                    step={7}
                    digits={3}
                    ariaLabel={$t('webActivityRetentionDays')}
                    onchange={(next) => set({ retentionDays: next })}
                />
                <span class="set-unit">{$t('webActivityDaysShort')}</span>
            </span>
        </div>
    </div>
</div>
