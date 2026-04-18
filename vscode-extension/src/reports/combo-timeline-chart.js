// Função auxiliar para renderizar gráfico de combo timeline
function renderComboTimelineChart(comboData) {
  const i18n = window.__SAUL_I18N__ || {};
  const canvas = document.getElementById('comboTimelineChart');
  const emptyEl = document.getElementById('comboTimelineEmpty');
  if (!canvas) return;

  if (window.comboTimelineChart && typeof window.comboTimelineChart.destroy === 'function') {
    window.comboTimelineChart.destroy();
    window.comboTimelineChart = null;
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
    type: event.type
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
    0: cssVar('--saul-chart-tick'),
    1: cssVar('--combo-color'),
    2: cssVar('--saul-amber'),
    3: cssVar('--saul-lines-deleted'),
    4: cssVar('--saul-combo-purple'),
    5: cssVar('--ultra-gold')
  };

  // Segmentar dados por cor baseado no nível
  const segments = [];
  for (let i = 0; i < dataPoints.length - 1; i++) {
    const current = dataPoints[i];
    const next = dataPoints[i + 1];
    const level = current.level || 0;
    
    segments.push({
      data: [
        { x: current.x, y: current.y },
        { x: next.x, y: current.y }
      ],
      borderColor: levelColors[level] || levelColors[0],
      backgroundColor: levelColors[level] || levelColors[0],
      pointBackgroundColor: levelColors[level] || levelColors[0],
      pointBorderColor: cssVar('--saul-white'),
      pointRadius: current.type === 'combo_reset' ? 8 : 5,
      pointStyle: current.type === 'combo_reset' ? 'crossRot' : 'circle',
      fill: false,
      stepped: true,
      tension: 0
    });
  }

  // Último ponto
  const lastPoint = dataPoints[dataPoints.length - 1];
  segments.push({
    data: [{ x: lastPoint.x, y: lastPoint.y }],
    borderColor: levelColors[lastPoint.level] || levelColors[0],
    backgroundColor: levelColors[lastPoint.level] || levelColors[0],
    pointBackgroundColor: levelColors[lastPoint.level] || levelColors[0],
    pointBorderColor: cssVar('--saul-white'),
    pointRadius: 5,
    fill: false
  });

  try {
    window.comboTimelineChart = new Chart(canvas, {
      type: 'line',
      data: {
        datasets: segments
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
                return date.toLocaleTimeString(document.documentElement.lang || undefined, { hour: '2-digit', minute: '2-digit' });
              },
              label: (context) => {
                const pomodoros = context.parsed.y;
                const minutes = pomodoros * 25;
                return (i18n.report_vscode_combo_tooltip || '{count}x combo ({minutes} min)')
                  .replace('{count}', pomodoros)
                  .replace('{minutes}', minutes);
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
              text: i18n.report_vscode_chart_axis_time_of_day || 'Time of Day'
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
              text: i18n.report_vscode_chart_axis_combo_level || 'Combo Level'
            }
          }
        }
      }
    });
  } catch (err) {
    console.error('[Saul] Failed to render combo timeline chart:', err);
  }
}
