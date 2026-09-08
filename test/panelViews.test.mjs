/**
 * Las vistas a las que se puede abrir listGroup.html directamente.
 *
 * El parpadeo que esto arregla: tres cosas tienen que ponerse de acuerdo sobre la vista
 * pedida antes del primer pintado — como se llama la cabecera, si la lista de grupos se
 * ve debajo, y que controles dibuja la barra. Cada una llevaba su propia lista, asi que
 * una vista anadida a una y olvidada en las otras arrancaba como la lista de grupos y se
 * tapaba unos fotogramas despues.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { bootLayoutView, bootTitleKey, isFramedView, OVERLAY_VIEWS } from '../src/ui/services/panelViews.js';
import { SITE_DOCUMENT_TITLES } from '../src/config/site.js';

const params = (search = '') => new URLSearchParams(search);

/** Las vistas enmarcadas: un iframe llenando el panel. */
const FRAMED = ['url', 'payment', 'document'];

describe('vistas enmarcadas', () => {
    it('ninguna arranca con la lista de grupos debajo', () => {
        FRAMED.forEach((view) => {
            assert.equal(bootLayoutView(view), 'url', `${view} deberia vestir la ropa de la vista web`);
        });
    });

    it('todas se pintan por encima de la lista, no en su lugar', () => {
        FRAMED.forEach((view) => assert.ok(OVERLAY_VIEWS.has(view), view));
    });

    it('cada una reclama su propio titulo, no el de la lista de grupos', () => {
        assert.equal(bootTitleKey('url', params()), 'webViewTitle');
        assert.equal(bootTitleKey('payment', params()), 'contribution');
        assert.equal(bootTitleKey('document', params('page=terms')), 'popupTermsLink');
    });
});

describe('bootTitleKey', () => {
    it('nombra cada documento por su pagina', () => {
        Object.entries(SITE_DOCUMENT_TITLES).forEach(([page, key]) => {
            assert.equal(bootTitleKey('document', params(`page=${page}`)), key);
        });
    });

    it('un documento sin pagina, o con una que no existe, no reclama titulo', () => {
        assert.equal(bootTitleKey('document', params()), null);
        assert.equal(bootTitleKey('document', params('page=whatever')), null);
    });

    it('una vista que la pagina no conoce no reclama titulo', () => {
        assert.equal(bootTitleKey('nonesuch', params()), null);
        assert.equal(bootTitleKey(null, params()), null);
    });
});

describe('bootLayoutView', () => {
    it('las vistas principales arrancan como ellas mismas', () => {
        ['groups', 'bookmarks', 'history', 'recent', 'reading', 'downloads', 'gemini'].forEach((view) =>
            assert.equal(bootLayoutView(view), view),
        );
    });

    it('lo que no se reconoce cae a la lista de grupos', () => {
        assert.equal(bootLayoutView('nonesuch'), 'groups');
        assert.equal(bootLayoutView(null), 'groups');
    });

    it('toda vista con titulo propio tiene una disposicion que no es la de grupos por descarte', () => {
        // Si una vista reclama la cabecera, tiene que traer tambien su propia disposicion:
        // reclamar el titulo y arrancar con el cuerpo de la lista de grupos es el parpadeo.
        ['bookmarks', 'history', 'downloads', 'gemini', 'notes', 'gallery', ...FRAMED].forEach((view) => {
            const claimsTitle = bootTitleKey(view, params('page=terms')) !== null;
            assert.ok(claimsTitle, `${view} deberia reclamar un titulo`);
            assert.notEqual(bootLayoutView(view), 'groups', `${view} no puede arrancar como la lista de grupos`);
        });
    });
});

describe('isFramedView', () => {
    it('reconoce las tres, que es lo que reclama la clase del marco antes del primer pintado', () => {
        FRAMED.forEach((view) => assert.ok(isFramedView(view), view));
    });

    it('no reclama el marco para ninguna otra vista', () => {
        ['groups', 'bookmarks', 'history', 'notes', 'gallery', 'gemini', 'nonesuch', null].forEach((view) =>
            assert.equal(isFramedView(view), false, String(view)),
        );
    });

    it('dice lo mismo que la disposicion de arranque', () => {
        // main.js reclama la clase del marco con esto, y ListGroup.svelte elige la
        // disposicion con lo otro. Si las dos mitades del arranque dejan de coincidir,
        // una de ellas vuelve a pintar el chrome de la lista de grupos primero.
        [...FRAMED, 'groups', 'bookmarks', 'history', 'notes', 'gallery', 'gemini', 'nonesuch', null].forEach((view) =>
            assert.equal(isFramedView(view), bootLayoutView(view) === 'url', String(view)),
        );
    });
});
