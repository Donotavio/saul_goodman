import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import path from 'node:path';

export interface McpLaunchOptions {
  headless?: boolean;
  isolated?: boolean;
  viewport?: { width: number; height: number };
  browserUrl?: string;
  channel?: 'stable' | 'beta' | 'dev' | 'canary';
}

export interface McpCallResult {
  raw: CallToolResult;
  text: string[];
  images: Array<{ data: string; mimeType: string }>;
  json: unknown[];
}

function parseResult(result: CallToolResult): McpCallResult {
  const text: string[] = [];
  const json: unknown[] = [];
  const images: Array<{ data: string; mimeType: string }> = [];

  for (const item of result.content ?? []) {
    if (item.type === 'text') {
      text.push(item.text);
    } else if (item.type === 'json') {
      json.push(item.data);
    } else if (item.type === 'image') {
      images.push({ data: item.data, mimeType: item.mimeType });
    }
  }

  return { raw: result, text, images, json };
}

export class DevtoolsMcpClient {
  private transport: StdioClientTransport | null = null;
  private client: Client | null = null;

  public async connect(options: McpLaunchOptions = {}): Promise<void> {
    if (this.client) {
      return;
    }

    const args = ['-y', 'chrome-devtools-mcp@latest'];
    if (options.headless) {
      args.push('--headless');
    }
    if (options.isolated) {
      args.push('--isolated');
    }
    if (options.browserUrl) {
      args.push(`--browserUrl=${options.browserUrl}`);
    }
    if (options.channel) {
      args.push(`--channel=${options.channel}`);
    }
    if (options.viewport) {
      args.push(`--viewport=${options.viewport.width}x${options.viewport.height}`);
    }

    this.transport = new StdioClientTransport({
      command: 'npx',
      args,
      stderr: 'pipe'
    });
    this.client = new Client({ name: 'saul-quality-suite', version: '0.0.0-dev' }, {});

    await this.transport.start();
    await this.client.connect(this.transport);
  }

  public async dispose(): Promise<void> {
    await this.transport?.close();
    this.client = null;
    this.transport = null;
  }

  private async callTool(name: string, args: Record<string, unknown> = {}): Promise<McpCallResult> {
    if (!this.client) {
      throw new Error('MCP client not connected');
    }
    const result = await this.client.callTool({ name, arguments: args });
    return parseResult(result);
  }

  public async newPage(url: string, timeoutMs = 0): Promise<McpCallResult> {
    return this.callTool('new_page', { url, timeout: timeoutMs });
  }

  public async navigate(url: string, timeoutMs = 0): Promise<McpCallResult> {
    return this.callTool('navigate_page', { url, timeout: timeoutMs, type: 'url' });
  }

  public async reload(timeoutMs = 0): Promise<McpCallResult> {
    return this.callTool('navigate_page', { type: 'reload', timeout: timeoutMs });
  }

  public async waitFor(text: string, timeoutMs = 30000): Promise<McpCallResult> {
    return this.callTool('wait_for', { text, timeout: timeoutMs });
  }

  public async resize(width: number, height: number): Promise<McpCallResult> {
    return this.callTool('resize_page', { width, height });
  }

  public async emulate(options: { networkConditions?: string; cpuThrottlingRate?: number } = {}): Promise<McpCallResult> {
    return this.callTool('emulate', {
      networkConditions: options.networkConditions,
      cpuThrottlingRate: options.cpuThrottlingRate
    });
  }

  public async takeScreenshot(filePath?: string, options: { fullPage?: boolean } = {}): Promise<McpCallResult> {
    return this.callTool('take_screenshot', {
      filePath: filePath ? path.resolve(filePath) : undefined,
      fullPage: options.fullPage ?? false
    });
  }

  public async evaluateScript(fn: string, args: unknown[] = []): Promise<McpCallResult> {
    return this.callTool('evaluate_script', { function: fn, args });
  }

  public async listConsoleMessages(): Promise<McpCallResult> {
    return this.callTool('list_console_messages', { includePreservedMessages: true });
  }

  public async listNetworkRequests(): Promise<McpCallResult> {
    return this.callTool('list_network_requests', { includePreservedRequests: true });
  }

  public async getNetworkRequest(reqid?: number): Promise<McpCallResult> {
    return this.callTool('get_network_request', { reqid });
  }

  public async performanceStart(filePath?: string, options: { reload?: boolean; autoStop?: boolean } = {}): Promise<McpCallResult> {
    return this.callTool('performance_start_trace', {
      reload: options.reload ?? true,
      autoStop: options.autoStop ?? true,
      filePath: filePath ? path.resolve(filePath) : undefined
    });
  }

  public async performanceStop(filePath?: string): Promise<McpCallResult> {
    return this.callTool('performance_stop_trace', {
      filePath: filePath ? path.resolve(filePath) : undefined
    });
  }

  public async performanceAnalyze(insightName: string, insightSetId: string): Promise<McpCallResult> {
    return this.callTool('performance_analyze_insight', { insightName, insightSetId });
  }
}
