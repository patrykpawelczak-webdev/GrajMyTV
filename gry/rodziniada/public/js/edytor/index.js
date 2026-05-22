import { state, markUnsaved, getActiveCategory } from './state.js';
import { generateId } from './utils.js';
import * as api from './api.js';
import * as ui from './ui.js';

document.addEventListener('DOMContentLoaded', () => {
    setupPinInputs();
    
    document.getElementById('questionModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('questionModal')) ui.closeQuestionModal();
    });
    
    document.getElementById('confirmModal').addEventListener('click', (e) => {
        if (e.target === document.getElementById('confirmModal')) closeConfirmModal();
    });

    document.getElementById('confirmDeleteBtn').addEventListener('click', () => {
        if (state.confirmCallback) {
            state.confirmCallback();
            state.confirmCallback = null;
        }
        closeConfirmModal();
    });
});

// ===== PIN =====
function setupPinInputs() {
    const inputs = document.querySelectorAll('.pin-digit');
    inputs.forEach((input, index) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(-1);
            if (input.value && index < inputs.length - 1) inputs[index + 1].focus();
            if ([...inputs].every(i => i.value.length === 1)) verifyPin();
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
            [...pasted].forEach((char, i) => { if (inputs[index + i]) inputs[index + i].value = char; });
            const nextEmpty = [...inputs].findIndex(i => !i.value);
            if (nextEmpty !== -1) inputs[nextEmpty].focus(); else inputs[inputs.length - 1].focus();
            if ([...inputs].every(i => i.value.length === 1)) setTimeout(verifyPin, 100);
        });
    });
    setTimeout(() => inputs[0]?.focus(), 100);
}

async function verifyPin() {
    const inputs = document.querySelectorAll('.pin-digit');
    const pin = [...inputs].map(i => i.value).join('');
    if (pin.length < 4) { showPinError('Wpisz 4 cyfry'); return; }

    const json = await api.verifyPin(pin);
    if (json.ok) {
        state.currentPin = pin;
        document.getElementById('pinScreen').style.display = 'none';
        document.getElementById('editorScreen').classList.remove('hidden');
        if (await api.loadData(ui.showToast)) {
            ui.renderCategories(selectCategory);
            ui.updateStats();
        }
    } else {
        showPinError('Nieprawidłowy PIN');
        inputs.forEach(i => { i.value = ''; i.classList.add('error'); });
        setTimeout(() => { inputs.forEach(i => i.classList.remove('error')); inputs[0].focus(); }, 600);
    }
}

function showPinError(msg) {
    const el = document.getElementById('pinError');
    if (el) { el.textContent = msg; setTimeout(() => { el.textContent = ''; }, 3000); }
}

// ===== LOGIKA EDYCJI =====
function selectCategory(catId) {
    state.activeCatId = catId;
    ui.renderCategories(selectCategory);
    const cat = getActiveCategory();
    if (!cat) return;
    ui.showCategoryEditor(cat);
    ui.renderQuestions(editQuestion, confirmDeleteQuestion);
}

function editQuestion(index) {
    state.editingQIndex = index;
    const cat = getActiveCategory();
    if (!cat) return;
    ui.openQuestionModal(JSON.parse(JSON.stringify(cat.questions[index])), false);
}

function confirmDeleteQuestion(index) {
    const cat = getActiveCategory();
    if (!cat) return;
    const q = cat.questions[index];
    state.confirmCallback = () => {
        cat.questions.splice(index, 1);
        ui.renderQuestions(editQuestion, confirmDeleteQuestion);
        ui.updateStats();
        markUnsaved();
        ui.showToast('Pytanie usunięte', 'info');
    };
    document.getElementById('confirmMessage').textContent = 'Czy na pewno chcesz usunąć pytanie: "' + (q.text || '') + '"?';
    document.getElementById('confirmModal').classList.remove('hidden');
}

function closeConfirmModal() {
    document.getElementById('confirmModal').classList.add('hidden');
    state.confirmCallback = null;
}

// ===== EKSPORT DO WINDOW (DLA ONCLICK) =====
window.verifyPin = verifyPin;
window.closeConfirmModal = closeConfirmModal;
window.saveAll = () => api.saveAll(ui.showToast);

window.addCategory = () => {
    const newCat = { id: generateId(), name: 'Nowa kategoria', icon: '?', questions: [] };
    state.data.categories.push(newCat);
    ui.renderCategories(selectCategory);
    ui.updateStats();
    markUnsaved();
    selectCategory(newCat.id);
    setTimeout(() => document.getElementById('catName')?.focus(), 100);
};

window.updateCategoryInfo = () => {
    const cat = getActiveCategory();
    if (!cat) return;
    const name = document.getElementById('catName').value.trim();
    if (!name) { ui.showToast('Nazwa kategorii nie może być pusta!', 'error'); return; }
    cat.icon = document.getElementById('catIcon').value.trim() || '?';
    cat.name = name;
    ui.renderCategories(selectCategory);
    markUnsaved();
    ui.showToast('Kategoria zaktualizowana', 'success');
};

window.addQuestion = () => {
    state.editingQIndex = -1;
    ui.openQuestionModal({ id: generateId(), text: '', answers: [] }, true);
};

