# Voorbeeldcode bij de theorie.

# Invoer

meetpunten = [
    ["Binnenstad", 4.2],
    ["Dampoort", 13.5],
    ["Dampoort", 16.5],
    ["Rabot", 26.0],
]

gekozen_wijk = "Dampoort"


# Verwerking

totaal = 0
aantal = 0

for meetpunt in meetpunten:
    wijk = meetpunt[0]
    pm25 = meetpunt[1]

    if wijk == gekozen_wijk:
        totaal = totaal + pm25
        aantal = aantal + 1

gemiddelde = round(totaal / aantal, 1)


# Uitvoer

print(gekozen_wijk)
print("Aantal metingen:", aantal)
print("Gemiddelde PM2.5:", gemiddelde)
