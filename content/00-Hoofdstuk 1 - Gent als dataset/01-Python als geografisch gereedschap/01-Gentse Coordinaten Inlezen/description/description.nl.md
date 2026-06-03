## Opgave

Dit is een invuloefening. De tabel staat al klaar in de variabele `data`. In de startercode staan enkele puntjes `...` en twee imports die nog in commentaar staan.

1. Haal de hekjes weg bij de imports voor `csv` en `StringIO`.
2. Vervang de puntjes zodat `data` gelezen wordt met `StringIO`.
3. Maak een CSV-lezer.
4. Sla de eerste rij met kolomnamen over.
5. Haal uit elke rij de naam en het type.
6. Print voor elke plaats de naam en het type.
7. Tel hoeveel plaatsen er in de tabel staan.

Gebruik hiervoor deze nieuwe bouwstenen:

```python
bestand = StringIO(data)
lezer = csv.reader(bestand)
next(lezer)
```

In een rij vind je de kolommen met vierkante haakjes:

```python
naam = rij[0]
soort = rij[1]
```

#### Verwachte uitvoer

```text
Stadhuis Gent - bestuur
Gent-Sint-Pieters - station
UZ Gent - ziekenhuis
Blaarmeersen - park
Aantal plaatsen: 4
```
