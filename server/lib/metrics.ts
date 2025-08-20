/**
 * Metrics and logging utilities for performance monitoring
 */

export interface CallMetrics {
  callId: string;
  startTime: number;
  timeToFirstAudio?: number;
  audioLatency?: number[];
  toolExecutionTimes?: Record<string, number>;
  tokensUsed?: {
    audio: number;
    text: number;
  };
}

const activeCallMetrics = new Map<string, CallMetrics>();

export function startCallMetrics(callId: string): void {
  activeCallMetrics.set(callId, {
    callId,
    startTime: Date.now(),
    audioLatency: [],
    toolExecutionTimes: {},
  });
}

export function recordFirstAudio(callId: string): void {
  const metrics = activeCallMetrics.get(callId);
  if (metrics && !metrics.timeToFirstAudio) {
    metrics.timeToFirstAudio = Date.now() - metrics.startTime;
    console.log(`📊 First audio for ${callId}: ${metrics.timeToFirstAudio}ms`);
  }
}

export function recordAudioLatency(callId: string, latency: number): void {
  const metrics = activeCallMetrics.get(callId);
  if (metrics) {
    metrics.audioLatency?.push(latency);
  }
}

export function recordToolExecution(callId: string, toolName: string, duration: number): void {
  const metrics = activeCallMetrics.get(callId);
  if (metrics) {
    if (!metrics.toolExecutionTimes) metrics.toolExecutionTimes = {};
    metrics.toolExecutionTimes[toolName] = duration;
    
    console.log(`🔧 Tool ${toolName} for ${callId}: ${duration}ms`);
    
    // Alert on slow tools
    if (duration > 2000) {
      console.warn(`⚠️ Slow tool execution: ${toolName} took ${duration}ms`);
    }
  }
}

export function recordTokenUsage(callId: string, audioTokens: number, textTokens: number): void {
  const metrics = activeCallMetrics.get(callId);
  if (metrics) {
    metrics.tokensUsed = {
      audio: (metrics.tokensUsed?.audio || 0) + audioTokens,
      text: (metrics.tokensUsed?.text || 0) + textTokens,
    };
  }
}

export function finishCallMetrics(callId: string): CallMetrics | null {
  const metrics = activeCallMetrics.get(callId);
  if (metrics) {
    const duration = Date.now() - metrics.startTime;
    const avgLatency = metrics.audioLatency?.length ? 
      metrics.audioLatency.reduce((a, b) => a + b, 0) / metrics.audioLatency.length : 0;
    
    console.log(`📈 Call ${callId} completed:`, {
      duration: `${duration}ms`,
      timeToFirstAudio: `${metrics.timeToFirstAudio}ms`,
      avgAudioLatency: `${Math.round(avgLatency)}ms`,
      toolCalls: Object.keys(metrics.toolExecutionTimes || {}).length,
      tokensUsed: metrics.tokensUsed,
    });
    
    activeCallMetrics.delete(callId);
    return metrics;
  }
  return null;
}

export function getActiveCallCount(): number {
  return activeCallMetrics.size;
}