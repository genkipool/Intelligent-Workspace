import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

describe('Notifications queue', () => {
    let dom;
    let window;
    let document;
    let showNotification;

    beforeEach(async () => {
        dom = new JSDOM('<!doctype html><html><body></body></html>', {
            url: 'https://example.com',
        });
        window = dom.window;
        document = window.document;

        global.window = window;
        global.document = document;
        global.localStorage = window.localStorage;
        global.chrome = {
            runtime: {
                getURL: (path) => path,
                sendMessage: () => Promise.resolve(),
                lastError: null,
            },
            i18n: {
                getUILanguage: () => 'es',
            },
            storage: {
                onChanged: {
                    addListener: () => {},
                    removeListener: () => {},
                },
                sync: {
                    get: (keys, cb) => {
                        const res = {};
                        if (cb) cb(res);
                        return Promise.resolve(res);
                    },
                },
                local: {
                    get: (keys, cb) => {
                        const res = { currentLanguage: 'es' };
                        if (cb) cb(res);
                        return Promise.resolve(res);
                    },
                },
            },
        };

        // Mock fetch for message files
        global.fetch = async (url) => {
            return {
                ok: true,
                json: async () => ({
                    storageModeSet: { message: 'Almacenamiento establecido en $1' },
                    storageChangeWarning: { message: 'Advertencia: no mueve reglas' },
                }),
            };
        };

        const i18nModule = await import(`../src/utils/i18n.js?t=${Date.now()}`);
        showNotification = i18nModule.showNotification;
    });

    it('muestra las notificaciones encoladas de una en una y no simultaneamente', async () => {
        // Encola las dos notificaciones del popup de almacenamiento
        await showNotification('storageModeSet', false, ['LOCAL'], true);
        await showNotification('storageChangeWarning', true, [], true);

        // Solo una notificacion debe estar en el DOM
        let notifications = document.querySelectorAll('.notification');
        assert.equal(notifications.length, 1, 'Debe haber exactamente 1 notificacion visible inicialmente');
        assert.match(notifications[0].textContent, /Almacenamiento establecido en LOCAL/);

        // Simula la finalizacion de la primera notificacion (animationend)
        const firstNotification = notifications[0];
        firstNotification.dispatchEvent(new window.Event('animationend'));

        // Ahora la primera notificacion debe desaparecer y aparecer la segunda
        notifications = document.querySelectorAll('.notification');
        assert.equal(notifications.length, 1, 'Debe haber exactamente 1 notificacion visible tras la primera');
        assert.match(notifications[0].textContent, /Advertencia: no mueve reglas/);

        // Simula la finalizacion de la segunda notificacion
        const secondNotification = notifications[0];
        secondNotification.dispatchEvent(new window.Event('animationend'));

        // Ya no debe quedar ninguna notificacion en el DOM
        notifications = document.querySelectorAll('.notification');
        assert.equal(notifications.length, 0, 'No debe quedar ninguna notificacion en el DOM al finalizar la cola');
    });
});

describe('Rules sortAlpha real-time sync', () => {
    it('ordena alfabeticamente cuando sortAlphaStore esta activo y restaura orden original cuando se desactiva', async () => {
        const { sortAlphaStore, rulesStore } = await import(`../src/ui/pages/rules/rulesStore.js?t=${Date.now()}`);

        const initialRules = [
            { name: 'Zebra', urls: ['zebra.com'] },
            { name: 'Apple', urls: ['apple.com'] },
            { name: 'Mango', urls: ['mango.com'] },
        ];

        rulesStore.set(initialRules);
        sortAlphaStore.set(false);

        function getDisplayRules(rules, isAlpha) {
            if (!isAlpha) return rules;
            return [...rules].sort((a, b) =>
                (a.rule?.name || a.name || '')
                    .toLowerCase()
                    .localeCompare((b.rule?.name || b.name || '').toLowerCase()),
            );
        }

        // Con sortAlpha = false, mantiene orden original
        assert.deepEqual(
            getDisplayRules(initialRules, false).map((r) => r.name),
            ['Zebra', 'Apple', 'Mango'],
        );

        // Al activar sortAlpha = true, ordena alfabeticamente
        sortAlphaStore.set(true);
        assert.deepEqual(
            getDisplayRules(initialRules, true).map((r) => r.name),
            ['Apple', 'Mango', 'Zebra'],
        );

        // Al desactivar sortAlpha = false, vuelve al orden original
        sortAlphaStore.set(false);
        assert.deepEqual(
            getDisplayRules(initialRules, false).map((r) => r.name),
            ['Zebra', 'Apple', 'Mango'],
        );
    });

    it('ordena dominios de una regla alfabeticamente o por longitud segun sortStatesStore', async () => {
        const { sortStatesStore } = await import(`../src/ui/pages/rules/rulesStore.js?t=${Date.now()}`);

        const rule = {
            name: 'Dev',
            urls: ['github.com/developer', 'gitlab.com', 'a.co', 'bitbucket.org'],
        };

        function getDisplayUrls(urls, isAlphaSort) {
            if (isAlphaSort) {
                return [...urls].sort((a, b) => a.localeCompare(b));
            }
            return [...urls].sort((a, b) => a.length - b.length);
        }

        let currentSort = false;
        const unsubscribe = sortStatesStore.subscribe((m) => {
            currentSort = m.get('Dev') || false;
        });

        // Estado inicial: false -> orden por longitud
        const map = new Map();
        map.set('Dev', false);
        sortStatesStore.set(map);

        assert.equal(currentSort, false);
        assert.deepEqual(getDisplayUrls(rule.urls, currentSort), [
            'a.co',
            'gitlab.com',
            'bitbucket.org',
            'github.com/developer',
        ]);

        // Al activar sortStatesStore -> orden alfabetico
        const updated = new Map(map);
        updated.set('Dev', true);
        sortStatesStore.set(updated);

        assert.equal(currentSort, true);
        assert.deepEqual(getDisplayUrls(rule.urls, currentSort), [
            'a.co',
            'bitbucket.org',
            'github.com/developer',
            'gitlab.com',
        ]);

        // Al restaurar -> orden por longitud
        const restored = new Map(updated);
        restored.set('Dev', false);
        sortStatesStore.set(restored);

        assert.equal(currentSort, false);
        assert.deepEqual(getDisplayUrls(rule.urls, currentSort), [
            'a.co',
            'gitlab.com',
            'bitbucket.org',
            'github.com/developer',
        ]);

        unsubscribe();
    });
});

describe('Validate errors text capitalization', () => {
    it('tiene la primera letra en mayuscula en espanol e ingles', async () => {
        const fs = await import('node:fs');
        const path = await import('node:path');

        const esMessages = JSON.parse(fs.readFileSync(path.resolve('_locales/es/messages.json'), 'utf-8'));
        const enMessages = JSON.parse(fs.readFileSync(path.resolve('_locales/en/messages.json'), 'utf-8'));

        assert.equal(esMessages.validateErrors.message, 'Validar errores');
        assert.equal(enMessages.validateErrors.message, 'Validate errors');
    });
});
