/**
 * [AI INSTRUCTION]
 * SINGLE DEFINITION OF THE WEB ACTIVITY CONTRACT. Do not restate any of it elsewhere.
 *
 * The tracker runs in the service worker (a classic script loaded with importScripts)
 * and the dashboard runs in a page (an ES module). Neither can import the other, and
 * both need exactly the same answers: where the counters live, how a URL becomes a
 * site, which category a site falls into, and whether a limit is being broken right
 * now. Written twice they would drift, and a dashboard that disagrees with the
 * blocker about "is this site over its limit" is worse than no dashboard.
 *
 * Like dbSchema.js this file has no imports and no exports on purpose, so it works
 * both ways:
 *   - worker: importScripts('/services/webActivitySchema.js')
 *   - pages:  import '../../core/services/webActivitySchema.js'   (side effect)
 * and publishes itself on globalThis.
 *
 * STORAGE LAYOUT (chrome.storage.local)
 *   wa:day:YYYY-MM-DD  one record per day  { domains: { host: DomainDay } }
 *   wa:days            the day keys on record, so the rest never has to be scanned
 *   wa:recent          the last visits, newest first, for the timeline
 *   wa:settings        tracking preferences
 *   wa:limits          { host: Limit }
 * One key per day is what keeps the writes small: the tracker rewrites today and
 * nothing else, however many months of history are kept.
 *
 *   DomainDay = { t: seconds, v: visits, s: sessions, h: { hour: seconds } }
 *   Limit     = { limitEnabled, scheduleEnabled, dailyLimitSeconds, dailyLimitDays,
 *                 weeklyLimitSeconds, blockAlways, schedules: [{start,end,days}],
 *                 notifyAtPercent, snoozeUntil, category }
 * The two halves of a rule switch on and off separately: pausing a night-time window
 * for one evening should not also hand back a daily allowance that was already spent.
 * `enabled` is the old single flag; it is still written, as the OR of the two, so
 * anything reading a record from before this still gets a sensible answer.
 *
 * `schedules` are the hours the site IS allowed. Outside every one of them it is
 * blocked. An empty list means no restriction by the clock at all — which is why an
 * incomplete window must never be stored, or a half-typed start time would lock the
 * site out for the rest of the day.
 */
