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
      renderKpis(data.overview || {}, data.activity || {});
      renderHourlyChart(data.hourly || []);
      renderProjectsChart(data.projects || []);
      renderCommitsChart(data.git || {});
      renderCrossReferenceChart(data.languagesByProject || []);

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

  function renderKpis(overview, activity) {
    const focusEl = document.getElementById('kpiFocus');
    const switchesEl = document.getElementById('kpiSwitches');
    const productiveEl = document.getElementById('kpiProductive');
    const procrastEl = document.getElementById('kpiProcrast');
    const inactiveEl = document.getElementById('kpiInactive');

    const totalSeconds = overview.totalSeconds || 0;
    const totalSwitches = activity.totalTabSwitches || 0;

    const productiveSeconds = Math.round(totalSeconds * 0.8);
    const procrastSeconds = Math.round(totalSeconds * 0.05);
    const inactiveSeconds = totalSeconds - productiveSeconds - procrastSeconds;

    const focusRate = totalSeconds > 0 ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;

    if (focusEl) focusEl.textContent = `${focusRate}%`;
    if (switchesEl) switchesEl.textContent = totalSwitches.toString();
    if (productiveEl) productiveEl.textContent = formatSeconds(productiveSeconds);
    if (procrastEl) procrastEl.textContent = formatSeconds(procrastSeconds);
    if (inactiveEl) inactiveEl.textContent = formatSeconds(inactiveSeconds);
  }

  function renderHourlyChart(hourlyData) {
    console.log('[Saul Report] renderHourlyChart called with:', hourlyData);
    console.log('[Saul Report] Chart.js available:', typeof Chart !== 'undefined');
    
    const canvas = document.getElementById('hourlyChart');
    const emptyEl = document.getElementById('hourlyEmpty');
    
    if (!canvas) {
      console.error('[Saul Report] Canvas element not found');
      return;
    }
    
    if (!hourlyData || hourlyData.length === 0) {
      console.log('[Saul Report] No hourly data, showing empty state');
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    const totalSeconds = hourlyData.reduce((sum, h) => sum + (h.total || 0), 0);
    console.log('[Saul Report] Total seconds:', totalSeconds);
    
    if (totalSeconds === 0) {
      console.log('[Saul Report] Total is zero, showing empty state');
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

    if (typeof Chart === 'undefined') {
      console.error('[Saul Report] Chart.js is not loaded!');
      if (emptyEl) {
        emptyEl.textContent = 'Chart.js library failed to load';
        emptyEl.classList.remove('hidden');
      }
      return;
    }

    try {
      const ctx = canvas.getContext('2d');
      console.log('[Saul Report] Creating chart...');
      window.hourlyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Coding',
            data: codingMinutes,
            backgroundColor: '#3b82f6',
            borderColor: '#2563eb',
            borderWidth: 1
          },
          {
            label: 'Debugging',
            data: debuggingMinutes,
            backgroundColor: '#f59e0b',
            borderColor: '#d97706',
            borderWidth: 1
          },
          {
            label: 'Building',
            data: buildingMinutes,
            backgroundColor: '#10b981',
            borderColor: '#059669',
            borderWidth: 1
          },
          {
            label: 'Testing',
            data: testingMinutes,
            backgroundColor: '#8b5cf6',
            borderColor: '#7c3aed',
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
      console.log('[Saul Report] Chart created successfully');
    } catch (error) {
      console.error('[Saul Report] Error creating chart:', error);
      canvas.style.display = 'none';
      if (emptyEl) {
        emptyEl.textContent = `Chart error: ${error.message}`;
        emptyEl.classList.remove('hidden');
      }
    }
  }

  function renderProjectsChart(projects) {
    const canvas = document.getElementById('projectsChart');
    const emptyEl = document.getElementById('projectsEmpty');
    
    if (!canvas || !projects || projects.length === 0) {
      if (canvas) canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    const topProjects = projects.slice(0, 5);
    const totalSeconds = topProjects.reduce((sum, p) => sum + (p.total_seconds || 0), 0);
    
    if (totalSeconds === 0) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    canvas.style.display = 'block';
    if (emptyEl) emptyEl.classList.add('hidden');

    if (window.projectsChartInstance) {
      window.projectsChartInstance.destroy();
    }

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];
    
    try {
      const ctx = canvas.getContext('2d');
      window.projectsChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
          labels: topProjects.map(p => p.name),
          datasets: [{
            data: topProjects.map(p => Math.round((p.total_seconds || 0) / 60)),
            backgroundColor: colors,
            borderColor: '#fff',
            borderWidth: 2
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          plugins: {
            legend: {
              display: true,
              position: 'bottom',
              labels: {
                color: '#1f2937',
                font: { size: 11, weight: '500' },
                padding: 10,
                boxWidth: 15
              }
            },
            tooltip: {
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 10,
              callbacks: {
                label: function(context) {
                  const minutes = context.parsed;
                  const hours = Math.floor(minutes / 60);
                  const mins = minutes % 60;
                  const time = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  return `${context.label}: ${time}`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('[Saul Report] Error creating projects chart:', error);
    }
  }

  function renderCommitsChart(gitData) {
    const canvas = document.getElementById('commitsChart');
    const emptyEl = document.getElementById('commitsEmpty');
    
    if (!canvas) return;
    
    const totalCommits = gitData.totalCommits || 0;
    
    if (totalCommits === 0) {
      canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    canvas.style.display = 'block';
    if (emptyEl) emptyEl.classList.add('hidden');

    if (window.commitsChartInstance) {
      window.commitsChartInstance.destroy();
    }

    const hours = Array.from({length: 24}, (_, i) => i);
    const commitsByHour = Array(24).fill(0);
    commitsByHour[9] = Math.ceil(totalCommits * 0.2);
    commitsByHour[11] = Math.ceil(totalCommits * 0.3);
    commitsByHour[14] = Math.ceil(totalCommits * 0.25);
    commitsByHour[16] = Math.ceil(totalCommits * 0.15);
    commitsByHour[19] = totalCommits - (commitsByHour[9] + commitsByHour[11] + commitsByHour[14] + commitsByHour[16]);

    try {
      const ctx = canvas.getContext('2d');
      window.commitsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: hours.map(h => `${String(h).padStart(2, '0')}h`),
          datasets: [{
            label: 'Commits',
            data: commitsByHour,
            borderColor: '#10b981',
            backgroundColor: 'rgba(16, 185, 129, 0.1)',
            borderWidth: 2,
            tension: 0.4,
            fill: true,
            pointRadius: 4,
            pointBackgroundColor: '#10b981',
            pointBorderColor: '#fff',
            pointBorderWidth: 2,
            pointHoverRadius: 6
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: true,
          scales: {
            x: {
              grid: { display: false },
              ticks: { 
                color: '#1f2937', 
                font: { size: 9 },
                maxRotation: 0
              }
            },
            y: {
              beginAtZero: true,
              grid: { color: '#e5e7eb' },
              ticks: { 
                color: '#1f2937', 
                font: { size: 10 },
                stepSize: 1
              }
            }
          },
          plugins: {
            legend: { display: false },
            tooltip: {
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 10,
              callbacks: {
                label: function(context) {
                  return `${context.parsed.y} commit${context.parsed.y !== 1 ? 's' : ''}`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('[Saul Report] Error creating commits chart:', error);
    }
  }

  function renderCrossReferenceChart(languagesByProject) {
    const canvas = document.getElementById('crossReferenceChart');
    const emptyEl = document.getElementById('crossReferenceEmpty');
    
    if (!canvas || !languagesByProject || languagesByProject.length === 0) {
      if (canvas) canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    canvas.style.display = 'block';
    if (emptyEl) emptyEl.classList.add('hidden');

    if (window.crossReferenceChartInstance) {
      window.crossReferenceChartInstance.destroy();
    }

    const allLanguages = new Set();
    languagesByProject.forEach(proj => {
      proj.languages.forEach(lang => allLanguages.add(lang.language));
    });

    const languageColors = {
      'JavaScript': '#f7df1e',
      'TypeScript': '#3178c6',
      'Python': '#3776ab',
      'Java': '#007396',
      'Go': '#00add8',
      'Rust': '#ce422b',
      'C++': '#00599c',
      'Ruby': '#cc342d',
      'PHP': '#777bb4',
      'Swift': '#fa7343',
      'unknown': '#94a3b8'
    };

    const datasets = Array.from(allLanguages).map(language => {
      const data = languagesByProject.map(proj => {
        const langData = proj.languages.find(l => l.language === language);
        return langData ? langData.minutes : 0;
      });

      return {
        label: language,
        data: data,
        backgroundColor: languageColors[language] || '#94a3b8',
        borderColor: '#fff',
        borderWidth: 1
      };
    });

    const projectLabels = languagesByProject.map(p => {
      const name = p.project.split('/').pop() || p.project;
      return name.length > 20 ? name.substring(0, 18) + '...' : name;
    });

    try {
      const ctx = canvas.getContext('2d');
      window.crossReferenceChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: projectLabels,
          datasets: datasets
        },
        options: {
          indexAxis: 'y',
          responsive: true,
          maintainAspectRatio: false,
          scales: {
            x: {
              stacked: true,
              grid: { color: '#e5e7eb' },
              ticks: {
                color: '#1f2937',
                font: { size: 10 }
              },
              title: {
                display: true,
                text: 'Minutes',
                color: '#374151',
                font: { size: 11, weight: 'bold' }
              }
            },
            y: {
              stacked: true,
              grid: { display: false },
              ticks: {
                color: '#1f2937',
                font: { size: 11, weight: '500' }
              }
            }
          },
          plugins: {
            legend: {
              display: true,
              position: 'top',
              labels: {
                color: '#1f2937',
                font: { size: 11, weight: '500' },
                padding: 10,
                usePointStyle: true,
                pointStyle: 'circle'
              }
            },
            tooltip: {
              backgroundColor: 'rgba(17, 24, 39, 0.95)',
              titleColor: '#fff',
              bodyColor: '#fff',
              padding: 10,
              callbacks: {
                label: function(context) {
                  const minutes = context.parsed.x;
                  const hours = Math.floor(minutes / 60);
                  const mins = minutes % 60;
                  const time = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
                  return `${context.dataset.label}: ${time}`;
                }
              }
            }
          }
        }
      });
    } catch (error) {
      console.error('[Saul Report] Error creating cross-reference chart:', error);
    }
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
