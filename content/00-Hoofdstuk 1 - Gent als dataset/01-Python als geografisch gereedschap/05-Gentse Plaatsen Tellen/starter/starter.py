# Invoer

plaatsen = [
    ["Blaarmeersen", "park"],
    ["Citadelpark", "park"],
    ["UZ Gent", "zorg"],
    ["AZ Jan Palfijn", "zorg"],
    ["Gent-Sint-Pieters", "station"],
]

aantal_parken = 0
aantal_zorg = 0


# Verwerking

for plaats in plaatsen:
    soort = plaats[1]

    # TODO: verhoog aantal_parken als soort gelijk is aan "park".

    # TODO: verhoog aantal_zorg als soort gelijk is aan "zorg".


# Uitvoer

print("Aantal parken:", aantal_parken)
print("Aantal zorgplaatsen:", aantal_zorg)
