# El Cartel 🌵

Rundenbasierte Multiplayer-Drogenkartell-Wirtschaftssimulation. PC/TV zeigt
das gemeinsame Spielfeld, Smartphones sind die persönlichen Kartell-Controller.
Reines HTML/CSS/JavaScript – **kein Node, kein npm, kein Build-Schritt.**
Backend ist Supabase (Postgres + Realtime).

## 1. Supabase-Projekt einrichten (einmalig, ~5 Minuten)

1. Auf [supabase.com](https://supabase.com) ein kostenloses Projekt anlegen.
2. Im Dashboard: **SQL Editor → New query**, den kompletten Inhalt von
   [`supabase/schema.sql`](supabase/schema.sql) einfügen und **Run** klicken.
   Das legt alle Tabellen, Sicherheitsregeln und Realtime-Freigaben an.
3. **Project Settings → API**: `Project URL` und `anon public` Key kopieren.
4. In [`js/config.js`](js/config.js) beide Werte eintragen.

## 2. Lokal ausprobieren

Da es keinen Build-Schritt gibt, reicht ein einfacher lokaler Webserver
(nötig, weil Browser ES-Module nicht von `file://` laden). Z. B. mit Python
(ist auf jedem Mac vorinstalliert):

```bash
cd der-hof
python3 -m http.server 8080
```

Dann `http://localhost:8080` im Browser öffnen (das ist die TV-Ansicht).
Zum Testen als Spieler: Spiel erstellen, den angezeigten Code merken, dann
in einem zweiten Tab `http://localhost:8080/?game=CODE` öffnen.

## 3. Veröffentlichen mit GitHub Pages

1. Repo auf GitHub anlegen, diesen Ordner pushen.
2. **Settings → Pages → Source**: „Deploy from branch“, Branch `main`,
   Ordner `/ (root)`.
3. Nach ein paar Minuten ist die Seite unter
   `https://<dein-user>.github.io/<repo-name>/` erreichbar.
4. Diese URL auf dem Fernseher/PC öffnen → Spiel erstellen → QR-Code wird
   automatisch mit der richtigen Adresse erzeugt, Handys scannen und sind
   direkt drin (keine Registrierung, kein App-Download).

## Spielablauf

- **TV/PC**: Spiel erstellen → Lobby mit QR-Code → Spiel starten, sobald
  genug Spieler beigetreten sind.
- **Handy**: QR-Code scannen → Namen eingeben → jede Runde Mitglieder auf
  Anbau (Koka/Mohn/Cannabis) / Labor (Crystal Meth) / Ausbau (Fuhrpark &
  Verstecke) / Vertrieb & Schmuggel verteilen, optional bewässern/Behörden
  bestechen → „Entscheidungen bestätigen“.
- Sobald alle Spieler bestätigt haben, zeigt der TV **„Runde simulieren“**.
  Klick löst die Berechnung aus, Ergebnisse (Ernte, Meth-Produktion, Erlös,
  Hinweise) werden tabellarisch angezeigt.
- Nach 10 Jahren gibt es einen Abschlussbericht mit gewichteter Bewertung
  (Vermögen, Territorium, Organisation, Einfluss).
- Bei Verbindungsabbruch: Handy merkt sich Spiel + Spieler-ID in
  `localStorage` und stellt den Zustand beim erneuten Öffnen automatisch
  wieder her (kein erneutes Beitreten nötig).

## Architektur

- `js/engine.js` – reine, deterministische Simulationslogik (Wetter/Markt-
  Events werden aus `seed + Runde` abgeleitet, siehe `js/rng.js`, sodass TV
  und alle Handys unabhängig voneinander dasselbe Ereignis berechnen).
- `js/store.js` – sämtliche Supabase-Zugriffe (Spiele/Spieler/Ressourcen/
  Aktionen/Ergebnisse) und der Realtime-Sync.
- `js/host.js` / `js/player.js` – die zwei Oberflächen, reines DOM (kein
  Framework, siehe `js/dom.js`).
- `supabase/schema.sql` – Tabellen + Row-Level-Security + Realtime-Setup.

## Bekannte Einschränkung (bewusste Vereinfachung)

Die Rundenberechnung läuft aktuell im Browser des Gastgeber-Geräts (TV/PC),
nicht in einer serverseitigen Supabase Edge Function. Für ein lokales
Spiel unter Freunden auf vertrauten Geräten ist das unkritisch – es
erfordert aber, dass alle der Konsole des Host-Browsers vertrauen. Für
einen härteren Schutz gegen Manipulation (siehe Konzept-Abschnitt 4.3)
müsste die Berechnung in eine Supabase Edge Function oder eine
`SECURITY DEFINER`-Postgres-Funktion wandern, die Werte nur aus der
`actions`-Tabelle liest statt sie vom Client entgegenzunehmen. Sag
Bescheid, falls das als nächster Schritt gewünscht ist.
