import { Plus, Save, ToggleLeft, ToggleRight, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { claudeIpc } from '../lib/ipc';
import { useClaudeStore } from '../stores/claudeStore';
import type { ApprovalRule, ToolType } from '../types/claude';

export function RulesView() {
  const { rules, setRules } = useClaudeStore();
  const [editingRule, setEditingRule] = useState<ApprovalRule | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  // Load rules on mount
  useEffect(() => {
    claudeIpc.getRules().then(setRules).catch(console.error);
  }, [setRules]);

  const handleToggleRule = (ruleId: string) => {
    const newRules = rules.map((r) => (r.id === ruleId ? { ...r, enabled: !r.enabled } : r));
    setRules(newRules);
    setHasChanges(true);
  };

  const handleToggleAutoApprove = (ruleId: string) => {
    const newRules = rules.map((r) =>
      r.id === ruleId ? { ...r, auto_approve: !r.auto_approve } : r,
    );
    setRules(newRules);
    setHasChanges(true);
  };

  const handleDeleteRule = (ruleId: string) => {
    const newRules = rules.filter((r) => r.id !== ruleId);
    setRules(newRules);
    setHasChanges(true);
  };

  const handleAddRule = () => {
    const newRule: ApprovalRule = {
      id: crypto.randomUUID(),
      name: 'New Rule',
      description: 'Description',
      pattern: '.*',
      tool: 'bash',
      enabled: true,
      auto_approve: false,
    };
    setEditingRule(newRule);
  };

  const handleSaveRule = () => {
    if (!editingRule) return;

    const existingIndex = rules.findIndex((r) => r.id === editingRule.id);
    if (existingIndex >= 0) {
      const newRules = [...rules];
      newRules[existingIndex] = editingRule;
      setRules(newRules);
    } else {
      setRules([...rules, editingRule]);
    }

    setEditingRule(null);
    setHasChanges(true);
  };

  const handleSaveAll = async () => {
    try {
      await claudeIpc.updateRules(rules);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save rules:', error);
    }
  };

  const toolTypes: ToolType[] = ['bash', 'write', 'edit', 'read', 'webfetch', 'mcptool', 'all'];

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold text-matrix-accent">Auto-Approve Rules</h2>
        <div className="flex gap-2">
          <button onClick={handleAddRule} className="glass-button flex items-center gap-2 text-sm">
            <Plus size={14} />
            Add Rule
          </button>
          {hasChanges && (
            <button
              onClick={handleSaveAll}
              className="glass-button glass-button-primary flex items-center gap-2 text-sm"
            >
              <Save size={14} />
              Save All
            </button>
          )}
        </div>
      </div>

      {/* Rules List */}
      <div className="flex-1 glass-panel p-4 overflow-y-auto">
        {rules.length === 0 ? (
          <div className="text-center py-8 text-matrix-text-dim">
            <p>No rules configured.</p>
            <p className="text-xs mt-2">Add rules to auto-approve common actions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {rules.map((rule) => (
              <div key={rule.id} className={`glass-card p-4 ${!rule.enabled ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold">{rule.name}</h3>
                      <span className="text-xs px-2 py-0.5 rounded bg-matrix-accent/20 text-matrix-accent">
                        {rule.tool}
                      </span>
                    </div>
                    <p className="text-xs text-matrix-text-dim mt-1">{rule.description}</p>
                    <code className="text-xs text-blue-400 mt-2 block font-mono">
                      /{rule.pattern}/
                    </code>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Auto-approve toggle */}
                    <button
                      onClick={() => handleToggleAutoApprove(rule.id)}
                      className={`text-xs flex items-center gap-1 ${
                        rule.auto_approve ? 'text-matrix-accent' : 'text-matrix-text-dim'
                      }`}
                      title="Toggle auto-approve"
                    >
                      {rule.auto_approve ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                      Auto
                    </button>

                    {/* Enable toggle */}
                    <button
                      onClick={() => handleToggleRule(rule.id)}
                      className={`text-xs ${rule.enabled ? 'text-green-400' : 'text-red-400'}`}
                      title="Toggle enabled"
                    >
                      {rule.enabled ? 'ON' : 'OFF'}
                    </button>

                    {/* Delete */}
                    <button
                      onClick={() => handleDeleteRule(rule.id)}
                      className="text-red-400 hover:text-red-300"
                      title="Delete rule"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Modal */}
      {editingRule && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="glass-panel p-6 w-full max-w-md animate-slide-up">
            <h3 className="text-lg font-semibold text-matrix-accent mb-4">
              {rules.some((r) => r.id === editingRule.id) ? 'Edit Rule' : 'New Rule'}
            </h3>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-matrix-text mb-1">Name</label>
                <input
                  type="text"
                  value={editingRule.name}
                  onChange={(e) => setEditingRule({ ...editingRule, name: e.target.value })}
                  className="w-full glass-input"
                />
              </div>

              <div>
                <label className="block text-sm text-matrix-text mb-1">Description</label>
                <input
                  type="text"
                  value={editingRule.description}
                  onChange={(e) => setEditingRule({ ...editingRule, description: e.target.value })}
                  className="w-full glass-input"
                />
              </div>

              <div>
                <label className="block text-sm text-matrix-text mb-1">Tool Type</label>
                <select
                  value={editingRule.tool}
                  onChange={(e) =>
                    setEditingRule({
                      ...editingRule,
                      tool: e.target.value as ToolType,
                    })
                  }
                  className="w-full glass-input"
                >
                  {toolTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm text-matrix-text mb-1">Pattern (Regex)</label>
                <input
                  type="text"
                  value={editingRule.pattern}
                  onChange={(e) => setEditingRule({ ...editingRule, pattern: e.target.value })}
                  className="w-full glass-input font-mono"
                  placeholder="^git\s+status"
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editingRule.enabled}
                    onChange={(e) => setEditingRule({ ...editingRule, enabled: e.target.checked })}
                    className="accent-matrix-accent"
                  />
                  Enabled
                </label>

                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={editingRule.auto_approve}
                    onChange={(e) =>
                      setEditingRule({
                        ...editingRule,
                        auto_approve: e.target.checked,
                      })
                    }
                    className="accent-matrix-accent"
                  />
                  Auto-Approve
                </label>
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={() => setEditingRule(null)} className="glass-button flex-1">
                Cancel
              </button>
              <button onClick={handleSaveRule} className="glass-button glass-button-primary flex-1">
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
