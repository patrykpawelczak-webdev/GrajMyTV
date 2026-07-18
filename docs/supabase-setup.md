# Supabase dla GrajMyTV

## Cel na teraz

Na tym etapie Supabase trzyma:

- wyniki dzienne Rodziniady,
- ranking dnia,
- recznie utworzone konta testowe w Supabase Auth.

Nie wlaczamy jeszcze publicznej rejestracji na stronie.

## Konfiguracja Supabase

1. Utworz projekt w Supabase.
2. Wejdz w SQL Editor.
3. Wklej i uruchom zawartosc pliku `docs/supabase-schema.sql`.
4. Wejdz w Authentication > Users.
5. Dodaj recznie konta dla siebie i testerow.
6. Dla kazdego konta dodaj profil w SQL Editor:

```sql
insert into public.profiles (id, nickname, role)
select id, 'Patryk', 'admin'
from auth.users
where email = 'twoj-email@example.com'
on conflict (id) do update
set nickname = excluded.nickname,
    role = excluded.role,
    updated_at = now();
```

## Zmienne na Renderze

Dodaj w ustawieniach serwisu:

```text
SUPABASE_URL=https://twoj-projekt.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...
```

Mozna tez uzyc starej nazwy klucza:

```text
SUPABASE_SERVICE_ROLE_KEY=...
```

Klucza `SUPABASE_SECRET_KEY` albo `SUPABASE_SERVICE_ROLE_KEY` nigdy nie wrzucamy do kodu ani do przegladarki. Ma byc tylko w backendzie.

## Fallback lokalny

Jesli zmienne Supabase nie sa ustawione, wyniki dalej zapisuja sie lokalnie do pliku:

```text
gry/rodziniada/data/solo-results.json
```

Ten folder jest ignorowany przez Git.

