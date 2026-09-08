/**
 * Componentes que se apoyan en la hoja de estilos global.
 *
 * Un componente Svelte sin bloque `<style>` propio se queda sin diseño en silencio
 * si alguien retira sus reglas: no falla el build ni el lint, solo aparece roto. Ya
 * paso una vez — el menu del altavoz vivia dentro de la region del reproductor de
 * musica en listGroup.css y se fue con el cuando se retiro el reproductor.
 *
 * Una clase esta justificada si algo la viste (aparece en alguna hoja) o si algo la
 * busca (un servicio la usa como gancho). Una clase que no hace ni lo uno ni lo otro
 * o esta muerta o esta rota.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';

const COMPONENTS_ON_THE_GLOBAL_SHEET = ['src/ui/components/listGroup/MuteAllButton.svelte'];

const readAll = (pattern) =>
    globSync(pattern)
        .map((file) => readFileSync(file, 'utf8'))
        .join('\n');

const everyStylesheet = readAll('src/**/*.css');
const everyScript = readAll('src/**/*.js');

/** Las clases que un componente pinta, tal cual aparecen en `class="..."`. */
function classesRenderedBy(source) {
    return [
        ...new Set(
            [...source.matchAll(/class="([^"{]+)"/g)].flatMap(([, value]) => value.split(/\s+/)).filter(Boolean),
        ),
    ];
}

const isStyled = (className) => new RegExp(`\\.${className}\\b`).test(everyStylesheet);
const isReachedForFromScript = (className) => new RegExp(`['"\`][^'"\`]*\\.?${className}\\b`).test(everyScript);

describe('componentes que dependen de la hoja global', () => {
    COMPONENTS_ON_THE_GLOBAL_SHEET.forEach((componentPath) => {
        const source = readFileSync(componentPath, 'utf8');

        it(`${componentPath} sigue sin estilos propios`, () => {
            assert.ok(!/<style/.test(source), 'si ya tiene <style> propio, sale de esta lista');
        });

        it(`${componentPath} no pinta ninguna clase huerfana`, () => {
            const orphans = classesRenderedBy(source).filter(
                (className) => !isStyled(className) && !isReachedForFromScript(className),
            );
            assert.deepEqual(orphans, [], `sin CSS que las vista ni codigo que las busque: ${orphans.join(', ')}`);
        });
    });
});
