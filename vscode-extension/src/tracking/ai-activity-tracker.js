const { getCurrentProjectName } = require('../utils/workspace-helper').default;

const DEFAULT_BURST_WINDOW_MS = 2000;
const DEFAULT_BURST_LINE_THRESHOLD = 15;
const DEFAULT_MULTI_FILE_THRESHOLD = 3;
const SUMMARY_INTERVAL_MS = 60000;

class AiActivityTracker {
  constructor(options) {
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.burstWindowMs = options.burstWindowMs || DEFAULT_BURST_WINDOW_MS;
    this.burstLineThreshold = options.burstLineThreshold || DEFAULT_BURST_LINE_THRESHOLD;
    this.multiFileThreshold = options.multiFileThreshold || DEFAULT_MULTI_FILE_THRESHOLD;

    this.editEvents = [];
    this.applyEditTimestamps = [];
    this.windowTimer = null;
    this.summaryTimer = null;

    this.stats = this.createEmptyStats();
  }

  createEmptyStats() {
    return {
      totalEdits: 0,
      humanLikelyEdits: 0,
      aiLikelyEdits: 0,
      aiLikelyLinesAdded: 0,
      aiLikelyLinesRemoved: 0,
      humanLikelyLinesAdded: 0,
      humanLikelyLinesRemoved: 0,
      multiFileEditBursts: 0,
      applyEditCorrelations: 0,
      distinctFiles: new Set()
    };
  }

  start() {
    this.dispose();
    console.log('[Saul AI] AI activity tracker started');
    this.stats = this.createEmptyStats();

    this.summaryTimer = setInterval(() => {
      this.emitSummary();
    }, SUMMARY_INTERVAL_MS);
  }

  dispose() {
    if (this.windowTimer) {
      clearTimeout(this.windowTimer);
      this.windowTimer = null;
    }
    if (this.summaryTimer) {
      clearInterval(this.summaryTimer);
      this.summaryTimer = null;
    }
    this.editEvents = [];
    this.applyEditTimestamps = [];
  }

  onEditEvent(event) {
    const config = this.getConfig();
    if (!config.enableTelemetry || !config.enableAiTracking) return;

    if (event.reason === 1 || event.reason === 2) return;

    const now = event.timestamp || Date.now();
    this.editEvents.push({
      timestamp: now,
      linesAdded: event.delta?.linesAdded || 0,
      linesRemoved: event.delta?.linesRemoved || 0,
      documentUri: event.documentUri || 'unknown'
    });

    if (!this.windowTimer) {
      this.windowTimer = setTimeout(() => {
        this.evaluateWindow();
        this.windowTimer = null;
      }, this.burstWindowMs);
    }
  }

  onApplyEdit(timestamp) {
    this.applyEditTimestamps.push(timestamp || Date.now());
    if (this.applyEditTimestamps.length > 100) {
      this.applyEditTimestamps = this.applyEditTimestamps.slice(-50);
    }
  }

  evaluateWindow() {
    if (this.editEvents.length === 0) return;

    const now = Date.now();
    const cutoff = now - this.burstWindowMs;
    const windowEvents = this.editEvents.filter(e => e.timestamp >= cutoff);
    this.editEvents = [];

    if (windowEvents.length === 0) return;

    const totalLinesAdded = windowEvents.reduce((s, e) => s + e.linesAdded, 0);
    const totalLinesRemoved = windowEvents.reduce((s, e) => s + e.linesRemoved, 0);
    const totalLines = totalLinesAdded + totalLinesRemoved;
    const distinctFiles = new Set(windowEvents.map(e => e.documentUri));

    const hasApplyEditCorrelation = this.applyEditTimestamps.some(
      t => t >= cutoff && t <= now
    );

    const isBurst = totalLines >= this.burstLineThreshold;
    const isMultiFile = distinctFiles.size >= this.multiFileThreshold;
    const isAiLikely = isBurst || isMultiFile || (hasApplyEditCorrelation && totalLines > 5);

    this.stats.totalEdits += windowEvents.length;
    for (const uri of distinctFiles) {
      this.stats.distinctFiles.add(uri);
    }

    if (isAiLikely) {
      this.stats.aiLikelyEdits += windowEvents.length;
      this.stats.aiLikelyLinesAdded += totalLinesAdded;
      this.stats.aiLikelyLinesRemoved += totalLinesRemoved;
      if (isMultiFile) this.stats.multiFileEditBursts++;
      if (hasApplyEditCorrelation) this.stats.applyEditCorrelations++;
    } else {
      this.stats.humanLikelyEdits += windowEvents.length;
      this.stats.humanLikelyLinesAdded += totalLinesAdded;
      this.stats.humanLikelyLinesRemoved += totalLinesRemoved;
    }

    this.applyEditTimestamps = this.applyEditTimestamps.filter(t => t > now);
  }

  emitSummary() {
    if (this.stats.totalEdits === 0) return;

    const heartbeat = this.buildHeartbeat({
      entityType: 'ai_activity',
      entity: 'ai_edit_summary',
      project: getCurrentProjectName(),
      category: 'ai_tracking',
      isWrite: false,
      metadata: {
        eventType: 'ai_edit_summary',
        totalEdits: this.stats.totalEdits,
        humanLikelyEdits: this.stats.humanLikelyEdits,
        aiLikelyEdits: this.stats.aiLikelyEdits,
        aiLikelyLinesAdded: this.stats.aiLikelyLinesAdded,
        aiLikelyLinesRemoved: this.stats.aiLikelyLinesRemoved,
        humanLikelyLinesAdded: this.stats.humanLikelyLinesAdded,
        humanLikelyLinesRemoved: this.stats.humanLikelyLinesRemoved,
        multiFileEditBursts: this.stats.multiFileEditBursts,
        applyEditCorrelations: this.stats.applyEditCorrelations,
        distinctFilesEdited: this.stats.distinctFiles.size
      }
    });

    this.queue.enqueue(heartbeat);
    console.log('[Saul AI] Summary: ' + this.stats.aiLikelyEdits + ' AI-likely, ' + this.stats.humanLikelyEdits + ' human-likely edits');

    this.stats = this.createEmptyStats();
  }
}

module.exports = { AiActivityTracker };
