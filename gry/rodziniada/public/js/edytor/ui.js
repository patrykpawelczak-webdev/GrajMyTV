import { state, markUnsaved, getActiveCategory } from './state.js';
import { escapeHtml, generateId } from './utils.js';

// ===== TOAST =====
let toastTimer = null;
export function showToast(msg, type = 'info') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = `toast show ${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ===== STATYSTYKI =====
export function updateStats() {
    const cats = state.data.categories.length;
    const qs   = state.data.categories.reduce((s, c) => s + c.questions.length, 0);
    const ans  = state.data.categories.reduce((s, c) =>
        s + c.questions.reduce((ss, q) => ss + q.answers.length, 0), 0);
    document.getElementById('statCategories').textContent = cats;
    document.getElementById('statQuestions').textContent  = qs;
    document.getElementById('statAnswers').textContent    = ans;
}

// ===== RENDEROWANIE KATEGORII =====
export function renderCategories(selectCategoryCallback) {
    const list = document.getElementById('categoriesList');
    list.innerHTML = '';

    state.data.categories.forEach((cat, index) => {
        const item = document.createElement('div');
        item.className = 'category-item' + (cat.id === state.activeCatId ? ' active' : '');
        item.dataset.id = cat.id;

        item.innerHTML = `
            <span class="cat-drag-handle">&#8942;</span>
            <span class="cat-icon-display">${escapeHtml(cat.icon || '?')}</span>
            <div class="cat-info">
                <div class="cat-name-display">${escapeHtml(cat.name || 'Bez nazwy')}</div>
                <div class="cat-count-display">${cat.questions.length} pyt.</div>
            </div>
            <button class="cat-delete-btn" title="Usuń">X</button>
        `;

        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('cat-delete-btn')) return;
            selectCategoryCallback(cat.id);
        });

        const delBtn = item.querySelector('.cat-delete-btn');
        delBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            confirmDeleteCategory(cat.id, selectCategoryCallback);
        });

        list.appendChild(item);
    });

    initCatSortable(list);
}

function initCatSortable(list) {
    if (state.catSortable) state.catSortable.destroy();
    state.catSortable = Sortable.create(list, {
        handle: '.cat-drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const moved = state.data.categories.splice(evt.oldIndex, 1)[0];
            state.data.categories.splice(evt.newIndex, 0, moved);
            markUnsaved();
            updateStats();
        }
    });
}

function confirmDeleteCategory(catId, selectCategoryCallback) {
    const cat = state.data.categories.find(c => c.id === catId);
    if (!cat) return;

    state.confirmCallback = () => {
        state.data.categories = state.data.categories.filter(c => c.id !== catId);
        if (state.activeCatId === catId) {
            state.activeCatId = null;
            showContentEmpty();
        }
        renderCategories(selectCategoryCallback);
        updateStats();
        markUnsaved();
        showToast('Kategoria usunięta', 'info');
    };

    document.getElementById('confirmMessage').textContent =
        'Czy na pewno chcesz usunąć kategorię "' + cat.name + '"? ' +
        'Zostanie usuniętych ' + cat.questions.length + ' pytań.';

    document.getElementById('confirmModal').classList.remove('hidden');
}

export function showContentEmpty() {
    document.getElementById('contentEmpty').style.display = 'flex';
    document.getElementById('categoryEditor').classList.add('hidden');
}

export function showCategoryEditor(cat) {
    document.getElementById('contentEmpty').style.display = 'none';
    document.getElementById('categoryEditor').classList.remove('hidden');
    document.getElementById('catIcon').value = cat.icon || '';
    document.getElementById('catName').value = cat.name || '';
}

// ===== RENDEROWANIE PYTAŃ =====
export function renderQuestions(editQuestionCallback, deleteQuestionCallback) {
    const cat = getActiveCategory();
    const list = document.getElementById('questionsList');
    const countEl = document.getElementById('questionsCount');

    if (!cat) return;

    countEl.textContent = cat.questions.length;
    list.innerHTML = '';

    cat.questions.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = 'question-item';

        item.innerHTML = `
            <span class="q-drag-handle">&#8942;</span>
            <div class="q-number">${index + 1}</div>
            <div class="q-text">${escapeHtml(q.text || 'Bez treści')}</div>
            <span class="q-answers-count">${q.answers.length} odp.</span>
            <div class="q-actions">
                <button class="q-btn edit">Edytuj</button>
                <button class="q-btn delete">Usuń</button>
            </div>
        `;

        item.querySelector('.q-btn.edit').addEventListener('click', () => editQuestionCallback(index));
        item.querySelector('.q-btn.delete').addEventListener('click', () => deleteQuestionCallback(index));

        list.appendChild(item);
    });

    initQuestionSortable(list, editQuestionCallback, deleteQuestionCallback);
}

function initQuestionSortable(list, editQuestionCallback, deleteQuestionCallback) {
    if (state.qSortable) state.qSortable.destroy();
    state.qSortable = Sortable.create(list, {
        handle: '.q-drag-handle',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const cat = getActiveCategory();
            if (!cat) return;
            const moved = cat.questions.splice(evt.oldIndex, 1)[0];
            cat.questions.splice(evt.newIndex, 0, moved);
            renderQuestions(editQuestionCallback, deleteQuestionCallback);
            markUnsaved();
        }
    });
}

// ===== MODAL PYTANIA =====
let currentEditingQuestion = null;

export function openQuestionModal(question, isNew) {
    currentEditingQuestion = question;
    document.getElementById('questionModalTitle').textContent = isNew ? 'Nowe pytanie' : 'Edytuj pytanie';
    document.getElementById('questionText').value = question.text || '';
    renderAnswersEditor();
    document.getElementById('questionModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('questionText')?.focus(), 100);
}

export function closeQuestionModal() {
    document.getElementById('questionModal').classList.add('hidden');
    currentEditingQuestion = null;
    state.editingQIndex = null;
    if (state.ansSortable) { state.ansSortable.destroy(); state.ansSortable = null; }
}

export function getCurrentEditingQuestion() { return currentEditingQuestion; }

function renderAnswersEditor() {
    if (!currentEditingQuestion) return;
    const list = document.getElementById('answersEditorList');
    const countEl = document.getElementById('answersCountBadge');
    const addBtn = document.getElementById('btnAddAnswer');
    const MAX = 8;

    list.innerHTML = '';
    currentEditingQuestion.answers.forEach((ans, i) => {
        list.appendChild(createAnswerEditorItem(ans, i));
    });

    const count = currentEditingQuestion.answers.length;
    countEl.textContent = `${count}/${MAX}`;
    addBtn.disabled = count >= MAX;

    initAnswerSortable(list);
}

function createAnswerEditorItem(ans, index) {
    const item = document.createElement('div');
    item.className = 'answer-editor-item';
    item.dataset.id = ans.id || generateId();

    item.innerHTML = `
        <span class="ans-drag">&#8942;</span>
        <div class="ans-number">${index + 1}</div>
        <input type="text" class="ans-text-input" value="${escapeHtml(ans.text || '')}" placeholder="Treść odpowiedzi..." maxlength="80">
        <div class="ans-points-wrap">
            <span class="ans-points-label">pkt</span>
            <input type="number" class="ans-points-input" value="${ans.points || ''}" min="1" max="999" placeholder="0">
        </div>
        <button class="ans-delete">X</button>
    `;

    item.querySelector('.ans-delete').addEventListener('click', () => deleteAnswer(item));
    return item;
}

function deleteAnswer(item) {
    const list = document.getElementById('answersEditorList');
    const items = [...list.querySelectorAll('.answer-editor-item')];
    const index = items.indexOf(item);
    if (index !== -1 && currentEditingQuestion) currentEditingQuestion.answers.splice(index, 1);
    item.remove();
    updateAnswerNumbers();
    updateAnswersBadge();
}

function updateAnswerNumbers() {
    document.querySelectorAll('.answer-editor-item').forEach((item, i) => {
        const numEl = item.querySelector('.ans-number');
        if (numEl) numEl.textContent = i + 1;
    });
}

function updateAnswersBadge() {
    const list = document.getElementById('answersEditorList');
    const countEl = document.getElementById('answersCountBadge');
    const addBtn = document.getElementById('btnAddAnswer');
    const remaining = list.querySelectorAll('.answer-editor-item').length;
    countEl.textContent = `${remaining}/8`;
    addBtn.disabled = remaining >= 8;
}

function initAnswerSortable(list) {
    if (state.ansSortable) state.ansSortable.destroy();
    state.ansSortable = Sortable.create(list, {
        handle: '.ans-drag',
        animation: 150,
        ghostClass: 'sortable-ghost',
        onEnd: () => updateAnswerNumbers()
    });
}

export function addAnswerUI() {
    if (!currentEditingQuestion) return;
    const list = document.getElementById('answersEditorList');
    const current = list.querySelectorAll('.answer-editor-item').length;
    if (current >= 8) return;

    const newAns = { id: generateId(), text: '', points: '' };
    currentEditingQuestion.answers.push(newAns);
    const item = createAnswerEditorItem(newAns, current);
    list.appendChild(item);
    updateAnswersBadge();
    item.querySelector('.ans-text-input')?.focus();
    initAnswerSortable(list);
}

export function sortAnswersByPointsUI() {
    const list = document.getElementById('answersEditorList');
    const items = [...list.querySelectorAll('.answer-editor-item')];
    const answers = items.map(item => ({
        id: item.dataset.id,
        text: item.querySelector('.ans-text-input').value,
        points: parseInt(item.querySelector('.ans-points-input').value) || 0
    }));
    answers.sort((a, b) => b.points - a.points);
    list.innerHTML = '';
    answers.forEach((ans, i) => list.appendChild(createAnswerEditorItem(ans, i)));
    initAnswerSortable(list);
    showToast('Posortowano po punktach', 'info');
}
