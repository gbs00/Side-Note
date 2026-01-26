document.addEventListener('DOMContentLoaded', () => {
    const themeToggleBtn = document.getElementById('themeToggle');
    const copyBtn = document.getElementById('copyBtn');
    const closeBtn = document.getElementById('closeBtn');
    const sidePanel = document.getElementById('sidePanel');
    const toast = document.getElementById('toast');

    const sunIcon = document.querySelector('.sun-icon');
    const moonIcon = document.querySelector('.moon-icon');

    // Theme Toggle Logic
    let isDark = false;
    themeToggleBtn.addEventListener('click', () => {
        isDark = !isDark;
        document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

        // Toggle Icons
        if (isDark) {
            sunIcon.style.display = 'none';
            moonIcon.style.display = 'block';
        } else {
            sunIcon.style.display = 'block';
            moonIcon.style.display = 'none';
        }
    });

    // Copy Feedback Logic
    copyBtn.addEventListener('click', () => {
        // In a real app we would copy to clipboard
        // navigator.clipboard.writeText(...)

        showToast("复制完成啦", "success");
    });

    function showToast(message, type = "success") {
        toast.textContent = message;

        // Reset classes
        toast.className = 'toast';
        toast.classList.add(type); // 'success' or 'error'

        // Trigger reflow to enable transition if needed, though opacity handles it
        requestAnimationFrame(() => {
            toast.classList.add('visible');
        });

        setTimeout(() => {
            toast.classList.remove('visible');
        }, 2000);
    }

    // Close Interaction (Demo)
    closeBtn.addEventListener('click', () => {
        sidePanel.style.transform = 'translateY(-50%) scale(0.9)';
        sidePanel.style.opacity = '0';
        setTimeout(() => {
            alert("模拟关闭。在实际插件中，这将隐藏窗口并清空数据（或保存，取决于策略）。\n刷新页面以重置。");
            // Reset for demo purposes
            sidePanel.style.transform = 'translateY(-50%) scale(1)';
            sidePanel.style.opacity = '1';
        }, 500);
    });

    // Simple Markdown Highlight Simulation
    const editor = document.querySelector('.editor');
    editor.addEventListener('input', (e) => {
        // This is where we would implement real-time Markdown rendering
        // For this prototype, we just log it.
        console.log("User input:", editor.innerHTML);
    });
});
