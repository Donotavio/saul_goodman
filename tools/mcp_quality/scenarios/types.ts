import type { ScenarioName, Viewport } from '../config.js';
import type { DevtoolsMcpClient } from '../mcp/client.js';

export interface ScenarioContext {
  client: DevtoolsMcpClient;
  baseUrl: string;
  artifactsDir: string;
  viewportName: 'desktop' | 'mobile';
  viewport: Viewport;
  allowWarnings: boolean;
  updateBaseline: boolean;
}

export interface ScenarioResult {
  name: ScenarioName;
  viewport: 'desktop' | 'mobile';
  passed: boolean;
  errors: string[];
  warnings: string[];
  screenshotPath?: string;
  details?: string[];
  metrics?: Record<string, unknown>;
  artifacts?: Record<string, string>;
}
