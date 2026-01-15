(function () {
  const config = window.__SAUL_CONFIG__ || {};
  const i18n = window.__SAUL_I18N__ || {};
  const statusEl = document.getElementById('reportStatus');
  const disabledEl = document.getElementById('reportsDisabled');
  const contentEl = document.getElementById('reportContent');

  const filterProject = document.getElementById('filterProject');
  const filterLanguage = document.getElementById('filterLanguage');
  const filterMachine = document.getElementById('filterMachine');
  const applyBtn = document.getElementById('applyFilters');
  const resetBtn = document.getElementById('resetFilters');

  const statToday = document.getElementById('statToday');

  const projectsList = document.getElementById('projectsList');
  const languagesList = document.getElementById('languagesList');
  const summariesList = document.getElementById('summariesList');

  function initI18n() {
    const disabledTitle = document.getElementById('disabledTitle');
    const disabledDetail = document.getElementById('disabledDetail');
    const filtersTitle = document.getElementById('filtersTitle');
    const labelProject = document.getElementById('labelProject');
    const labelLanguage = document.getElementById('labelLanguage');
    const labelMachine = document.getElementById('labelMachine');
    const todayTitle = document.getElementById('todayTitle');
    const projectsTitle = document.getElementById('projectsTitle');
    const languagesTitle = document.getElementById('languagesTitle');
    const summariesTitle = document.getElementById('summariesTitle');

    if (disabledTitle) disabledTitle.textContent = i18n.disabled || 'Reports disabled';
    if (disabledDetail) disabledDetail.textContent = i18n.disabledDetail || 'Enable settings to view data.';
    if (filtersTitle) filtersTitle.textContent = 'Filters';
    if (labelProject) labelProject.textContent = i18n.filterProject || 'Project';
    if (labelLanguage) labelLanguage.textContent = i18n.filterLanguage || 'Language';
    if (labelMachine) labelMachine.textContent = i18n.filterMachine || 'Machine';
    if (applyBtn) applyBtn.textContent = i18n.filterApply || 'Apply';
    if (resetBtn) resetBtn.textContent = i18n.filterClear || 'Clear';
    if (todayTitle) todayTitle.textContent = i18n.today || 'Today';
    if (projectsTitle) projectsTitle.textContent = i18n.projects || 'Projects';
    if (languagesTitle) languagesTitle.textContent = i18n.languages || 'Languages';
    if (summariesTitle) summariesTitle.textContent = i18n.summaries || 'Summaries';
  }

  initI18n();

  if (!config.enableReportsInVscode) {
    disabledEl.classList.remove('hidden');
    statusEl.textContent = i18n.disabled || 'Reports disabled.';
    return;
  }

  if (!config.apiBase || !config.pairingKey) {
    disabledEl.classList.remove('hidden');
    statusEl.textContent = i18n.configure || 'Configure daemon URL and pairing key.';
    return;
  }

  contentEl.classList.remove('hidden');

  applyBtn.addEventListener('click', () => void refresh());
  resetBtn.addEventListener('click', () => {
    filterProject.value = '';
    filterLanguage.value = '';
    filterMachine.value = '';
    void refresh();
  });

  void refresh();

  async function refresh() {
    statusEl.textContent = i18n.loading || 'Loading...';
    const params = {
      start: todayKey(),
      end: todayKey(),
      project: filterProject.value,
      language: filterLanguage.value,
      machine: filterMachine.value
    };

    console.log('[Saul Report] Config:', { apiBase: config.apiBase, hasPairingKey: !!config.pairingKey });
    console.log('[Saul Report] Fetching data with params:', params);

    try {
      const [dashboard, summaries, machines] = await Promise.all([
        fetchJson('/v1/vscode/dashboard', params),
        fetchJson('/v1/vscode/summaries', params),
        fetchJson('/v1/vscode/machines', params)
      ]);

      console.log('[Saul Report] Dashboard data:', dashboard?.data);

      const data = dashboard?.data || {};
      
      updateSelect(filterProject, data.projects || [], params.project);
      updateSelect(filterLanguage, data.languages || [], params.language);
      updateSelect(filterMachine, machines?.data || [], params.machine);

      statToday.textContent = data.overview?.humanReadableTotal || '--';
      
      renderIndex(data.overview?.index);

      renderList(projectsList, data.projects || []);
      renderList(languagesList, data.languages || []);
      renderSummaries(summariesList, summaries?.data?.days || []);
      
      renderList(document.getElementById('branchesList'), data.branches || []);
      renderActivity(data.activity || {}, data.git || {});
      renderEditorInfo(data.editor);
      renderWorkspaces(data.workspaces || []);
      renderHourlyChart(data.hourly || []);

      statusEl.textContent = i18n.synced || 'Synchronized.';
    } catch (error) {
      console.error('[Saul Report] Error loading data:', error);
      statusEl.textContent = `${i18n.error || 'Error loading data.'} ${error.message}`;
    }
  }

  async function fetchJson(path, params) {
    const url = new URL(path, config.apiBase);
    url.searchParams.set('key', config.pairingKey);
    Object.entries(params || {}).forEach(([key, value]) => {
      if (value) {
        url.searchParams.set(key, String(value));
      }
    });
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  }

  function updateSelect(select, data, current) {
    if (!select || !Array.isArray(data)) {
      return;
    }
    const existing = select.value;
    select.innerHTML = `<option value="">${i18n.filterAll || 'All'}</option>`;
    data.forEach((item) => {
      const option = document.createElement('option');
      option.value = item.name || item.id || '';
      option.textContent = item.name || item.id || '';
      select.appendChild(option);
    });
    select.value = current || existing || '';
  }

  function renderList(list, items) {
    list.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      const li = document.createElement('li');
      li.textContent = i18n.noData || 'No data.';
      list.appendChild(li);
      return;
    }
    items.slice(0, 8).forEach((item) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${item.name}</span><span>${formatSeconds(item.total_seconds)}</span>`;
      list.appendChild(li);
    });
  }

  function renderSummaries(list, days) {
    list.innerHTML = '';
    if (!Array.isArray(days) || !days.length) {
      const li = document.createElement('li');
      li.textContent = i18n.noRecords || 'No records.';
      list.appendChild(li);
      return;
    }
    days.forEach((day) => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${day.date}</span><span>${formatSeconds(day.total_seconds)}</span>`;
      list.appendChild(li);
    });
  }

  function formatSeconds(seconds) {
    if (!seconds || seconds === 0) {
      return '0m';
    }
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function renderActivity(activity, git) {
    const list = document.getElementById('activityList');
    if (!list) return;

    list.innerHTML = '';
    
    const items = [
      { label: 'Tab Switches', value: activity.totalTabSwitches || 0 },
      { label: 'Commits', value: git.totalCommits || 0 },
      { label: 'Files Changed', value: git.totalFilesChanged || 0 },
      { label: 'Lines Added', value: git.totalLinesAdded || 0, color: '#22c55e' },
      { label: 'Lines Deleted', value: git.totalLinesDeleted || 0, color: '#ef4444' }
    ];

    items.forEach(item => {
      const li = document.createElement('li');
      const valueSpan = item.color 
        ? `<span style="color: ${item.color}">${item.value}</span>` 
        : `<span>${item.value}</span>`;
      li.innerHTML = `<span>${item.label}</span>${valueSpan}`;
      list.appendChild(li);
    });
  }

  function renderEditorInfo(editor) {
    const container = document.getElementById('editorInfo');
    if (!container) return;

    if (!editor) {
      container.innerHTML = '<p>No editor metadata available</p>';
      return;
    }

    container.innerHTML = `
      <ul class="data-list">
        <li><span>VS Code Version</span><span>${editor.vscodeVersion || 'unknown'}</span></li>
        <li><span>Extensions</span><span>${editor.extensionsCount || 0}</span></li>
        <li><span>Theme</span><span>${editor.themeKind || 'unknown'}</span></li>
        <li><span>Workspace Type</span><span>${editor.workspaceType || 'empty'}</span></li>
      </ul>
    `;
  }

  function renderWorkspaces(workspaces) {
    const list = document.getElementById('workspacesList');
    if (!list) return;

    list.innerHTML = '';
    
    if (!workspaces.length) {
      const li = document.createElement('li');
      li.textContent = 'No workspaces tracked';
      list.appendChild(li);
      return;
    }

    workspaces.forEach(ws => {
      const li = document.createElement('li');
      li.innerHTML = `<span>${ws.name}</span><span>${ws.totalFiles || 0} files</span>`;
      list.appendChild(li);
    });
  }

  function renderHourlyChart(hourlyData) {
    const canvas = document.getElementById('hourlyChart');
    const emptyEl = document.getElementById('hourlyEmpty');
    
    if (!canvas || !hourlyData || hourlyData.length === 0) {
      if (canvas) canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    const totalSeconds = hourlyData.reduce((sum, h) => sum + (h.total || 0), 0);
    if (totalSeconds === 0) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    canvas.style.display = 'block';
    if (emptyEl) emptyEl.classList.add('hidden');

    const labels = hourlyData.map(h => `${String(h.hour).padStart(2, '0')}h`);
    const codingMinutes = hourlyData.map(h => Math.round((h.coding || 0) / 60));
    const debuggingMinutes = hourlyData.map(h => Math.round((h.debugging || 0) / 60));
    const buildingMinutes = hourlyData.map(h => Math.round((h.building || 0) / 60));
    const testingMinutes = hourlyData.map(h => Math.round((h.testing || 0) / 60));

    if (window.hourlyChartInstance) {
      window.hourlyChartInstance.destroy();
    }

    const ctx = canvas.getContext('2d');
    window.hourlyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Coding',
            data: codingMinutes,
            backgroundColor: '#2563eb',
            borderColor: '#1e40af',
            borderWidth: 1
          },
          {
            label: 'Debugging',
            data: debuggingMinutes,
            backgroundColor: '#f97316',
            borderColor: '#ea580c',
            borderWidth: 1
          },
          {
            label: 'Building',
            data: buildingMinutes,
            backgroundColor: '#059669',
            borderColor: '#047857',
            borderWidth: 1
          },
          {
            label: 'Testing',
            data: testingMinutes,
            backgroundColor: '#7c3aed',
            borderColor: '#6d28d9',
            borderWidth: 1
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
            ticks: { color: '#1f2937', font: { size: 11, weight: '500' } }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: '#d1d5db' },
            ticks: { color: '#1f2937', font: { size: 11, weight: '500' } },
            title: { display: true, text: 'Minutes', color: '#111827', font: { size: 12, weight: 'bold' } }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: { 
              color: '#111827', 
              font: { size: 12, weight: '600' }, 
              usePointStyle: true,
              padding: 15
            }
          },
          tooltip: {
            backgroundColor: 'rgba(17, 24, 39, 0.95)',
            titleColor: '#fff',
            bodyColor: '#fff',
            borderColor: '#374151',
            borderWidth: 1,
            padding: 12,
            displayColors: true,
            callbacks: {
              label: function(context) {
                return `${context.dataset.label}: ${context.parsed.y} min`;
              }
            }
          }
        }
      }
    });
  }

  function renderIndex(index) {
    const indexValueEl = document.getElementById('indexValue');
    if (!indexValueEl) return;
    
    if (typeof index !== 'number') {
      indexValueEl.textContent = '--';
      indexValueEl.className = 'index-value';
      return;
    }

    indexValueEl.textContent = index.toString();
    indexValueEl.classList.remove('good', 'warn', 'alert');
    
    if (index <= 25) {
      indexValueEl.classList.add('good');
    } else if (index <= 50) {
      indexValueEl.classList.add('warn');
    } else if (index >= 70) {
      indexValueEl.classList.add('alert');
    }
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }
})();
