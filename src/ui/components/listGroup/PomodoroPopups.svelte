<script>
    import { t } from '../../stores/i18nStore.js';
</script>

<!-- POMODORO TIME: CALENDAR POPUP -->
<div id="pomo-custom-calendar-popup" class="pomo-custom-calendar hidden">
    <div class="pomo-cal-header">
        <button id="pomo-cal-prev-btn" type="button">&lt;</button>
        <span id="pomo-cal-month-year"></span>
        <button id="pomo-cal-next-btn" type="button">&gt;</button>
    </div>
    <div class="pomo-cal-weekdays">
        <span>{$t('daySunInitial') || 'S'}</span><span>{$t('dayMonInitial') || 'M'}</span>
        <span>{$t('dayTueInitial') || 'T'}</span><span>{$t('dayWedInitial') || 'W'}</span>
        <span>{$t('dayThuInitial') || 'T'}</span><span>{$t('dayFriInitial') || 'F'}</span>
        <span>{$t('daySatInitial') || 'S'}</span>
    </div>
    <div id="pomo-calendar-days-grid" class="pomo-cal-grid"></div>
    <div class="pomo-cal-footer">
        <button id="pomo-cal-clear-btn" type="button">{$t('reset') || 'Today'}</button>
    </div>
</div>

<!-- POMODORO TIME: TIME POPUP -->
<div id="pomo-custom-time-popup" class="custom-time-picker hidden">
    <div class="time-picker-main-row">
        <div class="time-arrows">
            <button class="time-arrow-btn" data-unit="hour" data-dir="up" type="button">▲</button>
            <button class="time-arrow-btn" data-unit="hour" data-dir="down" type="button">▼</button>
        </div>
        <div class="time-input-container">
            <input type="text" id="pomo-input-hour" maxlength="2" inputmode="numeric" placeholder="00" />
            <span>:</span>
            <input type="text" id="pomo-input-minute" maxlength="2" inputmode="numeric" placeholder="00" />
        </div>
        <div class="time-arrows">
            <button class="time-arrow-btn" data-unit="minute" data-dir="up" type="button">▲</button>
            <button class="time-arrow-btn" data-unit="minute" data-dir="down" type="button">▼</button>
        </div>
    </div>
    <div class="time-picker-label">{$t('format24h') || '24h'}</div>
</div>
