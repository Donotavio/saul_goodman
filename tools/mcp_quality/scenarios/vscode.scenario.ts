import fs from 'node:fs';
import path from 'node:path';
import type { ScenarioContext, ScenarioResult } from './types.js';

export async function runVscodeScenario(
  _client: unknown,
  ctx: ScenarioContext
): Promise<ScenarioResult> {
  const errors: string[] = [];
  const warnings: string[] = [];
  const details: string[] = [];

  const root = path.resolve('.');
  const vsDir = path.join(root, 'vscode-extension');

  const pkgPath = path.join(vsDir, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return {
      name: 'vscode',
      viewport: ctx.viewportName,
      passed: false,
      errors: ['package.json da extensão VSCode não encontrado.'],
      warnings
    };
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const activation = pkg.activationEvents ?? [];
  const commands = pkg.contributes?.commands ?? [];
  const commandIds = commands.map((c: { command: string }) => c.command);

  if (!activation.includes('onCommand:saulGoodman.startDaemon')) {
    errors.push('Activation event onCommand:saulGoodman.startDaemon ausente.');
  }
  if (!commandIds.includes('saulGoodman.startDaemon')) {
    errors.push('Comando saulGoodman.startDaemon não encontrado em contributes.commands.');
  }

  const vsixFiles = fs
    .readdirSync(vsDir)
    .filter((file) => file.endsWith('.vsix'))
    .sort();
  if (vsixFiles.length === 0) {
    warnings.push('Nenhum arquivo .vsix encontrado para a extensão VSCode.');
  } else {
    details.push(`VSIX encontrado: ${vsixFiles[vsixFiles.length - 1]}`);
  }

  if (ctx.daemon) {
    // Opcional: testar comunicação com daemon usando a pairing key
    try {
      const res = await fetch(`${ctx.daemon.origin}/v1/tracking/vscode/summary?key=${encodeURIComponent(ctx.daemon.key)}`);
      if (!res.ok) {
        errors.push(`Daemon respondeu ${res.status} em /v1/tracking/vscode/summary.`);
      } else {
        const data = await res.json();
        details.push(`Daemon summary totalActiveMs=${data?.totalActiveMs ?? 0}`);
      }
    } catch (error) {
      errors.push(`Falha ao contatar daemon: ${(error as Error).message}`);
    }
  } else {
    warnings.push('Daemon não disponível no contexto para teste VSCode.');
  }

  return {
    name: 'vscode',
    viewport: ctx.viewportName,
    passed: errors.length === 0,
    errors,
    warnings,
    details
  };
}
