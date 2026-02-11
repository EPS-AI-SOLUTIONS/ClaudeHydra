import { Check, FileEdit, Globe, Plug, Terminal, X } from 'lucide-react';
import { useClaude } from '../hooks/useClaude';
import { formatApprovalType } from '../types/claude';

export function ApprovalDialog() {
  const { pendingApproval, approve, deny } = useClaude();

  if (!pendingApproval?.approval_type) return null;

  const approval = pendingApproval.approval_type;

  const getIcon = () => {
    switch (approval.type) {
      case 'bash_command':
        return <Terminal size={20} className="text-blue-400" />;
      case 'file_write':
      case 'file_edit':
      case 'file_read':
        return <FileEdit size={20} className="text-yellow-400" />;
      case 'web_fetch':
        return <Globe size={20} className="text-purple-400" />;
      case 'mcp_tool':
        return <Plug size={20} className="text-green-400" />;
      default:
        return <Terminal size={20} />;
    }
  };

  const getDetails = () => {
    switch (approval.type) {
      case 'bash_command':
        return (
          <div className="mt-2 p-2 bg-black/30 rounded text-xs font-mono overflow-x-auto">
            <code className="text-matrix-accent">{approval.command}</code>
            {approval.description && (
              <p className="text-matrix-text-dim mt-1">{approval.description}</p>
            )}
          </div>
        );
      case 'file_write':
        return (
          <div className="mt-2 text-xs">
            <span className="text-matrix-text-dim">Path: </span>
            <code className="text-yellow-400">{approval.path}</code>
          </div>
        );
      case 'file_edit':
        return (
          <div className="mt-2 text-xs">
            <span className="text-matrix-text-dim">Path: </span>
            <code className="text-yellow-400">{approval.path}</code>
            {approval.changes && (
              <div className="mt-1 p-2 bg-black/30 rounded font-mono overflow-x-auto">
                <span className="text-red-400">- </span>
                <span className="text-matrix-text-dim">{approval.changes.slice(0, 100)}...</span>
              </div>
            )}
          </div>
        );
      case 'file_read':
        return (
          <div className="mt-2 text-xs">
            <span className="text-matrix-text-dim">Path: </span>
            <code className="text-green-400">{approval.path}</code>
          </div>
        );
      case 'web_fetch':
        return (
          <div className="mt-2 text-xs">
            <span className="text-matrix-text-dim">URL: </span>
            <code className="text-purple-400">{approval.url}</code>
          </div>
        );
      case 'mcp_tool':
        return (
          <div className="mt-2 text-xs">
            <span className="text-matrix-text-dim">Server: </span>
            <code className="text-blue-400">{approval.server}</code>
            <span className="text-matrix-text-dim ml-2">Tool: </span>
            <code className="text-green-400">{approval.tool}</code>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="approval-dialog glass-panel p-4 animate-slide-up border-glow">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 p-2 rounded-lg bg-matrix-accent/10">{getIcon()}</div>

        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-matrix-accent">Approval Required</h3>
          <p className="text-xs text-matrix-text-dim mt-1">{formatApprovalType(approval)}</p>

          {getDetails()}

          {/* Actions */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={approve}
              className="glass-button glass-button-primary flex-1 flex items-center justify-center gap-2 text-sm"
            >
              <Check size={16} />
              Allow
            </button>
            <button
              onClick={deny}
              className="glass-button glass-button-danger flex-1 flex items-center justify-center gap-2 text-sm"
            >
              <X size={16} />
              Deny
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
