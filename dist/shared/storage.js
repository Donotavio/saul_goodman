import { getTodayKey } from './utils/time.js';
export var StorageKeys;
(function (StorageKeys) {
    StorageKeys["METRICS"] = "sg:metrics";
    StorageKeys["SETTINGS"] = "sg:settings";
})(StorageKeys || (StorageKeys = {}));
const DEFAULT_SETTINGS = {
    productiveDomains: [
        'google.com',
        'docs.google.com',
        'sheets.google.com',
        'drive.google.com',
        'calendar.google.com',
        'github.com',
        'gitlab.com',
        'bitbucket.org',
        'atlassian.com',
        'notion.so',
        'slack.com',
        'microsoft.com',
        'office.com',
        'teams.microsoft.com',
        'outlook.office.com',
        'figma.com',
        'miro.com',
        'zoom.us',
        'meet.google.com',
        'loom.com',
        'asana.com',
        'trello.com'
    ],
    procrastinationDomains: [
        'instagram.com',
        'facebook.com',
        'tiktok.com',
        'x.com',
        'twitter.com',
        'threads.net',
        'snapchat.com',
        'pinterest.com',
        'youtube.com',
        'netflix.com',
        'primevideo.com',
        'globoplay.com',
        'disneyplus.com',
        'twitch.tv',
        'crunchyroll.com',
        '9gag.com',
        'buzzfeed.com',
        'boredpanda.com',
        'reddit.com',
        'amazon.com',
        'mercadolivre.com.br',
        'shopee.com.br',
        'shein.com',
        'whatsapp.com',
        'telegram.org',
        'discord.com',
        'messenger.com',
        'steampowered.com',
        'store.steampowered.com',
        'epicgames.com',
        'roblox.com',
        'valorant.com',
        'pokemongolive.com'
    ],
    weights: {
        procrastinationWeight: 0.6,
        tabSwitchWeight: 0.25,
        inactivityWeight: 0.15
    },
    inactivityThresholdMs: 60000,
    locale: 'pt-BR'
};
const DEFAULT_METRICS = {
    dateKey: getTodayKey(),
    productiveMs: 0,
    procrastinationMs: 0,
    inactiveMs: 0,
    tabSwitches: 0,
    domains: {},
    currentIndex: 0,
    lastUpdated: Date.now()
};
export function getDefaultSettings() {
    return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
}
export async function getSettings() {
    const stored = (await chrome.storage.local.get(StorageKeys.SETTINGS))[StorageKeys.SETTINGS];
    if (stored) {
        return stored;
    }
    const defaults = getDefaultSettings();
    await chrome.storage.local.set({ [StorageKeys.SETTINGS]: defaults });
    return defaults;
}
export async function saveSettings(settings) {
    await chrome.storage.local.set({ [StorageKeys.SETTINGS]: settings });
}
export async function getDailyMetrics() {
    const stored = (await chrome.storage.local.get(StorageKeys.METRICS))[StorageKeys.METRICS];
    if (stored) {
        const metrics = stored;
        if (metrics.dateKey === getTodayKey()) {
            return metrics;
        }
    }
    await chrome.storage.local.set({ [StorageKeys.METRICS]: DEFAULT_METRICS });
    return { ...DEFAULT_METRICS };
}
export async function saveDailyMetrics(metrics) {
    await chrome.storage.local.set({ [StorageKeys.METRICS]: metrics });
}
export async function clearDailyMetrics() {
    const freshMetrics = { ...DEFAULT_METRICS, dateKey: getTodayKey(), lastUpdated: Date.now() };
    await saveDailyMetrics(freshMetrics);
    return freshMetrics;
}
