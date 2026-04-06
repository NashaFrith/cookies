'use strict';

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

// ── Recipe detail ──────────────────────────────────────────────
const cache = {};

document.querySelectorAll('.recipe-link').forEach(link => {
    link.addEventListener('click', async e => {
        e.preventDefault();
        const id = link.dataset.recipeId;
        const detailEl = document.getElementById('detail-' + id);

        // Toggle off if already open
        if (!detailEl.hidden) {
            detailEl.hidden = true;
            link.classList.remove('active');
            return;
        }

        // Close any other open details
        document.querySelectorAll('.recipe-detail').forEach(d => {
            if (d !== detailEl) {
                d.hidden = true;
            }
        });
        document.querySelectorAll('.recipe-link').forEach(l => {
            if (l !== link) l.classList.remove('active');
        });

        link.classList.add('active');

        // Fetch if not cached
        if (!cache[id]) {
            detailEl.innerHTML = '<p style="padding:0.5rem 0; color:var(--text-muted); font-size:0.85rem;">Loading...</p>';
            detailEl.hidden = false;
            try {
                const [recipeRes, noteRes] = await Promise.all([
                    fetch('/api/recipe/' + id),
                    fetch('/api/notes/' + id),
                ]);
                const recipe = await recipeRes.json();
                const note = noteRes.ok ? await noteRes.json() : {};
                cache[id] = recipe;
                cache[id + '_note'] = note;
            } catch {
                detailEl.innerHTML = '<p style="color:var(--text-muted);">Could not load recipe.</p>';
                return;
            }
        }

        detailEl.innerHTML = buildDetailHTML(cache[id], cache[id + '_note'] || {});
        detailEl.hidden = false;

        // Attach serving adjuster
        const input = detailEl.querySelector('.serving-input');
        if (input) {
            input.addEventListener('input', () => {
                const val = parseFloat(input.value) || 1;
                const base = parseFloat(input.dataset.base);
                const multiplier = val / base;
                updateMacros(detailEl, cache[id].macros, multiplier);
                updateIngredients(detailEl, cache[id].ingredients, multiplier);
            });
        }

        // Attach copy URL button
        const copyBtn = detailEl.querySelector('.mf-url');
        if (copyBtn) {
            copyBtn.addEventListener('click', () => {
                navigator.clipboard.writeText(copyBtn.textContent.trim()).then(() => {
                    const hint = detailEl.querySelector('.copy-hint');
                    if (hint) { hint.textContent = 'copied!'; setTimeout(() => { hint.textContent = 'tap to copy'; }, 2000); }
                });
            });
        }
    });
});

// ── Build detail HTML ──────────────────────────────────────────
function buildDetailHTML(recipe, note = {}) {
    const { macros, ingredients, instructions, serving_size, time_minutes } = recipe;
    const pageUrl = window.location.origin + '/recipe/' + recipe.id;
    const timeBadge = time_minutes ? `<span style="font-size:0.8rem;color:var(--text-muted);margin-left:0.5rem;">⏱ ${time_minutes} min</span>` : '';
    const rating = note.rating || 0;
    const starsHTML = rating ? `<div class="inline-stars">${'★'.repeat(rating)}<span style="color:#bbb;">${'★'.repeat(5 - rating)}</span></div>` : '';
    const noteText = note.text ? `<p class="inline-note-text">${note.text}</p>` : '';

    const ingredientsHTML = ingredients.map(ing => {
        const amt = formatAmount(ing.amount);
        return `<li>
            <span class="ingredient-amount" data-original="${ing.amount}">${amt} ${ing.unit}</span>
            <span class="ingredient-name">${ing.name}</span>
        </li>`;
    }).join('');

    const instructionsHTML = instructions.map(step => `<li>${step}</li>`).join('');

    return `
        <div class="serving-row">
            <span class="serving-label">Servings</span>
            <input class="serving-input" type="number" min="0.5" step="0.5"
                value="${serving_size.amount}"
                data-base="${serving_size.amount}">
            <span class="serving-unit">${serving_size.unit}</span>
            ${timeBadge}
        </div>

        <div class="macro-panel">
            <div class="macro-item">
                <span class="macro-value" data-macro="calories">${macros.calories}</span>
                <span class="macro-label">Calories</span>
            </div>
            <div class="macro-item">
                <span class="macro-value" data-macro="protein_g">${macros.protein_g}g</span>
                <span class="macro-label">Protein</span>
            </div>
            <div class="macro-item">
                <span class="macro-value" data-macro="carbs_g">${macros.carbs_g}g</span>
                <span class="macro-label">Carbs</span>
            </div>
            <div class="macro-item">
                <span class="macro-value" data-macro="fat_g">${macros.fat_g}g</span>
                <span class="macro-label">Fat</span>
            </div>
            <div class="macro-item">
                <span class="macro-value" data-macro="fiber_g">${macros.fiber_g || 0}g</span>
                <span class="macro-label">Fiber</span>
            </div>
        </div>

        <p class="section-label">Ingredients</p>
        <ul class="ingredient-list">${ingredientsHTML}</ul>

        <p class="section-label">Instructions</p>
        <ol class="instructions-list">${instructionsHTML}</ol>

        ${starsHTML || noteText ? `<div class="inline-note">${starsHTML}${noteText}</div>` : ''}

        <div class="mf-hint">
            <strong>Import to MacroFactor:</strong> Open MacroFactor → Add Recipe → Import → paste this URL:<br>
            <button class="mf-url">${pageUrl}</button>
            <span class="copy-hint">tap to copy</span>
        </div>
    `;
}

// ── Helpers ────────────────────────────────────────────────────
function formatAmount(val) {
    if (val === Math.floor(val)) return val.toString();
    return parseFloat(val.toFixed(1)).toString();
}

function updateMacros(el, baseMacros, multiplier) {
    el.querySelector('[data-macro="calories"]').textContent =
        Math.round(baseMacros.calories * multiplier);
    el.querySelector('[data-macro="protein_g"]').textContent =
        Math.round(baseMacros.protein_g * multiplier) + 'g';
    el.querySelector('[data-macro="carbs_g"]').textContent =
        Math.round(baseMacros.carbs_g * multiplier) + 'g';
    el.querySelector('[data-macro="fat_g"]').textContent =
        Math.round(baseMacros.fat_g * multiplier) + 'g';
    el.querySelector('[data-macro="fiber_g"]').textContent =
        Math.round((baseMacros.fiber_g || 0) * multiplier) + 'g';
}

function updateIngredients(el, baseIngredients, multiplier) {
    el.querySelectorAll('.ingredient-amount').forEach((span, i) => {
        const original = parseFloat(span.dataset.original);
        const scaled = original * multiplier;
        span.textContent = formatAmount(scaled) + ' ' + baseIngredients[i].unit;
    });
}
