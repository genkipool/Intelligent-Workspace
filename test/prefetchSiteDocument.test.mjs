/**
 * El prefetch de los documentos al apuntar el raton.
 *
 * Lo que hay que sujetar es el limite: prefetchUrl se niega a cualquier cosa que no sea
 * una pagina de la extension, y a proposito —se llama desde las tarjetas de pestana, y
 * pedir lo que una pestana este mostrando seria salir a sitios que nadie ha pedido que
 * toquemos—. Esta funcion no es general: recibe un nombre de la lista cerrada de paginas
 * que el panel puede enmarcar y construye ella la direccion.
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><head></head><body></body>');
global.window = dom.window;
global.document = dom.window.document;
global.chrome = { runtime: { getURL: (path) => `chrome-extension://test/${path}` } };

const { prefetchSiteDocument } = await import('../src/ui/services/prefetchService.js');
const { SITE_ORIGIN } = await import('../src/config/site.js');

const hints = () => [...document.head.querySelectorAll('link[rel="prefetch"]')].map((link) => link.href);

beforeEach(() => {
    document.head.innerHTML = '';
});

describe('prefetchSiteDocument', () => {
    it('pide la pagina que el enlace va a abrir', () => {
        prefetchSiteDocument('support');
        assert.deepEqual(hints(), [`${SITE_ORIGIN}/support`]);
    });

    it('las tres paginas publicadas valen', () => {
        ['privacy', 'support', 'terms'].forEach(prefetchSiteDocument);
        assert.equal(hints().length, 3);
    });

    it('no pide dos veces la misma, por mucho que se entre y se salga del enlace', () => {
        prefetchSiteDocument('terms');
        prefetchSiteDocument('terms');
        prefetchSiteDocument('terms');
        assert.equal(hints().length, 1);
    });

    it('no acepta un nombre que no este en la lista', () => {
        ['', null, undefined, 'admin', '../../etc/passwd', 'https://example.com'].forEach((page) =>
            prefetchSiteDocument(page),
        );
        assert.deepEqual(hints(), [], 'solo entran las paginas que el panel puede enmarcar');
    });

    it('nunca sale del origen del sitio', () => {
        ['privacy', 'support', 'terms'].forEach(prefetchSiteDocument);
        hints().forEach((href) => assert.ok(href.startsWith(`${SITE_ORIGIN}/`), href));
    });
});
