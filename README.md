# Værstasjonen

En privat vær- og astronomiapplikasjon for egne steder. Appen kombinerer
prognoser fra MET Norway med målte observasjoner fra Frost når de faktisk
finnes.

## Dataprinsipp

- Fremtidige tidspunkt vises som `PROGNOSE`.
- Når en gyldig måling foreligger for et tidspunkt, brukes målingen i stedet.
- Manglende målinger vises som manglende data. Appen lager ikke syntetiske
  temperaturer, nedbørsmengder, vindverdier, målingshistorikk eller rekorder.
- Kilde, målestasjon, tidspunkt og kvalitet beholdes slik at brukeren kan se
  hva en verdi bygger på.
- Dato og klokkeslett presenteres i `Europe/Oslo`, inkludert automatisk
  overgang mellom vinter- og sommertid. Det skal ikke legges til et manuelt
  antall timer i deploy-miljøet.

Uten `FROST_CLIENT_ID` fungerer værprognosene fortsatt, men historiske og
aktuelle målinger fra Frost kan være utilgjengelige og vises da som manglende.

## Funksjoner

- Oversikt med målte verdier, fremtidig prognose og tydelig kildeangivelse
- Time- og langtidsprognose
- Historikk, døgnvisning, nedbør og vindrose når målinger finnes
- Sammenligning av tidligere prognoser mot etterfølgende målinger
- Bygg- og anleggsvisning basert på tilgjengelige værdata
- Sol, måne og astronomiske beregninger for valgt posisjon
- Flere lagrede steder og valgfri bruk av enhetens GPS
- Installerbar PWA; værdata krever nettforbindelse og blir ikke fremstilt som
  oppdatert når appen er frakoblet

## Oppsett

Kopier `.env.example` til `.env.local` og fyll inn relevante verdier:

```env
# Frost Client ID for målte observasjoner og historikk
FROST_CLIENT_ID=

# Identifiserbar User-Agent med en reell kontaktadresse du kontrollerer
MET_USER_AGENT=

# Påkrevd ved ekstern/produksjonslignende testdeploy, minst 16 tegn
APP_ACCESS_TOKEN=

# Påkrevd bare dersom cron-rutene skal brukes eksternt, minst 16 tegn
CRON_SECRET=
```

Lokal utvikling på `localhost` er åpen. En ekstern deploy feiler lukket dersom
`APP_ACCESS_TOKEN` mangler eller er for kort. Tilgangskoden lagres ikke i
nettleserens JavaScript-lagring; innloggingen bruker en avledet, `HttpOnly`
cookie.

## Lagring

Som standard lagres appdata i `data/vaerstasjonen_db.json`. Skrivingen er
atomisk for én serverprosess og én skriver. `VAERSTASJONEN_DB_FILE` kan peke på
et varig volum når appen alltid kjører som én instans, men filmotoren har ikke
kryssprosesslåsing. Flere instanser må derfor bruke en ekstern database eller et
annet lagringslag med samtidighetskontroll. Den lokale filen alene er heller
ikke varig lagring på en ephemerisk deploy-plattform.

## Kjøring

Krever Node.js 20.9 eller nyere.

```bash
npm install
npm run dev
```

Full lokal kontroll og produksjonsbygg:

```bash
npm run check
```

Enkeltkommandoer:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm start
```

## Eksterne datakilder

- [MET Norway Locationforecast](https://api.met.no/weatherapi/locationforecast/2.0/documentation)
- [MET Norway Nowcast](https://api.met.no/weatherapi/nowcast/2.0/documentation)
- [Frost](https://frost.met.no/)

API-nøkler og tilgangshemmeligheter brukes kun på serversiden. Ikke legg dem
inn i klientkode eller variabler med `NEXT_PUBLIC_`-prefiks.
