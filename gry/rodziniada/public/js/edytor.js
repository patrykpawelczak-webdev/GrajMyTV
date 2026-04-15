// ===== STAN =====
let data          = { categories: [] };
let activeCatId   = null;
let editingQIndex = null;
let unsaved       = false;

let catSortable = null;
let qSortable   = null;
let ansSortable = null;

// ===== HELPERS =====
function generateId() {
    return 'id_' + Math.random().toString(36).substring(2, 10) + '_' + Date.now();
}

function getActiveCategory() {
    return data.categories.find(c => c.id === activeCatId) || null;
}

function markUnsaved() {
    unsaved = true;
    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.textContent    = 'Zapisz *';
        btn.style.boxShadow = '0 0 12px rgba(22,163,74,0.7)';
    }
}

function markSaved() {
    unsaved = false;
    const btn = document.getElementById('btnSave');
    if (btn) {
        btn.textContent    = 'Zapisz';
        btn.style.boxShadow = '';
    }
}

function escapeHtml(str) {
    return String(str)
        .replace(/&/g,  '&amp;')
        .replace(/</g,  '&lt;')
        .replace(/>/g,  '&gt;')
        .replace(/"/g,  '&quot;')
        .replace(/'/g,  '&#39;');
}

// ===== TOAST =====
let toastTimer = null;
function showToast(msg, type = 'info') {
    const el     = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast show ${type}`;
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3000);
}

// ===== STATYSTYKI =====
function updateStats() {
    const cats = data.categories.length;
    const qs   = data.categories.reduce((s, c) => s + c.questions.length, 0);
    const ans  = data.categories.reduce((s, c) =>
        s + c.questions.reduce((ss, q) => ss + q.answers.length, 0), 0);
    document.getElementById('statCategories').textContent = cats;
    document.getElementById('statQuestions').textContent  = qs;
    document.getElementById('statAnswers').textContent    = ans;
}

// ===== PIN =====
document.addEventListener('DOMContentLoaded', () => {
    setupPinInputs();

    document.getElementById('questionModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('questionModal')) closeQuestionModal();
    });
    document.getElementById('confirmModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('confirmModal')) closeConfirmModal();
    });
});

function setupPinInputs() {
    const inputs = document.querySelectorAll('.pin-digit');

    inputs.forEach((input, index) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(-1);
            if (input.value && index < inputs.length - 1) {
                inputs[index + 1].focus();
            }
            const all = [...inputs].every(i => i.value.length === 1);
            if (all) verifyPin();
        });

        input.addEventListener('keydown', (e) => {
            if (e.key === 'Backspace' && !input.value && index > 0) {
                inputs[index - 1].focus();
                inputs[index - 1].value = '';
            }
            if (e.key === 'Enter') verifyPin();
        });

        input.addEventListener('paste', (e) => {
            e.preventDefault();
            const pasted = e.clipboardData.getData('text').replace(/\D/g, '');
            [...pasted].forEach((char, i) => {
                if (inputs[index + i]) inputs[index + i].value = char;
            });
            const nextEmpty = [...inputs].findIndex(i => !i.value);
            if (nextEmpty !== -1) inputs[nextEmpty].focus();
            else inputs[inputs.length - 1].focus();
            const all = [...inputs].every(i => i.value.length === 1);
            if (all) setTimeout(verifyPin, 100);
        });
    });

    setTimeout(() => inputs[0]?.focus(), 100);
}

async function verifyPin() {
    const inputs = document.querySelectorAll('.pin-digit');
    const pin    = [...inputs].map(i => i.value).join('');

    if (pin.length < 4) {
        showPinError('Wpisz 4 cyfry');
        return;
    }

    try {
        const res  = await fetch('/rodziniada/api/verify-pin', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ pin })
        });
        const json = await res.json();

        if (json.ok) {
            document.getElementById('pinScreen').style.display = 'none';
            document.getElementById('editorScreen').classList.remove('hidden');
            await loadData();
        } else {
            showPinError('Nieprawidlowy PIN');
            inputs.forEach(i => {
                i.value = '';
                i.classList.add('error');
            });
            setTimeout(() => {
                inputs.forEach(i => i.classList.remove('error'));
                inputs[0].focus();
            }, 600);
        }
    } catch(e) {
        showPinError('Blad polaczenia z serwerem');
    }
}

function showPinError(msg) {
    const el = document.getElementById('pinError');
    el.textContent = msg;
    setTimeout(() => { el.textContent = ''; }, 3000);
}

// ===== LADOWANIE =====
async function loadData() {
    try {
        const res = await fetch('/rodziniada/api/questions');
        data      = await res.json();

        data.categories.forEach(cat => {
            if (!cat.id) cat.id = generateId();
            cat.questions.forEach(q => {
                if (!q.id) q.id = generateId();
                q.answers.forEach(a => {
                    if (!a.id) a.id = generateId();
                });
            });
        });

        renderCategories();
        updateStats();
        showToast('Dane zaladowane', 'success');
    } catch(e) {
        showToast('Blad ladowania danych!', 'error');
    }
}

// ===== ZAPIS =====
async function saveAll() {
    try {
        const res  = await fetch('/rodziniada/api/questions', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify(data)
        });
        const json = await res.json();

        if (json.ok) {
            markSaved();
            showToast('Zapisano pomyslnie!', 'success');
        } else {
            showToast('Blad zapisu: ' + (json.error || ''), 'error');
        }
    } catch(e) {
        showToast('Blad polaczenia z serwerem!', 'error');
    }
}

// ===== EKSPORT =====
function exportJSON() {
    const blob = new Blob(
        [JSON.stringify(data, null, 2)],
        { type: 'application/json' }
    );
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `rodziniada_pytania_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Wyeksportowano plik JSON', 'success');
}

// ===== IMPORT =====
function importJSON() {
    document.getElementById('importInput').click();
}

function handleImport(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.categories || !Array.isArray(imported.categories)) {
                showToast('Nieprawidlowy format pliku!', 'error');
                return;
            }

            imported.categories.forEach(cat => {
                if (!cat.id) cat.id = generateId();
                cat.questions.forEach(q => {
                    if (!q.id) q.id = generateId();
                    q.answers.forEach(a => {
                        if (!a.id) a.id = generateId();
                    });
                });
            });

            data        = imported;
            activeCatId = null;
            renderCategories();
            showContentEmpty();
            updateStats();
            markUnsaved();
            showToast(
                'Zaimportowano: ' + imported.categories.length + ' kategorii',
                'success'
            );
        } catch(err) {
            showToast('Blad parsowania pliku JSON!', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
}

// ===== KATEGORIE =====
function renderCategories() {
    const list = document.getElementById('categoriesList');
    list.innerHTML = '';

    data.categories.forEach((cat, index) => {
        const item         = document.createElement('div');
        item.className     = 'category-item' + (cat.id === activeCatId ? ' active' : '');
        item.dataset.catId = cat.id;
        item.dataset.index = index;

        item.innerHTML = `
            <span class="cat-drag-handle">&#8942;</span>
            <span class="cat-icon-display">${escapeHtml(cat.icon || '?')}</span>
            <div class="cat-info">
                <div class="cat-name-display">${escapeHtml(cat.name || 'Bez nazwy')}</div>
                <div class="cat-count-display">${cat.questions.length} pyt.</div>
            </div>
            <button class="cat-delete-btn" title="Usun">X</button>
        `;

        // Klik na cały item = wybierz (jeśli nie kliknięto delete)
        item.addEventListener('click', (e) => {
            if (e.target.classList.contains('cat-delete-btn')) return;
            selectCategory(cat.id);
        });

        // ✅ Klik na delete - używa cat.id z closure
        const delBtn = item.querySelector('.cat-delete-btn');
        delBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            confirmDeleteCategory(cat.id);
        });

        list.appendChild(item);
    });

    // Sortable
    if (catSortable) catSortable.destroy();
    catSortable = Sortable.create(list, {
        handle:     '.cat-drag-handle',
        animation:  150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const moved = data.categories.splice(evt.oldIndex, 1)[0];
            data.categories.splice(evt.newIndex, 0, moved);
            markUnsaved();
            updateStats();
        }
    });
}

