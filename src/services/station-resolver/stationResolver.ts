import { getDb } from '@/lib/db';
import { calculateHaversineDistanceKm } from '@/lib/weatherUtils';
import { LocationRecord, WeatherStation, ElementSourceDetail, WeatherDataSourceType } from '@/types/weather';
import {
  hourlyValuesForElement,
  latestMeasuredWithElement,
  measuredObservations,
} from '@/services/observations/observationQuality';

export interface StationRecommendation {
  element: 'temperature' | 'precipitation' | 'wind' | 'pressure' | 'humidity' | 'snow';
  label: string;
  bestStation: (WeatherStation & { distance_km: number; score: number }) | null;
  availableStations: (WeatherStation & { distance_km: number; score: number })[];
}

export class WeatherStationResolver {
  /**
   * Resolves the best weather stations for a location across all meteorological parameters
   */
  static resolveStationsForLocation(location: LocationRecord): StationRecommendation[] {
    const db = getDb();
    const stations = db.getStations();

    const elements: {
      element: 'temperature' | 'precipitation' | 'wind' | 'pressure' | 'humidity' | 'snow';
      label: string;
      requiredSupported: string;
    }[] = [
      { element: 'temperature', label: 'Temperatur', requiredSupported: 'air_temperature' },
      { element: 'precipitation', label: 'Nedbør', requiredSupported: 'precipitation_amount' },
      { element: 'wind', label: 'Vind og vindkast', requiredSupported: 'wind_speed' },
      { element: 'pressure', label: 'Lufttrykk', requiredSupported: 'air_pressure_at_sea_level' },
      { element: 'humidity', label: 'Luftfuktighet', requiredSupported: 'relative_humidity' },
      { element: 'snow', label: 'Snødybde', requiredSupported: 'surface_snow_thickness' },
    ];

    const results: StationRecommendation[] = [];

    for (const elem of elements) {
      const matchingStations = stations
        .filter((st) => st.elements_supported.includes(elem.requiredSupported))
        .map((st) => {
          const dist = calculateHaversineDistanceKm(location.latitude, location.longitude, st.latitude, st.longitude);
          const altDiff =
            typeof location.altitude === 'number' &&
            Number.isFinite(location.altitude) &&
            typeof st.altitude === 'number' &&
            Number.isFinite(st.altitude)
              ? Math.abs(location.altitude - st.altitude)
              : 0;
          // Score formula: Lower is better (heavily weight distance, moderately weight altitude difference)
          const score = dist + (altDiff / 100) * 2 - (st.quality_rating ?? 0) * 5;
          return {
            ...st,
            distance_km: dist,
            score: Math.round(score * 10) / 10,
          };
        })
        .sort((a, b) => a.score - b.score);

      const fallbackStation = matchingStations[0] || null;

      // Check if user has an explicit mapping override
      const existingMappings = db.getStationMappings(location.id);
      const userMapped = existingMappings.find((m) => m.element === elem.element);
      let selectedStation = fallbackStation;

      if (userMapped) {
        const found = matchingStations.find((s) => s.id === userMapped.station_id);
        if (found) selectedStation = found;
      } else if (fallbackStation) {
        // Auto-save recommended mapping
        db.setStationMapping({
          location_id: location.id,
          element: elem.element,
          station_id: fallbackStation.id,
          station_name: fallbackStation.name,
          distance_km: fallbackStation.distance_km,
          station_altitude: fallbackStation.altitude,
        });
      }

      results.push({
        element: elem.element,
        label: elem.label,
        bestStation: selectedStation,
        availableStations: matchingStations,
      });
    }

    return results;
  }

  /**
   * Retrieves data source summary details for UI presentation
   */
  static getElementSourceDetails(location: LocationRecord): ElementSourceDetail[] {
    const recommendations = this.resolveStationsForLocation(location);
    const db = getDb();
    const observations = measuredObservations(db.getObservations(location.id));
    const elementFields = {
      temperature: 'air_temperature',
      precipitation: 'precipitation_amount',
      wind: 'wind_speed',
      pressure: 'air_pressure',
      humidity: 'relative_humidity',
      snow: 'snow_depth',
    } as const;
    const dayAgo = Date.now() - 24 * 60 * 60 * 1000;

    return recommendations.map((rec) => {
      const st = rec.bestStation;
      const field = elementFields[rec.element];
      const latestObs = latestMeasuredWithElement(observations, field, st?.id);
      const sourceType: WeatherDataSourceType = latestObs ? 'MÅLT' : 'UKJENT';
      const validPoints = hourlyValuesForElement(
        observations.filter(
          (observation) => new Date(observation.observed_at).getTime() >= dayAgo
        ),
        field,
        st?.id
      ).length;
      return {
        element: rec.element,
        label: rec.label,
        station_id: st?.id || '',
        station_name: st?.name || 'Ingen tilgjengelig målestasjon',
        distance_km: st?.distance_km ?? null,
        altitude_moh: st?.altitude ?? null,
        source_type: sourceType,
        completeness_pct: Math.min(100, Math.round((validPoints / 24) * 1000) / 10),
        last_observed_at: latestObs?.observed_at || null,
        is_stale:
          !latestObs || Date.now() - new Date(latestObs.observed_at).getTime() > 90 * 60 * 1000,
      };
    });
  }
}
