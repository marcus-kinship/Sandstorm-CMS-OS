# Sandstorm — teknisk arkitektur

Detta är en teknisk referens över hur projektet faktiskt hänger ihop: boot-sekvensen, fönster-/program-systemet, skrivbordsskalet (taskbar, startmeny, sök, notiser, cursor, inloggning, kontrollpanel), Explorer, Designer och de mindre programmen. `README.md` är en högnivå-introduktion (delvis föråldrad); det här dokumentet beskriver mekaniken.

---

## 1. OS-lagret

### Entry point-kedjan

```
index.html
  └─ <script src="sandstorm.gen.js">   ← boot-shield, loading screen, modul-loader
       └─ s(async function(app) { await app.load.system({...}) })
            └─ sandstorm/components/load.js  (systemets orkestrering)
```

`sandstorm.gen.js` är **inte** en genererad build-artefakt trots namnet — det är en handskriven fil (bekräftat: `combine.vbs` refererar den aldrig). Den gör flera saker synkront innan något annat laddas:

1. Injicerar en mörk `<style>` (`html,body{background:#000}`) så man aldrig ser en vit flash innan boot startar.
2. Registrerar en `pointermove`-lyssnare (`globalThis.__sandstormBootMouse`) redan innan modul-loadern startar. Cursor Engine laddas sent (efter `svg.js`/`svg-morph.js`), och utan denna tidiga spårning har den inget sätt att veta var pekaren verkligen befinner sig om musen inte rört sig sedan sidladdning — den skulle annars starta från en hårdkodad `(0,0)` och synligt glida in från hörnet vid första musrörelsen (se avsnitt 10).
3. Sätter upp ett eget loading-screen vid `DOMContentLoaded` som medvetet återanvänder samma id:n/klasser som `load.js`s `setLoadingScreen`/`removeLoadingScreen` — den senare hoppar då bara över (overlayen finns redan) och städar upp normalt utan dubbelarbete.
4. `showErrorOverlay()` (boot-fel-skärmen) fadear in via ett dubbel-`requestAnimationFrame`-mönster innan `opacity` sätts till `1` — en samma-tick-ändring triggar inte tillförlitligt CSS-transitionen eftersom webbläsaren inte hunnit committa startvärdet `opacity:0`. Utan detta poppade overlayen in direkt medan `removeErrorOverlay()` ändå tonade ut den, en synlig asymmetri.
5. Bootstrap:ar modul-loadern (`sandstorm/core/modules.js`) via dynamisk `import()`.

`config.local.jsapiLink: "/demo/api/jsapi"` är medvetet en absolut sökväg, inte bas-relativ: JSAPI-gatewayen ligger under `site/demo/` i den omgivande Kinship PHP-appen, en helt annan toppnivåsökväg än den här statiska demo-OS-klonens egen rot (som `base` annars korrekt pekar på). `breakpoints`-objektets tre fält konsumeras på olika håll: `mobile` (700) av fönsterlayout i `desktop.js`/`window.js`, `tablet` (1024) av tablet-läge i `desktop.js`, `taskbar` (705) av taskbar/startmenu-mobilväxlingen i `taskbar/index.js`.

`dev._parseStack()` hanterar två stack-trace-format beroende på JS-motor: V8 (Chrome/Edge/Node) har en `"Error"`-headerrad följt av rader som börjar med `"at "`; SpiderMonkey (Firefox)/JSC (Safari) har redan en frame-rad direkt. Anropskedjan `_parseStack → log/warn/error → caller` avgör vilket radindex (3 respektive 2) som faktiskt är anroparens frame.

### `load.js` — tre separata listor, tre olika timing-garantier

`app.load.system(config)` tar emot tre listor som **inte** är utbytbara mot varandra:

| Lista | Körs | Semantik |
|---|---|---|
| `loadingScreen.systemfiles` | Sekventiellt, synkront-per-fil, under loading screen | Ren infrastruktur (`ui.js`, `desktop.js`, `taskbar/*.js` …). Körs ofta side-effecting kod på modul-top-level (t.ex. `desktop.js` anropar `app.svg.global.load()` direkt) — därför måste ordningen i arrayen matcha exekveringsordningen exakt. |
| `programs` (= `loadingScreen.programs` + toppnivå-`config.programs` sammanslagna) | Sekventiellt, `await app.includeProgram(path, root)` per program | Varje programs `setup(os)` körs här, **innan** `start:` någonsin börjar. Det är därför `notifications/setup.js`s `os.dom.waitFor('#timeDisplay')`-anrop måste vänta *event-baserat* (`timeout: 0`) — `#timeDisplay` skapas inte förrän `start:`s sista steg, långt senare (se avsnitt 9). |
| `start` (från `index.html`) | Sekventiellt, ett steg i taget, kan innehålla `{loginProgram}` | Login-steget **blockerar hela sekvensen** tills en riktig människa loggar in (`os.dom.waitFor`/`loginPromise`) — `desktop.taskbar.build` (som skapar `#timeDisplay`) är sista steget här. |

Praktisk konsekvens: **allt boot-kritiskt state ett program behöver (SVG-ikoner, `program.addInfo`, `extInfo`-registrering) måste sättas i `setup()`**, eftersom `setup()` garanterat körs klart innan `start:`-sekvensen (och därmed skrivbordet) någonsin visas. `start()` är bara till för att faktiskt rita ett fönster — det körs lazy, första gången användaren öppnar programmet. Explorers `setup/*`-moduler och Media Players statusikon-registrering (avsnitt 17 respektive 21) är konkreta exempel på detta mönster.

### `app.dom.waitFor(selector, {timeout})`

Generisk MutationObserver-baserad väntan, definierad i `load.js`. Default-timeout 5000ms är en **säkerhetsventil**, inte det primära flödet — själva väntan är alltid reaktiv (observer), timeouten avgör bara när den ger upp och resolvar `null`. `{timeout: 0}` = vänta för evigt, använd bara när elementet är *garanterat* att uppstå förr eller senare (t.ex. efter en login-skärm som tar obestämd tid) — se notiser (avsnitt 9) för den verkliga bugg som en begränsad timeout orsakade här.

---

## 2. Program-systemet (`program.js`)

Varje app/systemdel registrerar sig via `os.program.addInfo(id, {...})`. De fält som spelar roll för hur programmet syns i resten av systemet:

```js
os.program.addInfo("fotoviewer", {
    name, version, owner, description,
    icontype: "svg", icon: "#ic-fotoviewer",
    taskbar: false, startmenu: true, desktop: false,
    multistart: true,        // flera samtidiga fönster tillåtna
    autorun: false,          // starta automatiskt vid boot
    main: "start",           // vilken export som är entry-point
    file: "fotoviewer/fotoviewer.js",  // lazy-loaded först vid app.program.open()
    root: "program",
    category: "game",        // valfritt — konsumeras just nu bara av autologout, se avsnitt 11
    historyOnExit: "clear",  // se avsnitt 3, historik-scope
    openWith: [...]          // se nedan — detta är hela extensibility-mekanismen
});
```

`name`/`description` kan skickas antingen som en vanlig sträng eller som en `() => _(...)`-thunk. `addInfo()` gör thunk-fallet till en levande getter — allt som läser `app.program.getInfo(id).name` färskt vid varje rendering (Start-menyns Apps-flik, Explorers `extInfo`-etiketter, …) fångar ett senare språkbyte automatiskt. Det enda undantaget är `taskbar/addtotaskbar.js`s `addProgramsToTaskbar()`, som körs en gång vid boot och bakar in `program.name` som ren text i en separat `config.taskIcons`-post — samma stalehet som `desktop/icons.js`s ikon-etiketter, se avsnitt 5 (Språksystemet) för hela listan av liknande ställen.

### `openWith` → `app.program.extInfo` (den viktiga delen)

`openWith` är en array av `{ ext, icon, icontype, label, description, thumbnail }`. `program.js`s `addInfo()` läser den och gör **två saker per post** automatiskt:

1. Lägger till en handler i `app.program.fileHandlers[ext]` — det är det här dubbelklick-på-fil i Explorer faktiskt slår upp (`rowMenu`/`openFile` i `explorer/window/core.js`).
2. Skriver `app.program.extInfo[ext] = { programId, icon, icontype, label, description, thumbnail }`.

**Explorer känner aldrig till specifika filändelser eller program.** Den frågar bara `app.program.extInfo[ext]` för "vilken ikon hör till den här filtypen" och `app.program.fileHandlers[ext]` för "vilka program kan öppna den här". Det är program (som Fotoviewer, avsnitt 18) som deklarerar sig själva in i de registren — inte tvärtom. Samma mönster gäller Media Player för mp3/mp4/m3u.

---

## 3. Fönsterhantering (`ui/window/*`)

`window.js` är en 1-radig entry som importerar den uppsplittrade implementationen i `sandstorm/components/ui/window/{state,lifecycle,dragresize,menu-body,element,dialogs,index}.js` (`window-element.js`/`window-events.js` var tidigare orphanade dubbletter av samma kod och har slagits ihop hit). Detta avsnitt täcker hela livscykeln: skapande, dialoger, minimera/maximera, drag/resize och snap.

### Skapande och stängning (`dialogs.js`)

`windowStart()`/`basWindow()` sätter `taskId` till bara program-id:t (aldrig ett per-fönster-suffixat id), eftersom `addToTaskbar()` alltid registrerar aktivitetsfälts-ikonen som `#pid-${id}-task` oavsett `single`-läge — ett suffixat taskId skulle aldrig matcha en existerande ikon och tyst göra minimering trasig (`animateWindowToTaskbar` avbryter med "Window or taskbar icon not found." utan att dölja fönstret).

`historyScope:'private'` (opt-in via `os.program.addInfo`) nyckar ett fönsters undo/redo-session på `windowId` istället för `programId` — till skillnad från det publika default-scopet frigörs sessionen redan när just DETTA fönster stängs, inte bara när programmets sista fönster är borta. `historyOnExit:'clear'` (default, gäller bara `'public'`-scope) frigör den delade sessionen när sista fönstret stängs; `'keep'` låter den ligga kvar i `app.historyManager` så den återupptas om programmet öppnas igen. `windowStart()`s privata gren skapar sin session själv (`program.js`s `open()` har redan skapat den publika, innan `windowId` ens fanns) — idempotent, och `WindowElement`s `history`-getter väljer windowId vs programId baserat på samma flagga.

Fade-in-animationens `complete`-callback (inte en gissad frame-räkning) är det enda som släpper markörens "progress"-läge (`app.cursor.startWorking()`/`stopWorking()`, se avsnitt 10) — jQuery:s `complete` ÄR den enda sanningen för "fönstret är nu faktiskt synligt", oavsett `delay(10)`-kön eller hur lång tid animationen faktiskt tog. `stopWorking()` är referensräknad, så ett enda anrop räcker.

`alert()`/`confirm()` hade tidigare den redan minnesloggade "message: bug": bara `options.body` som funktion lästes någonsin, så varje anropsställe i hela appen som skickade in `message:` som ren sträng renderade en tom dialog-kropp — nu fixat centralt, och strängen escapas eftersom den alltid är statustext, aldrig avsiktlig markup. Samma dialogers `.window.d-msgwin`-CSS reflow:ar via en container-query, inte en viewport-`@media`-query — dessa dialoger öppnas ofta inuti en skalad/inbäddad viewport där `window.innerWidth` inte speglar den faktiska renderade bredden. `prompt()`s default-höjd höjdes till `230px` (från en tidigare för kort `180px`) efter att ha uppmätt det faktiska innehållet (~171px + ~20px titelrad-chrome); dess färger sätts explicit eftersom `prompt()`, till skillnad från `alert()`, aldrig injicerar en egen stylesheet. `prompt()`-fönstret stängs via ett explicit uppslaget `windowId`/`programId` (härlett från den klickade knappens `.window`-förälder) istället för `closeActiveWindow()`, som annars riskerar att stänga fel fönster om ett anropande fönster återfår fokus via bubbling precis efter att prompten öppnades.

### `window-modal.js` — låsta dialoger

`lockWindowLayer()` sparar/blur:ar textmarkören (den är `position:fixed` och annars synlig ovanpå overlayen), fadear in overlay och dialog samtidigt via dubbel-`requestAnimationFrame` (samma browser-trick som error-overlayen i avsnitt 1), och sätter overlayens start-`opacity:0` med `!important` så ingen extern CSS kan overrida den. Taskbar-ikonen för dialogen döljs bara när den är programmets ENDA fönster — annars skulle det felaktigt dölja ikonen för ett samtidigt öppet huvudfönster av samma program. Två "stale state guard"-kontroller i `openDialog()` (förälder tror den har en dialog som är borta, respektive dialog tror den hör till en förälder som är borta) återställer länken via `_destroyDialogLink` istället för att krascha.

### `lifecycle.js` — minimera, maximera, stänga

Ett minimerat eller stängt fönster upphör att äga sin snap-kvarts/halv-yta (se snap-zones nedan) så en ny drag mot den kanten ser platsen som ledig. Minimering går alltid via `animateWindowToTaskbar` (även i `instant`-läge, som bara hoppar över den synliga tweenen) eftersom den beräknar positions-/state-data som återställningsvägen är beroende av.

`maximize()` returnerar tidigt om fönstret har en låst modal-dialog (`app.windows.getWindowState(windowId).dialogOpen`). Bakgrund: `pauseResize`/`pauseDrag` (window-modal.js) inaktiverar bara jQuery UI:s drag/resize-handtag — men maximera/återställ är en helt separat kodväg (titelradsknapp OCH kontextmenyrad, båda routade hit) som aldrig var skyddad på samma sätt. Utan detta skydd flyttade en maximering av föräldern storlek/position mitt i en öppen dialog, medan den mörklagda overlayens gränsspårning (`_updateOverlayBounds`) bara följer FÖRÄLDERN — dialogen själv blev kvar exakt där den var, strandsatt utan att nå sina OK/Avbryt-knappar. Vid ny maximering nollställs också `windowElement.data('snap.slots', null)` explicit, annars fortsätter `dragresize.js`s snap-reflow att tvinga fönstret tillbaka i sin gamla kvarts/halv-yta efter avmaximering; storlek/position sparas som RÅ inline-stil (inte computed style) innan maximering, och den återställda storleken vid un-maximize läser medvetet det sparade `win.width`/`win.height`-värdet istället för att mäta om live (se minnesposten "Maximize restore stale-read bug" — en live-läsning racear CSS-transitionen).

