/**
 * HYDRA CLI Completions Module
 * Shell autocompletion scripts for bash, zsh, and PowerShell
 */

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * HYDRA CLI commands and options
 */
const CLI_SPEC = {
  commands: {
    '': 'Launch HYDRA normally',
    '--doctor': 'Run system diagnostics',
    '--watchdog': 'Monitor Ollama health continuously',
    '--show-config': 'Show current configuration',
    '--version': 'Show version',
    '--help': 'Show help message',
    '--ping': 'Run network diagnostics',
    '--models': 'List available models',
    '--stats': 'Show model statistics',
    '--gpu': 'Show GPU information',
    '--crashes': 'List crash reports',
    '--benchmarks': 'Show startup benchmarks',
    '--completions': 'Generate shell completions',
  },
  options: {
    '--yolo': 'Enable YOLO mode (disable safety)',
    '--no-banner': 'Hide ASCII banner',
    '--no-color': 'Disable colors',
    '--portable': 'Run in portable mode',
    '--host': {
      description: 'Override Ollama host URL',
      arg: 'URL',
    },
    '--model': {
      description: 'Override default model',
      arg: 'NAME',
    },
    '--log-level': {
      description: 'Set log level',
      arg: 'LEVEL',
      values: ['debug', 'info', 'warn', 'error'],
    },
  },
  aliases: {
    '-d': '--doctor',
    '-w': '--watchdog',
    '-v': '--version',
    '-h': '--help',
    '-m': '--model',
  },
};

/**
 * Generate Bash completion script
 */
export function generateBashCompletion() {
  const commands = Object.keys(CLI_SPEC.commands).filter((c) => c);
  const options = Object.keys(CLI_SPEC.options);
  const allFlags = [...commands, ...options];

  const script = `
# HYDRA CLI Bash Completion
# Add to ~/.bashrc or /etc/bash_completion.d/hydra

_hydra_completions() {
    local cur prev opts
    COMPREPLY=()
    cur="\${COMP_WORDS[COMP_CWORD]}"
    prev="\${COMP_WORDS[COMP_CWORD-1]}"

    # All available options
    opts="${allFlags.join(' ')}"

    # Handle specific options that need arguments
    case "\${prev}" in
        --host)
            COMPREPLY=( $(compgen -W "http://localhost:11434 http://127.0.0.1:11434" -- "\${cur}") )
            return 0
            ;;
        --model|-m)
            # Could query ollama for models, but use common ones for now
            local models="llama3.2 llama3.2:1b llama3.2:3b mistral qwen2.5-coder:7b"
            COMPREPLY=( $(compgen -W "\${models}" -- "\${cur}") )
            return 0
            ;;
        --log-level)
            COMPREPLY=( $(compgen -W "debug info warn error" -- "\${cur}") )
            return 0
            ;;
    esac

    # Default completion
    if [[ "\${cur}" == -* ]]; then
        COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
        return 0
    fi

    COMPREPLY=( $(compgen -W "\${opts}" -- "\${cur}") )
    return 0
}

complete -F _hydra_completions hydra
complete -F _hydra_completions hydra.cmd
complete -F _hydra_completions ./hydra.cmd
`;

  return script.trim();
}

/**
 * Generate Zsh completion script
 */
export function generateZshCompletion() {
  const optionLines = [];

  for (const [opt, info] of Object.entries(CLI_SPEC.options)) {
    const desc =
      typeof info === 'string' ? info : info.description;
    if (typeof info === 'object' && info.arg) {
      optionLines.push(`    '${opt}[${desc}]:${info.arg}:'`);
    } else {
      optionLines.push(`    '${opt}[${desc}]'`);
    }
  }

  for (const [opt, desc] of Object.entries(CLI_SPEC.commands)) {
    if (opt) {
      optionLines.push(`    '${opt}[${desc}]'`);
    }
  }

  const script = `
#compdef hydra hydra.cmd

# HYDRA CLI Zsh Completion
# Add to ~/.zshrc or /usr/local/share/zsh/site-functions/_hydra

_hydra() {
    local -a opts
    opts=(
${optionLines.join('\n')}
    )

    _arguments -s $opts

    case "$words[CURRENT-1]" in
        --model|-m)
            local models=(llama3.2 llama3.2:1b llama3.2:3b mistral qwen2.5-coder:7b)
            _describe 'model' models
            ;;
        --log-level)
            local levels=(debug info warn error)
            _describe 'level' levels
            ;;
        --host)
            _urls
            ;;
    esac
}

_hydra "$@"
`;

  return script.trim();
}

/**
 * Generate PowerShell completion script
 */
