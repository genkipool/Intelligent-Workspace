/**
 * Las paginas de la web, en el idioma del lector.
 *
 * La web publica una pagina por idioma y cae al ingles para un prefijo que no
 * conoce. Esa regla estaba copiada en cada componente que enlazaba a ella, que es
 * de las que basta con que se desvie una vez para mandar media aplicacion al
 * idioma equivocado.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { SITE_ORIGIN, siteUrl } from '../src/config/site.js';

describe('siteUrl', () => {
    it('en espanol usa el prefijo /es', () => {
        assert.equal(siteUrl('support', 'es'), `${SITE_ORIGIN}/es/support`);
        assert.equal(siteUrl('terms', 'es-419'), `${SITE_ORIGIN}/es/terms`);
        assert.equal(siteUrl('privacy', 'ES-ES'), `${SITE_ORIGIN}/es/privacy`);
    });

    it('en ingles va a la raiz', () => {
        assert.equal(siteUrl('support', 'en'), `${SITE_ORIGIN}/support`);
        assert.equal(siteUrl('terms', 'en-GB'), `${SITE_ORIGIN}/terms`);
    });

    it('un idioma que la web no publica cae al ingles, como hace la web', () => {
        ['fr', 'de', 'ja', 'pt-BR', 'zz'].forEach((language) => {
            assert.equal(siteUrl('privacy', language), `${SITE_ORIGIN}/privacy`);
        });
    });

    it('sin idioma tampoco se rompe', () => {
        assert.equal(siteUrl('support', ''), `${SITE_ORIGIN}/support`);
        assert.equal(siteUrl('support'), `${SITE_ORIGIN}/support`, 'fuera del navegador no hay chrome.i18n');
    });

    it('las tres paginas que enlaza el popup existen como ruta', () => {
        assert.deepEqual(
            ['support', 'terms', 'privacy'].map((page) => siteUrl(page, 'es')),
            [`${SITE_ORIGIN}/es/support`, `${SITE_ORIGIN}/es/terms`, `${SITE_ORIGIN}/es/privacy`],
        );
    });
});
