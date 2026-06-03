# Invoer

wijken = [
    ["Binnenstad", 25000],
    ["Brugse Poort - Rooigem", 21000],
    ["Ledeberg", 10000],
    ["Sint-Amandsberg", 31000],
    ["Wondelgem", 14000],
]

totaal = 0
grootste_wijk = ""
grootste_bevolking = 0
aantal_boven_20000 = 0


# Verwerking

for wijk in wijken:
    naam = wijk[0]
    bevolking = wijk[1]

    totaal = ...

    if ...:
        grootste_wijk = ...
        grootste_bevolking = ...

    if ...:
        aantal_boven_20000 = ...


# Uitvoer

print("Totale bevolking:", totaal)
print("Grootste wijk:", grootste_wijk)
print("Wijken boven 20000:", aantal_boven_20000)
