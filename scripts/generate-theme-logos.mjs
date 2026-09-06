/**
 * @file generate-theme-logos.mjs
 * Script to generate SVG and PNG assets for Intelligent Workspace logo across all themes.
 * Generates both native aspect ratio (536x476) and square icon dimensions (512, 128, 48, 16).
 */

import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, existsSync, copyFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');
const iconsDir = resolve(rootDir, 'assets/icons');
const themesDir = resolve(iconsDir, 'themes');
const backupDir = resolve(iconsDir, 'backup-old');

mkdirSync(themesDir, { recursive: true });
mkdirSync(backupDir, { recursive: true });

// Palette configurations for each theme
const THEMES = {
    original: {
        name: 'Original (Default)',
        cardBack: '#5ABCCC',
        rectBack: '#FFFFFF',
        cardMid: '#66ACEB',
        rectMid: '#FFFFFF',
        cardFront: '#4474C5',
        bar: '#9AC5EA',
        dot1: '#F48325',
        dot2: '#DF5F1D',
        dot3: '#F4D54E',
        dot4: '#3E9D46',
    },
    light: {
        name: 'Light Theme',
        cardBack: '#5ABCCC',
        rectBack: '#FFFFFF',
        cardMid: '#3498DB',
        rectMid: '#FFFFFF',
        cardFront: '#0658AA',
        bar: '#9AC5EA',
        dot1: '#F48325',
        dot2: '#DF5F1D',
        dot3: '#F4D54E',
        dot4: '#3E9D46',
    },
    dark: {
        name: 'Dark Theme',
        cardBack: '#424242',
        rectBack: '#FFFFFF',
        cardMid: '#5F6368',
        rectMid: '#FFFFFF',
        cardFront: '#2C2C2C',
        bar: '#424242',
        dot1: '#F48325',
        dot2: '#DF5F1D',
        dot3: '#F4D54E',
        dot4: '#3E9D46',
    },
    viridian: {
        name: 'Viridian Theme',
        cardBack: '#48C9B0',
        rectBack: '#FFFFFF',
        cardMid: '#16A085',
        rectMid: '#FFFFFF',
        cardFront: '#0E6655',
        bar: '#73D2BE',
        dot1: '#F48325',
        dot2: '#DF5F1D',
        dot3: '#F4D54E',
        dot4: '#3E9D46',
    },
};

/**
 * Builds SVG markup for a given theme palette.
 */
function buildSvg(c) {
    return `<svg xmlns="http://www.w3.org/2000/svg"
     width="536"
     height="476"
     viewBox="0 0 536 476">

  <!-- BACK CARD -->
  <rect x="11" y="10"
        width="324" height="300"
        rx="49"
        fill="${c.cardBack}"/>

  <!-- BACK WHITE RECTANGLE -->
  <rect x="49" y="42"
        width="157" height="104"
        rx="24"
        fill="${c.rectBack}"/>

  <!-- MIDDLE CARD -->
  <rect x="80" y="87"
        width="324" height="300"
        rx="49"
        fill="${c.cardMid}"/>

  <!-- MIDDLE WHITE RECTANGLE -->
  <rect x="116" y="117"
        width="158" height="104"
        rx="24"
        fill="${c.rectMid}"/>

  <!-- MAIN CARD -->
  <rect x="148" y="146"
        width="324" height="299"
        rx="49"
        fill="${c.cardFront}"/>

  <!-- BAR -->
  <rect x="165" y="179"
        width="343" height="84"
        rx="18"
        fill="${c.bar}"/>

  <!-- ORANGE CIRCLE -->
  <circle cx="213.5" cy="221"
          r="31.5"
          fill="${c.dot1}"/>

  <!-- DARK ORANGE CIRCLE -->
  <circle cx="295.5" cy="221"
          r="31.5"
          fill="${c.dot2}"/>

  <!-- YELLOW CIRCLE -->
  <circle cx="377.5" cy="221"
          r="31.5"
          fill="${c.dot3}"/>

  <!-- GREEN CIRCLE -->
  <circle cx="459.5" cy="221"
          r="31.5"
          fill="${c.dot4}"/>

</svg>
`;
}

