/**
 * Tests for Defect #7: International compound ccTLD domain grouping.
 *
 * Ensures multi-part country-code domains (e.g. .com.ar, .co.in, .com.mx, .com.co,
 * .co.uk, .com.br, .co.jp, etc.) are correctly grouped under the genuine site brand name
 * and never collapsed into generic TLD/SLD fragments like "Com" or "Co".
 */

import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

describe('Defect #7: International compound ccTLD domain grouping', () => {
    let getDomain;

    before(() => {
        const utilsCode = readFileSync('src/core/background/utils.js', 'utf8');
        const groupCode = readFileSync('src/core/background/groupManager.js', 'utf8');
        const context = {
            console,
            URL,
            chrome: {
                runtime: { sendMessage: () => {} },
                storage: { local: {}, sync: {}, session: {} },
                sidePanel: { setOptions: () => {}, open: () => {} },
            },
            setTimeout,
            clearTimeout,
            setInterval,
            clearInterval,
            isModeDebug: false,
            extensionSettings: {},
        };
        vm.createContext(context);
        vm.runInContext(utilsCode, context);
        vm.runInContext(groupCode, context);
        getDomain = context.getDomain;
    });

    describe('Compound ccTLDs extraction (Latin America, Asia, Europe, Africa)', () => {
        const cases = [
            { url: 'https://www.google.com.ar/search?q=test', expectedName: 'Google' },
            { url: 'https://mercadolibre.com.mx/c/ofertas', expectedName: 'Mercadolibre' },
            { url: 'https://www.amazon.co.in/dp/B000', expectedName: 'Amazon' },
            { url: 'https://clarin.com.ar/sociedad', expectedName: 'Clarin' },
            { url: 'https://www.bbc.co.uk/news', expectedName: 'Bbc' },
            { url: 'https://www.bancolombia.com.co/personas', expectedName: 'Bancolombia' },
            { url: 'https://eltiempo.com.co/colombia', expectedName: 'Eltiempo' },
            { url: 'https://elpais.com.uy/informacion', expectedName: 'Elpais' },
            { url: 'https://gestion.com.pe/economia', expectedName: 'Gestion' },
            { url: 'https://www.google.co.jp/maps', expectedName: 'Google' },
            { url: 'https://daum.co.kr/main', expectedName: 'Daum' },
            { url: 'https://globo.com.br/noticias', expectedName: 'Globo' },
            { url: 'https://www.google.co.za/', expectedName: 'Google' },
            { url: 'https://noticias.uol.com.br/', expectedName: 'Uol' },
            { url: 'https://elpais.com.es/sociedad', expectedName: 'Elpais' },
            { url: 'https://amazon.co.uk/gp/bestsellers', expectedName: 'Amazon' },
        ];

        for (const { url, expectedName } of cases) {
            it(`correctly extracts "${expectedName}" and never "Com"/"Co" from ${url}`, () => {
                const domainResult = getDomain(url, false);
                assert.ok(domainResult, `Expected non-null result for ${url}`);

                // Strip the zero-width space indicator for clean name comparison
                const cleanName = domainResult.replace(/\u200B/g, '');
                assert.equal(cleanName, expectedName, `Brand name must be ${expectedName}`);

                // Critical assertion for Defect #7: must NEVER be "Com" or "Co"
                assert.notEqual(cleanName, 'Com', `Should not collapse to "Com" for ${url}`);
                assert.notEqual(cleanName, 'Co', `Should not collapse to "Co" for ${url}`);
                assert.notEqual(domainResult, 'Com\u200B');
                assert.notEqual(domainResult, 'Co\u200B');
            });
        }
    });

    describe('Standard TLDs & Single-part ccTLDs (Regression Prevention)', () => {
        const standardCases = [
            { url: 'https://www.google.com/search?q=test', expectedName: 'Google' },
            { url: 'https://github.com/trending', expectedName: 'Github' },
            { url: 'https://wikipedia.org/wiki/Main_Page', expectedName: 'Wikipedia' },
            { url: 'https://speedtest.net/run', expectedName: 'Speedtest' },
            { url: 'https://google.es/search', expectedName: 'Google' },
            { url: 'https://lemonde.fr/politique', expectedName: 'Lemonde' },
            { url: 'https://spiegel.de/international', expectedName: 'Spiegel' },
            { url: 'https://subdomain.company.net/portal', expectedName: 'Company' },
        ];

        for (const { url, expectedName } of standardCases) {
            it(`correctly extracts "${expectedName}" from standard domain ${url}`, () => {
                const domainResult = getDomain(url, false);
                assert.ok(domainResult, `Expected non-null result for ${url}`);
                const cleanName = domainResult.replace(/\u200B/g, '');
                assert.equal(cleanName, expectedName);
            });
        }
    });

    describe('Subdomain extraction with useSubdomain = true', () => {
        it('extracts subdomain on compound ccTLD when not www', () => {
            const result = getDomain('https://mail.google.com.ar', true);
            assert.equal(result?.replace(/\u200B/g, ''), 'Mail');
        });

        it('ignores www and extracts main brand on compound ccTLD', () => {
            const result = getDomain('https://www.google.com.ar', true);
            assert.equal(result?.replace(/\u200B/g, ''), 'Google');
        });

        it('extracts subdomain on standard gTLD when not www', () => {
            const result = getDomain('https://drive.google.com', true);
            assert.equal(result?.replace(/\u200B/g, ''), 'Drive');
        });

        it('extracts subdomain on co.uk domain when not www', () => {
            const result = getDomain('https://finance.yahoo.co.uk', true);
            assert.equal(result?.replace(/\u200B/g, ''), 'Finance');
        });
    });

    describe('Edge Cases and Defensive Parsing', () => {
        it('returns null for IPv4 address', () => {
            assert.equal(getDomain('http://192.168.1.1/admin'), null);
        });

        it('returns null for localhost', () => {
            assert.equal(getDomain('http://localhost:3000/app'), null);
            assert.equal(getDomain('http://127.0.0.1:8080'), null);
        });

        it('returns null for invalid or malformed URL', () => {
            assert.equal(getDomain('not-a-url'), null);
            assert.equal(getDomain(''), null);
            assert.equal(getDomain(null), null);
        });

        it('is case insensitive with uppercase hostnames', () => {
            const result = getDomain('https://WWW.GOOGLE.COM.AR/SEARCH', false);
            assert.equal(result?.replace(/\u200B/g, ''), 'Google');
        });
    });
});
