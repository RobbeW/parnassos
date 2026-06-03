## Opgave

Bereken voor elke plaats de afstand tot het Stadhuis.

Gebruik opnieuw:

* `dy = (lat - centrum_lat) * 111`;
* `dx = (lon - centrum_lon) * 70`;
* `math.sqrt(dx * dx + dy * dy)`.

Print de afstand afgerond op 1 cijfer na de komma.

#### Verwachte uitvoer

```text
Gent-Sint-Pieters: 2.3 km
UZ Gent: 3.3 km
Gravensteen: 0.4 km
Blaarmeersen: 3.2 km
```
