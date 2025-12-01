const toast = document.getElementById('toast');
const toastImage = toast?.querySelector('img');
const toastMessage = toast?.querySelector('p');
const toastButton = document.getElementById('toastDemo');
let toastTimeout;

function showToast(message) {
  if (!toast) return;
  toast.classList.add('show');
  if (toastMessage) toastMessage.textContent = message;
  if (toastImage) toastImage.src = 'assets/saul_like.png';
  toastTimeout && clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

toastButton?.addEventListener('click', () => {
  showToast('Saul aprovou sua defesa. Continue focado!');
});

const counters = document.querySelectorAll('[data-counter]');
const counterObserver = new IntersectionObserver(
  (entries, observer) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const target = Number(el.getAttribute('data-counter')) || 0;
      let current = 0;
      const step = Math.max(1, Math.floor(target / 40));
      const interval = setInterval(() => {
        current += step;
        if (current >= target) {
          el.textContent = target.toString();
          clearInterval(interval);
        } else {
          el.textContent = current.toString();
        }
      }, 40);
      observer.unobserve(el);
    });
  },
  { threshold: 0.4 }
);

counters.forEach((counter) => counterObserver.observe(counter));

window.addEventListener('scroll', () => {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const offset = window.scrollY;
  hero.style.backgroundPosition = `center ${offset * 0.25}px`;
});
