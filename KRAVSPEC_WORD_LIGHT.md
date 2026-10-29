# Kravspecifikation — Word light

**Status:** Utkast 4 (arkitekturprinciper i 7.0). Version 1 är byggd (öppna, visa, block, spara, textmarkering, OCR); sidhantering och lagring i IndexedDB återstår.
**Datum:** 2026-10-17
**Ersätter:** KRAVSPEC_PDF.md (utkast 1)

---

## 1. Huvudmål

Word light är ett dokumentprogram i Sandstorm CMS OS. Det ska kunna **öppna, visa och vid behov redigera PDF-filer på ett säkert sätt**. Det integreras med CMS:et och hanterar alla filer via **Explorer API**. Designen påminner om ett ordbehandlingsprogram i stil med Microsoft Word, men programmet är Sandstorms eget.

**Viktig skillnad:** att *visa* en PDF och att *redigera själva PDF-dokumentets text* är två olika saker. Word light redigerar **blockbaserat**. Användaren lägger till textblock, markeringar och kommentarer i ett eget lager **ovanpå** PDF-sidorna. Den ursprungliga texten i PDF:en ändras inte.

## 2. Omfattning

**Ingår:**
- PDF som filtyp i Explorer
- visning och sidnavigering
- blockbaserad redigering (textblock, markeringar, kommentarer, bilder, namnteckning)
- sidhantering
- säker körning
- spara och ladda ned via CMS:ets filhantering
- lokal lagring i testmiljön
- Word-inspirerad design
- svenska och engelska.

**Separat del, senare:** öppna DOCX (avsnitt 5.10).

**Tillagt i utkast 3:** textigenkänning (OCR) av inskannade sidor (avsnitt 5.11).

**Ingår inte** (avsnitt 9):
- formulärfält
- att ändra den befintliga texten i PDF:en på plats
- krypterade PDF:er utan lösenord
- digitala signaturer
- samtidig redigering av flera användare.

## 3. Begrepp

| Begrepp | Betydelse |
|---|---|
| Testmiljö | Sandstorm körs via `program.exe`, utan PHP. Explorers mappar är simulerade. |
| Livemiljö | Sandstorm körs med PHP-servern. Explorers `RealStorage` är riktiga filer på servern. |
| Explorer API | `app.explorer.*`: `openFile`, `openWith` (filtypsregistrering), `uploadFile`, `_getNode` med flera, samt `realfs.js` för `RealStorage`. |
| Redigeringslager | Ett separat lager ovanpå PDF-sidan där användarens block ligger. Det är skilt från PDF:ens eget innehåll. |
| Block | Ett objekt i redigeringslagret: textblock, markering, kommentar, bild, namnteckning, form eller övertäckning. |
| Måste / Bör / Kan | Prioritet. **Måste** ingår i version 1, **Bör** helst i version 1, **Kan** kommer senare. |

## 4. Användare och miljöer

- **Användare:** inloggad Sandstorm-användare. Ingen särskild behörighet krävs.
- **Webbläsare:** senaste versionen av Chrome, Edge och Firefox på dator. Surfplatta och mobil bör kunna visa dokument. Redigering behöver bara fungera med mus.
- **Miljöer:** allt i avsnitt 5 ska fungera i både testmiljö och livemiljö, om inget annat står.

## 5. Funktionella krav

### 5.1 Filtyp och öppna (Explorer API)

| ID | Krav | Prio |
|---|---|---|
| F-01 | Word light finns i startmenyn och öppnas i ett eget Sandstorm-fönster. | Måste |
| F-02 | `.pdf` registreras som filtyp via `openWith` i `program/wordlight/setup.js`. PDF-filer får Word lights ikon i Explorer, och dubbelklick öppnar dem i Word light. | Måste |
| F-03 | Filer öppnas och sparas via Explorer API. Word light läser och skriver aldrig filer på egen hand förbi Explorer. | Måste |
| F-04 | **Arkiv → Öppna** visar Explorers egen filväljardialog (dialogläge), filtrerad på `.pdf`. | Måste |
| F-05 | Det går också att öppna en PDF från datorn (filväljare eller dra in i fönstret). Filen importeras då till Explorer först. | Bör |
| F-06 | Flera dokument kan vara öppna samtidigt, i separata fönster. | Bör |
| F-07 | Lösenordsskyddad PDF: programmet frågar efter lösenordet. | Kan |

