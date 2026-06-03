plaats = ["Korenmarkt", 51.0546, 3.7217]

naam = plaats[0]
lat = plaats[1]
lon = plaats[2]

lat_ok = lat >= 51.00 and lat <= 51.10
lon_ok = lon >= 3.65 and lon <= 3.80

geldig = lat_ok and lon_ok

if geldig:
    print(naam + ": geldig")
else:
    print(naam + ": fout")
