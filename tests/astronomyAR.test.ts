import { describe, it, expect } from 'vitest';
import { AstronomyService } from '../src/services/astronomy/astronomyService';
import * as Astronomy from 'astronomy-engine';

describe('Astronomy AR & Sky Arcs', () => {
  const osloLat = 59.9139;
  const osloLon = 10.7522;
  const altitudeMoh = 25;
  const testDate = '2026-06-21'; // Summer solstice

  it('calculates celestial sun arc with 145 points for 24h (every 10 min)', () => {
    const sunArc = AstronomyService.calculateCelestialArc(
      Astronomy.Body.Sun,
      osloLat,
      osloLon,
      altitudeMoh,
      testDate,
      'Europe/Oslo',
      10
    );

    expect(sunArc.length).toBe(145);
    expect(sunArc[0].displayTime).toBe('00:00');
    expect(sunArc[sunArc.length - 1].displayTime).toBe('00:00');

    // On summer solstice in Oslo, noon should reach ~53 degrees altitude
    const maxAlt = Math.max(...sunArc.map((p) => p.altitude));
    expect(maxAlt).toBeGreaterThan(50);
    expect(maxAlt).toBeLessThan(56);

    // Midsummer sun should be above horizon for more than 18 hours (>108 points above horizon)
    const pointsAbove = sunArc.filter((p) => p.isAboveHorizon);
    expect(pointsAbove.length).toBeGreaterThan(100);
  });

  it('calculates complete SkyArcData with sun, moon, and solstice arcs', () => {
    const data = AstronomyService.calculateSkyArcs(
      osloLat,
      osloLon,
      altitudeMoh,
      testDate,
      'Europe/Oslo'
    );

    expect(data.sunArc).toBeDefined();
    expect(data.sunArc.length).toBeGreaterThan(0);
    expect(data.moonArc).toBeDefined();
    expect(data.moonArc.length).toBeGreaterThan(0);
    expect(data.summerSolsticeSunArc).toBeDefined();
    expect(data.winterSolsticeSunArc).toBeDefined();

    // Summer solstice sun altitude should be significantly higher than winter solstice in Oslo
    const summerMax = Math.max(...(data.summerSolsticeSunArc || []).map((p) => p.altitude));
    const winterMax = Math.max(...(data.winterSolsticeSunArc || []).map((p) => p.altitude));
    expect(summerMax).toBeGreaterThan(winterMax + 35);
  });

  it('projects celestial coordinates dead center when camera points directly at object', () => {
    const width = 1000;
    const height = 1000;
    const fov = 60;

    // Sun at Azimuth 180 (South), Altitude 45
    // Camera pointing exactly South (heading 180), Pitch 45 up, Roll 0
    const proj = AstronomyService.projectCelestialToScreen(
      180,
      45,
      180,
      45,
      0,
      fov,
      width,
      height
    );

    expect(proj.inFront).toBe(true);
    expect(proj.isVisible).toBe(true);
    expect(Math.round(proj.x)).toBe(500);
    expect(Math.round(proj.y)).toBe(500);
    expect(proj.angleFromCenterDeg).toBeLessThan(0.01);
  });

  it('marks object behind camera as not inFront', () => {
    const width = 1000;
    const height = 1000;
    const fov = 60;

    // Object at North (Azimuth 0), Camera pointing South (Heading 180)
    const proj = AstronomyService.projectCelestialToScreen(
      0,
      20,
      180,
      0,
      0,
      fov,
      width,
      height
    );

    expect(proj.inFront).toBe(false);
    expect(proj.isVisible).toBe(false);
  });

  it('correctly shifts object to the right of screen when camera is pointing slightly to the left', () => {
    const width = 1000;
    const height = 1000;
    const fov = 60;

    // Object at Azimuth 190 (10 deg to the right of camera)
    // Camera at Heading 180
    const proj = AstronomyService.projectCelestialToScreen(
      190,
      0,
      180,
      0,
      0,
      fov,
      width,
      height
    );

    expect(proj.inFront).toBe(true);
    expect(proj.isVisible).toBe(true);
    // x should be > center (500)
    expect(proj.x).toBeGreaterThan(500);
    expect(Math.round(proj.y)).toBe(500); // Horizon is center
  });

  it('fuses iOS compass north with the physical rear-camera vector', () => {
    const tilted = AstronomyService.computeIosCameraOrientation({
      alpha: 0,
      beta: 45,
      gamma: 0,
      webkitCompassHeading: 0,
    });
    expect(tilted.northAnchorObservable).toBe(true);
    expect(tilted.measuredNorthOffset).toBe(0);
    expect(tilted.orientation.heading).toBe(0);
    expect(tilted.orientation.pitch).toBe(-45);

    // At the horizon the portrait top-axis is vertical and cannot supply a
    // fresh heading. The retained offset lets gyro attitude keep camera north.
    const upright = AstronomyService.computeIosCameraOrientation({
      alpha: 0,
      beta: 90,
      gamma: 0,
      webkitCompassHeading: 135,
    }, 0);
    expect(upright.northAnchorObservable).toBe(false);
    expect(upright.measuredNorthOffset).toBeNull();
    expect(upright.orientation.heading).toBe(0);
    expect(upright.orientation.pitch).toBe(0);

    // Crossing beta=90 flips the physical top axis, but not camera azimuth.
    const tiltedUp = AstronomyService.computeIosCameraOrientation({
      alpha: 0,
      beta: 135,
      gamma: 0,
      webkitCompassHeading: 180,
    });
    expect(tiltedUp.measuredNorthOffset).toBe(0);
    expect(tiltedUp.orientation.heading).toBe(0);
    expect(tiltedUp.orientation.pitch).toBe(45);
  });

  it('computes device orientation correctly from Android W3C Euler angles', () => {
    // Android W3C: Facing South (alpha=180), Phone upright at horizon (beta=90, gamma=0)
    const ori = AstronomyService.computeDeviceOrientation({
      alpha: 180,
      beta: 90,
      gamma: 0,
    });

    expect(Math.round(ori.heading)).toBe(180); // South
    expect(Math.round(ori.pitch)).toBe(0); // Horizon
  });

  it('computes sun calibration offset accurately', () => {
    // True Sun position: Azimuth 210, Altitude 35
    // Raw sensor says: Heading 195, Pitch 30
    const cal = AstronomyService.computeCelestialCalibrationOffset(210, 35, 195, 30);

    expect(cal.headingOffset).toBe(15);
    expect(cal.pitchOffset).toBe(5);

    // When applied, effective orientation matches true sun position
    const effectiveHeading = (195 + cal.headingOffset) % 360;
    const effectivePitch = 30 + cal.pitchOffset;
    expect(effectiveHeading).toBe(210);
    expect(effectivePitch).toBe(35);
  });

  describe('AR Sensor Interference Suppression & Stabilizer', () => {
    it('computes shortest circular delta correctly across the 0/360 boundary', () => {
      // Delta from 358 to 3 is +5 deg
      expect(AstronomyService.computeShortestAngleDelta(3, 358)).toBe(5);
      // Delta from 2 to 359 is -3 deg
      expect(AstronomyService.computeShortestAngleDelta(359, 2)).toBe(-3);
      // Delta from 180 to 185 is +5 deg
      expect(AstronomyService.computeShortestAngleDelta(185, 180)).toBe(5);
    });

    it('suppresses micro-tremors and small noise below the deadband threshold', () => {
      // 0.3 deg noise with deadband 0.8 deg should be reduced to almost 0 (< 0.05)
      const dampened = AstronomyService.applySoftDeadband(0.3, 0.8);
      expect(Math.abs(dampened)).toBeLessThan(0.05);

      // 4.0 deg deliberate pan should pass through smoothly with continuous soft reduction
      const panning = AstronomyService.applySoftDeadband(4.0, 0.8);
      expect(panning).toBeCloseTo(3.2, 6);
    });

    it('stabilizes orientation and marks state as stable during stationary jitter', () => {
      const current = { heading: 180.0, pitch: 20.0, roll: 0.0 };
      // Rapid sensor jitter of 0.4 deg
      const targetJitter = { heading: 180.4, pitch: 19.8, roll: 0.2 };

      const resultUltra = AstronomyService.filterOrientationStep(current, targetJitter, 'ultra');
      expect(resultUltra.isStable).toBe(true);
      // Output heading should barely budge from 180
      expect(Math.abs(resultUltra.heading - 180)).toBeLessThan(0.05);

      const resultHigh = AstronomyService.filterOrientationStep(current, targetJitter, 'high');
      expect(resultHigh.isStable).toBe(true);
      expect(Math.abs(resultHigh.heading - 180)).toBeLessThan(0.08);
    });

    it('tracks rapid camera panning smoothly', () => {
      const current = { heading: 180.0, pitch: 20.0, roll: 0.0 };
      // Panning 30 degrees to the right
      const targetPan = { heading: 210.0, pitch: 20.0, roll: 0.0 };

      const result = AstronomyService.filterOrientationStep(current, targetPan, 'high');
      expect(result.isStable).toBe(false);
      // Heading should move noticeably towards 210
      expect(result.heading).toBeGreaterThan(188);
    });

    it('prevents degrees flickering using hysteresis', () => {
      // Display is currently 180
      let display = 180;

      // Small jitter around boundary (e.g. 180.4, 180.6)
      // 180.4 should remain 180
      display = AstronomyService.updateDegreeWithHysteresis(180.4, display, 0.70);
      expect(display).toBe(180);

      // 180.6 (diff is 0.6 < 0.7) should still remain 180 (no flicker)
      display = AstronomyService.updateDegreeWithHysteresis(180.6, display, 0.70);
      expect(display).toBe(180);

      // 180.8 (diff is 0.8 >= 0.7) should now cleanly flip to 181
      display = AstronomyService.updateDegreeWithHysteresis(180.8, display, 0.70);
      expect(display).toBe(181);

      // Small jitter backwards to 180.5 (diff is -0.5 < 0.7) does not flip back
      display = AstronomyService.updateDegreeWithHysteresis(180.5, display, 0.70);
      expect(display).toBe(181);
    });

    it('normalizes the displayed compass degree at the north boundary', () => {
      expect(AstronomyService.updateDegreeWithHysteresis(359.8, 359, 0.7)).toBe(0);
      expect(AstronomyService.updateDegreeWithHysteresis(-5.1, -4, 0.7, false)).toBe(-5);
    });

    it('rejects incomplete sensor events instead of interpreting null as north', () => {
      expect(AstronomyService.classifyOrientationSensorSource({
        alpha: null,
        beta: null,
        gamma: null,
        absolute: true,
      }, 'deviceorientationabsolute')).toBe('none');

      expect(AstronomyService.classifyOrientationSensorSource({
        alpha: 180,
        beta: 90,
        gamma: 0,
      }, 'deviceorientationabsolute')).toBe('absolute-event');

      expect(AstronomyService.classifyOrientationSensorSource({
        webkitCompassHeading: 120,
        beta: null,
        gamma: null,
      })).toBe('none');
    });

    it('locks onto north-referenced data and never downgrades it to a relative frame', () => {
      expect(AstronomyService.shouldAcceptOrientationSensorSource(
        'absolute-event',
        'relative',
        100
      )).toBe(false);
      expect(AstronomyService.shouldAcceptOrientationSensorSource(
        'absolute-event',
        'relative',
        1600
      )).toBe(false);
      expect(AstronomyService.shouldAcceptOrientationSensorSource(
        'relative',
        'absolute-event',
        10
      )).toBe(true);
      expect(AstronomyService.shouldAcceptOrientationSensorSource(
        'absolute',
        'ios',
        10
      )).toBe(false);
    });

    it('removes a one-tick magnetic spike with circular sampling across north', () => {
      const robust = AstronomyService.computeRobustOrientationSample([
        { heading: 359.7, pitch: 10.1, roll: 0.1 },
        { heading: 0.2, pitch: 9.9, roll: -0.1 },
        { heading: 42, pitch: 32, roll: 18 },
        { heading: 359.9, pitch: 10.0, roll: 0 },
        { heading: 0.1, pitch: 10.2, roll: 0.2 },
      ], { heading: 0, pitch: 10, roll: 0 });

      expect(Math.abs(AstronomyService.computeShortestAngleDelta(robust.heading, 0))).toBeLessThan(0.2);
      expect(robust.pitch).toBeCloseTo(10.1, 1);
      expect(robust.roll).toBeCloseTo(0.1, 1);
    });

    it('does not promote an early source candidate containing a single spike', () => {
      expect(AstronomyService.areOrientationSamplesConsistent([
        { heading: 0, pitch: 10, roll: 0 },
        { heading: 42, pitch: 31, roll: 17 },
      ])).toBe(false);

      expect(AstronomyService.areOrientationSamplesConsistent([
        { heading: 0, pitch: 10, roll: 0 },
        { heading: 20, pitch: 10, roll: 0 },
      ])).toBe(false);

      expect(AstronomyService.areOrientationSamplesConsistent([
        { heading: 359.6, pitch: 10.1, roll: 0.1 },
        { heading: 0.2, pitch: 9.8, roll: -0.2 },
        { heading: 0.1, pitch: 10.2, roll: 0 },
      ])).toBe(true);
    });

    it('keeps a robust sample window when stationary events arrive at 1 Hz', () => {
      const robust = AstronomyService.computeRobustOrientationSample([
        { heading: 100, pitch: 10, roll: 0, timestampMs: 0 },
        { heading: 132, pitch: 28, roll: 14, timestampMs: 1000 },
        { heading: 100.2, pitch: 10.2, roll: 0.2, timestampMs: 2000 },
      ], { heading: 100, pitch: 10, roll: 0 });

      expect(robust.heading).toBeCloseTo(100.2, 1);
      expect(robust.pitch).toBeCloseTo(10.2, 1);
      expect(robust.roll).toBeCloseTo(0.2, 1);
    });

    it('snaps once to the final pose after a deliberate pan has settled', () => {
      const settledSamples = [
        { heading: 90.1, pitch: 20.1, roll: 0.1 },
        { heading: 89.8, pitch: 19.9, roll: -0.1 },
        { heading: 90, pitch: 20, roll: 0 },
      ];

      expect(AstronomyService.shouldSnapSettledOrientation(
        settledSamples,
        true,
        true,
        249,
        1.5
      )).toBe(false);
      expect(AstronomyService.shouldSnapSettledOrientation(
        settledSamples,
        true,
        true,
        250,
        1.5
      )).toBe(true);
      expect(AstronomyService.shouldSnapSettledOrientation(
        [settledSamples[0], { heading: 93, pitch: 20, roll: 0 }, settledSamples[2]],
        true,
        true,
        400,
        1.5
      )).toBe(false);
    });

    it('holds the overlay completely still inside the configured deadband', () => {
      let current = { heading: 0, pitch: 10, roll: 0 };
      const jitter = [0.8, 359.1, 1.2, 359.4, 0.3, 358.9];
      let maximumMovement = 0;
      let remainedStable = true;

      for (let frame = 0; frame < 240; frame++) {
        const targetHeading = jitter[frame % jitter.length];
        const result = AstronomyService.filterOrientationStep(
          current,
          { heading: targetHeading, pitch: 10.5, roll: -0.4 },
          'high',
          1.5,
          1000 / 60
        );
        current = result;
        maximumMovement = Math.max(
          maximumMovement,
          Math.abs(AstronomyService.computeShortestAngleDelta(current.heading, 0)),
          Math.abs(current.pitch - 10),
          Math.abs(current.roll)
        );
        remainedStable = remainedStable && result.isStable;
      }

      expect(maximumMovement).toBe(0);
      expect(remainedStable).toBe(true);
      expect(current.heading).toBe(0);
      expect(current.pitch).toBe(10);
      expect(current.roll).toBe(0);
    });

    it('has equivalent response time on 30, 60 and 120 Hz displays', () => {
      const runForDuration = (hz: number, durationMs: number) => {
        let current = { heading: 0, pitch: 0, roll: 0 };
        const frameCount = Math.round(hz * durationMs / 1000);
        for (let frame = 0; frame < frameCount; frame++) {
          current = AstronomyService.filterOrientationStep(
            current,
            { heading: 90, pitch: 25, roll: 0 },
            'high',
            1.5,
            1000 / hz
          );
        }
        return current;
      };

      for (const durationMs of [100, 200, 1000]) {
        const at30 = runForDuration(30, durationMs);
        const at60 = runForDuration(60, durationMs);
        const at120 = runForDuration(120, durationMs);
        expect(Math.abs(AstronomyService.computeShortestAngleDelta(at30.heading, at60.heading))).toBeLessThan(0.8);
        expect(Math.abs(AstronomyService.computeShortestAngleDelta(at120.heading, at60.heading))).toBeLessThan(0.8);
        expect(Math.abs(at30.pitch - at60.pitch)).toBeLessThan(0.8);
        expect(Math.abs(at120.pitch - at60.pitch)).toBeLessThan(0.8);
      }
    });

    it('does not rotate an already camera-derived Android heading with screen angle', () => {
      const portrait = AstronomyService.computeDeviceOrientation({
        alpha: 180,
        beta: 90,
        gamma: 0,
      }, 0);
      const landscape = AstronomyService.computeDeviceOrientation({
        alpha: 180,
        beta: 90,
        gamma: 0,
      }, 90);

      expect(landscape.heading).toBe(portrait.heading);
    });
  });
});
