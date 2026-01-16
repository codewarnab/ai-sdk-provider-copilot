/**
 * Pool module exports for session management and health monitoring.
 *
 * @module pool
 */

// Session pool
export { SessionPool, DEFAULT_POOL_CONFIG } from './session-pool.js';

// Health monitor
export {
    HealthMonitor,
    DEFAULT_HEALTH_CONFIG,
    type HealthStatus,
} from './health-monitor.js';
