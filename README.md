# Sandstorm CMS/OS

## Vad är Sandstorm?

Sandstorm är ett webbaserat operativsystem och CMS-GUI som simulerar ett desktop-operativsystem direkt i webbläsaren. Det är ett rent frontend-ramverk byggt med ES6-moduler, jQuery och ett eget fönsterhanteringssystem — utan backend-krav.

## Teknisk stack

| Komponent | Teknologi |
|-----------|-----------|
| Kärnspråk | Vanilla JavaScript (ES6-moduler) |
| DOM/Events | jQuery 3.7.1 + jQuery UI |
| Touch-stöd | jquery.ui.touch-punch |
| Drag-sortering | Sortable.js |
| Styling | CSS-variabler (tema-system) |
| Entry point | `index.html` → `sandstorm.gen.js` |

## Filstruktur

```
version21/
├── index.html                  # Bootstrap-konfiguration
├── sandstorm.gen.js            # Global initiering & app-namespace
├── svgs.js                     # SVG-ikondefinitioner
│
├── res/                        # Bibliotek & resurser
│   └── js/
│       ├── jquery-3.7.1.min.js
│       ├── jquery-ui.min.js
│       ├── jquery.ui.touch-punch.min.js
│       └── sortable.min.js
│
├── wallpaper/                  # Skrivbordsbilder
│   └── huacachina-4173731_1920.jpg
│
├── sandstorm/
│   └── components/             # OS-kärnan
│       ├── api.js              # HTTP/fetch-wrapper (ApiRequest)
│       ├── body.js             # DOM-initiering
│       ├── desktop.js          # Bakgrund, wake-up, tema
│       ├── load.js             # Laddningssekvens & bootstrap
│       ├── menu.js             # Menysystem
│       ├── program.js          # Programlivscykel (Map-baserad)
│       ├── startmenu.js        # Startmeny med flikar
│       ├── taskbar.js          # Aktivitetsfält
│       ├── ui.js               # Fönster- & menyrendering
│       │
│       ├── controlpanel/       # Kontrollpanel (under utveckling)
│       ├── desktop/
│       │   └── icons.js        # Skrivbordsikoner
│       ├── explorer/           # Filhanterare (under utveckling)
│       ├── login/              # Inloggning (inaktiverad)
│       ├── networkmonitor/     # Nätverksmonitor (under utveckling)
│       │
│       └── ui/                 # UI-widgets
│           ├── calendar.js     # Datumväljare
│           ├── capsLock.js     # Caps Lock-indikator
│           ├── caret.js        # Textmarkör
│           ├── input.js        # Inmatningsfält
│           ├── slider.js       # Skjutreglage
│           ├── tags.js         # Tagginmatning
│           ├── toggleWindow.js # Fönsterväxling
│           ├── win.js          # Window-klass
│           └── window.js       # Fönsterhanterare
│
└── program/                    # Applikationer
    ├── calc/                   # Miniräknare
    ├── notepad/                # Texteditor
    ├── gui/                    # Layoutkomponent-demo
    ├── mail/                   # E-postklient (under utveckling)
    ├── solitaire/              # Kortspel
    └── formbuilder/            # Formulärdesigner (under utveckling)
```

## Startsekvens

`index.html` anropar `app.load.system()` som kör följande i ordning:

1. UI-kärna (`ui.js`, `api.js`, `body.js`)
2. UI-widgets (`capsLock`, `caret`, `calendar`, `window`, `toggleWindow`, `menu`)
3. Skrivbord (`desktop.js`, `icons.js`)
4. Programhanterare (`program.js`)
5. Aktivitetsfält & startmeny (`taskbar.js`, `startmenu.js`)
6. Externa bibliotek (jQuery, jQuery UI)
7. SVG-ikoner och CSS
8. Inbyggda systemprogram (`networkmonitor`, `explorer`, `controlpanel`)
9. Användarkonfiguration från `index.html` (bakgrund, ikoner, program)

## Inkluderade program

### Calculator (`program/calc/`)
Miniräknare med 270×380px fönster.
- Filer: `calc.js` (UI & setup), `calc_data.js` (logik & events)
- Tangentbordsstöd: `0–9`, `+`, `-`, `*`, `/`, `.`, `Enter`, `Backspace`, `Escape`
- Fyra kolumner med specialknappar (sin, cos, sqrt, etc.)

### Notepad (`program/notepad/`)
Texteditor med 600×480px fönster, stöder flera instanser (`multistart: true`, `autorun: true`).
- Filer: `notepad.js` (UI & setup), `notepad_data.js` (logik & CSS)
- Menyer: File, Edit, View
- Funktioner: Fliksystem, Sök/ersätt-toolbar, Statusbar

### GUI Demo (`program/gui/`)
Interaktiv showcase av tillgängliga layoutkomponenter (650×550px).
- Visar: knappar, inmatningsfält, kryssrutor, Flexbox-layout, Grid-layout, paneler

### Solitaire (`program/solitaire/`)
Klassiskt kortspel med 670×550px resizable fönster.
- Meny: Game → New Game / Deal / Undo / Hint

