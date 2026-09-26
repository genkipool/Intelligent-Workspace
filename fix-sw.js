import fs from 'fs';
import path from 'path';

const distPath = path.resolve('dist');
const manifestPath = path.join(distPath, 'manifest.json');
const swLoaderPath = path.join(distPath, 'service-worker-loader.js');

try {
  if (fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // 1. Remove "type": "module" from background
    if (manifest.background && manifest.background.type === 'module') {
      delete manifest.background.type;
      console.log('✅ Removed "type": "module" from manifest.json');
    }

    /*
     * 2. Put the content scripts back exactly as the source manifest.json declares them.
     *
     * The bundler rewrites `content_scripts` into loaders of its own, which is not what
     * these classic scripts need, so they are restored here. They are read from the
     * source manifest rather than listed a second time in this file: with two copies, a
     * script added to one and not the other was dropped without a word.
     *
     * Why each entry is shaped the way it is (the manifest cannot carry comments):
     * - panelScrollbar.js runs in every frame because the frame it is there for is the
     *   web page framed inside the side panel; it stops at its first line elsewhere.
     * - videoPipHook.js runs in the main world, so it can replace
     *   HTMLVideoElement.prototype.requestPictureInPicture and hand a site's own
     *   picture-in-picture button to our floating player.
     * - The two YouTube hooks run in the main world too: the hover-preview player
     *   exposes mute/unMute/setVolume as page properties on the element, and the Shorts
     *   feed is a property on `ytd-shorts` -- neither visible from the isolated world.
     * - allowRightClickHook.js is main world as well: the right-click unblocker has to
     *   reach preventDefault, the on* handler properties and Selection from the page's
     *   own context.
     */
    const sourceManifest = JSON.parse(fs.readFileSync(path.resolve('manifest.json'), 'utf8'));
    manifest.content_scripts = sourceManifest.content_scripts;

    // 3. Put back the web-accessible resources the source manifest lists for every site.
    if (!manifest.web_accessible_resources) {
        manifest.web_accessible_resources = [];
    }
    const war = manifest.web_accessible_resources.find(w => w.matches.includes("<all_urls>")) || { matches: ["<all_urls>"], resources: [] };
    const sourceWar = sourceManifest.web_accessible_resources.find((w) => w.matches.includes('<all_urls>'));
    for (const resource of sourceWar?.resources ?? []) {
        if (!war.resources.includes(resource)) {
            war.resources.push(resource);
        }
    }
    if (!manifest.web_accessible_resources.includes(war)) {
        manifest.web_accessible_resources.push(war);
    }

    /*
     * 3b. Hide the web-accessible resources behind per-session URLs.
     *
     * Anything listed here is fetchable by ANY page at a URL it can work out from the
     * extension id, which is fixed once the extension is on the Web Store. That is a
     * reliable "is this person running Intelligent Workspace" probe for every site the
     * reader visits — a tracking signal the reader never agreed to. `use_dynamic_url`
     * swaps the id for a GUID that changes every session, so `chrome.runtime.getURL()`
     * inside the extension keeps working (measured: 200 for every resource) while the
     * guessable URL stops resolving (measured: blocked for every resource).
     *
     * It is applied HERE rather than only in the source manifest because the bundler
     * writes its own entries for the hashed `assets/*.js` copies of the content
     * scripts, and those would otherwise stay probeable — leaving one open door, which
     * is all a fingerprint needs.
     *
     * blocked.html is included, and that is a deliberate reversal. It is the target of
     * the web-activity blocker's declarativeNetRequest rules, which are *dynamic* and
     * therefore outlive a browser restart, while the GUID is reissued on every one — so
     * between a restart and the first `waRebuildBlockRules` (now also called from
     * `runtime.onStartup`) a blocked site redirects to a URL that no longer resolves.
     * Measured, rather than assumed: the request FAILS CLOSED. Chrome shows
     * ERR_BLOCKED_BY_CLIENT and the blocked site does not load. The whole cost is an
     * ugly error page instead of the block screen, in a window of milliseconds — which
     * is a smaller price than leaving every site on the web able to detect this
     * extension.
     */
    for (const entry of manifest.web_accessible_resources) {
        entry.use_dynamic_url = true;
    }
    console.log(`\u2705 use_dynamic_url on ${manifest.web_accessible_resources.reduce((n, e) => n + e.resources.length, 0)} web-accessible resources`);

    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log('✅ Injected content_scripts and web_accessible_resources into manifest.json');
  }

  // 4. Change ES import to importScripts in service-worker-loader.js
  if (fs.existsSync(swLoaderPath)) {
    let swContent = fs.readFileSync(swLoaderPath, 'utf8');
    if (swContent.includes('import ')) {
      swContent = swContent.replace(/import\s+['"]([^'"]+)['"];?/g, "importScripts('$1');");
      fs.writeFileSync(swLoaderPath, swContent);
      console.log('✅ Replaced import with importScripts in service-worker-loader.js');
    }
  }

  // 5. Ensure importScripts paths in the background bundle are root-relative ('/...')
  const assetsDir = path.join(distPath, 'assets');
  if (fs.existsSync(assetsDir)) {
    const bgBundles = fs.readdirSync(assetsDir).filter(f => f.startsWith('background.js') && f.endsWith('.js'));
    for (const bgFile of bgBundles) {
      const bgPath = path.join(assetsDir, bgFile);
      let bgContent = fs.readFileSync(bgPath, 'utf8');
      const fixed = bgContent
        .replace(/importScripts\(['"`]\.\.\//g, "importScripts('/")
        .replace(/importScripts\(['"`]\.\//g, "importScripts('/");
      if (fixed !== bgContent) {
        fs.writeFileSync(bgPath, fixed);
        console.log(`✅ Normalized importScripts paths to root-relative in ${bgFile}`);
      } else {
        console.log(`ℹ️  importScripts paths already root-relative in ${bgFile}`);
      }
    }
  }
} catch (err) {
  console.error('❌ Error fixing service worker files:', err);
  process.exit(1);
}

// 5. Minify the content scripts.
//
// They are injected into every frame of every page the browser loads, so the browser
// parses them once per frame: some 1 MB of source, mostly comments, for each iframe on
// every page. They are plain scripts that share one global scope, so top-level names are
// left alone (`mangle.toplevel: false`); the build step checks that every top-level
// declaration survives with its name and kind. Set ITG_NO_MINIFY=1 to keep them readable.
if (!process.env.ITG_NO_MINIFY && fs.existsSync(manifestPath)) {
  const { minify, parseSync } = await import('vite');
  const topLevel = (code, filename) => {
    const { program, errors } = parseSync(filename, code, { sourceType: 'script' });
    if (errors?.length) throw new Error(`${filename}: ${errors[0].message}`);
    const names = new Map();
    for (const node of program.body) {
      if (node.type === 'VariableDeclaration') {
        for (const d of node.declarations) if (d.id.type === 'Identifier') names.set(d.id.name, node.kind);
      } else if ((node.type === 'FunctionDeclaration' || node.type === 'ClassDeclaration') && node.id) {
        names.set(node.id.name, 'function-or-class');
      }
    }
    return names;
  };
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const files = [...new Set((manifest.content_scripts || []).flatMap((c) => c.js || []))];
  let before = 0;
  let after = 0;
  for (const file of files) {
    const filePath = path.join(distPath, file);
    const source = fs.readFileSync(filePath, 'utf8');
    const { code, errors } = await minify(file, source, {
      compress: true,
      mangle: { toplevel: false },
      codegen: { removeWhitespace: true },
    });
    if (errors?.length) throw new Error(`Minifying ${file}: ${errors[0].message}`);
    const original = topLevel(source, file);
    const minified = topLevel(code, `${file}.min`);
    for (const [name, kind] of original) {
      const now = minified.get(name);
      const lost = !now || (kind === 'var' && now !== 'var') || ((kind === 'let' || kind === 'const') && now === 'var');
      if (lost) throw new Error(`Minifying ${file} changed its top-level "${name}" (${kind} -> ${now ?? 'missing'})`);
    }
    fs.writeFileSync(filePath, code);
    before += source.length;
    after += code.length;
  }
  console.log(`✅ Minified ${files.length} content scripts: ${Math.round(before / 1024)} KB -> ${Math.round(after / 1024)} KB`);
}
