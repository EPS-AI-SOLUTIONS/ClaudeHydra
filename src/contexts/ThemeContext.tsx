// src/contexts/ThemeContext.tsx
// Re-exports shared ThemeContext from @jaskier/ui.
// ClaudeHydra passes storageKey="claude-hydra-theme" at the ThemeProvider call-site in AppShell.

export type { ResolvedTheme, Theme } from '@jaskier/ui';
export { ThemeContext, ThemeProvider, useTheme } from '@jaskier/ui';
