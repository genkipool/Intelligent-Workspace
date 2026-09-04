# Chrome Web Store Submission & Justifications Dossier: Intelligent Workspace

> **Last Updated:** 2026-09-04  
> **Extension Name:** Intelligent Workspace  
> **Version:** 1.0  
> **Manifest Version:** 3  

---

## 1. Store Listing Metadata

### Extension Name
- **Name:** `Intelligent Workspace` (21 characters, well below the 75-character limit)

### Short Description (Max 132 characters)
- **English:**
  ```text
  Intelligent productivity workspace: automated tab organization, smart side panel, integrated notes, and workflow focus tools.
  ```
  *(125 characters)*
- **Spanish:**
  ```text
  Estación de trabajo inteligente: organización automática de pestañas, panel lateral de notas y herramientas de productividad.
  ```
  *(125 characters)*

### Category
- **Category:** `Productivity` / `Productividad`

### Single Purpose Declaration
- **Official Single Purpose Statement (for CWS Reviewers):**
  > *"An integrated productivity workspace that organizes browser tabs into smart groups and centralizes session management, research notes, and deep-work focus tools in Chrome's side panel."*

---

## 2. Detailed Store Listing Copy

### English Detailed Description
*(Paste into the Chrome Developer Dashboard "Detailed Description" field. Formatted without raw markdown tags that CWS might strip)*

```text
Transform Google Chrome into an intelligent, organized, and hyper-productive workstation.

Intelligent Workspace unifies your browser's tabs, research notes, and focus workflow into a seamless side panel, eliminating tab overload and fragmented tools.

KEY CAPABILITIES

• Automated Tab & Window Organization: Automatically organize tabs by domain, subdomain, custom regular expressions, or project clusters. Keep your tab strip clean with automated collapse timers for inactive groups.

• Integrated Side Panel Workspace: Manage all your active tab groups, quick notes, and workspaces side-by-side without leaving your current webpage or losing context.

• Deep Work & Focus Timer: Integrated Pomodoro timer with task tracking, session metrics, distraction-free focus modes, and GitHub-style productivity activity analytics.

• Research Notes & Quick Scratchpad: Capture thoughts, snippets, links, and project notes directly linked to your workspace groups.

• Keyboard-First Navigation: Power through websites and your workspace with high-efficiency keyboard shortcuts, quick jump markers, and customizable omnibar commands.

• Workspace Backups & RAM Optimization: Save entire project groups to disk, free up system memory, and restore your work sessions with a single click whenever you return.

PRIVACY & DATA PROTECTION
Intelligent Workspace is built privacy-first:
• Your notes, screenshots, session backups, time records and Pomodoro history stay on this device, in the browser's own storage. There is no account, and no server of ours to send them to.
• Your settings, namely grouping rules, snippets and keyboard shortcuts, live in Chrome's synced storage, so a second computer signed into the same Chrome profile behaves the same way. That area belongs to Chrome: with Chrome sync switched off, none of it leaves the machine.
• The record of time spent per site is deliberately kept out of that. Syncing it is a switch of its own, off until you turn it on.
• No browsing history or personal data is collected, sold, or shared with third parties. No analytics, no tracking, no advertising.
• Optional AI features talk directly to the official Google Gemini API with your own API key, or to Chrome's built-in on-device model, which needs no key and no connection.

SUPPORT & COMMUNITY
• Support & Documentation: https://intelligentworkspace.genkipool.com
• Bug reports & Feedback: https://intelligentworkspace.genkipool.com/support
• Privacy Policy: https://intelligentworkspace.genkipool.com/privacy
```

