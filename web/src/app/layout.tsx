import type { Metadata } from 'next';
import { AppShell } from '@/components/AppShell';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'ClaudeHydra',
  description: 'Hybrid MCP Server with AI Agent Swarm',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pl" data-theme="dark" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          <AppShell>{children}</AppShell>
        </Providers>
      </body>
    </html>
  );
}