### `dragresize.js` — "home"-position, snap och prestanda

Detta är den mest kommentar-täta filen i den ursprungliga kodbasen; en enda arkitektonisk mekanism var tidigare förklarad på fem olika ställen. Sammanfattat:

**"Home"-positionssystemet** (`natural-left`/`natural-top`-dataattribut): `position()` sätter dem till den plats `adjust()` klampar FRÅN och återgår TILL så fort plats finns igen, vid varje webbläsar-resize. Varje användarstyrd drag/resize uppdaterar dem till den nya platsen — inklusive efter en snap, då de sätts till den snappade rektangeln. Genom att alltid klampa från "home" (inte fönstrets nuvarande skärmposition) hittar ett tidigare krympt fönster vägen tillbaka dit användaren lämnade det när webbläsaren förstoras igen.

**Snap-slot-städning**: när ett fönster börjar dras eller maximeras frigörs dess snap-zon (`snapZones.clearWindowFromAllZones`) och `snap.slots` nollställs — annars fortsätter `adjust()`s reflow att tvinga tillbaka det. `commitSnap` sätter tillbaka `snap.slots` vid en ny snap.

**Snap-preview under drag**: hela snap-systemet (inkl. topp-kant-maximera-via-drag) spärras av Shift, av Snap Layout-togglen (Control Panel, avsnitt 12/15) eller av en viewport under tablet-brytpunkten. Vänster/höger-zoner kontrolleras FÖRE topp-zonen — ett hörn nära både en sida OCH toppen måste resolvas till sidans zon, annars kapas det av en topp/maximera-preview. Ghost-lagrets mål-rektangel skapas/uppdateras när det RESOLVADE MÅLET ändras, inte bara sidan, eftersom `resolveSnapTarget`s hörn/mitt-bandning är oberoende av vilken sida man är på. Ghost-lagret använder `box-sizing:border-box` (annars läggs padding ovanpå den exakta bredd/höjd `setTimeout` sätter, och spöket spiller ut under aktivitetsfältet); hint-texten sitter i en gemensam mörk "pill" bakom båda raderna eftersom spöket själv är ett ljust halvgenomskinligt lager (mörk text + ljus skugga var svårläst mot mörkt innehåll). Mål-rektangeln snapshot:as vid samma tick som beslutade att (åter)skapa lagret, eftersom `snapTarget` är en yttre closure-variabel som senare drag-ticks fortsätter omtilldela.

**Resize-prestanda** (`addResizeListener`): rAF-strypt, INTE debounce:ad. En debounce räknar bara om var N:e ms medan kanten dras, så ett fönster som animeras med en CSS-transition (fast varaktighet) jagar ett mål som hela tiden hinner ändras innan det når fram — det stakar sig oavsett dragets hastighet. Att köra på varje frame och applicera positionen momentant gör fönstrets rörelsehastighet identisk med resizens egen, utan en oberoende animationslängd att hamna i otakt med.

**Låst dialog "följer med"**: en låst dialog klampas aldrig direkt i loopen — den flyttas av FÖRÄLDERNS egen gren, med exakt samma delta som föräldern klampas med (annars drar de isär, eller ett par lämnas strandsatt utanför skärmen efter en krympning). Overlayen synkas explicit här (`app.windows.setOverlayBounds`) istället för sin egen MutationObserver-väg, som racear förälderns positionstransition. Snappade fönster hade en bugg-risk: deras storlek är en absolut pixel-rektangel satt vid snap-tillfället, och "klampa från home" rör bara left/top — utan omräkning från sparade slots mot det aktuella arbetsytan skulle ett snappat fönster fastna i sin snap-tidens storlek för evigt.

### `snap-zones.js` och `index.js` — commit och tangentbord

`CORNER_BAND = 0.2`: de översta/nedersta 20 % av arbetsytan räknas som "hörn" (→ kvart), mittersta 60 % som "mitten" (→ halv) — en 20/60/20-uppdelning begärd explicit av användaren framför en jämn 33/33/33, så en vanlig halva är lätt att träffa medan kvartar kräver ett medvetet hörn-sikte. `commitSnap()` kör `windowElement.removeClass('maximized')` explicit: ett fönster som hoppar direkt från maximerat till halv/kvart via tangentbordsgenvägen (`snapQuarter`/`snapHalf` i `index.js`) går aldrig via `lifecycle.js`s egen maximize-toggle-av, och `dragresize.js`s `adjust()` kollar `.hasClass('maximized')` FÖRST — utan detta skulle fönstret tyst snappa tillbaka till helskärm vid nästa resize/reflow trots att rektangeln precis ändrats korrekt.

`snapMaximize()`: redan halv-snappat → eskalera till sidans egen övre kvart; flytande eller redan kvart → maximera. `snapRestore()`: ett snappat fönster har ingen sparad pre-snap-flytande rektangel att återgå till (bara maximera/återställ-paret sparar en sådan) — un-snap lämnar det flytande i sin nuvarande storlek; ett andra W+Ned faller igenom till minimering. Keydown-hanteraren för W+1-9 fixade en verklig buggrapport ("w + 1-9 fungerar inte"): `event.code` matchar bara en fysisk numpad-tangent, som de flesta laptop-tangentbord saknar — `e.key` är redan siffer-strängen "1".."9" för både översta raden OCH numpad-med-NumLock-på, så den kontrolleras direkt; `event.code`-fallbacket behövs bara för numpad-utan-NumLock.

En kvarvarande, ej fixad bugg (utanför scope för denna refaktorering): `app.lock("ui.window.*", ...)` riktar in sig på den singulara strängen `"ui.window.*"`, men objektet som byggs är `app.ui.windows` (plural) — wildcard-uppslaget matchar därför sannolikt aldrig något och no-opar tyst.

### `menu-body.js` — flytande undermenyer

Undermenyer teleporteras till `document.body` (`position:fixed`) när de öppnas, för att fly fönstrets `overflow:hidden`/CSS-transform — `openSubmenus` är en `Set`, `submenu._menuParent` sparar ursprunglig förälder för återflytt vid stängning. Modulens CSS för det flytande läget injiceras EN gång vid modul-laddning (inte per fönster), eftersom `ui.css`s originalselektorer inte matchar när elementet lämnar fönstrets DOM-träd — en tidigare parallell ren CSS `:hover > .submenu { display:block }`-regel togs bort helt (se avsnitt 4) eftersom den slog på `display:block` direkt vid nativ hover, innan JS hunnit omplacera undermenyn, vilket visade den i en frame på fel skärmposition.

`menuInteractionLocked`-flaggan har en rotorsaksutredning bakom sig: att klicka ett löv-alternativ som öppnar ett nytt dialogfönster skiftar layouten tillräckligt för att webbläsaren återutlöser en nativ `mouseenter` på det ursprungliga menyalternativet (pekaren rörde sig aldrig faktiskt) — vilket kör om `showSubmenu()` och återöppnar en undermeny `hideAllSubmenus()` precis stängt. Flaggan spärrar den nästlade mouseenter-hanteraren under klick-kommandots varaktighet plus två animationsframes. Menyalternativens klick-wiring är wrappad i per-item `try/catch`: ett synkront fel vid uppkoppling av ETT alternativ skulle annars propagera ut ur `forEach` och tyst avbryta hela loopen, så varje efterföljande alternativ (i DOM-ordning) blir utan lyssnare — samma mönster som `renderActive()`s per-hook try/catch i Designer (avsnitt 19). Klick på en menyrad anropar `app.setActiveWindow(winId)` explicit eftersom `e.stopPropagation()` (nödvändigt mot dokument-nivåns utanför-klick-stängare) hindrar klicket från att bubbla till fönstrets egen fokus-hanterare — utan detta för ett klick i ett icke-aktivt fönster inte det fönstret till förgrunden.

I `ui.css`: `menu.options.position:'window-title'` (menyraden sammanslagen med titelraden) har egna regler: titeln krymper till sitt eget innehåll så menyn får resterande utrymme; den vanliga `.wm-menu`-halvgenomskinliga bakgrundsboxen (rätt för normala topp/botten/vänster/höger-lägen) utesluts specifikt i window-title-läget, där den annars läser som en överflödig rektangel i en redan halvgenomskinlig titelrad; samma `.menu-container` flyttas till `.control-menu` vid overflow och byter då layout från horisontell rad till vertikal lista.

---

## 4. Delade UI-komponenter (`sandstorm/components/ui/*.js`)

Ett antal fristående widgets används genomgående i systemet:

**`calendar.js`**: `months`/`weekDays` löses via `_()` på nytt vid VARJE `init()`-anrop, medvetet ocachat — Start-menyns kalenderflik kör om hela sin `callback()` (och därmed `init()`) vid varje språkbyte via `ui.js`s `tabs()`-återkörning.

**`caret.js`** (anpassad textmarkör-overlay): `SELECTION_API_INPUT_TYPES` (`'text','search','url','tel','password'`) är precis de `<input>`-typer Selection-API:et stödjer enligt spec — övriga typer kastar `InvalidStateError` eller har ingen textmarkör alls (grunden för "Caret input-type guard"-fixen, se minnesposterna). `getCaretCoordinates()` mäter via en osynlig mirror-`<div>`: en nollbredds-span efter texten tvingar fram att en avslutande radbrytning faktiskt renderas (annars äts en trailing `\n` upp av HTML i `pre-wrap`); x-offset tas från div:ens vänsterkant till markören (inte `textSpan`s bredd) för att hantera flerradig text korrekt; y inkluderar redan `borderTop`+`paddingTop` och får inte adderas igen. `updatePosition()` läser koordinater i en `requestAnimationFrame` (annars läses `scrollTop` innan webbläsaren hunnit auto-scrolla efter t.ex. Enter). Navigeringstangenter uppdaterar positionen i `setTimeout(…,0)` efter att webbläsaren bearbetat tangenten. Vid textmarkering positioneras markören vid `selectionEnd`, inte `selectionStart`.

**`dropmenu.js`**: ikon-prefixade triggers (t.ex. Designerns textformateringsverktygsfält) visar bara ikon+värde+pil i den STÄNGDA triggern — den öppna listan visar alltid fulla textetiketter, även för alternativ vars `label` är rik HTML (t.ex. en typsnittsfamilj-förhandsvisning i två kolumner); triggerns etikett använder då `opt.dataset.title` (ren text) istället för `textContent`, som annars slår ihop kolumnerna. Options-listans scrollbar matchar medvetet Designer-canvasens egen (`rgba(0,0,0,0.15)`/`rgba(255,255,255,0.35)`). Dokument-klick-lyssnaren som stänger dropdownen körs i **capture**-fas (inte bubble) så den triggas även när det klickade elementet stoppar sin egen propagering — villkoret `!el.contains(e.target)` (istället för att alltid stänga) är det som gör capture-fasen säker: ett klick på elementets EGEN trigger måste nå dess egen toggle-hanterare med `open`-klassen fortfarande kvar, annars läser den klassen som redan borttagen och lägger tillbaka den, vilket gör ett stäng-klick till en no-op.

**`tags.js`** (taggat inputfält med autocomplete): listan görs synlig (`.show()`) FÖRE positionering beräknas, eftersom `offset()` kräver ett redan synligt element. `mousedown` (inte `click`) används i autocomplete-alternativens hanterare specifikt för att förhindra att inputens `blur` hinner triggas först.

**`toggleWindow.js`** (statusikon-panel-fabriken, används av notiser och Media Player): `iconSelector`-vägen löser `targetId` från den faktiskt klickade ikonen, eftersom statusikoner ofta finns i 2+ DOM-dubbletter (riktiga aktivitetsfältet + Start-menyns widget). Att stänga via triggern kopplar bort samma `document`-klicklyssnare panelen registrerade vid öppning (sparad via `.data('outsideClickHandler', ...)`), annars läcker den för evigt. `width`/`height:"auto"` lämnas osatt så panelen krymper/växer efter sitt eget innehåll; storleken mäts om vid VARJE `adjustPosition()`-anrop (cachas inte), så en anropare kan mutera panelens `innerHTML` och köra den returnerade `.reposition()`-handtaget för att följa med. Slutlig klamring appliceras på alla fyra sidor (inte bara topp/vänster), annars kan panelen hänga utanför höger/nedre kant nära ett hörn.

**`window-modal.js`** och **`menu-body.js`** beskrivs i avsnitt 3.

---

## 5. Språksystemet (`language.js`)

`os.language` håller reda på laddat OS-språk och per-program-språkfiler separat: `_loadedProgram` nyckas på `${langCode}:${programId}` så varje programs egen fil hämtas högst en gång per språk, och en 404 för ett par blockerar aldrig ett annat. `_registeredPrograms` (varje id som någonsin anropat `loadProgram()`, oavsett fetch-utfall) gås igenom vid varje framtida `set(langCode)`, så ett program registrerat under engelska ändå får sin svenska fil hämtad första gången användaren byter till sv.

`_refreshHandlers` (token → callback) är kärnan i live-språkbyte: varje öppet fönster som vill återöversättas registrerar sig via `registerRefresh()`. `_activate()` snapshot:ar handlers INNAN iteration, eftersom en callback synkront kan stänga sitt eget fönster (→ `unregisterRefresh`) och mutera Map:en mitt under gång; varje anrop körs i eget try/catch så ett trasigt fönster inte blockerar resten.

Ett antal `registerRefresh`-poster hanterar shell-delar som saknar en egen setup()/livscykel-hook (Taskbar/Start Menu är boot-time systemfiles, byggda långt innan något programs `setup()` körs):

- `"shell-taskbar-startmenu"` uppdaterar bara konkret identifierade stale title/placeholder-attribut, inte en full ombyggnad.
- `"shell-taskbar-pinned-icon-names"` och `"shell-desktop-icon-names"` täcker de två ställena som fortfarande bakar in `program.name` som ren text vid ett engångstillfälle (`addtotaskbar.js`, `desktop/icons.js`s `add()`) — se avsnitt 2 om varför de flesta andra ställena redan är thunk-baserade och slipper detta.
- `"shell-startmenu-tabs"` river och bygger om HELA `app.ui.tabs()`-anropet för Start-menyns samtliga flikar (Apps/Email/Calendar/Widgets/Settings/Account/Updates) med samma `tabConfig.tabs`-array — varje `tab()`-funktion anropar redan `_()` färskt vid körning, så stale-heten är rent "aldrig återanropad efter första bygget", inte stale data. Att bygga om alla flikar i ett svep är billigare och mer komplett än att lappa varje flikens strängar individuellt; den aktiva flikens position läses ur DOM:en före och återställs efteråt så ombyggnaden inte studsar tillbaka till Apps-fliken.

