'use strict';

let GROCERY_CATEGORIES = [];
let pantryData = [];
let shoppingData = [];

async function loadGrocery() {
    const res = await fetch('/api/grocery');
    return res.json();
}

function expiryBadge(daysLeft) {
    if (daysLeft === null) return '';
    if (daysLeft < 0)  return '<span class="expiry-badge expired">expired</span>';
    if (daysLeft <= 3) return `<span class="expiry-badge spoiling">use in ${daysLeft}d</span>`;
    return `<span class="expiry-badge ok">${daysLeft}d left</span>`;
}

function populateCategoryDropdowns() {
    ['pantry-category', 'shopping-category'].forEach(id => {
        const sel = document.getElementById(id);
        sel.innerHTML = '<option value="Other">Category...</option>' +
            GROCERY_CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('');
    });
}

function filterItems(items, query) {
    if (!query) return items;
    const q = query.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(q));
}

function renderPantry(pantry, query) {
    const container = document.getElementById('pantry-list');
    const alert = document.getElementById('spoiling-alert');

    const spoiling = pantry.filter(i => i.days_left !== null && i.days_left <= 3);
    alert.style.display = spoiling.length ? 'block' : 'none';
    if (spoiling.length) {
        alert.innerHTML = `<div class="spoiling-alert">Use soon: ${spoiling.map(i => `<strong>${i.name}</strong>`).join(', ')}</div>`;
    }

    const visible = filterItems(pantry, query);

    if (!pantry.length) {
        container.innerHTML = '<ul class="grocery-list"><li class="grocery-empty-li">We have no food :(</li></ul>';
        return;
    }
    if (!visible.length) {
        container.innerHTML = '<ul class="grocery-list"><li class="grocery-empty-li">No matches.</li></ul>';
        return;
    }

    // Group by category
    const grouped = {};
    GROCERY_CATEGORIES.forEach(c => { grouped[c] = []; });
    visible.forEach(item => {
        const cat = GROCERY_CATEGORIES.includes(item.category) ? item.category : 'Other';
        grouped[cat].push(item);
    });

    container.innerHTML = GROCERY_CATEGORIES
        .filter(cat => grouped[cat].length)
        .map(cat => `
            <div class="grocery-category-group">
                <div class="grocery-category-label">${cat}</div>
                <ul class="grocery-list">
                    ${grouped[cat].map(item => `
                        <li class="grocery-item">
                            <div class="grocery-item-main">
                                <span class="grocery-item-name">${item.name}</span>
                                ${item.amount || item.unit ? `<span class="grocery-item-meta">${item.amount} ${item.unit}`.trim() + '</span>' : ''}
                                ${expiryBadge(item.days_left)}
                            </div>
                            <button class="grocery-remove" data-id="${item.id}" data-type="pantry">×</button>
                        </li>
                    `).join('')}
                </ul>
            </div>
        `).join('');
}

function updateMovePantryBtn(shopping) {
    const hasChecked = shopping.some(i => i.checked);
    document.getElementById('checked-actions').style.display = hasChecked ? 'block' : 'none';
}

function renderShopping(shopping, query) {
    const container = document.getElementById('shopping-list');
    const empty = document.getElementById('shopping-empty');

    updateMovePantryBtn(shopping);

    const visible = filterItems(shopping, query);
    const unchecked = visible.filter(i => !i.checked);
    const checked = visible.filter(i => i.checked);

    if (!shopping.length) {
        container.innerHTML = '';
        empty.style.display = 'block';
        return;
    }
    empty.style.display = 'none';

    if (!visible.length) {
        container.innerHTML = '<ul class="grocery-list"><li class="grocery-empty-li">No matches.</li></ul>';
        return;
    }

    // Group unchecked by category, append checked at bottom ungrouped
    const grouped = {};
    GROCERY_CATEGORIES.forEach(c => { grouped[c] = []; });
    unchecked.forEach(item => {
        const cat = GROCERY_CATEGORIES.includes(item.category) ? item.category : 'Other';
        grouped[cat].push(item);
    });

    function itemHTML(item) {
        return `
            <li class="grocery-item ${item.checked ? 'grocery-item-checked' : ''}">
                <label class="grocery-check-label">
                    <input type="checkbox" class="grocery-checkbox" data-id="${item.id}" ${item.checked ? 'checked' : ''}>
                </label>
                <div class="grocery-item-main">
                    <span class="grocery-item-name">${item.name}</span>
                    ${item.amount || item.unit ? `<span class="grocery-item-meta">${item.amount} ${item.unit}`.trim() + '</span>' : ''}
                    ${item.note ? `<span class="grocery-item-note">${item.note}</span>` : ''}
                </div>
                <button class="grocery-remove" data-id="${item.id}" data-type="shopping">×</button>
            </li>`;
    }

    const groupedHTML = GROCERY_CATEGORIES
        .filter(cat => grouped[cat].length)
        .map(cat => `
            <div class="grocery-category-group">
                <div class="grocery-category-label">${cat}</div>
                <ul class="grocery-list">${grouped[cat].map(itemHTML).join('')}</ul>
            </div>
        `).join('');

    const checkedHTML = checked.length
        ? `<div class="grocery-category-group">
               <div class="grocery-category-label" style="opacity:0.5;">In cart</div>
               <ul class="grocery-list">${checked.map(itemHTML).join('')}</ul>
           </div>`
        : '';

    container.innerHTML = groupedHTML + checkedHTML;
}

