import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WaterGuardState } from './schemas/waterguard-state.schema';
import { WaterMeasurement } from './schemas/water-measurement.schema';
import { WaterAlert } from './schemas/water-alert.schema';

type Scenario = 'NORMAL' | 'SLOW_LEAK' | 'MAJOR_LEAK' | 'OFF';

@Injectable()
export class WaterGuardService {
  constructor(
    @InjectModel(WaterGuardState.name) private states: Model<WaterGuardState>,
    @InjectModel(WaterMeasurement.name)
    private measurements: Model<WaterMeasurement>,
    @InjectModel(WaterAlert.name) private alerts: Model<WaterAlert>,
  ) {}

  async start(siteId: string, expectedFlow = 18) {
    if (
      !Number.isFinite(expectedFlow) ||
      expectedFlow <= 0 ||
      expectedFlow > 5000
    ) {
      throw new BadRequestException(
        'expectedFlow must be between 0 and 5000 L/min',
      );
    }

    const state = await this.states.findOneAndUpdate(
      { siteId },
      {
        $set: {
          siteId,
          active: true,
          scenario: 'NORMAL',
          expectedFlow,
          flowRate: 0,
          totalVolumeLiters: 0,
          estimatedLossLiters: 0,
          consecutiveAnomalies: 0,
          status: 'NORMAL',
          sessionStartedAt: new Date(),
          lastUpdated: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await this.alerts.updateMany(
      { siteId, status: 'ACTIVE' },
      { $set: { status: 'RESOLVED', resolvedAt: new Date() } },
    );

    return state;
  }

  async simulate(siteId: string, scenario: Scenario) {
    if (!['NORMAL', 'SLOW_LEAK', 'MAJOR_LEAK', 'OFF'].includes(scenario)) {
      throw new BadRequestException('Unknown simulation scenario');
    }

    let state = await this.states.findOne({ siteId });

    if (!state) {
      await this.start(siteId);
      state = await this.states.findOne({ siteId });
    }

    if (!state) {
      throw new NotFoundException('WaterGuard state not found');
    }

    if (!state.active) {
      throw new BadRequestException('Start an irrigation session first');
    }

    const expected = state.expectedFlow || 18;
    const flow =
      scenario === 'NORMAL'
        ? expected * (0.97 + Math.random() * 0.06)
        : scenario === 'SLOW_LEAK'
          ? expected * 1.38
          : scenario === 'MAJOR_LEAK'
            ? expected * 1.82
            : 0;

    const anomaly = scenario === 'SLOW_LEAK' || scenario === 'MAJOR_LEAK';
    const consecutive = anomaly ? (state.consecutiveAnomalies || 0) + 1 : 0;
    // Each click advances the demo clock by one simulated minute.
    const incrementLiters = flow;
    const excess = Math.max(0, flow - expected);
    const loss = anomaly ? excess : 0;
    const status =
      scenario === 'OFF'
        ? 'OFF'
        : scenario === 'NORMAL'
          ? 'NORMAL'
          : consecutive >= 3
            ? 'LEAK'
            : 'WARNING';

    const updated = await this.states.findOneAndUpdate(
      { siteId },
      {
        $set: {
          scenario,
          flowRate: Math.round(flow * 10) / 10,
          totalVolumeLiters: (state.totalVolumeLiters || 0) + incrementLiters,
          estimatedLossLiters: (state.estimatedLossLiters || 0) + loss,
          consecutiveAnomalies: consecutive,
          status,
          lastUpdated: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new NotFoundException('WaterGuard state not found');
    }

    await this.measurements.create({
      siteId,
      flowRate: updated.flowRate,
      expectedFlow: expected,
      volumeLiters: updated.totalVolumeLiters,
      estimatedLossLiters: updated.estimatedLossLiters,
      irrigationActive: scenario !== 'OFF',
      scenario,
      status,
      timestamp: new Date(),
    });

    if (status === 'WARNING' || status === 'LEAK') {
      const latest = await this.alerts
        .findOne({ siteId, status: 'ACTIVE' })
        .sort({ createdAt: -1 });
      const severity = status === 'LEAK' ? 'HIGH' : 'MEDIUM';

      if (!latest || latest.type !== scenario || latest.severity !== severity) {
        const excessPct = expected
          ? Math.round(((flow - expected) / expected) * 100)
          : 0;
        await this.alerts.create({
          siteId,
          type: scenario,
          severity,
          expectedFlow: expected,
          measuredFlow: flow,
          excessPercentage: excessPct,
          estimatedLossLiters: loss,
          explanation:
            status === 'LEAK'
              ? 'Débit anormal persistant : inspectez les tuyaux, raccords et vannes.'
              : 'Débit supérieur au seuil : surveillez les prochaines mesures.',
          status: 'ACTIVE',
          createdAt: new Date(),
          resolvedAt: null,
        });
      }
    }

    return updated;
  }

  async stop(siteId: string) {
    const state = await this.states.findOne({ siteId });
    if (!state) {
      throw new NotFoundException('WaterGuard session not found');
    }

    return this.states.findOneAndUpdate(
      { siteId },
      {
        $set: {
          active: false,
          flowRate: 0,
          status: 'OFF',
          scenario: 'OFF',
          lastUpdated: new Date(),
        },
      },
      { new: true },
    );
  }

  async live(siteId: string) {
    const state = await this.states.findOne({ siteId });
    return (
      state || {
        siteId,
        active: false,
        expectedFlow: 18,
        flowRate: 0,
        totalVolumeLiters: 0,
        estimatedLossLiters: 0,
        status: 'OFF',
        scenario: 'OFF',
      }
    );
  }

  async history(siteId: string, limit = 100) {
    return this.measurements
      .find({ siteId })
      .sort({ timestamp: -1 })
      .limit(Math.min(Math.max(limit, 1), 500))
      .lean();
  }

  async listAlerts(siteId: string) {
    return this.alerts
      .find({ siteId })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
  }

  async resolveAlert(alertId: string) {
    const alert = await this.alerts.findByIdAndUpdate(
      alertId,
      { $set: { status: 'RESOLVED', resolvedAt: new Date() } },
      { new: true },
    );

    if (!alert) {
      throw new NotFoundException('Alert not found');
    }

    return alert;
  }
}
