'use client';

import { Bot, Brain, Shield, Swords, Wand2, Zap } from 'lucide-react';

const AGENTS = [
  {
    name: 'Geralt',
    role: 'Security & Protection',
    icon: Shield,
    color: 'text-amber-400',
    desc: 'Bezpieczeństwo projektu, walidacja wejść, audyt kodu.',
  },
  {
    name: 'Yennefer',
    role: 'Architecture & Design',
    icon: Wand2,
    color: 'text-purple-400',
    desc: 'Architektura systemu, wzorce projektowe, refactoring.',
  },
  {
    name: 'Triss',
    role: 'Frontend & UX',
    icon: Zap,
    color: 'text-pink-400',
    desc: 'Komponenty UI, dostępność, responsywność.',
  },
  {
    name: 'Jaskier',
    role: 'Documentation & Comms',
    icon: Bot,
    color: 'text-yellow-400',
    desc: 'Dokumentacja, README, changelog, komunikacja.',
  },
  {
    name: 'Vesemir',
    role: 'Code Review & Mentoring',
    icon: Brain,
    color: 'text-blue-400',
    desc: 'Code review, najlepsze praktyki, mentoring.',
  },
  {
    name: 'Lambert',
    role: 'Testing & QA',
    icon: Swords,
    color: 'text-red-400',
    desc: 'Testy jednostkowe, integracyjne, E2E, QA.',
  },
  {
    name: 'Eskel',
    role: 'DevOps & Infrastructure',
    icon: Zap,
    color: 'text-green-400',
    desc: 'CI/CD, Docker, deployment, monitorowanie.',
  },
  {
    name: 'Regis',
    role: 'Analysis & Strategy',
    icon: Brain,
    color: 'text-cyan-400',
    desc: 'Analiza głęboka, strategia, planowanie.',
  },
  {
    name: 'Dijkstra',
    role: 'Intelligence & Research',
    icon: Bot,
    color: 'text-indigo-400',
    desc: 'Badania, analiza danych, wywiad technologiczny.',
  },
  {
    name: 'Philippa',
    role: 'API & Integration',
    icon: Zap,
    color: 'text-violet-400',
    desc: 'Integracja API, protokoły, middleware.',
  },
  {
    name: 'Zoltan',
    role: 'Performance & Optimization',
    icon: Swords,
    color: 'text-orange-400',
    desc: 'Wydajność, optymalizacja, profilowanie.',
  },
  {
    name: 'Ciri',
    role: 'Innovation & Experiments',
    icon: Wand2,
    color: 'text-emerald-400',
    desc: 'Nowe technologie, eksperymenty, prototypy.',
  },
];

export default function AgentsPage() {
  return (
    <div className="h-full flex flex-col overflow-auto p-4">
      <h2 className="text-lg font-semibold text-[var(--matrix-accent)] mb-4">Agenci Swarm</h2>
      <p className="text-sm text-[var(--matrix-text-secondary)] mb-6">
        12 wyspecjalizowanych agentów AI zarządzanych przez ClaudeHydra.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {AGENTS.map((agent) => {
          const Icon = agent.icon;
          return (
            <div
              key={agent.name}
              className="glass-card p-4 space-y-2 hover:border-[var(--matrix-accent)]/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg bg-[var(--matrix-bg-secondary)] flex items-center justify-center ${agent.color}`}
                >
                  <Icon size={20} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-[var(--matrix-text-primary)]">
                    {agent.name}
                  </h3>
                  <p className="text-[10px] text-[var(--matrix-text-secondary)]">{agent.role}</p>
                </div>
              </div>
              <p className="text-xs text-[var(--matrix-text-secondary)]">{agent.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
