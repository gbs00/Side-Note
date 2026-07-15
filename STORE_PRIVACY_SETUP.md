# Chrome Web Store 隐私与权限设置填写指南

根据你提供的截图，请在 Chrome 开发者后台填写以下内容：

---

## 1. 单一用途

**说明**：Side Note 是一个轻量级侧边栏笔记工具，允许用户在不离开当前网页的情况下快速记录想法。核心功能是提供一个常驻侧边栏的 Markdown 编辑器，并自动获取当前页面的标题和链接作为笔记元数据。

**English Version**: Side Note is a lightweight sidebar note-taking tool that allows users to quickly jot down ideas without leaving the current webpage. Its core function is to provide a persistent Markdown editor in the sidebar, automatically capturing the current page's title and URL as note metadata.

---

## 2. 需请求权限的理由

### 需请求 sidePanel 的理由
**填写内容**：本插件的核心交互界面位于浏览器侧边栏，需要此权限来渲染笔记编辑器并响应用户操作。
**English**: The core interface of this extension resides in the browser sidebar. This permission is required to render the note editor and respond to user interactions.

### 需请求 storage 的理由
**填写内容**：用于在用户本地浏览器中保存当前会话的笔记内容（storage.session）和主题偏好设置（storage.local）。笔记会在标签页关闭或浏览器重启后清除，所有数据均不会上传到服务器。
**English**: Used to store current-session notes (storage.session) and theme preferences (storage.local) in the user's browser. Notes are cleared when the tab is closed or the browser restarts, and no data is uploaded to any server.

### 需请求 activeTab 的理由
**填写内容**：当用户打开侧边栏笔记时，需要获取当前活动标签页的 URL 和标题，以便自动填充笔记的来源信息。此数据仅用于在本地笔记中显示，不会被传输。
**English**: Required to access the URL and title of the current active tab when the user opens the sidebar note. This is used to auto-populate the note's source metadata and is displayed only locally.

---

## 3. 远程代码

**选择**：🔘 **不，我并未使用远程代码** (No, I am not using remote code)

**理由/解释**（如果需要填写）：
本插件的所有逻辑代码（JS/HTML/CSS）均已包含在发布包中，不加载任何外部脚本或模块。
(All logic code (JS/HTML/CSS) is included in the distribution package and does not load any external scripts or modules.)
