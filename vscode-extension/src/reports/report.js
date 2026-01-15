(function () {
  const config = window.__SAUL_CONFIG__ || {};
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

  if (!config.enableReportsInVscode) {
    disabledEl.classList.remove('hidden');
    statusEl.textContent = 'Relatorios desativados.';
    return;
  }

  if (!config.apiBase || !config.pairingKey) {
    disabledEl.classList.remove('hidden');
    statusEl.textContent = 'Configure a URL do daemon e a pairing key.';
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
    statusEl.textContent = 'Carregando dados do SaulDaemon...';
    const params = {
      start: todayKey(),
      end: todayKey(),
      project: filterProject.value,
      language: filterLanguage.value,
      machine: filterMachine.value
    };

    try {
      const [summaries, projects, languages, machines, todayStats] = await Promise.all([
        fetchJson('/v1/vscode/summaries', params),
        fetchJson('/v1/vscode/projects', params),
        fetchJson('/v1/vscode/languages', params),
        fetchJson('/v1/vscode/machines', params),
        fetchJson('/v1/vscode/stats/today', params)
      ]);

      updateSelect(filterProject, projects.data, params.project);
      updateSelect(filterLanguage, languages.data, params.language);
      updateSelect(filterMachine, machines.data, params.machine);

      statToday.textContent = todayStats?.data?.human_readable_total || '--';

      renderList(projectsList, projects.data);
      renderList(languagesList, languages.data);
      renderSummaries(summariesList, summaries?.data?.days || []);

      statusEl.textContent = 'Dados sincronizados.';
    } catch (error) {
      statusEl.textContent = 'Erro ao carregar dados do SaulDaemon.';
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
    select.innerHTML = '<option value="">Todos</option>';
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
      li.textContent = 'Sem dados.';
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
      li.textContent = 'Sem registros.';
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
    if (!Number.isFinite(seconds)) {
      return '--';
    }
    const total = Math.round(seconds);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  }

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }
})();
