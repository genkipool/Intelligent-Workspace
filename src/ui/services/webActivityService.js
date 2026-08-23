/**
 * [AI INSTRUCTION]
 * THE ONLY WAY THE UI TALKS TO THE WEB ACTIVITY TRACKER.
 *
 * The counters, the limits and the blocking rules all live in the service worker, so
 * every page — the dashboard and the block screen — asks through here. Do not call
 * `chrome.runtime.sendMessage` with a `webActivity*` action anywhere else: the action
 * names are part of the contract and belong in one file.
 */
import { ACTIONS, messaging } from './messaging.js';

/** Everything the dashboard paints, in one round trip. `days` of 0 means all history. */
export const fetchActivity = (days = 0) => messaging.send(ACTIONS.WEB_ACTIVITY_GET_DATA, { days });

/** The verdict for a single site, which is all the block screen needs. */
export const fetchStatus = (domain) => messaging.send(ACTIONS.WEB_ACTIVITY_GET_STATUS, { domain });

/** Saves a limit, or removes it when `limit` is null. */
export const saveLimit = (domain, limit) => messaging.send(ACTIONS.WEB_ACTIVITY_SAVE_LIMIT, { domain, limit });

/** Lifts a block for a few minutes. Omitting `minutes` uses the configured default. */
export const snoozeLimit = (domain, minutes) => messaging.send(ACTIONS.WEB_ACTIVITY_SNOOZE, { domain, minutes });

/** Forgets the history of one site, or all of it when `domain` is omitted. */
export const clearActivity = (domain = null) => messaging.send(ACTIONS.WEB_ACTIVITY_CLEAR, { domain });

export const importActivity = (payload) => messaging.send(ACTIONS.WEB_ACTIVITY_IMPORT, { payload });

/** Saves the tracking preferences, including the categories the user added. */
export const saveSettings = (settings) => messaging.send(ACTIONS.WEB_ACTIVITY_SAVE_SETTINGS, { settings });