// ✅ Osobna funkcja potwierdzenia usunięcia kategorii
function confirmDeleteCategory(catId) {
    const cat = data.categories.find(c => c.id === catId);
    if (!cat) return;

    // ✅ Bezpośrednio ustawiamy callback - bez klonowania przycisku
    confirmCallback = () => {
        data.categories = data.categories.filter(c => c.id !== catId);

        if (activeCatId === catId) {
            activeCatId = null;
            showContentEmpty();
        }

        renderCategories();
        updateStats();
        markUnsaved();
        showToast('Kategoria usunieta', 'info');
    };

    document.getElementById('confirmMessage').textContent =
        'Czy na pewno chcesz usunac kategorie "' + cat.name + '"? ' +
        'Zostanie usunietych ' + cat.questions.length + ' pytan.';

    document.getElementById('confirmModal').classList.remove('hidden');
}

function selectCategory(catId) {
    activeCatId = catId;
    renderCategories();

    const cat = getActiveCategory();
    if (!cat) return;

    document.getElementById('contentEmpty').style.display = 'none';
    document.getElementById('categoryEditor').classList.remove('hidden');

    document.getElementById('catIcon').value = cat.icon || '';
    document.getElementById('catName').value = cat.name || '';

    renderQuestions();
}

function showContentEmpty() {
    document.getElementById('contentEmpty').style.display = 'flex';
    document.getElementById('categoryEditor').classList.add('hidden');
}

