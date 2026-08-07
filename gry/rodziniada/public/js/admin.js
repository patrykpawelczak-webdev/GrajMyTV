(() => {
    const JULY_DAYS = 31;
    const SOLO_QUESTIONS_DRAFT_KEY = 'grajmytv:rodziniada-solo:questions-draft';
    const $ = id => document.getElementById(id);

    const els = {
        accessCheck: $('accessCheck'),
        adminPanel: $('adminPanel'),
        statusText: $('statusText'),
        saveState: $('saveState'),
        questionsTotal: $('questionsTotal'),
        calendarTotal: $('calendarTotal'),
        allQuestionsButton: $('allQuestionsButton'),
        adminContentPanel: $('adminContentPanel'),
        saveAllButton: $('saveAllButton'),
        visibleSaveAllButton: $('visibleSaveAllButton'),
        dayList: $('dayList'),
        calendarQuestionSelect: $('calendarQuestionSelect'),
        calendarPreview: $('calendarPreview'),
        selectedDayLabel: $('selectedDayLabel'),
        selectedDayTitle: $('selectedDayTitle'),
        fillCalendarButton: $('fillCalendarButton'),
        categoryList: $('categoryList'),
        questionList: $('questionList'),
        activeCategoryLabel: $('activeCategoryLabel'),
        addCategoryButton: $('addCategoryButton'),
        addQuestionButton: $('addQuestionButton'),
        questionForm: $('questionForm'),
        questionEmpty: $('questionEmpty'),
        questionFields: $('questionFields'),
        questionTextInput: $('questionTextInput'),
        answersForm: $('answersForm'),
        sortAnswersButton: $('sortAnswersButton'),
        deleteQuestionButton: $('deleteQuestionButton')
    };

    const state = {
        accessToken: '',
        data: { categories: [] },
        soloQuestionsData: { categories: [] },
        calendar: { startDate: '2026-07-19', days: [] },
        selectedDay: 1,
        activeCategoryId: null,
        activeQuestionId: null,
        activeSoloQuestionId: null,
        dirty: false
    };

    function generateId(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setStatus(message, type = 'info') {
        els.statusText.textContent = message;
        els.statusText.dataset.type = type;
    }

    function markDirty() {
        state.dirty = true;
        els.saveState.textContent = 'Niezapisane zmiany';
        els.saveState.style.color = 'var(--warning)';
    }

    function markSaved() {
        state.dirty = false;
        els.saveState.textContent = 'Zapisane';
        els.saveState.style.color = 'var(--success)';
    }

    function readSoloQuestionsDraft() {
        try {
            const rawDraft = localStorage.getItem(SOLO_QUESTIONS_DRAFT_KEY);
            if (!rawDraft) return null;
            const draft = JSON.parse(rawDraft);
            return Array.isArray(draft?.categories) ? draft : null;
        } catch {
            return null;
        }
    }

    function saveSoloQuestionsDraft() {
        try {
            localStorage.setItem(SOLO_QUESTIONS_DRAFT_KEY, JSON.stringify(state.soloQuestionsData));
            return true;
        } catch {
            return false;
        }
    }

    function flattenQuestions() {
        return state.data.categories.flatMap(category => {
            return (category.questions || []).map(question => ({
                ...question,
                categoryId: category.id,
                categoryName: category.name
            }));
        });
    }

    function flattenSoloQuestions() {
        return (state.soloQuestionsData.categories || []).flatMap(category => {
            return (category.questions || []).map(question => ({
                ...question,
                categoryId: category.id,
                categoryName: category.name
            }));
        });
    }

    function findSoloQuestion(questionId) {
        for (const category of state.soloQuestionsData.categories || []) {
            const question = (category.questions || []).find(item => item.id === questionId);
            if (question) {
                return { category, question };
            }
        }

        return null;
    }

    function moveSoloQuestionToCategory(questionId, targetCategoryId) {
        const source = findSoloQuestion(questionId);
        const targetCategory = (state.soloQuestionsData.categories || []).find(category => category.id === targetCategoryId);
        if (!source || !targetCategory || source.category.id === targetCategory.id) return source;

        source.category.questions = (source.category.questions || []).filter(question => question.id !== questionId);
        if (!Array.isArray(targetCategory.questions)) targetCategory.questions = [];
        targetCategory.questions.push(source.question);

        return { category: targetCategory, question: source.question };
    }

    function currentCategory() {
        return state.data.categories.find(category => category.id === state.activeCategoryId) || null;
    }

    function currentQuestion() {
        const category = currentCategory();
        if (!category) return null;
        return (category.questions || []).find(question => question.id === state.activeQuestionId) || null;
    }

    async function loadData() {
        const [questionsResponse, calendarResponse, soloQuestionsResponse] = await Promise.all([
            fetch('/rodziniada/api/questions', { cache: 'no-store' }),
            fetch('/rodziniada/api/solo-calendar', { cache: 'no-store' }),
            fetch('/rodziniada/api/solo-questions', { cache: 'no-store' })
        ]);

        state.data = await questionsResponse.json();
        state.calendar = await calendarResponse.json();
        state.soloQuestionsData = soloQuestionsResponse.ok
            ? await soloQuestionsResponse.json()
            : { categories: [] };

        if (!Array.isArray(state.soloQuestionsData.categories) || !state.soloQuestionsData.categories.length) {
            const fallbackResponse = await fetch('/rodziniada/rodziniada-solo-questions.json', { cache: 'no-store' }).catch(() => null);
            if (fallbackResponse?.ok) {
                state.soloQuestionsData = await fallbackResponse.json();
            }
        }

        const localDraft = readSoloQuestionsDraft();
        const hasLocalDraft = Boolean(localDraft);
        if (localDraft) {
            state.soloQuestionsData = localDraft;
        }

        if (!Array.isArray(state.data.categories)) state.data.categories = [];
        if (!Array.isArray(state.soloQuestionsData.categories)) state.soloQuestionsData.categories = [];
        if (!Array.isArray(state.calendar.days)) state.calendar.days = [];
        while (state.calendar.days.length < JULY_DAYS) state.calendar.days.push('');

        state.data.categories.forEach(category => {
            if (!category.id) category.id = generateId('cat');
            if (!Array.isArray(category.questions)) category.questions = [];
            category.questions.forEach(question => {
                if (!question.id) question.id = generateId('q');
                if (!Array.isArray(question.answers)) question.answers = [];
                question.answers.forEach(answer => {
                    if (!answer.id) answer.id = generateId('a');
                });
            });
        });

        state.activeCategoryId = state.data.categories[0]?.id || null;
        state.activeQuestionId = currentCategory()?.questions?.[0]?.id || null;
        renderAll();
        renderAllQuestionsPanel();
        if (hasLocalDraft) {
            markDirty();
            setStatus('Wczytano lokalny szkic pytań z przeglądarki.');
        } else {
            markSaved();
            setStatus('Dane załadowane.');
        }
    }

    async function saveAll() {
        applyQuestionForm(false);
        applySoloQuestionEditor();
        const authHeaders = {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${state.accessToken}`
        };

        const [questionsResponse, calendarResponse, soloQuestionsResponse] = await Promise.all([
            fetch('/rodziniada/api/questions', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(state.data)
            }),
            fetch('/rodziniada/api/solo-calendar', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(state.calendar)
            }),
            fetch('/rodziniada/api/solo-questions', {
                method: 'POST',
                headers: authHeaders,
                body: JSON.stringify(state.soloQuestionsData)
            })
        ]);

        const questionsResult = await questionsResponse.json();
        const calendarResult = await calendarResponse.json();
        const soloQuestionsResult = await soloQuestionsResponse.json();

        if (!questionsResult.ok || !calendarResult.ok || !soloQuestionsResult.ok) {
            setStatus(questionsResult.error || calendarResult.error || soloQuestionsResult.error || 'Nie udało się zapisać danych.', 'error');
            return;
        }

        localStorage.removeItem(SOLO_QUESTIONS_DRAFT_KEY);
        markSaved();
        setStatus('Zapisano panel admina.');
    }

    function renderAll() {
        renderStats();
        renderTabs();
        renderCalendar();
        renderCategories();
        renderQuestions();
        renderQuestionForm();
    }

    function renderStats() {
        els.questionsTotal.textContent = flattenQuestions().length;
        els.calendarTotal.textContent = state.calendar.days.filter(Boolean).length;
    }

    function renderAllQuestionsPanel() {
        if (!els.adminContentPanel) return;

        const questions = flattenSoloQuestions();
        if (!questions.length) {
            els.adminContentPanel.innerHTML = `
                <div class="admin-empty-content">
                    <strong class="admin-text-title">Brak pytań</strong>
                    <span class="admin-text-meta">Nowa baza pytań jest jeszcze pusta.</span>
                </div>
            `;
            return;
        }

        els.adminContentPanel.innerHTML = `
            <div class="admin-question-list">
                ${questions.map((question, index) => `
                    <button class="admin-question-card" type="button" data-solo-question-id="${escapeHtml(question.id)}">
                        <div class="admin-text-meta admin-question-number">#${index + 1}</div>
                        <div class="admin-question-main">
                            <span class="admin-text-kicker admin-question-category">${escapeHtml(question.categoryName || 'Bez kategorii')}</span>
                            <strong class="admin-text-title">${escapeHtml(question.text || 'Pytanie bez treści')}</strong>
                        </div>
                        <div class="admin-text-meta admin-question-meta">${(question.answers || []).length} odp.</div>
                    </button>
                `).join('')}
            </div>
        `;
    }

    function renderSoloQuestionEditor(questionId) {
        if (!els.adminContentPanel) return;

        const entry = findSoloQuestion(questionId);
        if (!entry) {
            renderAllQuestionsPanel();
            return;
        }

        state.activeSoloQuestionId = questionId;
        const { category, question } = entry;
        const answers = Array.isArray(question.answers) ? question.answers : [];
        const categories = state.soloQuestionsData.categories || [];

        els.adminContentPanel.innerHTML = `
            <form class="admin-question-editor" id="soloQuestionEditor">
                <div class="admin-editor-head">
                    <div class="admin-category-picker" data-category-picker>
                        <input type="hidden" name="categoryId" value="${escapeHtml(category.id)}">
                        <button class="admin-text-control admin-category-picker-button" type="button" data-category-picker-button aria-expanded="false">
                            <span>${escapeHtml(category.name || 'Bez kategorii')}</span>
                            <span class="admin-category-picker-arrow" aria-hidden="true"></span>
                        </button>
                        <div class="admin-category-picker-menu" data-category-picker-menu hidden>
                            ${categories.map(item => `
                                <button class="admin-text-control admin-category-picker-option ${item.id === category.id ? 'is-selected' : ''}" type="button" data-category-id="${escapeHtml(item.id)}">
                                    ${escapeHtml(item.name || 'Bez kategorii')}
                                </button>
                            `).join('')}
                        </div>
                    </div>
                    <button class="admin-text-control admin-question-save" type="button" id="saveSoloQuestionButton">Zapisz pytanie</button>
                </div>
                <label class="admin-editor-field">
                    <input class="admin-text-control" type="text" name="questionText" value="${escapeHtml(question.text || '')}" autocomplete="off">
                </label>
                <div class="admin-editor-answers">
                    ${answers.map((answer, index) => `
                        <div class="admin-editor-answer" data-answer-index="${index}">
                            <span class="admin-text-meta">${index + 1}</span>
                            <input class="admin-text-control" type="text" name="answerText" value="${escapeHtml(answer.text || '')}" autocomplete="off">
                            <input class="admin-text-control" type="number" name="answerPoints" value="${Number(answer.points || 0)}" min="0" max="100" inputmode="numeric">
                        </div>
                    `).join('')}
                </div>
            </form>
        `;
    }

    function applySoloQuestionEditor() {
        const form = document.getElementById('soloQuestionEditor');
        if (!form) return;

        const selectedCategoryId = form.elements.categoryId?.value;
        const entry = selectedCategoryId
            ? moveSoloQuestionToCategory(state.activeSoloQuestionId, selectedCategoryId)
            : findSoloQuestion(state.activeSoloQuestionId);
        if (!entry || !form) return;

        entry.question.text = form.elements.questionText.value.trim();
        [...form.querySelectorAll('.admin-editor-answer')].forEach(row => {
            const answer = entry.question.answers[Number(row.dataset.answerIndex)];
            if (!answer) return;
            answer.text = row.querySelector('[name="answerText"]').value.trim();
            answer.points = Number(row.querySelector('[name="answerPoints"]').value || 0);
        });
    }

    function closeCategoryPickers() {
        document.querySelectorAll('[data-category-picker]').forEach(picker => {
            picker.classList.remove('is-open');
            picker.querySelector('[data-category-picker-button]')?.setAttribute('aria-expanded', 'false');
            const menu = picker.querySelector('[data-category-picker-menu]');
            if (menu) menu.hidden = true;
        });
    }

    function renderTabs() {
        document.querySelectorAll('.admin-tab').forEach(button => {
            button.classList.toggle('is-active', !document.getElementById(`${button.dataset.tab}View`).classList.contains('is-hidden'));
        });
    }

    function renderCalendar() {
        const questions = flattenQuestions();
        els.dayList.innerHTML = Array.from({ length: JULY_DAYS }, (_, index) => {
            const day = index + 1;
            const questionId = state.calendar.days[index];
            const question = questions.find(item => item.id === questionId);
            return `
                <button type="button" class="day-item ${state.selectedDay === day ? 'is-active' : ''}" data-day="${day}">
                    <strong>#${day}</strong>
                    <span>${question ? question.text : 'Brak przypisanego pytania'}</span>
                    <span class="item-meta">${question ? question.categoryName : 'Nieuzupełnione'}</span>
                </button>
            `;
        }).join('');

        els.dayList.querySelectorAll('[data-day]').forEach(button => {
            button.addEventListener('click', () => {
                state.selectedDay = Number(button.dataset.day);
                renderCalendar();
            });
        });

        els.selectedDayLabel.textContent = `Dzień #${state.selectedDay}`;
        els.selectedDayTitle.textContent = `Wyzwanie z ${state.selectedDay} lipca 2026`;

        els.calendarQuestionSelect.innerHTML = [
            '<option value="">Brak pytania</option>',
            ...questions.map(question => `<option value="${question.id}">${question.categoryName} - ${question.text}</option>`)
        ].join('');
        els.calendarQuestionSelect.value = state.calendar.days[state.selectedDay - 1] || '';

        renderCalendarPreview();
    }

    function renderCalendarPreview() {
        const question = flattenQuestions().find(item => item.id === state.calendar.days[state.selectedDay - 1]);
        if (!question) {
            els.calendarPreview.innerHTML = '<p>Ten dzień nie ma jeszcze przypisanego pytania.</p>';
            return;
        }

        const answers = [...(question.answers || [])]
            .sort((a, b) => b.points - a.points)
            .slice(0, 6);

        els.calendarPreview.innerHTML = `
            <h3>${question.text}</h3>
            <ol>
                ${answers.map(answer => `<li>${answer.text} - <strong>${answer.points} pkt</strong></li>`).join('')}
            </ol>
        `;
    }

    function renderCategories() {
        els.categoryList.innerHTML = state.data.categories.map(category => `
            <button type="button" class="category-item ${category.id === state.activeCategoryId ? 'is-active' : ''}" data-category="${category.id}">
                <strong>${category.name || 'Bez nazwy'}</strong>
                <span class="item-meta">${(category.questions || []).length} pytań</span>
            </button>
        `).join('');

        els.categoryList.querySelectorAll('[data-category]').forEach(button => {
            button.addEventListener('click', () => {
                applyQuestionForm(true);
                state.activeCategoryId = button.dataset.category;
                state.activeQuestionId = currentCategory()?.questions?.[0]?.id || null;
                renderCategories();
                renderQuestions();
                renderQuestionForm();
            });
        });
    }

    function renderQuestions() {
        const category = currentCategory();
        els.activeCategoryLabel.textContent = category ? category.name : 'Brak kategorii';

        if (!category) {
            els.questionList.innerHTML = '<div class="empty-state">Dodaj kategorię, aby tworzyć pytania.</div>';
            return;
        }

        els.questionList.innerHTML = (category.questions || []).map(question => `
            <button type="button" class="question-item ${question.id === state.activeQuestionId ? 'is-active' : ''}" data-question="${question.id}">
                <strong>${question.text || 'Nowe pytanie'}</strong>
                <span class="item-meta">${(question.answers || []).length} odpowiedzi</span>
            </button>
        `).join('');

        els.questionList.querySelectorAll('[data-question]').forEach(button => {
            button.addEventListener('click', () => {
                applyQuestionForm(true);
                state.activeQuestionId = button.dataset.question;
                renderQuestions();
                renderQuestionForm();
            });
        });
    }

    function renderQuestionForm() {
        const question = currentQuestion();
        els.questionEmpty.classList.toggle('is-hidden', Boolean(question));
        els.questionFields.classList.toggle('is-hidden', !question);

        if (!question) return;

        els.questionTextInput.value = question.text || '';
        const answers = [...(question.answers || [])];
        while (answers.length < 6) answers.push({ id: generateId('a'), text: '', points: 0 });
        els.answersForm.innerHTML = answers.slice(0, 8).map((answer, index) => `
            <div class="answer-row" data-answer="${answer.id}">
                <input type="text" value="${escapeAttr(answer.text || '')}" placeholder="Odpowiedź ${index + 1}">
                <input type="number" min="0" max="100" value="${Number(answer.points) || 0}" aria-label="Punkty">
            </div>
        `).join('');
    }

    function escapeAttr(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    }

    function applyQuestionForm(shouldMarkDirty = true) {
        const question = currentQuestion();
        if (!question || els.questionFields.classList.contains('is-hidden')) return;

        question.text = els.questionTextInput.value.trim();
        question.answers = [...els.answersForm.querySelectorAll('.answer-row')]
            .map(row => {
                const [textInput, pointsInput] = row.querySelectorAll('input');
                return {
                    id: row.dataset.answer || generateId('a'),
                    text: textInput.value.trim().toUpperCase(),
                    points: Number(pointsInput.value) || 0
                };
            })
            .filter(answer => answer.text);

        if (shouldMarkDirty) {
            markDirty();
            renderQuestions();
            renderCalendar();
            setStatus('Zastosowano zmiany w pytaniu.');
        }
    }

    function addCategory() {
        applyQuestionForm(true);
        const category = { id: generateId('cat'), name: 'Nowa kategoria', icon: '', questions: [] };
        state.data.categories.push(category);
        state.activeCategoryId = category.id;
        state.activeQuestionId = null;
        markDirty();
        renderAll();
    }

    function addQuestion() {
        const category = currentCategory();
        if (!category) return;
        applyQuestionForm(true);
        const question = {
            id: generateId('q'),
            text: 'Nowe pytanie',
            answers: Array.from({ length: 6 }, (_, index) => ({ id: generateId('a'), text: `ODPOWIEDŹ ${index + 1}`, points: 0 }))
        };
        category.questions.push(question);
        state.activeQuestionId = question.id;
        markDirty();
        renderAll();
    }

    function deleteQuestion() {
        const category = currentCategory();
        const question = currentQuestion();
        if (!category || !question) return;

        const usedDays = state.calendar.days
            .map((id, index) => id === question.id ? index + 1 : null)
            .filter(Boolean);

        if (usedDays.length) {
            setStatus(`Nie można usunąć pytania, bo jest w kalendarzu: ${usedDays.map(day => `#${day}`).join(', ')}.`, 'error');
            return;
        }

        category.questions = category.questions.filter(item => item.id !== question.id);
        state.activeQuestionId = category.questions[0]?.id || null;
        markDirty();
        renderAll();
    }

    function fillCalendar() {
        const questions = flattenQuestions();
        for (let i = 0; i < JULY_DAYS; i += 1) {
            if (!state.calendar.days[i] && questions[i]) {
                state.calendar.days[i] = questions[i].id;
            }
        }
        markDirty();
        renderAll();
        setStatus('Uzupełniono puste dni pierwszymi dostępnymi pytaniami.');
    }

    async function openAdminPanel(accessToken = '') {
        state.accessToken = accessToken;
        els.accessCheck?.classList.add('is-hidden');
        els.adminPanel.classList.remove('is-hidden');
        await loadData();
    }

    function returnToPreviousPage() {
        window.location.replace('/rodziniada/solo');
    }

    async function authorizeAdminFromAccount() {
        if (!window.GrajMyTVAuth?.init) {
            returnToPreviousPage();
            return;
        }

        const authState = await window.GrajMyTVAuth.init().catch(() => null);
        if (!authState?.enabled || !authState.isLoggedIn) {
            returnToPreviousPage();
            return;
        }

        if (authState.profile?.role !== 'admin') {
            returnToPreviousPage();
            return;
        }

        const accessToken = await window.GrajMyTVAuth.getAccessToken().catch(() => '');
        if (!accessToken) {
            returnToPreviousPage();
            return;
        }

        await openAdminPanel(accessToken);
    }

    authorizeAdminFromAccount();

    document.querySelectorAll('.admin-tab').forEach(button => {
        button.addEventListener('click', () => {
            const tab = button.dataset.tab;
            document.querySelectorAll('.tab-view').forEach(view => view.classList.add('is-hidden'));
            document.getElementById(`${tab}View`).classList.remove('is-hidden');
            renderTabs();
        });
    });

    els.calendarQuestionSelect.addEventListener('change', () => {
        state.calendar.days[state.selectedDay - 1] = els.calendarQuestionSelect.value;
        markDirty();
        renderCalendar();
    });

    els.saveAllButton.addEventListener('click', saveAll);
    els.allQuestionsButton?.addEventListener('click', () => {
        applySoloQuestionEditor();
        state.activeSoloQuestionId = null;
        document.querySelectorAll('.admin-action-button').forEach(button => {
            button.classList.toggle('is-active', button === els.allQuestionsButton);
        });
        renderAllQuestionsPanel();
    });
    els.adminContentPanel?.addEventListener('click', event => {
        const pickerButton = event.target.closest('[data-category-picker-button]');
        if (pickerButton) {
            const picker = pickerButton.closest('[data-category-picker]');
            const menu = picker?.querySelector('[data-category-picker-menu]');
            const willOpen = !picker?.classList.contains('is-open');
            closeCategoryPickers();
            if (picker && menu && willOpen) {
                picker.classList.add('is-open');
                pickerButton.setAttribute('aria-expanded', 'true');
                menu.hidden = false;
            }
            return;
        }

        const pickerOption = event.target.closest('[data-category-id]');
        if (pickerOption) {
            const picker = pickerOption.closest('[data-category-picker]');
            const input = picker?.querySelector('[name="categoryId"]');
            const label = picker?.querySelector('[data-category-picker-button] span:first-child');
            if (input) input.value = pickerOption.dataset.categoryId;
            if (label) label.textContent = pickerOption.textContent.trim();
            picker?.querySelectorAll('[data-category-id]').forEach(option => {
                option.classList.toggle('is-selected', option === pickerOption);
            });
            closeCategoryPickers();
            applySoloQuestionEditor();
            markDirty();
            return;
        }

        const questionButton = event.target.closest('[data-solo-question-id]');
        if (questionButton) {
            renderSoloQuestionEditor(questionButton.dataset.soloQuestionId);
            return;
        }

        if (event.target.closest('#backToQuestionsButton')) {
            applySoloQuestionEditor();
            state.activeSoloQuestionId = null;
            renderAllQuestionsPanel();
        }

        if (event.target.closest('#saveSoloQuestionButton')) {
            applySoloQuestionEditor();
            if (saveSoloQuestionsDraft()) {
                markDirty();
                state.activeSoloQuestionId = null;
                renderAllQuestionsPanel();
                setStatus('Pytanie zapisane lokalnie w przeglądarce.');
            } else {
                setStatus('Nie udało się zapisać pytania lokalnie w przeglądarce.', 'error');
            }
        }
    });
    els.adminContentPanel?.addEventListener('input', event => {
        if (!event.target.closest('#soloQuestionEditor')) return;
        applySoloQuestionEditor();
        markDirty();
    });
    els.adminContentPanel?.addEventListener('change', event => {
        if (!event.target.closest('#soloQuestionEditor')) return;
        applySoloQuestionEditor();
        markDirty();
    });
    els.adminContentPanel?.addEventListener('submit', event => {
        if (!event.target.closest('#soloQuestionEditor')) return;
        event.preventDefault();
        applySoloQuestionEditor();
        markDirty();
    });
    els.visibleSaveAllButton?.addEventListener('click', saveAll);
    els.fillCalendarButton.addEventListener('click', fillCalendar);
    els.addCategoryButton.addEventListener('click', addCategory);
    els.addQuestionButton.addEventListener('click', addQuestion);
    els.deleteQuestionButton.addEventListener('click', deleteQuestion);
    els.questionForm.addEventListener('submit', event => {
        event.preventDefault();
        applyQuestionForm(true);
    });
    els.sortAnswersButton.addEventListener('click', () => {
        const question = currentQuestion();
        if (!question) return;
        applyQuestionForm(false);
        question.answers.sort((a, b) => b.points - a.points);
        markDirty();
        renderQuestionForm();
    });

    window.addEventListener('beforeunload', event => {
        if (!state.dirty) return;
        event.preventDefault();
        event.returnValue = '';
    });

    document.addEventListener('click', event => {
        if (event.target.closest('[data-category-picker]')) return;
        closeCategoryPickers();
    });
})();
