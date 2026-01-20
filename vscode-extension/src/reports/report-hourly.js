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

  let hourlyChart = null;
  
  if (window.hourlyChartInstance && typeof window.hourlyChartInstance.destroy === 'function') {
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
          backgroundColor: '#0a7e07',
          borderColor: '#085d05',
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
            color: '#6b7280',
            font: { size: 10 }
          }
        },
        y: {
          stacked: true,
          beginAtZero: true,
          grid: {
            color: '#e5e7eb'
          },
          ticks: {
            color: '#6b7280',
            font: { size: 10 }
          },
          title: {
            display: true,
            text: 'Minutes',
            color: '#374151',
            font: { size: 11, weight: 'bold' }
          }
        }
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#374151',
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
          titleColor: '#fff',
          bodyColor: '#fff',
          borderColor: '#374151',
          borderWidth: 1,
          padding: 10,
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

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { renderHourlyChart, renderIndex };
}