function addCategory() {
    const newCat = {
        id:        generateId(),
        name:      'Nowa kategoria',
        icon:      '?',
        questions: []
    };
    data.categories.push(newCat);
    renderCategories();
    updateStats();
    markUnsaved();
    selectCategory(newCat.id);
    setTimeout(() => document.getElementById('catName')?.focus(), 100);
}

function updateCategoryInfo() {
    const cat = getActiveCategory();
    if (!cat) return;

    const icon = document.getElementById('catIcon').value.trim();
    const name = document.getElementById('catName').value.trim();

    if (!name) {
        showToast('Nazwa kategorii nie moze byc pusta!', 'error');
        return;
    }

    cat.icon = icon || '?';
    cat.name = name;

    renderCategories();
    markUnsaved();
    showToast('Kategoria zaktualizowana', 'success');
}

// ===== PYTANIA =====
function renderQuestions() {
    const cat     = getActiveCategory();
    const list    = document.getElementById('questionsList');
    const countEl = document.getElementById('questionsCount');

    if (!cat) return;

    countEl.textContent = cat.questions.length;
    list.innerHTML      = '';

    cat.questions.forEach((q, index) => {
        const item     = document.createElement('div');
        item.className = 'question-item';

        item.innerHTML = `
            <span class="q-drag-handle">&#8942;</span>
            <div class="q-number">${index + 1}</div>
            <div class="q-text">${escapeHtml(q.text || 'Bez tresci')}</div>
            <span class="q-answers-count">${q.answers.length} odp.</span>
            <div class="q-actions">
                <button class="q-btn edit">Edytuj</button>
                <button class="q-btn delete">Usun</button>
            </div>
        `;

        item.querySelector('.q-btn.edit').addEventListener('click', () => {
            editQuestion(index);
        });
        item.querySelector('.q-btn.delete').addEventListener('click', () => {
            confirmDeleteQuestion(index);
        });

        list.appendChild(item);
    });

    // Sortable pytań
    if (qSortable) qSortable.destroy();
    qSortable = Sortable.create(list, {
        handle:     '.q-drag-handle',
        animation:  150,
        ghostClass: 'sortable-ghost',
        onEnd: (evt) => {
            const cat   = getActiveCategory();
            if (!cat) return;
            const moved = cat.questions.splice(evt.oldIndex, 1)[0];
            cat.questions.splice(evt.newIndex, 0, moved);
            renderQuestions();
            markUnsaved();
        }
    });
}

function addQuestion() {
    editingQIndex = -1;
    openQuestionModal({ id: generateId(), text: '', answers: [] }, true);
}

function editQuestion(index) {
    editingQIndex = index;
    const cat = getActiveCategory();
    if (!cat) return;
    openQuestionModal(JSON.parse(JSON.stringify(cat.questions[index])), false);
}

// ✅ Osobna funkcja potwierdzenia usunięcia pytania
function confirmDeleteQuestion(index) {
    const cat = getActiveCategory();
    if (!cat) return;
    const q = cat.questions[index];

    confirmCallback = () => {
        cat.questions.splice(index, 1);
        renderQuestions();
        updateStats();
        markUnsaved();
        showToast('Pytanie usuniete', 'info');
    };

    document.getElementById('confirmMessage').textContent =
        'Czy na pewno chcesz usunac pytanie: "' + (q.text || '') + '"?';

    document.getElementById('confirmModal').classList.remove('hidden');
}

