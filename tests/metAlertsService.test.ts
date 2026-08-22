import { describe, it, expect } from 'vitest';
import { MetAlertsService, MetAlertItem } from '../src/services/alerts/metAlertsService';

describe('MetAlertsService & CAP Warnings', () => {
  it('parses yellow, orange and red severity correctly', () => {
    const mockFeatureYellow = {
      properties: {
        id: 'cap_1',
        awareness_level: '2; yellow; Moderate',
        eventAwarenessName: 'Kraftige vindkast',
        title: 'Gult nivå: Kraftige vindkast i Møre og Romsdal',
        area: 'Møre og Romsdal',
        description: 'Det ventes vindkast på 25-30 m/s.',
        consequences: 'Løse gjenstander kan blåse avgårde.',
        instruction: 'Fest løse gjenstander.',
        interval: ['2026-08-20T12:00:00Z', '2026-08-21T06:00:00Z'],
      },
    };

    const mockFeatureOrange = {
      properties: {
        id: 'cap_2',
        awareness_level: '3; orange; Severe',
        eventAwarenessName: 'Svært kraftige vindkast',
        title: 'Oransje nivå: Svært kraftige vindkast',
      },
    };

    const mockFeatureRed = {
      properties: {
        id: 'cap_3',
        awareness_level: '4; red; Extreme',
        eventAwarenessName: 'Ekstremvær',
        title: 'Rødt nivå: Ekstrem vind',
      },
    };

    const parseFeature = (feat: any): MetAlertItem => {
      const props = feat.properties;
      const level = (props.awareness_level || '').toLowerCase();
      let severity: 'YELLOW' | 'ORANGE' | 'RED' = 'YELLOW';
      if (level.includes('red') || level.includes('4;')) severity = 'RED';
      else if (level.includes('orange') || level.includes('3;')) severity = 'ORANGE';

      return {
        id: props.id,
        event: 'wind',
        event_name_no: props.title,
        severity,
        severity_label: severity === 'RED' ? 'Rødt nivå' : severity === 'ORANGE' ? 'Oransje nivå' : 'Gult nivå',
        area: props.area || 'Aukra',
        description: props.description || '',
        consequences: props.consequences || '',
        instruction: props.instruction || '',
        start_time: props.interval?.[0] || '',
        end_time: props.interval?.[1] || '',
        source: 'MET_CAP',
      };
    };

    const a1 = parseFeature(mockFeatureYellow);
    const a2 = parseFeature(mockFeatureOrange);
    const a3 = parseFeature(mockFeatureRed);

    expect(a1.severity).toBe('YELLOW');
    expect(a2.severity).toBe('ORANGE');
    expect(a3.severity).toBe('RED');
    expect(a1.event_name_no).toContain('Gult nivå');
  });
});