### 5.2 Visa och navigera

| ID | Krav | Prio |
|---|---|---|
| F-10 | PDF:en visas som ett dokument: sidorna skarpt renderade, centrerade på en grå arbetsyta, med skugga runt varje sida som papper. | Måste |
| F-11 | Zooma med ett reglage i statusfältet, Ctrl+scroll och "Anpassa till bredd/sida". | Måste |
| F-12 | Navigeringsfönster till vänster med sidminiatyrer. Klick hoppar till sidan. | Måste |
| F-13 | Statusfältet visar "Sida X av Y". Ctrl+G går till en sida. | Måste |
| F-14 | Sök i dokumentet (Ctrl+F), med träffar markerade och nästa/föregående. | Bör |
| F-15 | Text i PDF:en går att markera och kopiera. | Bör |
| F-16 | Läsläge (Visa → Läsläge): döljer menyfliksområdet och visar bara dokumentet. | Kan |

### 5.3 Blockbaserad redigering (redigeringslagret)

| ID | Krav | Prio |
|---|---|---|
| F-20 | **Textblock:** klicka för att placera ett textblock. Typsnitt, storlek, fetstil/kursiv/understruken, färg och justering går att välja från fliken Start. Å, ä och ö fungerar. | Måste |
| F-21 | **Markering:** överstrykningspenna i valbar färg över text eller område. | Måste |
| F-22 | **Kommentar:** en kommentarsikon på sidan med text, författare (inloggad användare) och datum. Kommentarerna visas i en kommentarspanel till höger, i Word-stil. | Måste |
| F-23 | **Bild:** infoga PNG/JPEG från Explorer eller datorn, flytta och skala om. | Måste |
| F-24 | **Namnteckning:** rita i en dialog och placera som bild. | Bör |
| F-25 | **Former:** rektangel, linje, pil. | Bör |
| F-26 | **Övertäckning:** en vit eller färgad ruta som täcker innehåll. Används för att visuellt "ersätta" text: täck över och lägg ett textblock ovanpå. | Måste |
| F-27 | Block kan markeras, flyttas, skalas om, redigeras och tas bort. | Måste |
| F-28 | Ångra och gör om (Ctrl+Z / Ctrl+Y) för alla blockändringar. | Måste |
| F-29 | **Blocken förblir redigerbara:** när ett dokument som sparats i Word light öppnas igen kan blocken ändras och tas bort, de är inte inbrända. Se 7.3. | Måste |
| F-30 | **Inga formulärfält:** Word light skapar inga formulärfält. Befintliga formulärfält i en PDF visas som vanligt innehåll men kan inte fyllas i. | Måste |
| F-31 | **Automatisk bakgrundsfärg på övertäckning:** färgen läses av från sidbilden strax utanför rutan (vanligaste färgen), så att övertäckningen smälter in, även på gulnat eller brusigt skannat papper. Kan stängas av (Infoga → Autofärg), och då används vald färg. | Bör |
| F-32 | **Ersätt text:** klick på en textrad (OCR-rad eller PDF-text) skapar i ett ångra-steg en övertäckning över radens ruta (x1, y1–x2, y2) i bakgrundsfärgen plus ett textblock på samma plats med texten ifylld. Typsnitt och storlek tas från PDF:en när de finns, annars uppskattas de från radens höjd och bredd. En ersatt rad växer åt höger i stället för att brytas. Ersättningen är **visuell**: originalets textobjekt ändras inte och ligger kvar under övertäckningen (se 9). | Bör |
| F-33 | Igenkänd (OCR) text som ligger under en övertäckning tas bort ur den osynliga sökbara texten vid sparning. | Bör |

