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

- Notes gathered from every context — the orphans section and the popup's notes button
  — can be edited. The button used to be taken off those cards because saving from a
  list that belongs to no single group had nowhere to file the note back to; an edit no
  longer files anything, so it stays.
- **Read any page out loud.** A reader that speaks the text of the page, lights up
  the paragraph and follows the word being said, and scrolls along with them. Its
  controls sit in a narrow column against the right edge, which can be tucked away and
  brought back, and it answers to the space bar and the arrow keys as well as to its
  own letters — all of them listed and changeable in Navigation settings. It reaches a
  page four ways, and each of them is a toggle: hovering the assistant button on a tab
  card, the browser's own right-click menu, the `ar` keyboard command, and the `ar:`
  omnibar prefix, which lists every tab and reads whichever is picked, bringing it to
  the front if it was asleep. When the assistant button is hidden, the reader moves into
  that row's overflow menu along with the summary.
- **The reader is in the right-click menu.** Right-clicking a page offers to read it
  out loud, and right-clicking selected text offers to read the selection — which is
  what the reader does with a selection anyway, so the two entries are the same command
  under the title that fits what was clicked. A second click stops the reading, and
  since the menu closes on the click, a notification says which of the two just
  happened. It also says "reading the selection" now wherever the reader was started
  from, instead of claiming to read the page.
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
- **Web activity.** A dashboard for the time your browsing actually costs: how long
  you spend on each site, counted only while you are really there — the clock stops
  when you go idle or the browser loses focus — filed by category, with the ones it
  recognises on its own and the ones you add. A daily and a weekly allowance per site,
  with a warning before the time runs out, and hours outside which a site does not open
  at all; a site over its allowance shows a screen saying why it is blocked and when it
  lifts, with five more minutes if you need them, and a password can stand in front of
  the rules so switching one off is not a click away. The patterns are drawn as a year
  in a heatmap, the hours of the day and the days of the week, and every site is listed
  with search, sorting and the columns you choose. Sites can be left out of the record
  altogether, older history is deleted after the period you set, and everything is kept
  on this device, with import, export and optional sync between your browsers. It
  opens in the side panel too, pinnable, showing what is being timed right now.
- **Online radio, next to the music.** Search thousands of live stations by name,
  country or genre, add several at once, and keep the ones you like — stored on the
  device, exported and imported as JSON without duplicates, and synced between your
  browsers. Local music, the stations and a single unified queue are three tabs of the
  same player.
- **A note from the selected text.** Select something on a page and one key — or the
  browser's own right-click menu, which is the same command — files it as a note under
  the group the page belongs to, titled with the nearest heading above the selection —
  the last `h1`, `h2` or `h3` before it — and falling back to the tab's name on a page
  with no headings at all. A second selection under the same heading is added to the
  note that is already there, so a long page leaves one note per section rather than
  one note for the whole of it.
- **Capture a whole group from the keyboard.** The three walks the camera on a group
  card offers — the visible area of every tab, the whole page of every tab, and the
  whole page of every tab in parts — each have a command of their own, listed and
  changeable in Navigation settings like the rest.
- **The licence is on the About page**, in the reader's own language: the copyright,
  what the licence allows — reading the code, compiling it for yourself, forking it to
  send a Pull Request back — and what it does not, with a link to the full bilingual
  text in the repository.
- **The speaker on a YouTube Short's hover preview** is listed among the features it
  belongs with; it turns the sound on at the volume already set in YouTube and stays on
  from one Short to the next.
- **Open anything in the side panel from the omnibar.** A prefix of its own lists the
  open tabs and takes an address or a search as well, and Ctrl+Enter does the same to
  whichever result is highlighted — a tab, a bookmark, a history entry, a recently
  closed page or the search itself.

### Changed