Det generella "frozen translation thunk"-mönstret (`() => _(...)` istället för en redan upplöst sträng, resolvad först vid render-/registreringstillfället) återkommer på flera oberoende ställen som fixades under samma arbete: Explorers `fileops.js` ("Shortcut" i New-undermenyn — måste registreras innan `shortcutEditor` definieras men får inte frysa språket), `desktop/icons.js`s "Deselect All"-post (till skillnad från syskonposten "Select All" måste den vara en factory, inte ett vanligt objekt), `notepad/setup.js`s "New Text File" (registreras INNAN programmets egen språkfil hunnit ladda), och `solitaire_deckchooser.js`s `DECKS`-namn. Se minnesposten "Frozen translation thunk bug" för den generella beskrivningen.

De flesta program med imperativa, icke-omrenderbara fönster (Notepad, Mail, Formbuilder, GUI-showcase, Fotoviewer) begränsar sin egen `registerRefresh`-koppling till bara fönstrets titel — deras menyer/statusrader/innehåll byggs en gång vid `windowStart()` och skulle kräva en större separat uppgift att göra fullt omrenderbara utan att krocka med egen state-uppdateringslogik (se respektive programavsnitt nedan). `voiceinput.js` har ingen `registerRefresh`-koppling alls: dess enda UI är en kortlivad `app.ui.toggle.window()`-overlay utan ett riktigt `windowStart()`-fönster att haka ett läckagesäkert refresh-par på — `body()` byggs redan om från grunden varje gång den öppnas.

---

## 6. Taskbar (`sandstorm/components/taskbar/*`)

`build.js` startar klockan (`analogClock`/`setClockDisplay`) INNAN `overflow.start()` — den senare mäter taskbarens bredd och kan byta till analog-ikonen om `.tasks` redan svämmar över; ett senare ovillkorligt klock-anrop hade kunnat skriva över det beslutet. Slide-in-animationen använder ett dubbelbuffrings-/reflow-trick: taskbaren sätts off-screen utan transition, en synkron reflow tvingas fram (`void $taskbar[0].offsetHeight`), sedan nollställs inline-stilarna i en `requestAnimationFrame` så transitionen faktiskt triggas — utan den forcerade reflowen kan webbläsaren slå ihop de två stilsättningarna och animationen uteblir.

`checkTaskbarPosition()` har en re-entrancy-guard (`checkInProgress`) med en verklig bakgrundsbugg: funktionen läser `config.position` tidigt men skriver den först efter sin egen ~350ms+ transition-await — ett andra resize-anrop som landar mitt i en pågående transition läste den då fortfarande gamla positionen, applicerade om samma redan-aktuella CSS (triggar inget nytt `transitionend`), och hängde sitt eget `waitForTransitionEnd()`-anrop för evigt. Bekräftat live: taskbaren fastnade osynlig (`opacity:0`) efter snabb resize fram och tillbaka över mobilbrytpunkten. `waitForTransitionEnd()` har numera en egen säkerhetsventil-timeout, men att förhindra det överlappande anropet är den egentliga fixen (se minnesposten "Taskbar position race condition").

`clock.js`: `formatClockTitle()` lägger inget extra kommatecken för `en-US`, eftersom `toLocaleDateString` redan infogar ett eget ("Aug 6, 2025"). Tooltip-returvärdet (`${summary}\n${datePart}`) förlitar sig på att native `title`-tooltips renderar ett bokstavligt `"\n"` som radbrytning. `analogClock()` renderas vid `devicePixelRatio` (inte bara CSS-storlek) för att förbli skarp på high-DPI, och `title`-attributet uppdateras bara när den visade minuten faktiskt ändras — annars flimrar/triggar webbläsarens native tooltip om vid varje sekund-tick medan man hovrar (se även minnesposten "Clock tick wipes badge dot" om ett relaterat problem i notifikationssystemet, avsnitt 9).

`icons.js`: en ikon-nod hittad via `getElementById` återanvänds bara om `parentNode === container` — en gammal dold nod från overflow-menyn kan dela samma id, och utan kollen skulle den av misstag återanvändas i huvudlistan. `menu.js`: `getCloseAllWindowsData()` markerar `closeAll:true` för att skilja radens PROGRAM-id från vanliga fönster-id:n; `build()`s dismiss-lyssnare körs medvetet i capture-fasen (så en fönster-stängningsknapps `stopPropagation()` inte kan svälja klicket) och är fördröjd en tick så samma klick som öppnade menyn inte omedelbart stänger den. `overflow.js`: vid återställning från overflow-klockan måste `$("#timeDisplay").empty()` köras explicit — `clock()`s digital-läge letar bara upp-eller-infogar sin textnod och tar aldrig bort det gamla `<canvas>`-elementet, ett andra, oberoende anropsställe till samma bugg som `clock.js`s egen dispatcher redan hanterar.

`showdesktop.js`: modulvariabeln `_hidden` håller reda på exakt vilka fönster senaste "show desktop"-klicket minimerade; varje post valideras mot fönstrets levande `'minimized'`-klass innan återställning. `sort.js` implementerar en FLIP-animation (First-Last-Invert-Play) för ikon-omflytning: en ren CSS `transform`-transition kan inte animera en DOM-ordningsändring i sig, så positioner sparas före, omordningen sker, och deltat mäts+animeras på jQuery UI:s `change`-event. Positioner läses via `offsetLeft`/`offsetTop` (transform-oberoende), inte `getBoundingClientRect()`, eftersom snabb dragning över flera ikoner kan trigga flera `change`-event innan en tidigare 150ms-animation är klar — `getBoundingClientRect()` hade då rapporterat den transform-interpolerade mitt-i-animation-positionen och spelat upp rörelsen om och om igen. `windowanim.js`s `instant`-gren applicerar exakt samma slut-CSS som den animerade vägen, bara omedelbart.

I `style.css`: `.ui-sortable-helper` exkluderas från transform-transitionen (det aktivt dragna elementet ska inte släpa efter musen). `#showDesktopBtn`s bas-regel (6px vertikal remsa + `border-left`) vänds till en horisontell remsa + `border-top` i vänster/höger-taskbar-läge, där `.right`-containern blir en kolumn.

---

## 7. Start-menyn (`sandstorm/components/startmenu/*`)

`core.js` nollställer `menu.style.height` på två separata ställen (init:s och build:s egna dokument-klick-lyssnare) med samma logik som `toggleMenu()`s stäng-animation, så menyn alltid stängs konsekvent oavsett vilken lyssnare som triggade det. Ett högerklick INUTI menyn föll tidigare rakt igenom till `desktop.js`s bakgrunds-kontextmeny (kopplad på `document.body`, som hela menyn lever inuti) — `e.stopPropagation()` undertrycker nu fel meny, utan att lägga till en riktig ersättning. `startbutton()` sätter `isolation:isolate` för att skapa en ny stacking-context så `.after`-elementets `z-index:-1` inte läcker uppåt, och skjuter upp `.after`-bakgrunden en dubbel-rAF för att undvika en gul flash vid första målningen.

`running_apps.js` extraherar program-id via körande fönsters `pid-*`-CSS-klasser (satta av `windowStart`) istället för `getAllWindowId()`, vars fönster-nivå-id:n (t.ex. `"cp-taskmanager"`) inte alltid matchar registrerade program-id och orsakade null-krascher; ett nyss öppnat program säkerställs finnas i listan även innan dess fönster hunnit synas i DOM:en. `search.js` (Start-menyns egen sökruta) återställer sig (`_resetSearch()`) efter att ett resultat aktiverats, så menyn börjar om nästa gång den öppnas; dess resize-lyssnare delar trigger med `core.js`s `calculateMenuHeight()` så resultatboxens nederkant hålls synkad; tangentbordsnavigering utgår från ett grid (Ner/Upp = hel rad, Vänster/Höger = inom raden). `state.js`s `_hiddenWindowIds` speglar `showdesktop.js`s mönster för "Apps running"-panelens egen hide-all-knapp.

`tabs.js`: `createAppsTab()`s klick-/kontextmeny-hanterare binds till HELA `.appsborder`-plattan, inte bara den inre `.appicos`-ikonboxen — `.name` är ett SYSKON till `.appicos`, så en lyssnare bara där missade klick på etikett-texten. Sidindikatorn (`_renderPages`) räknar med `Math.round`, inte `Math.ceil` — `ceil` lade tidigare till en falsk extra sida för bara enstaka överflödande sub-pixlar från flex-wrap-omflöde. Läsningen av `scrollHeight`/`clientHeight` för sidindikatorn är fördröjd (`setTimeout(…,16)`, samma som wheel/resize-vägarna), eftersom en synkron läsning innan gridets flex-wrap satt sig gav fel sidantal vid första öppning. `addTab()`s ikon-HTML byggs av `app.ui.tabs()` själv vid render-tid, inte i förväg — annars fryser en tidig byggnad `tabConfig.title`s dåvarande värde permanent (se avsnitt 5 om thunk-mönstret).

I `startmenu.css`: bredd-formlerna `min(640px, calc(100vw - Npx))` upprepas för `def-l`/`def-r`/`def-b`/`def-t` med respektive sidoffset (9px/63px). `.def-t.show-t` hade tidigare en fast `640px` som en högre-specificitets-regel (3 klasser) tyst körde över bas-`.startmenu`-regelns `min()`-fix — bekräftat live: en topp-positionerad taskbar vid 600px viewport stack ut 40px och klippte sista ikonkolumnen. `.rightmain` använder `container-type:inline-size` så `.appslist`/`.pd` kan storlekssätta padding/gap via `cqw` mot sin egen renderade bredd, inte viewporten. `.appsborder .name` breddades från 68px till 112px (uppmätt: en 15-teckens `app.util.truncate()`-sträng behöver ~97px vid 12px typsnitt — 68px fick inte ens "Kontrollpanel" att få plats). `#ms-search-results`s `max-height:480px` är bara en fallback — `search.js`s `_sizeResults()` sätter den inline mot `.rightmain`s faktiska nederkant.

---

## 8. Sökmotorn (`sandstorm/components/search/*`)

Backend bakom både Start-menyns sökfält och Control Panels inställningssök. `matcher.js`s `ALIASES`-tabell är avsiktligt liten och handhållen (inte en synonymordbok) — en nivå platt, begränsad av `MAX_EXPANSIONS`. Fuzzy-matchning i `score()` görs bara för rimligt korta termer/mål, och jämförs både mot målets egna ord (så flerords-mål som "Control Panel" kan fuzzy-matcha ett felstavat första ord) och mot en inledande substräng av matchande längd (så ett hopskrivet "Controlpanel" fortfarande kan fuzzy-matcha "contorl", ett stavfel en ren whitespace-split aldrig hade isolerat).

`providers/apps.js` begränsar sig (v1-scope) till appar användaren redan ser i Apps-fliken (`program.startmenu === true`). `providers/filesystem.js`: en filträff öppnar sin FÖRÄLDER-mapp (eftersom `app.explorer.open()` navigerar TILL en mapp), en mappträff öppnar sig själv. `providers/settings.js` substräng-matchar bara det RÅA ordet mot `app.searchengine.search`, så `search()` anropar den en gång per expanderad term (rått ord + alias) för att ändå nå aliasexpansionen, och räknar om varje träff genom `matcher.js`s riktiga tier-stege efteråt.

---

## 9. Notifikationssystemet (`sandstorm/components/notifications/*`)

`api.js`s `notify()`: en `priority:'critical'`-notis visas alltid, även när programmets notiser i övrigt är blockerade (`mode:'blocked'`). Om ruttvalet blev `'own'` men inget ytytor är registrerat för programmet faller notisen tillbaka till klockan istället för att tyst gå förlorad.

`setup.js`s klick-lyssnare på `#timeDisplay` väntar via `os.dom.waitFor('#timeDisplay', {timeout: 0})` — utan tidsgräns, medvetet. `startup-complete` triggas synkront direkt efter boot-`start:`-loopen, men `desktop.taskbar.build`s faktiska DOM-skapande körs i en fördröjd `$(fn)`-makrotask (jQuery 3 fördröjer redan-redo-handlers via `setTimeout(0)`), så `#timeDisplay` finns ännu inte då. Modulens `start()` körs under boot-`programs`-fasen, långt innan `config.start`s array ens börjar — `desktop.taskbar.build` är den arrayens SISTA steg, bakom inloggningsskärmens väntan. En begränsad timeout var den faktiska buggen: den gav tyst upp mitt i inloggningen utan fel, och klicklyssnaren kopplades aldrig (se minnesposten "startup-complete vs app.dom.waitFor" och avsnitt 1). CSS-regeln `#timeDisplay > .notif-badge-dot.pulse` behöver sin egen selektor (inte bara `.pulse`-klassen ensam) eftersom start-knappens `.after.pulse`-basregel (samma delade keyframe, basic.css) har högre specificitet (ID+klass) och annars vinner. `MutationObserver`n som läker badgen efter klockans egna textskrivningar triggas bara av `childList`-mutationer (inte klass-toggles), så den kan inte loopa sig själv.

---

## 10. Cursor Engine (`sandstorm/components/cursor/*`)

SVG-cursor-overlay som ersätter native muspekare, permission-gated per program. `index.js` seedar sin initialposition från `window.__sandstormBootMouse` (se avsnitt 1) — utan det startar overlayen från `motion.js`s hårdkodade `(0,0)` och glider synligt in från hörnet vid första musrörelsen.

