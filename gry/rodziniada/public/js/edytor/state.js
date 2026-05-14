export const state = {
    data: { categories: [] },
    activeCatId: null,
    editingQIndex: null,
    unsaved: false,
    currentPin: '',
    catSortable: null,
    qSortable: null,
    ansSortable: null,
    confirmCallback: null
};

export function markUnsaved() {
    state.unsaved = true;
    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.textContent = 'Zapisz *';
        btn.style.boxShadow = '0 0 12px rgba(22,163,74,0.7)';
    }
}

export function markSaved() {
    state.unsaved = false;
    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.textContent = 'Zapisz';
        btn.style.boxShadow = '';
    }
}

export function getActiveCategory() {
    return state.data.categories.find(c => c.id === state.activeCatId) || null;
}
