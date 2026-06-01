import { supabaseAdmin } from '@/lib/supabase/admin';

export class TelemetryService {
  /**
   * Records a latency metric benchmark to the database for performance regression observability.
   */
  static async logTelemetry(
    tenantId: string,
    metricName: string,
    metricValueMs: number,
    metadata: Record<string, any> = {}
  ): Promise<boolean> {
    try {
      // Log to console for real-time observability in dev
      console.log(`⏱️ [telemetry] ${metricName} took ${metricValueMs.toFixed(2)}ms`);

      const { error } = await supabaseAdmin
        .from('broadcast_telemetry')
        .insert({
          tenant_id: tenantId,
          metric_name: metricName,
          metric_value: parseFloat(metricValueMs.toFixed(3)),
          metadata
        });

      if (error) throw error;
      return true;
    } catch (err) {
      // Fail silently to prevent telemetry logging errors from interrupting user flows
      console.error('⚠️ Failed to record telemetry latency metric:', err);
      return false;
    }
  }

  /**
   * Helper function to wrap synchronous operations and benchmark their execution latency.
   */
  static benchmarkSync<T>(
    tenantId: string,
    metricName: string,
    operation: () => T,
    metadata: Record<string, any> = {}
  ): T {
    const start = performance.now();
    try {
      return operation();
    } finally {
      const duration = performance.now() - start;
      this.logTelemetry(tenantId, metricName, duration, metadata).catch(() => {});
    }
  }

  /**
   * Helper function to wrap asynchronous operations and benchmark their execution latency.
   */
  static async benchmarkAsync<T>(
    tenantId: string,
    metricName: string,
    operation: () => Promise<T>,
    metadata: Record<string, any> = {}
  ): Promise<T> {
    const start = performance.now();
    try {
      return await operation();
    } finally {
      const duration = performance.now() - start;
      this.logTelemetry(tenantId, metricName, duration, metadata).catch(() => {});
    }
  }
}
