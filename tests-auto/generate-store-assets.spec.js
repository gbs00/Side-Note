const { test } = require('@playwright/test');
const path = require('path');
const fs = require('fs');

// Helpers
const ASSETS_DIR = path.resolve(__dirname, '../assets/store');
const EXTENSION_DIR = path.resolve(__dirname, '../extension');
const CSS_PATH = path.join(EXTENSION_DIR, 'sidepanel.css');
const JS_PATH = path.join(EXTENSION_DIR, 'sidepanel.js');
const SVG_ICON_PATH = path.join(EXTENSION_DIR, 'icons/icon.svg');

const CSS_CONTENT = fs.readFileSync(CSS_PATH, 'utf8');
const JS_CONTENT = fs.readFileSync(JS_PATH, 'utf8');
const SVG_ICON_CONTENT = fs.readFileSync(SVG_ICON_PATH, 'utf8');

// Mock Data for Screenshots
const MOCK_NOTE_CONTENT = `
# Project Ideas 🚀

**Current Focus**
- [x] Markdown support
- [x] Dark mode
- [ ] Cloud sync

## Research Notes
> "Simplicity is the ultimate sophistication."

Check out [Design System](https://example.com)

\`\`\`javascript
console.log("Hello World");
\`\`\`
`.trim();

test.describe('Generate Store Assets', () => {
    // Setup: Ensure assets dir exists
    test.beforeAll(() => {
        if (!fs.existsSync(ASSETS_DIR)) {
            fs.mkdirSync(ASSETS_DIR, { recursive: true });
        }
    });

    // 1. Screenshot: Main UI (Light Mode)
    test('Generate Screenshot 01 (Light)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await renderBrowserMock(page, { theme: 'light', title: 'Startups & Ideas' });
        await page.screenshot({ path: path.join(ASSETS_DIR, 'screenshot_1_light.png') });
    });

    // 2. Screenshot: Main UI (Dark Mode)
    test('Generate Screenshot 02 (Dark)', async ({ page }) => {
        await page.setViewportSize({ width: 1280, height: 800 });
        await renderBrowserMock(page, { theme: 'dark', title: 'Night Coding Session' });
        await page.screenshot({ path: path.join(ASSETS_DIR, 'screenshot_2_dark.png') });
    });

    // 3. Small Promo Tile (440x280)
    test('Generate Small Promo Tile', async ({ page }) => {
        await page.setViewportSize({ width: 440, height: 280 });
        await renderPromo(page, {
            bgColor: '#F9FAFB',
            textColor: '#333',
            scale: 1
        });
        await page.screenshot({ path: path.join(ASSETS_DIR, 'promo_small.png') });
    });

    // 4. Marquee Promo Tile (1400x560)
    test('Generate Marquee Promo Tile', async ({ page }) => {
        await page.setViewportSize({ width: 1400, height: 560 });
        await renderPromo(page, {
            bgColor: '#F1F5F9',
            textColor: '#1E293B',
            scale: 2
        });
        await page.screenshot({ path: path.join(ASSETS_DIR, 'promo_marquee.png') });
    });
});

// --- Helpers ---

