import type { VolumeInputs, VolumeResult } from '../types';

/**
 * V = P × A × C   (1 mm of rain on 1 m² = 1 litre)
 * Losses (evaporation, first flush, seepage) are applied to the runoff volume.
 * Throws on invalid inputs so the UI can show an explicit message.
 */
export function computeVolume(inp: VolumeInputs): VolumeResult {
  const { rainfallMm: P, catchmentM2: A, runoffCoefficient: C, lossesPct, storageCapacityM3 } = inp;
  if (![P, A, C, lossesPct, storageCapacityM3].every(Number.isFinite))
    throw new Error('All inputs must be numbers.');
  if (P < 0 || A < 0 || storageCapacityM3 < 0) throw new Error('Rainfall, area and storage cannot be negative.');
  if (C < 0 || C > 1) throw new Error('The runoff coefficient must be between 0 and 1.');
  if (lossesPct < 0 || lossesPct > 100) throw new Error('Losses must be between 0 and 100 %.');

  const grossL = P * A; // litres
  const runoffL = grossL * C;
  const harvestL = runoffL * (1 - lossesPct / 100);
  const grossM3 = grossL / 1000;
  const runoffM3 = runoffL / 1000;
  const harvestM3 = harvestL / 1000;
  const storedM3 = Math.min(harvestM3, storageCapacityM3);
  return {
    grossM3,
    runoffM3,
    harvestM3,
    storageCapacityM3,
    storedM3,
    excessM3: Math.max(0, harvestM3 - storageCapacityM3),
    efficiency: grossM3 > 0 ? storedM3 / grossM3 : 0,
    grossLitres: grossL,
    runoffLitres: runoffL,
    harvestLitres: harvestL,
  };
}
