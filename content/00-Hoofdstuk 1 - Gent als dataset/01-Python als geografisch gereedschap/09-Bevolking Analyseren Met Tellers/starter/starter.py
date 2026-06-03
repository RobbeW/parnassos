wijken = [
    ["Muide - Meulestede", 9000],
    ["Nieuw Gent - UZ", 13000],
    ["Dampoort", 18000],
]

totaal = 0
grootste_wijk = ""
grootste_bevolking = 0
aantal_boven_10000 = 0

for wijk in wijken:
    naam = wijk[0]
    bevolking = wijk[1]

    totaal = totaal + bevolking

    if bevolking > grootste_bevolking:
        grootste_wijk = naam
        grootste_bevolking = bevolking

    if bevolking > 10000:
        aantal_boven_10000 = aantal_boven_10000 + 1

print("Totale bevolking:", totaal)
print("Grootste wijk:", grootste_wijk)
print("Wijken boven 10000:", aantal_boven_10000)
