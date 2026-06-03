import math

centrum_lat = 51.0543
centrum_lon = 3.7250

plaats = ["Citadelpark", 51.0389, 3.7257]

naam = plaats[0]
lat = plaats[1]
lon = plaats[2]

dy = (lat - centrum_lat) * 111
dx = (lon - centrum_lon) * 70

afstand = math.sqrt(dx * dx + dy * dy)

print(naam + ":", round(afstand, 1), "km")