### Spanish Detailed Description (Descripción detallada en español)
```text
Transforma Google Chrome en una estación de trabajo inteligente, organizada y productiva.

Intelligent Workspace unifica tus pestañas, notas de investigación y herramientas de concentración en un panel lateral continuo, eliminando el desorden visual y la sobrecarga cognitiva.

CARACTERÍSTICAS PRINCIPALES

• Organización Inteligente de Pestañas: Agrupa automáticamente pestañas por dominio, subdominio, reglas personalizadas o proyectos. Mantén tu navegador despejado con temporizadores de auto-colapso para grupos inactivos.

• Panel Lateral Integrado: Gestiona tus grupos de pestañas, notas rápidas y espacios de trabajo en paralelo, sin cambiar de ventana ni perder el contexto de tu página actual.

• Temporizador Pomodoro y Enfoque: Temporizador de concentración integrado con seguimiento de tareas, métricas de sesión, bloqueo de distracciones y gráficos de productividad interactivos.

• Notas de Investigación y Apuntes: Captura ideas, fragmentos de texto y enlaces asociados a tus grupos de trabajo directamente desde el panel.

• Navegación Ágil por Teclado: Desplázate y navega por pestañas y páginas mediante atajos de teclado rápidos, marcadores de salto y barra de comandos inteligente.

• Copias de Seguridad y Ahorro de Memoria: Guarda sesiones completas de pestañas, libéralas de la memoria RAM y restáuralas con un solo clic cuando las necesites.

PRIVACIDAD Y SEGURIDAD
Intelligent Workspace prioriza tu privacidad:
• Tus notas, capturas, copias de sesión, registros de tiempo e historial del Pomodoro se quedan en este dispositivo, en el almacenamiento del propio navegador. No hay cuenta ni servidor nuestro al que mandarlos.
• Tus ajustes, en concreto reglas de agrupación, snippets y atajos de teclado, viven en el área sincronizada de Chrome, para que un segundo ordenador con el mismo perfil se comporte igual. Esa área es de Chrome: con la sincronización desactivada, nada de eso sale de la máquina.
• El registro de tiempo por sitio se queda fuera a propósito. Sincronizarlo es un interruptor aparte, apagado hasta que tú lo enciendas.
• No recopilamos, no vendemos ni compartimos tu historial de navegación ni tus datos personales. Sin analíticas, sin seguimiento y sin publicidad.
• Las funciones opcionales de IA hablan directamente con la API oficial de Google Gemini usando tu propia clave, o con el modelo local integrado en Chrome, que no necesita ni clave ni conexión.

SOPORTE Y CONTACTO
• Sitio web y documentación: https://intelligentworkspace.genkipool.com
• Soporte y sugerencias: https://intelligentworkspace.genkipool.com/support
• Política de Privacidad: https://intelligentworkspace.genkipool.com/privacy
```

---

## 3. Permissions Justifications (CWS Reviewer Justification Table)

Copy and paste these exact, specific justifications into the **Chrome Developer Dashboard → Privacy & Permissions** form.

| Permission | Type | Official Justification for CWS Review Team |
|:---|:---|:---|
| `tabs` | `permissions` | Required to query, identify, and monitor active browser tabs so they can be grouped, organized by domain/rules, calculated for memory metrics, and restored into workspace sessions. |
| `tabGroups` | `permissions` | Core functionality. Allows creating, color-coding, naming, collapsing, and expanding native Chrome tab groups automatically according to user rules and auto-collapse timers. |
| `storage` | `permissions` | Required to locally persist workspace configurations, custom grouping rules, themes, project notes, and session states across browser restarts. |
| `commands` | `permissions` | Enables customizable keyboard shortcuts for power-user navigation (e.g., toggling the workspace side panel, collapsing groups, and navigating tabs without mouse interaction). |
| `favicon` | `permissions` | Displays website favicons in the side panel tab list, search drawer, and bookmarks view to provide instant visual identification of saved links and active tabs. |
| `contextMenus` | `permissions` | Provides quick contextual productivity actions from web pages, such as 'Regroup all tabs', 'Remove duplicate tabs', or 'Add page to workspace rule'. |
| `notifications` | `permissions` | Delivers desktop notifications when background workspace events complete, such as Pomodoro focus work/break transitions and scheduled reminders. |
| `sidePanel` | `permissions` | Core UI interface. Hosts the primary Intelligent Workspace manager in Chrome's native side panel for seamless side-by-side multitasking without leaving the active web page. |
| `scripting` | `permissions` | Injects helper content scripts upon user invocation for full-screen state observation, keyboard link-hint overlays, and reading mode adjustments. |
| `downloads` | `permissions` | Allows users to export their workspace configurations, session backups, productivity statistics, and research notes to local files for safekeeping. |
| `downloads.open` | `permissions` | Enables opening exported workspace backup files and generated productivity reports directly from the extension's internal downloads manager. |
| `system.display` | `permissions` | Queries screen display geometry and multi-monitor setups to optimize split-view layouts and side-by-side workspace positioning across displays. |
| `windows` | `permissions` | Organizes, moves, and manages browser windows when restoring multi-group project workspaces or segregating workspaces across distinct monitors. |
| `declarativeNetRequest` | `permissions` | Enforces website distraction-blocking rules during active Pomodoro focus sessions to prevent accessing configured unproductive websites. |
| `declarativeNetRequestWithHostAccess` | `permissions` | Applies the distraction-blocking rules across user-specified host domains during deep-work focus intervals without requiring persistent content script execution. |
| `cookies` | `permissions` | Maintains session consistency and partition isolation when previewing workspace links and managing embedded web views inside the side panel drawer. |
| `history` | `permissions` | Enables searching and deduplicating visited workspace links, calculating recent session productivity stats, and cleaning history from workspace groups. |
| `sessions` | `permissions` | Restores previously closed tab groups, closed tabs, and window sessions when recovering from unexpected browser crashes or reopening archived workspaces. |
| `bookmarks` | `permissions` | Integrates the user's bookmarks directly into the workspace side panel, allowing seamless bookmark organization and folder-to-group conversions. |
| `readingList` | `permissions` | Synchronizes workspace reading queues with Chrome's native reading list for later review and offline reading. |
| `clipboardWrite` | `permissions` | Allows users to copy workspace URL lists, research notes, markdown summaries, and color picker hex values to the system clipboard with a single click. |
| `alarms` | `permissions` | Triggers periodic background maintenance tasks, Pomodoro focus interval ticks, and inactive group auto-collapse timers reliably in the Manifest V3 service worker. |
| `offscreen` | `permissions` | Executes audio chime playback for Pomodoro timer notifications and off-screen canvas operations without interrupting the user's foreground browsing. |
| `idle` | `permissions` | Detects when the user is inactive or away from the computer to automatically pause Pomodoro timers and suspend idle tab groups to save CPU/RAM. |
| `<all_urls>` | `host_permissions` | Required to provide universal tab grouping by domain across any website, overlay keyboard navigation hints, and enforce distraction blocking on any domain during focus mode. |

