/**
 * Group names from `getDomain`, and rule matching on hosts and ports.
 *
 * The first table is what ordinary sites were named before the fixes below, captured
 * from the previous code: none of them may change. The rest are the cases that were
 * wrong — sites living directly on a public suffix all named "Www", a trailing-dot host
 * named "Com", IDN hosts named in Punycode, rules that could never match.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { matchesRule as uiMatchesRule } from '../src/ui/services/utils.js';

const gm = readFileSync('src/core/background/groupManager.js', 'utf8');
const ctx = { URL, console };
vm.createContext(ctx);
vm.runInContext(
    readFileSync('src/core/background/utils.js', 'utf8') +
        '\n' +
        gm.slice(gm.indexOf('function isLocalhost'), gm.indexOf('function addToGroup')),
    ctx,
);
const name = (url, sub = false) => {
    const n = ctx.getDomain(url, sub);
    return n === null ? null : n.replace(/​$/, '');
};

const UNCHANGED = [
    ['https://www.google.com/', 'Google', 'Google'],
    ['https://mail.google.com/x', 'Google', 'Mail'],
    ['https://docs.google.com/', 'Google', 'Docs'],
    ['https://www.youtube.com/watch?v=1', 'Youtube', 'Youtube'],
    ['https://github.com/a/b', 'Github', 'Github'],
    ['https://gist.github.com/', 'Github', 'Gist'],
    ['https://www.bbc.co.uk/news', 'Bbc', 'Bbc'],
    ['https://news.bbc.co.uk/', 'Bbc', 'News'],
    ['https://www.amazon.co.jp/', 'Amazon', 'Amazon'],
    ['https://www.amazon.com.br/', 'Amazon', 'Amazon'],
    ['https://www.mercadolibre.com.ar/', 'Mercadolibre', 'Mercadolibre'],
    ['https://elpais.com/', 'Elpais', 'Elpais'],
    ['https://www.elmundo.es/', 'Elmundo', 'Elmundo'],
    ['https://www.abc.net.au/', 'Abc', 'Abc'],
    ['https://en.wikipedia.org/wiki/A', 'Wikipedia', 'En'],
    ['https://es.m.wikipedia.org/', 'Wikipedia', 'Es'],
    ['https://stackoverflow.com/q/1', 'Stackoverflow', 'Stackoverflow'],
    ['https://www.reddit.com/r/x', 'Reddit', 'Reddit'],
    ['https://old.reddit.com/', 'Reddit', 'Old'],
    ['https://web.whatsapp.com/', 'Whatsapp', 'Web'],
    ['https://t.co/x', 'T', 'T'],
    ['https://x.com/home', 'X', 'X'],
    ['https://www.ox.ac.uk/', 'Ox', 'Ox'],
    ['https://www.cam.ac.uk/', 'Cam', 'Cam'],
    ['https://www.mod.gov.uk/', 'Mod', 'Mod'],
    ['https://www.hacienda.gob.es/', 'Hacienda', 'Hacienda'],
    ['https://www.sat.gob.mx/', 'Sat', 'Sat'],
    ['https://www.city.go.jp/', 'City', 'City'],
    ['https://www.nhs.uk/', 'Nhs', 'Nhs'],
    ['https://www.example.com:8443/x', 'Example', 'Example'],
    ['https://app.slack.com/', 'Slack', 'App'],
    ['https://www.go.com/', 'Go', 'Go'],
    ['https://go.dev/', 'Go', 'Go'],
    ['https://www.com.example/', 'Com', 'Com'],
    ['https://www.www.example.com/', 'Example', 'Www'],
    ['https://www.example/', 'Www', 'Www'],
    ['https://www.uk/', 'Www', 'Www'],
    ['https://foo.bar.baz.example.co.uk/', 'Example', 'Foo'],
    ['https://a.b.example.com/', 'Example', 'A'],
    ['https://localhost:3000/', null, null],
    ['http://192.168.1.1/', null, null],
    ['https://intranet.local/', 'Intranet', 'Intranet'],
    ['https://www.intranet.local/', 'Intranet', 'Intranet'],
    ['https://my-site.io/', 'My-site', 'My-site'],
    ['https://www.nic.ar/', 'Nic', 'Nic'],
    ['https://www.registro.br/', 'Registro', 'Registro'],
];

describe('getDomain names', () => {
    it('leaves ordinary sites exactly as they were named', () => {
        for (const [url, plain, sub] of UNCHANGED) {
            assert.equal(name(url), plain, url);
            assert.equal(name(url, true), sub, `${url} (subdomains)`);
        }
    });

    it('names a site that lives on a public suffix after the suffix, not "Www"', () => {
        const cases = {
            'https://www.gov.uk/browse': 'Gov.uk',
            'https://gov.uk/x': 'Gov.uk',
            'https://www.gob.es/': 'Gob.es',
            'https://www.gob.mx/': 'Gob.mx',
            'https://www.go.jp/': 'Go.jp',
            'https://www.ac.uk/': 'Ac.uk',
            'https://co.uk/': 'Co.uk',
        };
        for (const [url, expected] of Object.entries(cases)) {
            assert.equal(name(url), expected, url);
            assert.equal(name(url, true), expected, `${url} (subdomains)`);
        }
        assert.equal(name('https://www.ac.me/'), 'Ac', 'heuristic suffixes lose the www too');
    });

    it('names a trailing-dot host like the host without it', () => {
        assert.equal(name('https://example.com./a'), 'Example');
        assert.equal(name('https://mail.google.com./', true), 'Mail');
    });

    it('shows IDN hosts in Unicode', () => {
        assert.equal(name('https://bücher.de/'), 'Bücher');
        assert.equal(name('https://www.xn--bcher-kva.de/'), 'Bücher');
        assert.equal(name('https://münchen.de/'), 'München');
        assert.equal(name('https://日本語.jp/'), '日本語');
        assert.equal(ctx.decodePunycodeLabel('xn--'), 'xn--', 'malformed labels stay as they were');
        assert.equal(ctx.decodePunycodeLabel('xn--zzzz'), 'xn--zzzz');
    });
});

describe('matchesRule (worker and UI copies)', () => {
    for (const [label, matchesRule] of [
        ['worker', ctx.matchesRule],
        ['ui', uiMatchesRule],
    ]) {
        it(`${label}: a trailing-dot tab host matches its rule`, () => {
            assert.equal(matchesRule('https://example.com./a', 'https://example.com'), true);
            assert.equal(matchesRule('https://example.com/a', 'https://example.com.'), true);
            assert.equal(matchesRule('https://example.org./a', 'https://example.com'), false);
        });

        it(`${label}: a rule's port compares with the port the tab really uses`, () => {
            // `intranet.local:80` is stored as https://intranet.local:80.
            assert.equal(matchesRule('http://intranet.local:80/x', 'https://intranet.local:80'), true);
            assert.equal(matchesRule('http://intranet.local/x', 'https://intranet.local:80'), true);
            assert.equal(matchesRule('https://intranet.local/x', 'http://intranet.local:443'), true);
            assert.equal(matchesRule('https://intranet.local/x', 'https://intranet.local:80'), false);
            assert.equal(matchesRule('http://intranet.local:8080/x', 'https://intranet.local:80'), false);
            assert.equal(matchesRule('https://example.com:8443/', 'https://example.com:8443'), true);
            assert.equal(matchesRule('https://example.com/', 'https://example.com:8443'), false);
            // A rule without a port still matches any port, as before.
            assert.equal(matchesRule('https://example.com:8443/', 'https://example.com'), true);
        });
    }
});

describe('isSearchUrl on country domains', () => {
    const search = { URL };
    vm.createContext(search);
    vm.runInContext(
        gm.slice(gm.indexOf('const SEARCH_ENGINES_SET'), gm.indexOf('function isEligibleForDomainGrouping')),
        search,
    );
    const isSearchUrl = (url) => vm.runInContext(`isSearchUrl(${JSON.stringify(url)})`, search);

    it('treats a search on a country Google like the same search on google.com', () => {
        for (const url of [
            'https://www.google.com/search?q=x',
            'https://www.google.es/search?q=x',
            'https://google.de/search?q=x',
            'https://www.google.com.ar/search?q=x',
            'https://www.google.co.uk/search?q=x',
            'https://es.search.yahoo.com/search?q=x',
            'https://search.yahoo.co.jp/search?q=x',
        ]) {
            assert.equal(isSearchUrl(url), true, url);
        }
    });

    it('leaves everything else on those domains to normal grouping', () => {
        for (const url of [
            'https://www.google.es/',
            'https://mail.google.es/?q=x',
            'https://www.google.evil.com/search?q=x',
            'https://www.googlex.es/search?q=x',
            'https://docs.google.com/document/d/1',
        ]) {
            assert.equal(isSearchUrl(url), false, url);
        }
    });
});
