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
  }

  getRepoKey(repo) {
    return repo.rootUri?.fsPath || 'unknown';
  }

  trackRepository(repo) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const repoPath = this.getRepoKey(repo);
    const branch = repo.state?.HEAD?.name || 'unknown';
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

    disposables.push(
      repo.state.onDidChange(() => {
        this.trackRepositoryState(repo);
      })
    );

    this.repositories.set(repoKey, { repo, disposables });
  }

  trackRepositoryState(repo) {
    const config = this.getConfig();
    if (!config.enableTracking) {
      return;
    }

    const repoPath = this.getRepoKey(repo);
    const branch = repo.state?.HEAD?.name || 'unknown';
    const remote = repo.state?.HEAD?.upstream?.remote || '';
    const ahead = repo.state?.HEAD?.ahead || 0;
    const behind = repo.state?.HEAD?.behind || 0;
    const workingTreeChanges = repo.state?.workingTreeChanges?.length || 0;
    const indexChanges = repo.state?.indexChanges?.length || 0;

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
    const remote = repo.state?.HEAD?.upstream?.remote || '';

    const heartbeat = this.buildHeartbeat({
      entityType: 'commit',
      entity: repoPath,
      category: 'coding',
      isWrite: true,
      metadata: {
        branch,
        remote,
        commitMessage: message?.substring(0, 100) || '',
        eventType: 'commit_created'
      }
    });

    this.queue.enqueue(heartbeat);
  }
}

module.exports = {
  GitTracker
};
