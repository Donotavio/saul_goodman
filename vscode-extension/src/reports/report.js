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
    if (filtersTitle) {
      filtersTitle.textContent = i18n.report_vscode_filters_title || 'Filters';
    }
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

    try {
      const [dashboard, summaries, machines, telemetry] = await Promise.all([
        fetchJson('/v1/vscode/dashboard', params),
        fetchJson('/v1/vscode/summaries', params),
        fetchJson('/v1/vscode/machines', params),
        fetchJson('/v1/vscode/telemetry', params).catch(() => null)
      ]);

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

      if (telemetry?.data && config.enableTelemetry) {
        renderTelemetry(telemetry.data, data.overview || {});
      }

      statusEl.textContent = i18n.synced || 'Synchronized.';
    } catch (error) {
      console.error('[Saul Report] Error loading data:', error?.message || String(error));
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
    if (!list) return;
    
    list.innerHTML = '';
    if (!Array.isArray(items) || !items.length) {
      const li = document.createElement('li');
      li.textContent = i18n.noData || 'No data.';
      list.appendChild(li);
      return;
    }
    
    const filteredItems = items.filter(item => {
      const name = String(item?.name ?? '').trim().toLowerCase();
      return name && name !== 'unknown';
    });
    
    if (filteredItems.length === 0) {
      const li = document.createElement('li');
      li.textContent = i18n.noData || 'No data.';
      list.appendChild(li);
      return;
    }
    
    filteredItems.slice(0, 8).forEach((item) => {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.textContent = String(item?.name ?? '');
      const secondsEl = document.createElement('span');
      secondsEl.textContent = formatSeconds(item?.total_seconds);
      li.appendChild(nameEl);
      li.appendChild(secondsEl);
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

  function formatWithParams(template, params) {
    if (!template) return '';
    return template.replace(/\{(\w+)\}/g, (match, key) => {
      if (Object.prototype.hasOwnProperty.call(params, key)) {
        return String(params[key]);
      }
      return match;
    });
  }

  function renderActivity(activity, git) {
    const list = document.getElementById('activityList');
    if (!list) return;

    list.innerHTML = '';
    
    const items = [
      {
        key: 'report_vscode_activity_tab_switches',
        fallback: 'Tab Switches',
        value: activity.totalTabSwitches || 0
      },
      {
        key: 'report_vscode_activity_commits',
        fallback: 'Commits',
        value: git.totalCommits || 0
      },
      {
        key: 'report_vscode_activity_files_changed',
        fallback: 'Files Changed',
        value: git.totalFilesChanged || 0
      },
      {
        key: 'report_vscode_activity_lines_added',
        fallback: 'Lines Added',
        value: git.totalLinesAdded || 0,
        color: '#22c55e'
      },
      {
        key: 'report_vscode_activity_lines_deleted',
        fallback: 'Lines Deleted',
        value: git.totalLinesDeleted || 0,
        color: '#ef4444'
      }
    ];

    items.forEach(item => {
      const li = document.createElement('li');
      const labelEl = document.createElement('span');
      labelEl.textContent = i18n[item.key] || item.fallback;
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
      container.textContent = i18n.report_vscode_editor_empty || 'No editor metadata available';
      return;
    }

    container.innerHTML = '';
    const unknownLabel = i18n.report_vscode_editor_value_unknown || 'unknown';
    const emptyLabel = i18n.report_vscode_editor_value_empty || 'empty';
    const ul = document.createElement('ul');
    ul.className = 'data-list';
    const rows = [
      [i18n.report_vscode_editor_label_version || 'VS Code Version', editor.vscodeVersion || unknownLabel],
      [i18n.report_vscode_editor_label_extensions || 'Extensions', editor.extensionsCount ?? 0],
      [i18n.report_vscode_editor_label_theme || 'Theme', editor.themeKind || unknownLabel],
      [i18n.report_vscode_editor_label_workspace || 'Workspace Type', editor.workspaceType || emptyLabel]
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
      li.textContent = i18n.report_vscode_workspaces_empty || 'No workspaces tracked';
      list.appendChild(li);
      return;
    }

    workspaces.forEach(ws => {
      const li = document.createElement('li');
      const nameEl = document.createElement('span');
      nameEl.textContent = String(ws?.name ?? '');
      const countEl = document.createElement('span');
      const fileCount = ws?.totalFiles || 0;
      countEl.textContent =
        (i18n.report_vscode_workspaces_files && formatWithParams(i18n.report_vscode_workspaces_files, { count: fileCount })) ||
        `${fileCount} files`;
      li.appendChild(nameEl);
      li.appendChild(countEl);
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

    const productiveSeconds = overview.productiveSeconds ?? (overview.codingSeconds || 0);
    const procrastSeconds = overview.procrastinationSeconds ?? 0;
    const inactiveSeconds = overview.inactiveSeconds ?? 0;

    const focusRate = totalSeconds > 0 ? Math.round((productiveSeconds / totalSeconds) * 100) : 0;

    if (focusEl) focusEl.textContent = `${focusRate}%`;
    if (switchesEl) switchesEl.textContent = totalSwitches.toString();
    if (productiveEl) productiveEl.textContent = formatSeconds(productiveSeconds);
    if (procrastEl) procrastEl.textContent = formatSeconds(procrastSeconds);
    if (inactiveEl) inactiveEl.textContent = formatSeconds(inactiveSeconds);
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

    if (window.projectsChartInstance && typeof window.projectsChartInstance.destroy === 'function') {
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
      console.error('[Saul Report] Error creating projects chart:', error?.message || String(error));
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

    if (window.commitsChartInstance && typeof window.commitsChartInstance.destroy === 'function') {
      window.commitsChartInstance.destroy();
    }

    const hours = Array.from({length: 24}, (_, i) => i);
    const buildCommitsByHour = window.buildSyntheticCommitsByHour;
    const commitsByHour = typeof buildCommitsByHour === 'function'
      ? buildCommitsByHour(totalCommits)
      : (() => {
          const fallback = Array(24).fill(0);
          fallback[9] = Math.ceil(totalCommits * 0.2);
          fallback[11] = Math.ceil(totalCommits * 0.3);
          fallback[14] = Math.ceil(totalCommits * 0.25);
          fallback[16] = Math.ceil(totalCommits * 0.15);
          fallback[19] = totalCommits - (fallback[9] + fallback[11] + fallback[14] + fallback[16]);
          return fallback;
        })();

    try {
      const ctx = canvas.getContext('2d');
      window.commitsChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
          labels: hours.map(h => `${String(h).padStart(2, '0')}h`),
          datasets: [{
            label: i18n.report_vscode_activity_commits || 'Commits',
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
      console.error('[Saul Report] Error creating commits chart:', error?.message || String(error));
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

    if (window.crossReferenceChartInstance && typeof window.crossReferenceChartInstance.destroy === 'function') {
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
      console.error(
        '[Saul Report] Error creating cross-reference chart:',
        error?.message || String(error)
      );
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

    const maxCombo = tel.combo?.maxComboToday || 0;
    const comboMinutes = maxCombo * 25;
    
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

    if (terminalChart && typeof terminalChart.destroy === 'function') {
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

    if (focusChart && typeof focusChart.destroy === 'function') {
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
          label: i18n.report_vscode_focus_intensity || 'Intensidade de Foco',
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
      li.textContent = i18n.report_vscode_top_extensions_empty || 'Nenhuma extensão registrada.';
      list.appendChild(li);
      return;
    }

    extensions.slice(0, 5).forEach((ext) => {
      const li = document.createElement('li');
      const idEl = document.createElement('span');
      idEl.textContent = String(ext?.extensionId ?? '');
      const countEl = document.createElement('span');
      const cmdCount = ext?.commandCount ?? 0;
      countEl.textContent =
        (i18n.report_vscode_top_extensions_cmds &&
          formatWithParams(i18n.report_vscode_top_extensions_cmds, { count: cmdCount })) ||
        `${cmdCount} cmds`;
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
      li.textContent =
        i18n.report_vscode_top_debugged_files_empty || 'Nenhum arquivo debugado.';
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
      if (sessions > 0) {
        const sessionText =
          (i18n.report_vscode_top_debugged_files_sessions &&
            formatWithParams(i18n.report_vscode_top_debugged_files_sessions, { count: sessions })) ||
          `${sessions} sessões`;
        parts.push(sessionText);
      }
      if (breakpoints > 0) {
        const bpText =
          (i18n.report_vscode_top_debugged_files_bps &&
            formatWithParams(i18n.report_vscode_top_debugged_files_bps, { count: breakpoints })) ||
          `${breakpoints} BPs`;
        parts.push(bpText);
      }
      countEl.textContent = parts.length > 0 ? parts.join(', ') : '0';
      li.appendChild(idEl);
      li.appendChild(countEl);
      list.appendChild(li);
    });
  }

  function renderTopErrorFiles(files) {
    const list = document.getElementById('topErrorFilesList');
    if (!list) {
      console.warn('[Saul Report] topErrorFilesList element not found');
      return;
    }
    list.innerHTML = '';
    if (!files || files.length === 0) {
      const li = document.createElement('li');
      li.textContent =
        i18n.report_vscode_top_error_files_empty || 'Nenhum erro registrado. 🎉';
      list.appendChild(li);
      return;
    }

    files.slice(0, 5).forEach((file) => {
      const li = document.createElement('li');
      const idEl = document.createElement('span');
      idEl.textContent = String(file?.fileId ?? '');
      const statsEl = document.createElement('span');
      const errors = file?.errors ?? 0;
      const warnings = file?.warnings ?? 0;
      statsEl.textContent =
        (i18n.report_vscode_top_error_files_stats &&
          formatWithParams(i18n.report_vscode_top_error_files_stats, { errors, warnings })) ||
        `⚠️ ${errors} | ⚡ ${warnings}`;
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
      {
        key: 'report_vscode_refactor_files_renamed',
        fallback: 'Arquivos Renomeados',
        value: refactoring?.filesRenamed || 0
      },
      {
        key: 'report_vscode_refactor_edits_applied',
        fallback: 'Edits Aplicados',
        value: refactoring?.editsApplied || 0
      },
      {
        key: 'report_vscode_refactor_code_actions',
        fallback: 'Code Actions Disponíveis',
        value: refactoring?.codeActionsAvailable || 0
      }
    ];
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'stat-item';
      const labelEl = document.createElement('span');
      labelEl.className = 'stat-label';
      labelEl.textContent = i18n[item.key] || item.fallback;
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
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
})();
