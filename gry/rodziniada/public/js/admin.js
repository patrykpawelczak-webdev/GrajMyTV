(() => {
    const JULY_DAYS = 31;
    const $ = id => document.getElementById(id);

    const els = {
        pinScreen: $('pinScreen'),
        adminPanel: $('adminPanel'),
        pinForm: $('pinForm'),
        pinInput: $('pinInput'),
        pinError: $('pinError'),
        statusText: $('statusText'),
        saveState: $('saveState'),
        questionsTotal: $('questionsTotal'),
        calendarTotal: $('calendarTotal'),
        saveAllButton: $('saveAllButton'),
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

    const pinDigits = [...document.querySelectorAll('.pin-digit')];

    const state = {
        pin: '',
        data: { categories: [] },
        calendar: { startDate: '2026-07-01', days: [] },
        selectedDay: 1,
        activeCategoryId: null,
        activeQuestionId: null,
        dirty: false
    };

    function generateId(prefix = 'id') {
        return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
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

    function flattenQuestions() {
        return state.data.categories.flatMap(category => {
            return (category.questions || []).map(question => ({
                ...question,
                categoryId: category.id,
                categoryName: category.name
            }));
        });
    }

    function currentCategory() {
        return state.data.categories.find(category => category.id === state.activeCategoryId) || null;
    }

    function currentQuestion() {
        const category = currentCategory();
        if (!category) return null;
        return (category.questions || []).find(question => question.id === state.activeQuestionId) || null;
    }

    async function verifyPin(pin) {
        const response = await fetch('/rodziniada/api/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        return response.json();
    }

    async function loadData() {
        const [questionsResponse, calendarResponse] = await Promise.all([
            fetch('/rodziniada/api/questions', { cache: 'no-store' }),
            fetch('/rodziniada/api/solo-calendar', { cache: 'no-store' })
        ]);

        state.data = await questionsResponse.json();
        state.calendar = await calendarResponse.json();

        if (!Array.isArray(state.data.categories)) state.data.categories = [];
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
        markSaved();
        setStatus('Dane załadowane.');
    }

    async function saveAll() {
        applyQuestionForm(false);

        const [questionsResponse, calendarResponse] = await Promise.all([
            fetch('/rodziniada/api/questions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-PIN': state.pin },
                body: JSON.stringify(state.data)
            }),
            fetch('/rodziniada/api/solo-calendar', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'X-PIN': state.pin },
                body: JSON.stringify(state.calendar)
            })
        ]);

        const questionsResult = await questionsResponse.json();
        const calendarResult = await calendarResponse.json();

        if (!questionsResult.ok || !calendarResult.ok) {
            setStatus(questionsResult.error || calendarResult.error || 'Nie udało się zapisać danych.', 'error');
            return;
        }

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

    function clearPinDigits() {
        pinDigits.forEach(input => {
            input.value = '';
            input.classList.remove('is-filled');
        });
        els.pinInput.value = '';
    }

    els.pinForm.addEventListener('submit', async event => {
        event.preventDefault();
        const pin = pinDigits.map(input => input.value).join('');
        els.pinInput.value = pin;
        if (pin.length !== 4) {
            els.pinError.textContent = 'Wpisz 4 cyfry PIN-u.';
            return;
        }

        const result = await verifyPin(pin);
        if (!result.ok) {
            els.pinError.textContent = 'Nieprawidłowy PIN.';
            return;
        }

        state.pin = pin;
        clearPinDigits();
        els.pinScreen.classList.add('is-hidden');
        els.adminPanel.classList.remove('is-hidden');
        await loadData();
    });

    pinDigits.forEach((input, index) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(-1);
            input.classList.toggle('is-filled', Boolean(input.value));
            els.pinError.textContent = '';

            if (input.value && index < pinDigits.length - 1) {
                pinDigits[index + 1].focus();
            }

            if (pinDigits.every(item => item.value)) {
                els.pinForm.requestSubmit();
            }
        });

        input.addEventListener('keydown', event => {
            if (event.key === 'Backspace' && !input.value && index > 0) {
                pinDigits[index - 1].focus();
                pinDigits[index - 1].value = '';
                pinDigits[index - 1].classList.remove('is-filled');
            }
        });

        input.addEventListener('paste', event => {
            event.preventDefault();
            const pasted = event.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
            pinDigits.forEach((digit, digitIndex) => {
                digit.value = pasted[digitIndex] || '';
                digit.classList.toggle('is-filled', Boolean(digit.value));
            });

            const nextEmpty = pinDigits.find(inputItem => !inputItem.value);
            (nextEmpty || pinDigits[pinDigits.length - 1]).focus();
            if (pinDigits.every(item => item.value)) {
                els.pinForm.requestSubmit();
            }
        });
    });

    pinDigits[0]?.focus();

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
})();
