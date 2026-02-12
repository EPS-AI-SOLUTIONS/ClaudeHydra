import { Brain, Shield, Terminal, Zap } from 'lucide-react';
import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center h-full bg-grid-pattern p-8">
      <div className="glass-card max-w-2xl w-full p-8 text-center space-y-6">
        {/* Logo */}
        <div className="flex items-center justify-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-[var(--matrix-accent)] flex items-center justify-center">
            <Zap className="w-7 h-7 text-[var(--matrix-bg-primary)]" />
          </div>
          <h1 className="text-3xl font-bold text-[var(--matrix-accent)] text-glow font-mono">
            ClaudeHydra
          </h1>
        </div>

        <p className="text-[var(--matrix-text-secondary)] text-sm">
          Hybrid MCP Server with AI Agent Swarm &mdash; v3.0.0 Web Edition
        </p>

        {/* Feature cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
          <FeatureCard
            icon={<Brain className="w-5 h-5" />}
            title="Swarm AI"
            desc="12 agentów Witcher"
          />
          <FeatureCard
            icon={<Terminal className="w-5 h-5" />}
            title="Ollama"
            desc="Lokalne modele LLM"
          />
          <FeatureCard
            icon={<Shield className="w-5 h-5" />}
            title="MCP Bridge"
            desc="Claude integration"
          />
        </div>

        {/* Quick nav */}
        <div className="flex flex-wrap justify-center gap-3 mt-6">
          <Link href="/chat" className="btn btn-primary">
            Otwórz Chat
          </Link>
          <Link href="/agents" className="btn btn-secondary">
            Agenci
          </Link>
          <Link href="/settings" className="btn btn-ghost">
            Ustawienia
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="card card-interactive text-center space-y-2">
      <div className="text-[var(--matrix-accent)] flex justify-center">{icon}</div>
      <h3 className="text-sm font-semibold text-[var(--matrix-text-primary)]">{title}</h3>
      <p className="text-xs text-[var(--matrix-text-secondary)]">{desc}</p>
    </div>
  );
}
