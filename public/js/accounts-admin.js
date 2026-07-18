document.addEventListener('DOMContentLoaded', () => {
    const PIN_KEY = 'grajmytv:accounts-admin-pin';
    const els = {
        pinForm: document.getElementById('pinForm'),
        adminPin: document.getElementById('adminPin'),
        workspace: document.getElementById('accountsWorkspace'),
        accountForm: document.getElementById('accountForm'),
        nickname: document.getElementById('accountNickname'),
        email: document.getElementById('accountEmail'),
        password: document.getElementById('accountPassword'),
        role: document.getElementById('accountRole'),
        list: document.getElementById('accountsList'),
        message: document.getElementById('accountsMessage'),
        refresh: document.getElementById('refreshAccountsButton')
    };
    let pin = sessionStorage.getItem(PIN_KEY) || '';

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

    function renderAccounts(accounts = []) {
        if (!els.list) return;

        if (!accounts.length) {
            els.list.innerHTML = '<div class="account-empty">Nie ma jeszcze kont testerów.</div>';
            return;
        }

        els.list.innerHTML = accounts.map(account => `
            <article class="account-row" data-id="${account.id}">
                <div>
                    <strong>${escapeHtml(account.nickname)}</strong>
                    <span>${escapeHtml(account.email)}</span>
                </div>
                <div class="account-meta">
                    <span>${escapeHtml(account.role)}</span>
                    <span>${account.confirmed ? 'Potwierdzone' : 'Niepotwierdzone'}</span>
                    <span>Ostatnio: ${formatDate(account.lastSignInAt)}</span>
                </div>
                <button type="button" class="account-delete" data-delete="${account.id}" data-email="${escapeHtml(account.email)}">Usuń</button>
            </article>
        `).join('');

        els.list.querySelectorAll('[data-delete]').forEach(button => {
            button.addEventListener('click', () => deleteAccount(button.dataset.delete, button.dataset.email));
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

    async function deleteAccount(id, email) {
        if (!window.confirm(`Usunąć konto ${email}? Tej akcji nie da się łatwo cofnąć.`)) return;

        setMessage('Usuwanie konta...');
        await api('/api/accounts/delete', { id });
        await loadAccounts();
        setMessage('Konto usunięte.', 'success');
    }

    els.pinForm?.addEventListener('submit', async event => {
        event.preventDefault();
        pin = els.adminPin.value.trim();
        sessionStorage.setItem(PIN_KEY, pin);

        try {
            showWorkspace();
            await loadAccounts();
        } catch (error) {
            els.workspace.hidden = true;
            els.pinForm.hidden = false;
            setMessage('');
            window.alert(error.message);
        }
    });

    els.accountForm?.addEventListener('submit', async event => {
        event.preventDefault();

        setMessage('Tworzenie konta...');
        try {
            await api('/api/accounts/create', {
                nickname: els.nickname.value,
                email: els.email.value,
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

    if (pin) {
        els.adminPin.value = pin;
    }
});
