/**
 * useViewTheme — Central theme configuration for all view components.
 * Ported pixel-perfect from GeminiHydra / Tissaia.
 *
 * Design principles:
 * - Glassmorphism with backdrop-blur
 * - Semi-transparent backgrounds
 * - Light mode: emerald accents, white/slate backgrounds
 * - Dark mode: white accent, dark neutral backgrounds
 */

import { useMemo } from 'react';
import { useTheme } from '@/contexts/ThemeContext';

// ============================================
// INTERFACE
// ============================================

export interface ViewTheme {
  container: string;
  containerInner: string;
  glassPanel: string;
  glassPanelHover: string;
  header: string;
  headerTitle: string;
  headerSubtitle: string;
  headerIcon: string;
  title: string;
  subtitle: string;
  text: string;
  textMuted: string;
  textAccent: string;
  input: string;
  inputIcon: string;
  btnPrimary: string;
  btnSecondary: string;
  btnDanger: string;
  btnGhost: string;
  card: string;
  cardHover: string;
  listItem: string;
  listItemHover: string;
  badge: string;
  badgeAccent: string;
  border: string;
  divider: string;
  scrollbar: string;
  empty: string;
  loading: string;
  error: string;
  dropdown: string;
  dropdownItem: string;
  accentBg: string;
  accentText: string;
  accentBorder: string;
  iconDefault: string;
  iconAccent: string;
  iconMuted: string;
  isLight: boolean;
}

// ============================================
// THEME TOKENS
// ============================================

const LIGHT: ViewTheme = {
  isLight: true,
  container: 'bg-[rgba(255,255,255,0.4)] backdrop-blur-xl',
  containerInner: 'bg-white/30',
  glassPanel: 'bg-white/40 backdrop-blur-xl border border-white/20 shadow-lg',
  glassPanelHover: 'hover:bg-white/50 hover:border-emerald-500/30',
  header: 'bg-white/30 backdrop-blur-xl border-b border-white/20',
  headerTitle: 'text-black font-bold',
  headerSubtitle: 'text-gray-600',
  headerIcon: 'text-emerald-600',
  title: 'text-black',
  subtitle: 'text-gray-600',
  text: 'text-black',
  textMuted: 'text-gray-700',
  textAccent: 'text-emerald-600',
  input:
    'bg-white/50 border border-slate-200/50 text-black placeholder:text-gray-400 focus:border-emerald-500/50 focus:bg-white/70 rounded-xl outline-none transition-all',
  inputIcon: 'text-gray-400',
  btnPrimary:
    'bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-700 border border-emerald-500/30 backdrop-blur-sm rounded-xl transition-all',
  btnSecondary:
    'bg-white/30 hover:bg-white/50 text-gray-700 border border-slate-200/50 backdrop-blur-sm rounded-xl transition-all',
  btnDanger:
    'bg-red-500/10 hover:bg-red-500/20 text-red-600 border border-red-500/20 backdrop-blur-sm rounded-xl transition-all',
  btnGhost: 'hover:bg-slate-500/10 text-gray-700 rounded-xl transition-all',
  card: 'bg-white/40 backdrop-blur-sm border border-white/20 rounded-2xl shadow-md',
  cardHover: 'hover:bg-white/50 hover:border-emerald-500/30 hover:shadow-lg',
  listItem: 'bg-white/30 border border-white/10 rounded-xl',
  listItemHover: 'hover:bg-white/50 hover:border-emerald-500/20',
  badge: 'bg-slate-500/10 text-gray-700 border border-slate-200/50 rounded-md px-2 py-1 text-xs',
  badgeAccent: 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 rounded-md px-2 py-1 text-xs',
  border: 'border-slate-200/50',
  divider: 'border-t border-slate-200/30',
  scrollbar: 'scrollbar-thin scrollbar-thumb-slate-300 scrollbar-track-transparent',
  empty: 'text-gray-400 italic',
  loading: 'text-emerald-600 animate-pulse',
  error: 'text-red-600 bg-red-500/10 border border-red-500/20 rounded-xl p-4',
  dropdown: 'bg-white/95 backdrop-blur-xl border border-slate-200/50 rounded-xl shadow-xl',
  dropdownItem: 'hover:bg-emerald-500/10 text-black rounded-lg transition-all',
  accentBg: 'bg-emerald-500/10',
  accentText: 'text-emerald-600',
  accentBorder: 'border-emerald-500/30',
  iconDefault: 'text-gray-700',
  iconAccent: 'text-emerald-600',
  iconMuted: 'text-gray-500',
};

const DARK: ViewTheme = {
  isLight: false,
  container: 'bg-black/20 backdrop-blur-sm',
  containerInner: 'bg-black/30',
  glassPanel: 'bg-black/40 backdrop-blur-xl border border-white/10 shadow-2xl',
  glassPanelHover: 'hover:bg-black/50 hover:border-white/20',
  header: 'bg-black/30 backdrop-blur-xl border-b border-white/10',
  headerTitle: 'text-white font-bold',
  headerSubtitle: 'text-white/75',
  headerIcon: 'text-white',
  title: 'text-white',
  subtitle: 'text-white/80',
  text: 'text-white',
  textMuted: 'text-white/85',
  textAccent: 'text-white',
  input:
    'bg-black/30 border border-white/10 text-white placeholder:text-white/30 focus:border-white/40 focus:bg-black/50 rounded-xl outline-none transition-all',
  inputIcon: 'text-white/40',
  btnPrimary:
    'bg-white/10 hover:bg-white/20 text-white border border-white/20 backdrop-blur-sm rounded-xl transition-all',
  btnSecondary:
    'bg-white/5 hover:bg-white/10 text-white/80 border border-white/10 backdrop-blur-sm rounded-xl transition-all',
  btnDanger:
    'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 backdrop-blur-sm rounded-xl transition-all',
  btnGhost: 'hover:bg-white/5 text-white/65 rounded-xl transition-all',
  card: 'bg-black/40 backdrop-blur-sm border border-white/5 rounded-2xl shadow-lg',
  cardHover: 'hover:bg-black/50 hover:border-white/20 hover:shadow-xl',
  listItem: 'bg-black/30 border border-white/5 rounded-xl',
  listItemHover: 'hover:bg-black/40 hover:border-white/10',
  badge: 'bg-white/5 text-white/75 border border-white/10 rounded-md px-2 py-1 text-xs',
  badgeAccent: 'bg-white/10 text-white border border-white/20 rounded-md px-2 py-1 text-xs',
  border: 'border-white/10',
  divider: 'border-t border-white/5',
  scrollbar: 'scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent',
  empty: 'text-white/40 italic',
  loading: 'text-white animate-pulse',
  error: 'text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl p-4',
  dropdown: 'bg-black/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-2xl',
  dropdownItem: 'hover:bg-white/5 text-white/80 rounded-lg transition-all',
  accentBg: 'bg-white/10',
  accentText: 'text-white',
  accentBorder: 'border-white/20',
  iconDefault: 'text-white/70',
  iconAccent: 'text-white',
  iconMuted: 'text-white/70',
};

// ============================================
// HOOK
// ============================================

export const useViewTheme = (): ViewTheme => {
  const { resolvedTheme } = useTheme();
  const isLight = resolvedTheme === 'light';

  return useMemo(() => (isLight ? LIGHT : DARK), [isLight]);
};

export default useViewTheme;
