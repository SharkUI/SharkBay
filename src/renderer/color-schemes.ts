// Terminal color schemes sourced from iTerm2-Color-Schemes (https://github.com/mbadolato/iTerm2-Color-Schemes)
// Format matches xterm.js ITheme interface.

export type ColorScheme = {
  id: string;
  name: string;
  theme: {
    background: string;
    foreground: string;
    cursor: string;
    selectionBackground: string;
    black: string;
    red: string;
    green: string;
    yellow: string;
    blue: string;
    magenta: string;
    cyan: string;
    white: string;
    brightBlack: string;
    brightRed: string;
    brightGreen: string;
    brightYellow: string;
    brightBlue: string;
    brightMagenta: string;
    brightCyan: string;
    brightWhite: string;
  };
};

export const colorSchemes: ColorScheme[] = [
  { id: "dracula", name: "Dracula", theme: { background: "#282a36", foreground: "#f8f8f2", cursor: "#f8f8f2", selectionBackground: "#44475a", black: "#21222c", red: "#ff5555", green: "#50fa7b", yellow: "#f1fa8c", blue: "#bd93f9", magenta: "#ff79c6", cyan: "#8be9fd", white: "#f8f8f2", brightBlack: "#6272a4", brightRed: "#ff6e6e", brightGreen: "#69ff94", brightYellow: "#ffffa5", brightBlue: "#d6acff", brightMagenta: "#ff92df", brightCyan: "#a4ffff", brightWhite: "#ffffff" }},
  { id: "nord", name: "Nord", theme: { background: "#2e3440", foreground: "#d8dee9", cursor: "#eceff4", selectionBackground: "#eceff4", black: "#3b4252", red: "#bf616a", green: "#a3be8c", yellow: "#ebcb8b", blue: "#81a1c1", magenta: "#b48ead", cyan: "#88c0d0", white: "#e5e9f0", brightBlack: "#596377", brightRed: "#bf616a", brightGreen: "#a3be8c", brightYellow: "#ebcb8b", brightBlue: "#81a1c1", brightMagenta: "#b48ead", brightCyan: "#8fbcbb", brightWhite: "#eceff4" }},
  { id: "catppuccin-mocha", name: "Catppuccin Mocha", theme: { background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0dc", selectionBackground: "#585b70", black: "#45475a", red: "#f38ba8", green: "#a6e3a1", yellow: "#f9e2af", blue: "#89b4fa", magenta: "#f5c2e7", cyan: "#94e2d5", white: "#a6adc8", brightBlack: "#585b70", brightRed: "#f37799", brightGreen: "#89d88b", brightYellow: "#ebd391", brightBlue: "#74a8fc", brightMagenta: "#f2aede", brightCyan: "#6bd7ca", brightWhite: "#bac2de" }},
  { id: "gruvbox-dark", name: "Gruvbox Dark", theme: { background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", selectionBackground: "#665c54", black: "#282828", red: "#cc241d", green: "#98971a", yellow: "#d79921", blue: "#458588", magenta: "#b16286", cyan: "#689d6a", white: "#a89984", brightBlack: "#928374", brightRed: "#fb4934", brightGreen: "#b8bb26", brightYellow: "#fabd2f", brightBlue: "#83a598", brightMagenta: "#d3869b", brightCyan: "#8ec07c", brightWhite: "#ebdbb2" }},
  { id: "atom-one-dark", name: "Atom One Dark", theme: { background: "#21252b", foreground: "#abb2bf", cursor: "#abb2bf", selectionBackground: "#323844", black: "#21252b", red: "#e06c75", green: "#98c379", yellow: "#e5c07b", blue: "#61afef", magenta: "#c678dd", cyan: "#56b6c2", white: "#abb2bf", brightBlack: "#767676", brightRed: "#e06c75", brightGreen: "#98c379", brightYellow: "#e5c07b", brightBlue: "#61afef", brightMagenta: "#c678dd", brightCyan: "#56b6c2", brightWhite: "#abb2bf" }},
  { id: "github-dark", name: "GitHub Dark", theme: { background: "#101216", foreground: "#8b949e", cursor: "#c9d1d9", selectionBackground: "#3b5070", black: "#000000", red: "#f78166", green: "#56d364", yellow: "#e3b341", blue: "#6ca4f8", magenta: "#db61a2", cyan: "#2b7489", white: "#ffffff", brightBlack: "#4d4d4d", brightRed: "#f78166", brightGreen: "#56d364", brightYellow: "#e3b341", brightBlue: "#6ca4f8", brightMagenta: "#db61a2", brightCyan: "#2b7489", brightWhite: "#ffffff" }},
  { id: "nightfox", name: "Nightfox", theme: { background: "#192330", foreground: "#cdcecf", cursor: "#cdcecf", selectionBackground: "#2b3b51", black: "#393b44", red: "#c94f6d", green: "#81b29a", yellow: "#dbc074", blue: "#719cd6", magenta: "#9d79d6", cyan: "#63cdcf", white: "#dfdfe0", brightBlack: "#575860", brightRed: "#d16983", brightGreen: "#8ebaa4", brightYellow: "#e0c989", brightBlue: "#86abdc", brightMagenta: "#baa1e2", brightCyan: "#7ad5d6", brightWhite: "#e4e4e5" }},
  { id: "kanagawa-dragon", name: "Kanagawa Dragon", theme: { background: "#181616", foreground: "#c5c9c5", cursor: "#c8c093", selectionBackground: "#c5c9c5", black: "#0d0c0c", red: "#c4746e", green: "#8a9a7b", yellow: "#c4b28a", blue: "#8ba4b0", magenta: "#a292a3", cyan: "#8ea4a2", white: "#c8c093", brightBlack: "#a6a69c", brightRed: "#e46876", brightGreen: "#87a987", brightYellow: "#e6c384", brightBlue: "#7fb4ca", brightMagenta: "#938aa9", brightCyan: "#7aa89f", brightWhite: "#c5c9c5" }},
  { id: "monokai-soda", name: "Monokai Soda", theme: { background: "#1a1a1a", foreground: "#c4c5b5", cursor: "#f6f7ec", selectionBackground: "#343434", black: "#1a1a1a", red: "#f4005f", green: "#98e024", yellow: "#fa8419", blue: "#9d65ff", magenta: "#f4005f", cyan: "#58d1eb", white: "#c4c5b5", brightBlack: "#625e4c", brightRed: "#f4005f", brightGreen: "#98e024", brightYellow: "#e0d561", brightBlue: "#9d65ff", brightMagenta: "#f4005f", brightCyan: "#58d1eb", brightWhite: "#f6f6ef" }},
  { id: "ayu-mirage", name: "Ayu Mirage", theme: { background: "#1f2430", foreground: "#cccac2", cursor: "#ffcc66", selectionBackground: "#409fff", black: "#171b24", red: "#ed8274", green: "#87d96c", yellow: "#facc6e", blue: "#6dcbfa", magenta: "#dabafa", cyan: "#90e1c6", white: "#c7c7c7", brightBlack: "#686868", brightRed: "#f28779", brightGreen: "#d5ff80", brightYellow: "#ffd173", brightBlue: "#73d0ff", brightMagenta: "#dfbfff", brightCyan: "#95e6cb", brightWhite: "#ffffff" }},
  { id: "snazzy", name: "Snazzy", theme: { background: "#1e1f29", foreground: "#ebece6", cursor: "#e4e4e4", selectionBackground: "#81aec6", black: "#000000", red: "#fc4346", green: "#50fb7c", yellow: "#f0fb8c", blue: "#49baff", magenta: "#fc4cb4", cyan: "#8be9fe", white: "#ededec", brightBlack: "#555555", brightRed: "#fc4346", brightGreen: "#50fb7c", brightYellow: "#f0fb8c", brightBlue: "#49baff", brightMagenta: "#fc4cb4", brightCyan: "#8be9fe", brightWhite: "#ededec" }},
  { id: "material-dark", name: "Material Dark", theme: { background: "#232322", foreground: "#e5e5e5", cursor: "#16afca", selectionBackground: "#dfdfdf", black: "#212121", red: "#b7141f", green: "#457b24", yellow: "#f6981e", blue: "#134eb2", magenta: "#701aa2", cyan: "#0e717c", white: "#efefef", brightBlack: "#4f4f4f", brightRed: "#e83b3f", brightGreen: "#7aba3a", brightYellow: "#ffea2e", brightBlue: "#54a4f3", brightMagenta: "#aa4dbc", brightCyan: "#26bbd1", brightWhite: "#d9d9d9" }},
  { id: "solarized-darcula", name: "Solarized Darcula", theme: { background: "#3d3f41", foreground: "#d2d8d9", cursor: "#708284", selectionBackground: "#214283", black: "#25292a", red: "#f24840", green: "#629655", yellow: "#b68800", blue: "#2075c7", magenta: "#797fd4", cyan: "#15968d", white: "#d2d8d9", brightBlack: "#65696a", brightRed: "#f24840", brightGreen: "#629655", brightYellow: "#b68800", brightBlue: "#2075c7", brightMagenta: "#797fd4", brightCyan: "#15968d", brightWhite: "#d2d8d9" }},
  // Light schemes
  { id: "catppuccin-latte", name: "Catppuccin Latte", theme: { background: "#eff1f5", foreground: "#4c4f69", cursor: "#dc8a78", selectionBackground: "#acb0be", black: "#5c5f77", red: "#d20f39", green: "#40a02b", yellow: "#df8e1d", blue: "#1e66f5", magenta: "#ea76cb", cyan: "#179299", white: "#acb0be", brightBlack: "#6c6f85", brightRed: "#de293e", brightGreen: "#49af3d", brightYellow: "#eea02d", brightBlue: "#456eff", brightMagenta: "#fe85d8", brightCyan: "#2d9fa8", brightWhite: "#bcc0cc" }},
  { id: "atom-one-light", name: "Atom One Light", theme: { background: "#f9f9f9", foreground: "#2a2c33", cursor: "#bbbbbb", selectionBackground: "#ededed", black: "#000000", red: "#de3e35", green: "#3f953a", yellow: "#d2b67c", blue: "#2f5af3", magenta: "#950095", cyan: "#3f953a", white: "#bbbbbb", brightBlack: "#000000", brightRed: "#de3e35", brightGreen: "#3f953a", brightYellow: "#d2b67c", brightBlue: "#2f5af3", brightMagenta: "#a00095", brightCyan: "#3f953a", brightWhite: "#ffffff" }},
];

export function getColorScheme(id: string): ColorScheme | undefined {
  return colorSchemes.find((s) => s.id === id);
}
