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

// Gamma / Max Pain chart colours. Night values are brightened for the dark panel and
// match the snapshot-card swatches in theme-dark.css; day values keep the original
// palette, with the underlying-price marker a little darker for legibility.
const STRUCTURE = {
  dark: {base:'#4d8ef0', without:'#e09440', comparison:'#a07ad6', call:'#34d399', put:'#fb7185', net:'#dbe3ee', spot:'#e8edf3', zero:'#c4a5f5'},
  light: {base:'#2867c7', without:'#c47a24', comparison:'#8555b6', call:'#168b68', put:'#d34d68', net:'#718096', spot:'#4b5a70', zero:'#9360ad'},
};

export function structurePalette(theme = chartTheme()) {
  return STRUCTURE[theme] || STRUCTURE.dark;
}
