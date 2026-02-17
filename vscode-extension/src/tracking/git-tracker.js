const vscode = require('vscode');
const GIT_DEBUG = process.env.SAUL_DEBUG_GIT === '1';

function gitDebug(message, payload) {
  if (!GIT_DEBUG) {
    return;
  }
  if (payload === undefined) {
    console.debug(`[Saul Git] ${message}`);
    return;
  }
  console.debug(`[Saul Git] ${message}`, payload);
}

function errorMessage(error) {
  if (!error || typeof error !== 'object') {
    return String(error || 'unknown error');
  }
  return error.message || String(error);
}

class GitTracker {
  constructor(options) {
    this.context = options.context;
    this.queue = options.queue;
    this.getConfig = options.getConfig;
    this.buildHeartbeat = options.buildHeartbeat;
    this.disposables = [];
    this.gitExtension = null;
    this.repositories = new Map();
    this.repoInitTimestamps = new Map();
    this.lastDiffStatsCache = new Map();
    this.processedCommits = new Set();
    this.GIT_INIT_GRACE_PERIOD_MS = 30000;
  }

  async start() {
    this.dispose();
    
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        console.warn('[Saul Git] Git extension not found');
        return;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitExtension = gitExtension.exports;
      const git = this.gitExtension.getAPI(1);

      this.disposables.push(
        git.onDidOpenRepository((repo) => {
          try {
            this.trackRepository(repo);
            this.watchRepository(repo);
          } catch (error) {
            console.error('[Saul Git] Open repository error:', errorMessage(error));
          }
        }),
        git.onDidCloseRepository((repo) => {
          try {
            const key = this.getRepoKey(repo);
            this.repositories.delete(key);
          } catch (error) {
            console.error('[Saul Git] Close repository error:', errorMessage(error));
          }
        })
      );

      git.repositories.forEach((repo) => {
        try {
          this.trackRepository(repo);
          this.watchRepository(repo);
        } catch (error) {
          console.error('[Saul Git] Repository iteration error:', errorMessage(error));
        }
      });
    } catch (error) {
      console.error('[Saul Git] Failed to initialize:', errorMessage(error));
    }
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
    
    // VSCODE-008: Dispose repository-specific listeners
    this.repositories.forEach(({ disposables }) => {
      if (disposables && Array.isArray(disposables)) {
        disposables.forEach(d => {
          if (d && typeof d.dispose === 'function') {
            d.dispose();
          }
        });
      }
    });
    this.repositories.clear();
    
