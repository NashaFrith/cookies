'use strict';

// ── Eat cookie button ──────────────────────────────────────────
(function () {
    const quips = [
        'nom nom nom',
        'yummy, thank you!',
        'so good omg',
        'another one 👀',
        'okay okay one more',
        'we simply cannot stop',
        'this is fine',
        'no thoughts, only food',
        '*chef\u2019s kiss*',
        'worth it',
    ];
    let idx = 0;
    const btn = document.getElementById('eat-cookie-btn');
    const text = document.getElementById('subtitle-text');
    if (btn && text) {
        btn.addEventListener('click', () => {
            idx = (idx + 1) % quips.length;
            text.textContent = quips[idx];
            btn.classList.add('cookie-bounce');
            btn.addEventListener('animationend', () => btn.classList.remove('cookie-bounce'), { once: true });
        });
    }
})();

// ── Recipe search ──────────────────────────────────────────────
const recipeSearchInput = document.getElementById('recipe-search');
if (recipeSearchInput) {
    recipeSearchInput.addEventListener('input', () => {
        const q = recipeSearchInput.value.toLowerCase();
        document.querySelectorAll('.category-section').forEach(section => {
            let anyVisible = false;
            section.querySelectorAll('.recipe-item').forEach(item => {
                const name = item.querySelector('.recipe-link').textContent.toLowerCase();
                const match = !q || name.includes(q);
                item.style.display = match ? '' : 'none';
                if (match) anyVisible = true;
            });
            section.style.display = anyVisible ? '' : 'none';
            // Expand sections that have matches
            if (q && anyVisible) section.classList.remove('collapsed');
        });
    });
}

// ── Category collapse/expand ───────────────────────────────────
document.querySelectorAll('.category-header').forEach(header => {
    // Add toggle icon
    const icon = document.createElement('span');
    icon.className = 'category-toggle-icon';
    icon.textContent = '▾';
    header.appendChild(icon);

    header.addEventListener('click', () => {
        header.closest('.category-section').classList.toggle('collapsed');
    });
});