### Mail (`program/mail/`) — under utveckling
E-postklient med navigationskolumn och mappar (Inbox, Drafts, Sent).
- Filer: `mail.js`, `style.css`
- SVG-ikoner: mail, send, settings, contacts, inbox

### Form Builder (`program/formbuilder/`) — under utveckling
Formulärdesigner med 1100×800px resizable fönster, jQuery-baserad.

### Explorer (`sandstorm/components/explorer/`) — under utveckling
Filhanterare.

### Control Panel (`sandstorm/components/controlpanel/`) — under utveckling
Systeminställningar (teman, språk, programkonfiguration).

### Network Monitor (`sandstorm/components/networkmonitor/`) — under utveckling
Nätverksövervakning.

## Programstruktur

Varje program exporterar `setup()` och `start()` (valfritt `data()`):

```javascript
// program/myprog/myprog.js
export function setup(os) {
    // Lägg till SVG-ikon (valfritt)
    os.svg.global.load({ id: "myprog-icon", viewBox: "0 0 24 24", content: "<path .../>" });

    // Registrera programmet
    os.program.addInfo("myprog", {
        name: _("My Program"),
        version: "1.0",
        owner: "Dev",
        description: _("Description"),
        icontype: "svg",
        icon: "#myprog-icon",
        taskbar: true,
        startmenu: true,
        multistart: false,   // tillåt flera instanser
        autorun: false,      // starta vid systemstart
        desktop: true,
        main: "start"
    });
}

export function start(os) {
    const win = os.ui.windowStart("myprog", {
        id: "myprog-win",
        title: _("My Program"),
        windowIcon: true,
        resizable: true,
        width: "600px",
        height: "400px",
        menu: {
            // valfri menystruktur
        },
        body: function() {
            // returnera UI-definition
        }
    });
}
```

### SVG Resource Manager (`app.svg`)

`app.svg` är ett ägarskaps-/livscykellager ovanpå den låg-nivå-primitiven `app.load.addSVG()`:

- **`app.svg.global.load(svg)`** — för ikoner som ska finnas oavsett om programmet körs eller inte: programmets `icon` i `addInfo()` (visas i Startmenyn, Control Panel, taskbar), och systemikoner. Lever hela OS-sessionen.
- **`app.svg.private.load(programId, svgOrList)`** / **`app.svg.private.unload(programId)`** — reserverat för resurser som bara ska existera medan programmet faktiskt körs (t.ex. verktygsikoner i ett öppet fönster). Avlastas automatiskt när programmets sista fönster stängs (via `app.program.onExit`).
- `app.load.addSVG()` / `app.load.removeSVG()` är kvar som **låg-nivå-primitiver** för bakåtkompatibilitet, men nya program bör använda `app.svg.global.load()` / `app.svg.private.load()`.
- **Alla SVG-id:n delar ett globalt namespace** — `<symbol id="...">` har ingen separat scoping per ägare, så `global`- och `private`-resurser med samma id kan inte samexistera. Välj unika id:n (t.ex. prefixade med programnamnet vid osäkerhet).

### Registrera i index.html

Lägg till programmets sökväg i laddningslistan och starta via konfigurationsobjektet.

## Backend-integration

`sandstorm/components/api.js` tillhandahåller `ApiRequest`-klassen med timeout (standard 40 000 ms), loggning och kedjebara callbacks:

```javascript
// GET-anrop
os.api.get('/api/content', { id: 123 })
    .then(data => updateContent(data))
    .catch(err => console.error(err));

// POST-anrop
os.api.post('/api/save', { content: "text" })
    .then(response => showSuccess())
    .catch(err => showError(err));
```

Kompatibelt med PHP, .NET, Java eller vilken REST-backend som helst.

## Tema-system

CSS-variabler styr hela utseendet:

```css
--theme-backgroundColor       /* Huvudbakgrund */
--theme-fontcolor             /* Texttärg (standard: white) */
--theme-backgroundcolorc      /* Semi-transparent bakgrund */
```

Sätt teman via Control Panel eller direkt i `index.html`-konfigurationen.

## Lokalisering

Global `_()` funktion för översättning. Lägg till strängar i `sandstorm.gen.js` translatonstabellen.

```javascript
name: _("Calculator")  // Hämtar översatt sträng
```

## Installation och körning

### Krav
- Modern webbläsare (Chrome, Firefox, Edge)
- Lokal webbserver (p.g.a. ES6-moduler kräver HTTP)

### Snabbstart
```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# Öppna sedan http://localhost:8000
```

## Arkitektur-principer

- **Frontend-only**: Ingen backend krävs, allt körs i webbläsaren
- **ES6-moduler**: `setup()` / `start()` / `data()` per program
- **WeakMap-fönsterhantering**: DOM-element kopplas till fönsterobjekt via WeakMap
- **jQuery-events**: Delegerad event-binding för dynamiskt innehåll
- **Modulär laddning**: Komponenter laddas i definierad ordning via `load.js`

## Licens

MIT License
