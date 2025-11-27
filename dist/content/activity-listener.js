"use strict";
const INACTIVITY_PING_MS = 15000;
let lastEventTimestamp = Date.now();
let intervalId = null;
function setupActivityTracking() {
    const handler = () => {
        lastEventTimestamp = Date.now();
        void sendPing();
    };
    window.addEventListener('mousemove', handler);
    window.addEventListener('mousedown', handler);
    window.addEventListener('keydown', handler);
    window.addEventListener('scroll', handler, { passive: true });
    intervalId = window.setInterval(() => {
        void sendPing();
    }, INACTIVITY_PING_MS);
}
async function sendPing() {
    try {
        chrome.runtime.sendMessage({
            type: 'activity-ping',
            payload: { timestamp: lastEventTimestamp }
        });
    }
    catch (error) {
        if (intervalId) {
            window.clearInterval(intervalId);
        }
        console.warn('Saul Goodman content ping falhou:', error);
    }
}
setupActivityTracking();