> **Obs, F-26:** en övertäckning döljer men tar inte bort texten under. Den finns kvar i filen. Riktig censur ingår inte (avsnitt 9).

### 5.4 Sidor

| ID | Krav | Prio |
|---|---|---|
| F-40 | Rotera sidor 90°. | Måste |
| F-41 | Ta bort sidor. | Måste |
| F-42 | Ändra sidordning genom att dra miniatyrerna. | Måste |
| F-43 | Infoga en tom sida. | Bör |
| F-44 | Infoga sidor från en annan PDF i Explorer (slå ihop). | Bör |
| F-45 | Spara valda sidor som en ny PDF (dela upp). | Kan |

### 5.5 Spara och ladda ned

| ID | Krav | Prio |
|---|---|---|
| F-50 | **Spara** (Ctrl+S) sparar tillbaka till samma fil via Explorer API: till servern i `RealStorage`, eller till lokal lagring i testmiljön. | Måste |
| F-51 | **Spara som** sparar en ny fil i valfri mapp via Explorers dialog. | Måste |
| F-52 | **Arkiv → Exportera → Ladda ned PDF** sparar till datorn, hur många gånger som helst. | Måste |
| F-53 | Exporterad PDF har blocken inbrända, så att de syns i alla PDF-läsare (Adobe Reader, Chrome, Edge). | Måste |
| F-54 | I Chrome och Edge kan "Spara till datorn" skriva direkt till samma fil på datorn (File System Access API). Andra webbläsare gör en vanlig nedladdning. | Kan |
| F-55 | Programmet frågar om man vill spara när man stänger med osparade ändringar. Titeln visar `*` när det finns osparade ändringar. | Måste |

### 5.6 Lagring i testmiljön (IndexedDB)

| ID | Krav | Prio |
|---|---|---|
| F-60 | När en fil importeras till Explorers simulerade träd sparas dess innehåll, inte bara namn och storlek. | Måste |
| F-61 | Om webbläsaren har IndexedDB sparas det simulerade trädet och filinnehållet där, så att filer finns kvar efter omladdning. | Måste |
| F-62 | Saknas IndexedDB, eller är den blockerad (till exempel i ett privat fönster), fungerar Explorer som i dag, utan fel. | Måste |
| F-63 | Det går att rensa den lokala lagringen och återgå till Explorers grundinnehåll. | Bör |

### 5.7 Design (Word-inspirerad)

| ID | Krav | Prio |
|---|---|---|
| F-70 | **Menyfliksområde** överst med flikarna **Arkiv, Start, Infoga, Sidor, Granska, Visa**. Varje flik har grupperade knappar med ikon och text, som i ett ordbehandlingsprogram. | Måste |
| F-71 | **Arkiv** öppnar en helsidesvy (backstage) med Öppna, Senaste, Spara, Spara som, Exportera och Stäng. | Bör |
| F-72 | **Verktygsfält för snabbåtkomst** i fönstrets titelrad: Spara, Ångra, Gör om. | Bör |
| F-73 | **Statusfält** längst ned: sida X av Y, antal kommentarer, visningslägen och zoomreglage. | Måste |
| F-74 | Arbetsyta i grått med vita sidor och skugga. Navigeringsfönster till vänster och kommentarspanel till höger går att fälla in. | Måste |
| F-75 | Färgerna följer Sandstorms tema (glas, mörkt och ljust) med en blå accentfärg för menyfliksområdet, som påminner om Word. | Måste |
| F-76 | **Egen identitet:** Word light har egen ikon och logotyp. Microsofts logotyper, ikoner och grafik används inte. | Måste |
| F-77 | Fönstret är responsivt. Smalt fönster fäller ihop menyfliksområdet till en rad med ikoner. | Bör |

