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
        categoriesButton: $('categoriesButton'),
        importButton: $('importButton'),
        exportButton: $('exportButton'),
        importFileInput: $('importFileInput'),
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
        deleteQuestionButton: $('deleteQuestionButton'),
        addCategoryModalOverlay: $('addCategoryModalOverlay'),
        addCategoryNameInput: $('addCategoryNameInput'),
        addCategoryQuestionsList: $('addCategoryQuestionsList'),
        addCategoryCancelBtn: $('addCategoryCancelBtn'),
        addCategoryConfirmBtn: $('addCategoryConfirmBtn'),
        editQuestionModalOverlay: $('editQuestionModalOverlay'),
        editQuestionModalBody: $('editQuestionModalBody'),
        editQuestionCloseBtn: $('editQuestionCloseBtn'),
        editQuestionSaveBtn: $('editQuestionSaveBtn')
    };

    const COMMON_ALIASES = {
        auto: ['samochod', 'samochodem', 'auta', 'autem'],
        samochod: ['auto', 'auta', 'autem'],
        telefon: ['komorka', 'komorke', 'smartfon', 'smartfona', 'telefon komorkowy'],
        telewizor: ['tv', 'telewizja'],
        pieniadze: ['kasa', 'hajs', 'gotowka'],
        praca: ['robota'],
        sklep: ['zakupy', 'market'],
        dom: ['mieszkanie', 'chata'],
        internet: ['net', 'sieci'],
        wakacje: ['urlop'],
        jedzenie: ['posilek', 'obiad'],
        mama: ['matka'],
        tata: ['ojciec']
    };

    const SHORT_WORDS = new Set(['i', 'w', 'we', 'z', 'ze', 'na', 'do', 'od', 'po', 'za', 'u', 'o', 'a']);

    function normalize(value) {
        return value
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/\u0142/g, 'l')
            .replace(/[^a-z0-9\s]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    window.autoFillVariants = function(input) {
        const variantsInput = input.closest('.admin-editor-answer').querySelector('[name="answerVariants"]');
        if (!variantsInput || variantsInput.value.trim() !== '') return;

        const text = input.value.trim();
        if (!text) return;

        const variants = new Set();
        const base = normalize(text);
        if (!base) return;

        base.split(/\s+\/\s+|\/|,|;|\s+albo\s+|\s+lub\s+/).forEach(part => {
            const normalized = normalize(part);
            if (normalized.length >= 2) variants.add(normalized);
        });

        const words = base.split(' ').filter(word => word.length >= 3 && !SHORT_WORDS.has(word));
        words.forEach(word => {
            variants.add(word);
            (COMMON_ALIASES[word] || []).forEach(alias => variants.add(normalize(alias)));
        });

        Object.entries(COMMON_ALIASES).forEach(([word, aliases]) => {
            if (base.includes(word)) {
                aliases.forEach(alias => variants.add(normalize(alias)));
            }
        });

        variantsInput.value = Array.from(variants).join(', ');
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
        const toastContainer = $('toastContainer');
        if (!toastContainer) return;
        
        const toast = document.createElement('div');
        toast.className = 'toast-message';
        if (type === 'error') {
            toast.style.borderLeftColor = 'var(--danger)';
        } else if (type === 'success') {
            toast.style.borderLeftColor = 'var(--success)';
        } else if (type === 'warning') {
            toast.style.borderLeftColor = 'var(--warning)';
        }
        
        toast.textContent = message;
        toastContainer.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            toast.style.transition = 'all 0.3s ease-out';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
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
            const fallbackResponse = await fetch('/rodziniada-solo-questions.json', { cache: 'no-store' }).catch(() => null);
            if (fallbackResponse?.ok) {
                state.soloQuestionsData = await fallbackResponse.json();
            }
        }

        // Zawsze ładuj oficjalny plik, ignorując ewentualny lokalny draft
        const localDraft = readSoloQuestionsDraft();
        const hasLocalDraft = Boolean(localDraft);
        // if (localDraft) {
        //     state.soloQuestionsData = localDraft;
        // }

        if (hasLocalDraft) {
            markDirty();
            // setStatus usunięty zgodnie z życzeniem
        } else {
            markSaved();
        }
        
        if (!Array.isArray(state.data.categories)) state.data.categories = [];
        if (!Array.isArray(state.soloQuestionsData.categories)) state.soloQuestionsData.categories = [];
        
        let bezKategorii = state.soloQuestionsData.categories.find(c => c.name.trim().toLowerCase() === 'bez kategorii');
        if (!bezKategorii) {
            bezKategorii = { id: generateId('c'), name: 'Bez kategorii', questions: [] };
            state.soloQuestionsData.categories.unshift(bezKategorii);
        }

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
        setStatus('Zapisano.', 'success');
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

        const categories = state.soloQuestionsData.categories || [];
        let html = `
            <div style="margin-bottom: 2rem;">
                <button class="admin-add-category-btn" type="button" id="addNewQuestionBtn">
                    + Dodaj nowe pytanie
                </button>
            </div>
        `;
        let hasAnyQuestions = false;
        let globalQuestionIndex = 0;

        categories.forEach(category => {
            const qs = category.questions || [];
            if (qs.length > 0) hasAnyQuestions = true;

            html += `
                <div class="admin-category-group">
                    <div class="admin-category-heading">${escapeHtml(category.name || 'Bez kategorii')}</div>
                    <div class="admin-question-list">
                        ${qs.length ? qs.map(question => {
                            const qHtml = `
                                <div class="admin-question-card" data-solo-question-id="${escapeHtml(question.id)}">
                                    <div class="admin-text-meta admin-question-number">#${globalQuestionIndex + 1}</div>
                                    <div class="admin-question-main">
                                        <strong class="admin-text-title">${escapeHtml(question.text || 'Pytanie bez treści')}</strong>
                                    </div>
                                    <div class="admin-text-meta admin-question-meta">${(question.answers || []).length} odp.</div>
                                    <button class="admin-btn-delete admin-btn-delete-question" type="button" data-delete-question="${escapeHtml(question.id)}" aria-label="Usuń pytanie">Usuń</button>
                                </div>
                            `;
                            globalQuestionIndex++;
                            return qHtml;
                        }).join('') : '<span class="admin-text-meta" style="padding-left: 0.5rem; opacity: 0.7;">Brak pytań w tej kategorii.</span>'}
                    </div>
                </div>
            `;
        });

        if (!categories.length) {
            html += `
                <div class="admin-empty-content">
                    <strong class="admin-text-title">Brak pytań</strong>
                    <span class="admin-text-meta">Nowa baza pytań jest jeszcze pusta.</span>
                </div>
            `;
        }

        els.adminContentPanel.innerHTML = html;
    }

    function renderCategoriesPanel() {
        if (!els.adminContentPanel) return;

        const categories = (state.soloQuestionsData.categories || []).filter(c => c.name.trim().toLowerCase() !== 'bez kategorii');

        els.adminContentPanel.innerHTML = `
            <div class="admin-categories-view">
                <div style="margin-bottom: 2rem;">
                    <button class="admin-add-category-btn" type="button" id="addNewCategoryBtn">
                        + Dodaj nową kategorię
                    </button>
                </div>
                ${categories.map(category => `
                    <div class="admin-category-card" data-admin-category-id="${escapeHtml(category.id)}">
                        <div class="admin-category-view-mode" style="display: contents;">
                            <strong class="admin-category-name" style="font-size: 1.1rem; color: #fff;">${escapeHtml(category.name)}</strong>
                            <span class="admin-category-stats">${(category.questions || []).length} pytań</span>
                            <div style="display: flex; gap: 0.5rem;">
                                <button class="admin-btn-edit" type="button" data-edit-category="${escapeHtml(category.id)}">Edytuj</button>
                                <button class="admin-btn-delete" type="button" data-delete-category="${escapeHtml(category.id)}">Usuń</button>
                            </div>
                        </div>
                        <div class="admin-category-edit-mode is-hidden" style="display: flex; width: 100%; gap: 0.5rem; grid-column: 1 / -1; align-items: center;">
                            <input type="text" class="admin-category-input" value="${escapeAttr(category.name)}" placeholder="Nazwa kategorii" style="flex: 1;" data-original-name="${escapeAttr(category.name)}">
                            <button class="admin-text-control admin-action-button is-primary" type="button" data-save-category-name="${escapeHtml(category.id)}" style="min-height: 2.2rem; font-size: 0.8rem; padding: 0 0.75rem;">Zapisz</button>
                            <button class="admin-text-control admin-action-button" type="button" data-cancel-edit-category="${escapeHtml(category.id)}" style="min-height: 2.2rem; font-size: 0.8rem; padding: 0 0.75rem;">Anuluj</button>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;
    }

    function renderSoloQuestionEditor(questionId) {
        const entry = findSoloQuestion(questionId);
        if (!entry) return;

        state.activeSoloQuestionId = questionId;
        const { category, question } = entry;
        const answers = Array.isArray(question.answers) ? question.answers : [];
        const categories = state.soloQuestionsData.categories || [];

        els.editQuestionModalBody.innerHTML = `
            <form class="admin-question-editor" id="soloQuestionEditor">
                <div class="admin-editor-head" style="margin-bottom: 1rem;">
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
                </div>
                <label class="admin-editor-field">
                    <input class="admin-text-control" type="text" name="questionText" value="${escapeHtml(question.text || '')}" autocomplete="off" placeholder="Treść pytania" style="font-size: 1.15rem; padding: 0.85rem 1rem; border-radius: 0.75rem;">
                </label>
                <div class="admin-editor-answers" style="margin-top: 0.75rem;">
                    ${answers.map((answer, index) => `
                        <div class="admin-editor-answer" data-answer-index="${index}">
                            <span class="admin-text-meta" style="font-size: 1rem;">${index + 1}</span>
                            <input class="admin-text-control" type="text" name="answerText" value="${escapeHtml(answer.text || '')}" autocomplete="off" placeholder="Odpowiedź" onblur="window.autoFillVariants(this)">
                            <input class="admin-text-control" type="number" name="answerPoints" value="${Number(answer.points || 0)}" min="0" max="100" inputmode="numeric">
                            <input class="admin-text-control answer-variants-input" type="text" name="answerVariants" value="${escapeHtml((answer.variants || []).join(', '))}" autocomplete="off" placeholder="Warianty (po przecinku)">
                        </div>
                    `).join('')}
                </div>
            </form>
        `;
        
        els.editQuestionModalOverlay.classList.remove('is-hidden');
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
            
            const variantsRaw = row.querySelector('[name="answerVariants"]')?.value || '';
            const variants = variantsRaw.split(',')
                .map(v => v.trim())
                .filter(v => v.length > 0);
                
            if (variants.length > 0) {
                answer.variants = variants;
            } else {
                delete answer.variants;
            }
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

    let currentCalendarViewDate = null;
    let isCalendarInitialized = false;
    const miesiace = ['Styczeń', 'Luty', 'Marzec', 'Kwiecień', 'Maj', 'Czerwiec', 'Lipiec', 'Sierpień', 'Wrzesień', 'Październik', 'Listopad', 'Grudzień'];

    function getDaysInMonth(year, month) {
        return new Date(year, month + 1, 0).getDate();
    }

    function getFirstDayOfMonth(year, month) {
        let day = new Date(year, month, 1).getDay();
        return day === 0 ? 6 : day - 1; // Pn = 0, Nd = 6
    }

    function parseLocalDate(dateStr) {
        const [y, m, d] = dateStr.split('-');
        return new Date(y, m - 1, d);
    }

    function getDiffDays(date1, date2) {
        const utc1 = Date.UTC(date1.getFullYear(), date1.getMonth(), date1.getDate());
        const utc2 = Date.UTC(date2.getFullYear(), date2.getMonth(), date2.getDate());
        return Math.floor((utc1 - utc2) / 86400000);
    }

    function renderCalendar() {
        const startDateObj = parseLocalDate(state.calendar.startDate);
        const today = new Date();

        if (!isCalendarInitialized) {
            isCalendarInitialized = true;
            currentCalendarViewDate = new Date(); // start in current month
            currentCalendarViewDate.setDate(1);
            
            // set selectedDay to today
            state.selectedDay = getDiffDays(today, startDateObj);
        }

        const year = currentCalendarViewDate.getFullYear();
        const month = currentCalendarViewDate.getMonth();
        
        const grid = $('calendarGrid');
        if (!grid) return;

        $('calendarCurrentMonthLabel').textContent = `${miesiace[month]} ${year}`;
        
        const prevBtn = $('calendarPrevMonthBtn');
        if (prevBtn) {
            if (year < 2026 || (year === 2026 && month <= 6)) {
                prevBtn.style.visibility = 'hidden';
            } else {
                prevBtn.style.visibility = 'visible';
            }
        }

        const nextBtn = $('calendarNextMonthBtn');
        if (nextBtn) {
            const limitDate = new Date();
            const maxYear = limitDate.getFullYear() + 1;
            const maxMonth = limitDate.getMonth();
            if (year > maxYear || (year === maxYear && month >= maxMonth)) {
                nextBtn.style.visibility = 'hidden';
            } else {
                nextBtn.style.visibility = 'visible';
            }
        }

        const daysInMonth = getDaysInMonth(year, month);
        const firstDay = getFirstDayOfMonth(year, month);
        
        let html = ``;

        for (let i = 0; i < firstDay; i++) {
            html += `<div class="admin-calendar-day" style="visibility: hidden"></div>`;
        }

        const soloQuestions = flattenSoloQuestions();

        for (let day = 1; day <= daysInMonth; day++) {
            const currentDate = new Date(year, month, day);
            const diffDays = getDiffDays(currentDate, startDateObj);
            
            if (diffDays < 0) {
                html += `<div class="admin-calendar-day is-past"><span class="day-number" style="align-self: center;">${day}</span></div>`;
            } else {
                const questionId = state.calendar.days[diffDays];
                const isActive = state.selectedDay === diffDays;
                
                const diffDaysFromToday = getDiffDays(currentDate, today);
                const isToday = diffDaysFromToday === 0;
                const isHistorical = diffDaysFromToday < 0;
                const isUrgentEmpty = !questionId && diffDaysFromToday >= 0 && diffDaysFromToday <= 7;
                const isWarningEmpty = !questionId && diffDaysFromToday > 7 && diffDaysFromToday <= 30;
                const isInfoEmpty = !questionId && diffDaysFromToday > 30;
                
                const challengeBadgeText = questionId ? questionId.replace('q_', 'P') : '+';
                
                const classes = [
                    'admin-calendar-day',
                    questionId ? 'is-filled' : 'is-empty',
                    isActive ? 'is-active' : '',
                    isToday ? 'is-today' : '',
                    isHistorical ? 'is-historical' : '',
                    isUrgentEmpty ? 'is-urgent-empty' : '',
                    isWarningEmpty ? 'is-warning-empty' : '',
                    isInfoEmpty ? 'is-info-empty' : ''
                ].filter(Boolean).join(' ');
                
                html += `
                    <div class="${classes}" data-day-index="${diffDays}" data-day="${day}">
                        <span class="day-number" ${isToday ? 'style="color: var(--primary); font-weight: 800; align-self: center;"' : 'style="align-self: center;"'}>${day}</span>
                        <span style="font-size: 0.65rem; color: var(--text-muted); font-weight: 600; text-align: center; margin-bottom: 0.25rem;">#${diffDays + 1}</span>
                        <span class="day-badge">${challengeBadgeText}</span>
                    </div>
                `;
            }
        }
        
        grid.innerHTML = html;

        grid.querySelectorAll('[data-day-index]').forEach(cell => {
            const diffDays = Number(cell.dataset.dayIndex);
            if (isNaN(diffDays)) return;
            
            const isLocked = cell.classList.contains('is-past') || cell.classList.contains('is-today');

            if (!isLocked) {
                cell.addEventListener('dragover', e => { e.preventDefault(); cell.classList.add('is-dragover'); });
                cell.addEventListener('dragleave', e => { cell.classList.remove('is-dragover'); });
                cell.addEventListener('drop', e => {
                    e.preventDefault();
                    cell.classList.remove('is-dragover');
                    const qId = e.dataTransfer.getData('text/plain');
                    const sourceDay = e.dataTransfer.getData('source-day');
                    
                    if (qId) {
                        if (sourceDay !== '') {
                            state.calendar.days[sourceDay] = ''; // Usuń z poprzedniego dnia
                        }
                        state.calendar.days[diffDays] = qId; // Przypisz do nowego
                        renderCalendar();
                        autosaveCalendar();
                    }
                });
            }
            
            const badge = cell.querySelector('.day-badge');
            if (badge && !isLocked && badge.textContent !== '+') {
                badge.style.cursor = 'grab';
                badge.setAttribute('draggable', 'true');
                badge.addEventListener('dragstart', e => {
                    const qId = state.calendar.days[diffDays];
                    e.dataTransfer.setData('text/plain', qId);
                    e.dataTransfer.setData('source-day', diffDays);
                    e.dataTransfer.effectAllowed = 'move';
                });
                
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (confirm('Odpiąć wyzwanie od tego dnia?')) {
                        state.calendar.days[diffDays] = '';
                        renderCalendar();
                        autosaveCalendar();
                    }
                });
            }
        });

        renderCalendarSidebar();
    }

    function renderCalendarSidebar() {
        const today = new Date();
        const startDateObj = parseLocalDate(state.calendar.startDate);
        
        // Obliczamy wybrane dni z ostatnich 90 dni, biorąc pod uwagę aktualny dzień
        const currentDiffDays = getDiffDays(today, startDateObj);
        
        const usedQuestions = new Set();
        const windowStart = Math.max(0, currentDiffDays - 90);
        Object.keys(state.calendar.days).forEach(dayStr => {
            const day = parseInt(dayStr);
            if (day >= windowStart && state.calendar.days[day]) {
                usedQuestions.add(state.calendar.days[day]);
            }
        });
        
        const allSoloQuestions = flattenSoloQuestions();
        
        const questionPoolList = $('questionPoolList');
        if (!questionPoolList) return;
        
        let poolHtml = '';
        allSoloQuestions.forEach(q => {
            const isUsed = usedQuestions.has(q.id);
            const classList = isUsed ? 'admin-draggable-question is-disabled' : 'admin-draggable-question';
            const draggableAttr = isUsed ? '' : 'draggable="true"';
            
            poolHtml += `
                <div class="${classList}" ${draggableAttr} data-id="${q.id}">
                    <span style="opacity: 0.5; cursor: ${isUsed ? 'default' : 'grab'}; padding-right: 0.2rem;">⣿</span>
                    <strong>[${q.id.replace('q_', 'P')}]</strong> 
                    <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${escapeHtml(q.text)}">${escapeHtml(q.text)}</span>
                </div>
            `;
        });
        questionPoolList.innerHTML = poolHtml;

        // Bind drag events
        questionPoolList.querySelectorAll('.admin-draggable-question:not(.is-disabled)').forEach(el => {
            el.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/plain', el.dataset.id);
                e.dataTransfer.setData('source-day', '');
                e.dataTransfer.effectAllowed = 'copyMove';
            });
        });
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
            <div class="admin-editor-answer" data-answer="${answer.id}" style="margin-bottom: 0.5rem;">
                <span class="admin-text-meta">${index + 1}</span>
                <input class="admin-text-control" type="text" value="${escapeAttr(answer.text || '')}" placeholder="Odpowiedź ${index + 1}">
                <input class="admin-text-control" type="number" min="0" max="100" value="${Number(answer.points) || 0}" aria-label="Punkty" placeholder="Pkt">
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
        question.answers = [...els.answersForm.querySelectorAll('.admin-editor-answer')]
            .map(row => {
                const textInput = row.querySelector('input[type="text"]');
                const pointsInput = row.querySelector('input[type="number"]');
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
        // setStatus usunięty zgodnie z życzeniem
    }

    async function openAdminPanel(accessToken = '') {
        state.accessToken = accessToken;
        els.accessCheck?.classList.add('is-hidden');
        els.adminPanel.classList.remove('is-hidden');
        await loadData();
    }

    function returnToPreviousPage() {
        window.location.replace('/rodziniada/wyzwanie');
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



    els.saveAllButton.addEventListener('click', saveAll);
    els.allQuestionsButton?.addEventListener('click', () => {
        applySoloQuestionEditor();
        document.querySelectorAll('.admin-action-button').forEach(button => {
            button.classList.toggle('is-active', button === els.allQuestionsButton);
        });
        state.activeSoloQuestionId = null;
        renderAllQuestionsPanel();
    });

    els.categoriesButton?.addEventListener('click', () => {
        document.querySelectorAll('.admin-action-button').forEach(button => {
            button.classList.toggle('is-active', button === els.categoriesButton);
        });
        state.activeSoloQuestionId = null;
        renderCategoriesPanel();
    });

    document.body.addEventListener('click', event => {
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

        const deleteQuestionBtn = event.target.closest('[data-delete-question]');
        if (deleteQuestionBtn) {
            if (!deleteQuestionBtn.classList.contains('is-confirming')) {
                deleteQuestionBtn.classList.add('is-confirming');
                deleteQuestionBtn.textContent = 'Na pewno?';
                setTimeout(() => {
                    if (deleteQuestionBtn && document.body.contains(deleteQuestionBtn)) {
                        deleteQuestionBtn.classList.remove('is-confirming');
                        deleteQuestionBtn.textContent = 'Usuń';
                    }
                }, 3000);
            } else {
                const questionId = deleteQuestionBtn.dataset.deleteQuestion;
                // Znajdź kategorię zawierającą to pytanie
                for (const category of state.soloQuestionsData.categories) {
                    if (category.questions) {
                        const qIndex = category.questions.findIndex(q => String(q.id) === String(questionId));
                        if (qIndex > -1) {
                            category.questions.splice(qIndex, 1);
                            saveSoloQuestionsDraft();
                            markDirty();
                            renderAllQuestionsPanel();
                            setStatus('Pytanie usunięte.', 'success');
                            break;
                        }
                    }
                }
            }
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
            return;
        }

        if (event.target.closest('#addNewQuestionBtn')) {
            const newQuestion = {
                id: generateId('q'),
                text: 'Nowe pytanie',
                answers: Array.from({ length: 6 }, (_, index) => ({ id: generateId('a'), text: `ODPOWIEDŹ ${index + 1}`, points: 0 }))
            };
            let bezKategorii = state.soloQuestionsData.categories.find(c => c.name.trim().toLowerCase() === 'bez kategorii');
            if (!bezKategorii) {
                bezKategorii = { id: generateId('c'), name: 'Bez kategorii', questions: [] };
                state.soloQuestionsData.categories.unshift(bezKategorii);
            }
            if (!bezKategorii.questions) bezKategorii.questions = [];
            bezKategorii.questions.push(newQuestion);
            
            saveSoloQuestionsDraft();
            markDirty();
            
            state.isEditingNewQuestion = newQuestion.id;
            
            // Otwórz edytor w modalu dla nowo utworzonego pytania
            renderSoloQuestionEditor(newQuestion.id);
            return;
        }

        if (event.target.closest('#addNewCategoryBtn')) {
            els.addCategoryNameInput.value = '';
            els.addCategoryNameInput.style.borderColor = '';
            
            // Pobieranie pytań z "Bez kategorii"
            const bezKategorii = state.soloQuestionsData.categories?.find(c => c.name.trim().toLowerCase() === 'bez kategorii');
            const questions = bezKategorii?.questions || [];
            
            if (questions.length === 0) {
                els.addCategoryQuestionsList.innerHTML = '<span class="admin-text-meta">Brak wolnych pytań do przypisania.</span>';
            } else {
                els.addCategoryQuestionsList.innerHTML = questions.map(q => `
                    <label class="admin-modal-question-item">
                        <input type="checkbox" name="assignQuestion" value="${escapeHtml(q.id)}">
                        <span>${escapeHtml(q.text || 'Pytanie bez treści')}</span>
                    </label>
                `).join('');
            }
            
            els.addCategoryModalOverlay.classList.remove('is-hidden');
            setTimeout(() => els.addCategoryNameInput.focus(), 100);
            return;
        }

        const editCategoryBtn = event.target.closest('[data-edit-category]');
        if (editCategoryBtn) {
            const card = editCategoryBtn.closest('.admin-category-card');
            card.classList.add('is-editing');
            card.querySelector('.admin-category-view-mode').classList.add('is-hidden');
            card.querySelector('.admin-category-edit-mode').classList.remove('is-hidden');
            const input = card.querySelector('.admin-category-input');
            setTimeout(() => input.focus(), 50);
            return;
        }

        const cancelEditCategoryBtn = event.target.closest('[data-cancel-edit-category]');
        if (cancelEditCategoryBtn) {
            const card = cancelEditCategoryBtn.closest('.admin-category-card');
            card.classList.remove('is-editing');
            card.querySelector('.admin-category-view-mode').classList.remove('is-hidden');
            card.querySelector('.admin-category-edit-mode').classList.add('is-hidden');
            const input = card.querySelector('.admin-category-input');
            input.value = input.dataset.originalName;
            input.style.borderColor = '';
            return;
        }

        const saveCategoryNameBtn = event.target.closest('[data-save-category-name]');
        if (saveCategoryNameBtn) {
            const categoryId = saveCategoryNameBtn.dataset.saveCategoryName;
            const card = saveCategoryNameBtn.closest('.admin-category-card');
            const input = card.querySelector('.admin-category-input');
            const category = state.soloQuestionsData.categories.find(c => String(c.id) === String(categoryId));
            
            if (category) {
                const newName = input.value.trim();
                if (!newName) {
                    input.style.borderColor = 'var(--danger)';
                    return;
                }
                input.style.borderColor = '';
                category.name = newName;
                input.dataset.originalName = newName;
                card.querySelector('.admin-category-name').textContent = newName;
                
                card.classList.remove('is-editing');
                card.querySelector('.admin-category-view-mode').classList.remove('is-hidden');
                card.querySelector('.admin-category-edit-mode').classList.add('is-hidden');
                
                saveSoloQuestionsDraft();
                markDirty();
                setStatus('Zapisano nową nazwę kategorii.', 'success');
            }
            return;
        }

        const deleteBtn = event.target.closest('[data-delete-category]');
        if (deleteBtn) {
            if (!deleteBtn.classList.contains('is-confirming')) {
                deleteBtn.classList.add('is-confirming');
                deleteBtn.textContent = 'Na pewno?';
                setTimeout(() => {
                    if (deleteBtn && document.body.contains(deleteBtn)) {
                        deleteBtn.classList.remove('is-confirming');
                        deleteBtn.textContent = 'Usuń';
                    }
                }, 3000);
            } else {
                const categoryId = deleteBtn.dataset.deleteCategory;
                const categoryIndex = state.soloQuestionsData.categories.findIndex(c => String(c.id) === String(categoryId));
                if (categoryIndex > -1) {
                    const category = state.soloQuestionsData.categories[categoryIndex];
                    if (category.questions && category.questions.length > 0) {
                        let bezKategorii = state.soloQuestionsData.categories.find(c => c.name.trim().toLowerCase() === 'bez kategorii');
                        if (!bezKategorii) {
                            bezKategorii = { id: generateId('c'), name: 'Bez kategorii', questions: [] };
                            state.soloQuestionsData.categories.unshift(bezKategorii);
                        }
                        if (!bezKategorii.questions) bezKategorii.questions = [];
                        bezKategorii.questions.push(...category.questions);
                    }
                    
                    // We must recalculate index because unshift might have changed it!
                    const actualIndex = state.soloQuestionsData.categories.findIndex(c => String(c.id) === String(categoryId));
                    if (actualIndex > -1) {
                        state.soloQuestionsData.categories.splice(actualIndex, 1);
                    }
                    
                    saveSoloQuestionsDraft();
                    markDirty();
                    renderCategoriesPanel();
                    setStatus('Kategoria została usunięta.', 'success');
                }
            }
            return;
        }
    });
    document.body.addEventListener('input', event => {
        if (event.target.closest('#soloQuestionEditor')) {
            applySoloQuestionEditor();
            markDirty();
        }
    });
    
    document.body.addEventListener('keypress', event => {
        if (event.key === 'Enter' && event.target.classList.contains('admin-category-input')) {
            event.preventDefault();
            const card = event.target.closest('.admin-category-card');
            if (card) {
                const saveBtn = card.querySelector('[data-save-category-name]');
                if (saveBtn) {
                    saveBtn.click();
                }
            }
        }
    });

    els.adminContentPanel?.addEventListener('change', event => {
        if (event.target.closest('#soloQuestionEditor')) {
            applySoloQuestionEditor();
            markDirty();
        }
    });
    els.adminContentPanel?.addEventListener('submit', event => {
        if (event.target.closest('#soloQuestionEditor')) {
            event.preventDefault();
            applySoloQuestionEditor();
            markDirty();
        }
    });
    els.addCategoryCancelBtn?.addEventListener('click', () => {
        els.addCategoryModalOverlay.classList.add('is-hidden');
    });

    els.addCategoryModalOverlay?.addEventListener('click', (e) => {
        if (e.target === els.addCategoryModalOverlay) {
            els.addCategoryModalOverlay.classList.add('is-hidden');
        }
    });

    els.addCategoryConfirmBtn?.addEventListener('click', () => {
        const name = els.addCategoryNameInput.value.trim();
        if (!name) {
            els.addCategoryNameInput.style.borderColor = 'var(--danger)';
            return;
        }
        els.addCategoryNameInput.style.borderColor = '';
        
        const selectedQuestionIds = Array.from(els.addCategoryQuestionsList.querySelectorAll('input[name="assignQuestion"]:checked')).map(input => input.value);
        
        const newCategory = { id: generateId('c'), name: name, questions: [] };
        if (!Array.isArray(state.soloQuestionsData.categories)) state.soloQuestionsData.categories = [];
        
        // Wyciąganie pytań z "Bez kategorii"
        if (selectedQuestionIds.length > 0) {
            const bezKategorii = state.soloQuestionsData.categories.find(c => c.name.trim().toLowerCase() === 'bez kategorii');
            if (bezKategorii && bezKategorii.questions) {
                const movedQuestions = bezKategorii.questions.filter(q => selectedQuestionIds.includes(String(q.id)));
                newCategory.questions = movedQuestions;
                bezKategorii.questions = bezKategorii.questions.filter(q => !selectedQuestionIds.includes(String(q.id)));
            }
        }
        
        state.soloQuestionsData.categories.push(newCategory);
        saveSoloQuestionsDraft();
        markDirty();
        
        els.addCategoryModalOverlay.classList.add('is-hidden');
        
        // Odśwież widok
        if (document.querySelector('.admin-tab[data-tab="questions"]').classList.contains('is-active')) {
            if (document.getElementById('categoriesButton').classList.contains('is-active')) {
                renderCategoriesPanel();
            } else {
                renderAllQuestionsPanel();
            }
        }
        
        setStatus('Kategoria została utworzona.', 'success');
    });

    function cancelEditQuestion() {
        els.editQuestionModalOverlay.classList.add('is-hidden');
        if (state.isEditingNewQuestion) {
            const bezKategorii = state.soloQuestionsData.categories.find(c => c.name.trim().toLowerCase() === 'bez kategorii');
            if (bezKategorii && bezKategorii.questions) {
                bezKategorii.questions = bezKategorii.questions.filter(q => q.id !== state.isEditingNewQuestion);
                saveSoloQuestionsDraft();
                markDirty();
                if (document.querySelector('.admin-tab[data-tab="questions"]').classList.contains('is-active') && !document.getElementById('categoriesButton').classList.contains('is-active')) {
                    renderAllQuestionsPanel();
                }
            }
            state.isEditingNewQuestion = null;
        }
        state.activeSoloQuestionId = null;
    }

    els.editQuestionCloseBtn?.addEventListener('click', cancelEditQuestion);

    els.editQuestionModalOverlay?.addEventListener('click', (e) => {
        if (e.target === els.editQuestionModalOverlay) {
            cancelEditQuestion();
        }
    });

    els.editQuestionSaveBtn?.addEventListener('click', () => {
        applySoloQuestionEditor();
        state.isEditingNewQuestion = null;
        if (saveSoloQuestionsDraft()) {
            markDirty();
            if (document.querySelector('.admin-tab[data-tab="questions"]').classList.contains('is-active') && !document.getElementById('categoriesButton').classList.contains('is-active')) {
                renderAllQuestionsPanel();
            }
            setStatus('Zapisano pytanie.', 'success');
        } else {
            setStatus('Nie udało się zapisać pytania.', 'error');
        }
        els.editQuestionModalOverlay.classList.add('is-hidden');
        state.activeSoloQuestionId = null;
    });

    els.visibleSaveAllButton?.addEventListener('click', saveAll);
    $('calendarPrevMonthBtn')?.addEventListener('click', () => {
        if (!currentCalendarViewDate) return;
        const currentYear = currentCalendarViewDate.getFullYear();
        const currentMonth = currentCalendarViewDate.getMonth();
        if (currentYear < 2026 || (currentYear === 2026 && currentMonth <= 6)) return;
        currentCalendarViewDate.setMonth(currentMonth - 1);
        renderCalendar();
    });

    $('calendarNextMonthBtn')?.addEventListener('click', () => {
        if (!currentCalendarViewDate) return;
        const currentYear = currentCalendarViewDate.getFullYear();
        const currentMonth = currentCalendarViewDate.getMonth();
        
        const limitDate = new Date();
        const maxYear = limitDate.getFullYear() + 1;
        const maxMonth = limitDate.getMonth();
        
        if (currentYear > maxYear || (currentYear === maxYear && currentMonth >= maxMonth)) return;
        
        currentCalendarViewDate.setMonth(currentMonth + 1);
        renderCalendar();
    });
    $('calendarCurrentMonthLabel')?.addEventListener('click', () => {
        const popup = $('calendarQuickJump');
        if (!popup) return;
        if (popup.classList.contains('is-hidden')) {
            popup.classList.remove('is-hidden');
            $('calendarQuickMonth').value = currentCalendarViewDate.getMonth();
            
            const limitDate = new Date();
            const currY = limitDate.getFullYear();
            const nextY = currY + 1;
            const btnCurr = $('calendarQuickYearCurrent');
            const btnNext = $('calendarQuickYearNext');
            
            if (btnCurr && btnNext) {
                btnCurr.textContent = currY;
                btnNext.textContent = nextY;
                
                const setInactive = (btn) => {
                    btn.classList.remove('is-active');
                    btn.style.background = 'transparent';
                    btn.style.color = 'var(--text-secondary)';
                };
                const setActive = (btn) => {
                    btn.classList.add('is-active');
                    btn.style.background = 'var(--primary)';
                    btn.style.color = '#fff';
                };
                
                if (currentCalendarViewDate.getFullYear() === nextY) {
                    setActive(btnNext);
                    setInactive(btnCurr);
                } else {
                    setActive(btnCurr);
                    setInactive(btnNext);
                }
            }
        } else {
            popup.classList.add('is-hidden');
        }
    });

    $('calendarQuickYearCurrent')?.addEventListener('click', (e) => {
        e.target.classList.add('is-active');
        e.target.style.background = 'var(--primary)';
        e.target.style.color = '#fff';
        const other = $('calendarQuickYearNext');
        if (other) {
            other.classList.remove('is-active');
            other.style.background = 'transparent';
            other.style.color = 'var(--text-secondary)';
        }
    });

    $('calendarQuickYearNext')?.addEventListener('click', (e) => {
        e.target.classList.add('is-active');
        e.target.style.background = 'var(--primary)';
        e.target.style.color = '#fff';
        const other = $('calendarQuickYearCurrent');
        if (other) {
            other.classList.remove('is-active');
            other.style.background = 'transparent';
            other.style.color = 'var(--text-secondary)';
        }
    });

    $('calendarQuickJumpBtn')?.addEventListener('click', () => {
        let m = parseInt($('calendarQuickMonth').value);
        let y = parseInt(new Date().getFullYear());
        const activeBtn = document.querySelector('#calendarQuickJump .is-active');
        if (activeBtn) {
            y = parseInt(activeBtn.textContent);
        }
        if (!isNaN(m) && !isNaN(y)) {
            if (y < 2026 || (y === 2026 && m < 6)) {
                y = 2026;
                m = 6;
            }
            
            const limitDate = new Date();
            const maxYear = limitDate.getFullYear() + 1;
            const maxMonth = limitDate.getMonth();
            
            if (y > maxYear || (y === maxYear && m > maxMonth)) {
                y = maxYear;
                m = maxMonth;
            }
            
            currentCalendarViewDate.setMonth(m);
            currentCalendarViewDate.setFullYear(y);
            renderCalendar();
        }
        $('calendarQuickJump')?.classList.add('is-hidden');
    });

    document.addEventListener('click', (e) => {
        const popup = $('calendarQuickJump');
        const trigger = $('calendarCurrentMonthLabel');
        if (popup && trigger && !popup.contains(e.target) && !trigger.contains(e.target)) {
            popup.classList.add('is-hidden');
        }
    });
    
    document.addEventListener('input', (e) => {
        if (e.target.id === 'calendarQuestionSearch') {
            const filter = e.target.value.toLowerCase();
            const poolList = $('questionPoolList');
            if (poolList) {
                poolList.querySelectorAll('.admin-draggable-question').forEach(option => {
                    if (option.textContent.toLowerCase().includes(filter)) {
                        option.style.display = '';
                    } else {
                        option.style.display = 'none';
                    }
                });
            }
        }
    });

    async function autosaveCalendar() {
        try {
            const response = await fetch('/rodziniada/api/solo-calendar', {
                method: 'POST',
                headers: { 
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.accessToken}` 
                },
                body: JSON.stringify(state.calendar)
            });
            if (response.ok) {
                setStatus('Zapisano pomyślnie!', 'success');
                markSaved();
            } else {
                throw new Error();
            }
        } catch (err) {
            setStatus('Błąd autozapisu', 'error');
            markDirty();
        }
    }

    // Dodaj funkcję pozwalającą na obsłużenie upuszczenia pytania w Dropzone'ie puli pytań (usunięcie)
    const questionPoolList = $('questionPoolList');
    if (questionPoolList) {
        questionPoolList.addEventListener('dragover', (e) => {
            e.preventDefault();
            questionPoolList.classList.add('is-dragover');
        });
        questionPoolList.addEventListener('dragleave', () => {
            questionPoolList.classList.remove('is-dragover');
        });
        questionPoolList.addEventListener('drop', (e) => {
            e.preventDefault();
            questionPoolList.classList.remove('is-dragover');
            const sourceDay = e.dataTransfer.getData('source-day');
            if (sourceDay !== '') {
                state.calendar.days[sourceDay] = ''; // Usunięcie pytania
                renderCalendar();
                autosaveCalendar();
            }
        });
    }

    els.fillCalendarButton?.addEventListener('click', fillCalendar);
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

    els.exportButton?.addEventListener('click', () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.soloQuestionsData, null, 2));
        const anchor = document.createElement('a');
        anchor.setAttribute("href", dataStr);
        anchor.setAttribute("download", "rodziniada-solo-questions.json");
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        setStatus('Plik z bazą pytań został wyeksportowany.', 'success');
    });

    els.categoriesButton?.addEventListener('click', () => {
        // setStatus usunięty zgodnie z życzeniem
    });

    els.importButton?.addEventListener('click', () => {
        els.importFileInput?.click();
    });

    els.importFileInput?.addEventListener('change', event => {
        const file = event.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = e => {
            try {
                const importedData = JSON.parse(e.target.result);
                if (importedData && importedData.categories) {
                    state.soloQuestionsData = importedData;
                    saveSoloQuestionsDraft();
                    markDirty();
                    if (document.querySelector('.admin-tab[data-tab="questions"]').classList.contains('is-active')) {
                        renderAllQuestionsPanel();
                    }
                    setStatus('Baza pytań została zaimportowana.', 'success');
                } else {
                    setStatus('Nieprawidłowy format pliku JSON.', 'error');
                }
            } catch (err) {
                setStatus('Wystąpił błąd podczas odczytu pliku.', 'error');
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // reset
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
