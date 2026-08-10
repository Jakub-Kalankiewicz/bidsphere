# BidSphere — Podsumowanie implementacji i wątku badawczego

## Co zostało zbudowane

Platforma aukcyjna BidSphere służy jako demonstrator technicznego rozwiązania problemu integralności plików 3D (format GLB) dystrybuowanych przez internet. Aplikacja zbudowana w Next.js 16.1.6 / MongoDB / Prisma łączy dwie warstwy ochrony.

**Pierwsza warstwa (dostęp i transport):** Pliki 3D przechowywane są w Cloudinary jako zasoby chronione. Dostęp do modelu wymaga podpisanego URL generowanego przez serwer na żądanie (ważnego 1 godzinę). Serwer weryfikuje sesję użytkownika, generuje URL i strumieniuje plik przez własne proxy (`/api/model/[itemId]`) z nagłówkiem `Cache-Control: no-store`, uniemożliwiając buforowanie po stronie klienta. Obecna implementacja zapisuje wizytę na stronie modelu, lecz sam endpoint strumieniujący plik nie tworzy osobnego wpisu audytowego.

**Druga warstwa (kryptograficzna integralność):** W momencie wgrywania modelu system oblicza skrót SHA-256 pliku i rejestruje go w smart kontrakcie `ModelRegistry` napisanym w Solidity 0.8.19. Powtarzalne pomiary są przygotowane dla lokalnej sieci Hardhat; wybrane przypadki mają zostać później potwierdzone w sieci testowej Sepolia, po skonfigurowaniu adresu wdrożonego kontraktu. Komponent `VerificationBadge` po stronie klienta pobiera model przez proxy, oblicza skrót lokalnie (`crypto.subtle.digest`) i porównuje z wartością zapisaną on-chain. Niezgodność jest natychmiast widoczna jako alert o manipulacji.

**Rozszerzenie o drzewo Merkle (wkład badawczy):** Administrator może grupować modele w partie i rejestrować w jednej transakcji korzeń drzewa Merkle. Implementacja w TypeScript (`lib/merkle.ts`) obejmuje budowę drzewa (`buildMerkleTree`), generowanie dowodu (`generateProof`) i jego weryfikację (`verifyProof`). Sortowanie leksykograficzne powoduje, że kolejność wewnątrz pary rodzeństwa nie wpływa na jej hash; kolejność całej listy liści nadal określa ich grupowanie. Walidacja `leafIndex < totalLeaves` odrzuca indeksy ze strefy dopełnienia i chroni przed niejednoznacznością analogiczną do problemów duplikowanych liści, bez przesądzania pełnej równoważności z CVE-2012-2459. Kontrakt zapisuje identyfikatory wszystkich modeli i aktualizuje dla nich mapowanie, więc koszt partii nie jest stały.

Każdy model może pobrać plik `proof.json` zawierający ścieżkę Merkle. Samodzielny weryfikator `verify.html` działa bez wywołań sieciowych i sprawdza integralność pliku GLB względem lokalnej kotwicy obejmującej identyfikator sieci, adres kontraktu i zaufaną tablicę korzeni. Do czasu wpisania rzeczywistego adresu kontraktu i korzeni weryfikator celowo nie zaakceptuje dowodu. Nazwa i identyfikator modelu, czas rejestracji, indeks oraz liczba liści z pliku `proof.json` są jawnie oznaczone jako dane nieuwierzytelnione przez liść, ponieważ liściem drzewa jest wyłącznie skrót pliku; indeks i liczba liści służą kontroli strukturalnej. Nie stanowi to pełnego dowodu autentyczności bez bezpiecznej dystrybucji samego weryfikatora lub kotwicy zaufania. Moduł `simulateTamper` w panelu administracyjnym umożliwia kontrolowaną symulację ataku na potrzeby eksperymentów.

---

## Jaki problem jest rozwiązywany