Flikarnas innehåll:

| Flik | Innehåll |
|---|---|
| Arkiv | Öppna, Senaste, Spara, Spara som, Exportera (PDF), Skriv ut, Stäng |
| Start | Urklipp (klipp ut, kopiera, klistra in block), Tecken (typsnitt, storlek, B/I/U, färg), Stycke (justering), Redigering (sök, markera) |
| Infoga | Textblock, Bild, Namnteckning, Former, Övertäckning, Tom sida |
| Sidor | Rotera, Ta bort, Infoga från fil, Dela upp |
| Granska | Ny kommentar, Föregående/Nästa kommentar, Markeringspenna, Visa/dölj kommentarer, Fråga AI |
| Visa | Zoom, Anpassa till bredd/sida, Navigeringsfönster, Kommentarspanel, Läsläge |

### 5.8 AI-chatten

| ID | Krav | Prio |
|---|---|---|
| F-80 | **Granska → Fråga AI** skickar det öppna dokumentet till Sandstorms AI-chatt. | Bör |
| F-81 | Med Claude skickas PDF:en som dokument. Med en OpenAI-kompatibel tjänst skickas den utlästa texten. | Bör |

### 5.9 Språk

| ID | Krav | Prio |
|---|---|---|
| F-90 | All text går via `_()` och finns på engelska och svenska, med svenskan i `program/wordlight/lang/sv.json`. | Måste |
| F-91 | Kortkommandon som i ett ordbehandlingsprogram: Ctrl+O, Ctrl+S, Ctrl+Shift+S, Ctrl+P, Ctrl+Z/Y, Ctrl+F, Ctrl+G, Ctrl+B/I/U i textblock, Delete för markerat block. | Bör |

### 5.10 DOCX (separat del)

| ID | Krav | Prio |
|---|---|---|
| F-100 | Om Word-dokument behövs kan Word light även öppna `.docx`, **separat från PDF-funktionen**: egen modul och egen filtypsregistrering. | Kan |
| F-101 | Version 1 av DOCX: visa dokumentet (konverterat till HTML, till exempel med mammoth.js). | Kan |
| F-102 | Redigera och spara DOCX är ett eget, senare projekt och kräver en egen kravspecifikation. | Kan |
| F-103 | DOCX-modulen laddas bara när en `.docx` öppnas, så att PDF-delen inte påverkas. | Kan |

### 5.11 Textigenkänning (OCR)

| ID | Krav | Prio |
|---|---|---|
| F-110 | **Granska → Känn igen text (OCR)** kör textigenkänning på den här sidan eller på alla sidor. OCR körs bara när användaren ber om det. | Bör |
| F-111 | Riktig PDF-text läses alltid direkt. En sida utan bilder som redan har text får ingen OCR. | Bör |
| F-116 | **Blandade sidor:** på en sida med både riktig text och inskannade bilder läses den befintliga texten direkt, och OCR körs bara på sidans bildområden (hittas via PDF.js operatorlista). OCR-rader som överlappar riktig text slängs. Sidor med text men utan bilder hoppas över. | Bör |
| F-112 | Igenkänd text läggs som osynlig, markerbar text över sidbilden, så att den går att markera och kopiera. | Bör |
| F-113 | Vid sparning skrivs den igenkända texten in som osynlig text i PDF:en (sökbar PDF) och sparas i Word lights blockdata, så att den finns kvar när filen öppnas igen. | Bör |
| F-114 | Motor: Tesseract.js 5.1.1 med svensk och engelsk språkdata, lagrat lokalt i `res/js/tesseract/` (cirka 13 MB) och laddat första gången OCR används. Inga CDN (S-03). Förlopp visas i statusfältet. | Bör |
| F-115 | Igenkänd text kan inte redigeras. Ändringar görs med övertäckning plus textblock. | Bör |

## 6. Säkerhet och icke-funktionella krav

### 6.1 Säker körning

