import csv
from io import StringIO

data = """naam,type,lat,lon
Belfort Brugge,erfgoed,51.2089,3.2242
Station Brugge,station,51.1972,3.2172
Minnewater,park,51.2014,3.2246
Sint-Janshospitaal,museum,51.2046,3.2240
"""

bestand = StringIO(data)
lezer = csv.reader(bestand)
next(lezer)

aantal = 0

for rij in lezer:
    naam = rij[0]
    soort = rij[1]
    print(naam, "-", soort)
    aantal = aantal + 1

print("Aantal plaatsen:", aantal)