const ITG_WEB_ACTIVITY = {
    /** Bumped when the stored shape changes in a way a migration has to notice. */
    version: 1,

    KEYS: {
        DAY_PREFIX: 'wa:day:',
        /** The day keys on record. chrome.storage has no prefix query, and reading the
         *  whole area to find them would mean loading every rule, theme and backup too. */
        DAY_INDEX: 'wa:days',
        RECENT: 'wa:recent',
        SETTINGS: 'wa:settings',
        LIMITS: 'wa:limits',
        /** chrome.storage.session — the segment currently being timed. */
        OPEN_SEGMENT: 'wa:openSegment',
        /**
         * chrome.storage.local — this browser's own id inside the synced record. Each
         * browser writes its days under its own key so two of them counting the same
         * Tuesday add up instead of overwriting one another.
         */
        SYNC_DEVICE: 'wa:syncDevice',
        /**
         * chrome.storage.local — how many times the grace button has been used today,
         * as `{ day, count }`. Kept by the worker because the block screen uses that
         * button too, and a count each page kept for itself would be no count at all.
         */
        SNOOZE_USES: 'wa:snoozeUses',
    },

    /**
     * The keys the synced copy lives under. Everything is prefixed so the shared area
     * — which also holds whatever else the user's profile syncs — can be swept clean
     * the moment the switch is turned off.
     */
    SYNC: {
        PREFIX: 'wa:s:',
        SETTINGS: 'wa:s:settings',
        LIMITS: 'wa:s:limits',
        /** `wa:s:d:<device>:<day>` — one day, as counted by one browser. */
        DAY_PREFIX: 'wa:s:d:',
        /** How many days back are shared. The whole area is 100KB. */
        DAYS: 21,
    },

    /** How many visits the timeline remembers. */
    MAX_RECENT: 400,

    DEFAULT_SETTINGS: {
        enabled: true,
        /**
         * No keyboard or mouse for this long and the clock stops — unless something is
         * playing, which is what `countAudible` is for: watching a video is not being
         * away. Five minutes rather than one because a minute of reading a long page
         * without touching anything is ordinary, and the clock stopping on it is what
         * makes the reading sites read as quieter than they are.
         */
        idleSeconds: 300,
        /** Days of history kept; older records are dropped as the day rolls over. */
        retentionDays: 180,
        /** Keep counting a tab that is playing audio even when the browser is not focused. */
        countAudible: true,
        /** Sites never recorded, as bare hostnames. */
        ignoredDomains: [],
        /** Warn once when a site reaches this share of its daily limit. 0 disables it. */
        notifyAtPercent: 80,
        /** How long the "just five more minutes" button on the block screen lasts. */
        snoozeMinutes: 5,
        /**
         * Which use of that button starts asking for the block password, counting from
         * the first one today. 2 — the default — means the first one is free and the
         * second is not, which is the point: one more go is a decision, three more is a
         * habit. 0 never asks, and none of it means anything without a password set.
         */
        snoozePasswordAfter: 2,
        /**
         * Whether the record, the rules and these preferences ride along in the
         * browser's own profile sync, so the same extension in another browser shows
         * the same figures. Off by default: `chrome.storage.sync` is a shared, quota'd
         * area that leaves the machine, and where somebody has been is not something to
         * start shipping anywhere without being asked.
         */
        syncEnabled: false,
        /**
         * Categories the user added, as `[{ id, label }]`. The id always carries the
         * `custom:` prefix, so a name the user picks can never collide with a built-in
         * bucket and a stale one is recognisable long after the category was deleted.
         * The label is stored rather than translated: it is the user's own word.
         */
        customCategories: [],
        /**
         * The password that stands in front of weakening a rule, as
         * `{ salt, hash }`, or null. Never the password itself — see
         * `ui/pages/web-activity/blockLock.js`, which is the only thing that reads or
         * writes this and explains what it is and is not.
         */
        blockPassword: null,
    },

    /** What marks a category as the user's own rather than one of ours. */
    CUSTOM_CATEGORY_PREFIX: 'custom:',

    /**
     * The buckets the sidebar groups sites into. `other` is the fallback and must
     * stay last. Each one has an i18n key of the form `webActivityCategory_<id>`.
     */
    CATEGORIES: [
        'social',
        'video',
        'music',
        'news',
        'shopping',
        'reading',
        'entertainment',
        'dev',
        'work',
        'education',
        'games',
        'finance',
        'mail',
        // `ai` before `search`: gemini.google.com must not be caught by the bare
        // `google.` hint. The list is scanned in order, so the specific ones go first.
        'ai',
        'search',
        'other',
    ],

    /** Whether a category id belongs to the user rather than to the list above. */
    isCustomCategory(id) {
        return typeof id === 'string' && id.startsWith(ITG_WEB_ACTIVITY.CUSTOM_CATEGORY_PREFIX);
    },

    /**
     * The id for a category name the user typed. Accents are folded and anything that
     * is not a letter or a digit becomes a dash, so the id stays safe to use as an
     * object key and as part of a CSS selector.
     *
     * @returns {string|null} null when the name has nothing usable in it.
     */
    customCategoryId(label) {
        const slug = String(label || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 32);
        return slug ? ITG_WEB_ACTIVITY.CUSTOM_CATEGORY_PREFIX + slug : null;
    },

    /**
     * Which categories count as focused work and which as a distraction. The
     * dashboard turns the split into a single "focus ratio", and the user can move a
     * site between categories, so this is only the starting point.
     */
    PRODUCTIVE_CATEGORIES: ['dev', 'work', 'education', 'reading', 'finance', 'mail'],
    DISTRACTING_CATEGORIES: ['social', 'video', 'games', 'shopping', 'entertainment'],

    /**
     * Substrings that place a site in a category, most specific first. Matched
     * against the hostname, so `docs.google.com` lands in `work` while `google.com`
     * lands in `search`.
     */
    CATEGORY_HINTS: {
        social: [
            'facebook.',
            'instagram.',
            'twitter.',
            'x.com',
            'tiktok.',
            'reddit.',
            'linkedin.',
            'pinterest.',
            'mastodon.',
            'bsky.',
            'threads.',
            'snapchat.',
            'discord.',
            'telegram.',
            'whatsapp.',
        ],
        video: [
            'youtube.',
            'youtu.be',
            'netflix.',
            'twitch.',
            'vimeo.',
            'primevideo.',
            'disneyplus.',
            'hbomax.',
            'dailymotion.',
            'filmin.',
        ],
        music: ['spotify.', 'soundcloud.', 'deezer.', 'tidal.', 'bandcamp.', 'last.fm', 'music.apple.'],
        news: [
            'bbc.',
            'cnn.',
            'nytimes.',
            'theguardian.',
            'elpais.',
            'elmundo.',
            'reuters.',
            'lavanguardia.',
            'marca.',
            'as.com',
            'news.',
        ],
        shopping: [
            'amazon.',
            'ebay.',
            'aliexpress.',
            'etsy.',
            'wallapop.',
            'temu.',
            'shein.',
            'zara.',
            'elcorteingles.',
            'mercadolibre.',
        ],
        reading: [
            'medium.',
            'wikipedia.',
            'wikihow.',
            'goodreads.',
            'wattpad.',
            'substack.',
            'getpocket.',
            'pocket.',
            'archiveofourown.',
            'fanfiction.',
            'gutenberg.',
            'scribd.',
        ],
        entertainment: [
            'imdb.',
            'rottentomatoes.',
            '9gag.',
            'buzzfeed.',
            'fandom.',
            'crunchyroll.',
            'webtoons.',
            'anime-planet.',
            'myanimelist.',
            'tvtime.',
            'letterboxd.',
        ],
        dev: [
            'github.',
            'gitlab.',
            'bitbucket.',
            'stackoverflow.',
            'stackexchange.',
            'npmjs.',
            'developer.mozilla.',
            'codepen.',
            'jsfiddle.',
            'vercel.',
            'netlify.',
            'localhost',
            'docker.',
            'kubernetes.',
            'rust-lang.',
            'python.org',
        ],
        work: [
            'docs.google.',
            'drive.google.',
            'sheets.google.',
            'slides.google.',
            'calendar.google.',
            'meet.google.',
            'notion.',
            'slack.',
            'atlassian.',
            'jira.',
            'trello.',
            'asana.',
            'monday.',
            'zoom.',
            'teams.microsoft.',
            'office.',
            'sharepoint.',
            'figma.',
            'miro.',
            'clickup.',
            'basecamp.',
        ],
        education: [
            'coursera.',
            'udemy.',
            'edx.',
            'khanacademy.',
            'duolingo.',
            'platzi.',
            'domestika.',
            '.edu',
            'moodle',
            'classroom.google.',
        ],
        games: [
            'steampowered.',
            'epicgames.',
            'roblox.',
            'itch.io',
            'chess.com',
            'lichess.',
            'ign.',
            'gamespot.',
            'playstation.',
            'xbox.',
        ],
        finance: [
            'paypal.',
            'bankinter.',
            'bbva.',
            'santander.',
            'caixabank.',
            'coinbase.',
            'binance.',
            'tradingview.',
            'investing.',
            'revolut.',
        ],
        mail: ['mail.google.', 'outlook.', 'mail.yahoo.', 'proton.me', 'protonmail.', 'zoho.com/mail', 'thunderbird.'],
        search: ['google.', 'bing.', 'duckduckgo.', 'ecosia.', 'brave.com/search', 'startpage.', 'yandex.'],
        ai: [
            'chatgpt.',
            'openai.',
            'claude.ai',
            'anthropic.',
            'gemini.google.',
            'perplexity.',
            'huggingface.',
            'midjourney.',
            'copilot.microsoft.',
        ],
    },

    /** Schemes worth timing. Everything else — the new tab page, extension pages, devtools — is not browsing. */
    TRACKABLE_SCHEMES: ['http:', 'https:'],

    /**
     * The site a URL belongs to, or null when the URL is not browsing at all.
     * `www.` is dropped so `www.github.com` and `github.com` are one site; nothing
     * else is, so `mail.google.com` stays apart from `docs.google.com`.
     */
    domainOf(url) {
        if (!url) return null;
        try {
            const parsed = new URL(url);
            if (!ITG_WEB_ACTIVITY.TRACKABLE_SCHEMES.includes(parsed.protocol)) return null;
            const host = parsed.hostname.toLowerCase();
            if (!host) return null;
            return host.startsWith('www.') ? host.slice(4) : host;
        } catch {
            return null;
        }
    },

    /** `YYYY-MM-DD` in the user's own timezone, which is the day they mean. */
    dayKey(ts) {
        const d = new Date(ts);
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

    /** The storage key holding a given day. */
    dayStorageKey(ts) {
        return ITG_WEB_ACTIVITY.KEYS.DAY_PREFIX + (typeof ts === 'string' ? ts : ITG_WEB_ACTIVITY.dayKey(ts));
    },

    /**
     * The seven day keys of the week `ts` falls in, Monday first.
     *
     * Monday rather than Sunday because a weekly allowance is something a person
     * plans their working week around, and because that is where the week starts in
     * every locale this extension ships in. The allowance therefore refills on Monday
     * at midnight, which is what the block screen says out loud.
     */
    weekDayKeys(ts = Date.now()) {
        const date = new Date(ts);
        const offset = (date.getDay() + 6) % 7;
        const keys = [];
        for (let index = 0; index < 7; index++) {
            const day = new Date(date.getFullYear(), date.getMonth(), date.getDate() - offset + index);
            keys.push(ITG_WEB_ACTIVITY.dayKey(day.getTime()));
        }
        return keys;
    },

    /**
     * The category a site belongs to. An explicit choice on its limit record always
     * wins, so the user can correct anything the hints get wrong.
     */
    categoryOf(domain, limits = {}) {
        const explicit = limits?.[domain]?.category;
        // A category the user added is as valid as one of ours; only an id that is
        // neither is stale and falls through to the hints.
        if (explicit && (ITG_WEB_ACTIVITY.CATEGORIES.includes(explicit) || ITG_WEB_ACTIVITY.isCustomCategory(explicit)))
            return explicit;
        if (!domain) return 'other';
        for (const category of ITG_WEB_ACTIVITY.CATEGORIES) {
            const hints = ITG_WEB_ACTIVITY.CATEGORY_HINTS[category];
            if (hints && hints.some((hint) => domain.includes(hint))) return category;
        }
        return 'other';
    },

    /** An empty per-day record for a site. */
    emptyDomainDay() {
        // `p` is the same seconds again, split by the pomodoro phase that was running
        // while they were spent: `w` focus, `s` short break, `l` long break. Time spent
        // with no timer going is in `t` and in none of them, which is what makes the
        // three of them add up to less than `t` rather than to it.
        return { t: 0, v: 0, s: 0, h: {}, p: { w: 0, s: 0, l: 0 } };
    },

    /** Which key of `entry.p` a pomodoro mode is banked under. */
    POMODORO_PHASE_FIELD: { work: 'w', short: 's', long: 'l' },

    /** A limit record with every field filled in, whatever the stored one is missing. */
    normalizeLimit(limit = {}) {
        // A record from before the split carries one flag for both halves, which is
        // exactly what it meant at the time.
        const legacy = limit.enabled !== false;
        const limitEnabled = limit.limitEnabled === undefined ? legacy : limit.limitEnabled !== false;
        const dailyLimitEnabled =
            limit.dailyLimitEnabled === undefined ? limitEnabled : limit.dailyLimitEnabled !== false;
        const weeklyLimitEnabled =
            limit.weeklyLimitEnabled === undefined ? limitEnabled : limit.weeklyLimitEnabled !== false;
        const scheduleEnabled = limit.scheduleEnabled === undefined ? legacy : limit.scheduleEnabled !== false;

        const dailyLimitSeconds = Number(limit.dailyLimitSeconds) || 0;
        const weeklyLimitSeconds = Number(limit.weeklyLimitSeconds) || 0;
        const blockAlways = !!limit.blockAlways;
        const schedules = Array.isArray(limit.schedules) ? limit.schedules : [];

        const hasDaily = dailyLimitSeconds > 0;
        const hasWeekly = weeklyLimitSeconds > 0;
        const hasSchedule = blockAlways || schedules.some((s) => s.start && s.end);

        const activeDaily = hasDaily && dailyLimitEnabled;
        const activeWeekly = hasWeekly && weeklyLimitEnabled;
        const activeSchedule = hasSchedule && scheduleEnabled;

        const hasAnyConfig = hasDaily || hasWeekly || hasSchedule;
        const isLimitActive = hasAnyConfig ? activeDaily || activeWeekly : dailyLimitEnabled || weeklyLimitEnabled;
        const isOverallActive = hasAnyConfig
            ? activeDaily || activeWeekly || activeSchedule
            : dailyLimitEnabled || weeklyLimitEnabled || scheduleEnabled;

        return {
            dailyLimitEnabled,
            weeklyLimitEnabled,
            scheduleEnabled,
            /** Kept for legacy callers reading limitEnabled / enabled */
            limitEnabled: isLimitActive,
            enabled: isOverallActive,
            dailyLimitSeconds,
            /**
             * The weekdays the daily allowance applies on. A record from before this
             * existed has none, and means every day; an empty list is a deliberate
             * "no day", which leaves the allowance switched off rather than silently
             * turning it into an everyday one.
             */
            dailyLimitDays: Array.isArray(limit.dailyLimitDays) ? limit.dailyLimitDays : [0, 1, 2, 3, 4, 5, 6],
            weeklyLimitSeconds,
            blockAlways,
            schedules,
            notifyAtPercent: limit.notifyAtPercent === undefined ? null : limit.notifyAtPercent,
            snoozeUntil: Number(limit.snoozeUntil) || 0,
            category: limit.category || null,
        };
    },

    /** Minutes past midnight for an `HH:MM` string. */
    minutesOfDay(hhmm) {
        const [h, m] = String(hhmm || '0:00')
            .split(':')
            .map((n) => parseInt(n, 10) || 0);
        return h * 60 + m;
    },

    /**
     * Whether `now` falls inside a window.
     *
     * A window that ends before it starts is an overnight one (22:00 to 02:00), and
     * its `days` name the day the window *starts* on, which is how a person reads
     * "let me on this at night".
     */
    isWithinSchedule(schedule, now = new Date()) {
        if (!schedule || !schedule.start || !schedule.end) return false;
        const start = ITG_WEB_ACTIVITY.minutesOfDay(schedule.start);
        const end = ITG_WEB_ACTIVITY.minutesOfDay(schedule.end);
        const days = Array.isArray(schedule.days) && schedule.days.length ? schedule.days : [0, 1, 2, 3, 4, 5, 6];
        const minute = now.getHours() * 60 + now.getMinutes();
        const today = now.getDay();
        const yesterday = (today + 6) % 7;

        if (start === end) return false;
        if (start < end) return days.includes(today) && minute >= start && minute < end;
        // Overnight: the tail before midnight belongs to today, the head after it to yesterday.
        if (days.includes(today) && minute >= start) return true;
        return days.includes(yesterday) && minute < end;
    },

    /**
     * The whole verdict on a site right now: is it blocked, why, and how much of its
     * allowance is left. Both the blocker and the dashboard read this, which is the
     * point — the badge the user sees and the rule that stops them agree by
     * construction.
     *
     * @param {string} domain
     * @param {object} limits    the whole `wa:limits` record
     * @param {number} usedToday seconds already spent on the site today
     * @param {Date}   now
     * @param {number} usedThisWeek seconds spent on the site since Monday. Only the
     *   callers that have a weekly allowance to check need to pay for reading the
     *   week, so it defaults to today's figure being the whole of it.
     */
    evaluate(domain, limits = {}, usedToday = 0, now = new Date(), usedThisWeek = null) {
        const raw = limits?.[domain];
        const verdict = {
            domain,
            configured: !!raw,
            blocked: false,
            reason: null,
            limitSeconds: 0,
            usedSeconds: usedToday,
            /** null when there is no daily allowance. Not Infinity: the verdict is sent
             *  over the message channel as JSON, which would turn that into null anyway. */
            remainingSeconds: null,
            percent: 0,
            /** The same three figures for the weekly allowance. */
            weekLimitSeconds: 0,
            weekUsedSeconds: usedThisWeek === null ? usedToday : usedThisWeek,
            remainingWeekSeconds: null,
            weekPercent: 0,
            snoozed: false,
            /** When the clock is what blocks it, the minute the next allowed window opens. */
            unblocksAtMinute: null,
            /** How many days ahead that window is: 0 for later today. */
            unblocksInDays: null,
        };
        if (!raw) return verdict;

        const limit = ITG_WEB_ACTIVITY.normalizeLimit(raw);
        const usedWeek = verdict.weekUsedSeconds;
        verdict.limitSeconds = limit.dailyLimitSeconds;
        verdict.weekLimitSeconds = limit.weeklyLimitSeconds;
        if (limit.dailyLimitSeconds > 0) {
            verdict.remainingSeconds = Math.max(0, limit.dailyLimitSeconds - usedToday);
            verdict.percent = Math.min(100, Math.round((usedToday / limit.dailyLimitSeconds) * 100));
        }
        if (limit.weeklyLimitSeconds > 0) {
            verdict.remainingWeekSeconds = Math.max(0, limit.weeklyLimitSeconds - usedWeek);
            verdict.weekPercent = Math.min(100, Math.round((usedWeek / limit.weeklyLimitSeconds) * 100));
        }
        if (!limit.dailyLimitEnabled && !limit.weeklyLimitEnabled && !limit.scheduleEnabled) return verdict;

        if (limit.snoozeUntil > now.getTime()) {
            verdict.snoozed = true;
            return verdict;
        }

        if (limit.scheduleEnabled && limit.blockAlways) {
            verdict.blocked = true;
            verdict.reason = 'always';
            return verdict;
        }

        // The windows say when the site is allowed, so having any at all and being
        // outside every one of them is what blocks it.
        const windows = limit.scheduleEnabled ? limit.schedules.filter((s) => s.start && s.end) : [];
        if (windows.length && !windows.some((s) => ITG_WEB_ACTIVITY.isWithinSchedule(s, now))) {
            verdict.blocked = true;
            verdict.reason = 'schedule';
            const next = ITG_WEB_ACTIVITY.nextAllowedStart(windows, now);
            verdict.unblocksAtMinute = next ? next.minute : null;
            verdict.unblocksInDays = next ? next.dayOffset : null;
            return verdict;
        }

        // The allowance is still measured on a day it does not apply to — the figures
        // are true whatever the rule does with them — but only a day it applies to can
        // block.
        if (
            limit.dailyLimitEnabled &&
            limit.dailyLimitSeconds > 0 &&
            usedToday >= limit.dailyLimitSeconds &&
            limit.dailyLimitDays.includes(now.getDay())
        ) {
            verdict.blocked = true;
            verdict.reason = 'daily';
            return verdict;
        }

        // The weekly allowance is checked last so the reason the user is told is the
        // one that lifts soonest: a day that is spent comes back at midnight, a week
        // that is spent does not come back until Monday.
        if (limit.weeklyLimitEnabled && limit.weeklyLimitSeconds > 0 && usedWeek >= limit.weeklyLimitSeconds) {
            verdict.blocked = true;
            verdict.reason = 'weekly';
        }
        return verdict;
    },

    /**
     * When the next allowed window opens, searching today and the week ahead.
     *
     * @returns {{minute: number, dayOffset: number}|null} null when no window ever
     *   applies, which only happens if every one of them has an empty day list.
     */
    nextAllowedStart(windows, now = new Date()) {
        const nowMinute = now.getHours() * 60 + now.getMinutes();
        for (let dayOffset = 0; dayOffset < 8; dayOffset++) {
            const weekday = (now.getDay() + dayOffset) % 7;
            let soonest = null;
            for (const window of windows) {
                const days = Array.isArray(window.days) && window.days.length ? window.days : [0, 1, 2, 3, 4, 5, 6];
                if (!days.includes(weekday)) continue;
                const start = ITG_WEB_ACTIVITY.minutesOfDay(window.start);
                // A window that already started today is behind us; being inside it
                // would have meant the site was not blocked in the first place.
                if (dayOffset === 0 && start <= nowMinute) continue;
                if (soonest === null || start < soonest) soonest = start;
            }
            if (soonest !== null) return { minute: soonest, dayOffset };
        }
        return null;
    },

    /**
     * Splits a stretch of time into the day-and-hour buckets it actually covers.
     *
     * A segment that runs past midnight belongs to two days, and one that crosses the
     * hour belongs to two hours. Attributing the whole thing to where it started is
     * what makes an "hourly distribution" chart quietly wrong.
     *
     * @returns {Array<{day: string, hour: number, seconds: number}>}
     */
    splitIntoBuckets(startMs, endMs) {
        const buckets = [];
        let cursor = startMs;
        while (cursor < endMs) {
            const at = new Date(cursor);
            const hourEnd = new Date(at.getFullYear(), at.getMonth(), at.getDate(), at.getHours() + 1).getTime();
            const sliceEnd = Math.min(hourEnd, endMs);
            buckets.push({
                day: ITG_WEB_ACTIVITY.dayKey(cursor),
                hour: at.getHours(),
                seconds: (sliceEnd - cursor) / 1000,
            });
            cursor = sliceEnd;
        }
        return buckets;
    },
};

globalThis.ITG_WEB_ACTIVITY = ITG_WEB_ACTIVITY;
