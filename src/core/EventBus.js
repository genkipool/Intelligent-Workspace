/**
 * EventBus - A lightweight PubSub system for decoupled cross-module communication.
 * This replaces the anti-pattern of a global `fn` registry.
 */
class EventBusManager extends EventTarget {
    /**
     * Emit an event
     * @param {string} eventName
     * @param {any} detail
     */
    emit(eventName, detail = {}) {
        this.dispatchEvent(new CustomEvent(eventName, { detail }));
    }

    /**
     * Subscribe to an event
     * @param {string} eventName
     * @param {function} callback
     * @returns {function} A function to unsubscribe
     */
    on(eventName, callback) {
        const handler = (e) => callback(e.detail);
        this.addEventListener(eventName, handler);
        return () => this.removeEventListener(eventName, handler);
    }
}

export const EventBus = new EventBusManager();

// Standardized Event Names
export const EVENTS = {
    // UI Events
    SHOW_NOTIFICATION: 'SHOW_NOTIFICATION',
    TOGGLE_VIEWS: 'TOGGLE_VIEWS',

    // State Events
    STATE_UPDATED: 'STATE_UPDATED',
    PIN_STATE_CHANGED: 'PIN_STATE_CHANGED',

    // Feature Events
    POMODORO_TICK: 'POMODORO_TICK',
    GROUPS_RENDERED: 'GROUPS_RENDERED',
    SEARCH_UPDATED: 'SEARCH_UPDATED',
};
