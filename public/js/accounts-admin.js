document.addEventListener('DOMContentLoaded', () => {
    const PIN_KEY = 'grajmytv:accounts-admin-pin';
    const els = {
        pinForm: document.getElementById('pinForm'),
        adminPin: document.getElementById('adminPin'),
        pinDigits: [...document.querySelectorAll('[data-pin-digit]')],
        workspace: document.getElementById('accountsWorkspace'),
        accountForm: document.getElementById('accountForm'),
        nickname: document.getElementById('accountNickname'),
        password: document.getElementById('accountPassword'),
        role: document.getElementById('accountRole'),
        list: document.getElementById('accountsList'),
        message: document.getElementById('accountsMessage'),
        refresh: document.getElementById('refreshAccountsButton')
    };
    let pin = '';

    function setMessage(text, type = 'neutral') {
        if (!els.message) return;
        els.message.textContent = text;
        els.message.dataset.type = type;
    }

    function formatDate(value) {
        if (!value) return '---';

        return new Intl.DateTimeFormat('pl-PL', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(value));
    }

    async function api(path, payload = {}) {
        const response = await fetch(path, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-pin': pin
            },
            body: JSON.stringify({ ...payload, pin })
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
            throw new Error(data.error || 'Operacja nie powiodla sie.');
        }

        return data;
    }

    function showWorkspace() {
        els.pinForm.hidden = true;
        els.workspace.hidden = false;
    }

    function updatePinFromDigits() {
        pin = els.pinDigits.map(input => input.value.replace(/\D/g, '').slice(0, 1)).join('');
        els.adminPin.value = pin;
    }

    function fillPinDigits(value) {
        const digits = String(value || '').replace(/\D/g, '').slice(0, 4).split('');
        els.pinDigits.forEach((input, index) => {
            input.value = digits[index] || '';
            input.classList.toggle('is-filled', Boolean(input.value));
        });
        updatePinFromDigits();
    }

    function clearPinDigits() {
        els.pinDigits.forEach(input => {
            input.value = '';
            input.classList.remove('is-filled');
        });
        els.adminPin.value = '';
    }

    function focusFirstEmptyDigit() {
        const emptyInput = els.pinDigits.find(input => !input.value);
        (emptyInput || els.pinDigits[els.pinDigits.length - 1])?.focus();
    }

    async function openWithPin() {
        updatePinFromDigits();
        if (pin.length !== 4) {
            focusFirstEmptyDigit();
            return;
        }

        try {
            showWorkspace();
            await loadAccounts();
            sessionStorage.removeItem(PIN_KEY);
            clearPinDigits();
        } catch (error) {
            els.workspace.hidden = true;
            els.pinForm.hidden = false;
            sessionStorage.removeItem(PIN_KEY);
            setMessage('');
            window.alert(error.message);
            fillPinDigits('');
            focusFirstEmptyDigit();
        }
    }

    function renderAccounts(accounts = []) {
        if (!els.list) return;

        if (!accounts.length) {
            els.list.innerHTML = '<div class="account-empty">Nie ma jeszcze kont.</div>';
            return;
        }

        els.list.innerHTML = accounts.map(account => `
            <article class="account-row" data-id="${account.id}">
                <div>
                    <strong>${escapeHtml(account.nickname)}</strong>
                </div>
                <div class="account-meta">
                    <span>${escapeHtml(account.role)}</span>
                    <span>${account.confirmed ? 'Potwierdzone' : 'Niepotwierdzone'}</span>
                    <span>Ostatnio: ${formatDate(account.lastSignInAt)}</span>
                </div>
                <div class="account-actions">
                    <button type="button" class="account-password" data-password="${account.id}" data-name="${escapeHtml(account.nickname)}">Hasło</button>
                    <button type="button" class="account-delete" data-delete="${account.id}" data-name="${escapeHtml(account.nickname)}">Usuń</button>
                </div>
            </article>
        `).join('');

        els.list.querySelectorAll('[data-password]').forEach(button => {
            button.addEventListener('click', () => changeAccountPassword(button.dataset.password, button.dataset.name));
        });

        els.list.querySelectorAll('[data-delete]').forEach(button => {
            button.addEventListener('click', () => deleteAccount(button.dataset.delete, button.dataset.name));
        });
    }

    function escapeHtml(value) {
        const span = document.createElement('span');
        span.textContent = String(value || '');
        return span.innerHTML;
    }

    async function loadAccounts() {
        setMessage('Ładowanie kont...');
        const data = await api('/api/accounts/list');
        renderAccounts(data.accounts || []);
        setMessage(`Konta zsynchronizowane: ${(data.accounts || []).length}`, 'success');
    }

    async function deleteAccount(id, name) {
        if (!window.confirm(`Usunąć konto ${name}? Tej akcji nie da się łatwo cofnąć.`)) return;

        setMessage('Usuwanie konta...');
        await api('/api/accounts/delete', { id });
        await loadAccounts();
        setMessage('Konto usunięte.', 'success');
    }

    async function changeAccountPassword(id, name) {
        const password = window.prompt(`Nowe hasło dla konta ${name}`);
        if (!password) return;
        if (password.length < 6) {
            setMessage('Hasło musi mieć minimum 6 znaków.', 'error');
            return;
        }

        setMessage('Zmienianie hasła...');
        try {
            await api('/api/accounts/password', { id, password });
            setMessage('Hasło zostało zmienione.', 'success');
        } catch (error) {
            setMessage(error.message, 'error');
        }
    }

    els.pinForm?.addEventListener('submit', async event => {
        event.preventDefault();
        await openWithPin();
    });

    els.pinDigits.forEach((input, index) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 1);
            input.classList.toggle('is-filled', Boolean(input.value));
            updatePinFromDigits();

            if (input.value && els.pinDigits[index + 1]) {
                els.pinDigits[index + 1].focus();
            }
            if (pin.length === 4) {
                openWithPin();
            }
        });

        input.addEventListener('keydown', event => {
            if (event.key === 'Backspace' && !input.value && els.pinDigits[index - 1]) {
                els.pinDigits[index - 1].focus();
            }
        });

        input.addEventListener('paste', event => {
            event.preventDefault();
            fillPinDigits(event.clipboardData.getData('text'));
            if (pin.length === 4) {
                openWithPin();
            } else {
                focusFirstEmptyDigit();
            }
        });
    });

    els.accountForm?.addEventListener('submit', async event => {
        event.preventDefault();

        setMessage('Tworzenie konta...');
        try {
            await api('/api/accounts/create', {
                nickname: els.nickname.value,
                password: els.password.value,
                role: els.role.value
            });
            els.accountForm.reset();
            els.role.value = 'tester';
            await loadAccounts();
            setMessage('Konto zostało dodane.', 'success');
        } catch (error) {
            setMessage(error.message, 'error');
        }
    });

    els.refresh?.addEventListener('click', () => {
        loadAccounts().catch(error => setMessage(error.message, 'error'));
    });

    sessionStorage.removeItem(PIN_KEY);

    focusFirstEmptyDigit();
});
