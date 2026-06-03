# Invoer

plaatsen = [
    ["Stadhuis Gent", 51.0543, 3.7250],
    ["Brussel-Centraal", 50.8455, 4.3572],
    ["UZ Gent", 51.0247, 3.7268],
    ["Zeehaven foutpunt", 51.1450, 3.7300],
]


# Verwerking

for plaats in plaatsen:
    naam = plaats[0]
    lat = plaats[1]
    lon = plaats[2]

    lat_ok = ...
    lon_ok = ...
    geldig = ...


    # Uitvoer

    if geldig:
        print(naam + ": geldig")
    else:
        print(naam + ": fout")
