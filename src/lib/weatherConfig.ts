const configuredMetUserAgent =
  typeof process !== 'undefined' ? process.env.MET_USER_AGENT?.trim() : undefined;

export const WEATHER_CONFIG = {
  appName: 'Værstasjonen',
  version: '1.0.0',
  defaultUserAgent: configuredMetUserAgent || 'VaerstasjonenApp/1.0.0 (private test deployment)',
  met: {
    locationForecastUrl: 'https://api.met.no/weatherapi/locationforecast/2.0/complete',
    nowcastUrl: 'https://api.met.no/weatherapi/nowcast/2.0/complete',
    timeoutMs: 12000,
    maxCoordDecimals: 4,
  },
  frost: {
    baseUrl: 'https://frost.met.no',
    sourcesEndpoint: 'https://frost.met.no/sources/v0.jsonld',
    observationsEndpoint: 'https://frost.met.no/observations/v0.jsonld',
    elements: {
      temperature: 'air_temperature',
      precipitation: 'sum(precipitation_amount PT1H)',
      precipitationDay: 'sum(precipitation_amount P1D)',
      windSpeed: 'wind_speed',
      windGust: 'wind_speed_of_gust',
      windDirection: 'wind_from_direction',
      pressure: 'air_pressure_at_sea_level',
      humidity: 'relative_humidity',
      snowDepth: 'surface_snow_thickness',
    }
  },
  pressureTrendThresholds: {
    steeplyRising: 3.0,
    rising: 1.0,
    steadyLower: -1.0,
    steadyUpper: 1.0,
    falling: -1.0,
    steeplyFalling: -3.0,
  },
  defaultLocation: {
    id: 'loc_aukra_default',
    name: 'Aukra',
    latitude: 62.7905,
    longitude: 6.9208,
    // The default is a municipality centroid, not a surveyed point. Let MET
    // use model elevation instead of presenting an invented local height.
    altitude: null,
    address: 'Aukra kommune, Møre og Romsdal',
    timezone: 'Europe/Oslo',
  }
};
