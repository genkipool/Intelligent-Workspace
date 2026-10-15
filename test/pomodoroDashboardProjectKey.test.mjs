/**
 * A pomodoro project is its name within its folder. Keyed by name alone, "Docs" in two
 * folders shared one count in the sidebar and renaming one renamed both.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { projectKey } from '../src/ui/pages/pomodoro-dashboard/dashboardAnalytics.js';

describe('projectKey', () => {
    it('tells the same name in different folders apart', () => {
        assert.notEqual(projectKey('ClientA', 'Docs'), projectKey('ClientB', 'Docs'));
        assert.notEqual(projectKey('', 'Docs'), projectKey('ClientA', 'Docs'));
        assert.equal(projectKey('ClientA', 'Docs'), projectKey('ClientA', 'Docs'));
    });

    it('treats a missing folder as no folder', () => {
        assert.equal(projectKey(undefined, 'Docs'), projectKey('', 'Docs'));
    });

    it('cannot be forged by a folder or name that contains the other', () => {
        assert.notEqual(projectKey('a b', 'c'), projectKey('a', 'b c'));
    });
});

describe('dashboard rename', () => {
    it('only renames sessions in the folder of the project being renamed', () => {
        const src = readFileSync(
            new URL('../src/ui/pages/pomodoro-dashboard/Dashboard.svelte', import.meta.url),
            'utf8',
        );
        const rename = src.slice(src.indexOf('async function renameProject('), src.indexOf('function selectAll('));
        assert.match(rename, /\(val\.projectFolder \|\| ''\) === folder/);
    });
});