async function renderBrowserMock(page, { theme, title }) {
    const isDark = theme === 'dark';
    const bgColor = isDark ? '#1E1E1E' : '#F3F4F6';
    const windowBg = isDark ? '#2D2D2D' : '#FFFFFF';
    const textColor = isDark ? '#E5E7EB' : '#1F2937';

    await page.setContent(`
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        body { margin: 0; background: ${bgColor}; font-family: sans-serif; overflow: hidden; }
        .browser-window {
          width: 1000px; height: 700px;
          background: ${windowBg};
          border-radius: 12px;
          box-shadow: 0 20px 40px rgba(0,0,0,0.2);
          position: absolute;
          top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        .browser-toolbar {
          height: 40px;
          background: ${isDark ? '#3C3C3C' : '#E5E7EB'};
          border-bottom: 1px solid ${isDark ? '#4B4B4B' : '#D1D5DB'};
          display: flex;
          align-items: center;
          padding: 0 16px;
          gap: 12px;
        }
        .dots { display: flex; gap: 6px; }
        .dot { width: 10px; height: 10px; border-radius: 50%; }
        .red { background: #FF5F56; }
        .yellow { background: #FFBD2E; }
        .green { background: #27C93F; }
        
        .address-bar {
          flex: 1;
          height: 24px;
          background: ${isDark ? '#2D2D2D' : '#FFFFFF'};
          border-radius: 4px;
          display: flex;
          align-items: center;
          padding: 0 12px;
          font-size: 12px;
          color: ${isDark ? '#9CA3AF' : '#6B7280'};
        }

        .browser-content {
          flex: 1;
          display: flex;
          position: relative;
        }

        .web-page {
          flex: 1;
          padding: 40px;
          color: ${textColor};
          opacity: 0.3; /* Blur focus to emphasize side panel */
          filter: blur(1px);
        }
        
        .side-panel-container {
          width: 360px;
          border-left: 1px solid ${isDark ? '#4B4B4B' : '#E5E7EB'};
          height: 100%;
          background: ${isDark ? '#1E1E1E' : '#F9F9F9'};
        }

        /* Inject Extension Styles */
        ${CSS_CONTENT}

        /* Override body/html for sidepanel to fit container */
        .panel { height: 100%; }
      </style>
    </head>
    <body ${isDark ? 'data-theme="dark"' : ''}>
      <div class="browser-window">
        <div class="browser-toolbar">
          <div class="dots"><div class="dot red"></div><div class="dot yellow"></div><div class="dot green"></div></div>
          <div class="address-bar">https://example.com/article</div>
        </div>
        <div class="browser-content">
          <div class="web-page">
            <h1>${title}</h1>
            <p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.</p>
            <p>Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat.</p>
             <p>Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur.</p>
          </div>
          <div class="side-panel-container">
            <!-- Recreate Side Panel Structure -->
            <div class="panel" id="sidePanel">
              <header class="header">
                <div class="logo-area">
                  <span class="logo-icon" aria-hidden="true">📝</span>
                  <span class="app-name">Side Note</span>
                </div>
                <div class="actions">
                  <button class="icon-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" class="sun-icon" stroke="currentColor" stroke-width="2"><path d="M12 3V4M12 20V21M4 12H3M21 12H20M5.636 5.636L6.343 6.343M17.657 17.657L18.364 18.364M5.636 18.364L6.343 17.657M17.657 6.343L18.364 5.636M16 12C16 14.2091 14.2091 16 12 16C9.79086 16 8 14.2091 8 12C8 9.79086 9.79086 8 12 8C14.2091 8 16 9.79086 16 12Z"/></svg></button>
                  <button class="icon-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4C2.89543 15 2 14.1046 2 13V4C2 2.89543 2.89543 2 4 2H13C14.1046 2 15 2.89543 15 4V5"/></svg></button>
                  <button class="icon-btn"><svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6L6 18M6 6L18 18"/></svg></button>
                </div>
              </header>
              <section class="metadata">
                <label class="meta-row">
                  <span class="meta-label">🔗</span>
                  <input class="meta-input" value="https://example.com/article">
                </label>
                <label class="meta-row">
                  <span class="meta-label">📑</span>
                  <input class="meta-input" value="${title}">
                </label>
                <label class="meta-row">
                  <span class="meta-label">📅</span>
                  <input class="meta-input" value="2026-01-26 15:30:00">
                </label>
              </section>
              <section class="editor">
                <div class="editor-surface" id="editor"></div>
              </section>
            </div>
          </div>
        </div>
      </div>
      
      <!-- Mock Chrome Global -->
      <script>
        window.chrome = {
          storage: { local: { get: () => ({}), set: () => {} }, session: { get: () => ({}), set: () => {} } },
          runtime: { connect: () => ({ postMessage: () => {}, onDisconnect: { addListener: () => {} } }) }
        };
      </script>
      <!-- Inject Extension Logic -->
      <script>
        ${JS_CONTENT}
        
        // Force inject content after init
        setTimeout(() => {
          const view = editorView; // active editor view is global in sidepanel.js
          if(view) {
            view.dispatch({
              changes: { from: 0, to: view.state.doc.length, insert: \`${MOCK_NOTE_CONTENT}\` }
            });
            // Apply theme
            if ('${theme}' === 'dark') {
                 document.documentElement.setAttribute('data-theme', 'dark');
            }
          }
        }, 500);
      </script>
    </body>
    </html>
  `);
}

async function renderPromo(page, { bgColor, textColor, scale }) {
    await page.setContent(`
    <!DOCTYPE html>
    <html>
    <body style="margin:0; background: ${bgColor}; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif;">
      <div style="display: flex; flex-direction: column; align-items: center; gap: ${16 * scale}px;">
        <div style="width: ${64 * scale}px; height: ${64 * scale}px;">
          ${SVG_ICON_CONTENT}
        </div>
        <h1 style="color: ${textColor}; font-size: ${32 * scale}px; margin: 0; font-weight: 700;">Side Note</h1>
        <p style="color: ${textColor}; opacity: 0.8; font-size: ${16 * scale}px; margin: 0;">Lightweight . Markdown . Private</p>
      </div>
      <script>
        const svg = document.querySelector('svg');
        svg.setAttribute('width', '100%');
        svg.setAttribute('height', '100%');
      </script>
    </body>
    </html>
  `);
}
