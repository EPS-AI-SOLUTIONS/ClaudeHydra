// TypeScript types for Claude GUI

export type ApprovalType =
  | { type: 'bash_command'; command: string; description?: string }
  | { type: 'file_write'; path: string }
  | { type: 'file_edit'; path: string; changes?: string }
  | { type: 'file_read'; path: string }
  | { type: 'web_fetch'; url: string }
  | { type: 'mcp_tool'; server: string; tool: string; input?: unknown };

export interface ClaudeEvent {
  id: string;
  timestamp: string;
  event_type: string;
  data: Record<string, unknown>;
  requires_approval: boolean;
  approval_type?: ApprovalType;
}

export interface ApprovalRule {
  id: string;
  name: string;
  description: string;
  pattern: string;
  tool: ToolType;
  enabled: boolean;
  auto_approve: boolean;
}

export type ToolType = 'bash' | 'write' | 'edit' | 'read' | 'webfetch' | 'mcptool' | 'all';

export interface ApprovalHistoryEntry {
  id: string;
  timestamp: string;
  approval_type: ApprovalType;
  action: 'approved' | 'denied';
  auto_approved: boolean;
  matched_rule?: string;
}

export interface SessionStatus {
  is_active: boolean;
  session_id?: string;
  working_dir?: string;
  started_at?: string;
  pending_approval: boolean;
  auto_approve_all: boolean;
  approved_count: number;
  denied_count: number;
  auto_approved_count: number;
}

export interface AutoApprovedEvent {
  event: ClaudeEvent;
  matched_rule: string;
}

// Helper to format approval type for display
export function formatApprovalType(approval: ApprovalType): string {
  switch (approval.type) {
    case 'bash_command':
      return `Bash: ${approval.command}`;
    case 'file_write':
      return `Write: ${approval.path}`;
    case 'file_edit':
      return `Edit: ${approval.path}`;
    case 'file_read':
      return `Read: ${approval.path}`;
    case 'web_fetch':
      return `Fetch: ${approval.url}`;
    case 'mcp_tool':
      return `MCP: ${approval.server}/${approval.tool}`;
    default:
      return 'Unknown';
  }
}
