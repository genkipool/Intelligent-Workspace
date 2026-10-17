# Third-party notices

Every library the extension uses ships inside the package. Nothing is fetched from a CDN and
run: the one thing that can come over the network at run time is an OCR language model for a
language other than English or Spanish, which is data the recognizer reads, and it is listed
at the bottom with the rest.

This file exists so that the large minified files in the package can be identified rather
than guessed at. The biggest of them, `src/lib/tesseract-core.wasm.js`, is 4.6 MB and is
mostly one base64 string — that is an Emscripten `SINGLE_FILE` build, which is how a
WebAssembly binary is carried inside a `.js` file, and it is the published build of a public
package, not code written to be unreadable.

The `sha256` of each file is given so anyone can check it against the published package
rather than take this file's word for it.

## Bundled at build time

These are imported as modules; the bundler emits them into `assets/` with the rest of the
application code.

| Library | Version | Licence | Source in this repository | sha256 |
|:---|:---|:---|:---|:---|
| [tesseract.js](https://github.com/naptha/tesseract.js) | 5.0.5, **two places patched** — see below | Apache-2.0 | `src/lib/tesseract.min.js` | `1d9c82b89d940c65f713a1db3afbd6c8af8dce93b98d97a3082bf572e9e928e9` |
| [jsQR](https://github.com/cozmo/jsQR) | 1.4.0 | Apache-2.0 | `src/lib/jsQR.js` | `7989567794db4d9ecea21aac1feb9da2f4f5176a43bf1159ab81605190365041` |
| [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) | 1.x (UMD build; the file carries no version string) | MIT | `src/lib/qr-code-styling.js` | `761aa6e4c90f316d5ca6748be2d4c24efc454e69161929cf0d2b0d3c58f3866a` |
| [Svelte](https://github.com/sveltejs/svelte) | 5.x runtime | MIT | npm dependency | — |

`src/lib/chart.local.js` is not third-party. It is this project's own charting code, written
to the shape of the Chart.js API so the dashboards could drop the dependency.

## Copied into the package verbatim

The OCR engine loads these **by URL** rather than by import, so they have to exist at that
exact path inside the package. They are handed to `Tesseract.createWorker` as `workerPath`,
`corePath` and `langPath`. The library's own defaults for all three pointed at jsDelivr; they
have been taken out (see the patches below), so the engine cannot reach for a CDN on its own.

| Library | Version | Licence | Path in the package | sha256 |
|:---|:---|:---|:---|:---|
| [tesseract.js](https://github.com/naptha/tesseract.js) worker | 5.0.5, **three places patched** — see below | Apache-2.0 | `src/lib/worker.min.js` | `cbf3fc7fe6ec64710a4c8b3eca21ff01dd355ff5c4be192266c78028930caf6b` |
| [tesseract.js-core](https://github.com/naptha/tesseract.js-core) | the 5.x core that tesseract.js 5.0.5 loads; the file carries no version string of its own | Apache-2.0 | `src/lib/tesseract-core.wasm.js` | `c5d306536d8bcb19c5846a762525afe209021147fa4e93d18fa55f63f19c70af` |

| [tessdata](https://github.com/naptha/tessdata) English model | `4.0.0_best_int`, commit `806cd9ad` | Apache-2.0 | `src/lib/tessdata/eng.traineddata.gz` | `45b4cb346724ac1774f1c36f42f182b887bcdb28ebe63e6fff90ac41f3fcff91` |
| [tessdata](https://github.com/naptha/tessdata) Spanish model | `4.0.0_best_int`, commit `806cd9ad` | Apache-2.0 | `src/lib/tessdata/spa.traineddata.gz` | `40be52f97b5d4eb7460073dc1f94cd546b27150333c0bf854ed7e7132db6bceb` |

### The patches, and why

Both tesseract.js files are the published builds with a few places changed, stated here
rather than left to be found by whoever next refreshes them from npm. A header comment at the
top of each file says the same thing.

`src/lib/worker.min.js`:

1. Webpack's `globalThis` polyfill ends in a fallback that builds a function out of a string.
   That branch is unreachable in any browser that runs Manifest V3 — the enclosing expression
   returns `globalThis` before reaching it — but a string-to-function construct anywhere in a
   package is what the Chrome Web Store's remote-code rule is about. It now reads
   `return this || globalThis;`. On an engine with no `globalThis`, the bare reference throws a
   `ReferenceError` that the surrounding `try` already catches.
2. Without a `corePath`, the worker built a jsDelivr URL for the WebAssembly core and ran it
   with `importScripts`. The extension always passed the packaged core, so it never happened,
   but the code was in the package, and the Chrome Web Store rejected 1.0.2 for it (violation
   "Blue Argon"). It now throws `corePath is required`.
3. Without a `langPath`, the worker built a jsDelivr URL for the language models. They are
   data, not code, but the address belongs in the extension's own code, stated and pinned,
   not in a library default. It now throws `langPath is required`.

`src/lib/tesseract.min.js`:

1. The default options carried a `workerPath` on jsDelivr. It is gone.
2. With `workerBlobURL` on, the worker was started from a Blob whose text was
   `importScripts("<workerPath>")` — a script assembled from a string. The worker is now
   always started straight from its URL, and a missing `workerPath` throws.

Because of these changes the `sha256` values above do not match the files as published on
npm. Before any patch, `worker.min.js` hashed to
`06eb0a87ade7fe1652fc4d890041abbf2b8deb7bf1674722dac5a34409c0bad9`; `tesseract.min.js`, as
it sat in this repository before the patches, to
`c46216a3d1a41a945834c4c901c41fc241434e6e1d2429601acd6ac8a53bd93f`.

## The one thing fetched at run time

Reading text out of a screenshot needs a trained language model, one file per language. The
extension asks for the language its interface is in, plus English, which most screenshots
carry some of; after a failed run the user can pick another of its eleven languages.

English and Spanish ship in the package (above), so in those two nothing is fetched. For any
other language, the first OCR run in it fetches `<code>.traineddata.gz` from

`https://cdn.jsdelivr.net/gh/naptha/tessdata@806cd9adc8c6e8abc11c782db1818c990576bebc/4.0.0_best_int`

— a URL pinned to one commit, so the file behind it cannot change — and the engine caches it
in IndexedDB; later runs fetch nothing.

When a reading comes out empty or unsure, and the user has not picked a language for that
capture, the extension also fetches Tesseract's script detector, `osd.traineddata.gz`
(4.3 MB), once, from the `4.0.0` folder of the same commit (`OCR_REMOTE_OSD_PATH`). If it
finds Japanese, Chinese, Korean, Cyrillic or Devanagari script, the image is read again in
that language. The URL is written in `src/ui/services/screenshotsService.js`
(`OCR_REMOTE_LANG_PATH`), not in the library.

It is data the recognizer reads, not code it runs — the engine that reads it, the WebAssembly
core above, ships inside the package. Nothing about the user, the page or the image is sent
with the request: it asks for a file by name.
