# Invoer

plaatsen = [
    ["Stadhuis Gent", "51.0543", "3.7250"],
    ["Gent-Sint-Pieters", "51.0362", "3.7102"],
    ["UZ Gent", "51.0247", "3.7268"],
]


# Verwerking

for rij in plaatsen:
    naam = rij[0]

    # TODO: zet rij[1] en rij[2] om naar float.
    latitude = rij[1]
    longitude = rij[2]


    # Uitvoer

    # TODO: print naam, latitude en longitude zoals in de voorbeeldoutput.
    print(naam)
