# Invoer

meetpunten = [
    ["Sint-Lievenscollege", "Binnenstad", 4.2, 14.0],
    ["Dampoort", "Dampoort", 13.5, 41.0],
    ["Rabotpark", "Rabot", 26.0, 72.0],
    ["Gentbrugge", "Gentbrugge", 8.0, 28.0],
]


# Verwerking

for meetpunt in meetpunten:
    locatie = ...
    wijk = ...
    pm25 = ...
    pm10 = ...


    # Uitvoer

    print(locatie + " | " + wijk + " | PM2.5:", pm25, "| PM10:", pm10)
