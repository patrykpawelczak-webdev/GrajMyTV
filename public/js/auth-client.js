(() => {
    const STORAGE_KEY = 'grajmytv:supabase-session:v1';
    const PROFILE_KEY = 'grajmytv:supabase-profile:v1';
    const listeners = new Set();
    let configPromise = null;
    let authEnabled = false;
    let session = readJson(STORAGE_KEY);
    let profile = readJson(PROFILE_KEY);

    function readJson(key) {
        try {
            return JSON.parse(localStorage.getItem(key) || 'null');
        } catch {
            return null;
        }
    }

    function writeJson(key, value) {
        if (!value) {
            localStorage.removeItem(key);
            return;
        }

        localStorage.setItem(key, JSON.stringify(value));
    }

    function emit() {
        listeners.forEach(listener => listener(getState()));
    }

    function nicknameFromEmail(email) {
        return String(email || '').split('@')[0] || 'Tester';
    }

    function normalizeSession(data) {
        if (!data?.access_token || !data?.refresh_token || !data?.user) return null;

        return {
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: data.expires_at ? data.expires_at * 1000 : Date.now() + Number(data.expires_in || 3600) * 1000,
            user: data.user
        };
    }

    async function getConfig() {
        if (!configPromise) {
            configPromise = fetch('/api/auth-config', { cache: 'no-store' }).then(response => response.json());
        }

        const config = await configPromise;
        authEnabled = Boolean(config.enabled);
        return config;
    }

    async function supabaseAuthRequest(pathname, body, token = null) {
        const config = await getConfig();
        if (!config.enabled) {
            throw new Error('Logowanie nie jest jeszcze skonfigurowane.');
        }

        const headers = {
            apikey: config.supabaseAnonKey,
            'Content-Type': 'application/json'
        };
        if (token) {
            headers.Authorization = `Bearer ${token}`;
        }

        const response = await fetch(`${config.supabaseUrl}/auth/v1/${pathname}`, {
            method: 'POST',
            headers,
            body: JSON.stringify(body || {})
        });
        const text = await response.text();

        if (!response.ok) {
            throw new Error(text || 'Nie udalo sie zalogowac.');
        }

        return text ? JSON.parse(text) : null;
    }

    async function fetchProfile() {
        const config = await getConfig();
        const token = await getAccessToken();
        if (!config.enabled || !token || !session?.user?.id) return null;

        const query = `profiles?id=eq.${encodeURIComponent(session.user.id)}&select=nickname,role&limit=1`;
        const response = await fetch(`${config.supabaseUrl}/rest/v1/${query}`, {
            headers: {
                apikey: config.supabaseAnonKey,
                Authorization: `Bearer ${token}`
            }
        });
        const rows = response.ok ? await response.json() : [];
        profile = rows?.[0] || {
            nickname: nicknameFromEmail(session.user.email),
            role: 'tester'
        };
        writeJson(PROFILE_KEY, profile);
        emit();
        return profile;
    }

    async function emailForUsername(username) {
        const config = await getConfig();
        const cleanUsername = String(username || '').trim();
        if (!config.enabled || !cleanUsername) {
            throw new Error('Nie udalo sie znalezc uzytkownika.');
        }

        if (cleanUsername.includes('@')) {
            return cleanUsername.toLowerCase();
        }

        const query = `profiles?nickname=eq.${encodeURIComponent(cleanUsername)}&select=id&limit=1`;
        const profileResponse = await fetch(`${config.supabaseUrl}/rest/v1/${query}`, {
            headers: {
                apikey: config.supabaseAnonKey
            }
        });
        const profiles = profileResponse.ok ? await profileResponse.json() : [];
        const userId = profiles?.[0]?.id;

        if (!userId) {
            throw new Error('Nie znaleziono takiego uzytkownika.');
        }

        const userResponse = await fetch(`/api/accounts/public-email?id=${encodeURIComponent(userId)}`, {
            cache: 'no-store'
        });
        const userData = await userResponse.json().catch(() => ({}));

        if (!userResponse.ok || !userData.email) {
            throw new Error('Nie znaleziono takiego uzytkownika.');
        }

        return userData.email;
    }

    async function refreshSession() {
        if (!session?.refreshToken) return null;

        const refreshed = await supabaseAuthRequest('token?grant_type=refresh_token', {
            refresh_token: session.refreshToken
        });
        session = normalizeSession(refreshed);
        writeJson(STORAGE_KEY, session);
        emit();
        return session;
    }

    async function getAccessToken() {
        if (!session?.accessToken) return null;

        if (Date.now() > Number(session.expiresAt || 0) - 60000) {
            await refreshSession();
        }

        return session?.accessToken || null;
    }

    async function signIn(identifier, password) {
        await getConfig();
        const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                identifier,
                password
            })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
            throw new Error(data.error || 'Nie udalo sie zalogowac.');
        }

        session = normalizeSession(data);
        if (!session) {
            throw new Error('Nie udalo sie zalogowac.');
        }

        writeJson(STORAGE_KEY, session);
        await fetchProfile();
        emit();
        return getState();
    }

    async function signInDirect(identifier, password) {
        const email = await emailForUsername(identifier);
        const data = await supabaseAuthRequest('token?grant_type=password', {
            email,
            password
        });
        session = normalizeSession(data);
        writeJson(STORAGE_KEY, session);
        await fetchProfile();
        emit();
        return getState();
    }

    async function signOut() {
        const token = session?.accessToken;
        try {
            if (token) {
                await supabaseAuthRequest('logout', {}, token);
            }
        } catch {
            // Local sign-out still matters even if Supabase logout fails.
        }

        session = null;
        profile = null;
        writeJson(STORAGE_KEY, null);
        writeJson(PROFILE_KEY, null);
        emit();
    }

    function getState() {
        return {
            enabled: authEnabled,
            isLoggedIn: Boolean(session?.accessToken),
            user: session?.user || null,
            profile,
            nickname: profile?.nickname || nicknameFromEmail(session?.user?.email)
        };
    }

    async function init() {
        const config = await getConfig();
        if (session?.accessToken) {
            try {
                await getAccessToken();
                await fetchProfile();
            } catch {
                session = null;
                profile = null;
                writeJson(STORAGE_KEY, null);
                writeJson(PROFILE_KEY, null);
            }
        }
        emit();
        return { ...getState(), enabled: config.enabled };
    }

    window.GrajMyTVAuth = {
        init,
        signIn,
        signOut,
        getState,
        getAccessToken,
        onChange(listener) {
            listeners.add(listener);
            listener(getState());
            return () => listeners.delete(listener);
        }
    };
})();
