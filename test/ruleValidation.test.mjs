/**
 * Tests for rule validation and URL verification.
 *
 * Ensures numeric inputs like 3242342424 cannot be parsed as valid URLs/IPv4 dwords,
 * neither in the rule creation/edit modal nor during rule imports.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { isValidUrl, toStoredUrl, validateRule, validateImportedRules } from '../src/ui/pages/rules/ruleValidation.js';

describe('isValidUrl', () => {
    it('rechaza entradas puramente numericas que WHATWG parsea como enteros IPv4', () => {
        const numericInputs = [
            '3242342424',
            '3242342424:8080',
            '3242342424/path',
            'https://3242342424',
            'http://3242342424',
            'http://3242342424:8080',
            'https://3242342424:8080/path?query=1#hash',
            '12345',
            'http://12345',
            'https://12345',
            '0',
            'http://0',
            '4294967295',
            '0x7f000001',
            '123.456',
            'http://123.456',
        ];

        for (const input of numericInputs) {
            assert.equal(isValidUrl(input), false, `Deberia rechazar '${input}'`);
        }
    });

    it('rechaza nombres sin punto ni esquema o con TLD numerico', () => {
        const invalidHosts = [
            'example',
            'http://example',
            'https://example',
            'test.123',
            'http://test.123',
            '-example.com',
            'example-.com',
            '',
            '   ',
            null,
            undefined,
            'ftp://example.com',
        ];

        for (const input of invalidHosts) {
            assert.equal(isValidUrl(input), false, `Deberia rechazar '${input}'`);
        }
    });

    it('acepta dominios validos con o sin esquema', () => {
        const validDomains = [
            'example.com',
            'www.example.com',
            'sub.example.co.uk',
            'example.com/path',
            'example.com:8080',
            'example.com:8080/path?query=1#hash',
            'https://example.com',
            'http://example.com',
            'https://sub.domain.org',
            'españa.es',
            'https://españa.es',
        ];

        for (const input of validDomains) {
            assert.equal(isValidUrl(input), true, `Deberia aceptar '${input}'`);
        }
    });

    it('acepta direcciones IPv4 estandar de 4 octetos', () => {
        const validIps = [
            '192.168.1.1',
            '192.168.1.1:9080',
            'https://192.168.1.1:9080',
            'http://192.168.1.1',
            '127.0.0.1',
            '0.0.0.0',
            '255.255.255.255',
        ];

        for (const input of validIps) {
            assert.equal(isValidUrl(input), true, `Deberia aceptar '${input}'`);
        }
    });

    it('acepta localhost con o sin puerto y esquema', () => {
        const validLocalhosts = ['localhost', 'localhost:3000', 'http://localhost:3000', 'https://localhost'];

        for (const input of validLocalhosts) {
            assert.equal(isValidUrl(input), true, `Deberia aceptar '${input}'`);
        }
    });

    it('acepta direcciones IPv6 entre corchetes', () => {
        const validIpv6 = ['[2002::1]', '[2002::1]:9080', 'https://[2002::1]:9080/path', '[::1]'];

        for (const input of validIpv6) {
            assert.equal(isValidUrl(input), true, `Deberia aceptar '${input}'`);
        }
    });

    it('acepta esquemas del navegador y de archivo', () => {
        const browserUrls = ['file:///home/example.txt', 'chrome://extensions', 'chrome-extension://abcdefghijklmnop'];

        for (const input of browserUrls) {
            assert.equal(isValidUrl(input), true, `Deberia aceptar '${input}'`);
        }
    });
});

describe('toStoredUrl', () => {
    it('conserva el valor tal cual si la URL es invalida para mostrar el error original', () => {
        assert.equal(toStoredUrl('3242342424', []), '3242342424');
        assert.equal(toStoredUrl('example', []), 'example');
    });

    it('antepone https:// a URLs validas sin esquema', () => {
        assert.equal(toStoredUrl('example.com', []), 'https://example.com');
        assert.equal(toStoredUrl('192.168.1.1', []), 'https://192.168.1.1');
    });

    it('mantiene esquemas existentes', () => {
        assert.equal(toStoredUrl('http://example.com', []), 'http://example.com');
        assert.equal(toStoredUrl('file:///home/test', []), 'file:///home/test');
    });
});

describe('validateRule', () => {
    it('rechaza una regla que contenga 3242342424', () => {
        const result = validateRule('MiRegla', 'blue', ['3242342424'], []);
        assert.equal(result.valid, false);
        assert.equal(result.message, 'invalidUrls');
        assert.deepEqual(result.params, ['3242342424']);
    });

    it('acepta una regla con URLs validas', () => {
        const result = validateRule('MiRegla', 'blue', ['https://example.com'], []);
        assert.equal(result.valid, true);
    });
});

describe('validateImportedRules', () => {
    it('rechaza datos que no son un array u objeto de reglas (ej. numero primitivo)', () => {
        const result = validateImportedRules(3242342424, [], 'add');
        assert.equal(result.valid, false);
        assert.equal(result.errors[0].message, 'errorImportingRulesInvalid');
    });

    it('rechaza archivos de reglas donde urls contiene numeros en vez de strings', () => {
        const invalidRules = [
            {
                name: 'ReglaInvalida',
                color: 'blue',
                urls: [3242342424],
                active: true,
            },
        ];
        const result = validateImportedRules(invalidRules, [], 'add');
        assert.equal(result.valid, false);
        assert.equal(result.errors[0].message, 'errorImportingRulesInvalid');
    });

    it('rechaza o descarta reglas importadas con URLs de tipo 3242342424 o https://3242342424', () => {
        const badRules = [
            {
                name: 'ReglaMal',
                color: 'blue',
                urls: ['3242342424'],
                active: true,
            },
            {
                name: 'ReglaMal2',
                color: 'red',
                urls: ['https://3242342424'],
                active: true,
            },
        ];

        // En modo overwrite: falla el archivo completo
        const resultOverwrite = validateImportedRules(badRules, [], 'overwrite');
        assert.equal(resultOverwrite.valid, false);
        assert.equal(resultOverwrite.errors.length, 2);
        assert.equal(resultOverwrite.errors[0].message, 'invalidUrls');
        assert.deepEqual(resultOverwrite.errors[0].params, ['3242342424']);
        assert.equal(resultOverwrite.errors[1].message, 'invalidUrls');
        assert.deepEqual(resultOverwrite.errors[1].params, ['https://3242342424']);

        // En modo add: descarta las reglas invalidas y reporta error
        const resultAdd = validateImportedRules(badRules, [], 'add');
        assert.equal(resultAdd.valid, false);
        assert.equal(resultAdd.rules.length, 0);
        assert.equal(resultAdd.errors.length, 2);
    });

    it('importa correctamente reglas validas', () => {
        const validRules = [
            {
                name: 'ReglaBien',
                color: 'blue',
                urls: ['example.com'],
                active: true,
            },
        ];
        const result = validateImportedRules(validRules, [], 'add');
        assert.equal(result.valid, true);
        assert.equal(result.rules.length, 1);
        assert.equal(result.rules[0].urls[0], 'https://example.com');
    });
});
