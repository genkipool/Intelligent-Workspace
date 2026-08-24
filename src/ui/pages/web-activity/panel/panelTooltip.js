/**
 * [AI INSTRUCTION]
 * PREMIUM THEME-AWARE FLOATING TOOLTIP FOR WEB ACTIVITY SIDE PANEL.
 *
 * Replaces the browser's raw native title tooltip with a structured, highly legible,
 * theme-variable driven card displaying live statistics, allowances, and schedule details.
 * Features an invisible hover bridge and click handlers to jump straight to the relevant
 * limit tab (Daily, Weekly, Schedule).
 */
import { get } from 'svelte/store';
import { fmtDur, fmtHm } from '../../../services/dashboard/format.js';
import { t } from '../../../stores/i18nStore.js';

let tooltipEl = null;
let currentTarget = null;
let hideTimer = null;

function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getFillColor(percent) {
    if (percent >= 100) return 'var(--error-color)';
    if (percent >= 80) return 'var(--action-color)';
    return 'var(--interactive-color)';
}

function positionTooltip(target) {
    if (!tooltipEl || !target || !document.body.contains(target)) {
        hideSiteTooltip(true);
        return;
    }

    const rect = target.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();
    const padding = 8;

    // Prefer showing below target; if overflowing bottom, flip to above
    let top = rect.bottom + 6;
    let isAbove = false;
    if (top + tooltipRect.height > window.innerHeight - padding) {
        top = Math.max(padding, rect.top - tooltipRect.height - 6);
        isAbove = true;
    }

    tooltipEl.classList.toggle('is-above', isAbove);

    // Align horizontally centered on the target element or clamped to the viewport
    let left = rect.left + rect.width / 2 - tooltipRect.width / 2;
    if (left + tooltipRect.width > window.innerWidth - padding) {
        left = window.innerWidth - tooltipRect.width - padding;
    }
    left = Math.max(padding, left);

    tooltipEl.style.top = `${Math.round(top)}px`;
    tooltipEl.style.left = `${Math.round(left)}px`;
}

