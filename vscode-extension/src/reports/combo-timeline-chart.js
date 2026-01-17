// Função auxiliar para renderizar gráfico de combo timeline
function renderComboTimelineChart(comboData) {
  const canvas = document.getElementById('comboTimelineChart');
  const emptyEl = document.getElementById('comboTimelineEmpty');
  if (!canvas) return;

  if (window.comboTimelineChart) {
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
    0: '#6B7280',
    1: '#FFC857',
    2: '#F59E0B',
    3: '#EF4444',
    4: '#A855F7',
    5: '#FFD700'
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
      pointBorderColor: '#fff',
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
    pointBorderColor: '#fff',
    pointRadius: 5,
    fill: false
  });

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
