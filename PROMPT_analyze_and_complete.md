# Prompt: Analysera Sandstorm CMS/OS och rekommendera UI-komponenter

Använd denna prompt direkt till Claude Code eller liknande AI för att få konkreta rekommendationer.

---

## Prompt (kopiera och klistra in)

```
Du ska analysera ett webbaserat desktop-OS byggt i vanilla JavaScript med ES6-moduler och jQuery.
Projektet ligger i: version21/

## STEG 1 – Läs referensimplementationer

Läs dessa två färdiga program och förstå exakt hur de är byggda:

- program/calc/calc.js          ← setup() + os.ui.windowStart() + os.ui.body() renderer
- program/calc/calc_data.js     ← event-logik kopplad via { script: { path, call } }
- program/notepad/notepad.js    ← setup() med menu-objekt + multistart + instanceId-mönster
- program/notepad/notepad_data.js ← data-logik, win._np command-objekt, addCSS

Notera dessa mönster som MÅSTE följas:
1. setup(os) registrerar programmet med os.program.addInfo() + lägger till SVG-ikon
2. start(os) anropar os.ui.windowStart() med { id, title, resizable, width, height, menu, body }
3. body()-funktionen bygger UI med os.ui.body(uiDef).render() ELLER returnerar HTML-sträng
4. Logik-filen laddas via { script: { path: "mapp/fil.js", call: "data" } } i body-subs
5. CSS läggs till via os.addCSS("nyckel", css-sträng) eller os.addCSS("nyckel", url, true)
6. CSS-variabler: --theme-backgruondcolora, --theme-backgruondcolorb, --theme-backgruondcolorc, 
   --theme-blur, --theme-borderradius, --theme-fontcolor, --theme-opacity

## STEG 2 – Läs de ofärdiga programmen

Läs dessa filer och kartlägg exakt vad som SAKNAS:

### A) Explorer
- sandstorm/components/explorer/explorer.js
  → start()-funktionen returnerar bara strängen "Coming soon"
  → Fönsterstorlek: 1000×868px, resizable: true
  → Behöver en komplett filhanterare

### B) Control Panel  
- sandstorm/components/controlpanel/controlpanel.js
  → Har redan: left sidebar (bar.left), theme-panel, customize-panel, taskbar-panel, about-dialog
  → SAKNAS: main()-fönstrets body returnerar "" (tom sträng, rad ~114)
  → SAKNAS: Users-sektionens underpaneler (My Account, All Users, Settings for fields, Add User)
  → SAKNAS: en default startsida/dashboard när main-fönstret öppnas

### C) Mail
- program/mail/mail.js
  → Har redan: 3-kolumn layout (nav|lista|detalj), inbox/sent/drafts, contacts, compose-form
  → Har redan: mobil-responsivitet, filter/sortering, konversationstrådar, tags-widget
  → start() laddar style.css via os.addCSS(...)
  → SAKNAS: faktisk send-funktion (visar bara alert)
  → SAKNAS: reply-formulär (klickar Reply → öppnar compose med prefyllt To/Subject)
  → SAKNAS: paginering (HTML finns men ingen logik för sidväxling)
  → SAKNAS: mail/mail_data.js fil för att separera logiken (följ notepad-mönstret)

## STEG 3 – Läs tillgängliga UI-widgets

Läs dessa filer för att se vilka widgets som REDAN FINNS:

- sandstorm/components/ui/calendar.js    ← datumväljare
- sandstorm/components/ui/input.js       ← inmatningsfält
- sandstorm/components/ui/slider.js      ← skjutreglage (används i controlpanel theme-panel)
- sandstorm/components/ui/tags.js        ← tagginmatning (används redan i mail compose-to)
- sandstorm/components/ui/win.js         ← Window-klass
- sandstorm/components/ui/window.js      ← Fönsterhanterare
- sandstorm/components/ui/toggleWindow.js ← Fönsterväxling
- sandstorm/components/ui/capsLock.js    ← Caps Lock-indikator
- sandstorm/components/ui/caret.js       ← Textmarkör

Kontrollera också:
- sandstorm/components/api.js            ← ApiRequest-klassen (fetch-wrapper med timeout 40000ms)
- res/js/sortable.min.js                 ← finns för drag-drop
- svgs.js                                ← befintliga ikoner i systemet

## STEG 4 – Leverera KONKRETA rekommendationer

För varje program (Explorer, Control Panel, Mail), svara på:

### 4A – Vilka BEFINTLIGA widgets kan användas direkt?
Lista exakt: widget-namn → hur den används i just detta program

### 4B – Vilka UI-komponenter SAKNAS och måste byggas?
Lista: komponent-namn, vad den gör, vilken befintlig komponent som liknar den mest

### 4C – Filstruktur (följ notepad-mönstret)
Föreslå exakt vilka filer som ska skapas, t.ex.:
- program/explorer/explorer.js      (setup + start)
- program/explorer/explorer_data.js (logik + events, laddas via script-node)
- program/explorer/style.css        (om CSS är stor, annars inline med os.addCSS)

### 4D – Prioriterad implementationsordning
Vilket program och vilken del ska implementeras FÖRST för att ge mest värde snabbast?

### 4E – Konkret kod för det mest kritiska saknade pusselbiten
Skriv faktisk kod för den enskilt viktigaste saknade delen – inte pseudokod.
Följ exakt samma kodstil som calc.js och notepad.js.
```

---

## Vad denna prompt producerar

Svaret du får tillbaka innehåller:
- Exakt vilka av de 9 befintliga UI-widgets som passar varje program
- Lista på saknade komponenter som behöver byggas (t.ex. träd-vy för Explorer)
- Korrekt filstruktur som följer projektet conventions
- Prioriteringsordning (vad du ska skriva klart först)
- Faktisk startkod för den viktigaste saknade delen

## Snabb sammanfattning av nuläget

| Program | Status | Kritisk saknad del |
|---------|--------|-------------------|
| **Explorer** | 5% – bara fönsterstomme | Hela UI: filträd + filista + toolbar |
| **Control Panel** | 70% – panels finns, main-fönster tomt | `main()`-fönstrets body + Users-paneler |
| **Mail** | 85% – nästan klart | Logik-separation + reply-formulär + paginering |

## Tips för bästa resultat

Lägg till detta i slutet av prompten om du vill ha kod direkt:

```
Börja med Control Panel eftersom 70% redan finns och main()-fönstret bara behöver
${app.controlpanel.bar.left(app)} + default content-panel kopplat ihop korrekt.
Skriv den kompletta, fungerande main()-body-funktionen som startsida.
```