- The search bar of the group list opens in the side panel on Enter, and in a browser
  tab on Ctrl+Enter. It was the other way round: the panel is where the box lives and
  where a search typed into it is nearly always meant to be read, so it is the answer
  that needs no modifier, and leaving the panel is the deliberate keypress. The
  modifier now also means the same thing everywhere — it used to be ignored while a
  page was open in the panel or in a popup window, both of which forced the panel
  whatever was held down.

### Fixed

- Leaving the gallery no longer leaves the group list wearing the wrong search row.
  The class the stylesheet hangs the collapsed search bar and the spread-out controls
  off is taken away when a view is painted over the list, and nothing put it back, so a
  gallery closed by deleting its last capture came back to a list that did not match
  the one the popup's own button opens. The notes, the web view and the assistant were
  all coming back the same way, and the pomodoro and music panels stayed hidden with
  them.
- The newest version in the About page's history can be collapsed. It was forced open
  on every render, so it was the one entry in the list that answered no click; opening
  a version on the second page no longer opens whatever sat in the same position on the
  first.
- Editing a note no longer moves it. Saving rebuilt the note's context from whichever
  list was on screen, so editing from the orphans section or from the popup's notes
  button rewrote the context under the card — a note filed under `Genkipool` came back
  as `General`. A note only changes place when the user moves it; the pomodoro session
  behind the Pomodoro filter survives an edit too.
- The copy and delete buttons on a note card show what they do. Their tooltips named a
  translation that was never written, so the key itself was shown.
- Deleting the last note keeps the notes view open. It used to close and drop the user
  back on the group list, which from the popup's notes button meant a screen they had
  never asked for; the empty list now stays put with its welcome message.
- Rich text pasted into a note stays inside the note. What the clipboard carries is
  measured for the page it was copied from — table widths, pixel sizes, floats,
  absolutely positioned pieces — and pasted raw it laid itself out over the card. The
  formatting is kept and the layout is dropped, on the way in and again when an older
  note is drawn, so a note saved before this is contained too. A pasted table now
  scrolls inside itself rather than pushing the card open, and script tags, event
  handlers and `javascript:` links do not survive the paste at all.
- The console no longer complains that a local AI request named no output language.
  Every session already declared one; `availability()` — which the panel asks on every
  boot — did not, and it is a LanguageModel request like any other.
- The read-out-loud button on a tab card shows a voice: five bars rising and falling,
  the shape a waveform makes while somebody is speaking. The old drawing was a speaker
  with a single sound wave so shallow it read as a dash fused to the cone rather than
  as sound, and it ran past the right edge of its box and was clipped flat.
- Pasting into Telegram no longer pastes the text twice. Unblocking the right click
  also dropped a page's attempt to cancel a paste, and Telegram cancels every paste to
  insert the clipboard itself, so the text went in once from the app and once from the
  browser. A cancelled paste is now honoured, and the paste is put back afterwards only
  when the page cancelled it without ever reading the clipboard — a block and nothing
  else.
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
• Web activity: see what each site costs you in time, set a daily or weekly allowance and the hours it can be opened, and have it blocked when the time is up.
• Read any page out loud, with the paragraph and the word lit up as they are said, and the voice, speed and pitch of your choice.
• Capture the full page — not just what is on screen — and download it as a PDF.
• Capture every tab of a group with one click.
• Pick any colour on screen with the pipette in the theme editor: a magnifier, the hex value, and a copy to the clipboard.
• Right-click, text selection and copying work again on sites that block them.
• Music player and online radio: your own folder or thousands of live stations, with search, track list and full controls.
• Take a note from the text you select, in the group the page belongs to.
• Open a tab, an address or a search in the side panel straight from the omnibar.
• Scheduled assistant queries can now run at several times of day.
• Themes scheduled by weekday now support "all day".
• Fixes to group renaming, the seen-tabs counter, grouping of new tabs and the speaker on YouTube Shorts previews.
```

---

## 1.0.0 — 2025-07-20

First stable release. What it brings is listed inside the extension itself, under
**About → Version history**, which is the list the user sees.
