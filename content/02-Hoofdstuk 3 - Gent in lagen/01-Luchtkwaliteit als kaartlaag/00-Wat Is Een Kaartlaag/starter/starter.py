# Voorbeeldcode bij de theorie.

# Invoer

meetpunt = ["Dampoort", "luchtkwaliteit", 51.0571, 3.7390, "Dampoort", 13.5, 41.0]


# Verwerking

naam = meetpunt[0]
laag = meetpunt[1]
lat = meetpunt[2]
lon = meetpunt[3]
wijk = meetpunt[4]
pm25 = meetpunt[5]
pm10 = meetpunt[6]

popup = naam + " | " + wijk + " | PM2.5: " + str(pm25) + " | PM10: " + str(pm10)


# Uitvoer

print(laag)
print(popup)
print(lat, lon)
