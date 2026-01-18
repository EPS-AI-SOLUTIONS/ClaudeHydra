# HYDRA SECURITY POLICY (10.6.1)

## 🔐 1. SECURITY MODES

### Mode Definitions

| Mode | Read | Write | Execute | Use Case |
|------|------|-------|---------|----------|
| **NORMAL** | ✅ | ✅ | ✅ (with checks) | Standard operation |
| **AUDIT** | ✅ | ❌ | ❌ | Security review, debugging |

### Mode Switching

```powershell
# Enable AUDIT mode
Set-HydraSecurityMode -Mode AUDIT

# Return to NORMAL
Set-HydraSecurityMode -Mode NORMAL

# Check current mode
Get-HydraSecurityMode
```

### AUDIT Mode Behavior

```
┌─────────────────────────────────────────────────────────────────┐
│  AUDIT MODE ACTIVE                                              │
├─────────────────────────────────────────────────────────────────┤
│  ✅ All read operations permitted                               │
│  ✅ Analysis and reporting permitted                            │
│  ❌ File writes → BLOCKED + logged                              │
│  ❌ Process execution → BLOCKED + logged                        │
│  ❌ Network mutations → BLOCKED + logged                        │
│                                                                 │
│  Every blocked action generates audit report                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔑 2. SECRET HANDLING

### Storage Rules

| Location | Allowed | Notes |
|----------|---------|-------|
| `.env` file | ✅ | Must be in .gitignore |
| Environment variables | ✅ | Preferred for CI/CD |
| `config.json` | ❌ | Never store secrets |
| Source code | ❌ | Absolute prohibition |
| Logs | ❌ | Must be masked |

### Required Patterns

```bash
# .gitignore MUST contain:
.env
.env.*
*.pem
*.key
*_secret*
```

### Masking Rules

All outputs MUST mask:

| Pattern | Mask To |
|---------|---------|
| API keys | `sk-...****` |
| Tokens | `***TOKEN***` |
| Passwords | `********` |
| Connection strings | `[MASKED_CONNECTION]` |

### Detection & Prevention

```
IF detected_secret_in_output:
    1. HALT output generation
    2. MASK detected secret
    3. WARN user: "Secret detected and masked"
    4. LOG incident (without secret)
```

---

## 🛡️ 3. OPERATION SAFETY

### Destructive Operations

These operations require explicit confirmation:

| Category | Operations | Confirmation Required |
|----------|------------|----------------------|
| **File System** | delete, overwrite, move | Yes |
| **Git** | force push, reset --hard, branch -D | Yes |
| **Database** | DROP, TRUNCATE, DELETE without WHERE | Yes |
| **System** | kill process, modify PATH | Yes |
| **Network** | firewall changes, port exposure | Yes |

### Confirmation Protocol

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠️ DESTRUCTIVE OPERATION DETECTED                              │
├─────────────────────────────────────────────────────────────────┤
│  Operation: rm -rf ./build                                      │
│  Impact: Permanent deletion of 847 files                        │
│  Reversible: NO                                                 │
│                                                                 │
│  Type 'CONFIRM DELETE' to proceed                               │
│  Type 'abort' to cancel                                         │
└─────────────────────────────────────────────────────────────────┘
```

---

## 🔍 4. AUDIT LOGGING

### Log Format

```json
{
  "timestamp": "2024-01-15T14:32:00Z",
  "session_id": "hydra-abc123",
  "action": "file_write",
  "target": "/src/auth.ts",
  "user": "pawel",
  "mode": "NORMAL",
  "status": "completed",
  "details": {
    "bytes_written": 1247,
    "checksum": "sha256:abc..."
  }
}
```

### Retention

| Log Type | Retention | Storage |
|----------|-----------|---------|
| Security events | 90 days | Encrypted |
| Access logs | 30 days | Local |
| Error logs | 14 days | Local |

---

## 🚨 5. INCIDENT RESPONSE

### Severity Levels

| Level | Description | Response Time |
|-------|-------------|---------------|
| **CRITICAL** | Secret exposure, data breach | Immediate |
| **HIGH** | Unauthorized access attempt | < 1 hour |
| **MEDIUM** | Policy violation | < 24 hours |
| **LOW** | Informational | Weekly review |

### Response Protocol

```
CRITICAL/HIGH Incident:
1. HALT all operations
2. ISOLATE affected components
3. NOTIFY user immediately
4. PRESERVE evidence
5. REPORT with full context
```

---

## 📋 6. COMPLIANCE CHECKLIST

### Pre-Deployment

- [ ] All secrets in .env only
- [ ] .gitignore covers secret files
- [ ] No hardcoded credentials in codebase
- [ ] Audit logs enabled
- [ ] Security mode configured
- [ ] Destructive operation guards active

### Runtime

- [ ] Secret masking verified
- [ ] Audit trail maintained
- [ ] Access controls enforced
- [ ] Fallback chain secure
- [ ] Error messages sanitized

---

## 🔒 7. RULE IDS

| Rule ID | Description |
|---------|-------------|
| `Security.Forbidden.Destructive` | Block unconfirmed destructive ops |
| `Security.Forbidden.HardcodedSecrets` | No secrets in repo |
| `Security.Forbidden.SecretLeak` | Mask all secrets in output |
| `Security.AUDIT.NoWrite` | No writes in AUDIT mode |
| `Security.Secrets.EnvOnly` | Secrets only via env/.env |
| `Security.Secrets.GitIgnore` | .gitignore must cover .env |
| `Security.Secrets.MaskLogs` | Mask keys/tokens in logs |
