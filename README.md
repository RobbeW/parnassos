# Parnassos

Parnassos is een cursusomgeving voor Python, data en GIS. Leerlingen gebruiken
Python om geografische vragen te onderzoeken met tabellen, coördinaten, kaarten
en lokale data over Gent.

De leeromgeving combineert twee werkvormen:

- korte voorbereidingsoefeningen in Parnassos, met startercode en testcases;
- grotere onderzoeksopdrachten in Google Colab, met pandas, GeoPandas en kaarten.

Deze map is een draftproject. De technische basis komt uit Delphi en Papyros.
De inhoud groeit naar een aparte cursus rond Python en geografisch onderzoek.

## Doelstelling

Parnassos ondersteunt leerlingen en lesgevers bij:

- het herhalen van Python in een geografische context;
- het leren werken met tabellen, coördinaten en eenvoudige datasets;
- het voorbereiden van Colab-notebooks waarin leerlingen grotere GIS-opdrachten maken;
- het koppelen van code aan kaart, plaats, afstand, wijk en ruimtelijke vraag.

De cursus is bedoeld voor leerlingen die al basiservaring hebben met Python.

## Cursusopbouw

De cursus groeit hoofdstuk per hoofdstuk. Elk hoofdstuk bevat enkele korte
Parnassos-oefeningen en een grotere Colab-opdracht.

Voorlopige opbouw:

1. **Gent als dataset**  
   Python herhalen met Gentse plaatsen, coördinaten, wijken en bevolkingscijfers.

2. **Van tabel naar kaart**  
   CSV's lezen, dataframes bekijken en kaartlagen opbouwen.

3. **Afstand en bereikbaarheid**  
   Afstanden, routes en bereikbaarheid vergelijken.

4. **Stedelijke voorzieningen**  
   Scholen, zorg, groen en mobiliteit in kaart brengen.

5. **Onderzoeksproject**  
   Een ruimtelijke vraag uitwerken met kaart, tabel en besluit.

## Huidige stand

De huidige Parnassos-inhoud staat in:

```text
content/00-Hoofdstuk 1 - Gent als dataset/
```

Dit hoofdstuk bevat een subhoofdstuk:

```text
01-Python als geografisch gereedschap/
```

Daarin staan elf onderdelen: een korte theoriekaart en tien voorbereidingsoefeningen.

1. Van Python naar GIS
2. Coördinaten inlezen met CSV (theorie)
3. Gentse coördinaten inlezen
4. Coördinaten lezen en omzetten
5. Noord, zuid, oost en west
6. Afstand tot het centrum
7. Gentse plaatsen tellen
8. Dichtbij of veraf
9. Gemiddelde afstand
10. Foutieve coördinaten
11. Bevolking per wijk

De map `content/` bevat daarnaast nog overgenomen Delphi-oefeningen. Die zijn
voorlopig aanwezig als technische basis en referentie. De kern van de
Parnassos-cursus staat in het hoofdstuk over Gent.

De map `example_notebooks/` bevat tijdelijke voorbeeldnotebooks. Vervang of vul
deze later aan met echte Parnassos-notebooks voor de GIS-opdrachten.

## Functionaliteiten

- Python-code uitvoeren in de browser, gebaseerd op Papyros.
- Oefeningen laden vanuit een gestructureerde `content/`-catalogus.
- Startercode per oefening.
- Testcases met samenvatting en detailweergave.
- Ondersteuning voor `input()` via het runtime-invoerveld.
- Lokale opslag van code, pogingen, werktijd en evaluatiestatus.
- Ingebouwd Python-formularium, aangevuld met bouwstenen voor CSV en tabellen.
- PDF-export van reeksen met code, feedback en rubriek.
- Navigatie naar Colab-notebooks kan per hoofdstuk of oefening worden toegevoegd.

## Technisch

- Landing page: `index.html`
- Leeromgeving: `platform.html`
- Applicatielogica: `app.js`
- Styling van de leeromgeving: `styles.css`
- Runtime: Papyros met lokale workerbestanden
- Contentindex: `content/catalog.json`
- Catalogusbuilder: `tools/build-catalog.mjs`
- Hero-afbeelding landing page: `media/DJI_0442.jpg`
- Research draft: `parnassos-deep-research-report.md`
- Leerplannen: `leerplannen/`

## Projectstructuur

```text
.
├── index.html
├── platform.html
├── app.js
├── styles.css
├── input-sw.js
├── papyros-python-worker.js
├── papyros-javascript-worker.js
├── browser-process.mjs
├── content/
│   ├── catalog.json
│   ├── 00-Hoofdstuk 1 - Gent als dataset/
│   └── ... overgenomen Delphi-content
├── example_notebooks/
│   └── ... tijdelijke voorbeeldnotebooks
├── leerplannen/
│   └── ... curriculumdocumenten
├── media/
│   └── DJI_0442.jpg
├── tools/
│   └── build-catalog.mjs
├── parnassos-deep-research-report.md
├── LICENSE
└── THIRD_PARTY_NOTICES.md
```

## Gebruik

Leerlingen gebruiken normaal de gehoste versie van Parnassos via GitHub Pages.
Deze map bevat de bronbestanden voor de landing page, de leeromgeving en de
oefeningen.

## Werken met content

Een oefening volgt deze mappenstructuur:

```text
content/
  00-Hoofdstuk 1 - Gent als dataset/
    01-Python als geografisch gereedschap/
      00-Van Python naar GIS/
        description/description.nl.md
        evaluation/tests.yaml
        starter/starter.py
```

Gebruik per oefening bij voorkeur:

- `description/description.nl.md` voor de opdrachttekst;
- `starter/starter.py` voor de startcode;
- `evaluation/tests.yaml` voor testcases.

Na wijzigingen in `content/` bouw je de catalogus opnieuw op:

```bash
node tools/build-catalog.mjs
```

## Colab-notebooks

De korte Parnassos-oefeningen bereiden leerlingen voor op een grotere
Colab-opdracht. Wanneer een notebook klaar is, kan de link in de leeromgeving
worden toegevoegd zodat leerlingen vanuit het juiste hoofdstuk naar de juiste
notebook gaan.

Voor een Colab-opdracht is het zinvol om telkens te voorzien:

- een duidelijke onderzoeksvraag;
- een dataset of startcel;
- een checklist;
- enkele reviewvragen;
- een korte afsluitende opdracht met kaart, tabel of besluit.

## Licenties

- Projectlicentie: zie [LICENSE](LICENSE)
- Third-party licenties en notices, waaronder Papyros: zie [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)

## Contact

Voor vragen, feedback of samenwerking:

- https://robbewulgaert.be/contact

**Opgelet:** dit project is bedoeld voor educatief gebruik en is in ontwikkeling.
Er wordt geen structurele ondersteuning voor dit webplatform beloofd.