// ===== MODAL PYTANIA =====
let currentEditingQuestion = null;

function openQuestionModal(question, isNew) {
    currentEditingQuestion = question;
    document.getElementById('questionModalTitle').textContent =
        isNew ? 'Nowe pytanie' : 'Edytuj pytanie';
    document.getElementById('questionText').value = question.text || '';

    renderAnswersEditor();
    document.getElementById('questionModal').classList.remove('hidden');
    setTimeout(() => document.getElementById('questionText')?.focus(), 100);
}

function closeQuestionModal() {
    document.getElementById('questionModal').classList.add('hidden');
    currentEditingQuestion = null;
    editingQIndex          = null;
    if (ansSortable) { ansSortable.destroy(); ansSortable = null; }
}

function saveQuestion() {
    if (!currentEditingQuestion) return;

    const text = document.getElementById('questionText').value.trim();
    if (!text) {
        showToast('Tresc pytania nie moze byc pusta!', 'error');
        document.getElementById('questionText').focus();
        return;
    }

    const answerItems = document.querySelectorAll('.answer-editor-item');
    const answers     = [];
    let hasError      = false;

    answerItems.forEach(item => {
        const txtInput = item.querySelector('.ans-text-input');
        const ptsInput = item.querySelector('.ans-points-input');
        const txt      = txtInput.value.trim();
        const pts      = parseInt(ptsInput.value);

        if (!txt) {
            txtInput.style.borderColor = 'var(--red)';
            hasError = true;
            return;
        }
        if (isNaN(pts) || pts < 1 || pts > 999) {
            ptsInput.style.borderColor = 'var(--red)';
            hasError = true;
            return;
        }

        answers.push({
            id:     item.dataset.id || generateId(),
            text:   txt,
            points: pts
        });
    });

    if (hasError) {
        showToast('Popraw bledy w odpowiedziach!', 'error');
        return;
    }
    if (answers.length === 0) {
        showToast('Dodaj co najmniej jedna odpowiedz!', 'error');
        return;
    }

    currentEditingQuestion.text    = text;
    currentEditingQuestion.answers = answers;

    const cat = getActiveCategory();
    if (!cat) return;

    if (editingQIndex === -1) {
        cat.questions.push(currentEditingQuestion);
    } else {
        cat.questions[editingQIndex] = currentEditingQuestion;
    }

    renderQuestions();
    updateStats();
    markUnsaved();
    closeQuestionModal();
    showToast(
        editingQIndex === -1 ? 'Pytanie dodane!' : 'Pytanie zaktualizowane!',
        'success'
    );
}

// ===== ODPOWIEDZI EDITOR =====
function renderAnswersEditor() {
    if (!currentEditingQuestion) return;

    const list    = document.getElementById('answersEditorList');
    const countEl = document.getElementById('answersCountBadge');
    const addBtn  = document.getElementById('btnAddAnswer');
    const MAX     = 8;

    list.innerHTML = '';
    currentEditingQuestion.answers.forEach((ans, i) => {
        list.appendChild(createAnswerEditorItem(ans, i));
    });

    const count         = currentEditingQuestion.answers.length;
    countEl.textContent = `${count}/${MAX}`;
    addBtn.disabled     = count >= MAX;

    initAnswerSortable(list);
}

function createAnswerEditorItem(ans, index) {
    const item      = document.createElement('div');
    item.className  = 'answer-editor-item';
    item.dataset.id = ans.id || generateId();

    item.innerHTML = `
        <span class="ans-drag">&#8942;</span>
        <div class="ans-number">${index + 1}</div>
        <input type="text"
               class="ans-text-input"
               value="${escapeHtml(ans.text || '')}"
               placeholder="Tresc odpowiedzi..."
               maxlength="80">
        <div class="ans-points-wrap">
            <span class="ans-points-label">pkt</span>
            <input type="number"
                   class="ans-points-input"
                   value="${ans.points || ''}"
                   min="1" max="999"
                   placeholder="0">
        </div>
        <button class="ans-delete">X</button>
    `;

    item.querySelector('.ans-delete').addEventListener('click', () => {
        deleteAnswer(item);
    });

    return item;
}

