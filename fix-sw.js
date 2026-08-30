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