---

## 4. Privacy & Data Use Disclosure Form

### Data Collection Checklist
- **Does the extension collect user data?** **YES** (Stored locally on the client. Every external request is user-initiated and named in section 5: Gemini queries under the user's own API key, the radio directory and the station being played, YouTube thumbnails for a link being previewed, the site-icon service behind the omnibar's results, and a one-off OCR language-model download).

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with 3rd Parties? |
|:---|:---|:---|:---|:---|
| **Personally Identifiable Info** | No | No | N/A | No |
| **Authentication Info / Cookies** | Yes (local read) | No | Session isolation in side panel | No |
| **Web History** | Yes (local) | No | Workspace link search, history deduplication & local activity metrics | No |
| **User Activity** | Yes (local) | No | Local Pomodoro session focus tracking and auto-collapse timers | No |
| **Website Content** | Yes (transient) | Yes (Only when user explicitly requests AI summary) | Transmitted directly to Google Gemini API using the user's API key for text summarization | Only to Google AI API upon user command |
| **Search terms (in-extension)** | Yes (transient) | Yes (radio search only) | The station name or genre typed into the radio browser, sent to the public radio-browser.info directory | Only to radio-browser.info upon user command |
| **Link domains** | Yes (transient) | Yes (omnibar results only) | The domain of a listed link, sent to Google's site-icon service to draw its favicon | Only to Google upon user command |

### Data Use Certification Checklist
- [x] Data is **NOT** sold to third parties.
- [x] Data is **NOT** used for purposes unrelated to the extension's core functionality.
- [x] Data is **NOT** used for creditworthiness or lending purposes.

---

## 5. Official Privacy Policy Text (For `intelligentworkspace.genkipool.com/privacy`)

> **The page is the canonical version.** It is published in English at
> <https://intelligentworkspace.genkipool.com/privacy> and in Spanish at
> <https://intelligentworkspace.genkipool.com/es/privacy>, and its copy lives in
> `Intelligent-Workspace-Web/src/i18n/ui.ts` (the `privacy.*` keys) with the tables in
> `src/data/privacy.ts`. What follows is that text, kept here so a CWS reviewer can read the
> policy without leaving this dossier. **If the two ever disagree, the published page wins:
> update it there and copy it back.**
>
> The structure is deliberate. The page opens with a plain-language summary and then an
> "Información básica" box carrying the six fields the AEPD asks for (responsable,
> finalidad, base jurídica, destinatarios, transferencias, derechos), and the seventeen
> numbered sections below it are the second layer. That is the layered notice the EDPB
> recommends in WP260 for a document this long, and it is what article 12 of the GDPR means
> by concise as well as complete.