export function showSiteTooltip(target, data) {
    if (!target || !data) return;
    clearTimeout(hideTimer);

    if (currentTarget === target && tooltipEl) {
        return;
    }

    hideSiteTooltip(true);

    const tr = (key, ...params) => get(t)(key, params) || chrome.i18n?.getMessage(key) || key;

    const isBlocked = !!data.blocked;
    const isPaused =
        data.dailyLimitEnabled === false && data.weeklyLimitEnabled === false && data.scheduleEnabled === false;

    let statusBadge = '';
    if (isBlocked) {
        const reasonKey = data.blockedReason
            ? `webActivityStateBlocked_${data.blockedReason}`
            : 'webActivityStateBlocked';
        statusBadge = `<span class="wa-stt-badge wa-stt-badge-blocked">${escapeHtml(tr(reasonKey))}</span>`;
    } else if (isPaused) {
        statusBadge = `<span class="wa-stt-badge wa-stt-badge-paused">${escapeHtml(tr('webActivityLimitPaused'))}</span>`;
    }

    const dailySet = (data.dailyLimitSeconds || 0) > 0;
    const dailyPct = data.dailyPercent ?? 0;
    const dailyFill = getFillColor(dailyPct);

    const weeklySet = (data.weeklyLimitSeconds || 0) > 0;
    const weeklyPct = data.weeklyPercent ?? 0;
    const weeklyFill = getFillColor(weeklyPct);

    const hasSchedule = !!data.hasSchedule;
    const scheduleText = data.scheduleText || tr('webActivityNoLimitSet');

    const html = `
        <div class="wa-stt-header">
            <img class="wa-stt-favicon" src="${escapeHtml(data.favicon)}" alt="" loading="lazy" />
            <span class="wa-stt-domain" title="${escapeHtml(data.domain)}">${escapeHtml(data.domain)}</span>
            ${statusBadge}
        </div>

        <div class="wa-stt-stats">
            <div class="wa-stt-stat">
                <span class="wa-stt-stat-label">${escapeHtml(tr('webActivityColTime'))}</span>
                <span class="wa-stt-stat-val wa-stt-highlight">${escapeHtml(fmtHm(data.seconds || 0))}</span>
            </div>
            <div class="wa-stt-stat">
                <span class="wa-stt-stat-label">${escapeHtml(tr('webActivityColVisits'))}</span>
                <span class="wa-stt-stat-val">${data.visits || 0} <span class="wa-stt-sub">(${data.visits > 0 ? fmtDur(data.perVisit || 0) : '--'})</span></span>
            </div>
            <div class="wa-stt-stat">
                <span class="wa-stt-stat-label">${escapeHtml(tr('webActivityColShare'))}</span>
                <span class="wa-stt-stat-val">${data.sharePercent || 0}%</span>
            </div>
        </div>

        <div class="wa-stt-rules">
            <button type="button" class="wa-stt-rule-btn" data-tab="daily" title="${escapeHtml(tr('webActivityConfigureLimit'))}">
                <div class="wa-stt-rule-head">
                    <span class="wa-stt-rule-name">${escapeHtml(tr('webActivityColDaily'))}</span>
                    <span class="wa-stt-rule-val ${!dailySet ? 'wa-muted' : ''}">
                        ${dailySet ? escapeHtml(fmtHm(data.dailyLimitSeconds)) : escapeHtml(tr('webActivityNoLimitSet'))}
                        ${dailySet && data.dailyLimitEnabled === false ? ` <span class="wa-stt-sub">(${escapeHtml(tr('webActivityLimitPaused'))})</span>` : ''}
                    </span>
                </div>
                ${
                    dailySet
                        ? `
                <div class="wa-stt-rule-bar-row">
                    <div class="wa-stt-rule-bar">
                        <div class="wa-stt-rule-fill" style="width: ${Math.min(100, dailyPct)}%; background: ${dailyFill};"></div>
                    </div>
                    <span class="wa-stt-rule-pct" style="color: ${dailyFill}">${dailyPct}%</span>
                </div>`
                        : ''
                }
            </button>

            <button type="button" class="wa-stt-rule-btn" data-tab="weekly" title="${escapeHtml(tr('webActivityConfigureLimit'))}">
                <div class="wa-stt-rule-head">
                    <span class="wa-stt-rule-name">${escapeHtml(tr('webActivityColWeekly'))}</span>
                    <span class="wa-stt-rule-val ${!weeklySet ? 'wa-muted' : ''}">
                        ${weeklySet ? escapeHtml(fmtHm(data.weeklyLimitSeconds)) : escapeHtml(tr('webActivityNoLimitSet'))}
                        ${weeklySet && data.weeklyLimitEnabled === false ? ` <span class="wa-stt-sub">(${escapeHtml(tr('webActivityLimitPaused'))})</span>` : ''}
                    </span>
                </div>
                ${
                    weeklySet
                        ? `
                <div class="wa-stt-rule-bar-row">
                    <div class="wa-stt-rule-bar">
                        <div class="wa-stt-rule-fill" style="width: ${Math.min(100, weeklyPct)}%; background: ${weeklyFill};"></div>
                    </div>
                    <span class="wa-stt-rule-pct" style="color: ${weeklyFill}">${weeklyPct}%</span>
                </div>`
                        : ''
                }
            </button>

            <button type="button" class="wa-stt-rule-btn" data-tab="schedule" title="${escapeHtml(tr('webActivityConfigureSchedule'))}">
                <div class="wa-stt-rule-head">
                    <span class="wa-stt-rule-name">${escapeHtml(tr('webActivityColSchedule'))}</span>
                    <span class="wa-stt-rule-val ${!hasSchedule ? 'wa-muted' : ''}">
                        ${escapeHtml(scheduleText)}
                        ${hasSchedule && data.scheduleEnabled === false ? ` <span class="wa-stt-sub">(${escapeHtml(tr('webActivityLimitPaused'))})</span>` : ''}
                    </span>
                </div>
            </button>
        </div>
    `;

    tooltipEl = document.createElement('div');
    tooltipEl.className = 'wa-site-tooltip';
    tooltipEl.setAttribute('translate', 'no');
    tooltipEl.innerHTML = html;
    currentTarget = target;

    // Hover management on tooltip element (safe hover bridge)
    tooltipEl.addEventListener('mouseenter', () => {
        clearTimeout(hideTimer);
    });

    tooltipEl.addEventListener('mouseleave', () => {
        scheduleHide();
    });

    // Click navigation for daily, weekly, and schedule rules
    tooltipEl.addEventListener('click', (e) => {
        const btn = e.target.closest('.wa-stt-rule-btn');
        if (!btn) return;
        const tab = btn.getAttribute('data-tab');
        hideSiteTooltip(true);
        if (tab === 'schedule') {
            if (data.onEditSchedule) data.onEditSchedule();
            else data.onEditLimit?.('schedule');
        } else if (tab === 'daily' || tab === 'weekly') {
            data.onEditLimit?.(tab);
        }
    });

    document.body.appendChild(tooltipEl);

    requestAnimationFrame(() => {
        if (!tooltipEl) return;
        positionTooltip(target);
        tooltipEl.classList.add('visible');
    });

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleScroll, true);
}

function handleScroll() {
    hideSiteTooltip(true);
}

export function scheduleHide(delay = 180) {
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
        hideSiteTooltip(true);
    }, delay);
}

export function hideSiteTooltip(immediate = false) {
    clearTimeout(hideTimer);
    if (!immediate && tooltipEl) {
        scheduleHide();
        return;
    }
    window.removeEventListener('scroll', handleScroll, true);
    window.removeEventListener('resize', handleScroll, true);
    if (tooltipEl) {
        tooltipEl.remove();
        tooltipEl = null;
    }
    currentTarget = null;
}

/** Svelte Action for attaching the tooltip to a DOM node */
export function siteTooltip(node, getData) {
    function onEnter() {
        const data = typeof getData === 'function' ? getData() : getData;
        if (!data) return;
        showSiteTooltip(node, data);
    }

    function onLeave() {
        scheduleHide(180);
    }

    node.addEventListener('mouseenter', onEnter);
    node.addEventListener('mouseleave', onLeave);
    node.addEventListener('focus', onEnter);
    node.addEventListener('blur', onLeave);

    return {
        update(newGetData) {
            getData = newGetData;
        },
        destroy() {
            node.removeEventListener('mouseenter', onEnter);
            node.removeEventListener('mouseleave', onLeave);
            node.removeEventListener('focus', onEnter);
            node.removeEventListener('blur', onLeave);
            hideSiteTooltip(true);
        },
    };
}
