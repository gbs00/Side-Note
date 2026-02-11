const { test } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test('Generate Icons', async ({ page }) => {
    // Read the SVG template
    const svgPath = path.resolve(__dirname, '../extension/icons/icon.svg');
    const svgContent = fs.readFileSync(svgPath, 'utf8');

    // Helper to generate PNG
    async function generateIcon(size, filename) {
        const fullPath = path.resolve(__dirname, '../extension/icons', filename);

        await page.setContent(`
      <html>
        <body style="margin: 0; padding: 0; display: flex; justify-content: center; align-items: center; background: transparent;">
          <div id="icon" style="width: ${size}px; height: ${size}px;">
            ${svgContent}
          </div>
        </body>
      </html>
    `);

        const element = await page.locator('#icon');

        // Evaluate SVG to scale it to fit the container perfectly
        await page.evaluate(({ size }) => {
            const svg = document.querySelector('svg');
            if (svg) {
                svg.setAttribute('width', size);
                svg.setAttribute('height', size);
            }
        }, { size });

        await element.screenshot({ path: fullPath, type: 'png', omitBackground: true });
        console.log(`Generated ${filename} (${size}x${size})`);
    }

    await generateIcon(16, 'icon16.png');
    await generateIcon(48, 'icon48.png');
    await generateIcon(128, 'icon128.png');
});