```markdown
# Privacy Policy | Intelligent Workspace

**In effect since:** 4 September 2026
**Website:** https://intelligentworkspace.genkipool.com
**Contact:** luisrb1985@gmail.com

There is no account to create, no server of ours to talk to, and nothing in the extension that
reports back. That leaves this document short on promises and long on specifics: what is stored,
where it sits, and every moment something crosses the network.

- **No account, no server.** Nothing you do in the extension is sent to us. There is no "us" at
  the other end: no backend, no database, no log with your name on it.
- **Your key, your traffic.** The assistant talks to Google with the key you pasted, from your
  browser, under your quota. There is no proxy of ours in the middle to read it.
- **Nothing is sold, ever.** No advertising, no data brokers, no telemetry endpoint, and no
  profile of you for anyone to buy.

## Basic information on data protection

| | |
|:---|:---|
| **Controller** | Luis Reoyo (GENKI Organización), Spain. |
| **Purpose** | To run the features of the extension on your own device, and to serve this website. |
| **Legal basis** | Your consent, given by installing the extension and by switching on each optional feature, and our legitimate interest in serving and securing the website. |
| **Recipients** | None by default. A feature you trigger yourself can reach Google, the radio directory, YouTube, jsDelivr, Stripe or Vercel, each listed in section 5. |
| **Transfers** | Those providers are outside the EEA. The request is made by your browser and only when you ask for it. Section 6 explains the safeguards. |
| **Your rights** | Access, rectification, erasure, restriction, portability, objection, and the withdrawal of consent. Most of them you exercise yourself, from the panel. Section 14. |

## 1. Two different things, one policy

This covers the Chrome extension and the website you are reading. They are separate pieces of
software with separate privacy stories, and blurring the two is how a policy ends up meaning
nothing. Wherever a rule applies to one and not the other, it says so.

Both are published by Luis Reoyo (GENKI Organización), who is also the data controller for the
little the website handles. No data protection officer is appointed, because the scale of this
processing does not require one under article 37 of the GDPR. Anything in this document can be
checked against the source code, which is public.

## 2. Why each thing is processed, and under which legal basis

The GDPR asks for a lawful basis per purpose rather than one for the whole product, so here they
are, one line each.

- Running the features on your device: your consent, given when you install the extension and
  again when you switch on an optional feature such as the activity record or the assistant.
  Article 6.1.a.
- Sending a prompt to Google, searching the radio directory, loading a YouTube thumbnail or
  fetching a site icon: your consent, given by the action itself. Nothing is sent until you ask
  for it.
- Serving this website and keeping it up: our legitimate interest in delivering the pages you
  requested and in aggregate measurement that carries no identifier. Article 6.1.f.
- Processing a donation: performance of the transaction you started, and the accounting duties
  that follow it. Articles 6.1.b and 6.1.c.

Where the basis is consent you can withdraw it at any time, and withdrawing it is a switch in the
settings rather than a request to us. Withdrawal does not undo processing that already happened,
which in this case means data already written to your own device and which you can delete
yourself.

## 3. What the extension keeps, and where

Everything the extension knows lives in your own browser profile, in the two places Chrome gives
an extension: its storage areas and an IndexedDB database. Neither is reachable from the internet,
and no part of the extension copies them anywhere.

| What | Where it lives | Does it leave this machine? |
|:---|:---|:---|
| Groups, rules, colours and grouping preferences | `chrome.storage.sync` | Only through Chrome's own profile sync, if you have it switched on |
| Notes, checklists and Kanban boards | IndexedDB | No |
| Screenshots, and the text OCR reads out of them | IndexedDB | No |
| Conversations with the AI assistant | IndexedDB | No. The replies arrive from Google; the transcript stays here |
| Saved sessions and group backups | IndexedDB | Only inside a file you export yourself, to the folder you choose |
| Pomodoro sessions and their history | IndexedDB | No |
| Music you add and your radio favourites | IndexedDB | No |
| Web activity: seconds, visits and sessions per site, per day | `chrome.storage.local` | No, unless you switch on that record's own sync, which is off by default |
| Snippets, keyboard overrides and omnibar preferences | `chrome.storage.sync` | Only through Chrome's own profile sync, if you have it switched on |
| Your Google AI Studio key | `chrome.storage.local` | Never synced. It travels only as the header of your own request to Google |

Removing the extension from `chrome://extensions` deletes all of it, databases included. Chrome
does that itself, and nothing is left behind anywhere else, because there is nowhere else.