Protokół TLS 1.3 zapewnia poufność i integralność transmisji między stronami połączenia. Nie wykrywa jednak sytuacji, w której prawidłowo uwierzytelniony, lecz skompromitowany serwer świadomie przesyła zmieniony plik. Rozpatrywany problem dotyczy zatem niezależnej, end-to-endowej kontroli integralności obiektu względem kotwicy zaufania, a nie braku integralności samego kanału TLS.

Dla plików 3D używanych bezpośrednio w procesach produkcyjnych (druk 3D, implanty medyczne) nawet drobna modyfikacja geometrii może mieć poważne konsekwencje. BidSphere demonstruje, jak połączenie hashowania kryptograficznego z niezmienialnym rejestrem (blockchain) wypełnia tę lukę.

---

## Zastosowania praktyczne

- **Przemysł lotniczy i wojskowy:** Weryfikacja geometrii plików przed drukiem 3D części zamiennych w warunkach izolowanej sieci (np. baza polowa), gdzie połączenie z zewnętrznym serwerem jest niemożliwe lub nie jest zaufane.
- **Medycyna i protetyka:** Walidacja modeli implantów przed produkcją bez konieczności połączenia z siecią producenta.
- **Rynek cyfrowych assetów premium:** Certyfikacja oryginalności projektów 3D, gdzie autentyczność pliku przekłada się na wartość handlową i odpowiedzialność prawną.

---

## Porównanie z istniejącymi podejściami (wątek analityczny)

Ten sam problem (integralność pliku niezależna od stanu serwera) jest rozwiązywany przez kilka różnych podejść technicznych. Poniżej trzy najważniejsze punkty odniesienia.

**Podpisy cyfrowe (PGP / X.509).** Wydawca podpisuje plik kluczem prywatnym, a odbiorca może zweryfikować podpis offline. Kompromitacja klucza pozwala tworzyć nowe fałszywe podpisy i wymaga procedury unieważniania oraz rozstrzygnięcia, kiedy nastąpiło przejęcie; nie oznacza automatycznie, że wszystkie wcześniejsze podpisy stają się kryptograficznie niepoprawne. BidSphere również ma uprzywilejowany klucz: tylko `owner` kontraktu może rejestrować hashe i korzenie. Przejęcie tego klucza pozwoliłoby dopisywać złośliwe dane, choć nie pozwoliłoby zmienić wcześniejszej historii blockchaina. Porównanie musi więc uwzględniać zarządzanie kluczami po obu stronach, a także koszt gazu i zależność od sieci.

**IPFS (InterPlanetary File System).** IPFS stosuje adresowanie treścią: zmiana danych prowadzi do innego identyfikatora CID. Dysponując plikiem i oczekiwanym CID, kontrolę zgodności można wykonać lokalnie, pod warunkiem odtworzenia tych samych parametrów kodowania i struktury DAG. Sieć IPFS lub brama jest potrzebna do pobierania, lecz nie jest bezwzględnym warunkiem samej kontroli już posiadanych danych. Adresowanie treścią nie gwarantuje też trwałej dostępności; wymaga utrzymywania danych przez węzły lub usługę pinning. W BidSphere plik również może zostać dostarczony dowolnym kanałem, natomiast osobnym problemem pozostaje zaufana dystrybucja korzenia Merkle.

**Dlaczego to podejście nie jest powszechne.** Dla wielu zastosowań podpisy cyfrowe są prostsze operacyjnie, natomiast publiczny blockchain wprowadza koszt gazu, zależność od sieci i konieczność ochrony klucza właściciela kontraktu. Podejście BidSphere jest warte rozważenia, gdy istotne są publiczna audytowalność i niezmienność historii rejestracji, grupowanie wielu obiektów jednym korzeniem oraz późniejsza weryfikacja offline. Nie usuwa ono wszystkich centralnych punktów zaufania: właściciel kontraktu decyduje o nowych wpisach, a odbiorca musi bezpiecznie otrzymać zaufany korzeń. Wskazane zastosowania branżowe są hipotezami motywującymi i wymagają oceny względem konkretnych regulacji oraz modeli zagrożeń.
