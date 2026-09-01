/**
 * Theme Management Helper Module
 * Manages color theme switching across extension UI views.
 */

export const THEMES = [
  { id: 'midnight', name: 'Midnight Cyber', icon: '🌙', color: '#6366f1' },
  { id: 'vercel', name: 'Vercel Dark', icon: '▲', color: '#0070f3' },
  { id: 'synthwave', name: 'Neon Synthwave', icon: '🌌', color: '#ec4899' },
  { id: 'emerald', name: 'Forest Emerald', icon: '🌲', color: '#10b981' },
  { id: 'solar', name: 'Solar Flare', icon: '⚡', color: '#f59e0b' },
  { id: 'light', name: 'Clean Light', icon: '☀️', color: '#4f46e5' }
];

export function applyTheme(themeId) {
  const validTheme = THEMES.find(t => t.id === themeId) ? themeId : 'midnight';
  document.documentElement.setAttribute('data-theme', validTheme);
  return validTheme;
}

export async function initTheme() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'GET_SETTINGS' });
    if (res && res.success && res.settings && res.settings.theme) {
      applyTheme(res.settings.theme);
      return res.settings.theme;
    }
  } catch (e) {}
  applyTheme('midnight');
  return 'midnight';
}
