# Rodziniada Solo - publiczna beta

Ten plik zbiera rzeczy potrzebne przed pierwszym publicznym uruchomieniem.

## Co jest gotowe

- Codzienne wyzwanie startuje od 1 lipca 2026 i używa osobnego pytania dla każdego dnia lipca.
- Postęp i wynik zapisują się lokalnie w przeglądarce gracza.
- Po utracie wszystkich prób nieodgadnięte odpowiedzi pokazują się na tablicy bez doliczania punktów.
- Udostępnianie wyniku tworzy krótki tekst z numerem wyzwania, punktami, liczbą odkrytych odpowiedzi i linkiem do gry.
- Stopka prowadzi do podstawowych stron: regulamin, polityka prywatności i polityka cookies.

## Checklist przed publikacją

1. Przejrzeć ręcznie 31 lipcowych pytań w `gry/rodziniada/public/pytania.json`.
2. Sprawdzić, czy odpowiedzi nie mają duplikatów znaczeniowych w jednej tablicy.
3. Dodać brakujące synonimy do listy `COMMON_ALIASES` w `gry/rodziniada/public/js/solo.js`.
4. Sprawdzić grę na telefonie, tablecie i desktopie.
5. Ustawić produkcyjny adres domeny i HTTPS na hostingu.
6. Przed dużą publikacją skonsultować dokumenty prawne, zwłaszcza jeśli pojawią się konta, ranking online, e-mail lub analityka.

## Hosting

Minimalne wymagania:

- Node.js 18 lub nowszy.
- Instalacja zależności przez `npm install`.
- Uruchomienie przez `npm start`.
- Zmienna `PORT` ustawiona przez hosting lub ręcznie.
- `NODE_ENV=production` na serwerze produkcyjnym.

W aktualnej wersji dane gracza są lokalne, więc nie trzeba jeszcze konfigurować bazy danych. Po dodaniu kont, rankingu online lub edycji gier z panelu administratora warto przejść na bazę danych i osobne środowisko administracyjne.

## Ważne ograniczenie bety

Odpowiedzi są nadal częścią danych gry dostępnych dla aplikacji po stronie przeglądarki. To wystarcza do testów i małej bety, ale przed rywalizacją publiczną ranking powinien być liczony po stronie serwera.
