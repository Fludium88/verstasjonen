import { WEATHER_CONFIG } from '@/lib/weatherConfig';
import { getDb } from '@/lib/db';
import { LocationRecord } from '@/types/weather';
import { MetAlertItem } from '@/types/alerts';

export type { MetAlertItem };

export class MetAlertsService {
  private static activeAlerts(alerts: MetAlertItem[], now = new Date()): MetAlertItem[] {
    const nowMs = now.getTime();
    return alerts.filter((alert) => {
      const startMs = new Date(alert.start_time).getTime();
      const endMs = new Date(alert.end_time).getTime();
      return Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > nowMs;
    });
  }

  /**
   * Fetches official CAP weather warnings (MetAlerts) from MET Norway
   */
  static async fetchMetAlertsForLocation(location: LocationRecord): Promise<MetAlertItem[]> {
    const db = getDb();
    const cacheKey = `metalerts_${location.latitude.toFixed(2)}_${location.longitude.toFixed(2)}`;
    const cached = db.getCacheEntry(cacheKey);

    // If cache is fresh (less than 15 minutes old), return cached parsed alerts
    if (cached && cached.data_json) {
      const ageMs = Date.now() - new Date(cached.updated_at).getTime();
      if (ageMs < 15 * 60 * 1000) {
        try {
          return this.activeAlerts(JSON.parse(cached.data_json));
        } catch {
          // parse error, refetch
        }
      }
    }

    const url = `https://api.met.no/weatherapi/metalerts/1.1?lat=${location.latitude}&lon=${location.longitude}`;

    try {
      const headers: Record<string, string> = {
        'User-Agent': WEATHER_CONFIG.defaultUserAgent,
        'Accept': 'application/json',
      };

      if (cached?.etag) {
        headers['If-None-Match'] = cached.etag;
      }

      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(WEATHER_CONFIG.met.timeoutMs),
      });

      if (res.status === 304 && cached?.data_json) {
        return this.activeAlerts(JSON.parse(cached.data_json));
      }

      if (res.ok) {
        const json = await res.json();
        const features = json.features || [];
        const alerts: MetAlertItem[] = [];

        for (const feat of features) {
          const props = feat.properties || {};
          const awarenessLevel = (props.awareness_level || '').toLowerCase(); // e.g. "2; yellow; Moderate"

          let severity: 'YELLOW' | 'ORANGE' | 'RED' = 'YELLOW';
          let severityLabel = 'Gult nivå (Moderat fare)';

          if (awarenessLevel.includes('red') || awarenessLevel.includes('4;')) {
            severity = 'RED';
            severityLabel = 'Rødt nivå (Ekstrem fare)';
          } else if (awarenessLevel.includes('orange') || awarenessLevel.includes('3;')) {
            severity = 'ORANGE';
            severityLabel = 'Oransje nivå (Betydelig fare)';
          }

          const eventName = props.eventAwarenessName || props.awareness_type || 'Farevarsel';
          const titleNo = props.title || `${eventName} (${severityLabel})`;
          const startTime = props.onset || props.effective || props.interval?.[0];
          const endTime = props.expires || props.ends || props.interval?.[1];
          if (
            !startTime ||
            !endTime ||
            !Number.isFinite(new Date(startTime).getTime()) ||
            !Number.isFinite(new Date(endTime).getTime())
          ) {
            continue;
          }

          alerts.push({
            id: props.id || `${props.awareness_type || 'weather'}_${startTime}_${endTime}`,
            event: (props.awareness_type || 'weather').toLowerCase(),
            event_name_no: titleNo,
            severity,
            severity_label: severityLabel,
            area: props.area || location.name,
            description: props.description || 'Beskrivelse er ikke oppgitt av MET.',
            consequences: props.consequences || 'Konsekvenser er ikke oppgitt av MET.',
            instruction: props.instruction || 'Tiltak er ikke oppgitt av MET.',
            start_time: startTime,
            end_time: endTime,
            awareness_type: props.awareness_type,
            source: 'MET_CAP',
          });
        }

        // Cache the parsed alerts
        const etag = res.headers.get('etag');
        db.setCacheEntry({
          key: cacheKey,
          url,
          etag,
          last_modified: null,
          expires_at: null,
          data_json: JSON.stringify(alerts),
          updated_at: new Date().toISOString(),
        });
        db.flush();

        return this.activeAlerts(alerts);
      }
    } catch (err) {
      console.warn('Failed to fetch MET MetAlerts:', err);
    }

    if (
      cached?.data_json &&
      Date.now() - new Date(cached.updated_at).getTime() <= 60 * 60 * 1000
    ) {
      try {
        return this.activeAlerts(JSON.parse(cached.data_json));
      } catch {
        // ignore
      }
    }

    return [];
  }
}
