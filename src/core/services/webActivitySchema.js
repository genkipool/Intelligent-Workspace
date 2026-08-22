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
 *   Limit     = { enabled, dailyLimitSeconds, blockAlways, schedules: [{start,end,days}],
 *                 notifyAtPercent, snoozeUntil, category }
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
    },

    /** How many visits the timeline remembers. */
    MAX_RECENT: 400,

    DEFAULT_SETTINGS: {
        enabled: true,
        /** No keyboard or mouse for this long and the clock stops. */
        idleSeconds: 60,
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
    },

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
     * The category a site belongs to. An explicit choice on its limit record always
     * wins, so the user can correct anything the hints get wrong.
     */
    categoryOf(domain, limits = {}) {
        const explicit = limits?.[domain]?.category;
        if (explicit && ITG_WEB_ACTIVITY.CATEGORIES.includes(explicit)) return explicit;
        if (!domain) return 'other';
        for (const category of ITG_WEB_ACTIVITY.CATEGORIES) {
            const hints = ITG_WEB_ACTIVITY.CATEGORY_HINTS[category];
            if (hints && hints.some((hint) => domain.includes(hint))) return category;
        }
        return 'other';
    },

    /** An empty per-day record for a site. */
    emptyDomainDay() {
        return { t: 0, v: 0, s: 0, h: {} };
    },

    /** A limit record with every field filled in, whatever the stored one is missing. */
    normalizeLimit(limit = {}) {
        return {
            enabled: limit.enabled !== false,
            dailyLimitSeconds: Number(limit.dailyLimitSeconds) || 0,
            blockAlways: !!limit.blockAlways,
            schedules: Array.isArray(limit.schedules) ? limit.schedules : [],
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
     */
    evaluate(domain, limits = {}, usedToday = 0, now = new Date()) {
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
            snoozed: false,
            /** When the clock is what blocks it, the minute the next allowed window opens. */
            unblocksAtMinute: null,
            /** How many days ahead that window is: 0 for later today. */
            unblocksInDays: null,
        };
        if (!raw) return verdict;

        const limit = ITG_WEB_ACTIVITY.normalizeLimit(raw);
        verdict.limitSeconds = limit.dailyLimitSeconds;
        if (limit.dailyLimitSeconds > 0) {
            verdict.remainingSeconds = Math.max(0, limit.dailyLimitSeconds - usedToday);
            verdict.percent = Math.min(100, Math.round((usedToday / limit.dailyLimitSeconds) * 100));
        }
        if (!limit.enabled) return verdict;

        if (limit.snoozeUntil > now.getTime()) {
            verdict.snoozed = true;
            return verdict;
        }

        if (limit.blockAlways) {
            verdict.blocked = true;
            verdict.reason = 'always';
            return verdict;
        }

        // The windows say when the site is allowed, so having any at all and being
        // outside every one of them is what blocks it.
        const windows = limit.schedules.filter((s) => s.start && s.end);
        if (windows.length && !windows.some((s) => ITG_WEB_ACTIVITY.isWithinSchedule(s, now))) {
            verdict.blocked = true;
            verdict.reason = 'schedule';
            const next = ITG_WEB_ACTIVITY.nextAllowedStart(windows, now);
            verdict.unblocksAtMinute = next ? next.minute : null;
            verdict.unblocksInDays = next ? next.dayOffset : null;
            return verdict;
        }

        if (limit.dailyLimitSeconds > 0 && usedToday >= limit.dailyLimitSeconds) {
            verdict.blocked = true;
            verdict.reason = 'daily';
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
