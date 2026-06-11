# Invoer

meetpunten = [
    ["Binnenstad", 4.2],
    ["Dampoort", 13.5],
    ["Rabot", 26.0],
    ["Gentbrugge", 8.0],
    ["Dampoort", 16.5],
    ["Rabot", 32.0],
    ["Binnenstad", 6.8],
]

wijken = ["Binnenstad", "Dampoort", "Rabot", "Gentbrugge"]


# Verwerking

for wijk in wijken:
    totaal = ...
    aantal = ...

    for meetpunt in meetpunten:
        meetpunt_wijk = ...
        pm25 = ...

        if ...:
            totaal = ...
            aantal = ...

    gemiddelde = ...


    # Uitvoer

    print(wijk + ":", gemiddelde)
