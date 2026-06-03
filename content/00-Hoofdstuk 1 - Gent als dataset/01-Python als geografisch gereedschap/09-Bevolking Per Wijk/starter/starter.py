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

    # TODO: tel bevolking op bij totaal.

    # TODO: controleer of dit de grootste wijk tot nu toe is.

    # TODO: tel wijken met meer dan 20000 inwoners.


# Uitvoer

print("Totale bevolking:", totaal)
print("Grootste wijk:", grootste_wijk)
print("Wijken boven 20000:", aantal_boven_20000)
