// Chart line/bar colours per display mode (see theme-mode.js). Both palettes keep the
// same hierarchy: daily PCR is the quietest background texture, 20 vs 60 sessions
// stand out, 5 sessions sits between. Night colours are brightened for the dark
// surface; day colours are deepened for contrast on white. Outside a browser (tests,
// server) the night palette is used, matching the default mode.
const PALETTES = {
  dark: {daily:'#6b7686', r5:'#2fbfa8', r20:'#5a9bff', r60:'#f2a541', volume:'#5a9bff', oi:'#6a778c', previous:'#8a96a8'},
  light: {daily:'#9aa3b0', r5:'#12867a', r20:'#2563c9', r60:'#d9771e', volume:'#2563c9', oi:'#6a778c', previous:'#8a96a8'},
};

export function chartTheme() {
  try { return globalThis.document?.documentElement?.getAttribute('data-theme') === 'light' ? 'light' : 'dark'; }
  catch { return 'dark'; }
}

export function chartPalette(theme = chartTheme()) {
  return PALETTES[theme] || PALETTES.dark;
}
