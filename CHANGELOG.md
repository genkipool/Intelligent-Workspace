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

- **Pick a colour from the screen in the theme editor.** The pipette next to each
  colour opens a magnifier over the page, with a pixel grid and the hex value under
  the cursor; clicking takes the colour and also puts it on the clipboard, and Escape
  calls the pick off. Chrome's own eyedropper is used where it exists — on Linux it
  does not, which is why the button did nothing there.
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
• Pick any colour on screen with the pipette in the theme editor: a magnifier, the hex value, and a copy to the clipboard.
• Right-click, text selection and copying work again on sites that block them.
• Music player: pick a folder and listen to your music while you work, with search, track list and full controls.
• Scheduled assistant queries can now run at several times of day.
• Themes scheduled by weekday now support "all day".
• Fixes to group renaming, the seen-tabs counter and grouping of new tabs.
```

---

## 1.0.0 — 2025-07-20

First stable release. What it brings is listed inside the extension itself, under
**About → Version history**, which is the list the user sees.
