import path from 'node:path';

export type ScenarioName =
  | 'popup'
  | 'options'
  | 'report'
  | 'perf'
  | 'site'
  | 'blog'
  | 'daemon'
  | 'vscode';

export interface Viewport {
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORTS: Record<'desktop' | 'mobile', Viewport> = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 }
};

export const DEFAULT_SCENARIOS: ScenarioName[] = [
  'popup',
  'options',
  'report',
  'perf',
  'site',
  'blog',
  'daemon',
  'vscode'
];

export const HARNESS_PAGES: Record<'popup' | 'options' | 'report', string> = {
  popup: '/tools/mcp_quality/harness/popup.html',
  options: '/tools/mcp_quality/harness/options.html',
  report: '/tools/mcp_quality/harness/report.html'
};

export const DEFAULT_ARTIFACTS_DIR = path.resolve('tools/mcp_quality/artifacts');

export const DEFAULT_BASE_FLAGS = {
  allowWarnings: false,
  networkOffline: false,
  updateBaseline: false
};
