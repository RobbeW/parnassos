# Voorbeeldcode bij de theorie.

# Invoer

pm25 = 26.0
pm10 = 72.0


# Verwerking

if pm25 <= 5:
    niveau_pm25 = 0
elif pm25 <= 15:
    niveau_pm25 = 1
elif pm25 <= 50:
    niveau_pm25 = 2
elif pm25 <= 90:
    niveau_pm25 = 3
elif pm25 <= 140:
    niveau_pm25 = 4
else:
    niveau_pm25 = 5

if pm10 <= 15:
    niveau_pm10 = 0
elif pm10 <= 45:
    niveau_pm10 = 1
elif pm10 <= 120:
    niveau_pm10 = 2
elif pm10 <= 195:
    niveau_pm10 = 3
elif pm10 <= 270:
    niveau_pm10 = 4
else:
    niveau_pm10 = 5

niveau = max(niveau_pm25, niveau_pm10)
klassen = ["goed", "redelijk", "matig", "slecht", "zeer slecht", "extreem slecht"]
klasse = klassen[niveau]


# Uitvoer

print("PM2.5-niveau:", niveau_pm25)
print("PM10-niveau:", niveau_pm10)
print("EAQI-klasse:", klasse)