| ID | Krav | Prio |
|---|---|---|
| S-01 | **Inget inbäddat JavaScript körs.** PDF.js körs med skript avstängt (`enableScripting: false`) och utan `eval` (`isEvalSupported: false`). | Måste |
| S-02 | **PDF:en visas som dokument.** Bara sidinnehåll ritas (canvas och textlager). Inbäddade åtgärder som öppna/start-åtgärder och JavaScript-åtgärder ignoreras. | Måste |
| S-03 | **Inga externa resurser:** PDF:en får inte hämta något från internet, varken typsnitt, bilder eller skript. Biblioteket och dess typsnitt ligger lokalt i `res/js/`. Det gäller även OCR-motorn (Tesseract.js med worker, WASM-motor och språkdata), som ligger i `res/js/tesseract/`. Inga CDN används. | Måste |
| S-04 | **Isolerad visare:** PDF-tolkningen sker i en Web Worker, avskild från CMS:ets sida. Visaren har ingen åtkomst till `app`, Explorer, inloggning eller AI-nyckeln. Den får bara filens bytes och lämnar tillbaka renderade sidor. Se 7.2. | Måste |
| S-05 | **Länkar** i PDF:en öppnas bara efter klick, i en ny flik med `noopener`. `javascript:`- och `file:`-länkar blockeras. | Måste |
| S-06 | **Bifogade filer** i PDF:en öppnas inte automatiskt. | Måste |
| S-07 | Text i block och kommentarer escapas alltid innan den visas (ingen HTML-injektion). | Måste |

### 6.2 Övrigt

| ID | Krav | Prio |
|---|---|---|
| N-01 | Ingen server krävs för själva programmet. PHP behövs bara för `RealStorage`. | Måste |
| N-02 | Biblioteken laddas först när Word light öppnas, så att Sandstorms uppstart inte blir långsammare. | Måste |
| N-03 | En PDF på 50 sidor och 10 MB visar första sidan inom 2 sekunder. Sidor ritas när de syns. | Bör |
| N-04 | Program med bibliotek får vara högst cirka 3 MB (utan DOCX-delen). | Bör |
| N-05 | Placeringen av inbrända block får avvika högst 1 punkt från det som visades. | Måste |
| N-06 | En PDF som öppnas och sparas utan ändringar går fortfarande att öppna i Adobe Reader, Chrome och Edge. | Måste |
| N-07 | Bara bibliotek med fri licens som tillåter kommersiell användning (PDF.js Apache 2.0, pdf-lib MIT, fontkit MIT, mammoth.js BSD-2). Licensfilerna följer med. | Måste |
| N-08 | Följer projektets mönster: `setup.js` registrerar och programmet laddas lat. Nya filer läggs till i `combine.vbs`. | Måste |

## 7. Teknisk lösning (förslag)

### 7.0 Arkitekturprinciper

Word light hålls isär i lager. OCR är aldrig grunden för visning eller redigering.

| Lager | Innehåll | Roll |
|---|---|---|
| Original-PDF | Text, vektorer och bilder i sitt ursprungliga format | Dokumentets grund. Sparas orörd, som bilaga, så att block kan redigeras igen. |
| Visning: canvas | PDF.js ritar sidan | Bara en visuell bild av sidan, inte själva dokumentet |
| Textlager | PDF.js text ovanpå canvasen, eller OCR-text för inskannade sidor | Markering, kopiering, sökning och radpositioner |
| Redigeringslager | Användarens block som JSON (position i PDF-punkter och egenskaper) | Helt oberoende av OCR |

Principer:
1. PDF.js visar original-PDF:en. Canvasen är bara visning.
2. PDF:ens befintliga textlager används för sökning, markering och textpositioner när det finns.
3. Redigeringslagret hanterar blocken oberoende av OCR.
4. OCR körs bara på begäran och bara där användbar text saknas.
5. pdf-lib sparar ändringar ovanpå originalet, utan att göra om sidan till en rasterbild.

