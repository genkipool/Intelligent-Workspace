# Changelog

What changes in each version, and the text that goes on the Chrome Web Store listing.
The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the
versions follow [SemVer](https://semver.org/).

Spanish version: [CHANGELOG.es.md](CHANGELOG.es.md). Both files are kept in step —
whatever is added here is added there.

Each version holds two different things, and they are worth keeping apart:

- **The detail** (`Added` / `Changed` / `Fixed`), which is for us and for anyone
  reading the repository.
- **The store text**, which is what goes into the _What's new_ field on the Chrome
  Web Store when the update is uploaded. It is deliberately short: the store cuts it
  off. The Spanish wording lives in the Spanish changelog, because the listing is
  published in both languages.

## Releasing a version

1. Raise the number in `manifest.json` (`"version"`). The store rejects an upload
   whose number is not higher than the published one.
2. Move whatever is under `Unreleased` into a section with its number and date, here
   and in `CHANGELOG.es.md`.
3. Add the version to the history shown inside the extension:
   `src/ui/pages/about/components/VersionHistorySection.svelte`, with its translation
   keys in `_locales/en/messages.json` and `_locales/es/messages.json`.
4. If the version brings new features, add them to
   `src/ui/pages/about/components/FeatureCategoriesSection.svelte` as well.
5. `npm run build`, then upload the contents of `dist/` as a ZIP.
6. Paste the store text into _What's new_, in English and in Spanish.

---

## Unreleased

### Added

- **Read any page out loud.** A reader that speaks the text of the page, lights up
  the paragraph and follows the word being said, and scrolls along with them. Its
  controls sit in a narrow column against the right edge, which can be tucked away and
  brought back, and it answers to the space bar and the arrow keys as well as to its
  own letters — all of them listed and changeable in Navigation settings. It reaches a
  page three ways, and each of them is a toggle: hovering the assistant button on a tab
  card, the `ar` keyboard command, and the `ar:` omnibar prefix, which lists every tab
  and reads whichever is picked, bringing it to the front if it was asleep. When the
  assistant button is hidden, the reader moves into that row's overflow menu along with
  the summary.
- **The reader follows the word it is saying, on any system.** The mark used to
  depend on the browser reporting each word, which plenty of voices — most of the Linux
  ones — never do, so on those machines it never moved. It is now driven by a clock
  measured against the text, corrected by those reports wherever they do arrive and
  re-measured from every paragraph that finishes, so it converges on the real speaking
  speed after the first one.
- **The reader reads what a page actually says.** Headlines and standfirsts that live
  in an article's own header, Reddit post titles, x.com posts, and YouTube titles,
  descriptions and comments — none of which are paragraphs, and all of which used to be
  passed over. Select some text first and only the selection is read.
- **Choose what the reader puts on the page.** Navigation settings can turn off the
  floating panel, the mark that follows the word being said, and the highlight over the
  text being read, and each has a key of its own while the reader is open. The marks
  are painted in the colours of the theme, and follow it when it changes.
- **Choose the reading voice.** Navigation settings now has a voice picker, grouped
  by language, plus speed, pitch and volume and a button that reads a sample. It
  governs the page reader, the notes and the AI assistant alike; left on automatic,
  the browser keeps choosing as before.
- **Capture every tab of a group at once.** A camera on the group card walks the
  group tab by tab, capturing each one into the group's gallery, with a progress
  count while it runs. Hovering it offers the same walk over the full page of each
  tab.
- **Capture the full page, not just what is on screen.** The camera on a tab card now
  offers three ways to capture — the visible area, the whole page, and an area you
  draw — and the whole page is stitched together by scrolling through it, with
  sticky headers and cookie bars kept from being stamped onto every strip.
- **Download a capture as a PNG, a PDF, or both.** The download button — on a single
  card and on the whole gallery — asks which, and a PDF of several captures is one
  document rather than a folder of one-page files. A tall page is paginated across as
  many A4 sheets as it needs.
- **Capture a full page in parts**, one image per screenful, for a page that reads
  better as a series of screens than as one image the height of a building.
- **Pick a colour from the screen in the theme editor.** The pipette next to each
  colour opens a magnifier over the page, with a pixel grid and the hex value under
  the cursor; clicking takes the colour and also puts it on the clipboard, and Escape
  calls the pick off. It is the extension's own magnifier on every platform, so the
  pipette behaves the same everywhere — Chrome's built-in eyedropper does not exist
  on Linux at all, which is why the button used to do nothing there.
- **Right-click and copying on sites that block them.** The context menu, text
  selection, copy, cut, paste and dragging come back, images covered by a
  transparent layer included. It is on from the start and can be switched off in
  Navigation settings. The page's own handlers still run, so a site with its own
  context menu keeps working.
- **Music player.** Pick a folder on your computer and load all its music: play,
  pause, stop, previous and next track, a progress bar with quick jumps, search
  within the folder and the full track list. The audio keeps playing while you work
  with your tabs.
- **Several times for the same scheduled assistant query.** A query can run more than
  once on the same day, or on each of the chosen weekdays, instead of only once.
- **"All day" when scheduling a theme by weekday**, with no need to fill in a start
  and an end time.

### Fixed

- Pausing the reader and playing again carries on from the word that is marked. It
  used to hand the reading back to the browser, which on some systems restarted it
  somewhere else or never restarted it at all.
- Reading speeds above 1 are no longer faster than asked for. The panel's picker and
  the speed in Navigation settings were multiplying each other; they are now two views
  of one number, and moving either is heard straight away.
- The lowest pitch is audible again. Zero — the bottom of the slider — was being read
  as "no value given" and quietly turned back into the middle of the range.
- Capturing a whole group no longer returns to the tab you were on between each
  capture; it goes back once, when the last one is done.
- The speaker on a tab card no longer ignores a click. It used to work out what to do
  from the card rather than from the tab, and the two could disagree.
- The speaker on the preview of a YouTube Short works on every Short. It turned the
  sound on for some and not for others: YouTube holds those previews muted and puts
  the mute straight back, so whether the sound survived was luck. It now plays at the
  volume set in YouTube rather than at full blast, and stops appearing on the previews
  of ordinary videos, which have YouTube's own speaker. Where the preview has not
  started yet, or is already over, there is no longer an invisible speaker over the
  thumbnail swallowing the click that opens the Short.

- The `seen/total` counter next to the group name no longer misses the click that
  wakes the background worker; that tab used to go uncounted for the rest of the
  session.
- A new tab can now be put into a group. "Add tab to group → New group" in the
  browser's own menu used to undo itself.
- Renaming a group no longer makes letters nobody typed appear, and no longer
  reorders the tab strip on every keystroke.
- A group left without a name gets its own back automatically, even when all that is
  left in the box are the invisible characters the extension uses to mark the group
  type.
- The duplicate-name warning goes away as soon as the clash is undone.

### Store text

```
What's new
• Read any page out loud, with the paragraph and the word lit up as they are said, and the voice, speed and pitch of your choice.
• Capture the full page — not just what is on screen — and download it as a PDF.
• Capture every tab of a group with one click.
• Pick any colour on screen with the pipette in the theme editor: a magnifier, the hex value, and a copy to the clipboard.
• Right-click, text selection and copying work again on sites that block them.
• Music player: pick a folder and listen to your music while you work, with search, track list and full controls.
• Scheduled assistant queries can now run at several times of day.
• Themes scheduled by weekday now support "all day".
• Fixes to group renaming, the seen-tabs counter, grouping of new tabs and the speaker on YouTube Shorts previews.
```

---

## 1.0.0 — 2025-07-20

First stable release. What it brings is listed inside the extension itself, under
**About → Version history**, which is the list the user sees.
