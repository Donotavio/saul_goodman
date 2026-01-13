import path from 'node:path';

export interface Viewport {
  width: number;
  height: number;
}

export const DEFAULT_VIEWPORTS: Record<'desktop' | 'mobile', Viewport> = {
  desktop: { width: 1280, height: 720 },
  mobile: { width: 390, height: 844 }
};

export const HARNESS_PAGES = {
  popup: '/tools/mcp_quality/harness/popup.html',
  options: '/tools/mcp_quality/harness/options.html',
  report: '/tools/mcp_quality/harness/report.html'
};

export const DEFAULT_ARTIFACTS_DIR = path.resolve('tools/mcp_quality/artifacts');
