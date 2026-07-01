# BidSphere — Podsumowanie implementacji i wątku badawczego

## Co zostało zbudowane

Platforma aukcyjna BidSphere służy jako demonstrator technicznego rozwiązania problemu integralności plików 3D (format GLB) dystrybuowanych przez internet. Aplikacja zbudowana w Next.js 15 / MongoDB / Prisma łączy dwie warstwy ochrony.

**Pierwsza warstwa (dostęp i transport):** Pliki 3D przechowywane są w Cloudinary jako zasoby chronione. Dostęp do modelu wymaga podpisanego URL generowanego przez serwer na żądanie (ważnego 1 godzinę). Serwer weryfikuje sesję użytkownika, generuje URL i strumieniuje plik przez własne proxy (`/api/model/[itemId]`) z nagłówkiem `Cache-Control: no-store`, uniemożliwiając buforowanie po stronie klienta. Każdy dostęp jest rejestrowany w bazie danych.

**Druga warstwa (kryptograficzna integralność):** W momencie wgrywania modelu system oblicza skrót SHA-256 pliku i rejestruje go w smart kontrakcie `ModelRegistry` napisanym w Solidity 0.8.19, wdrożonym w sieci testowej Ethereum (Sepolia). Komponent `VerificationBadge` po stronie klienta pobiera model przez proxy, oblicza skrót lokalnie (`crypto.subtle.digest`) i porównuje z wartością zapisaną on-chain. Niezgodność jest natychmiast widoczna jako alert o manipulacji.

**Rozszerzenie o drzewo Merkle (wkład badawczy):** Administrator może grupować modele w partie i rejestrować na blockchainie wyłącznie jeden korzeń drzewa Merkle zamiast osobnych wpisów dla każdego pliku. Implementacja w TypeScript (`lib/merkle.ts`) obejmuje budowę drzewa (`buildMerkleTree`), generowanie dowodu (`generateProof`) i jego weryfikację (`verifyProof`). Zastosowano sortowanie leksykograficzne przy wyznaczaniu węzłów wewnętrznych (determinizm niezależny od kolejności) oraz zabezpieczenie przed CVE-2012-2459 (odrzucanie indeksów z padding zone drzewa).

Każdy model może pobrać plik `proof.json` zawierający ścieżkę Merkle (kilkaset bajtów). Samodzielny weryfikator `verify.html` jest plikiem HTML bez żadnych zależności zewnętrznych, który pozwala w całości offline sprawdzić autentyczność pliku GLB, porównując odtworzony korzeń z zaufaną tablicą korzeni wbudowaną w plik. Moduł `simulateTamper` w panelu administracyjnym umożliwia kontrolowaną symulację ataku (podmiana ścieżki pliku przy zachowaniu oryginalnego skrótu on-chain) na potrzeby eksperymentów.

---

## Jaki problem jest rozwiązywany

Protokół TLS 1.3 (HTTPS/SSL) chroni dane wyłącznie *w locie*: zapewnia poufność i integralność transmisji, ale nie gwarantuje nic o stanie pliku po stronie serwera ani po jego pobraniu. Skompromitowany serwer może dostarczyć zmodyfikowany plik przez poprawne połączenie HTTPS, a odbiorca nie ma narzędzia do wykrycia tego faktu. Problem ten określa się jako brak ochrony danych *w spoczynku*.

Dla plików 3D używanych bezpośrednio w procesach produkcyjnych (druk 3D, implanty medyczne) nawet drobna modyfikacja geometrii może mieć poważne konsekwencje. BidSphere demonstruje, jak połączenie hashowania kryptograficznego z niezmienialnym rejestrem (blockchain) wypełnia tę lukę.

---

## Zastosowania praktyczne

- **Przemysł lotniczy i wojskowy:** Weryfikacja geometrii plików przed drukiem 3D części zamiennych w warunkach izolowanej sieci (np. baza polowa), gdzie połączenie z zewnętrznym serwerem jest niemożliwe lub nie jest zaufane.
- **Medycyna i protetyka:** Walidacja modeli implantów przed produkcją bez konieczności połączenia z siecią producenta.
- **Rynek cyfrowych assetów premium:** Certyfikacja oryginalności projektów 3D, gdzie autentyczność pliku przekłada się na wartość handlową i odpowiedzialność prawną.

---

## Porównanie z istniejącymi podejściami (wątek analityczny)

Ten sam problem (integralność pliku niezależna od stanu serwera) jest rozwiązywany przez kilka różnych podejść technicznych. Poniżej trzy najważniejsze punkty odniesienia.

**Podpisy cyfrowe (PGP / X.509).** Rozwiązują ten sam problem: wydawca podpisuje plik kluczem prywatnym, odbiorca weryfikuje podpis kluczem publicznym offline. Jest to podejście dojrzałe i szeroko stosowane (np. dystrybucja pakietów w Linuksie). Słabość polega na tym, że bezpieczeństwo całego systemu zależy od jednego sekretu: wyciek klucza prywatnego kompromituje wszystkie dotychczas podpisane pliki i wymaga od odbiorców unieważnienia i ponownej weryfikacji całej historii. W modelu blockchain nie ma jednego klucza do wykradzenia: każdy zarejestrowany skrót jest zapisany w łańcuchu bloków z sygnaturą czasową i nie można go usunąć ani zmienić. Wadą podejścia blockchain jest natomiast koszt transakcji i zależność od żywotności sieci.

**IPFS (InterPlanetary File System).** IPFS adresuje pliki przez ich skrót (Content Identifier, CID), co oznacza, że zmiana pliku automatycznie zmienia jego adres i pobierający otrzyma inny zasób niż oczekiwał. Rozwiązuje więc problem integralności, ale sprzęga ze sobą weryfikację z transportem: aby zweryfikować plik, trzeba go pobrać przez sieć IPFS, co wymaga działającego węzła lub bramy. W proponowanym rozwiązaniu weryfikacja jest całkowicie oddzielona od transportu: plik można pobrać dowolnym kanałem (CDN, e-mail, nośnik USB), a weryfikacja polega wyłącznie na lokalnych obliczeniach z użyciem `verify.html`. IPFS nie jest też zaprojektowany do gwarantowania trwałości danych: plik może zniknąć z sieci, jeśli nikt nie "przypina" go do swojego węzła.

**Dlaczego to podejście nie jest powszechne.** Połączenie drzewa Merkle z publicznym blockchainem jako rejestrem integralności dla dowolnych plików binarnych (nie kryptowalut ani tokenów NFT) jest stosunkowo niszowym zastosowaniem. Główne powody są dwa: po pierwsze, dla typowych zastosowań (dystrybucja oprogramowania, dokumenty) podpisy cyfrowe są wystarczające i znacznie prostsze w operacji. Po drugie, blockchain wiąże się z kosztami transakcji (gazem) i wymaga portfela kryptograficznego po stronie wydawcy, co stanowi barierę wdrożeniową. Zastosowanie tej techniki ma wyraźne uzasadnienie dopiero w scenariuszach, gdzie: (a) nie można zaufać żadnemu centralnemu podmiotowi zarządzającemu kluczami, (b) wymagana jest weryfikacja offline bez połączenia z serwerem wydawcy, oraz (c) rejestr musi być publicznie audytowalny bez uprzedniej relacji zaufania z odbiorcą. Branże wymienione powyżej (lotnictwo, medycyna, przemysłowy handel assetami) spełniają wszystkie trzy warunki jednocześnie.