## 4. Chrome's own sync, and what rides along

Some settings, namely rules, snippets and keyboard overrides, are written to the browser's synced
storage area so a second computer signed into the same Chrome profile behaves the same way. That
area belongs to Chrome, not to us: with Chrome sync on, Google carries it under your account; with
it off, it stays on this machine and behaves exactly like local storage.

The web activity record is deliberately kept out of it. Syncing it is a switch of its own, off
until you turn it on, because where somebody has been is not something to start shipping anywhere
without being asked. Your API key is never synced at all.

## 5. When something does leave your browser

The features below reach the network because they cannot work otherwise, and each is listed with
what it sends and when. None of them is on a schedule and none runs in the background waiting to
phone home.

| Where to | What is sent | When |
|:---|:---|:---|
| `generativelanguage.googleapis.com` | Your prompt, whatever page text or screenshot you attached to it, and your own API key | Only when you ask the assistant for something |
| Chrome's built-in on-device model | Nothing. It runs inside Chrome, on this machine, and makes no request at all | When you choose it instead of Gemini |
| `api.radio-browser.info` | The station name or genre you typed, and nothing else | While you search or browse online radio |
| The radio station you press play on | An ordinary audio request to that station's own server, which sees your IP address as any website does | While a station is playing |
| `youtube.com` · `i.ytimg.com` | The video id, for the thumbnail and the embedded player | Only for a YouTube link you preview or play |
| `google.com/s2/favicons` | The domain of a link, so the omnibar can draw its site icon | While the omnibar has results on screen |
| `cdn.jsdelivr.net` | Nothing about you. It fetches the OCR language model, which Chrome then caches | The first time you run OCR on a screenshot |

And, of course, the websites you open yourself. The extension arranges the tabs around a page; it
does not sit between you and what is in it.

## 6. Transfers outside the European Economic Area

Every provider in that table is a company established in the United States: Google, Vercel,
Stripe, the jsDelivr network, and whichever server hosts the radio station you chose. A request to
any of them is an international transfer, so it is named here rather than left implied.

Two things limit it. The request is made by your browser, not forwarded by a server of ours, and
it happens only when you trigger the feature that needs it. Google, Vercel and Stripe are
certified under the EU to US Data Privacy Framework and also offer the European Commission's
standard contractual clauses, which are the safeguards these transfers rely on. Their own privacy
terms govern what they do with the request once it arrives.

## 7. How long any of it is kept

Nothing here has a server-side lifetime, because there is no server holding it. What exists on
your device stays until you delete it, and these are the rules it follows.

- Notes, screenshots, backups, conversations, Pomodoro history and the music library: kept until
  you delete them or remove the extension.
- The web activity record: kept for the number of days you set in its own settings, and older days
  are dropped automatically.
- Settings, rules and snippets: kept while the extension is installed. If Chrome sync carried a
  copy, removing the extension clears that copy too.
- A prompt sent to Google, or a search sent to the radio directory: gone from here as soon as the
  answer arrives. What the receiving service keeps is set by its own retention policy.

This website keeps no record of your visit beyond the request logs its host produces, which Vercel
rotates on its own schedule, and the aggregate page counts described in section 10.

## 8. The AI assistant

The assistant runs one of two ways, and you pick which. Gemini goes over the network with a Google
AI Studio key you create and paste yourself: the request is made by your browser, straight to
Google, on your key and your quota, and it is covered by Google's API terms rather than by this
policy. We are not a party to that traffic, because there is no service of ours in the middle that
could be.

The alternative is Chrome's built-in model, which runs on your machine and needs neither a key nor
a connection. Either way the conversation is written to the browser's own database and nowhere
else, and clearing it in the panel clears it for good.

## 9. Permissions, and what they are not for

Chrome will tell you the extension asks for twenty-four permissions plus access to every site.
That is a lot, and being suspicious about it is the right instinct, so each group is set out on the
home page beside the feature that cannot exist without it. None of them builds a profile, and none
feeds anything that leaves this machine except the connections listed above.

Access to every site is what lets the link labels, reader mode, snippet expansion and the activity
blocker work anywhere rather than on a list Chrome would have to approve first. It is not used to
read pages in the background: those scripts wake up when you press the key that calls them.

