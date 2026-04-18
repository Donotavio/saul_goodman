function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function renderHourlyChart(hourlyData) {
  const i18n = window.__SAUL_I18N__ || {};
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

  let hourlyChart = null;
  
  if (window.hourlyChartInstance && typeof window.hourlyChartInstance.destroy === 'function') {
    window.hourlyChartInstance.destroy();
  }

  const ctx = canvas.getContext('2d');
  try {
    window.hourlyChartInstance = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: i18n.report_vscode_chart_label_coding || 'Coding',
            data: codingMinutes,
            backgroundColor: cssVar('--combo-color'),
            borderColor: cssVar('--saul-orange'),
            borderWidth: 1
          },
          {
            label: i18n.report_vscode_chart_label_debugging || 'Debugging',
            data: debuggingMinutes,
            backgroundColor: cssVar('--saul-amber'),
            borderColor: cssVar('--saul-amber-dark'),
            borderWidth: 1
          },
          {
            label: i18n.report_vscode_chart_label_building || 'Building',
            data: buildingMinutes,
            backgroundColor: cssVar('--saul-emerald'),
            borderColor: cssVar('--saul-emerald-dark'),
            borderWidth: 1
          },
          {
            label: i18n.report_vscode_chart_label_testing || 'Testing',
            data: testingMinutes,
            backgroundColor: cssVar('--saul-success-dark'),
            borderColor: cssVar('--saul-testing-border'),
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
            grid: {
              display: false
            },
            ticks: {
              color: cssVar('--saul-chart-tick'),
              font: { size: 10 }
            }
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: {
              color: cssVar('--saul-chart-grid')
            },
            ticks: {
              color: cssVar('--saul-chart-tick'),
              font: { size: 10 }
            },
            title: {
              display: true,
              text: i18n.report_vscode_chart_axis_minutes || 'Minutes',
              color: cssVar('--saul-chart-text'),
              font: { size: 11, weight: 'bold' }
            }
          }
        },
        plugins: {
          legend: {
            display: true,
            position: 'top',
            labels: {
              color: cssVar('--saul-chart-text'),
              font: { size: 11 },
              padding: 12,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            mode: 'index',
            intersect: false,
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            titleColor: cssVar('--saul-white'),
            bodyColor: cssVar('--saul-white'),
            borderColor: cssVar('--saul-chart-text'),
            borderWidth: 1,
            padding: 10,
            displayColors: true,
            callbacks: {
              label: function(context) {
                const minLabel = (i18n.report_vscode_chart_tooltip_min || '{value} min').replace('{value}', context.parsed.y);
                return `${context.dataset.label}: ${minLabel}`;
              }
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('[Saul] Failed to render hourly chart:', err);
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderHourlyChart, renderIndex };
}