function attachHandlers() {
    document.querySelectorAll('.grocery-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
            const type = btn.dataset.type;
            const url = type === 'pantry' ? '/api/grocery/pantry/remove' : '/api/grocery/shopping/remove';
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: btn.dataset.id }),
            });
            refresh();
        });
    });

    document.querySelectorAll('.grocery-checkbox').forEach(cb => {
        cb.addEventListener('change', async () => {
            await fetch('/api/grocery/shopping/check', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cb.dataset.id, checked: cb.checked }),
            });
            refresh();
        });
    });
}

async function refresh() {
    const data = await loadGrocery();
    GROCERY_CATEGORIES = data.categories || [];
    pantryData = data.pantry;
    shoppingData = data.shopping;
    populateCategoryDropdowns();
    const pantryQ = document.getElementById('pantry-search').value;
    const shopQ = document.getElementById('shopping-search').value;
    renderPantry(pantryData, pantryQ);
    renderShopping(shoppingData, shopQ);
    attachHandlers();
}

// Search
document.getElementById('pantry-search').addEventListener('input', () => {
    renderPantry(pantryData, document.getElementById('pantry-search').value);
    attachHandlers();
});
document.getElementById('shopping-search').addEventListener('input', () => {
    renderShopping(shoppingData, document.getElementById('shopping-search').value);
    attachHandlers();
});

// Pantry form
document.getElementById('pantry-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    await fetch('/api/grocery/pantry/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: form.name.value.trim(),
            amount: form.amount.value.trim(),
            unit: form.unit.value.trim(),
            expires: form.expires.value,
            category: form.category.value,
        }),
    });
    form.reset();
    refresh();
});

// Shopping form
document.getElementById('shopping-form').addEventListener('submit', async e => {
    e.preventDefault();
    const form = e.target;
    await fetch('/api/grocery/shopping/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            name: form.name.value.trim(),
            amount: form.amount.value.trim(),
            unit: form.unit.value.trim(),
            category: form.category.value,
        }),
    });
    form.reset();
    refresh();
});

// Move checked to pantry
document.getElementById('move-pantry-btn').addEventListener('click', async () => {
    const btn = document.getElementById('move-pantry-btn');
    btn.disabled = true;
    await fetch('/api/grocery/shopping/move-to-pantry', { method: 'POST' });
    btn.disabled = false;
    refresh();
});

// Uncheck all
document.getElementById('uncheck-all-btn').addEventListener('click', async () => {
    await fetch('/api/grocery/shopping/uncheck-all', { method: 'POST' });
    refresh();
});

// From plan — preview modal
let previewItems = [];

function updateModalCount() {
    const checked = document.querySelectorAll('.modal-item-check:checked').length;
    document.getElementById('modal-count').textContent = checked > 0 ? `${checked} item${checked === 1 ? '' : 's'} selected` : '';
    document.getElementById('modal-confirm').disabled = checked === 0;
}

document.getElementById('from-plan-btn').addEventListener('click', async () => {
    const btn = document.getElementById('from-plan-btn');
    btn.disabled = true;
    const res = await fetch('/api/grocery/from-plan');
    const data = await res.json();
    btn.disabled = false;
    previewItems = data.items;

    if (!previewItems.length) {
        const msg = document.getElementById('from-plan-msg');
        msg.style.display = 'block';
        msg.textContent = 'No recipes planned this week.';
        setTimeout(() => { msg.style.display = 'none'; }, 4000);
        return;
    }

    const list = document.getElementById('modal-list');
    list.innerHTML = previewItems.map((item, i) => {
        const alreadyHave = item.in_pantry || item.in_shopping;
        const statusLabel = item.in_pantry
            ? '<span class="modal-item-status pantry">in pantry</span>'
            : item.in_shopping
                ? '<span class="modal-item-status on-list">on list</span>'
                : '';
        const amtStr = item.amount ? `${item.amount} ${item.unit}`.trim() : '';
        return `
            <li class="modal-item ${alreadyHave ? 'modal-item-muted' : ''}">
                <label class="modal-item-label">
                    <input type="checkbox" class="modal-item-check" data-idx="${i}"
                        ${alreadyHave ? '' : 'checked'}>
                    <span class="modal-item-name">${item.name}</span>
                    ${amtStr ? `<span class="modal-item-amt">${amtStr}</span>` : ''}
                    ${statusLabel}
                </label>
            </li>
        `;
    }).join('');

    list.querySelectorAll('.modal-item-check').forEach(cb => {
        cb.addEventListener('change', updateModalCount);
    });

    updateModalCount();
    document.getElementById('plan-modal-backdrop').style.display = 'flex';
});

function closeModal() {
    document.getElementById('plan-modal-backdrop').style.display = 'none';
}

document.getElementById('modal-close').addEventListener('click', closeModal);
document.getElementById('modal-cancel').addEventListener('click', closeModal);
document.getElementById('plan-modal-backdrop').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeModal();
});

document.getElementById('modal-confirm').addEventListener('click', async () => {
    const selected = [...document.querySelectorAll('.modal-item-check:checked')]
        .map(cb => previewItems[parseInt(cb.dataset.idx)]);

    closeModal();
    const res = await fetch('/api/grocery/from-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: selected }),
    });
    const data = await res.json();
    const msg = document.getElementById('from-plan-msg');
    msg.style.display = 'block';
    msg.textContent = `Added ${data.added} ingredient${data.added === 1 ? '' : 's'} to the shopping list.`;
    setTimeout(() => { msg.style.display = 'none'; }, 4000);
    refresh();
});

refresh();