# 🧭 Intelligent Workspace

> **Transform Google Chrome into an intelligent, hyper-productive, and autonomous workstation.**

![Version](https://img.shields.io/badge/Version-1.0.0-blue.svg)
![Status](https://img.shields.io/badge/Status-Production-success.svg)
![License](https://img.shields.io/badge/License-Proprietary-red.svg)

**Intelligent Workspace** is an integrated productivity workstation built directly into Google Chrome's side panel. It unifies intelligent tab and window organization, workspace research notes, deep-work focus tracking (Pomodoro), and keyboard-driven navigation into a single cohesive, distraction-free environment.

---

## ✨ Key Features

### 🤖 AI Assistant & Agent (Google Gemini Integration)
- **Autonomous Agent Mode:** Ask the AI in natural language to organize your browser (e.g., *"Close all sports tabs and create a red group called Work with the GitHub and Jira tabs"*).
- **Chat & Summaries:** Summarize long articles instantly, extract key information, and save your conversation history.
- **Scheduled AI Tasks:** Program the AI to execute background tasks (e.g., daily news summaries) at specific days and times.

### 📁 Intelligent Tab Management
- **Automated Grouping:** Group tabs by domain, subdomain, IP address, or custom rules (Regex).
- **Smart Auto-Collapse:** Configurable timers that automatically collapse inactive tab groups to keep your visual workspace clean.
- **Workspaces & Backups:** Save entire groups of tabs, unload them from RAM, and restore them with a single click whenever needed.

### 🍅 Productivity & Deep Work
- **Advanced Pomodoro Panel:** Floating timer with project-based task management.
- **Analytics & Dashboard:** Visualize your efficiency, interruptions, GitHub-style activity heatmaps, and work streaks directly in an interactive dashboard.

### ⌨️ Keyboard Navigation & Snippets
- **Hints System:** Navigate, click, copy links, and scroll through any web page using exclusively the keyboard.
- **Dynamic Snippets:** Create rich-text shortcuts with custom variables (`$1`, `$2`) that automatically expand in any text input field across the web.

### 🛠️ Productivity & Workspace Utilities
- **Split Screen:** View two tabs side-by-side in parallel within the same browser window.
- **Reading Modes & Themes:** Dark mode, sepia, paper, and a custom theme creator with color palettes injected directly into the browser interface.
- **Research Capture:** Full-page and area screenshot capture tool with local gallery, bookmark manager, and quick notes.

---

## 🚀 Installation & Build (Developer Mode)

To build and install the extension locally from source code:

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher recommended)
- [pnpm](https://pnpm.io/) (installed via `npm install -g pnpm` or Corepack)

### Build Instructions
```bash
# 1. Clone the repository
git clone https://github.com/luisrb85/intelligent-tab-group.git
cd intelligent-tab-group

# 2. Install project dependencies
pnpm install

# 3. Build the extension for production
pnpm run build
```

*(For live development with hot reload, run `pnpm run dev` instead).*

### Load into Chrome
1. Open Google Chrome and navigate to `chrome://extensions/`.
2. Enable **"Developer mode"** (toggle in the top right corner).
3. Click on **"Load unpacked"** (*Cargar descomprimida*).
4. Select the **`dist/`** folder generated inside the project directory (NOT the root folder).
5. Pin **Intelligent Workspace** to your toolbar for quick access.

---

## ⚙️ Initial Configuration

To get the most out of the Artificial Intelligence features:
1. Open the extension's side panel by clicking on the **Intelligent Workspace** icon.
2. Go to the **AI Assistant** tab.
3. Click on **"Add API Key"**.
4. Paste your free API Key from [Google AI Studio](https://aistudio.google.com/app/apikey). *(For complete privacy and security, your API key is stored exclusively locally on your device).*

---

## 🤝 Contributing & Bug Reports

We greatly appreciate the technical community for reporting bugs and proposing improvements!

If you wish to contribute code via Pull Requests, please carefully read our `CONTRIBUTING.md` file. Please note that in order to integrate your improvements into the official version of the extension, **by submitting a Pull Request you agree to assign all intellectual property rights of that contribution** to the original creators of the project.

Found a bug or have a feature request? Please open an [Issue](https://github.com/luisrb85/intelligent-tab-group/issues) detailing the problem.

---

## 📜 License & Intellectual Property

**Copyright (c) 2026 GENKI Organization / Luis Reoyo. All rights reserved.**

The source code of "Intelligent Workspace" is published on GitHub for the sole purpose of allowing security audits, encouraging learning, and facilitating community collaboration via *Pull Requests*.

**IT IS STRICTLY PROHIBITED TO:**
1. Copy, clone, fork (for external or separate project use), or reproduce this code to create derivative products.
2. Compile, package, or publish this code (in whole or in part) on the Chrome Web Store, Edge Add-ons, Firefox Add-ons, or any other software distribution platform.
3. Use this code or any of its components for commercial purposes.

**GRANTED PERMISSIONS:**
- You are granted permission to download and compile this code on your local machine **exclusively for personal and private use**.
- You may create a *Fork* on GitHub solely and exclusively for the purpose of proposing improvements or fixing bugs via *Pull Requests* submitted back to this original repository.

---

## 🎖️ Credits & Acknowledgements

- **Development & Architecture:** Luis Reoyo (Luisrb85).
- **UX/UI Design & QA Testing:** Flor Chávez.

*Special thanks to Flor Chávez for her tireless dedication in quality assurance testing, designing the project logo, and creating an aesthetically premium and intuitive user experience. This extension would not exist at its current standard of excellence without her contributions.*

---
*Smarter navigation, effortlessly.*
