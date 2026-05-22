import { state, markSaved } from './state.js';
import { generateId } from './utils.js';

export async function loadData(showToast) {
    try {
        const res = await fetch('/rodziniada/api/questions');
        const data = await res.json();
        
        data.categories.forEach(cat => {
            if (!cat.id) cat.id = generateId();
            cat.questions.forEach(q => {
                if (!q.id) q.id = generateId();
                q.answers.forEach(a => {
                    if (!a.id) a.id = generateId();
                });
            });
        });

        state.data = data;

        // Load jokes
        try {
            const jres = await fetch('/rodziniada/api/jokes');
            const jdata = await jres.json();
            if (jdata && Array.isArray(jdata.jokes)) {
                jdata.jokes.forEach(joke => {
                    if (!joke.id) joke.id = generateId();
                });
                state.jokesData = jdata;
            } else {
                state.jokesData = { jokes: [] };
            }
        } catch(je) {
            state.jokesData = { jokes: [] };
        }

        showToast('Dane załadowane', 'success');
        return true;
    } catch (e) {
        showToast('Błąd ładowania danych!', 'error');
        return false;
    }
}

export async function saveAll(showToast) {
    try {
        const res = await fetch('/rodziniada/api/questions', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-PIN': state.currentPin
            },
            body: JSON.stringify(state.data)
        });
        const json = await res.json();

        if (!json.ok) {
            showToast('Błąd zapisu pytań: ' + (json.error || ''), 'error');
            return false;
        }

        const resJ = await fetch('/rodziniada/api/jokes', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-PIN': state.currentPin
            },
            body: JSON.stringify(state.jokesData)
        });
        const jsonJ = await resJ.json();

        if (jsonJ.ok) {
            markSaved();
            showToast('Zapisano pomyślnie!', 'success');
            return true;
        } else {
            showToast('Błąd zapisu żartów: ' + (jsonJ.error || ''), 'error');
            return false;
        }
    } catch (e) {
        showToast('Błąd połączenia z serwerem!', 'error');
        return false;
    }
}

export async function verifyPin(pin) {
    try {
        const res = await fetch('/rodziniada/api/verify-pin', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pin })
        });
        return await res.json();
    } catch (e) {
        return { ok: false, error: 'Błąd połączenia' };
    }
}
