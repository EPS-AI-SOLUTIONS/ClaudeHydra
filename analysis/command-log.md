# Command Log

Commands executed during repository analysis:

- ls
- cat AGENTS.md
- find ai-handler -name AGENTS.md -print
- rg -n "aihandler|ai-handler|ai handler" -S README.md ai-handler
- pwsh -File ai-handler/test-request.ps1
- sed -n '1,120p' ai-handler/test-request.ps1
- sudo apt-get update
- which pwsh
- curl -fsSL -o /tmp/powershell.tar.gz https://github.com/PowerShell/PowerShell/releases/download/v7.4.2/powershell-7.4.2-linux-x64.tar.gz
- sed -n '1,200p' README.md
- sed -n '1,200p' ARCHITECTURE.md
- sed -n '1,200p' CHANGELOG.md
- ls ai-handler
- rg -n "TODO|FIXME|TBD" -S ai-handler parallel *.ps1
- sed -n '240,520p' ai-handler/AIModelHandler.psm1
- sed -n '1,240p' ai-handler/modules/ModelDiscovery.psm1
- sed -n '1,240p' ai-handler/modules/PromptQueue.psm1
- sed -n '1,240p' ai-handler/Invoke-AI.ps1
- sed -n '1,200p' ai-handler/Initialize-AIHandler.ps1
- sed -n '1,240p' mcp-health-check.ps1
- sed -n '1,200p' parallel/modules/ParallelUtils.psm1
- nl -ba ai-handler/AIModelHandler.psm1 | sed -n '1,240p'
- nl -ba ai-handler/AIModelHandler.psm1 | sed -n '240,520p'
- nl -ba ai-handler/modules/ModelDiscovery.psm1 | sed -n '1,220p'
- nl -ba ai-handler/modules/PromptQueue.psm1 | sed -n '1,220p'
- nl -ba ai-handler/Invoke-AI.ps1 | sed -n '1,220p'
- nl -ba ai-handler/Initialize-AIHandler.ps1 | sed -n '1,240p'
- nl -ba mcp-health-check.ps1 | sed -n '1,240p'
- nl -ba parallel/modules/ParallelUtils.psm1 | sed -n '1,220p'