export function generatePowerShellCompletion() {
  const completions = [];

  // Add commands
  for (const [cmd, desc] of Object.entries(CLI_SPEC.commands)) {
    if (cmd) {
      completions.push(
        `    [System.Management.Automation.CompletionResult]::new('${cmd}', '${cmd}', 'ParameterValue', '${desc}')`
      );
    }
  }

  // Add options
  for (const [opt, info] of Object.entries(CLI_SPEC.options)) {
    const desc = typeof info === 'string' ? info : info.description;
    completions.push(
      `    [System.Management.Automation.CompletionResult]::new('${opt}', '${opt}', 'ParameterValue', '${desc}')`
    );
  }

  const script = `
# HYDRA CLI PowerShell Completion
# Add to $PROFILE

Register-ArgumentCompleter -Native -CommandName hydra, hydra.cmd -ScriptBlock {
    param($wordToComplete, $commandAst, $cursorPosition)

    $completions = @(
${completions.join(',\n')}
    )

    # Handle specific argument completions
    $lastWord = $commandAst.CommandElements[-1].ToString()

    switch ($lastWord) {
        '--model' {
            @('llama3.2', 'llama3.2:1b', 'llama3.2:3b', 'mistral', 'qwen2.5-coder:7b') | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', 'Model name')
            }
            return
        }
        '-m' {
            @('llama3.2', 'llama3.2:1b', 'llama3.2:3b', 'mistral', 'qwen2.5-coder:7b') | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', 'Model name')
            }
            return
        }
        '--log-level' {
            @('debug', 'info', 'warn', 'error') | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', 'Log level')
            }
            return
        }
        '--host' {
            @('http://localhost:11434', 'http://127.0.0.1:11434') | ForEach-Object {
                [System.Management.Automation.CompletionResult]::new($_, $_, 'ParameterValue', 'Ollama host URL')
            }
            return
        }
    }

    # Filter completions
    $completions | Where-Object {
        $_.CompletionText -like "$wordToComplete*"
    }
}

Write-Host "HYDRA CLI completions loaded" -ForegroundColor Green
`;

  return script.trim();
}

/**
 * Generate Fish completion script
 */
export function generateFishCompletion() {
  const lines = [
    '# HYDRA CLI Fish Completion',
    '# Save to ~/.config/fish/completions/hydra.fish',
    '',
    '# Disable file completion',
    'complete -c hydra -f',
    'complete -c hydra.cmd -f',
    '',
  ];

  // Add commands
  for (const [cmd, desc] of Object.entries(CLI_SPEC.commands)) {
    if (cmd) {
      lines.push(`complete -c hydra -l ${cmd.replace('--', '')} -d '${desc}'`);
    }
  }

  // Add options
  for (const [opt, info] of Object.entries(CLI_SPEC.options)) {
    const desc = typeof info === 'string' ? info : info.description;
    const longOpt = opt.replace('--', '');

    if (typeof info === 'object' && info.values) {
      lines.push(
        `complete -c hydra -l ${longOpt} -d '${desc}' -xa '${info.values.join(' ')}'`
      );
    } else if (typeof info === 'object' && info.arg) {
      lines.push(`complete -c hydra -l ${longOpt} -d '${desc}' -r`);
    } else {
      lines.push(`complete -c hydra -l ${longOpt} -d '${desc}'`);
    }
  }

  // Model completion
  lines.push(
    "complete -c hydra -l model -d 'Override default model' -xa 'llama3.2 llama3.2:1b llama3.2:3b mistral qwen2.5-coder:7b'"
  );

  return lines.join('\n');
}

/**
 * Completions Manager
 */
export class CompletionsManager {
  constructor(outputDir) {
    this.outputDir = outputDir;
  }

  /**
   * Generate all completion scripts
   */
  generateAll() {
    return {
      bash: generateBashCompletion(),
      zsh: generateZshCompletion(),
      powershell: generatePowerShellCompletion(),
      fish: generateFishCompletion(),
    };
  }

  /**
   * Save completion scripts to files
   */
  saveAll() {
    const scripts = this.generateAll();
    const files = [];

    const bashPath = join(this.outputDir, 'hydra.bash');
    writeFileSync(bashPath, scripts.bash);
    files.push(bashPath);

    const zshPath = join(this.outputDir, '_hydra');
    writeFileSync(zshPath, scripts.zsh);
    files.push(zshPath);

    const psPath = join(this.outputDir, 'hydra.ps1');
    writeFileSync(psPath, scripts.powershell);
    files.push(psPath);

    const fishPath = join(this.outputDir, 'hydra.fish');
    writeFileSync(fishPath, scripts.fish);
    files.push(fishPath);

    return files;
  }

  /**
   * Get installation instructions
   */
  getInstructions(shell = 'all') {
    const instructions = {
      bash: `
# Bash Completion
# Add to ~/.bashrc:
source ${join(this.outputDir, 'hydra.bash')}

# Or copy to system completions:
sudo cp ${join(this.outputDir, 'hydra.bash')} /etc/bash_completion.d/hydra
`,
      zsh: `
# Zsh Completion
# Add to ~/.zshrc:
fpath=(${this.outputDir} $fpath)
autoload -Uz compinit && compinit

# Or copy to site-functions:
sudo cp ${join(this.outputDir, '_hydra')} /usr/local/share/zsh/site-functions/
`,
      powershell: `
# PowerShell Completion
# Add to your $PROFILE:
. ${join(this.outputDir, 'hydra.ps1')}

# To find your profile location:
echo $PROFILE
`,
      fish: `
# Fish Completion
# Copy to Fish completions:
cp ${join(this.outputDir, 'hydra.fish')} ~/.config/fish/completions/
`,
    };

    if (shell === 'all') {
      return Object.values(instructions).join('\n');
    }

    return instructions[shell] || 'Unknown shell';
  }
}

/**
 * Get completion for specific shell
 */
export function getCompletion(shell) {
  switch (shell.toLowerCase()) {
    case 'bash':
      return generateBashCompletion();
    case 'zsh':
      return generateZshCompletion();
    case 'powershell':
    case 'pwsh':
    case 'ps1':
      return generatePowerShellCompletion();
    case 'fish':
      return generateFishCompletion();
    default:
      throw new Error(`Unknown shell: ${shell}`);
  }
}

export { CLI_SPEC };