    this.repoInitTimestamps.clear();
    this.lastDiffStatsCache.clear();
    this.processedCommits.clear(); // VSCODE-015: Clear processed commits
  }

  getRepoKey(repo) {
    return repo.rootUri?.fsPath || 'unknown';
  }

  shouldFilterUnknownBranch(repoKey, branch) {
    if (branch !== 'unknown') {
      return false;
    }
    const initTime = this.repoInitTimestamps.get(repoKey);
    if (!initTime) {
      return false;
    }
    const elapsed = Date.now() - initTime;
    return elapsed < this.GIT_INIT_GRACE_PERIOD_MS;
  }

  trackRepository(repo) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const repoPath = this.getRepoKey(repo);
    const branch = repo.state?.HEAD?.name || '';
    
    if (!this.repoInitTimestamps.has(repoPath)) {
      this.repoInitTimestamps.set(repoPath, Date.now());
    }

    if (!branch || branch === 'unknown') {
      gitDebug('Skipping repository heartbeat with unknown branch');
      return;
    }

    const remote = repo.state?.HEAD?.upstream?.remote || '';
    const ahead = repo.state?.HEAD?.ahead || 0;
    const behind = repo.state?.HEAD?.behind || 0;

    const heartbeat = this.buildHeartbeat({
      entityType: 'repository',
      entity: repoPath,
      category: 'coding',
      isWrite: false,
      metadata: {
        branch,
        remote,
        ahead,
        behind,
        eventType: 'repository_opened'
      }
    });

    this.queue.enqueue(heartbeat);
  }

  watchRepository(repo) {
    const repoKey = this.getRepoKey(repo);
    
    if (this.repositories.has(repoKey)) {
      return;
    }

    const disposables = [];
    let lastCommit = repo.state?.HEAD?.commit || null;

    disposables.push(
      repo.state.onDidChange(async () => {
        const currentCommit = repo.state?.HEAD?.commit || null;
        const isNewCommit = currentCommit && currentCommit !== lastCommit;
        
        if (isNewCommit) {
          const repoPath = this.getRepoKey(repo);
          const indexChanges = repo.state?.indexChanges?.length || 0;
          
          if (indexChanges === 0 && !this.lastDiffStatsCache.has(repoPath)) {
            gitDebug('Commit detected without cached diff stats');
            try {
              const diffStats = await this.getDiffStatsFromLastCommit(repo);
              if (diffStats && diffStats.filesChanged > 0) {
                this.lastDiffStatsCache.set(repoPath, diffStats);
                gitDebug('Recovered diff stats from previous commit', diffStats);
              } else {
                console.warn('[Saul Git] Commit diff stats unavailable; skipping commit tracking');
                lastCommit = currentCommit;
                this.trackRepositoryState(repo);
                return;
              }
            } catch (err) {
              console.warn(
                '[Saul Git] Failed to get commit diff stats; skipping commit tracking:',
                errorMessage(err)
              );
              lastCommit = currentCommit;
              this.trackRepositoryState(repo);
              return;
            }
          }
          
          const message = repo.state?.HEAD?.commit || '';
          this.trackCommit(repo, message);
          lastCommit = currentCommit;
        }
        
        this.trackRepositoryState(repo);
      })
    );

    this.repositories.set(repoKey, { repo, disposables, lastCommit });
  }

  async trackRepositoryState(repo) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const repoPath = this.getRepoKey(repo);
    const branch = repo.state?.HEAD?.name || '';

    if (!branch || branch === 'unknown') {
      gitDebug('Skipping repository-state heartbeat with unknown branch');
      return;
    }

    const remote = repo.state?.HEAD?.upstream?.remote || '';
    const ahead = repo.state?.HEAD?.ahead || 0;
    const behind = repo.state?.HEAD?.behind || 0;
    const workingTreeChanges = repo.state?.workingTreeChanges?.length || 0;
    const indexChanges = repo.state?.indexChanges?.length || 0;

    if (indexChanges > 0) {
      const diffStats = await this.getDiffStats(repo);
      this.lastDiffStatsCache.set(repoPath, diffStats);
      gitDebug('Cached repository diff stats', diffStats);
    }

    const heartbeat = this.buildHeartbeat({
      entityType: 'repository',
      entity: repoPath,
      category: 'coding',
      isWrite: workingTreeChanges > 0 || indexChanges > 0,
      metadata: {
        branch,
        remote,
        ahead,
        behind,
        workingTreeChanges,
        indexChanges,
        eventType: 'repository_state_changed'
      }
    });

    this.queue.enqueue(heartbeat);
  }

  async trackCommit(repo, message) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const repoPath = this.getRepoKey(repo);
    const commitHash = repo.state?.HEAD?.commit || '';
    const commitKey = `${repoPath}:${commitHash}`;
    
    if (this.processedCommits.has(commitKey)) {
      gitDebug('Skipping duplicate commit tracking');
      return;
    }
    
    this.processedCommits.add(commitKey);
    // VSCODE-015: More aggressive pruning - max 50 instead of 100
    if (this.processedCommits.size > 50) {
      const oldestKeys = Array.from(this.processedCommits).slice(0, 25);
      oldestKeys.forEach(key => this.processedCommits.delete(key));
      gitDebug('Pruned old commit records', { removed: oldestKeys.length });
    }

    const branch = repo.state?.HEAD?.name || '';

    if (!branch || branch === 'unknown') {
      gitDebug('Skipping commit heartbeat with unknown branch');
      return;
    }

    const remote = repo.state?.HEAD?.upstream?.remote || '';
    
    const cachedStats = this.lastDiffStatsCache.get(repoPath);
    const diffStats = cachedStats || { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    
    if (cachedStats) {
      this.lastDiffStatsCache.delete(repoPath);
      gitDebug('Using cached commit diff stats', diffStats);
    } else {
      console.warn('[Saul Git] Commit diff stats not found; using zeros');
    }

    const heartbeat = this.buildHeartbeat({
      entityType: 'commit',
      entity: repoPath,
      category: 'coding',
      isWrite: true,
      metadata: {
        branch,
        remote,
        commitMessage: message?.substring(0, 100) || '',
        eventType: 'commit_created',
        filesChanged: diffStats.filesChanged,
        linesAdded: diffStats.linesAdded,
        linesDeleted: diffStats.linesDeleted
      }
    });

    gitDebug('Commit heartbeat metadata', {
      filesChanged: heartbeat.metadata.filesChanged,
      linesAdded: heartbeat.metadata.linesAdded,
      linesDeleted: heartbeat.metadata.linesDeleted
    });

    this.queue.enqueue(heartbeat);
  }

  async getDiffStats(repo) {
    try {
      const indexChanges = repo.state?.indexChanges || [];
      const workingTreeChanges = repo.state?.workingTreeChanges || [];
      
      const allChanges = [...new Set([...indexChanges, ...workingTreeChanges])];
      const filesChanged = allChanges.length;

      let linesAdded = 0;
      let linesDeleted = 0;

      if (filesChanged > 0) {
        gitDebug('Processing staged files for diff stats', { stagedFiles: indexChanges.length });
        
        for (const change of indexChanges) {
          try {
            const filePath = change.uri?.fsPath || change.uri;
            
            const patch = await repo.diffIndexWithHEAD(filePath);
            
            if (!patch) {
              continue;
            }
            
            const lines = patch.split(/\r?\n/);
            
            for (const line of lines) {
              if (line.startsWith('+') && !line.startsWith('+++')) {
                linesAdded++;
              } else if (line.startsWith('-') && !line.startsWith('---')) {
                linesDeleted++;
              }
            }
          } catch (err) {
            console.warn('[Saul Git] Could not calculate patch diff for one staged file');
          }
        }
      }

      gitDebug('Final diff stats', { filesChanged, linesAdded, linesDeleted });
      return { filesChanged, linesAdded, linesDeleted };
    } catch (error) {
      console.warn('[Saul Git] Could not get diff stats:', errorMessage(error));
      return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    }
  }

  async getDiffStatsFromLastCommit(repo) {
    try {
      const patch = await repo.diffWith('HEAD~1', 'HEAD');
      
      if (!patch) {
        console.warn('[Saul Git] Last-commit patch unavailable; returning zeros');
        return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
      }

      const lines = patch.split(/\r?\n/);
      let linesAdded = 0;
      let linesDeleted = 0;
      let filesChanged = 0;

      for (const line of lines) {
        if (line.startsWith('diff --git')) {
          filesChanged++;
        } else if (line.startsWith('+') && !line.startsWith('+++')) {
          linesAdded++;
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          linesDeleted++;
        }
      }

      gitDebug('Retrieved diff stats from last commit', { filesChanged, linesAdded, linesDeleted });
      return { filesChanged, linesAdded, linesDeleted };
    } catch (error) {
      console.warn('[Saul Git] Could not get diff from previous commit:', errorMessage(error));
      return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    }
  }
}

module.exports = {
  GitTracker
};
