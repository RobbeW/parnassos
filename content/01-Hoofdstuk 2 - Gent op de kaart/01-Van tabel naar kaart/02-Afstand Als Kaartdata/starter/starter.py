# Voorbeeldcode

import math

centrum_lat = 51.0543
centrum_lon = 3.7250

plaats = ["Blaarmeersen", "park", 51.0470, 3.6807]

naam = plaats[0]
soort = plaats[1]
lat = plaats[2]
lon = plaats[3]

dy = (lat - centrum_lat) * 111
dx = (lon - centrum_lon) * 70
afstand = round(math.sqrt(dx * dx + dy * dy), 1)

kaart_rij = [naam, soort, lat, lon, afstand]

print(kaart_rij)