| PDF-typ | Metod |
|---|---|
| PDF med riktig text | Läs texten direkt från PDF:en. Ingen OCR. |
| Inskannad PDF, enbart bilder | OCR när användaren ber om det (5.11) |
| Blandad: text och inskannade bilder | Läs befintlig text, och kör OCR bara på bildområden (F-116) |

Att **visuellt ersätta** text (övertäckning plus nytt textblock, F-32) skiljer sig från att **ändra originalets textobjekt på plats**. Det senare kräver att PDF:ens innehållsströmmar skrivs om, och det ingår inte. OCR löser inte det heller.


### 7.1 Bibliotek
- **Visning och sidnavigering:** PDF.js (`pdfjs-dist`, ES-modul + worker).
- **Spara, sidor och inbränning:** pdf-lib, med `@pdf-lib/fontkit` för typsnitt.
- **DOCX (separat del):** mammoth.js för visning.

### 7.2 Isolering
- PDF.js tolkar filen i sin **Web Worker**. Den har ingen åtkomst till sidans DOM eller `app`.
- Huvudtråden får bara renderade sidor och textpositioner.
- Skript, `eval`, XFA och externa typsnitt är avstängda (S-01–S-03).
- **Alternativ för ännu starkare isolering:** visaren körs i en `<iframe sandbox="allow-scripts">` med eget ursprung och pratar med Word light bara via `postMessage`. Det är mer jobb, men en sårbarhet i PDF-tolken kan då inte komma åt CMS:et. Se öppen fråga 2.

### 7.3 Redigeringslagret och sparning
- Blocken lagras som data (JSON), skilt från PDF:en: typ, sida, position i PDF-punkter, innehåll, stil, författare och tid.
- **Vid sparning** skrivs två saker in i PDF:en med pdf-lib:
  1. blocken **inbrända** på sidorna, så att de syns överallt (F-53)
  2. blockdatan som en **bifogad JSON-fil** inuti PDF:en, så att Word light kan läsa upp blocken igen och de förblir redigerbara (F-29).
- För att blocken ska kunna tas bort igen behöver Word light originalsidorna utan inbrända block. Därför sparas även originalet som bilaga, och filen blir ungefär dubbelt så stor. När filen öppnas igen utgår Word light från originalet och lägger upp blocken som redigerbara. Se öppen fråga 3 för alternativ.
- Kommentarer kan dessutom skrivas som vanliga PDF-kommentarer, så att de syns i Adobe Readers kommentarspanel.

### 7.4 Filer
```
program/wordlight/
  setup.js          registrering, ikon, openWith för .pdf (och senare .docx)
  wordlight.js      fönster, menyfliksområde, statusfält, paneler
  ribbon.js         flikarna och deras knappar
  viewer.js         PDF.js-visaren (isolerad, skript avstängt)
  layer.js          redigeringslagret: block, markering, ångra/gör om
  comments.js       kommentarer och kommentarspanel
  pages.js          miniatyrer, rotera, ta bort, ordning, slå ihop
  save.js           pdf-lib: inbränning, blockdata, spara, exportera
  docx/             separat DOCX-modul (senare)
  wordlight.css
  lang/sv.json
res/js/pdfjs/       pdf.min.mjs, pdf.worker.min.mjs, LICENSE
res/js/pdf-lib/     pdf-lib.min.js, fontkit.umd.min.js, LICENSE
sandstorm/components/explorer/…   lagring i IndexedDB (F-60–F-63)
```

## 8. Godkännandetester

