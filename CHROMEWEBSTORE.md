# Chrome Web Store Submission & Justifications Dossier — Intelligent Workspace

> **Last Updated:** 2026-09-04  
> **Extension Name:** Intelligent Workspace  
> **Version:** 1.0  
> **Manifest Version:** 3  

---

## 1. Store Listing Metadata

### Extension Name
- **Name:** `Intelligent Workspace` (21 characters — well below the 75-character limit)

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
• All tab groupings, notes, and metrics are stored locally on your device using Chrome's native storage.
• No browsing history or personal data is collected, sold, or shared with third parties.
• Optional AI features communicate exclusively and securely with the official Google Gemini API using your own configuration.

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
• Todas las agrupaciones, notas y métricas se procesan y almacenan de forma estrictamente local en tu dispositivo.
• No recopilamos, no vendemos ni compartimos tu historial de navegación ni tus datos personales.
• Las funciones opcionales de IA se comunican exclusivamente con la API oficial de Google Gemini bajo tu propia configuración.

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
- **Does the extension collect user data?** **YES** (Stored locally on client; only external transmission is user-initiated Gemini AI queries via user API key).

| Data Type | Collected? | Transmitted Off-Device? | Purpose | Shared with 3rd Parties? |
|:---|:---|:---|:---|:---|
| **Personally Identifiable Info** | No | No | N/A | No |
| **Authentication Info / Cookies** | Yes (local read) | No | Session isolation in side panel | No |
| **Web History** | Yes (local) | No | Workspace link search, history deduplication & local activity metrics | No |
| **User Activity** | Yes (local) | No | Local Pomodoro session focus tracking and auto-collapse timers | No |
| **Website Content** | Yes (transient) | Yes (Only when user explicitly requests AI summary) | Transmitted directly to Google Gemini API using the user's API key for text summarization | Only to Google AI API upon user command |

### Data Use Certification Checklist
- [x] Data is **NOT** sold to third parties.
- [x] Data is **NOT** used for purposes unrelated to the extension's core functionality.
- [x] Data is **NOT** used for creditworthiness or lending purposes.

---

## 5. Official Privacy Policy Text (For `intelligentworkspace.genkipool.com/privacy`)

```markdown
# Privacy Policy — Intelligent Workspace

**Effective Date:** September 4, 2026  
**Website:** https://intelligentworkspace.genkipool.com  
**Contact:** privacy@genkipool.com  

### 1. Introduction
Intelligent Workspace ("we", "our", or "the extension") is a productivity extension designed to organize tabs, workspaces, and research workflows. We are deeply committed to safeguarding your privacy and ensuring you have complete control over your personal data.

### 2. Information We Process
Intelligent Workspace processes information strictly to provide on-device functionality:
- **Tabs and Windows:** Information about open tabs (titles, URLs) is processed locally to group and categorize your tabs.
- **Notes and Configurations:** Workspace settings, custom rules, and research notes are stored locally on your device via `chrome.storage.local`.
- **Browsing Activity & History:** When using the optional history search or focus-tracking features, history items and timestamps are read and indexed strictly within your local browser storage (IndexedDB). No browsing logs leave your computer.
- **Cookies:** Cookie access is strictly utilized for session isolation and embedded side panel previews. We never store or transmit cookies externally.

### 3. Third-Party Services & AI Integration
- **Google Gemini API:** If you choose to enable the optional AI Assistant or Summarization features, text extracts or prompts are sent directly from your browser to Google's Gemini API endpoints (`generativelanguage.googleapis.com`) using your own configured API key. Your data is handled subject to Google's API Privacy Terms.
- **Donation Processing:** Payments and voluntary donations are processed securely via external HTTPS payment portals (Stripe/PayPal). The extension never handles, collects, or stores payment card information.

### 4. Data Sharing and Sale
- We **never** sell, rent, or trade your personal data.
- We **never** share your data with data brokers, ad networks, or analytics firms.
- All core extension operations occur entirely offline on your local machine.

### 5. Your Rights & Data Deletion
You retain complete ownership of your data. You can delete all locally stored workspace data, notes, and activity records at any time directly through the extension's settings or by uninstalling the extension from `chrome://extensions`.

### 6. Changes to this Policy
We may periodically update this Privacy Policy. Any modifications will be posted to this page with an updated effective date.

### 7. Contact Us
For questions regarding this policy, please reach out to: `privacy@genkipool.com`.
```