function initAnswerSortable(list) {
    if (ansSortable) ansSortable.destroy();
    ansSortable = Sortable.create(list, {
        handle:     '.ans-drag',
        animation:  150,
        ghostClass: 'sortable-ghost',
        onEnd:      () => updateAnswerNumbers()
    });
}

function addAnswer() {
    if (!currentEditingQuestion) return;
    const MAX  = 8;
    const list = document.getElementById('answersEditorList');

    const current = list.querySelectorAll('.answer-editor-item').length;
    if (current >= MAX) return;

    const newAns = { id: generateId(), text: '', points: '' };
    currentEditingQuestion.answers.push(newAns);

    const item = createAnswerEditorItem(newAns, current);
    list.appendChild(item);

    const countEl       = document.getElementById('answersCountBadge');
    const addBtn        = document.getElementById('btnAddAnswer');
    countEl.textContent = `${current + 1}/${MAX}`;
    addBtn.disabled     = (current + 1) >= MAX;

    item.querySelector('.ans-text-input')?.focus();
    initAnswerSortable(list);
}

function deleteAnswer(item) {
    const list    = document.getElementById('answersEditorList');
    const MAX     = 8;
    const items   = [...list.querySelectorAll('.answer-editor-item')];
    const index   = items.indexOf(item);

    if (index !== -1 && currentEditingQuestion) {
        currentEditingQuestion.answers.splice(index, 1);
    }

    item.remove();
    updateAnswerNumbers();

    const countEl       = document.getElementById('answersCountBadge');
    const addBtn        = document.getElementById('btnAddAnswer');
    const remaining     = list.querySelectorAll('.answer-editor-item').length;
    countEl.textContent = `${remaining}/${MAX}`;
    addBtn.disabled     = remaining >= MAX;
}

function updateAnswerNumbers() {
    document.querySelectorAll('.answer-editor-item').forEach((item, i) => {
        const numEl = item.querySelector('.ans-number');
        if (numEl) numEl.textContent = i + 1;
    });
}

function sortAnswersByPoints() {
    const list  = document.getElementById('answersEditorList');
    const items = [...list.querySelectorAll('.answer-editor-item')];

    const answers = items.map(item => ({
        id:     item.dataset.id,
        text:   item.querySelector('.ans-text-input').value,
        points: parseInt(item.querySelector('.ans-points-input').value) || 0
    }));

    answers.sort((a, b) => b.points - a.points);

    list.innerHTML = '';
    answers.forEach((ans, i) => {
        list.appendChild(createAnswerEditorItem(ans, i));
    });

    initAnswerSortable(list);
    showToast('Posortowano po punktach (malejaco)', 'info');
}

// ===== MODAL POTWIERDZENIA =====
// ✅ Prosty callback - bez klonowania przycisków
let confirmCallback = null;

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    confirmCallback = null;
}

// ✅ Przycisk "Usuń" w modalu - jeden globalny listener ustawiony raz
document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
        if (confirmCallback) {
            confirmCallback();
            confirmCallback = null;
        }
        closeConfirmModal();
    });
});

// ===== KLAWISZE =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('questionModal').classList.contains('hidden')) {
            closeQuestionModal();
        } else if (!document.getElementById('confirmModal').classList.contains('hidden')) {
            closeConfirmModal();
        }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!document.getElementById('editorScreen').classList.contains('hidden')) {
            saveAll();
        }
    }
});

window.addEventListener('beforeunload', (e) => {
    if (unsaved) { e.preventDefault(); e.returnValue = ''; }
});

// ===== EKSPORT =====
window.verifyPin           = verifyPin;
window.addCategory         = addCategory;
window.updateCategoryInfo  = updateCategoryInfo;
window.addQuestion         = addQuestion;
window.saveQuestion        = saveQuestion;
window.closeQuestionModal  = closeQuestionModal;
window.addAnswer           = addAnswer;
window.sortAnswersByPoints = sortAnswersByPoints;
window.closeConfirmModal   = closeConfirmModal;
window.saveAll             = saveAll;
window.exportJSON          = exportJSON;
window.importJSON          = importJSON;
window.handleImport        = handleImport;