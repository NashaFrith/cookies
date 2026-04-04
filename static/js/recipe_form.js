'use strict';

// ── Ingredient rows ────────────────────────────────────────────
const ingRows = document.getElementById('ingredient-rows');

document.getElementById('add-ingredient').addEventListener('click', () => {
    const rows = ingRows.querySelectorAll('.ingredient-row');
    const clone = rows[rows.length - 1].cloneNode(true);
    clone.querySelectorAll('input').forEach(i => i.value = '');
    ingRows.appendChild(clone);
    clone.querySelector('.ing-name').focus();
});

ingRows.addEventListener('click', e => {
    if (e.target.classList.contains('remove-row-btn')) {
        if (ingRows.querySelectorAll('.ingredient-row').length > 1) {
            e.target.closest('.ingredient-row').remove();
        }
    }
});

// ── Instruction rows ───────────────────────────────────────────
const instrRows = document.getElementById('instruction-rows');

document.getElementById('add-instruction').addEventListener('click', () => {
    const rows = instrRows.querySelectorAll('.instruction-row');
    const clone = rows[rows.length - 1].cloneNode(true);
    clone.querySelector('textarea').value = '';
    instrRows.appendChild(clone);
    clone.querySelector('textarea').focus();
});

instrRows.addEventListener('click', e => {
    if (e.target.classList.contains('remove-row-btn')) {
        if (instrRows.querySelectorAll('.instruction-row').length > 1) {
            e.target.closest('.instruction-row').remove();
        }
    }
});