window.saveQuestion = () => {
    const q = ui.getCurrentEditingQuestion();
    if (!q) return;
    const text = document.getElementById('questionText').value.trim();
    if (!text) { ui.showToast('Treść pytania nie może być pusta!', 'error'); return; }

    const answerItems = document.querySelectorAll('.answer-editor-item');
    const answers = [];
    let hasError = false;

    answerItems.forEach(item => {
        const txtInp = item.querySelector('.ans-text-input');
        const ptsInp = item.querySelector('.ans-points-input');
        const txt = txtInp.value.trim();
        const pts = parseInt(ptsInp.value);
        if (!txt || isNaN(pts)) {
            if (!txt) txtInp.style.borderColor = 'var(--red)';
            if (isNaN(pts)) ptsInp.style.borderColor = 'var(--red)';
            hasError = true;
        } else {
            answers.push({ id: item.dataset.id || generateId(), text: txt, points: pts });
        }
    });

    if (hasError) { ui.showToast('Popraw błędy w odpowiedziach!', 'error'); return; }
    if (answers.length === 0) { ui.showToast('Dodaj co najmniej jedną odpowiedź!', 'error'); return; }

    q.text = text;
    q.answers = answers;
    const cat = getActiveCategory();
    if (!cat) return;

    if (state.editingQIndex === -1) cat.questions.push(q);
    else cat.questions[state.editingQIndex] = q;

    ui.renderQuestions(editQuestion, confirmDeleteQuestion);
    ui.updateStats();
    markUnsaved();
    ui.closeQuestionModal();
    ui.showToast(state.editingQIndex === -1 ? 'Pytanie dodane!' : 'Pytanie zaktualizowane!', 'success');
};

window.closeQuestionModal = ui.closeQuestionModal;
window.addAnswer = ui.addAnswerUI;
window.sortAnswersByPoints = ui.sortAnswersByPointsUI;

window.exportJSON = () => {
    const blob = new Blob([JSON.stringify(state.data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rodziniada_pytania_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.showToast('Wyeksportowano plik JSON', 'success');
};

window.importJSON = () => document.getElementById('importInput').click();

window.handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (!imported.categories || !Array.isArray(imported.categories)) {
                ui.showToast('Nieprawidłowy format pliku!', 'error'); return;
            }
            imported.categories.forEach(cat => {
                if (!cat.id) cat.id = generateId();
                cat.questions.forEach(q => {
                    if (!q.id) q.id = generateId();
                    q.answers.forEach(a => { if (!a.id) a.id = generateId(); });
                });
            });
            state.data = imported;
            state.activeCatId = null;
            ui.renderCategories(selectCategory);
            ui.showContentEmpty();
            ui.updateStats();
            markUnsaved();
            ui.showToast('Zaimportowano: ' + imported.categories.length + ' kategorii', 'success');
        } catch (err) { ui.showToast('Błąd parsowania pliku JSON!', 'error'); }
    };
    reader.readAsText(file);
    event.target.value = '';
};

// ===== KLAWISZE =====
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (!document.getElementById('questionModal').classList.contains('hidden')) ui.closeQuestionModal();
        else if (!document.getElementById('confirmModal').classList.contains('hidden')) closeConfirmModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (!document.getElementById('editorScreen').classList.contains('hidden')) api.saveAll(ui.showToast);
    }
});

window.addEventListener('beforeunload', (e) => {
    if (state.unsaved) { e.preventDefault(); e.returnValue = ''; }
});

// ===== SUCHAR / JOKES ACTIONS =====
function selectJoke(jokeId) {
    state.activeJokeId = jokeId;
    ui.renderJokes(selectJoke);
}

window.deleteActiveJoke = () => {
    if (!state.activeJokeId) return;
    ui.confirmDeleteJoke(state.activeJokeId, (jokeId) => {
        if (state.jokesData && Array.isArray(state.jokesData.jokes)) {
            state.jokesData.jokes = state.jokesData.jokes.filter(j => j.id !== jokeId);
        }
        state.activeJokeId = null;
        ui.renderJokes(selectJoke);
        markUnsaved();
    });
};

window.switchEditorTab = (tab) => {
    state.activeTab = tab;
    document.getElementById('tabQuestions').classList.toggle('active', tab === 'questions');
    document.getElementById('tabJokes').classList.toggle('active', tab === 'jokes');
    document.getElementById('questionsLayout').classList.toggle('hidden', tab !== 'questions');
    document.getElementById('jokesLayout').classList.toggle('hidden', tab !== 'jokes');

    if (tab === 'jokes') {
        ui.renderJokes(selectJoke);
    }
};

window.addJoke = () => {
    if (!state.jokesData) state.jokesData = { jokes: [] };
    if (!Array.isArray(state.jokesData.jokes)) state.jokesData.jokes = [];
    
    const newJoke = {
        id: generateId(),
        text: ''
    };
    state.jokesData.jokes.push(newJoke);
    state.activeJokeId = newJoke.id;
    ui.renderJokes(selectJoke);
    markUnsaved();
    
    setTimeout(() => {
        document.getElementById('activeJokeTextarea')?.focus();
    }, 100);
};
