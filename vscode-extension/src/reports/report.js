(function () {
  const config = window.__SAUL_CONFIG__ || {};
  const i18n = window.__SAUL_I18N__ || {};
  const statusEl = document.getElementById('reportStatus');
  const disabledEl = document.getElementById('reportsDisabled');
  const contentEl = document.getElementById('reportContent');

  let terminalChart = null;
  let focusChart = null;
  let comboTimelineChart = null;

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

  function renderComboTimelineChart(comboData) {
    const canvas = document.getElementById('comboTimelineChart');
    const emptyEl = document.getElementById('comboTimelineEmpty');
    if (!canvas) return;

    if (comboTimelineChart) {
      comboTimelineChart.destroy();
      comboTimelineChart = null;
    }

    const timeline = comboData.comboTimeline || [];
    
    console.log('[Saul Report] Combo timeline events:', timeline.length);

    if (timeline.length === 0) {
      canvas.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    // Processar eventos da timeline
    const dataPoints = timeline.map(event => ({
      x: new Date(event.timestamp),
      y: event.pomodoros || 0,
      level: event.level || 0,
      eventType: event.eventType
    }));

    // Adicionar ponto no início do dia se necessário
    if (dataPoints.length > 0) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (dataPoints[0].x > today) {
        dataPoints.unshift({
          x: today,
          y: 0,
          level: 0,
          eventType: 'day_start'
        });
      }
    }

    // Cores por nível
    const levelColors = {
      0: '#6B7280',
      1: '#FFC857',
      2: '#F59E0B',
      3: '#EF4444',
      4: '#A855F7',
      5: '#FFD700'
    };

    // Criar dataset único com stepped line
    const dataset = {
      data: dataPoints,
      borderColor: '#FFD700',
      backgroundColor: '#FFD700',
      pointBackgroundColor: dataPoints.map(p => levelColors[p.level] || levelColors[0]),
      pointBorderColor: '#fff',
      pointRadius: dataPoints.map(p => p.eventType === 'combo_reset' ? 8 : 5),
      pointStyle: dataPoints.map(p => p.eventType === 'combo_reset' ? 'crossRot' : 'circle'),
      fill: false,
      stepped: 'before',
      tension: 0,
      segment: {
        borderColor: (ctx) => {
          const fromIndex = ctx.p0DataIndex;
          const point = dataPoints[fromIndex];
          return levelColors[point?.level || 0];
        }
      }
    };

    comboTimelineChart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: [dataset]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: (context) => {
                if (!context || context.length === 0) return '';
                const date = new Date(context[0].parsed.x);
                return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
              },
              label: (context) => {
                const pomodoros = context.parsed.y;
                const minutes = pomodoros * 25;
                return `${pomodoros}x combo (${minutes} min)`;
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              unit: 'hour',
              displayFormats: {
                hour: 'HH:mm'
              }
            },
            title: {
              display: true,
              text: 'Hora do Dia'
            }
          },
          y: {
            beginAtZero: true,
            ticks: {
              stepSize: 1,
              callback: (value) => `${value}x`
            },
            title: {
              display: true,
              text: 'Combo Level'
            }
          }
        }
      }
    });
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

  const refreshButton = document.getElementById('refreshButton');
  if (refreshButton) {
    refreshButton.addEventListener('click', () => {
      refreshButton.classList.add('spinning');
      void refresh().finally(() => {
        setTimeout(() => {
          refreshButton.classList.remove('spinning');
        }, 600);
      });
    });
  }

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
      const [dashboard, summaries, machines, telemetry] = await Promise.all([
        fetchJson('/v1/vscode/dashboard', params),
        fetchJson('/v1/vscode/summaries', params),
        fetchJson('/v1/vscode/machines', params),
        fetchJson('/v1/vscode/telemetry', params).catch(() => null)
      ]);

      console.log('[Saul Report] ========== RAW API RESPONSES ==========');
      console.log('[Saul Report] Dashboard response:', dashboard);
      console.log('[Saul Report] Dashboard data:', dashboard?.data);
      console.log('[Saul Report] Summaries response:', summaries);
      console.log('[Saul Report] Machines response:', machines);
      console.log('[Saul Report] Telemetry data:', telemetry?.data);
      console.log('[Saul Report] =======================================');

      const data = dashboard?.data || {};
      
      console.log('[Saul Report] Extracted data object:', data);
      console.log('[Saul Report] Projects array:', data.projects);
      console.log('[Saul Report] Languages array:', data.languages);
      console.log('[Saul Report] Overview:', data.overview);
      
      updateSelect(filterProject, data.projects || [], params.project);
      updateSelect(filterLanguage, data.languages || [], params.language);
      updateSelect(filterMachine, machines?.data || [], params.machine);

      console.log('[Saul Report] Setting statToday to:', data.overview?.humanReadableTotal || '--');
      statToday.textContent = data.overview?.humanReadableTotal || '--';
      
      console.log('[Saul Report] Calling renderIndex with:', data.overview?.index);
      renderIndex(data.overview?.index);

      console.log('[Saul Report] Calling renderList for projects');
      renderList(projectsList, data.projects || []);
      console.log('[Saul Report] Calling renderList for languages');
      renderList(languagesList, data.languages || []);
      console.log('[Saul Report] Calling renderSummaries');
      renderSummaries(summariesList, summaries?.data?.days || []);
      
      console.log('[Saul Report] Calling renderList for branches');
      renderList(document.getElementById('branchesList'), data.branches || []);
      console.log('[Saul Report] Calling renderActivity');
      renderActivity(data.activity || {}, data.git || {});
      console.log('[Saul Report] Calling renderEditorInfo');
      renderEditorInfo(data.editor);
      console.log('[Saul Report] Calling renderWorkspaces');
      renderWorkspaces(data.workspaces || []);
      console.log('[Saul Report] Calling renderKpis');
      renderKpis(data.overview || {}, data.activity || {});
      console.log('[Saul Report] Calling renderHourlyChart');
      renderHourlyChart(data.hourly || []);
      console.log('[Saul Report] Calling renderProjectsChart');
      renderProjectsChart(data.projects || []);
      console.log('[Saul Report] Calling renderCommitsChart');
      renderCommitsChart(data.git || {});
      console.log('[Saul Report] Calling renderCrossReferenceChart');
      renderCrossReferenceChart(data.languagesByProject || []);

      if (telemetry?.data && config.enableTelemetry) {
        console.log('[Saul Report] Calling renderTelemetry');
        renderTelemetry(telemetry.data, data.overview || {});
      }

      console.log('[Saul Report] ✓ All rendering complete');
      statusEl.textContent = i18n.synced || 'Synchronized.';
    } catch (error) {
      console.error('[Saul Report] ✗ Error loading data:', error);
      console.error('[Saul Report] Error stack:', error.stack);
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetch(url.toString(), { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new Error('Request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
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
    console.log('[Saul Report] renderList called with:', list?.id, 'items:', items);
    
    if (!list) {
      console.error('[Saul Report] renderList: list element is null!');
      return;
    }
    
    list.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      console.log('[Saul Report] renderList: no items to display');
      const li = document.createElement('li');
      li.textContent = i18n.noData || 'No data.';
      list.appendChild(li);
      return;
    }
    
    const filteredItems = items.filter(item => {
      const name = String(item?.name ?? '').trim().toLowerCase();
      return name && name !== 'unknown';
    });
    
    console.log('[Saul Report] renderList: filtered', items.length, 'to', filteredItems.length, 'items (removed unknown/empty)');
    
    if (filteredItems.length === 0) {
      console.log('[Saul Report] renderList: no valid items after filtering');
      const li = document.createElement('li');
      li.textContent = i18n.noData || 'No data.';
      list.appendChild(li);
      return;
    }
    
    filteredItems.slice(0, 8).forEach((item, idx) => {
      console.log(`[Saul Report] renderList item ${idx}:`, item);
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.textContent = String(item?.name ?? '');
      const secondsEl = document.createElement('span');
      secondsEl.textContent = formatSeconds(item?.total_seconds);
      li.appendChild(nameEl);
      li.appendChild(secondsEl);
      list.appendChild(li);
    });
    console.log('[Saul Report] renderList: finished rendering', list.children.length, 'items');
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
      const dateEl = document.createElement('span');
      dateEl.textContent = String(day?.date ?? '');
      const secondsEl = document.createElement('span');
      secondsEl.textContent = formatSeconds(day?.total_seconds);
      li.appendChild(dateEl);
      li.appendChild(secondsEl);
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
      const labelEl = document.createElement('span');
      labelEl.textContent = String(item.label);
      const valueEl = document.createElement('span');
      valueEl.textContent = String(item.value);
      if (item.color) {
        valueEl.style.color = item.color;
      }
      li.appendChild(labelEl);
      li.appendChild(valueEl);
      list.appendChild(li);
    });
  }

  function renderEditorInfo(editor) {
    const container = document.getElementById('editorInfo');
    if (!container) return;

    if (!editor) {
      container.textContent = 'No editor metadata available';
      return;
    }

    container.innerHTML = '';
    const ul = document.createElement('ul');
    ul.className = 'data-list';
    const rows = [
      ['VS Code Version', editor.vscodeVersion || 'unknown'],
      ['Extensions', editor.extensionsCount || 0],
      ['Theme', editor.themeKind || 'unknown'],
      ['Workspace Type', editor.workspaceType || 'empty']
    ];
    rows.forEach(([label, value]) => {
      const li = document.createElement('li');
      const labelEl = document.createElement('span');
      labelEl.textContent = String(label);
      const valueEl = document.createElement('span');
      valueEl.textContent = String(value);
      li.appendChild(labelEl);
      li.appendChild(valueEl);
      ul.appendChild(li);
    });
    container.appendChild(ul);
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
      const nameEl = document.createElement('span');
      nameEl.textContent = String(ws?.name ?? '');
      const countEl = document.createElement('span');
      countEl.textContent = `${ws?.totalFiles || 0} files`;
      li.appendChild(nameEl);
      li.appendChild(countEl);
      list.appendChild(li);
    });
  }

  function renderKpis(overview, activity) {
    console.log('[Saul Report] renderKpis called with:', { overview, activity });
    
    const focusEl = document.getElementById('kpiFocus');
    const switchesEl = document.getElementById('kpiSwitches');
    const productiveEl = document.getElementById('kpiProductive');
    const procrastEl = document.getElementById('kpiProcrast');
    const inactiveEl = document.getElementById('kpiInactive');

    console.log('[Saul Report] KPI elements found:', {
      focusEl: !!focusEl,
      switchesEl: !!switchesEl,
      productiveEl: !!productiveEl,
      procrastEl: !!procrastEl,
      inactiveEl: !!inactiveEl
    });

    const totalSeconds = overview.totalSeconds || 0;
    const totalSwitches = activity.totalTabSwitches || 0;

    const productiveSeconds = Math.round(totalSeconds * 0.8);
    const procrastSeconds = Math.round(totalSeconds * 0.05);
    const inactiveSeconds = totalSeconds - productiveSeconds - procrastSeconds;

    const focusRate = totalSeconds > 0 ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;

    console.log('[Saul Report] KPI values:', {
      totalSeconds,
      totalSwitches,
      focusRate,
      productiveSeconds,
      procrastSeconds,
      inactiveSeconds
    });

    if (focusEl) {
      focusEl.textContent = `${focusRate}%`;
      console.log('[Saul Report] Set focus to:', focusEl.textContent);
    }
    if (switchesEl) {
      switchesEl.textContent = totalSwitches.toString();
      console.log('[Saul Report] Set switches to:', switchesEl.textContent);
    }
    if (productiveEl) {
      productiveEl.textContent = formatSeconds(productiveSeconds);
      console.log('[Saul Report] Set productive to:', productiveEl.textContent);
    }
    if (procrastEl) {
      procrastEl.textContent = formatSeconds(procrastSeconds);
      console.log('[Saul Report] Set procrast to:', procrastEl.textContent);
    }
    if (inactiveEl) {
      inactiveEl.textContent = formatSeconds(inactiveSeconds);
      console.log('[Saul Report] Set inactive to:', inactiveEl.textContent);
    }
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
            backgroundColor: '#ffc857',
            borderColor: '#ffb347',
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
            backgroundColor: '#10b981',
            borderColor: '#059669',
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

    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ffc857', '#ffb347'];
    
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
    console.log('[Saul Report] renderCrossReferenceChart called with:', languagesByProject);
    
    const canvas = document.getElementById('crossReferenceChart');
    const emptyEl = document.getElementById('crossReferenceEmpty');
    
    console.log('[Saul Report] Canvas element:', canvas);
    console.log('[Saul Report] Empty element:', emptyEl);
    console.log('[Saul Report] languagesByProject length:', languagesByProject?.length);
    
    if (!canvas || !languagesByProject || languagesByProject.length === 0) {
      console.log('[Saul Report] Showing empty state for cross-reference chart');
      if (canvas) canvas.style.display = 'none';
      if (emptyEl) emptyEl.classList.remove('hidden');
      return;
    }

    console.log('[Saul Report] Rendering cross-reference chart with', languagesByProject.length, 'projects');
    canvas.style.display = 'block';
    if (emptyEl) emptyEl.classList.add('hidden');

    if (window.crossReferenceChartInstance) {
      window.crossReferenceChartInstance.destroy();
    }

    const allLanguages = new Set();
    languagesByProject.forEach(proj => {
      proj.languages.forEach(lang => {
        const langName = String(lang.language || '').trim().toLowerCase();
        if (langName && langName !== 'unknown') {
          allLanguages.add(lang.language);
        }
      });
    });
    
    console.log('[Saul Report] Filtered languages (removed unknown):', Array.from(allLanguages));

    const languageColors = {
      'javascript': '#f7df1e',
      'typescript': '#3178c6',
      'python': '#3776ab',
      'java': '#007396',
      'go': '#00add8',
      'rust': '#ce422b',
      'c++': '#00599c',
      'c': '#555555',
      'csharp': '#239120',
      'c#': '#239120',
      'ruby': '#cc342d',
      'php': '#777bb4',
      'swift': '#fa7343',
      'kotlin': '#7f52ff',
      'scala': '#dc322f',
      'elixir': '#4e2a8e',
      'clojure': '#5881d8',
      'haskell': '#5e5086',
      'dart': '#0175c2',
      'lua': '#000080',
      'perl': '#39457e',
      'r': '#276dc3',
      'julia': '#9558b2',
      'groovy': '#4298b8',
      'objective-c': '#438eff',
      'html': '#e34c26',
      'css': '#563d7c',
      'scss': '#c6538c',
      'sass': '#cc6699',
      'less': '#1d365d',
      'vue': '#42b883',
      'react': '#61dafb',
      'svelte': '#ff3e00',
      'angular': '#dd0031',
      'jsx': '#61dafb',
      'tsx': '#3178c6',
      'json': '#292929',
      'jsonc': '#292929',
      'markdown': '#083fa1',
      'sql': '#f29111',
      'plsql': '#f80000',
      'mysql': '#4479a1',
      'postgresql': '#336791',
      'shell': '#89e051',
      'bash': '#89e051',
      'powershell': '#012456',
      'yaml': '#cb171e',
      'yml': '#cb171e',
      'toml': '#9c4221',
      'xml': '#0060ac',
      'dockerfile': '#384d54',
      'makefile': '#427819',
      'cmake': '#064f8c',
      'graphql': '#e10098',
      'solidity': '#363636',
      'vhdl': '#adb2cb',
      'verilog': '#b2b7f8',
      'coffeescript': '#244776',
      'erlang': '#b83998',
      'fsharp': '#b845fc',
      'nim': '#ffe953',
      'terraform': '#7b42bc',
      'handlebars': '#f7931e',
      'plaintext': '#6b7280',
      'scminput': '#6b7280',
      'log': '#6b7280'
    };

    function generateDistinctColor(index) {
      const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330];
      const saturations = [70, 85, 60];
      const lightnesses = [50, 40, 60];
      
      const hue = hues[index % hues.length];
      const sat = saturations[Math.floor(index / hues.length) % saturations.length];
      const light = lightnesses[Math.floor(index / (hues.length * saturations.length)) % lightnesses.length];
      
      return `hsl(${hue}, ${sat}%, ${light}%)`;
    }

    const filteredProjects = languagesByProject.filter(p => {
      const projectName = String(p.project || '').trim().toLowerCase();
      return projectName && projectName !== 'unknown';
    });
    
    const projectLabels = filteredProjects.map(p => {
      const name = p.project.split('/').pop() || p.project;
      return name.length > 20 ? name.substring(0, 18) + '...' : name;
    });
    
    console.log('[Saul Report] Filtered projects (removed unknown):', projectLabels);

    const unknownLanguages = [];
    const datasets = Array.from(allLanguages).map((language, index) => {
      const data = filteredProjects.map(proj => {
        const langData = proj.languages.find(l => l.language === language);
        return langData ? langData.minutes : 0;
      });

      let color = languageColors[language.toLowerCase()];
      if (!color) {
        unknownLanguages.push(language);
        color = generateDistinctColor(unknownLanguages.length - 1);
      }

      return {
        label: language,
        data: data,
        backgroundColor: color,
        borderColor: '#fff',
        borderWidth: 1
      };
    });

    console.log('[Saul Report] Project labels:', projectLabels);
    console.log('[Saul Report] Datasets:', datasets);
    console.log('[Saul Report] Chart.js available:', typeof Chart !== 'undefined');

    try {
      console.log('[Saul Report] Getting canvas context...');
      const ctx = canvas.getContext('2d');
      console.log('[Saul Report] Canvas context:', ctx);
      console.log('[Saul Report] Creating Chart.js instance...');
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
      console.log('[Saul Report] ✓ Cross-reference chart created successfully');
    } catch (error) {
      console.error('[Saul Report] ✗ Error creating cross-reference chart:', error);
      console.error('[Saul Report] Error stack:', error.stack);
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

  function renderTelemetry(tel, overview) {
    const telSection = document.getElementById('telemetrySection');
    if (!telSection) return;

    telSection.classList.remove('hidden');

    document.getElementById('telDebugSessions').textContent = tel.debugging?.totalSessions || 0;
    document.getElementById('telDebugTime').textContent = formatDurationMs(tel.debugging?.totalDurationMs || 0);

    const testSuccess = tel.testing?.successRate || 0;
    document.getElementById('telTestSuccess').textContent = `${testSuccess.toFixed(1)}%`;
    document.getElementById('telTestRuns').textContent = `${tel.testing?.totalRuns || 0} runs`;

    const buildCount = tel.tasks?.byGroup?.build?.count || 0;
    const testCount = tel.tasks?.byGroup?.test?.count || 0;
    const totalTasks = tel.tasks?.totalTasks || 0;
    document.getElementById('telBuilds').textContent = totalTasks > 0 ? totalTasks : buildCount;
    const buildTime = tel.tasks?.byGroup?.build?.totalDurationMs || 0;
    const testTime = tel.tasks?.byGroup?.test?.totalDurationMs || 0;
    const totalTaskTime = buildTime + testTime;
    document.getElementById('telBuildTime').textContent = formatDurationMs(totalTaskTime || buildTime);

    document.getElementById('telPomodoros').textContent = tel.focus?.pomodorosCompleted || 0;
    document.getElementById('telFocusTime').textContent = formatDurationMs(tel.focus?.totalFocusMs || 0);

    console.log('[Saul Report] ===== TELEMETRY DEBUG =====');
    console.log('[Saul Report] Full telemetry object:', JSON.stringify(tel, null, 2));
    console.log('[Saul Report] All telemetry keys:', Object.keys(tel));
    console.log('[Saul Report] Combo data exists?', tel.combo !== undefined);
    console.log('[Saul Report] Combo data:', tel.combo);
    
    if (tel.combo) {
      console.log('[Saul Report] ✓ Combo data FOUND:', {
        maxComboToday: tel.combo.maxComboToday,
        totalCombosToday: tel.combo.totalCombosToday,
        lifetimeMaxCombo: tel.combo.lifetimeMaxCombo,
        comboTimeline: tel.combo.comboTimeline?.length || 0
      });
    } else {
      console.log('[Saul Report] ❌ NO COMBO DATA - Daemon não retornou campo "combo"');
      console.log('[Saul Report] Isso significa que o daemon ainda não processa heartbeats de combo');
    }
    
    const maxCombo = tel.combo?.maxComboToday || 0;
    const comboMinutes = maxCombo * 25;
    
    console.log('[Saul Report] Max combo:', maxCombo, 'minutes:', comboMinutes);
    console.log('[Saul Report] ===========================');
    
    document.getElementById('telMaxCombo').textContent = maxCombo > 0 ? `${maxCombo}x` : '--';
    document.getElementById('telComboMinutes').textContent = maxCombo > 0 ? `${comboMinutes} min streak` : '--';

    renderTerminalCommandsChart(tel.terminal || {});
    renderFocusPatternsChart(tel.focus || {});
    renderComboTimelineChart(tel.combo || {});
    renderTopExtensions(tel.extensions?.mostUsed || []);
    renderTopDebuggedFiles(tel.debugging?.topFiles || []);
    renderTopErrorFiles(tel.diagnostics?.topErrorFiles || []);
    renderRefactoringStats(tel.refactoring || {});
  }

  function renderTerminalCommandsChart(terminal) {
    const canvas = document.getElementById('terminalCommandsChart');
    const emptyEl = document.getElementById('terminalEmpty');
    if (!canvas) return;

    if (terminalChart) {
      terminalChart.destroy();
      terminalChart = null;
    }

    const categories = terminal.byCategory || {};
    const labels = Object.keys(categories);
    const data = Object.values(categories);

    if (labels.length === 0) {
      canvas.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    terminalChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'Comandos',
          data,
          backgroundColor: '#ffc857'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { beginAtZero: true }
        }
      }
    });
  }

  function renderFocusPatternsChart(focus) {
    const canvas = document.getElementById('focusPatternsChart');
    const emptyEl = document.getElementById('focusEmpty');
    if (!canvas) return;

    if (focusChart) {
      focusChart.destroy();
      focusChart = null;
    }

    const peakHours = focus.peakHours || [];

    if (peakHours.length === 0) {
      canvas.classList.add('hidden');
      emptyEl.classList.remove('hidden');
      return;
    }

    canvas.classList.remove('hidden');
    emptyEl.classList.add('hidden');

    const hourData = Array(24).fill(0);
    peakHours.forEach((hour, idx) => {
      hourData[hour] = peakHours.length - idx;
    });

    focusChart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: Array.from({ length: 24 }, (_, i) => `${i}h`),
        datasets: [{
          label: 'Intensidade de Foco',
          data: hourData,
          backgroundColor: '#10b981'
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          y: { beginAtZero: true, display: false }
        }
      }
    });
  }

  function renderTopExtensions(extensions) {
    const list = document.getElementById('topExtensionsList');
    if (!list) return;

    list.innerHTML = '';
    if (!extensions || extensions.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Nenhuma extensão registrada.';
      list.appendChild(li);
      return;
    }

    extensions.slice(0, 5).forEach((ext) => {
      const li = document.createElement('li');
      const idEl = document.createElement('span');
      idEl.textContent = String(ext?.extensionId ?? '');
      const countEl = document.createElement('span');
      countEl.textContent = `${ext?.commandCount ?? 0} cmds`;
      li.appendChild(idEl);
      li.appendChild(countEl);
      list.appendChild(li);
    });
  }

  function renderTopDebuggedFiles(files) {
    const list = document.getElementById('topDebuggedFilesList');
    if (!list) return;

    list.innerHTML = '';
    if (!files || files.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Nenhum arquivo debugado.';
      list.appendChild(li);
      return;
    }

    files.slice(0, 5).forEach((file) => {
      const li = document.createElement('li');
      const idEl = document.createElement('span');
      idEl.textContent = String(file?.fileId ?? '');
      const countEl = document.createElement('span');
      const sessions = file?.sessions ?? 0;
      const breakpoints = file?.breakpoints ?? 0;
      const parts = [];
      if (sessions > 0) parts.push(`${sessions} sessões`);
      if (breakpoints > 0) parts.push(`${breakpoints} BPs`);
      countEl.textContent = parts.length > 0 ? parts.join(', ') : '0';
      li.appendChild(idEl);
      li.appendChild(countEl);
      list.appendChild(li);
    });
  }

  function renderTopErrorFiles(files) {
    const list = document.getElementById('topErrorFilesList');
    if (!list) {
      console.warn('[Report] topErrorFilesList element not found');
      return;
    }

    console.log('[Report] renderTopErrorFiles called with:', files);
    list.innerHTML = '';
    if (!files || files.length === 0) {
      const li = document.createElement('li');
      li.textContent = 'Nenhum erro registrado. 🎉';
      list.appendChild(li);
      return;
    }

    files.slice(0, 5).forEach((file) => {
      const li = document.createElement('li');
      const idEl = document.createElement('span');
      idEl.textContent = String(file?.fileId ?? '');
      const statsEl = document.createElement('span');
      statsEl.textContent = `⚠️ ${file?.errors ?? 0} | ⚡ ${file?.warnings ?? 0}`;
      li.appendChild(idEl);
      li.appendChild(statsEl);
      list.appendChild(li);
    });
  }

  function renderRefactoringStats(refactoring) {
    const div = document.getElementById('refactoringStats');
    if (!div) return;

    div.innerHTML = '';
    const items = [
      { label: 'Arquivos Renomeados', value: refactoring?.filesRenamed || 0 },
      { label: 'Edits Aplicados', value: refactoring?.editsApplied || 0 },
      { label: 'Code Actions Disponíveis', value: refactoring?.codeActionsAvailable || 0 }
    ];
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'stat-item';
      const labelEl = document.createElement('span');
      labelEl.className = 'stat-label';
      labelEl.textContent = item.label;
      const valueEl = document.createElement('span');
      valueEl.className = 'stat-value';
      valueEl.textContent = String(item.value);
      row.appendChild(labelEl);
      row.appendChild(valueEl);
      div.appendChild(row);
    });
  }

  function formatDurationMs(ms) {
    if (!ms || ms === 0) return '--';
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m`;
    return `${seconds}s`;
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }

  // Debug helper - call window.__SAUL_DEBUG__() in browser console
  window.__SAUL_DEBUG__ = function() {
    console.log('========== SAUL DEBUG INFO ==========');
    console.log('Config:', config);
    console.log('reportContent hidden?', contentEl?.classList.contains('hidden'));
    console.log('reportsDisabled hidden?', disabledEl?.classList.contains('hidden'));
    console.log('projectsList:', projectsList, 'children:', projectsList?.children.length);
    console.log('languagesList:', languagesList, 'children:', languagesList?.children.length);
    console.log('statToday:', statToday?.textContent);
    console.log('All KPI values:', {
      focus: document.getElementById('kpiFocus')?.textContent,
      switches: document.getElementById('kpiSwitches')?.textContent,
      productive: document.getElementById('kpiProductive')?.textContent,
      procrast: document.getElementById('kpiProcrast')?.textContent,
      inactive: document.getElementById('kpiInactive')?.textContent
    });
    console.log('=====================================');
  };
  
  console.log('[Saul Report] Debug helper available: window.__SAUL_DEBUG__()');
})();
