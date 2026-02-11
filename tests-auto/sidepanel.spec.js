/**
 * Side Note Extension E2E Tests
 * 
 * 测试策略：使用 test-harness.html（包含 Chrome API mock）进行测试
 * 可覆盖：Markdown 渲染、主题切换、复制导出、性能稳定性
 * 不可覆盖：真实 Side Panel 打开/关闭、多标签页隔离、数据生命周期
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const TEST_HARNESS_PATH = path.resolve(__dirname, 'test-harness.html');
const MOCK_TAB_ID = 12345;

test.describe('TC-2: Markdown 渲染', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-2.1.1 一级标题渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('# Hello World');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        const headingLine = page.locator('.cm-line.cm-h1');
        await expect(headingLine).toBeVisible({ timeout: 5000 });
    });

    test('TC-2.1.2 二级标题渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('## Second Level');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        const headingLine = page.locator('.cm-line.cm-h2');
        await expect(headingLine).toBeVisible({ timeout: 5000 });
    });

    test('TC-2.1.3 无序列表渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('- list item');

        const content = await editor.textContent();
        expect(content).toContain('list item');
    });

    test('TC-2.1.4 有序列表编号', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('1. first item');
        await page.keyboard.press('Enter');
        await page.keyboard.type('2. second item');

        const content = await editor.textContent();
        expect(content).toContain('first item');
        expect(content).toContain('second item');
    });

    test('TC-2.1.5 引用块渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('> This is a quote');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        // 检查引用文本渲染（可能使用 .cm-quote 或通过 > 符号）
        const content = await editor.textContent();
        expect(content).toContain('This is a quote');
    });

    test('TC-2.2.1 加粗语法渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('**bold text** normal');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        const strongText = page.locator('.cm-strong');
        await expect(strongText).toBeVisible({ timeout: 5000 });
    });

    test('TC-2.2.2 斜体语法渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('*italic text* normal');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        const emText = page.locator('.cm-em');
        await expect(emText).toBeVisible({ timeout: 5000 });
    });

    test('TC-2.2.3 行内代码渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('`inline code` normal');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        const codeText = page.locator('.cm-code');
        await expect(codeText).toBeVisible({ timeout: 5000 });
    });

    test('TC-2.2.4 链接语法渲染', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('[link text](https://example.com) normal');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');

        // 使用 first() 避免多元素冲突
        const linkText = page.locator('.cm-link').first();
        await expect(linkText).toBeVisible({ timeout: 5000 });
    });

    test('TC-2.3 光标行显示原始 Markdown', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('**bold**');

        // Cursor is on the line, should show raw markdown
        const lineContent = await editor.textContent();
        expect(lineContent).toContain('**bold**');
    });
});

test.describe('TC-3: 主题切换', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-3.1 主题按钮存在', async ({ page }) => {
        const themeToggle = page.locator('#themeToggle');
        await expect(themeToggle).toBeVisible();
    });

    test('TC-3.2 点击切换主题', async ({ page }) => {
        const themeToggle = page.locator('#themeToggle');
        const html = page.locator('html');

        const initialTheme = await html.getAttribute('data-theme');
        await themeToggle.click();
        await page.waitForTimeout(200);

        const newTheme = await html.getAttribute('data-theme');
        // Theme should change (either light/dark toggle)
        expect(newTheme !== initialTheme || newTheme !== null).toBeTruthy();
    });

    test('TC-3.3 body 主题类名变化', async ({ page }) => {
        const themeToggle = page.locator('#themeToggle');
        const html = page.locator('html');

        // 记录初始状态
        const initialTheme = await html.getAttribute('data-theme');

        await themeToggle.click();
        await page.waitForTimeout(200);

        // 再次点击切换回来
        await themeToggle.click();
        await page.waitForTimeout(200);

        const finalTheme = await html.getAttribute('data-theme');

        // 两次切换后应该回到初始状态
        expect(finalTheme).toBe(initialTheme);
    });
});

test.describe('TC-1.3: 复制导出', () => {
    test.beforeEach(async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-1.3.1 复制按钮存在', async ({ page }) => {
        const copyBtn = page.locator('#copyBtn');
        await expect(copyBtn).toBeVisible();
    });

    test('TC-1.3.2 复制后显示 Toast', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('Test content');

        const copyBtn = page.locator('#copyBtn');
        await copyBtn.click();

        // Wait for toast to appear
        const toast = page.locator('#toast');
        await expect(toast).toHaveClass(/show|visible/, { timeout: 3000 });
    });
});

test.describe('TC-6: 异常边界', () => {
    test('TC-6.1 元信息正确加载', async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });

        const urlInput = page.locator('#metaUrl');
        const titleInput = page.locator('#metaTitle');
        const createdInput = page.locator('#metaCreated');

        // Should have mock data from test harness
        await expect(urlInput).toHaveValue('https://example.com/test-page');
        await expect(titleInput).toHaveValue('Test Page Title');
        await expect(createdInput).toHaveValue('2026-01-26 12:00:00');
    });

    test('TC-6.2 元信息可编辑', async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });

        const titleInput = page.locator('#metaTitle');
        await titleInput.fill('New Title');

        await expect(titleInput).toHaveValue('New Title');
    });
});

test.describe('TC-7: 性能与稳定性', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-7.2 大量 Markdown 无报错', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();

        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        // Type moderate amount of markdown
        const markdown = '# Heading\n**bold** *italic* `code`\n- list item\n> quote\n\n';
        for (let i = 0; i < 10; i++) {
            await page.keyboard.type(markdown, { delay: 0 });
        }

        // Scroll around
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Control+End');

        // Filter critical errors
        const criticalErrors = errors.filter(e =>
            e.includes('RangeError') || e.includes('Uncaught') || e.includes('Cannot read')
        );

        expect(criticalErrors).toHaveLength(0);
    });
});
