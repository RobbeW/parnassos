import math


# Invoer

centrum_lat = 51.0543
centrum_lon = 3.7250

plaatsen = [
    ["Gent-Sint-Pieters", "station", 51.0362, 3.7102],
    ["UZ Gent", "ziekenhuis", 51.0247, 3.7268],
    ["Gravensteen", "erfgoed", 51.0573, 3.7208],
    ["Blaarmeersen", "park", 51.0470, 3.6807],
]


# Verwerking

for plaats in plaatsen:
    naam = plaats[0]
    lat = plaats[2]
    lon = plaats[3]

    dy = ...
    dx = ...
    afstand = ...


    # Uitvoer

    print(naam + ":", round(afstand, 1), "km")
