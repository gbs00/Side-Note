/**
 * Side Note Extension v0.1.1 E2E Tests
 * 
 * 测试范围：
 * - 数据持久化逻辑（同一 Tab 保持、克隆 Tab 隔离、关闭清理）
 * - UI/UX 改进（空状态、引用块竖线、Toast 样式、SVG 图标）
 * - 复制导出格式验证
 * 
 * 测试策略：使用 test-harness.html（包含 Chrome API mock）进行测试
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

const TEST_HARNESS_PATH = path.resolve(__dirname, 'test-harness.html');
const MOCK_TAB_ID = 12345;

test.describe('TC-1: 数据持久化逻辑', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-1.1.1: 页面刷新后内容保持', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        
        // 输入测试内容
        const testContent = '这是测试内容，用于验证刷新后保持';
        await page.keyboard.type(testContent);
        
        // 等待 debounce 持久化
        await page.waitForTimeout(500);
        
        // 模拟刷新：重新加载页面
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
        
        // 验证内容保持
        const content = await editor.textContent();
        expect(content).toContain(testContent);
    });

    test('TC-1.4.1: 点击关闭按钮后数据保留（可重新打开继续编辑）', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        
        // 输入内容
        const testContent = '关闭面板测试内容';
        await page.keyboard.type(testContent);
        await page.waitForTimeout(500);
        
        // 获取当前存储的内容
        const noteKey = `note:${MOCK_TAB_ID}`;
        const storedData = await page.evaluate(async (key) => {
            const result = await chrome.storage.session.get(key);
            return result[key];
        }, noteKey);
        
        // 验证数据已持久化到 session
        expect(storedData).not.toBeNull();
        expect(storedData.contentMd).toBe(testContent);
        
        // 模拟重新打开：重新加载（因为 test harness 无法真正关闭/打开 panel）
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
        
        // 验证内容仍然存在
        const content = await editor.textContent();
        expect(content).toContain(testContent);
    });

    test('TC-1.2.1: 不同 Tab ID 数据隔离', async ({ page }) => {
        // Tab A: 输入内容
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('Tab A 的内容');
        await page.waitForTimeout(500);
        
        // Tab B (不同 tabId): 新页面
        const TAB_B_ID = 99999;
        const newPage = await page.context().newPage();
        await newPage.goto(`file://${TEST_HARNESS_PATH}?tabId=${TAB_B_ID}`);
        await newPage.waitForSelector('.cm-editor', { timeout: 10000 });
        
        // 验证 Tab B 是空白
        const tabBContent = await newPage.locator('.cm-content').textContent();
        expect(tabBContent).toBe('');
        
        // Tab B 输入不同内容
        await newPage.locator('.cm-content').click();
        await newPage.keyboard.type('Tab B 的内容');
        await newPage.waitForTimeout(500);
        
        // 验证 Tab A 内容未被覆盖
        await page.reload();
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
        const tabAContent = await page.locator('.cm-content').textContent();
        expect(tabAContent).toContain('Tab A 的内容');
        
        await newPage.close();
    });
});

test.describe('TC-4: UI/UX 改进', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-4.1.1: 空状态显示', async ({ page }) => {
        const emptyState = page.locator('#emptyState');
        
        // 初始状态应显示空状态
        await expect(emptyState).toBeVisible();
        
        // 验证空状态内容
        const icon = emptyState.locator('.empty-icon');
        const title = emptyState.locator('.empty-title');
        const desc = emptyState.locator('.empty-desc');
        
        await expect(icon).toHaveText('✦');
        await expect(title).toHaveText('还没有内容');
        await expect(desc).toHaveText('在右侧开始记录你的灵感');
    });

    test('TC-4.1.2: 输入后空状态隐藏', async ({ page }) => {
        const emptyState = page.locator('#emptyState');
        const editor = page.locator('.cm-content');
        
        // 初始显示空状态
        await expect(emptyState).toBeVisible();
        
        // 输入内容
        await editor.click();
        await page.keyboard.type('开始输入');
        await page.waitForTimeout(300);
        
        // 空状态应隐藏
        await expect(emptyState).not.toHaveClass(/visible/);
    });

    test('TC-4.1.3: 删除内容后空状态恢复', async ({ page }) => {
        const emptyState = page.locator('#emptyState');
        const editor = page.locator('.cm-content');
        
        // 输入内容
        await editor.click();
        await page.keyboard.type('临时内容');
        await page.waitForTimeout(300);
        
        // 全选并删除
        await page.keyboard.press('Control+a');
        await page.keyboard.press('Backspace');
        await page.waitForTimeout(300);
        
        // 空状态应重新显示
        await expect(emptyState).toBeVisible();
    });

    test('TC-4.2.1: 引用块竖线样式', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        
        // 输入引用块
        await page.keyboard.type('> 这是一条引用内容');
        await page.keyboard.press('Enter');
        await page.keyboard.press('ArrowUp');
        
        // 检查引用块行有 cm-quote-line 类（使用 first 避免多个匹配）
        const quoteLine = page.locator('.cm-quote-line').first();
        await expect(quoteLine).toBeVisible({ timeout: 5000 });
        
        // 验证文本内容
        const content = await editor.textContent();
        expect(content).toContain('这是一条引用内容');
    });

    test('TC-4.5.1: Lucide 风格 SVG 图标', async ({ page }) => {
        // 检查主题切换按钮有 SVG 图标
        const themeToggle = page.locator('#themeToggle');
        await expect(themeToggle).toBeVisible();
        
        const sunIcon = themeToggle.locator('.sun-icon');
        const moonIcon = themeToggle.locator('.moon-icon');
        
        // 至少有一个图标可见（根据当前主题）
        const sunVisible = await sunIcon.isVisible().catch(() => false);
        const moonVisible = await moonIcon.isVisible().catch(() => false);
        expect(sunVisible || moonVisible).toBe(true);
        
        // 检查复制按钮使用 SVG
        const copyBtn = page.locator('#copyBtn');
        await expect(copyBtn.locator('svg')).toBeVisible();
        
        // 检查关闭按钮使用 SVG
        const closeBtn = page.locator('#closeBtn');
        await expect(closeBtn.locator('svg')).toBeVisible();
    });

    test('TC-4.5.2: Meta 区域图标 + 输入框结构', async ({ page }) => {
        // URL 行
        const urlRow = page.locator('.meta-row').first();
        await expect(urlRow.locator('.meta-icon')).toBeVisible();
        await expect(urlRow.locator('.meta-icon svg')).toBeVisible();
        await expect(urlRow.locator('#metaUrl')).toBeVisible();
        
        // 标题行
        const titleRow = page.locator('.meta-row').nth(1);
        await expect(titleRow.locator('.meta-icon')).toBeVisible();
        await expect(titleRow.locator('.meta-icon svg')).toBeVisible();
        await expect(titleRow.locator('#metaTitle')).toBeVisible();
        
        // 创建时间行
        const createdRow = page.locator('.meta-row').nth(2);
        await expect(createdRow.locator('.meta-icon')).toBeVisible();
        await expect(createdRow.locator('.meta-icon svg')).toBeVisible();
        await expect(createdRow.locator('#metaCreated')).toBeVisible();
    });

    test('TC-4.3.1: 明亮/深色模式主题类名', async ({ page }) => {
        const html = page.locator('html');
        const themeToggle = page.locator('#themeToggle');
        
        // 检查初始主题属性
        const initialTheme = await html.getAttribute('data-theme');
        expect(['light', 'dark']).toContain(initialTheme);
        
        // 点击切换主题
        await themeToggle.click();
        await page.waitForTimeout(200);
        
        // 验证主题已切换
        const newTheme = await html.getAttribute('data-theme');
        expect(newTheme).not.toBe(initialTheme);
        
        // 验证图标状态
        const sunIcon = themeToggle.locator('.sun-icon');
        const moonIcon = themeToggle.locator('.moon-icon');
        
        if (newTheme === 'dark') {
            // 深色模式显示太阳图标（可切换到亮色）
            await expect(sunIcon).toHaveCSS('display', 'block');
        } else {
            // 浅色模式显示月亮图标（可切换到深色）
            await expect(moonIcon).toHaveCSS('display', 'block');
        }
    });
});

test.describe('TC-5: 复制导出', () => {
    test.beforeEach(async ({ page, context }) => {
        await context.grantPermissions(['clipboard-read', 'clipboard-write']);
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-5.1.1: 复制按钮存在', async ({ page }) => {
        const copyBtn = page.locator('#copyBtn');
        await expect(copyBtn).toBeVisible();
    });

    test('TC-5.1.2: 复制后显示 Toast', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        await page.keyboard.type('Test content for copy');

        const copyBtn = page.locator('#copyBtn');
        await copyBtn.click();

        // 等待 toast 出现
        const toast = page.locator('#toast');
        await expect(toast).toHaveClass(/visible/, { timeout: 3000 });
        await expect(toast).toHaveText('复制完成啦');
        await expect(toast).toHaveClass(/success/);
    });

    test('TC-5.1.3: 导出格式正确', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();
        
        // 输入笔记内容
        await page.keyboard.type('这是笔记正文内容');
        await page.waitForTimeout(300);

        // 点击复制
        const copyBtn = page.locator('#copyBtn');
        await copyBtn.click();

        // 等待 toast
        await expect(page.locator('#toast')).toHaveClass(/visible/, { timeout: 3000 });

        // 读取剪贴板内容
        const clipboardText = await page.evaluate(async () => {
            return await navigator.clipboard.readText();
        });

        // 验证格式：以 -- 开头，包含 url/title/created_at
        expect(clipboardText).toMatch(/^--\n/);
        expect(clipboardText).toContain('url:');
        expect(clipboardText).toContain('title:');
        expect(clipboardText).toContain('created_at:');
        expect(clipboardText).toContain('--\n这是笔记正文内容');
    });

    test('TC-5.1.4: Toast 自动隐藏', async ({ page }) => {
        const copyBtn = page.locator('#copyBtn');
        await copyBtn.click();

        const toast = page.locator('#toast');
        await expect(toast).toHaveClass(/visible/, { timeout: 3000 });

        // 等待 Toast 自动隐藏（2秒）
        await page.waitForTimeout(2500);
        
        // 验证 Toast 已隐藏
        await expect(toast).not.toHaveClass(/visible/);
    });
});

test.describe('TC-6: 异常边界', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-6.1.1: 元信息正确加载', async ({ page }) => {
        const urlInput = page.locator('#metaUrl');
        const titleInput = page.locator('#metaTitle');
        const createdInput = page.locator('#metaCreated');

        // 应该加载 test-harness 中的 mock 数据
        await expect(urlInput).toHaveValue('https://example.com/test-page');
        await expect(titleInput).toHaveValue('Test Page Title');
        await expect(createdInput).toHaveValue('2026-01-26 12:00:00');
    });

    test('TC-6.1.3: 元信息可编辑', async ({ page }) => {
        const titleInput = page.locator('#metaTitle');
        
        // 清空并输入新标题
        await titleInput.fill('New Custom Title');
        
        // 验证输入成功
        await expect(titleInput).toHaveValue('New Custom Title');
        
        // 验证持久化（通过 blur 触发）
        await titleInput.blur();
        await page.waitForTimeout(500);
        
        // 重新加载验证
        await page.reload();
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
        await expect(page.locator('#metaTitle')).toHaveValue('New Custom Title');
    });

    test('TC-6.1.4: 元信息编辑后保持', async ({ page }) => {
        const urlInput = page.locator('#metaUrl');
        
        // 编辑 URL
        await urlInput.fill('https://custom-url.com/page');
        await urlInput.blur();
        await page.waitForTimeout(500);
        
        // 刷新页面
        await page.reload();
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
        
        // 验证编辑后的值保持
        await expect(urlInput).toHaveValue('https://custom-url.com/page');
    });
});

test.describe('TC-7: 性能与稳定性', () => {
    test.beforeEach(async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });
    });

    test('TC-7.1: 输入防抖', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();

        let storageCallCount = 0;
        
        // 监听 storage.set 调用
        await page.evaluate(() => {
            window._originalSet = chrome.storage.session.set;
            chrome.storage.session.set = async function(...args) {
                window._storageCallCount = (window._storageCallCount || 0) + 1;
                return window._originalSet.apply(this, args);
            };
            window._storageCallCount = 0;
        });

        // 快速输入（超过 300ms 的防抖间隔）
        for (let i = 0; i < 10; i++) {
            await page.keyboard.type(`Line ${i}\n`);
            await page.waitForTimeout(50); // 小于防抖间隔
        }

        // 等待防抖触发
        await page.waitForTimeout(500);

        // 获取调用次数
        const callCount = await page.evaluate(() => window._storageCallCount);
        
        // 验证防抖生效（10 次输入应该被合并为更少次数的存储调用）
        expect(callCount).toBeLessThan(10);
    });

    test('TC-7.2: 大量 Markdown 无报错', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();

        const errors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                errors.push(msg.text());
            }
        });

        page.on('pageerror', error => {
            errors.push(error.message);
        });

        // 输入大量 Markdown
        const markdown = `# Heading\n**bold** *italic* \`code\`\n- list item\n> quote\n\n`;
        for (let i = 0; i < 20; i++) {
            await page.keyboard.type(markdown, { delay: 0 });
        }

        // 滚动
        await page.keyboard.press('Control+Home');
        await page.keyboard.press('Control+End');

        // 筛选关键错误
        const criticalErrors = errors.filter(e =>
            e.includes('RangeError') || 
            e.includes('Uncaught') || 
            e.includes('Cannot read') ||
            e.includes('null') ||
            e.includes('undefined')
        );

        expect(criticalErrors).toHaveLength(0);
    });

    test('TC-7.3: 列表嵌套编号稳定性', async ({ page }) => {
        const editor = page.locator('.cm-content');
        await editor.click();

        // 输入嵌套列表
        await page.keyboard.type('1. 一级项目\n');
        await page.keyboard.type('  1. 二级项目 A\n');
        await page.keyboard.type('  2. 二级项目 B\n');
        await page.keyboard.type('    1. 三级项目\n');
        await page.keyboard.type('2. 回到一级\n');

        const content = await editor.textContent();
        
        // 验证内容存在，无报错
        expect(content).toContain('一级项目');
        expect(content).toContain('二级项目');
        expect(content).toContain('三级项目');
    });
});

test.describe('TC-8: 存储监听与同步', () => {
    test('TC-8.1: storage.onChanged 响应外部修改', async ({ page }) => {
        await page.goto(`file://${TEST_HARNESS_PATH}?tabId=${MOCK_TAB_ID}`);
        await page.waitForSelector('.cm-editor', { timeout: 10000 });

        const newContent = '通过外部存储修改的内容';
        
        // 通过 JavaScript 直接修改存储（模拟 background.js 或其他 tab 的修改）
        await page.evaluate(async (content) => {
            const tabId = new URLSearchParams(window.location.search).get('tabId') || '12345';
            const noteKey = `note:${tabId}`;
            const stored = await chrome.storage.session.get(noteKey);
            const note = stored[noteKey];
            if (note) {
                note.contentMd = content;
                note.updatedAt = new Date().toISOString();
                await chrome.storage.session.set({ [noteKey]: note });
            }
        }, newContent);

        // 等待 UI 更新
        await page.waitForTimeout(300);

        // 验证编辑器内容已更新
        const editorContent = await page.locator('.cm-content').textContent();
        expect(editorContent).toBe(newContent);
    });
});
