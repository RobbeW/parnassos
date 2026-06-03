# Invoer

centrum_lat = 51.0543
centrum_lon = 3.7250

plaatsen = [
    ["Gent-Sint-Pieters", 51.0362, 3.7102],
    ["Gravensteen", 51.0573, 3.7208],
    ["Portus Ganda", 51.0559, 3.7346],
]


# Verwerking

for plaats in plaatsen:
    naam = plaats[0]
    lat = plaats[1]
    lon = plaats[2]

    if lat > centrum_lat:
        noord_zuid = "noord"
    else:
        noord_zuid = "zuid"

    if lon > centrum_lon:
        oost_west = "oost"
    else:
        oost_west = "west"


    # Uitvoer

    print(naam + ":", noord_zuid + oost_west)
