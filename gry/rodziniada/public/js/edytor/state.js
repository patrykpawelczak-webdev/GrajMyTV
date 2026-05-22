export const state = {
    data: { categories: [] },
    jokesData: { jokes: [] },
    activeTab: 'questions',
    activeCatId: null,
    activeJokeId: null,
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

export function getActiveJoke() {
    if (!state.jokesData || !Array.isArray(state.jokesData.jokes)) return null;
    return state.jokesData.jokes.find(j => j.id === state.activeJokeId) || null;
}
