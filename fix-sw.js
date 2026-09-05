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

    // 2. Inject original content_scripts back
    manifest.content_scripts = [
      {
        "matches": ["<all_urls>"],
        "css": ["src/styles/prevent_flash.css"],
        "js": ["src/utils/globalFullscreenObserver.js"],
        "run_at": "document_start",
        "all_frames": false
      },
      {
        "matches": ["<all_urls>"],
        "js": ["src/utils/iframeSearch.js"],
        "all_frames": false,
        "run_at": "document_idle"
      },
      {
        // Every frame, because the one it is there for is the web page framed inside
        // the side panel; it stops at its first line everywhere else.
        "matches": ["<all_urls>"],
        "js": ["src/utils/panelScrollbar.js"],
        "all_frames": true,
        "run_at": "document_start"
      },
      {
        // Main world, so it can replace HTMLVideoElement.prototype.requestPictureInPicture
        // and hand a site's own picture-in-picture button to our floating player.
        "matches": ["<all_urls>"],
        "js": ["src/utils/hint/videoPipHook.js"],
        "all_frames": false,
        "run_at": "document_start",
        "world": "MAIN"
      },
      {
        // Main world as well: YouTube's hover-preview player exposes mute/unMute/setVolume
        // as page properties on the element, which the isolated world cannot see.
        "matches": ["*://*.youtube.com/*"],
        "js": ["src/utils/hint/youtubePreviewAudioHook.js"],
        "all_frames": false,
        "run_at": "document_start",
        "world": "MAIN"
      },
      {
        // Main world too: the right-click unblocker has to reach preventDefault,
        // the on* handler properties and Selection from the page's own context.
        "matches": ["<all_urls>"],
        "js": ["src/utils/allowRightClickHook.js"],
        "all_frames": true,
        "match_about_blank": true,
        "run_at": "document_start",
        "world": "MAIN"
      },
      {
        "matches": ["<all_urls>"],
        "js": ["src/utils/allowRightClick.js"],
        "all_frames": true,
        "match_about_blank": true,
        "run_at": "document_start"
      },
      {
        "matches": ["<all_urls>"],
        "js": [
          "src/utils/hint_common.js",
          "src/utils/hint/utils.js",
          "src/utils/hint/videoPipUi.js",
          "src/utils/hint/videoPip.js",
          "src/utils/hint/ui.js",
          "src/utils/hint/snippets.js",
          "src/utils/hint/omnibar.js",
          "src/utils/hint/engine.js",
          "src/utils/hint/preview.js",
          "src/utils/hint/registry.js",
          "src/utils/hint/main.js"
        ],
        "all_frames": true,
        "match_about_blank": true,
        "run_at": "document_idle"
      }
    ];

    // 3. Inject hint scripts back to web_accessible_resources
    if (!manifest.web_accessible_resources) {
        manifest.web_accessible_resources = [];
    }
    const war = manifest.web_accessible_resources.find(w => w.matches.includes("<all_urls>")) || { matches: ["<all_urls>"], resources: [] };
    const hintScripts = [
        "_locales/es/messages.json",
        "_locales/en/messages.json",
        "src/utils/hint/utils.js",
        "src/utils/hint/videoPipUi.js",
        "src/utils/hint/videoPip.js",
        "src/utils/hint/videoPipHook.js",
        "src/utils/hint/ui.js",
        "src/utils/hint/snippets.js",
        "src/utils/hint/omnibar.js",
        "src/utils/hint/engine.js",
        "src/utils/hint/preview.js",
        "src/utils/hint/registry.js",
        "src/utils/hint/main.js"
    ];
    for (const script of hintScripts) {
        if (!war.resources.includes(script)) {
            war.resources.push(script);
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