/**
 * Builds standalone adaptive SVG markup using CSS variables with original fallbacks.
 */
function buildAdaptiveSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg"
     width="536"
     height="476"
     viewBox="0 0 536 476">
  <style>
    .card-back { fill: var(--logo-card-back, #5ABCCC); }
    .rect-back { fill: var(--logo-rect-back, #FFFFFF); }
    .card-mid { fill: var(--logo-card-mid, #66ACEB); }
    .rect-mid { fill: var(--logo-rect-mid, #FFFFFF); }
    .card-front { fill: var(--logo-card-front, #4474C5); }
    .bar { fill: var(--logo-bar, #9AC5EA); }
    .dot-1 { fill: var(--logo-dot-1, #F48325); }
    .dot-2 { fill: var(--logo-dot-2, #DF5F1D); }
    .dot-3 { fill: var(--logo-dot-3, #F4D54E); }
    .dot-4 { fill: var(--logo-dot-4, #3E9D46); }
  </style>

  <!-- BACK CARD -->
  <rect x="11" y="10"
        width="324" height="300"
        rx="49"
        class="card-back"
        fill="#5ABCCC"/>

  <!-- BACK WHITE RECTANGLE -->
  <rect x="49" y="42"
        width="157" height="104"
        rx="24"
        class="rect-back"
        fill="#FFFFFF"/>

  <!-- MIDDLE CARD -->
  <rect x="80" y="87"
        width="324" height="300"
        rx="49"
        class="card-mid"
        fill="#66ACEB"/>

  <!-- MIDDLE WHITE RECTANGLE -->
  <rect x="116" y="117"
        width="158" height="104"
        rx="24"
        class="rect-mid"
        fill="#FFFFFF"/>

  <!-- MAIN CARD -->
  <rect x="148" y="146"
        width="324" height="299"
        rx="49"
        class="card-front"
        fill="#4474C5"/>

  <!-- BAR -->
  <rect x="165" y="179"
        width="343" height="84"
        rx="18"
        class="bar"
        fill="#9AC5EA"/>

  <!-- ORANGE CIRCLE -->
  <circle cx="213.5" cy="221"
          r="31.5"
          class="dot-1"
          fill="#F48325"/>

  <!-- DARK ORANGE CIRCLE -->
  <circle cx="295.5" cy="221"
          r="31.5"
          class="dot-2"
          fill="#DF5F1D"/>

  <!-- YELLOW CIRCLE -->
  <circle cx="377.5" cy="221"
          r="31.5"
          class="dot-3"
          fill="#F4D54E"/>

  <!-- GREEN CIRCLE -->
  <circle cx="459.5" cy="221"
          r="31.5"
          class="dot-4"
          fill="#3E9D46"/>

</svg>
`;
}

/**
 * Builds square SVG markup centered for extension icons and browser favicons.
 */
function buildSquareSvg(c) {
    return `<svg xmlns="http://www.w3.org/2000/svg"
     width="512"
     height="512"
     viewBox="-1 -33 520 520">

  <!-- BACK CARD -->
  <rect x="11" y="10"
        width="324" height="300"
        rx="49"
        fill="${c.cardBack}"/>

  <!-- BACK WHITE RECTANGLE -->
  <rect x="49" y="42"
        width="157" height="104"
        rx="24"
        fill="${c.rectBack}"/>

  <!-- MIDDLE CARD -->
  <rect x="80" y="87"
        width="324" height="300"
        rx="49"
        fill="${c.cardMid}"/>

  <!-- MIDDLE WHITE RECTANGLE -->
  <rect x="116" y="117"
        width="158" height="104"
        rx="24"
        fill="${c.rectMid}"/>

  <!-- MAIN CARD -->
  <rect x="148" y="146"
        width="324" height="299"
        rx="49"
        fill="${c.cardFront}"/>

  <!-- BAR -->
  <rect x="165" y="179"
        width="343" height="84"
        rx="18"
        fill="${c.bar}"/>

  <!-- ORANGE CIRCLE -->
  <circle cx="213.5" cy="221"
          r="31.5"
          fill="${c.dot1}"/>

  <!-- DARK ORANGE CIRCLE -->
  <circle cx="295.5" cy="221"
          r="31.5"
          fill="${c.dot2}"/>

  <!-- YELLOW CIRCLE -->
  <circle cx="377.5" cy="221"
          r="31.5"
          fill="${c.dot3}"/>

  <!-- GREEN CIRCLE -->
  <circle cx="459.5" cy="221"
          r="31.5"
          fill="${c.dot4}"/>

</svg>
`;
}

// Backup existing extension icons if not already backed up
for (const iconName of ['icon16.png', 'icon48.png', 'icon128.png']) {
    const src = resolve(iconsDir, iconName);
    const backup = resolve(backupDir, iconName);
    if (existsSync(src) && !existsSync(backup)) {
        copyFileSync(src, backup);
        console.log(`Backed up original ${iconName} to backup-old/`);
    }
}

// Save standalone adaptive SVG
const adaptiveSvgPath = resolve(iconsDir, 'logo.svg');
writeFileSync(adaptiveSvgPath, buildAdaptiveSvg(), 'utf8');
console.log(`Saved adaptive SVG: ${adaptiveSvgPath}`);

// Generate SVGs and PNGs for each theme
for (const [themeKey, themeColors] of Object.entries(THEMES)) {
    const svgContent = buildSvg(themeColors);
    const squareSvgContent = buildSquareSvg(themeColors);

    // Save SVG in themes directory
    const themeSvgPath = resolve(themesDir, `logo-${themeKey}.svg`);
    writeFileSync(themeSvgPath, svgContent, 'utf8');

    const themeSquareSvgPath = resolve(themesDir, `logo-${themeKey}-square.svg`);
    writeFileSync(themeSquareSvgPath, squareSvgContent, 'utf8');

    // If original, also save directly into assets/icons/
    if (themeKey === 'original') {
        const originalSvgPath = resolve(iconsDir, 'logo-original.svg');
        writeFileSync(originalSvgPath, svgContent, 'utf8');
        console.log(`Saved original SVG: ${originalSvgPath}`);
    }

    // Render full-resolution PNG (536x476)
    const fullPngThemePath = resolve(themesDir, `logo-${themeKey}.png`);
    execFileSync('rsvg-convert', ['-w', '536', '-h', '476', themeSvgPath, '-o', fullPngThemePath]);
    console.log(`Rendered high-res PNG (536x476): ${fullPngThemePath}`);

    // Also copy / save full PNG to assets/icons/
    const fullPngIconsPath = resolve(iconsDir, `logo-${themeKey}.png`);
    copyFileSync(fullPngThemePath, fullPngIconsPath);

    // Render square icon sizes directly from vector for pristine crispness
    const iconSizes = [512, 256, 128, 48, 32, 24, 16];
    for (const size of iconSizes) {
        const squarePngThemePath = resolve(themesDir, `logo-${themeKey}-${size}.png`);
        execFileSync('rsvg-convert', [
            '-w',
            size.toString(),
            '-h',
            size.toString(),
            themeSquareSvgPath,
            '-o',
            squarePngThemePath,
        ]);
    }

    // Set the extension's default icons (icon128, 48, 32, 24, 16) to Original blue theme
    if (themeKey === 'original') {
        for (const size of [128, 48, 32, 24, 16]) {
            const origIconPath = resolve(iconsDir, `icon${size}-original.png`);
            copyFileSync(resolve(themesDir, `logo-original-${size}.png`), origIconPath);

            const extIconPath = resolve(iconsDir, `icon${size}.png`);
            copyFileSync(resolve(themesDir, `logo-original-${size}.png`), extIconPath);
            console.log(`Updated default extension icon${size}.png with Original blue theme`);
        }
    }

    // Also preserve Viridian icons with explicit name
    if (themeKey === 'viridian') {
        for (const size of [128, 48, 32, 24, 16]) {
            const viriIconPath = resolve(iconsDir, `icon${size}-viridian.png`);
            copyFileSync(resolve(themesDir, `logo-viridian-${size}.png`), viriIconPath);
            console.log(`Saved Viridian extension icon: icon${size}-viridian.png`);
        }
    }
}

console.log('Successfully generated all SVG and PNG assets for all themes!');
