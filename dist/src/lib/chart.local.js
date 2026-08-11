/**
 * chart.local.js — Lightweight charting engine compatible with Chart.js API
 * Supports: bar (vertical + horizontal), line (with fill + multi-dataset), doughnut
 * Designed for use in Chrome extensions (no external dependencies).
 *
 * FIXES:
 * - ResizeObserver uses entry.contentRect to avoid infinite growth loop
 * - All colors and fonts use CSS variables from the active theme (not hardcoded)
 */
(function (global) {
    'use strict';

    // ─── Global defaults ────────────────────────────────────────────
    const defaults = {
        color: 'var(--text-color)',
        font: {
            family: "'Roboto Mono', monospace",
            size: 10,
        },
    };

    // ─── Helpers ──────────────────────────────────────────────────────
    function resolveColor(c) {
        if (!c) return getCanvasStyle('--text-color', 'rgba(100,100,100,0.5)');
        return c;
    }

    function parsePct(v) {
        if (typeof v === 'string' && v.endsWith('%')) return parseFloat(v) / 100;
        if (typeof v === 'number') return v;
        return 0.68;
    }

    function hexToRgba(hex, alpha) {
        if (!hex || !hex.startsWith('#')) return hex;
        let h = hex.slice(1);
        if (h.length === 3)
            h = h
                .split('')
                .map((x) => x + x)
                .join('');
        const n = parseInt(h, 16);
        return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
    }

    function getCanvasStyle(key, fallback) {
        try {
            return getComputedStyle(document.documentElement).getPropertyValue(key).trim() || fallback;
        } catch (e) {
            return fallback || '';
        }
    }

    /**
     * Resolves var(--name) to its actual computed value.
     * DOES NOT use hardcoded map — always reads from active theme.
     */
    function resolveVar(c) {
        if (!c || typeof c !== 'string') return c;
        if (c.startsWith('var(--') && c.endsWith(')')) {
            const name = c.slice(4, -1);
            const resolved = getCanvasStyle(name, '');
            return resolved || getCanvasStyle('--text-color', 'transparent');
        }
        return c;
    }

    // ─── Tooltip overlay ──────────────────────────────────────────────
    let tooltipEl = null;

    function getTooltip() {
        if (!tooltipEl) {
            tooltipEl = document.createElement('div');
            tooltipEl.id = '_chart_tooltip';
            // Use theme CSS vars — NO hardcoded colors
            Object.assign(tooltipEl.style, {
                position: 'fixed',
                pointerEvents: 'none',
                zIndex: '9999',
                display: 'none',
                borderRadius: '8px',
                padding: '8px 12px',
                lineHeight: '1.5',
                maxWidth: '220px',
                whiteSpace: 'pre-line',
            });
            // Apply variables dynamically to update with the theme
            const applyThemeStyles = () => {
                const bg = getCanvasStyle('--bg-panel-color', '#2c2c2c');
                const border = getCanvasStyle('--border-color', '#333');
                const color = getCanvasStyle('--text-on-color', '#eee');
                const font = getCanvasStyle('--mono', "'Roboto Mono', monospace");
                Object.assign(tooltipEl.style, {
                    background: bg,
                    border: `1px solid ${border}`,
                    color: color,
                    fontFamily: font || "'Roboto Mono', monospace",
                    fontSize: '11px',
                    boxShadow: `0 4px 16px rgba(0,0,0,.25)`,
                });
            };
            applyThemeStyles();
            document.body.appendChild(tooltipEl);
        }
        return tooltipEl;
    }

    function showTooltip(e, lines) {
        const tip = getTooltip();
        // Refresh theme styles on each show in case theme changed
        const bg = getCanvasStyle('--bg-panel-color', '#2c2c2c');
        const border = getCanvasStyle('--border-color', '#333');
        const color = getCanvasStyle('--text-on-color', '#eee');
        Object.assign(tip.style, { background: bg, border: `1px solid ${border}`, color });
        tip.innerHTML = lines.join('<br>');
        tip.style.display = 'block';
        moveTooltip(e);
    }

    function moveTooltip(e) {
        const tip = getTooltip();
        const x = e.clientX + 14,
            y = e.clientY - 40;
        tip.style.left = Math.min(x, window.innerWidth - 230) + 'px';
        tip.style.top = Math.max(0, y) + 'px';
    }

    function hideTooltip() {
        getTooltip().style.display = 'none';
    }

    // ─── Rounding rect helper ─────────────────────────────────────────
    function roundRect(ctx, x, y, w, h, r) {
        if (w === 0 || h === 0) return;
        r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
        ctx.beginPath();
        if (w > 0 && h > 0) {
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
        } else {
            ctx.rect(x, y, w, h);
        }
        ctx.closePath();
    }

    // ─── Chart class ──────────────────────────────────────────────────
    class Chart {
        constructor(ctx, config) {
            this.ctx = ctx;
            this.canvas = ctx.canvas;
            this.config = config;
            this.type = config.type;
            this.data = config.data;
            this.options = config.options || {};
            this._handlers = [];
            this._ro = null;
            this._pendingFrame = null;
            this._lastW = 0;
            this._lastH = 0;
            this._bindResize();
            // Initial draw uses current parent size
            this._drawFromParent();
        }

        destroy() {
            this._handlers.forEach(([el, ev, fn]) => el.removeEventListener(ev, fn));
            this._handlers = [];
            if (this._ro) {
                this._ro.disconnect();
                this._ro = null;
            }
            if (this._pendingFrame) {
                cancelAnimationFrame(this._pendingFrame);
                this._pendingFrame = null;
            }
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        }

        _on(el, ev, fn) {
            el.addEventListener(ev, fn);
            this._handlers.push([el, ev, fn]);
        }

        /**
         * The canvas is position:absolute (see dashboard.css .chart-wrap canvas).
         * Its actual size is controlled by CSS, NOT the canvas width/height attributes.
         *
         * We observe the parent (.chart-wrap) which has fixed height via CSS.
         * entry.contentRect.width/height = CSS container size → stable, doesn't grow.
         * Assigning canvas.width/height (drawing resolution) doesn't affect layout
         * because the canvas is outside the normal flow (position:absolute).
         */
        _bindResize() {
            if (typeof ResizeObserver === 'undefined') return;
            const parent = this.canvas.parentElement || this.canvas;
            this._ro = new ResizeObserver((entries) => {
                for (const entry of entries) {
                    const w = Math.round(entry.contentRect.width);
                    const h = Math.round(entry.contentRect.height);
                    if (w > 0 && h > 0 && (w !== this._lastW || h !== this._lastH)) {
                        this._lastW = w;
                        this._lastH = h;
                        if (this._pendingFrame) cancelAnimationFrame(this._pendingFrame);
                        this._pendingFrame = requestAnimationFrame(() => {
                            this._pendingFrame = null;
                            this._drawWithSize(w, h);
                        });
                    }
                }
            });
            this._ro.observe(parent);
        }

        _drawFromParent() {
            // offsetWidth/Height reflect the actual CSS size of the absolute canvas
            const w = this.canvas.offsetWidth || this.canvas.parentElement?.clientWidth || 300;
            const h = this.canvas.offsetHeight || this.canvas.parentElement?.clientHeight || 200;
            this._drawWithSize(w, h);
        }

        _drawWithSize(w, h) {
            // We only assign the drawing resolution (internal canvas pixels).
            // Visual size remains that of the CSS (position:absolute, width/height:100%).
            // This assignment does NOT change the layout, so it does NOT trigger ResizeObserver.
            this.canvas.width = w;
            this.canvas.height = h;
            this.ctx.clearRect(0, 0, w, h);
            if (this.type === 'bar') this._drawBar();
            if (this.type === 'line') this._drawLine();
            if (this.type === 'doughnut') this._drawDoughnut();
        }

        // ── Shared scale helpers ────────────────────────────────────────
        _gridColor() {
            return (
                this.options.scales?.x?.grid?.color ||
                `color-mix(in srgb, ${getCanvasStyle('--border-color', '#444')} 50%, transparent)`
            );
        }
        _tickColor() {
            return this.options.scales?.x?.ticks?.color || getCanvasStyle('--text-color', 'transparent');
        }
        _tickFont() {
            const fam =
                this.options.scales?.x?.ticks?.font?.family ||
                getCanvasStyle('--mono', '') ||
                "'Roboto Mono', monospace";
            const size = this.options.scales?.x?.ticks?.font?.size || defaults.font.size || 11;
            return `${size}px ${fam}`;
        }

        // ── BAR ─────────────────────────────────────────────────────────
        _drawBar() {
            const { ctx, canvas, data, options } = this;
            const isH = options.indexAxis === 'y';
            const labels = data.labels || [];
            const dsets = data.datasets || [];
            const W = canvas.width,
                H = canvas.height;

            const PAD = { top: 12, right: 16, bottom: isH ? 28 : 42, left: isH ? 120 : 44 };
            const CW = W - PAD.left - PAD.right;
            const CH = H - PAD.top - PAD.bottom;
            this.chartArea = {
                top: PAD.top,
                bottom: PAD.top + CH,
                left: PAD.left,
                right: PAD.left + CW,
                width: CW,
                height: CH,
            };

            const xTickCb = options.scales?.x?.ticks?.callback;
            const yTickCb = options.scales?.y?.ticks?.callback;

            // Group datasets by logical stacks
            const groups = [];
            const stackMap = {};
            dsets.forEach((ds, i) => {
                const s = ds.stack;
                if (s) {
                    if (stackMap[s] === undefined) {
                        stackMap[s] = groups.length;
                        groups.push({ datasets: [ds], isStacked: true });
                    } else {
                        groups[stackMap[s]].datasets.push(ds);
                    }
                } else {
                    groups.push({ datasets: [ds], isStacked: false });
                }
            });

            // Max value calculation handling groups
            const maxPerLabel = labels.map((_, li) => {
                let maxL = 0;
                groups.forEach((g) => {
                    const sum = g.datasets.reduce((s, ds) => s + (+ds.data[li] || 0), 0);
                    if (sum > maxL) maxL = sum;
                });
                return maxL;
            });
            const maxVal = Math.max(...maxPerLabel, 0.1);

            // Grid
            ctx.strokeStyle = this._gridColor();
            ctx.lineWidth = 1;
            const tickCount = 5;

            if (!isH) {
                for (let i = 0; i <= tickCount; i++) {
                    const val = (maxVal * i) / tickCount;
                    const y = PAD.top + CH - (val / maxVal) * CH;
                    ctx.beginPath();
                    ctx.moveTo(PAD.left, y);
                    ctx.lineTo(PAD.left + CW, y);
                    ctx.stroke();
                    const label = yTickCb ? yTickCb(+val.toFixed(2)) : +val.toFixed(2);
                    ctx.fillStyle = this._tickColor();
                    ctx.font = this._tickFont();
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, PAD.left - 6, y);
                }
            } else {
                for (let i = 0; i <= tickCount; i++) {
                    const val = (maxVal * i) / tickCount;
                    const x = PAD.left + (val / maxVal) * CW;
                    ctx.beginPath();
                    ctx.moveTo(x, PAD.top);
                    ctx.lineTo(x, PAD.top + CH);
                    ctx.stroke();
                    const label = xTickCb ? xTickCb(+val.toFixed(2)) : +val.toFixed(2);
                    ctx.fillStyle = this._tickColor();
                    ctx.font = this._tickFont();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    ctx.fillText(label, x, PAD.top + CH + 4);
                }
            }

            const nG = groups.length;
            const nL = labels.length;
            const groupW = isH ? CH / (nL || 1) : CW / (nL || 1);
            const barW = Math.max(2, (groupW / (nG || 1)) * 0.7);
            const groupPad = groupW * 0.15;

            const tooltipCb = options.plugins?.tooltip?.callbacks?.label;
            const hitBoxes = [];
            // tracks stack offset per group per label: [groupIndex][labelIndex]
            const groupOffsets = groups.map(() => new Array(nL).fill(0));

            groups.forEach((g, gi) => {
                const sortedG = [...g.datasets].sort((a, b) => (a.order || 0) - (b.order || 0));
                sortedG.forEach((ds) => {
                    const originalDatasetIndex = dsets.indexOf(ds);
                    labels.forEach((lbl, li) => {
                        const val = +ds.data[li] || 0;
                        let bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[li] : ds.backgroundColor;
                        if (typeof bg === 'function')
                            bg = bg({ chart: this, dataIndex: li, dataset: ds, datasetIndex: originalDatasetIndex });
                        bg = resolveVar(bg || 'var(--interactive-color)');

                        const maxBT = ds.maxBarThickness || Infinity;
                        const bw = Math.min(barW, maxBT);
                        const br = Math.min(ds.borderRadius || 0, bw / 2);

                        if (!isH) {
                            const x = PAD.left + groupPad + li * groupW + gi * ((groupW * 0.7) / (nG || 1));
                            const barH = (val / maxVal) * CH;
                            const offsetH = (groupOffsets[gi][li] / maxVal) * CH;
                            const bx = x;
                            const by = PAD.top + CH - barH - offsetH;
                            ctx.fillStyle = bg;
                            roundRect(ctx, bx, by, bw, barH, g.isStacked ? 0 : br);
                            ctx.fill();
                            hitBoxes.push({ bx, by, bw, bh: barH, val, label: lbl, ds, li });
                            if (g.isStacked) groupOffsets[gi][li] += val;
                            // X labels once per group
                            if (gi === 0) {
                                // Labels handled by standard logic relative to slot centers if needed
                                // Standard chart.local logic draws x labels centered on the group
                            }
                        } else {
                            const y = PAD.top + groupPad + li * groupW + gi * ((groupW * 0.7) / (nG || 1));
                            const barLen = (val / maxVal) * CW;
                            const offsetLen = (groupOffsets[gi][li] / maxVal) * CW;
                            const bx = PAD.left + offsetLen;
                            const by = y;
                            ctx.fillStyle = bg;
                            roundRect(ctx, bx, by, barLen, bw, g.isStacked ? 0 : br);
                            ctx.fill();
                            hitBoxes.push({ bx, by, bw: barLen, bh: bw, val, label: lbl, ds, li });
                            if (g.isStacked) groupOffsets[gi][li] += val;
                            // Y labels
                        }
                    });
                });
            });

            // Labels separate pass for centering
            labels.forEach((lbl, li) => {
                if (!isH) {
                    const x = PAD.left + groupPad + li * groupW + (groupW * 0.7) / 2;
                    ctx.fillStyle = this._tickColor();
                    ctx.font = this._tickFont();
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'top';
                    const step = Math.ceil(nL / 12);
                    if (li % step === 0) ctx.fillText(lbl, x, PAD.top + CH + 8);
                } else {
                    const y = PAD.top + groupPad + li * groupW + (groupW * 0.7) / 2;
                    ctx.fillStyle = this._tickColor();
                    ctx.font = this._tickFont();
                    ctx.textAlign = 'right';
                    ctx.textBaseline = 'middle';
                    const truncated = lbl.length > 16 ? lbl.slice(0, 15) + '…' : lbl;
                    ctx.fillText(truncated, PAD.left - 5, y);
                }
            });

            // Tooltip
            const handler = (e) => {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const my = e.clientY - rect.top;
                let found = null;
                for (const hb of hitBoxes) {
                    if (mx >= hb.bx && mx <= hb.bx + hb.bw && my >= hb.by && my <= hb.by + hb.bh) {
                        found = hb;
                        break;
                    }
                }
                if (found) {
                    const line = tooltipCb
                        ? tooltipCb({ raw: found.val, dataset: found.ds, label: found.label, dataIndex: found.li })
                        : ` ${found.ds.label || ''}: ${found.val}`;
                    showTooltip(e, [`<b>${found.label}</b>`, line]);
                } else {
                    hideTooltip();
                }
            };
            this._on(canvas, 'mousemove', handler);
            this._on(canvas, 'mouseleave', hideTooltip);
        }

        // ── LINE ────────────────────────────────────────────────────────
        _drawLine() {
            const { ctx, canvas, data, options } = this;
            const labels = data.labels || [];
            const dsets = data.datasets || [];
            const W = canvas.width,
                H = canvas.height;
            const PAD = { top: 12, right: 16, bottom: 32, left: 44 };
            const CW = W - PAD.left - PAD.right;
            const CH = H - PAD.top - PAD.bottom;
            this.chartArea = {
                top: PAD.top,
                bottom: PAD.top + CH,
                left: PAD.left,
                right: PAD.left + CW,
                width: CW,
                height: CH,
            };

            const yScale = options.scales?.y || {};
            const yMin = yScale.min ?? 0;
            const yMax = yScale.max ?? Math.max(...dsets.flatMap((ds) => ds.data.map((v) => +v || 0)), 1);
            const yRange = yMax - yMin || 1;
            const yTickCb = yScale.ticks?.callback;
            const xTickCb = options.scales?.x?.ticks?.callback;
            const maxTicks = options.scales?.x?.ticks?.maxTicksLimit || 10;

            ctx.strokeStyle = this._gridColor();
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const v = yMin + (yRange * i) / 5;
                const y = PAD.top + CH - ((v - yMin) / yRange) * CH;
                ctx.beginPath();
                ctx.moveTo(PAD.left, y);
                ctx.lineTo(PAD.left + CW, y);
                ctx.stroke();
                ctx.fillStyle = this._tickColor();
                ctx.font = this._tickFont();
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                ctx.fillText(yTickCb ? yTickCb(v) : +v.toFixed(1), PAD.left - 4, y);
            }

            const step = Math.ceil(labels.length / maxTicks);
            ctx.fillStyle = this._tickColor();
            ctx.font = this._tickFont();
            labels.forEach((lbl, i) => {
                if (i % step !== 0) return;
                const x = PAD.left + (i / (labels.length - 1 || 1)) * CW;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'top';
                ctx.fillText(xTickCb ? xTickCb(lbl) : String(lbl), x, PAD.top + CH + 5);
            });

            const tooltipCb = options.plugins?.tooltip?.callbacks?.label;
            const hitPoints = [];

            dsets.forEach((ds) => {
                const vals = ds.data.map((v) => +v || 0);
                const pts = vals.map((v, i) => ({
                    x: PAD.left + (labels.length > 1 ? i / (labels.length - 1) : 0) * CW,
                    y: PAD.top + CH - ((v - yMin) / yRange) * CH,
                    v,
                }));
                const tension = ds.tension ?? 0.4;
                // Resolve colors using the current theme
                const border = resolveVar(ds.borderColor || 'var(--interactive-color)');
                const bg = resolveVar(ds.backgroundColor || 'transparent');
                const lw = ds.borderWidth ?? 2;

                if (ds.fill && pts.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    _drawCurve(ctx, pts, tension);
                    ctx.lineTo(pts[pts.length - 1].x, PAD.top + CH);
                    ctx.lineTo(pts[0].x, PAD.top + CH);
                    ctx.closePath();
                    ctx.fillStyle = typeof bg === 'function' ? bg({ chart: this }) : bg;
                    ctx.fill();
                }

                if (pts.length > 1) {
                    ctx.beginPath();
                    ctx.moveTo(pts[0].x, pts[0].y);
                    _drawCurve(ctx, pts, tension);
                    ctx.strokeStyle = typeof border === 'function' ? border({ chart: this }) : border;
                    ctx.lineWidth = lw;
                    ctx.stroke();
                }

                const pr = ds.pointRadius ?? 3;
                if (pr > 0) {
                    pts.forEach((p) => {
                        ctx.beginPath();
                        ctx.arc(p.x, p.y, pr, 0, Math.PI * 2);
                        ctx.fillStyle = resolveVar(
                            ds.pointBackgroundColor || ds.borderColor || 'var(--interactive-color)',
                        );
                        ctx.fill();
                    });
                }

                pts.forEach((p, i) => hitPoints.push({ x: p.x, y: p.y, v: p.v, i, ds, label: labels[i] }));
            });

            const handler = (e) => {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                let closest = null,
                    minD = Infinity;
                hitPoints.forEach((p) => {
                    const d = Math.abs(p.x - mx);
                    if (d < minD) {
                        minD = d;
                        closest = p;
                    }
                });
                if (closest && minD < 30) {
                    const line = tooltipCb
                        ? tooltipCb({ raw: closest.v, dataset: closest.ds, label: closest.label, dataIndex: closest.i })
                        : ` ${closest.ds.label || ''}: ${closest.v}`;
                    showTooltip(e, [`<b>${closest.label}</b>`, line]);
                } else {
                    hideTooltip();
                }
            };
            this._on(canvas, 'mousemove', handler);
            this._on(canvas, 'mouseleave', hideTooltip);
        }

        // ── DOUGHNUT ────────────────────────────────────────────────────
        _drawDoughnut() {
            const { ctx, canvas, data, options } = this;
            const ds = data.datasets[0] || {};
            const vals = ds.data || [];
            const W = canvas.width,
                H = canvas.height;
            this.chartArea = { top: 0, bottom: H, left: 0, right: W, width: W, height: H };
            const cx = W / 2,
                cy = H / 2;
            const outerR = Math.min(W, H) / 2 - 8;
            const cutout = parsePct(options.cutout ?? '68%');
            const innerR = outerR * cutout;
            const total = vals.reduce((a, v) => a + (+v || 0), 0) || 1;

            const tooltipCb = options.plugins?.tooltip?.callbacks?.label;
            const segments = [];

            let angle = -Math.PI / 2;
            vals.forEach((v, i) => {
                v = +v || 0;
                const sweep = (v / total) * Math.PI * 2;
                const bg = Array.isArray(ds.backgroundColor) ? ds.backgroundColor[i] : ds.backgroundColor;
                const brd = Array.isArray(ds.borderColor) ? ds.borderColor[i] : ds.borderColor;

                ctx.beginPath();
                ctx.arc(cx, cy, outerR, angle, angle + sweep);
                ctx.arc(cx, cy, innerR, angle + sweep, angle, true);
                ctx.closePath();
                ctx.fillStyle = resolveVar(bg || 'var(--interactive-color)');
                ctx.fill();
                if (ds.borderWidth && brd) {
                    ctx.strokeStyle = resolveVar(brd);
                    ctx.lineWidth = ds.borderWidth;
                    ctx.stroke();
                }

                segments.push({ start: angle, end: angle + sweep, v, label: (data.labels || [])[i] || '' });
                angle += sweep;
            });

            const handler = (e) => {
                const rect = canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left - cx;
                const my = e.clientY - rect.top - cy;
                const dist = Math.sqrt(mx * mx + my * my);
                if (dist < innerR || dist > outerR) {
                    hideTooltip();
                    return;
                }
                let a = Math.atan2(my, mx);
                if (a < -Math.PI / 2) a += Math.PI * 2;
                const seg = segments.find((s) => a >= s.start && a < s.end);
                if (seg) {
                    const line = tooltipCb
                        ? tooltipCb({ raw: seg.v, label: seg.label, dataIndex: segments.indexOf(seg) })
                        : ` ${seg.label}: ${seg.v}`;
                    showTooltip(e, [`<b>${seg.label}</b>`, line]);
                } else {
                    hideTooltip();
                }
            };
            this._on(canvas, 'mousemove', handler);
            this._on(canvas, 'mouseleave', hideTooltip);
        }
    }

    // ─── Bezier curve helper ──────────────────────────────────────────
    function _drawCurve(ctx, pts, tension) {
        for (let i = 0; i < pts.length - 1; i++) {
            if (tension === 0) {
                ctx.lineTo(pts[i + 1].x, pts[i + 1].y);
                continue;
            }
            const p0 = pts[i - 1] || pts[i];
            const p1 = pts[i];
            const p2 = pts[i + 1];
            const p3 = pts[i + 2] || pts[i + 1];
            const cp1x = p1.x + ((p2.x - p0.x) * tension) / 3;
            const cp1y = p1.y + ((p2.y - p0.y) * tension) / 3;
            const cp2x = p2.x - ((p3.x - p1.x) * tension) / 3;
            const cp2y = p2.y - ((p3.y - p1.y) * tension) / 3;
            ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, p2.x, p2.y);
        }
    }

    // ─── Expose ───────────────────────────────────────────────────────
    Chart.defaults = defaults;
    global.Chart = Chart;
})(typeof globalThis !== 'undefined' ? globalThis : window);
