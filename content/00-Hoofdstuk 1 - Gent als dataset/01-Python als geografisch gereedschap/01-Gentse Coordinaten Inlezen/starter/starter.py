# Invoer

data = """naam,type,lat,lon
Stadhuis Gent,bestuur,51.0543,3.7250
Gent-Sint-Pieters,station,51.0362,3.7102
UZ Gent,ziekenhuis,51.0247,3.7268
Blaarmeersen,park,51.0470,3.6807
"""

import csv
from io import StringIO


# Verwerking

bestand = StringIO(...)

lezer = csv.reader(...)

next(...)

aantal = 0

for rij in ...:
    naam = rij[...]
    soort = rij[...]


    # Uitvoer

    print(...)


    # Verwerking

    aantal = aantal + ...


# Uitvoer

print("Aantal plaatsen:", aantal)