`api.js`: `_pin()`s unpin-gren anropar `resync()` efter `state.setManualCursor(false)`, annars fortsätter overlayen visa den nyss avpinnade glyfen tills nästa `pointermove` (samma orsak som en fastnat busy/working-cursor efter att ett program laddat klart medan musen stod stilla). `_workingDepth`-räknaren är ref-counted så överlappande "startar"-cues (flera autorun-program vid boot) inte kan racea varandra — bara anropet som tar räknaren till noll rör faktiskt state. `show()` emittar alltid, även om `state.js`s eget `visible`-värde redan var `true` — `renderer.js`s `_applyVisibility` kringgår då den separata fönster-gräns-fadningen, vilket är hela poängen med ett explicit `show()`-anrop.

`cursor-map.js` saknade tidigare `grab`/`grabbing` (Designers dock/palette-draghandtag) och `row-resize`/`col-resize` (Designerns splitter-gräns-drag, `tools/resize.js`) — båda föll tyst tillbaka till standardpilen (se minnesposten "Cursor-map gaps"). `detect.js` strippar tillfälligt `renderer.js`s `cursor:none!important`-suppressionsklass för det enda synkrona `getComputedStyle`-anropet vid elementbyte, annars skulle regeln clobbra det semantiska cursor-värdet innan koden hinner läsa det. `_onPointerMove` använder `e.target` (billigt, korrekt eftersom overlayen själv är `pointer-events:none`); `_onTouch` måste däremot använda `elementFromPoint`, eftersom touch-eventets `e.target` förblir fastlåst till det ursprungliga `touchstart`-målet för hela gesten.

`motion.js`s `EPSILON = 0.02`: exponentiell smoothing når i flyttal aldrig exakt sitt mål — utan tröskeln skulle `positionchange` (och renderer.js:s trail-spawn/idle-timer-reset) fyra för evigt även med cursorn stillastående, vilket visade sig som att trail-effekten aldrig lade sig. Follow-mode spårar målets levande centrum varje frame (`getBoundingClientRect`, inte `detect.js`s `getComputedStyle`); om det följda elementet togs bort utan ett matchande `Cursor.follow(null)` skulle ett kvarhängande `followTarget` permanent blockera pointermove-hanteringen och frysa cursorn.

`permission.js`s `isSystemProgram()` betror INTE `'sandstormscomponents'` (default-ägar-id för komponent-nivå-dialoger) som system-trusted, trots att den identiteten kan vara `.window.active` precis efter att en egen consent-dialog "stängs" — annars skulle nästa gated-anrop från VILKET program som helst tyst bli auto-beviljat. Bara ett genuint frånvarande aktivt fönster (`programId === null`) betros på system-nivå.

`renderer.js`: working-cursorns ring ligger i ett eget fristående element (inte inbakad i en spinnande `<use>`, som skulle rotera hela referensen inklusive den statiska pilen). Fönster-gräns-fadningen (`WINDOW_FADE_MS`) är skild från `--cursor-opacity` (användarens totala theme-opacitet) — de komponerar multiplikativt. `_applyVisibility` kringgår fönster-fadningen när ett program explicit ropat `show()`, men `hide()` lämnar fade-state orört (display:none döljer redan allt). Boot-fade-in i `init()` sker bara om `window.__sandstormBootMouse` visar att musen faktiskt är känd att vara över fönstret — annars fadar `_onWindowMouseEnter` in den på riktigt så fort den faktiskt anländer (utan detta villkor visades en fejk-cursor vid `(0,0)` när riktiga musen var utanför webbläsarfönstret vid boot).

`theme.js`: "accent"-färgen läser `os.config.user.settings.theme.backgroundRadialColor` (den rena hex-koden Theme-fliken redan sparar) istället för `--background-radial`, som alltid är ett `radial-gradient(...)`-funktionsvärde — `color:` (SVG:ns `fill="currentColor"` beror på den) kan inte hålla en gradient och faller tyst tillbaka till ärvd färg. `_accentPreset()` använder ingen glow, eftersom en suddig drop-shadow i accentfärgen renderades som en synlig färgad cirkel ovanpå cursorn (rapporterad live som en oönskad "gul cirkel").

---

## 11. Login-systemet (`sandstorm/components/login/*`)

`login.js`s `setup()` preloadar ikontypsnittet ("Font Awesome 6 Free") explicit via Font Loading API — `<link rel="stylesheet">` börjar annars inte hämtas förrän fönstrets HTML hamnar i DOM:en, precis när ikonerna behövs, och `font-display:block` gör dem osynliga tills dess. `os.login`-namnrymden är säker att exponera trots att `setup()` körs inuti `start:`-arrayen efter boot-API-cleanup, eftersom cleanup bara låser `os.controlpanel.add`/`addMenuItem`. Ett låst inloggningsspråk (`"system"` default lämnar `os.language` orört) hedras även om OS:et kör något annat. `body()`s `div`-variabel sätts inuti ett `setTimeout`-block när fönstrets HTML faktiskt är i DOM:en; `refreshLoginText()` stänger över den by reference och guardar mot att den fortfarande är null. `forgotFab.onclick` behöver `e.stopPropagation()` — annars bubblar klicket till login-fönstrets root-klick-till-fokus-hanterare, som kör `app.setActiveWindow(loginWindowId)` EFTER att `app.ui.prompt()` redan aktiverat sitt eget fönster i samma dispatch, vilket stjäl tillbaka topp-z-index och begraver prompten bakom det ostängbara login-fönstret (samma fix som `langFab`/`langMenu`).

`start()` sparar hela `loginProgram`-`start:`-steget från `index.html` en gång vid boot (index.html är enda sanningskällan) och persisterar det på `os.login` för sessionen, inklusive senare lock-screen-återöppningar (`os.session.window.logoff()` anropar `baseWindow()` direkt, utan att gå via `start()` igen). `performLock()`s `toggleMenu()`-anrop är en riktig toggle och anropas bara om Start-menyn faktiskt redan är öppen (manuellt Lock Screen-klick), annars skulle en idle-timer-trigger felaktigt öppna menyn.

`autologout.js`: om `_isBlocked()` (t.ex. ett program taggat `category:"game"`, se avsnitt 2) är sant schemaläggs en ny koll om 5s istället för att avbryta cykeln — redan förfluten inaktivitet fortsätter räknas från blockeringens slut. Den explicita "Stay logged in"-knappen är enda sättet att avfärda varningsdialogen; en paus/media-start mitt i nedräkningen avfärdar den precis som en explicit cancel.

---

## 12. Control Panel (`sandstorm/components/controlpanel/*`)

Se minnesposten "Control Panel lazy loading" för uppdelningen i eager manifest + lazy `*.content.js`-filer (`os.includeModule()` sväljer egna importfel och resolvar `null` istället för att kasta — man kan inte förlita sig på catch ensamt för att upptäcka misslyckad laddning).

`program.js`s `main()` bygger om vilken panel som är öppen (eller launcher-griden) helt vid varje språkbyte, eftersom `_render()` redan kör om varje `_()`-anrop. `taskManager()`s markerade-rad-highlight (`.tm-selected`) är medvetet en statisk highlight, inte den delade pulserande `.ctm-row`-hover-animationen — att dela den oändliga animationsregeln fick en markerad rad att fortsätta pulsera för evigt även utan musen i närheten.

Flera paneler delar samma `os.ui.infoRow()`-hjälpfunktion (`ui/dropmenu.js`) istället för egen handbyggd `.cp-field`/`.cp-label`-markup eller en dubbel-implementerad lokal closure — konsoliderat från `core.content.js`, `system.content.js` och `update.content.js`. `customized.content.js`s "Ingen bakgrundsbild"-toggle hålls i synk åt båda hållen med bakgrundsbild-state. `program.content.js` avvisar `.svg` som rå `<img>`-ikonkälla (samma policy som Explorers `icon_menu.js`, avsnitt 17) — riktiga SVG-ikoner går via `icontype:'svg'`/`app.load.addSVG()`.

`responsivelayout.content.js` (avsnitt 15:s inställningspanel): Snap Layout-sektionen är oberoende av grid-arrange-togglen `available` — drag-till-kant-snapping har sin egen grind. `$('#rwl-save-mine')`-knappens `app.ui.confirm`-anrop kräver `stopPropagation()`: utan den fortsätter klicket bubbla efter att confirm-dialogen skapats, når Control Panel-fönstrets egen "klicka var som helst i mig = fokusera mig"-hanterare, och den stjäl tillbaka fokus en tick senare — vilket lämnar den nya dialogen visuellt bakom och oklickbar (bekräftat live via `setActiveWindow`-spårning; samma klass av bugg som `login.js`s `forgotFab` ovan).

`users.content.js`s avatar-validering är flerlagrad: `src=""` är en URL-kontext (inte vanlig text), så HTML-escaping ensam utesluter inte ett `javascript:`-schema. Utöver schema-prefixet kontrolleras att payloaden efter kommat faktiskt ÄR base64 (ett prefix-match ensamt skulle låta en riggad sträng smuggla godtyckliga bytes förbi), plus ett längdtak (`MAX_AVATAR_DATA_URL_CHARS`, ~1,4M tecken ≈ 1MB-bild efter base64-uppblåsning) — en obegränsad data:-URI i DOM:en vid varje rendering av användarlistan är annars en billig självförvållad DoS. SVG utesluts trots att en `<img>`-renderad SVG inte kan köra skript i nuvarande webbläsare — det är en rendering-context-kvirk, inte en garanti. Väljar-sidans motsvarande kontroll (`MAX_AVATAR_FILE_BYTES`) körs mot den råa `File`:en innan den läses, så ett för stort foto avvisas direkt istället för att bränna en `FileReader`-pass i onödan.

`tabs.css` implementerar tre responsiva lägen för sidofältet: full etiketterad räls (desktop) → icon-only 56px-räls (`@container max-width:768px`, samma vänsterposition, bara ikoner) → helt kollapsad drawer under 450px (`.cp-tab-topbar` med back/sök/meny, som skjuter in det fulla sidofältet som ett overlay).

---

## 13. Skrivbordet — ikoner, drag/drop, bakgrund

### Skrivbordsikoner (`sandstorm/components/desktop/icons.js`)

Grid-motorn: `_gApply()`s else-gren rensar bara den transform-transition funktionens egen animate-gren kan ha lämnat kvar — inte hela `transition`-shorthanden, vilket annars skulle avbryta en orelaterad pågående transition (t.ex. en ikons boot-tids opacity-fade-in). `_gResize()` snapshot:ar och sorterar i läsordning (row-major) så tidigare objekt får prioritet vid omflöde; widgets bevarar sin `userCol`/`userRow` (resize ändrar inte user-intent) medan ikoner återställer sin gamla post. `add()` fadear in nya ikoner (bara för en batch-rendering, staggerad 0,2s/objekt, samma timing som taskbarens entrance-animation) eftersom detta körs precis efter loading-screenets `removeLoadingScreen()`-promise löser sig, vid boot. `refreshFs()` hoppar över `autoDesktopIcon`-poster som redan renderats via `_icons`/`add()`, annars dubbelrenderas samma program-ikon.

`_buildFsContextMenu()` delegerar hela åtgärdskatalogen till `app.explorer.buildContextMenu` (avsnitt 17) — desktop tillhandahåller bara rename-UI:t (knutet till sin egen `.desktop-icon-label`-DOM). Multi-drag (`bind()`s `mousedown`→`onMove`) sätter `z-index:99999` (samma konvention som single-icon-draget) plus `pointer-events:none` — annars skulle den dragna ikonen SJÄLV vara elementet under muspekaren vid drop-tillfället och Explorers `bindExternalDrop`-mouseup (avsnitt 17) aldrig nå fönstret under. `.dd-dragging`-klassen (Explorers ghost-drag-opacitet) sätts medvetet INTE — det skulle synligt fada skrivbordsikoner under hela draget, en regression mot befintligt utseende; bara `data-path`-markören återanvänds. I `onUp()` (multi-drag-slut) fångas `accepted`-set:et INNAN cleanup tar bort markören; accepterade ikoner litar på den redan startade async-flytten (`openMoveStatus`→`pasteItems`→`refreshFs`) istället för att snap:as tillbaka, annars ser ett lyckat drop missvisande ut som avvisat.

### Bakgrundssystemet (`desktop.js`)

`app.desktop.setBackgroundImage(options)` är den enda vägen in för att byta skrivbordsbakgrund (boot, Control Panel, Explorers "Sätt som skrivbordsbakgrund" — se avsnitt 17). Den är `async` och gör faktiskt jobbet innan den resolvar:

```
fetch(url) → blob → URL.createObjectURL(blob) → new Image().decode()  → applyBackgroundCss()
             (15s timeout som säkerhetsventil)   (tvingar fram avkodning INNAN CSS-bytet)
```

Två saker värda att komma ihåg om man rör den här koden:

- **`applyBackgroundCss()` måste `app.removeCSS(id)` innan `app.addCSS(id, ...)`** — `app.addCSS` ignorerar tyst dubbletter av samma identifierare (dokumenterat beteende i `ui/css.js`), så utan `removeCSS` först slår bara den *första* bakgrunden i en session igenom någonsin.
- **`decode()`-steget finns för att undvika en vit flash** — `fetch()+blob()` garanterar bara nedladdade bytes, inte att webbläsaren hunnit avkoda bilden till en målningsbar bitmap. Utan den explicita `decode()`-anropet kan CSS-bytet hinna före den faktiska avkodningen, vilket gör att `background-color`-fallbacken (vit) syns i en kort glimt innan bilden själv målas.

Explorers och skrivbordsikonernas gemensamma kontextmeny lägger till "Set as desktop background" villkorat på `app.explorer.isImageExt(ext) && entry.url` (se avsnitt 17) och anropar `setBackgroundImage()` direkt — Explorer känner till `app.desktop`s publika API, men `app.desktop` känner inte till Explorer, samma enkelriktade beroendeprincip som Fotoviewer-integrationen (avsnitt 18), fast Explorer initierar anropet den här gången.

---

## 14. Responsive Window Layout (`sandstorm/components/responsivelayout/*`)

Admin-styrt grid-arrangemang av fönster per breakpoint-tier, separat system från drag-till-kant Snap Layout (avsnitt 3) — Snap Layout har sin egen grind och kräver inte att grid-systemet är aktiverat.

