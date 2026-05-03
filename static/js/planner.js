'use strict';

const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };
const MEALS = ['breakfast', 'lunch', 'dinner', 'snack'];

let currentWeekStart = getSundayOf(new Date());

function getSundayOf(d) {
    const day = new Date(d);
    day.setHours(0, 0, 0, 0);
    day.setDate(day.getDate() - day.getDay()); // getDay() returns 0 for Sunday
    return day;
}

function toISO(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function formatWeekLabel(weekStartISO) {
    const start = new Date(weekStartISO + 'T00:00:00');
    const end = new Date(weekStartISO + 'T00:00:00');
    end.setDate(end.getDate() + 6);
    const opts = { month: 'short', day: 'numeric' };
    return start.toLocaleDateString('en-US', opts) + ' – ' + end.toLocaleDateString('en-US', { ...opts, year: 'numeric' });
}

function macroRow(totals) {
    return `
        <span class="macro-pill"><strong>${totals.calories}</strong> cal</span>
        <span class="macro-pill"><strong>${totals.protein_g}g</strong> pro</span>
        <span class="macro-pill"><strong>${totals.carbs_g}g</strong> carbs</span>
        <span class="macro-pill"><strong>${totals.fat_g}g</strong> fat</span>
        <span class="macro-pill"><strong>${totals.fiber_g}g</strong> fiber</span>
    `;
}

function recipesGroupedHTML() {
    const groups = {};
    window.CATEGORY_ORDER.forEach(cat => { groups[cat] = []; });
    window.RECIPES.forEach(r => {
        if (groups[r.category]) groups[r.category].push(r);
    });
    return window.CATEGORY_ORDER
        .filter(cat => groups[cat].length > 0)
        .map(cat => `
            <optgroup label="${cat}">
                ${groups[cat].map(r => `<option value="${r.id}">${r.name}</option>`).join('')}
            </optgroup>
        `).join('');
}

async function loadWeek(weekStart) {
    const res = await fetch('/api/plan?week=' + toISO(weekStart));
    return res.json();
}

function renderGrid(data) {
    document.getElementById('week-label').textContent = formatWeekLabel(data.week_start);

    const grid = document.getElementById('planner-grid');
    const groupedOpts = recipesGroupedHTML();

    grid.innerHTML = data.days.map(day => `
        <div class="planner-day">
            <div class="planner-day-header">
                <span class="planner-day-name">${day.day_name}</span>
                <span class="planner-day-num">${day.month_abbr} ${day.day_num}</span>
            </div>
            ${MEALS.map(slot => `
                <div class="planner-slot">
                    <div class="planner-slot-label">${MEAL_LABELS[slot]}</div>
                    ${day.slots[slot].map(r => `
                        <div class="planner-item${r.type === 'custom' ? ' planner-item-custom' : ''}">
                            <span class="planner-item-name">${r.name}</span>
                            <button class="planner-remove"
                                data-date="${day.date}"
                                data-slot="${slot}"
                                data-id="${r.id}">×</button>
                        </div>
                    `).join('')}
                    <select class="planner-select" data-date="${day.date}" data-slot="${slot}">
                        <option value="">+ recipe</option>
                        ${groupedOpts}
                    </select>
                    <div class="planner-custom-row">
                        <input class="planner-custom-input" type="text" placeholder="custom meal..."
                            data-date="${day.date}" data-slot="${slot}">
                        <button class="planner-custom-add" data-date="${day.date}" data-slot="${slot}">+</button>
                    </div>
                </div>
            `).join('')}
            <div class="planner-day-totals">
                ${macroRow(day.totals)}
            </div>
        </div>
    `).join('');

    document.getElementById('week-totals').innerHTML = `
        <span class="week-totals-label">Week</span>
        ${macroRow(data.week_totals)}
    `;

    // Remove handlers
    grid.querySelectorAll('.planner-remove').forEach(btn => {
        btn.addEventListener('click', async () => {
            await fetch('/api/plan/remove', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: btn.dataset.date, slot: btn.dataset.slot, entry_id: btn.dataset.id }),
            });
            refresh();
        });
    });

    // Recipe select handlers
    grid.querySelectorAll('.planner-select').forEach(sel => {
        sel.addEventListener('change', async () => {
            if (!sel.value) return;
            await fetch('/api/plan/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ date: sel.dataset.date, slot: sel.dataset.slot, recipe_id: sel.value }),
            });
            sel.value = '';
            refresh();
        });
    });

    // Custom entry handlers
    async function submitCustom(input) {
        const text = input.value.trim();
        if (!text) return;
        await fetch('/api/plan/add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ date: input.dataset.date, slot: input.dataset.slot, custom_text: text }),
        });
        input.value = '';
        refresh();
    }

    grid.querySelectorAll('.planner-custom-input').forEach(input => {
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submitCustom(input); });
    });

    grid.querySelectorAll('.planner-custom-add').forEach(btn => {
        btn.addEventListener('click', () => {
            const input = btn.closest('.planner-custom-row').querySelector('.planner-custom-input');
            submitCustom(input);
        });
    });
}

async function refresh() {
    const data = await loadWeek(currentWeekStart);
    renderGrid(data);
}

document.getElementById('prev-week').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    refresh();
});

document.getElementById('next-week').addEventListener('click', () => {
    currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    refresh();
});

refresh();
