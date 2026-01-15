const vscode = require('vscode');

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
    this.GIT_INIT_GRACE_PERIOD_MS = 30000;
  }

  async start() {
    this.dispose();
    
    try {
      const gitExtension = vscode.extensions.getExtension('vscode.git');
      if (!gitExtension) {
        console.log('[Saul Git] Git extension not found');
        return;
      }

      if (!gitExtension.isActive) {
        await gitExtension.activate();
      }

      this.gitExtension = gitExtension.exports;
      const git = this.gitExtension.getAPI(1);

      this.disposables.push(
        git.onDidOpenRepository((repo) => {
          this.trackRepository(repo);
          this.watchRepository(repo);
        }),
        git.onDidCloseRepository((repo) => {
          const key = this.getRepoKey(repo);
          this.repositories.delete(key);
        })
      );

      git.repositories.forEach((repo) => {
        this.trackRepository(repo);
        this.watchRepository(repo);
      });
    } catch (error) {
      console.error('[Saul Git] Failed to initialize:', error);
    }
  }

  dispose() {
    this.disposables.forEach((item) => item.dispose());
    this.disposables = [];
    this.repositories.clear();
    this.repoInitTimestamps.clear();
    this.lastDiffStatsCache.clear();
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
    const branch = repo.state?.HEAD?.name || 'unknown';
    
    if (!this.repoInitTimestamps.has(repoPath)) {
      this.repoInitTimestamps.set(repoPath, Date.now());
    }

    if (this.shouldFilterUnknownBranch(repoPath, branch)) {
      console.log('[Saul Git] Skipping heartbeat with unknown branch during init grace period');
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
      repo.state.onDidChange(() => {
        this.trackRepositoryState(repo);
        
        const currentCommit = repo.state?.HEAD?.commit || null;
        if (currentCommit && currentCommit !== lastCommit) {
          const message = repo.state?.HEAD?.commit || '';
          this.trackCommit(repo, message);
          lastCommit = currentCommit;
        }
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
    const branch = repo.state?.HEAD?.name || 'unknown';

    if (this.shouldFilterUnknownBranch(repoPath, branch)) {
      console.log('[Saul Git] Skipping state heartbeat with unknown branch during init grace period');
      return;
    }

    const remote = repo.state?.HEAD?.upstream?.remote || '';
    const ahead = repo.state?.HEAD?.ahead || 0;
    const behind = repo.state?.HEAD?.behind || 0;
    const workingTreeChanges = repo.state?.workingTreeChanges?.length || 0;
    const indexChanges = repo.state?.indexChanges?.length || 0;

    if ((workingTreeChanges > 0 || indexChanges > 0) && indexChanges > 0) {
      const diffStats = await this.getDiffStats(repo);
      this.lastDiffStatsCache.set(repoPath, diffStats);
      console.log('[Saul Git] Cached diff stats before commit:', diffStats);
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
    const branch = repo.state?.HEAD?.name || 'unknown';

    if (this.shouldFilterUnknownBranch(repoPath, branch)) {
      console.log('[Saul Git] Skipping commit heartbeat with unknown branch during init grace period');
      return;
    }

    const remote = repo.state?.HEAD?.upstream?.remote || '';
    
    const cachedStats = this.lastDiffStatsCache.get(repoPath);
    const diffStats = cachedStats || { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    
    if (cachedStats) {
      this.lastDiffStatsCache.delete(repoPath);
      console.log('[Saul Git] Using cached diff stats for commit:', diffStats);
    } else {
      console.warn('[Saul Git] No cached diff stats found, using zeros');
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
        for (const change of indexChanges) {
          try {
            const patch = await repo.diffIndexWithHEAD(change.uri.fsPath);
            if (patch) {
              const lines = patch.split('\n');
              for (const line of lines) {
                if (line.startsWith('+') && !line.startsWith('+++')) {
                  linesAdded++;
                } else if (line.startsWith('-') && !line.startsWith('---')) {
                  linesDeleted++;
                }
              }
            }
          } catch (err) {
            console.warn('[Saul Git] Could not get patch for file:', change.uri?.fsPath || 'unknown');
          }
        }
      }

      console.log('[Saul Git] Diff stats:', { filesChanged, linesAdded, linesDeleted });
      return { filesChanged, linesAdded, linesDeleted };
    } catch (error) {
      console.warn('[Saul Git] Could not get diff stats:', error.message);
      return { filesChanged: 0, linesAdded: 0, linesDeleted: 0 };
    }
  }
}

module.exports = {
  GitTracker
};