`api.js`s `defaultConfig()`: `columns`-taket begränsar bara arrange-motorns MAX kolumner per tier (färre öppna fönster än taket använder ändå färre); `columnsEnabled` togglar taket av per tier utan att nollställa det sparade värdet, så återaktivering återställer senaste värdet. `writeConfig()` nollställer `app.desktop._rwLayoutState` (engine.js's cachade senast beräknade grid, nyckat bara på fönster-set+aktivt fönster) — cachen designades aldrig för att märka en config-ändring själv, så utan denna invalidering hade ett precis sparat kolumntak ingen synlig effekt förrän ett fönster öppnas/stängs tvingar fram omräkning (bekräftat live: två arrange-pass i rad med samma fönster gav byte-identisk output trots en mellanliggande columns-save). `init(app)` seedar en giltig, aktiverad default-config vid första boot — annars läser `isAvailable()` false tills ett muterande anrop råkar trigga `ensureConfig()` först.

`engine.js`s `arrangeWindows()`: av (eller ogiltig config) → aldrig auto-arrangera, ett hårt stopp — bekräftat live att en fallback till legacy `app.config.local.breakpoints` producerade en riktig z-index-bugg (två fönster som byter stapelordning runt en ~350px-brytpunkt och inte återställer den tillförlitligt). Grindad centralt i funktionen (inte bara i `checkWindowSize`) så att `menu-body.js`s direktanrop till `app.desktop.responsiveArrange()` inte heller kan kringgå spärren. Maximerade fönster exkluderas från z-index-golvberäkningen INNAN `.filter()` körs — annars räknades deras z-index aldrig in i `excludedMaxZ`, och `zFloor` kunde begrava ett aktivt arrangerat fönster bakom ett ofokuserat maximerat fönster (bekräftat live: z=5001 → z=1003 för det aktiva fönstret, medan det ofokuserade maximerade stannade på z=5000). Låsta modal-dialog-par spåras separat från maximerade fönster i samma filter: ett låst par ska stanna ovanpå ALLT (till skillnad från ett maximerat fönster, som ett arrangerat aktivt fönster fortfarande får överträffa) — att blanda in det i `excludedMaxZ` hade fått `zFloor` att felaktigt STARTA ovanför det låsta paret (bekräftat live: en Solitaire "Choose Deck"-dialog begravdes under ett arrangerat Explorer-fönster vid en breakpoint-ändring).

---

## 15. Papperskorgen (`sandstorm/components/recyclebin/setup.js`)

`send()`s `doDelete`-hjälpare fångar varje sökvägs aktuella entry och tar bort den — den faktiska mutationen, anropad från `do()` (första gången) och `redo()` (en senare repetition). `ids` delas via closure så `undo()` alltid återställer exakt vad det senaste `do()`/`redo()`-anropet producerade.

---

## 16. Explorer

### Två lager: boot-kritiskt vs lazy

```
sandstorm/components/explorer/
├── setup.js  → setup/index.js         ← BOOT-KRITISKT, körs alltid (även om Explorer-fönstret aldrig öppnas)
│    ├── setup/icons.js       registerIcons   — SVG-sprite, program.addInfo("explorer", …)
│    ├── setup/core.js        registerCore    — app.explorer._fs, _getNode, clipboard, metaPanel-registry, contextMenu-registry
│    ├── setup/dialogs.js     registerDialogs — filväljar-dialogen (select.file m.fl.)
│    ├── setup/fileops.js     registerFileOps — newFolder/newFile/remove/rename (de faktiska fil-operationerna)
│    ├── setup/icon_menu.js   registerIconMenu— app.explorer.icon.forEntry() + app.explorer.buildContextMenu()  ← DELAD med Desktop-ikoner
│    └── setup/shortcuts.js   registerShortcuts
│
└── explorer.js  → window/index.js     ← LAZY, laddas först när fönstret öppnas (ren re-export: `export { start } from './window/index.js'`)
     ├── window/state.js     createState()  — allt per-fönster-state (multistart: true, en state per öppnat fönster)
     ├── window/core.js      update/updateMain/navigate/openFile
     ├── window/list.js      renderList/renderSearchResults, radikon-rendering
     ├── window/rows.js      klick/dubbelklick/kontextmeny-bindning per rad
     ├── window/meta.js      höger detaljpanel — selection-läge ELLER sök-träd-läge
     ├── window/search.js    scoped offline-sökning (från aktuell mapp, inte hela trädet)
     ├── window/menus.js     rowMenu() — Explorers EGEN, rikare radmeny
     ├── window/icons.js     fileIcon/extIcon/animatedFolderIcon
     ├── window/dragdrop.js, breadcrumb.js, tree.js, toolbar.js, createitems.js, dialogmode.js, fsutil.js
```

> `explorer_windows.js` och `explorer_api.js`, som tidigare listades här som död kod på rotnivå i mappen, **finns inte längre i repot** — troligen borttagna i en tidigare, orelaterad städning (se minnesposten `project_dead_code_audit.md`, 2026-08-15). Den riktiga implementationen är fortsatt `explorer.js` + `setup.js`, som beskrivet ovan.

### Virtuellt filsystem och RealStorage

`app.explorer._fs` är ett in-memory-träd, laddat en gång från `filesystem.json` vid boot (`setup/core.js`, via `app.api.get`). Efter fs-laddningen backfillas `/Desktop`-genvägsspeglar för alla `desktop:true`-program vars `add()` kördes innan fs:en blev klar, och riktiga skrivbordsikoner renderas för `/Desktop`s då aktuella innehåll. `app.explorer._refreshAll` exponeras publikt så andra boot-kritiska moduler som muterar fs:en direkt (t.ex. Recycle Bin, avsnitt 15) kan trigga en omritning utan egen kopia av refresh-logiken; varje fs-mutation synkar även skrivbordsikonerna (`app.desktop.icon.refreshFs()`) oavsett vilken sökväg som ändrades.

En nod: `{ type: 'file'|'folder'|'shortcut', ext, size, modified, url?, content? }`. `.url` är fältet som pekar på en riktig bild-URL — utan den finns ingen källa att visa som miniatyr eller sätta som bakgrund. `/RealStorage`-mappar (en riktig backend, till skillnad från det simulerade trädet) populeras LAT: `navigate()` (core.js) och den separata trädklick-hanteraren i `dragdrop.js`s `bindSideRows()` har varsin lat-laddningskrok (`isRealStoragePath`/`ensureRealFolderLoaded`) — `list.js`s `renderList()` visar ett "laddar"-läge tills fetchen löses, annars hade en genuint existerande men ännu opopulerad mapp felaktigt renderats som "Folder not found". `setup/fileops.js`s `remove()`/`newFile()` muterar `_fs` FÖRST EFTER att servern bekräftar (till skillnad från det simulerade trädets optimistiska väg), och `pasteItems()` avvisar rakt av VARJE paste som rör RealStorage som källa eller mål — ingen flytt/kopiera-åtgärd finns server-side än (fasen är begränsad till list/read/write/delete), och ett simulerat item har inget riktigt innehåll att spara om det flyttas dit.

### Kontextmenysystem

- **`rowMenu(state, path)`** (`window/menus.js`) — Explorer-fönstrets egen radmeny. Rikare (Open With-undermeny, Paste, Select All/Deselect All). Punkter som "Öppna"/"Byt namn"/"Sätt som skrivbordsbakgrund" jobbar alltid på den **specifikt högerklickade** `path`, oavsett hur många andra rader som är markerade.
- **`app.explorer.buildContextMenu(paths, opts)`** (`setup/icon_menu.js`) — boot-safe, delad katalog (Open/Rename/Copy/Cut/Delete/Properties) som används av **Desktop-ikonerna** (avsnitt 13) eftersom de inte kan vänta på det lazy-laddade `explorer.js`. Tar `paths` (hela multi-selektionen) **och** ett separat `opts.clickedPath` för poster som bara gäller den specifikt klickade filen. `opts.onRename(path, entry)` låter Explorer äga VAD namnbyte gör (`app.explorer.rename`), medan anroparen äger HUR namnet matas in (inline-redigering kontra Explorers egna filrader). Properties-posten öppnar samma rika flikade fönster som Explorers egen radmeny använder, med identisk `{path, entry}`-form.

Både menyerna delar en enda sanningskälla för "är detta en bildfil" (`_imageExts`, icon_menu.js) så "Sätt som skrivbordsbakgrund" hålls i synk på båda ställena — kräver en riktig bläddringsbar `.url` (de flesta exempelbilderna i `filesystem.json` är dekorativa platshållare utan en sådan). En genvägs ikon är alltid dess mål-programs registrerade ikon (inget separat override-fält i v1); ett trasigt/okänt mål faller igenom till en generisk fil-glyf.

### Sökning

Scoped till **aktuell mapp och dess undermappar** — inte hela filsystemet (`searchMatches()` startar traversal från `state.path`). Debounce 150ms i `toolbar.js` läser input-fältets värde vid *fire time*, inte vid keydown, så en gammal timer aldrig kan återuppliva en redan rensad sökning. Sökfältet i headern kollapsar till bara en ikon på smala fönster (≤425px) — klick expanderar det. Ett filterpanel-tillägg (filtyp/datum/storlek-chips) appliceras ovanpå den aktiva frågan.

Höger detaljpanel (`.exp-meta`) är **kontextberoende**, styrt av `core.js`s `updateMain()`: ingen sökning → `updateMeta()` (vanlig selection-info); sökning aktiv → `updateSearchMeta()` (ASCII-träd av träffarnas fullständiga sökväg, oavsett vilken rad som råkar vara markerad — ett radklick under aktiv sökning byter INTE tillbaka).

Touch-enheter saknar riktig `:hover`, så navigeringsrälens normala hover-till-expandera är opålitlig där — `if (window.matchMedia('(hover: none)').matches)` togglar istället en dedikerad klass explicit per tryckning. Breadcrumb-toggle-ikonen slås alltid upp färskt (inte cachad i en closure-variabel), eftersom `.exp-breadcrumb` klonas-och-ersätts av `setupBreadcrumbInput()` vid varje `updateMain()`.

### Bild-miniatyrer

`fileIcon(entry, size, fit)` (`window/icons.js`) är den **enda** funktionen som avgör vad en rad/grid-cell/meta-panel visar för icke-mapp-filer. Den kollar `entry.url && app.program.extInfo[entry.ext]?.thumbnail` — om sant, en riktig `<img src={entry.url}>`; annars fallback till `extInfo[ext].icon` eller en färgad extension-badge. `fit` styr `object-fit`: `'cover'` för rad/grid, `'contain'` för meta-panelens större förhandsvisning, som dessutom växer till 200×200px (från 132×132px) specifikt när en riktig miniatyr visas.

### Övrigt av teknisk vikt

`window/dragdrop.js`s `DROP_TARGET_SELECTOR` är medvetet INTE fönster-scopead (till skillnad från item-selektorn) — drop-sidan måste matcha mapprader i VILKET Explorer-fönster som helst plus skrivbordets mappikoner/tomma yta, annars är cross-window- och Explorer→Desktop-drops strukturellt omöjliga. `.desktop-icons` är `pointer-events:none` för vanliga klick (så tom skrivbordsyta släpper igenom till box-select/kontextmeny-hanterare på `document.body`), vilket också gör den osynlig för `elementFromPoint`-baserad drop-detektering på tom yta — `.dd-drop-active` togglas för att göra den hit-testable just under en dragnings varaktighet. Ctrl+drag = kopiera (branschstandard), vanlig drag flyttar. `openMoveStatus()`s progress-animation är kosmetisk (per-item-timing simulerad); den faktiska filsystemändringen sker en gång, efter att den är klar, och uppdaterar varje öppet Explorer-fönster plus skrivbordsikonerna via `_refreshAll` — ingen manuell Close-knapp visas vid lyckat resultat (auto-stänger), men fel/avbrutna operationer kräver en manuell Close eftersom användaren behöver läsa dem.

`window/fsutil.js`s `KNOWN_FOLDER_NAMES`: sex root-nivå-mappars visningsnamn (t.ex. "Documents"→"Dokument") översätts, men bara den SYNLIGA etiketten (`list.js`s `rowHTML()`) — data-path/name/sortering använder alltid det riktiga, oöversatta namnet, matchat via exakt root-nivå-sökväg (en användarskapad undermapp som råkar heta likadant djupare i trädet påverkas inte).

`window/meta.js`s `_wrapCharacters()` wrappar whitespace-bara textnoder mellan `.exp-meta-row`-raderna i egna `<span>`, annars kollapsar normal HTML-whitespace-hantering det utrymme animationens `gap`-rytm behöver och det syns som ett gap som dyker upp och sedan försvinner.

I `explorer.css`: `.exp-anim-folder`-mappikonen är tre komponerade lager (bakre form / HTML-innehålls-förhandsvisning / främre flik, se `_animatedFolderIcon()`); dess `font-size` sätts inline till ikonens egen pixelstorlek så ättlingar kan storleksätta i `em` proportionellt oavsett vilken kontext som renderar den (grid, meta-panel, multi-select). `@container (max-width:600px) { .exp-meta {...} }` kollapsar meta-panelens bredd till 0 (inte `display:none`, för mjuk animation) när arbetsytan är för smal för att den ska få plats bredvid en läsbar fillista — respekterar en inline-satt manuell toggle om användaren redan tvingat panelen dold/visad. `.dd-over`/`.dd-over-deny` bär ingen egen styling alls — ogiltig-mål-feedback är cursorn själv (cursor-unavailable, se avsnitt 10), inte en kantlinje på målet, matchande riktig OS-UX.

---

## 17. Fotoviewer — hur extensibility faktiskt fungerar

Det här är precis mönstret man vill kunna lita på överallt. Fotoviewer äger **ingen** kod i Explorer överhuvudtaget — allt den gör är att deklarera sig själv vid boot:

```js
// program/fotoviewer/setup.js
export const IMG_EXTS       = new Set(['jpg','jpeg','png','gif','webp','svg','bmp','ico','tiff','tif','avif']);
export const THUMBNAIL_EXTS = new Set(['jpg','jpeg','png','gif','webp','bmp','ico','avif']); // delmängd — .svg/.tiff uteslutna

os.program.addInfo("fotoviewer", {
    ...
    openWith: [...IMG_EXTS].map(ext => ({
        ext,
        icon: '#ic-fotoviewer', icontype: 'svg',
        label: ext.toUpperCase() + ' Image',
        thumbnail: THUMBNAIL_EXTS.has(ext)   // ← detta är hela API:t
    }))
});
```

`THUMBNAIL_EXTS` är medvetet en delmängd av `IMG_EXTS`, inte samma lista: `.svg` är exkluderad enligt Explorers etablerade policy mot rå `<img>` för SVG-källor (samma säkerhetsställningstagande som `controlpanel/program.content.js`s ikonhantering, avsnitt 12); `.tiff`/`.tif` saknar en inbyggd `<img>`-avkodare i vanliga webbläsare och skulle rendera som en trasig bild-ikon — sämre än den generiska glyf-fallbacken.

Det `program.js` gör med `openWith`-listan (se avsnitt 2) sprider sig sedan automatiskt till **tre olika ställen i Explorer**, utan att Explorer eller Fotoviewer explicit pratar med varandra:

1. **Dubbelklick i Explorer** → `app.program.fileHandlers['jpg']` finns → filen öppnas i Fotoviewer.
2. **Ikon-rendering** (`fileIcon()`) → `extInfo['jpg'].thumbnail === true` + `entry.url` finns → riktig bild-miniatyr istället för generisk glyf, i rad, grid *och* meta-panel.
3. **Meta-panelens container-storlek** → samma `thumbnail`-flagga avgör om `.exp-meta-icon` blir 200×200 eller stannar på 132×132.

Skulle ett annat program (t.ex. en framtida videospelare) vilja ha samma miniatyr-behandling för `.mp4` räcker det att sätta `thumbnail: true` på sin egen `openWith`-post — Explorer behöver inte ändras alls.

Fotoviewers eget fönster begränsar live-språkbyte till verktygsfältets `.title`-attribut, empty-state-texten och fönstertiteln (samma titel-bara-scope som beskrivs generellt i avsnitt 5) — kontextmenyns poster byggs redan om från grunden varje gång menyn öppnas. Drop-från-Explorer upptäcks genom att fånga `mouseup` medan element fortfarande bär Explorers `app.ui.dragDrop`-satta `.dd-dragging`-klass (se avsnitt 16).

---

## 18. Designer

Designer är det klart största programmet i kodbasen: ett fullständigt sida-byggar-verktyg med en egen objektmodell (Document/Node), en cascade-medveten stilmotor, ett canvas-renderingslager, fem separata verktyg (Select/Split/Resize/Move/Text) och över ett dussin dockpanel-moduler. Detta avsnitt går igenom arkitekturen lager för lager.

### Modul-laddningsordning (`designer.js`)

`start(os)` bygger själva Designer-fönstret och sätter `app.designer.win` SYNKRONT innan någon `includeModule().then()`-kedja hinner resolva, så varje lazy-laddad `designer_*.js`-moduls `init()` garanterat ser den satt. Live-språkbyte är begränsat till fönstertiteln (samma scope-princip som avsnitt 5/17) — Designerns toolbar, dockpaneler, menylista och färgväljare byggs och binds helt oberoende av varandra, utan en enda re-render-ingångspunkt.

De många `app.includeModule(...).then(mod => mod.init(app))`-kedjorna (ruler, devicemode, scrollbar, tabs, dock, menu, objektmodell, droppable, selection, verktygen, hover-overlay) laddas i en ordning som speglar riktiga beroenden:

- `designer_dock.js` (kärnregistret/renderaren) laddas före drag-reorder (`designer_dock_sortable.js`) och resize (`designer_dock_resizable.js`), som båda behöver dockens DOM.
- Färgsystemet laddas history → element/group-vyer → picker-fönster → pickup-tool → `core/style.js`s färgmedvetna `setColor`, eftersom både historik-stripen och pickup-toolens `'designer-color-picked'`-lyssnare kräver att `app.designer.colorHistory` redan finns.
- Style Binding-grunden (`core/stylesheet.js`) laddas före `core/style.js` — `buildStyle()` läser den via en riktig ES-import oavsett init-ordning, men laddningsordningen garanterar ändå att `app.designer.stylesheet` finns senast samtidigt som `app.designer.style`.
- Objektmodellen (Document/Node/registry/parser/renderer + blocktyper) laddas oberoende av flikordningen. `canvas/droppable.js` kedjas efter, eftersom den behöver `app.designer._registerRenderHook`/`applyDropAction`. `designer_selection.js` (single source of truth för vald nod) måste ladda före både outline (select-tool) och tag (hover-overlay), eftersom båda numera bara *reagerar* på dess broadcast. Split/Resize/Move/Text/Select-verktygen laddas i tur och ordning eftersom var och en behöver `app.designer.getDocument()`/`render()`; Resize är ambient (ogated av `activeTool`), Move/Text är gated bakom respektive tool-id.
- Sista `forEach`-loopen (Properties/Groups/Layers/History/Toolbar/animation-modulerna) har ett per-modul try/catch — samma mönster som `menu-body.js`s klick-wiring (avsnitt 3) och `designer_objectmodel.js`s render-hooks nedan: en modul som kastar under `init()` (t.ex. Properties egen initiala `panelHTML()`-rendering) fick tidigare tyst hoppa över varje modul REGISTRERAD EFTER den i arrayen — inklusive toolbaren själv — för resten av sessionen.

### Objektmodellen (`core/*.js`)

`Node`/`Document` (`core/document.js`) är kärnan: block-specifika shorthand-fält (t.ex. en splitters `direction`) foldas från syskon-till-`type`-position in i `props` i konstruktorn, så författad JSON kan skrivas i den enklare formen. `core/parser.js` (`load`/`serialize`) är gränsen mellan sparad JSON och det levande trädet. `core/registry.js` är block-typ-registret (`Node.type` → renderer-definition).

`core/style.js`s `buildStyle()` är där en nods `layout`/`style` blir en inline-CSS-sträng. Den läser Style Binding-grundens `resolveComputedStyle(node)` (`core/stylesheet.js`, Steg 1 av en planerad flerstegsomarbetning — se filens egen utförliga header-docblock för hela cascade-algoritmen, med states/Steg 7 och responsive/Steg 8 redan förberedda som låsta invarianter): matchande `.class`/`#id`-regler slås samman under nodens egen inline-stil, medan en nod utan classes/id fortsatt resolvar till rent `node.style`, oförändrat. En regels identitet är tripeln `(selector, state, breakpoint)`, inte `selector` ensamt — en class/id kan alltså hålla en normal regel plus valfritt antal state-/breakpoint-scopade varianter som separata poster. `canvas/renderer.js`s `render()` sätter `setActiveStylesheet(doc.stylesheet)` en gång, synkront, före trädvandringen — varje blocks `render(node, childHTMLs)` har annars ingen Document-referens att läsa ett stylesheet ifrån (säkert eftersom JS är single-threaded).

`core/color.js` innehåller rena färg-konverteringsfunktioner: en fullständig sRGB → linear → XYZ → CIE Lab (D65)-pipeline och tillbaka (klippt vid gamut-gränsen — en Lab-koordinat utanför sRGB ger sin närmaste visningsbara färg, aldrig ett kastat fel), och en konventionell enkel subtraktiv CMYK-approximation (ingen ICC-profil, i linje med vad en färgväljare utan riktig bläckprofil-hantering förväntas visa).

### Verktygssystemet (`tools/*.js`, `rules/element_capabilities.js`)

`rules/element_capabilities.js`s `TYPE_CAPABILITIES` styr vad varje verktyg får göra med en given nodtyp: en `button` är `resizable:false, splittable:false` (dess storlek kommer från innehållet, ingen intern layout att dela); ett `form` är `splittable:false` (ska förbli sammanhållet, matchar `tools/split.js`s befintliga spärr, nu generaliserad till data); en `splitter` är `splittable:false` (att dela en redan-splitter är inte väldefinierat) men INTE overridead på `resizable` — den flaggan betyder "kan denna nods egen andel ändras som ena sidan av SIN FÖRÄLDERS gräns", vilket en nästlad splitter-som-pane behöver precis som vilken annan nodtyp som helst.

**`tools/select.js`**: `outlineVisible` (Cursor-barens "frame"-checkbox) är ren UI-preferens, inte persisterad, oberoende av själva selektionen — avmarkerad döljer bara den blå outlinen via CSS utan att röra `app.designer.selection`. En re-render byter ut varje `.db-node`, så outline-klassen appliceras om mot den aktuella selektionen efteråt (`designer_selection.js`s eget render-hook hanterar redan att släppa selektionen om noden själv är borta).

**`tools/move.js`**: den enda dokumentmutationen är att flytta samma nod-instans mellan `children`-arrayer — aldrig en ny nod, aldrig en typ-/flexBasis-ändring.

**`tools/colorpickup.js`**: en engångspipett via native `EyeDropper`-API som återgår till Cursor-verktyget efteråt (ingen bestående läges-armering — det finns ingen bitmap-designyta att sampla mot). `.catch()`-grenen returnerar `null` tyst (Escape/nekad behörighet, inte ett fel). Sidopanelens pick trycker resultatet i förgrundssvatchen (`designer-color-group-primary`), som en riktig OS-pipett.

**`tools/resize.js`** har mest bug-historik av alla verktygsfiler. Två storleksmodeller samexisterar (se `blocks/splitter.js` nedan): en splitter med en flex-höjd-förfader ärver en gratis definit höjd och behåller procent-`flexBasis`; en splitter utan sådan förfader (root-nivå, eller vars närmaste splitter-förfader själv är en px-höjd-splitter) använder rena pixelhöjder. `HANDLE_OFFSET = 10` löser en verklig konflikt: vid en px-mode rows-splitters trailing edge sammanfaller sista panens botten och splitterns egen botten exakt i Def-state — en "closest wins"-tiebreaker gjorde ett handtag permanent otillgängligt (identiskt avstånd löste alltid till samma sida); lösningen förskjuter varje handtags hit-zon bort från den delade kanten (child ovanför, root nedanför) så ingen tiebreaker behövs. En anpassad SVG-markör för `CURSOR_VERTICAL` övergavs efter att ha rapporterats osynlig i en VS Code Live Preview-webview (anpassade data-URI-markörer stöds inte pålitligt där); disambigueringen bärs nu av drag-tooltipens textetikett istället för markörformen. `findPlainNodeEdgeAt()` slutade utesluta det implicita rot-"Canvas"-containerelementet — det var fel att anta att användaren aldrig vill resiza det direkt, särskilt på en annars tom canvas; en padding-lös wrapper-med-ett-barn-konflikt (identiska gränser, ingen storleksskillnad att sortera på) löses istället via nästlingsdjup, till förmån för den mer specifika (innersta) noden. `plainNodeIsResizable()` återanvänder medvetet INTE `element_capabilities.js`s `isResizable()`-flagga (den betyder något annat, se ovan) — att göra det blockerade tyst höjd-resize på varje button/form-nod. `startDragPercent()` mappar muspositionen 0..1 över bara A+B-panens KOMBINERADE andel (inte en rå 0-100%), annars pushas totalen över alla paner förbi 100 % så fort en tredje pane finns.

**`tools/split.js`**: en tidigare anpassad sax+orienterings-SVG-markör visade sig aldrig faktiskt renderas, av samma grundorsak som Cursor Engine i allmänhet (avsnitt 10) — den globalt suppresserar native-markörer och löser sina egna SVG-overlays enbart från CSS `cursor:`-NYCKELORD, aldrig från ett rått `url()`-värde. Lösningen registrerar sax-grafiken som en helt ny engine-markör (`registerCustomCursors()`) istället för att byta till ett inbyggt nyckelord (den väg `resize.js` valde för sitt motsvarande problem). `splitRows()`/`splitColumns()` gör om den klickade noden till splittern PÅ PLATS (samma id, samma position hos sin förälder) — inget wrappas utifrån. `addSiblingPaneRows()`/`addSiblingPaneColumns()` ("Add Pane") lägger alltid till den nya panen i den klickade nodens FÖRÄLDER-splitter, aldrig inuti noden själv — en tidigare version specialbehandlade en tom klickad nod genom att tyst omtolka Add Pane som en nästlad Split, vilket bröt det medvetna användarvalet mellan de två dialogerna. "Add Pane or Split?"-dialogen är bara tvetydig när klickad nod redan är en pane i en splitter som kör SAMMA riktning som appliceras — annan riktning har bara en meningsfull tolkning (nästla), ingen fråga behövs.

**`tools/text.js`**: `pendingStyle`/`pendingTag` är stagead stil/tag för NÄSTA textnod som skapas medan inget är valt (samma "konfigurera innan du placerar den"-idé, för stil respektive `props.tag`) — de rör aldrig retroaktivt en befintlig nods stil. `enterTextEdit()` selekterar noden direkt vid redigeringsstart (inte bara vid commit), så allt kopplat till `app.designer.selection` (toolbar, outline, Layers-rad) reagerar omedelbart. Att växla verktyg mitt i redigering committar alltid det skrivna, samma som en blur.

### Splitter-blocket och layoutmodellen (`blocks/splitter.js`, `designer_objectmodel.js`)

Splitter-noden har två storleksmodeller beroende på om den har en flex-höjd-förfader (procent-`flexBasis`, vanlig flex-`.db-splitter-pane`) eller inte (rena pixelhöjder, `px-mode`-klassen, `display:block`). I px-mode användes en CSS custom property, `--db-pane-h`, för att sträcka en panes barn-`.db-node` till att fylla panens fulla, literala pixelhöjd. Två andra tekniker provades och övergavs: `position:absolute;inset:0` fungerar aldrig eftersom varje blocks renderer redan sätter `position:relative` som sin egen inline-stil (som alltid slår en stylesheet-regel); `height:100%` löste sig oförutsägbart så fort mer än en auto-höjd-box låg mellan panen och en genuint definit-höjd-förfader — procentandelen "nådde igenom" flera mellanliggande boxar och blåste upp en nästlad pane till en orelaterad storlek. Custom properties ärvs genom auto-höjd-boxar utan procent-upplösningens tvetydighet, och varje pane-gräns deklarerar alltid ett värde (det riktiga px-talet eller den bokstavliga strängen `"auto"` för Def-state) för att blockera oavsiktlig ärvning från en helt orelaterad yttre pane.

Injicerad CSS i `designer_objectmodel.js` bär flera lager av bugghistorik ovanpå denna grundmodell: `.db-splitter-pane > .db-node { flex:1; min-height:0 }` gör att en panes barn alltid fyller sin wrapper (annars gav "dött utrymme" i wrappern en hit-testning som hoppade förbi barnet till splittern själv, och visade "Splitter" istället för panens egna innehållstyp i verktyg som läser `closest('.db-node')`). En NÄSTLAD splitter inuti en pane återställer istället `min-height:auto` (mer specifikt, 3 klasser vs 2) — den är själv en flex-container med egna barn som har ett riktigt min-height-golv, och `min-height:0` hade dolt en tyst overflow förbi splitterns egen kant. En rad-splitters hover-highlight-border är gated på BÅDE hover OCH aktivt verktyg (`db-split-row-hover`, togglad i `designer_hover_overlay.js`) eftersom ren CSS `:hover` inte kan uttrycka AND-villkoret. En rad-riktad splitter vid/nära dokumentroten fick tidigare ingen renderad höjd alls (rotens implicita `layout:{mode:'flow'}` är `height:auto`, så procent-flexBasis hade inget definit att lösa mot) — två CSS-only-fix (blanket `height:100%`, sedan `:has()`+`:only-child`-scopning) övergavs eftersom de applicerades ovillkorligt oavsett riktning och sträckte element som inte skulle fylla hela canvasen; den faktiska fixen ligger i JS: `convertToRowSplitter` ger splittern en liten explicit `layout.height` (pane-antal × 40px) vid konverteringsögonblicket, bara när inget annat redan ger en definit höjd, renderad genom samma `buildStyle()`-mekanism som alla andra noder.

`convertToRowSplitter`/`convertToColumnSplitter` har egen omfattande bugghistorik kring vilket fält (`layout.height` kontra `props.height`) som bär pre-split-höjden, hur den delas mellan de två nya panerna beroende på Def/Defined-state, och varför `flexBasis`/`width` måste strippas ur pane1s ärvda layout (en ärvd inline `layout.width` slår alltid CSS-regeln som annars skulle fyllt panens fulla bredd — hittat live som en 800px-nod som delades vid 75 % och renderade pane1 vid hela 800px istället för sin 600px-andel). `tools/split.js`s `_snapshotNode()`/`_applyNodeSnapshot()` fångar de muterbara fälten dessa funktioner skriver över, så en delning kan ångras/göras om genom att växla snapshot istället för att köra om konverteringen (vilket skulle mynta nya pane-id:n vid varje redo).

### Dockpanelerna

`designer_dock.js` är kärnregistret/renderaren för `#designerProperties`. `designer_dock_resizable.js` kör alltid `$c.resizable('destroy')` innan ombindning, eftersom dockens `render()` bygger om containern via `innerHTML` vid varje ändring, vilket förstör jQuery UI:s handle-element men lämnar kvar markörklassen; dess `'w'`-handle flyttas till `left:0px` (jQuery UI:s default kilar den halvt utanför containerns vänsterkant, rakt ovanpå den vertikala scrollbaren `#scrollbarY`, som vinner träfftestet). `designer_dock_sortable.js` synkar den nya DOM-ordningen till varje panels `sort`-värde (10 i mellanrum, för framtida infogningar) UTAN att trigga en re-render mitt i drag-settle-fasen.

Flera paneler delar samma "flush-tabbar i titelraden istället för textrubrik"-mönster, eftersom `designer_dock.js`s `.dock-title` bara behandlar titeln som en opak HTML-sträng: `designer_boxmodel_panel.js`s fyra `DELEGATE_TABS`-flikar (Box/Position/Text/... — de `'gradients'`/`'patterns'`-flikarna dispatchas rakt till Gradients/Patterns-panelernas egna `renderInto(container)`), `designer_layers_panel.js`s Layers/Elements-par, `designer_groups_panel.js`s sex BOX/POSITION/TEXT/BACKGROUND/BORDER/EFFECTS-flikar (för många för en rad — scrollar horisontellt med dold scrollbar, till skillnad från Layers/Elements tvåflikspar). Var och en scopar sin `.dock-title`-override till sitt eget `[data-dock-id]` så Properties/History/etc. behåller sitt vanliga textbaserade titelbeteende.

`designer_boxmodel_panel.js`s `PROP_OF`/`SECTION_COLOR`-tabeller delas medvetet av diagram, fältrader och commit-handler (men är en oberoende kopia av `designer_groups_panel.js`s motsvarande `SIZE_UNITS`/cascade-läslager — programmets konvention för små per-fil-konstanttabeller snarare än cross-file-import, eftersom `designer_*.js`-filerna är `app.includeModule`-syskon utan riktiga ES-importer mellan varandra). Panelen läser `resolveComputedStyle` (Style Binding) för att visa det RESOLVADE cascade-värdet, inte rått `node.style`. Både den och `designer_layers_panel.js` registrerar sin `render()` på BÅDE dockens render-hook (fångar drag-reorder/resize/save-load, som annars nollställer panelen till sin ursprungliga add()-platshållare) OCH `app.designer._registerRenderHook` (fångar canvas-nivå-ändringar) OCH en `'designer-selection-changed'`-lyssnare (en ren markeringsändring triggar aldrig i sig en canvas-render).

`designer_layers_panel.js`s `BLOCK_ICONS` använder emoji, inte OS:ets SVG-sprite — spriten saknar helt en post för image/button/layout/custom, och att återanvända en delad container-ikon för dem hade satt två visuellt identiska brickor i det platta rutnätet. Dess "+"-tilläggsmeny och `designer_menu.js`s egen submeny delar samma teleporterad-till-`document.body`-mönster med en capture-fas utanför-klick-stängare (bubble-fas hade missat ett klick vars egen trigger redan anropat `stopPropagation()`, t.ex. en `app.ui.dropmenu`-instans).

Färgsystemet: `designer_color_history.js` äger Properties-panelens "Color"-tab (map/slider för FG/BG-slottarna); `applyColor()` uppdaterar mini-swatchen direkt utan full omrendering mitt i en drag, och committar till Recent bara vid `pointerup` (release), inte varje mellanliggande sample. `designer_color_element.js` (ColorElementView/ColorGroupView) är swatch-fabrikerna, inklusive den kompakta "stacked" toolbox-layouten (Photoshop-stil förgrund/bakgrund, överlappande kvadrater + hörn-swap/reset). `designer_color_picker_window.js` är en fristående Photoshop-liknande avancerad väljare. `designer_gradients_panel.js`/`designer_patterns_panel.js` delar CRUD-formen och ett gemensamt "asset grid"-CSS-utseende med color-history; en Chromium-specifik bugg (`background:none` stryper en nativ `<input type=color>`-swatchs egen färgfyllnad) fixas i båda via `-webkit-appearance:none` + explicita `::-webkit-color-swatch*`-pseudoelement-regler istället.

### Canvas-verktygsfältet och sidomenyn

`designer_toolbar.js` (`#designerToolbar`) delas mellan Cursor-baren (nod vald) och text-formateringsbaren (Text Tool aktivt) — samma element, olika innehåll. `fontFamilyOptions()`/`mountDropdowns()` hanterar det generella dropmenu-mönstret från avsnitt 4 (ikon-bara trigger vs rik HTML-lista) för typsnitts-/vikt-/kant-utjämnings-kontroller. `#designerToolbar`s CSS-`overflow` ändrades från `hidden` till `visible`, eftersom `hidden` även klippte dropdown-popuppernas listor, som måste rendera under barens 24px-höga rad — fönstrets eget `overflow:hidden` räcker fortfarande för att hindra oavsiktlig horisontell overflow.

`designer_menu.js` (`#designerMenuList`, sidobaren) har `toolIds` per item så `setActiveTool()` kan highlighta rätt ikon oavsett aktivt verktyg (en ikon kan täcka flera id:n, t.ex. Splitter täcker `'split-rows'`+`'split-columns'`). Undermenyer är teleporterade fixed-position-popups, samma mönster som fönster-menysystemet (avsnitt 3). Sidomenyns kategorier fick sin nuvarande form efter iterativ direkt feedback: Container/Form slogs ihop med Image/Button; Splitter aktiverar click-to-split-läge; Move är gated bakom `activeTool` (till skillnad från Resize, som är ambient); Text Tool har sin tagg-väljare i toolbaren istället för en egen sidokategori (dess submeny har en toppnivå-klick som aktiverar Normal Text direkt); "Wave Text" togs bort ur UI:t men `blocks/text.js` renderar fortfarande befintliga `textMode:'wave'`-noder korrekt (ingen migrering behövdes); Color Picker är en engångspipett utan bestående läge.

### Hover/selection-overlay (`designer_hover_overlay.js`, `designer_selection.js`)

Två oberoende flytande taggar (selection-tag + hover-tag), båda `position:fixed` på `document.body` (inte ättlingar till Designer-fönstret). `designer_selection.js` är enda sanningskällan för vald nod; dess render-hook validerar mot färsk DOM (en re-render kan ta bort den valda nodens element), och dess `'designer-node-inserted'`-lyssnare väljer det som just infogades, precis som ett klick — ett enda ställe bestämmer detta istället för att varje konsument (outline, tagg) oberoende reagerar på insert-eventet.

Click-handlern på `.db-node` är delegerad till samma selektor och gate (`activeTool==='select'`) som `tools/select.js`s egen — tidigare ovillkorad, vilket klonade markeringen ett annat verktygs egen click-handler just satt på samma event (hittat via `tools/text.js`: att gå in i redigeringsläge markerade textnoden, sedan omvaldes omedelbart vilken `.db-node` som fysiskt låg under klicket). Att flytta från en `.db-node` till tom canvas-yta (fortfarande inuti `#designerCanvasBody`, så canvas-nivåns mouseleave aldrig fyrar) föll tidigare igenom tyst och lämnade den senast hovrade taggen synlig — nu hanterat explicit.

Fönster-drag-hanteringen i `init()` observerar Designer-fönstrets `style`-attribut (MutationObserver) för att omplacera taggarna: en ren positionsflytt av fönstret triggar aldrig en ResizeObserver, och taggarna hade blivit kvar på sin gamla skärmposition. Ett Snap Layout-commit sätter sin slutgiltiga position tillsammans med en CSS-transition — style-attributet (och därmed observern) fyrar direkt, men elementet slutar inte röra sig förrän transitionen är klar ~300ms senare, så en samma-tick `getBoundingClientRect()`-läsning är stale (samma buggklass som "Maximize restore stale-read bug", avsnitt 3) — omplacering sker därför både direkt (för responsivitet under draget) och en gång till efter transitionens varaktighet. Observern bevakar även `class` (inte bara `style`), eftersom fokusbyten togglar `.active` och det är hur taggarna vet att gömma sig bakom ett annat aktivt fönster.

`.db-node`s `min-height:40px` är en permanent baslinje (ingen `padding-top` reserverad för taggen, som är en ren overlay) — ett tidigare `padding-top:15px`-tillvägagångssätt eskalerade illa genom nästlade splitters, där varje nivå lade till ytterligare 15px och orsakade en synlig höjd-overflow-bugg.

### Dialoger och övriga canvas-widgets

`designer_animation_dialog.js`/`designer_border_dialog.js`/`designer_sides_dialog.js` delar `_pending`/`_uiReady`-modulvariabler (stashad `{options}` konsumerad synkront i `body()`; ett Promise som väntar in `app.ui.dropmenu`). `designer_border_dialog.js`s injicerade CSS behövde element+class-specificitet (`input.dbd-width`, inte bara `.dbd-width`) för att slå den globala `input.def`-regelns `width:calc(100% - 2px)`, som annars svällde fältet till ~266px i en 360px rad. `designer_sides_dialog.js`s fältmarkup använder rena `<div>`, inte `<label>`, runt varje sida-inputs par av input+enhetsdropdown — en `<label>` som omsluter TVÅ fokuserbara kontroller vidarebefordrar ett klick på dropdownen till labelns implicit associerade första kontroll (samma "label wraps two controls"-bugg som är dokumenterad generellt i minnesanteckningarna). Samma fils `wireDialog()` fyller ALLA sidors dropdown-mounts innan `initAll()` anropas en gång — att interfoliera per-sida-`innerHTML`-skrivning med ett per-sida-`initAll()`-anrop lämnade senare mounts oresponsiva trots att deras "redo"-markör ändå sattes.

`designer_ruler.js` ritar topp/vänster-px-linjaler med roterad (-90°) vänster-label-text och en dragbar guide-line vars osynliga "hit"-box är bredare än den synliga 1px-linjen för lättare grepp. `designer_scrollbar.js`s injicerade `::-webkit-scrollbar{display:none}` behövs specifikt för WebKit/Blink (Firefox/gammal Edge döljs redan inline i `designer.js`); dess `ResizeObserver` bevakar både viewport och scrollbart innehåll, eftersom endera kan ändra scroll-extenten (t.ex. device-mode-dropdownens resize av `#designerCanvasBody`). `designer_devicemode.js`s dropdown öppnar uppåt (`direction:'up'`, den sitter längst ner på canvasen) med flera scoped style-overrides mot den delade dropmenu-CSS:en (dimensionerad för staplade inställningsrader, inte en fast 24px-strip). `designer_tabs.js`s sorterings-mousedown aktiverar fliken (bygger om DOM:en via `render()`) innan draget startar, och måste därför köa om DOM-elementet efteråt eftersom den ursprungliga jQuery-kontexten blir stale.

---

## 19. Notepad (`program/notepad/*`)

Flera fönster stöds (`multistart:true`); `exec(action)` sätter `app.config.set('notepad', 'activeWindowId', ...)` innan den anropar kommandot, så Explorers filväljar-dialog (öppnad från Notepads Open/Save As) vet vilket Notepad-fönster som är dess "förälder". Live-språkbyte är begränsat till fönstrets titel (se avsnitt 5) — menyns `_("File")`-nycklar och statusradens initiala text beräknas en gång vid `windowStart()` och fryses där, samma mönster som `notepad_data.js` sedan skriver över med live cursor-värden; att på ett säkert sätt bygga om menyn/statustexten utan att krocka med den uppdateringslogiken lämnades som en större separat uppgift.

Alla flikar i ett fönster delar EN `<textarea>`, vars `.value` byts vid flik-aktivering — en medveten avvägning, inte ett förbiseende (se minnesposten "Notepad tabs + title menu"): `win._np.undo`/`redo` använder webbläsarens `document.execCommand("undo")`-historik, som lever på `<textarea>`-elementet självt, och att byta `.value` byter inte med den historiken, så undo/redo efter flikbyte kan nästla in i en annan fliks redigeringshistorik. En egen `<textarea>` per flik hade löst det korrekt men kräver omkoppling av varje `editor.*`-referens i en ~800-raders fil — dokumenterat som utanför scope snarare än tyst ignorerat. `notepad_tabs.js`s lyssnare på `'notepad-tab-activated'` MÅSTE bindas innan `createTabs(win)` anropas, eftersom dess seed-`add()` utlöser eventet synkront innan den returnerar. `close(id)` skapar alltid en ny tom flik när sista fliken stängs — en texteditor ska aldrig hamna helt dokumentlös.

`notepad_data.js`s `win._np.font()` sparar cursor-positionen innan typsnittsdialogen stjäl fokus (för att kringgå en känd `caret.js`-"lastFocusMethod"-bugg som annars hoppar markören till textslutet vid återfokusering) och återställer den EFTER att det valda typsnittet hunnit ladda klart (annars mäts caret-positionen mot fallback-typsnittets bredd, och texten om-flödar till fel x-position när den riktiga fonten sedan laddar). `allFonts` läser samma delade `app.fonts.get()`-registry som Designer (avsnitt 18), inte en egen hårdkodad lista; `SYSTEM_FONT_NAMES` är en separat lokal lista över namn som renderar direkt utan `loadGF()`s Google Fonts-nätverksanrop. `setup.js`s "New Text File"-post i Explorers New-undermeny registreras som en `() => _(...)`-thunk (se avsnitt 5) eftersom den registreras INNAN programmets egen språkfil hunnit ladda.

---

## 20. Mediaplayer (`program/mediaplayer/*`)

`setup.js`s overlay-CSS (`#mp-overlay-styles`) injiceras som en fristående `<style>`-tagg istället för via `app.addProgramCSS`, medvetet: den senare tar bort sin CSS när sista programfönstret stängs, men statusikonen och dess toggle-overlay-panel (avsnitt 4) ska fungera även när inget spelarfönster är öppet. Explorer-metapanelens kompakta ljudspelar-widget registreras redan i `setup()` (boot-tid) så ett redan öppet Explorer-fönster plockar upp den direkt. `os.language.registerRefresh("mediaplayer-overlay", ...)` är en permanent registrering som aldrig avregistreras (till skillnad från per-fönster-tokens) eftersom statusikonen/overlayen är en singleton som lever hela sessionen — `_refreshOverlay()` är redan säker att köra som no-op när panelen inte är öppen. Panelen öppnas med `height:"auto"` (renderad höjd varierar med spårlistans längd), och den returnerade `.reposition()`-handtaget körs om varje gång innehållet byts på plats.

Kontextmenyn i `mediaplayer.js`s `body(win)` binds till `#${instanceId}-root` (inte fönstrets rot-element), specifikt för att undvika att trigga `program.add()`s egen klick-kedja. `mediaplayer_data.js`s instans-objekt exponerar `_updateWindowTitle`/`_updateMeta` specifikt så språkbytes-refreshen kan räkna om titel och spårinfo-fallback utan att duplicera logiken utanför filen.

---

## 21. Mail (`program/mail/*`)

`start()`s `body(win)` begränsar live-språkbyte till fönstrets egen titel — sidopanelens nav-etiketter och Compose/Contacts-vyerna är för närvarande inte alls inslagna i `_()`. `win.state.close(...)` skjuter upp `os.removeCSS("Mail")` 450ms via `setTimeout` istället för direkt: `window.js`s `_performWindowClose` skickar `close`-eventet INNAN fönstrets 400ms fade-out-animation (basic.css) hinner spela klart, så CSS:en togs annars bort medan fönstret fortfarande syntes stänga. Layouten (`columns`) renderas via `os.ui.body()` istället för rå HTML specifikt så `{ script }`-noden (`mail_data.js`s `data()`) triggas automatiskt.

`mail_api.js`s lokala fallback för `sendEmail()` escapar `payload.body` (`app.util.escapeHtml`) innan den wrappas i `<p>`-markup — annars kunde ett skickat meddelande injicera HTML i sin egen eller en mottagares detaljvy. `markRead()`/`toggleStar()` uppdaterar cachen optimistiskt, före backend-svaret. `mail_data.js`s `data(os)` hittar det senast skapade, ej redan initierade fönstret genom att skanna `containers` BAKIFRÅN — hanterar korrekt flera samtidigt öppna Mail-fönster. `app.mail._api` exponeras globalt så Start-menyns kompakta mail-flik (annan kontext) kan nå samma API-instans. Initial-laddningen har ett tvåstegs fallback: `api.listEmails()` fyller cachen via `seed()` internt; om anropet självt kastar faller koden tillbaka till ett direkt `api.load()`.

`setup.js` bygger `app.mail` SYNKRONT direkt vid `setup()`-start (innan några await:s) — `startmenu.js`s `createEmailTab()` anropas oberoende vid boot och måste hitta `app.mail` redan då. `mail_data.js` laddas eagerly (inte lazy) av samma skäl, så Start-menyns mail-flik har riktig data direkt vid boot. `style.css`s `.layout-compact`/`.layout-mobile` styrs av JS-satta klasser (`ResizeObserver` på fönstrets faktiska bredd), inte viewport-`@media`-queries — i ett OS med flera samtidigt synliga fönster är fönstrets bredd, inte webbläsarfönstrets, det relevanta måttet.

---

## 22. Solitaire (`program/solitaire/*`)

`solitaire.js`s `body(windowObj)` sätter `solitaire.win = windowObj` via `setTimeout(...,0)`, eftersom `body()` körs synkront INUTI samma `windowStart()`-anrop som skapar `solitaire`-variabeln längre ner — en direkt tilldelning hade träffat variabelns temporal dead zone. `let solitaire = {...}` byggs i två steg (bas-objekt, sedan `Object.assign` för fabriksfunktioner som stänger över `solitaire` själv) av samma anledning. Bara fönstrets titel omregistreras för språkbyte — High Scores/"you won"-dialogerna byggs om från grunden varje gång de öppnas.

`solitaire_config.js`s `cardOffset*`/`CARD_WIDTH`/`CARD_HEIGHT` måste hållas i synk för hand med `"lg"`-posten i `solitaire_sizing.js`s `SIZE_TIERS`. `cardBackId` läses direkt från `localStorage` vid konfig-skapande så den matchar den `deck-<id>`-klass `solitaire.js`s DOM-mall redan applicerat vid samma initiala rendering (mallen byggs innan `solitaire`-objektet konstrueras — båda måste räkna fram samma default oberoende). `_activeSizeTier` startar medvetet som `null` (inte `"lg"`) så det allra första `applySizeTier()`-anropet alltid kör fullt ut. `solitaire_deckchooser.js`s `DECKS`-namn är thunks (se avsnitt 5).

Undo/redo-systemet (`solitaire_dragdrop.js`/`solitaire_functions.js`/`solitaire_history.js`) bygger `doDrop()` så den återanvänds oförändrad för både `do()` och `redo()` — poängsättningen (`score.ten`/`score.three`) är idempotent. `moveCardToSlot()`s `.then()`-callback lämnar `do()` tom i history-anropet (animation+poäng har redan hänt när promisen resolvat) — en senare `redo()` går istället via `history.redoMove()`, en synkron icke-animerad motsvarighet, eftersom att återanvända `moveCardToSlot()` för redo hade rekurserat tillbaka in i samma `execute()`-anrop. `undoMove()`s "drop"/"doubleclick"-gren slice:ar (kopierar) `move.args.cardIds` istället för att aliasera direkt, eftersom samma array fortfarande kan hållas av en `do()`/`redo()`-closure.

`.card-back`s deck-1-mönster (gröna diagonala ränder) är den ovillkorade CSS-fallbacken om något skulle rendera `.solitaire-game` utan en `deck-N`-klass; decks 2-8 är rena CSS-mönster (inga bildresurser i programmet). Storleks-tiers (`.size-md`/`.size-sm`) är diskreta, JS-växlade klasser baserat på uppmätt fönsterbredd — inte flytande CSS-skalning; vid den minsta tiern döljs mittensymbolerna helt (bara topp-vänster rank/svit) istället för att krympa ytterligare.

---

## 23. Övriga program

**Calc** (`program/calc/setup.js`): `os.language.loadProgram("calc")` tar programmets FOLDER-namn ("calc"), inte dess registrerade id ("calculator") — de skiljer sig för flera program i kodbasen, och hämtvägen måste matcha den riktiga mappen på disk (`program/calc/lang/...`), en verklig fallgrop om mönstret kopieras oreflekterat till ett nytt program.

**GUI-showcase** (`program/gui/gui.js`): en statisk referens/showcase utan redigerbart state — bara fönstertiteln omregistreras för språkbyte, konsekvent med scopet i övriga program, trots att en full ombyggnad hade varit säker också (alla sex sektioner byggs redan in i en enda HTML-sträng utan per-flik-renderfunktion att köra om separat).

**Formbuilder** (`program/formbuilder/formbuilder.js`): samma titel-bara språkbytes-scope som Notepad/Mail/GUI — de olika dialog-kropparna byggs redan om från grunden varje gång de öppnas.

**Voiceinput** (`program/voiceinput/voiceinput.js`): ingen `registerRefresh`-koppling alls (se avsnitt 5) — enda UI:t är en kortlivad `app.ui.toggle.window()`-overlay utan ett riktigt fönster att haka ett läckagesäkert refresh-par på; `body()` körs redan om från grunden vid varje öppning.

---

## Designprinciper som går igen

- **Program äger sin egen registrering.** Inget centralt "lista över bildtyper" eller "lista över ljudtyper" finns i Explorer/Media Player-lagret — varje program deklarerar sig själv via `addInfo`/`openWith`, och delade system (Explorer, taskbar, startmenu) läser ur de registren.
- **`setup()` = boot-kritiskt state, `start()` = lazy UI.** Allt som andra delar av systemet kan tänkas bero på (ikoner, `extInfo`, `fileHandlers`) måste sitta i `setup()`, aldrig i `start()`.
- **En bild/fil gäller alltid en specifik post, oavsett multi-select.** Explorers `rowMenu()`, den delade `buildContextMenu()`, och skrivbordsikonernas egen multi-drag skiljer alla konsekvent på "hela markeringen" (Copy/Cut/Delete) och "den specifikt klickade posten" (Öppna/Byt namn/Sätt som bakgrund) — de senare försvinner aldrig bara för att flera objekt råkar vara markerade.
- **Timeouts är en säkerhetsventil, inte flödet.** `app.dom.waitFor`, `setBackgroundImage`s fetch, `waitForTransitionEnd` — alla har en timeout, men den reaktiva/event-baserade vägen (MutationObserver, `await fetch`, `transitionend`) är alltid det som faktiskt avgör när något är klart. En timeout som triggas i normal drift är ett tecken på att något annat är fel — notifikationssystemets numera fixade `#timeDisplay`-väntan (avsnitt 9) och taskbarens positions-race (avsnitt 6) är båda konkreta exempel på just det.
- **En `forEach`/loop över oberoende konsumenter behöver per-item try/catch.** Ett synkront kastat fel i EN registrering (menyalternativ i `menu-body.js`, dockpaneler i `designer.js`, render-hooks i `designer_objectmodel.js`) får aldrig tyst hoppa över varje efterföljande registrering i samma array för resten av sessionen — samma mönster upptäcktes och fixades oberoende i minst tre olika delsystem.
- **Frusna översättnings-thunks är en återkommande, generell buggklass.** `_()` som resolvas en gång vid modul-/registreringstillfället fryser den strängen till boot-språket för alltid; fixen är genomgående densamma — skjut upp till en `() => _(...)`-thunk, resolvad först vid faktisk render-/öppningstillfälle. Hittat och fixat oberoende i Explorers New-meny, skrivbordsikonernas kontextmeny, Notepads New-meny, Solitaires deck-väljare och flera `startmenu`/`taskbar`-ställen (se avsnitt 5).
- **Teleporterade overlays (fixed på `document.body`) behöver egen z-index- och stäng-vid-utanför-klick-hantering, ofta i capture-fasen.** Menyer, dropdowns, tooltips och Designerns hover-taggar flyr alla sina förfäders `overflow:hidden`/stacking context på samma sätt — och en trigger som redan anropar `stopPropagation()` kräver att stängningslyssnaren sitter i capture-fasen för att fortfarande se klicket.
- **En CSS-transitions faktiska sluttillstånd kan vara stale i samma tick den startar.** Att läsa `getBoundingClientRect()`/`.width()`/`.height()` direkt efter att en transition triggats (fönster-maximering, Designer-taggars omplacering efter ett Snap Layout-commit) ger ofta det GAMLA värdet — antingen läs det kända, redan beräknade JS-värdet istället, eller vänta in `transitionend`.

---

## Avsiktligt utelämnat ur denna sammanslagning

Ett antal filer täcktes av kommentar-migreringsomgången men gav inget substantiellt att föra in här: `sandstorm/core/modules.js`, `sandstorm/core/security.js`, `sandstorm/core/utils.js`, `sandstorm/state/store.js`, `sandstorm/ui/css.js`, `sandstorm/basic.css`, `login/login.css`, `explorer/explorer.js`, `designer/core/parser.js`, `designer/core/registry.js`, samt `blocks/button.js`/`container.js`/`custom.js`/`form.js`/`image.js`/`layout.js` innehöll inga substantiella in-body-kommentarer alls (redan ren logik eller redan fullt dokumenterade via JSDoc-headers, vilka aldrig rördes av migreringen). Nätverksövervakaren (`networkmonitor`) och skrivbords-/startmeny-widgets nämndes i omfånget för en av migreringsagenterna men gav inget innehåll — sannolikt av samma skäl. Ett antal enskilda konstant-tabeller (`FONT_SIZE_UNITS`/`SIZE_UNITS`/`SOURCE_COLOR` upprepade som oberoende kopior över flera `designer_*.js`-filer, `PREVIEW_MIN_PERCENT` duplicerad mellan `tools/resize.js` och `tools/split.js`) nämns här bara en gång som ett mönster snarare än en gång per fil, eftersom de är genuint repetitiva instanser av samma redan dokumenterade konvention.
