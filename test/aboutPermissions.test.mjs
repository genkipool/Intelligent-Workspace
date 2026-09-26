/**
 * The About page explains every permission the extension asks for, and only those.
 * A reviewer compares the two lists, and so does a user reading the install prompt.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

describe('About page permissions', () => {
    it('lists exactly the permissions and host permissions of manifest.json', () => {
        const manifest = JSON.parse(readFileSync('manifest.json', 'utf8'));
        const source = readFileSync('src/ui/pages/about/components/PermissionsSection.svelte', 'utf8');
        const listed = [...source.matchAll(/\['([^']+)', 'perm\w+'\]/g)].map((m) => m[1]).sort();
        assert.deepEqual(listed, [...manifest.permissions, ...manifest.host_permissions].sort());
    });
});
