# Plan optimizare Search Bar (fără buguri)

## Obiective
- **Stabilitate**: fără race conditions, fără setState după unmount, index keyboard mereu valid.
- **Performanță**: mai puține re-render-uri, debounce și abort corecte.
- **UX**: Escape închide dropdown, focus consistent, mesaje de eroare clare.

---

## 1. Race condition la `loading`

**Problema**: La request abortat, `finally` tot rulează și face `setLoading(false)`. Dacă un al doilea request e deja în curs, loading devine false prematur.

**Soluție**: Folosim un „search id” (ref incrementat la fiecare nou request). În `performSearch` în `finally` facem `setLoading(false)` doar dacă request-ul care s-a terminat este încă cel curent (comparăm cu `abortRef.current` / id-ul curent).

---

## 2. `selectedIndex` în afara listei

**Problema**: Când rezultatele se schimbă (ex. mai puține itemuri), `selectedIndex` poate rămâne > `flatList.length - 1` → Enter selectează item greșit sau undefined.

**Soluție**: La schimbarea lui `results` (sau a lungimii listei afișate), clamp: `setSelectedIndex(prev => Math.min(prev, Math.max(0, flatList.length - 1)))`. Poate fi într-un `useEffect` care depinde de `results` / `flatList.length`.

---

## 3. setState după unmount

**Problema**: Utilizatorul navighează repede; `performSearch` se rezolvă după ce componenta s-a demontat → setState pe componentă demontată (warning în React, potențial buguri).

**Soluție**: Ref `mountedRef = true` la mount, `false` la cleanup. În `performSearch` (în toate ramurile care fac setState), verificăm `mountedRef.current` înainte de orice setState (inclusiv în `finally` pentru `setLoading(false)`).

---

## 4. Performanță: listele derivate

**Problema**: `leads`, `serviceFiles`, `trays`, `flatList` se recalculează la fiecare render; `flatListRef.current` e actualizat dar referința listei se schimbă mereu.

**Soluție**: `useMemo` pentru:
- `leads`, `serviceFiles`, `trays` din `results`
- `flatList` din cele 3 liste (primele MAX_PER_GROUP din fiecare)

Astfel reduceri re-render-uri inutile și menținem coerență cu `flatListRef`.

---

## 5. Keyboard: Escape

**Comportament dorit**: Escape închide dropdown și poate readuce focus pe input (opțional). Deja închide dropdown; dacă vrem focus explicit pe input la Escape, apelăm `inputRef.current?.focus()`.

---

## 6. Debounce și cleanup

**Status**: La unmount se face clear la debounce și abort. Păstrăm acest cleanup; nu mai lăsăm timeout-uri sau request-uri „orfane”.

---

## 7. API route

**Status**: Cache 30s, limit 100 chei, auth verificat înainte de cache. Trunchiere query la 200 caractere. Nu e nevoie de modificări pentru „fără buguri” în planul curent.

---

## 8. Istoric (localStorage)

**Status**: Citire la deschidere (query gol), scriere la căutare reușită. Key stabilă, max 8 termeni. Poate rămâne așa; eventual validare JSON la parse (deja în try/catch).

---

## Ordine implementare
1. Ref „search generation” / current request + guard în `finally` pentru `setLoading(false)`.
2. `mountedRef` + guard la toate setState în `performSearch`.
3. Clamp `selectedIndex` la schimbarea rezultatelor (useEffect).
4. `useMemo` pentru `leads`, `serviceFiles`, `trays`, `flatList`.

După aceste pași, search bar-ul este optimizat și robust pentru uz curent.