| Test | Steg | Förväntat resultat |
|---|---|---|
| T-01 | Testmiljö: dra in en PDF i Explorer och dubbelklicka. | Den öppnas i Word light med Word-lik layout. |
| T-02 | Lägg till ett textblock med å, ä och ö, en markering och en kommentar, och spara. Ladda om sidan och öppna igen. | Filen finns kvar. Blocken kan fortfarande redigeras. |
| T-03 | Exportera och öppna i Adobe Reader och Edge. | Textblock och markeringar syns. Kommentaren syns i kommentarspanelen. |
| T-04 | Öppna en test-PDF med inbäddat JavaScript (till exempel `app.alert`) och en öppna-åtgärd. | Inget skript körs. Inga dialoger, inga nätverksanrop. |
| T-05 | Öppna en PDF som refererar till externa resurser. | Inga nätverksanrop görs (kontrolleras i nätverksfliken). |
| T-06 | Klicka på en `javascript:`-länk i en PDF. | Inget händer. |
| T-07 | Rotera, ta bort och flytta sidor, och spara. | Den sparade PDF:en har den nya ordningen och rotationen. |
| T-08 | Livemiljö: öppna från `RealStorage`, ändra och spara. | Filen på servern är uppdaterad. |
| T-09 | Ladda ned tre gånger med ändringar emellan. | Tre korrekta filer på datorn. |
| T-10 | Privat fönster: importera, ändra, ladda om. | Inga fel. Filen är borta efter omladdning. |
| T-11 | Byt språk till svenska. | Menyfliksområde, dialoger och statusfält är på svenska. |
| T-12 | Öppna en PDF med formulärfält. | Fälten visas men kan inte fyllas i. |

## 9. Begränsningar och utanför omfattning

- **Formulärfält** stöds inte, varken att skapa eller fylla i.
- **Ändra den befintliga texten** i PDF:en på plats görs inte. Redigeringen är blockbaserad (övertäckning plus textblock).
- **Riktig censur:** övertäckning döljer men tar inte bort.
- **OCR:** igenkänningen är inte felfri, särskilt vid handstil eller dåliga skanningar. Den igenkända texten kan inte redigeras.
- **Krypterade PDF:er** utan lösenord, och **digitala signaturer** (certifikat), stöds inte.
- **XFA-formulär** stöds inte.
- **DOCX-redigering** är ett separat, senare projekt.
- **Lokal lagring** gäller bara den webbläsaren på den datorn.

## 10. Leveransplan (förslag)

1. **Lagring i testmiljön:** F-60–F-63.
2. **Version 1:** alla Måste-krav, inklusive säkerheten (S-01–S-07) och Word-designen.
3. **Version 1.1:** Bör-kraven: sök, namnteckning, former, slå ihop, backstage, AI-chatten.
4. **Senare:** Kan-kraven och DOCX-delen (5.10).

## 11. Öppna frågor (att besluta)

1. **Namnet:** "Word light" innehåller varumärket Word. Det är ert beslut, men om programmet ska spridas utanför eget bruk kan ett eget namn vara säkrare, till exempel "Sandstorm Docs".
2. **Isolering:** räcker Web Worker med skript avstängt (S-04), eller ska visaren även ligga i en sandlådad iframe (7.2)?
3. **Redigerbara block (F-29):** vilket sätt ska användas?
   - **a)** Allt inuti PDF:en: blockdata och original som bilagor (7.3). En enda fil, men ungefär dubbelt så stor.
   - **b)** Originalet och blockdatan sparas bredvid i Explorer, till exempel `dokument.pdf` + `dokument.wl.json`. Inbränd version skapas bara vid export. Filen hålls liten, men två filer måste följa med varandra.
   - **c)** Blocken sparas som vanliga PDF-kommentarer (annoteringar) i stället för att brännas in. Det är standard, de syns i andra PDF-läsare och kan redigeras igen, men det är mer jobb att bygga och visas olika i olika läsare.
4. **Lagring:** ska IndexedDB bara användas i testmiljön, eller även i livemiljön för det simulerade trädet?
5. **Kommentarer:** räcker det att författaren är den inloggade användarens namn, eller behövs svar i trådar?
6. **DOCX:** behövs det över huvud taget, och i så fall bara visning eller även redigering?
7. **Prioriteringar:** stämmer fördelningen Måste/Bör/Kan?
