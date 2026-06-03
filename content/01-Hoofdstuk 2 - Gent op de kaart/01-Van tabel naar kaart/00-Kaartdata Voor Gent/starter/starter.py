# Voorbeeldcode

plaatsen = [
    ["Stadhuis Gent", "bestuur", 51.0543, 3.7250],
    ["Gent-Sint-Pieters", "station", 51.0362, 3.7102],
    ["UZ Gent", "ziekenhuis", 51.0247, 3.7268],
    ["Blaarmeersen", "park", 51.0470, 3.6807],
]

for plaats in plaatsen:
    naam = plaats[0]
    soort = plaats[1]
    lat = plaats[2]
    lon = plaats[3]

    popup = naam + " (" + soort + ")"
    print(popup + " ->", lat, lon)
