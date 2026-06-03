# Invoer

data = """naam,type,lat,lon
Stadhuis Gent,bestuur,51.0543,3.7250
Gent-Sint-Pieters,station,51.0362,3.7102
UZ Gent,ziekenhuis,51.0247,3.7268
Blaarmeersen,park,51.0470,3.6807
"""

# TODO 1: haal de hekjes weg zodat de imports actief worden.
# import csv
# from io import StringIO


# Verwerking

# TODO 3: maak van data een leesbaar bestand met StringIO.
bestand = StringIO(...)

# TODO 4: maak een csv.reader.
lezer = csv.reader(...)

# TODO 5: sla de eerste rij met kolomnamen over.
next(...)

aantal = 0

for rij in ...:
    # TODO 6: haal de naam en het type uit de rij.
    naam = rij[...]
    soort = rij[...]


    # Uitvoer

    # TODO 7: print de naam en het type.
    print(naam, "-", soort)


    # Verwerking

    # TODO 8: tel elke plaats.
    aantal = aantal + ...


# Uitvoer

print("Aantal plaatsen:", aantal)
