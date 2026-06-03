# Invoer

centrum_lat = 51.0543
centrum_lon = 3.7250

plaatsen = [
    ["Gent-Sint-Pieters", 51.0362, 3.7102],
    ["UZ Gent", 51.0247, 3.7268],
    ["Gravensteen", 51.0573, 3.7208],
]

# TODO: importeer math.


# Verwerking

for plaats in plaatsen:
    naam = plaats[0]
    lat = plaats[1]
    lon = plaats[2]

    # TODO: bereken dy en dx in kilometer.
    dy = 0
    dx = 0

    # TODO: bereken de afstand met math.sqrt().
    afstand = 0


    # Uitvoer

    print(naam + ":", round(afstand, 1), "km")