## 10. This website

The site is a handful of static files on Vercel. It has no login and asks for nothing. Your
browser's request reaches Vercel's servers, which see what any web server sees: an IP address, a
user agent, the page asked for. That is hosting, not tracking.

Two Vercel measurement scripts do run here: Analytics, which counts page views without cookies and
without a cross-site identifier, and Speed Insights, which reports how quickly the page rendered.
Both only ever aggregate, neither follows you to another site, and the extension itself carries
neither.

The donation page is the one exception to "no third-party frames": it loads Stripe, and only
Stripe.

## 11. Cookies and local storage

This website sets no cookies. Not an analytics cookie, not a session cookie, not a consent cookie,
which is why you were never shown a banner asking you to accept one.

It does store one thing in your browser, and only after you act: pressing the light and dark toggle
writes your choice under the key `iw-theme` in local storage, so the next page you open does not
flash the wrong colours. That is a preference you asked for, stored on your own device, readable by
nobody else, and article 22.2 of the Spanish LSSI exempts exactly this kind of storage from prior
consent. Clearing your browser data removes it and the site goes back to following your system
setting.

## 12. Donations

Donations go through Stripe. The card form is Stripe's own, running inside Stripe's frame, so the
card number is typed into their field and never touches this site, the one server function behind
it, or the extension. That function does exactly one thing: ask Stripe to create a payment between
1 and 500 euros and hand the browser back a token good for that single payment.

What Stripe collects, and what it does with it, is governed by Stripe's privacy policy rather than
this one. We keep no record of who donated, because there is no database here to keep one in. A
donation is voluntary, unlocks nothing, and is not a subscription.

## 13. Chrome Web Store Limited Use

Intelligent Workspace's use of information received from Google APIs follows the Chrome Web Store
User Data Policy, including its Limited Use requirements. Concretely: the data is used only to
provide the features described here and on the home page; it is never sold; it is never transferred
to anyone except where a feature you triggered requires it; it is never used for advertising,
profiling or creditworthiness; and no human reads it, because it never arrives anywhere a human
could.

## 14. Your data, and getting rid of it

You hold all of it, which answers most of the usual rights on its own. There is no export request
to file, because the extension writes its own data to a file whenever you ask. There is no deletion
request either, because the delete button is already in the panel.

- Delete one thing, a note, a screenshot, a backup or a day of activity, where it is shown.
- Wipe a whole area from the extension's settings, the activity record and the assistant's
  conversations included.
- Remove the extension at `chrome://extensions` and Chrome drops every byte of its storage with it.
- Turn off Chrome's profile sync, or the activity record's own sync switch, if you would rather
  nothing rode along.
- Withdraw your consent to any optional feature by switching it off, which stops the processing
  from that moment on.
- Revoke your Google AI Studio key in Google's console. It is your key on your account, and
  revoking it ends the extension's access immediately.

If you are in the EU or the UK, the rights of access, rectification, erasure, restriction,
portability and objection apply, along with the right to withdraw consent. In practice there is
nothing here to act on, but write to the address below and you will get a straight answer about
what exists, which is what those rights are for. You will have one within a month.

You can also complain to a supervisory authority. In Spain that is the Agencia Española de
Protección de Datos, at www.aepd.es.

## 15. Responsibility, minors and the law

The controller is Luis Reoyo (GENKI Organización), Spain. Spanish and EU data protection law
applies: Regulation (EU) 2016/679, Organic Law 3/2018, and Law 34/2002 for the website itself.

Nothing here is a statutory or contractual requirement. You are not obliged to provide any data,
and the only consequence of providing none is that the feature you did not use does not run. There
is no automated decision making and no profiling of any kind, under article 22 of the GDPR or
otherwise.

The extension is a general productivity tool, not directed at children, and it collects nothing
that would identify one, or anyone else. There is no age gate because there is no account to put
one in front of.

## 16. Changes to this policy

When this policy changes the new version replaces this page and the date at the top moves with it.
Any change that alters what leaves your browser will also be named in the release notes of the
version that makes it, and announced in the extension itself, so it cannot arrive quietly.

## 17. Contact

Questions about any of this, including the ones that begin "I do not believe you", go to
luisrb1985@gmail.com. The source code is public, so a claim on this page that the code does not
back up is a bug report worth filing.
```
