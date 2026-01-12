#Requires -Version 5.1
<#
.SYNOPSIS
    Dynamic Few-Shot Learning Module - Contextual Learning from History
.DESCRIPTION
    Implements contextual learning by automatically including relevant successful
    examples from user history. When generating code for a topic (e.g., SQL),
    the system searches for previously accepted solutions and includes them
    as few-shot examples to improve output quality.
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ModulePath = Split-Path -Parent $PSScriptRoot
$script:CachePath = Join-Path $script:ModulePath "cache"
$script:SuccessHistoryFile = Join-Path $script:CachePath "success_history.json"
$script:MaxHistoryEntries = 100
$script:MaxExamplesPerRequest = 3

#region Cache Management

function Initialize-FewShotCache {
    <#
    .SYNOPSIS
        Initialize the few-shot learning cache
    #>
    [CmdletBinding()]
    param()

    # Ensure cache directory exists
    if (-not (Test-Path $script:CachePath)) {
        New-Item -ItemType Directory -Path $script:CachePath -Force | Out-Null
    }

    # Initialize history file if not exists
    if (-not (Test-Path $script:SuccessHistoryFile)) {
        @{
            version = "1.0"
            entries = @()
            lastUpdated = (Get-Date).ToString("o")
        } | ConvertTo-Json -Depth 10 | Set-Content $script:SuccessHistoryFile -Encoding UTF8
    }

    Write-Host "[FewShot] Cache initialized at $script:CachePath" -ForegroundColor Gray
}

function Get-SuccessHistory {
    <#
    .SYNOPSIS
        Get all success history entries
    #>
    [CmdletBinding()]
    param()

    if (-not (Test-Path $script:SuccessHistoryFile)) {
        Initialize-FewShotCache
    }

    try {
        $data = Get-Content $script:SuccessHistoryFile -Raw | ConvertFrom-Json
        return $data.entries
    } catch {
        Write-Warning "[FewShot] Failed to load history: $($_.Exception.Message)"
        return @()
    }
}

function Save-SuccessfulResponse {
    <#
    .SYNOPSIS
        Save a successful response to the history for future few-shot learning
    .PARAMETER Prompt
        The original user prompt
    .PARAMETER Response
        The successful response/code
    .PARAMETER Category
        Auto-detected or manual category (sql, api, ui, data, etc.)
    .PARAMETER Tags
        Additional tags for better matching
    .PARAMETER Rating
        Optional quality rating (1-5, default: 3)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [Parameter(Mandatory)]
        [string]$Response,

        [string]$Category,

        [string[]]$Tags = @(),

        [ValidateRange(1, 5)]
        [int]$Rating = 3,

        [string]$Language
    )

    Initialize-FewShotCache

    # Auto-detect category if not provided
    if (-not $Category) {
        $Category = Get-ContentCategory -Text "$Prompt $Response"
    }

    # Auto-detect language if not provided
    if (-not $Language) {
        $Language = Get-CodeLanguageFromContent -Content $Response
    }

    # Extract keywords for better matching
    $keywords = Get-ContentKeywords -Text "$Prompt"

    $entry = @{
        id = [guid]::NewGuid().ToString()
        timestamp = (Get-Date).ToString("o")
        prompt = $Prompt
        response = $Response
        category = $Category
        language = $Language
        tags = @($Tags)
        keywords = @($keywords)
        rating = $Rating
        useCount = 0
    }

    # Load existing data
    $data = Get-Content $script:SuccessHistoryFile -Raw | ConvertFrom-Json

    # Convert entries to proper array
    $entries = @()
    if ($data.entries) {
        foreach ($e in $data.entries) {
            $entries += $e
        }
    }

    # Add new entry
    $entries += $entry

    # Trim old entries if over limit
    if ($entries.Count -gt $script:MaxHistoryEntries) {
        # Sort by rating and use count, keep best entries
        $entries = $entries | Sort-Object { $_.rating * 10 + $_.useCount } -Descending | Select-Object -First $script:MaxHistoryEntries
    }

    $data.entries = $entries
    $data.lastUpdated = (Get-Date).ToString("o")

    $data | ConvertTo-Json -Depth 10 | Set-Content $script:SuccessHistoryFile -Encoding UTF8

    Write-Host "[FewShot] Saved successful response (category: $Category)" -ForegroundColor Green

    return $entry.id
}

function Get-ContentCategory {
    <#
    .SYNOPSIS
        Auto-detect content category from text
    #>
    param([string]$Text)

    $categories = @{
        "sql" = @("SELECT", "INSERT", "UPDATE", "DELETE", "CREATE TABLE", "JOIN", "WHERE", "GROUP BY", "database", "query")
        "api" = @("endpoint", "REST", "HTTP", "GET", "POST", "PUT", "request", "response", "JSON", "API", "fetch", "axios")
        "ui" = @("button", "form", "input", "component", "render", "style", "CSS", "HTML", "React", "Vue", "Angular")
        "data" = @("array", "list", "dictionary", "hash", "sort", "filter", "map", "reduce", "transform", "parse")
        "file" = @("read", "write", "file", "path", "directory", "folder", "save", "load", "stream")
        "auth" = @("login", "authentication", "password", "token", "JWT", "OAuth", "session", "credential")
        "test" = @("test", "unit", "mock", "assert", "expect", "describe", "it", "should")
        "config" = @("config", "setting", "environment", "variable", "parameter", "option")
    }

    $textLower = $Text.ToLower()
    $scores = @{}

    foreach ($category in $categories.Keys) {
        $score = 0
        foreach ($keyword in $categories[$category]) {
            if ($textLower -match [regex]::Escape($keyword.ToLower())) {
                $score++
            }
        }
        $scores[$category] = $score
    }

    $best = $scores.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 1

    if ($best.Value -gt 0) {
        return $best.Key
    }

    return "general"
}

function Get-CodeLanguageFromContent {
    <#
    .SYNOPSIS
        Detect programming language from code content
    #>
    param([string]$Content)

    $patterns = @{
        "powershell" = @('function\s+\w+', '\$\w+\s*=', 'Write-Host', 'param\s*\(')
        "python" = @('def\s+\w+', 'import\s+', 'print\s*\(', 'class\s+\w+:')
        "javascript" = @('const\s+', 'let\s+', 'function\s+\w+\s*\(', '=>', 'console\.log')
        "typescript" = @(':\s*(string|number|boolean)', 'interface\s+', 'type\s+\w+\s*=')
        "sql" = @('SELECT\s+', 'FROM\s+', 'WHERE\s+', 'INSERT\s+', 'CREATE\s+TABLE')
        "rust" = @('fn\s+\w+', 'let\s+mut', 'impl\s+', 'struct\s+')
        "go" = @('func\s+', 'package\s+', ':=')
    }

    foreach ($lang in $patterns.Keys) {
        foreach ($pattern in $patterns[$lang]) {
            if ($Content -match $pattern) {
                return $lang
            }
        }
    }

    return "unknown"
}

function Get-ContentKeywords {
    <#
    .SYNOPSIS
        Extract meaningful keywords from text for matching
    #>
    param([string]$Text)

    # Remove common words and extract meaningful terms
    $stopWords = @("the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
                   "have", "has", "had", "do", "does", "did", "will", "would", "could",
                   "should", "may", "might", "must", "shall", "can", "to", "of", "in",
                   "for", "on", "with", "at", "by", "from", "as", "or", "and", "but",
                   "if", "then", "else", "when", "where", "how", "what", "which", "who",
                   "this", "that", "these", "those", "it", "its", "i", "me", "my", "we",
                   "our", "you", "your", "he", "his", "she", "her", "they", "their",
                   "write", "create", "make", "build", "generate", "please", "help")

    # Extract words
    $words = $Text -split '\W+' | Where-Object { $_.Length -gt 2 }

    # Filter stop words and keep meaningful keywords
    $keywords = $words | Where-Object { $_.ToLower() -notin $stopWords } | Select-Object -Unique -First 10

    return @($keywords)
}

#endregion

#region Few-Shot Retrieval

function Get-SuccessfulExamples {
    <#
    .SYNOPSIS
        Retrieve relevant successful examples for few-shot learning
    .DESCRIPTION
        Searches history for examples matching the current query by category,
        keywords, and language. Returns best matches as few-shot examples.
    .PARAMETER Query
        The current user query/prompt
    .PARAMETER Category
        Optional category filter
    .PARAMETER Language
        Optional language filter
    .PARAMETER MaxExamples
        Maximum examples to return (default: 3)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Query,

        [string]$Category,

        [string]$Language,

        [int]$MaxExamples = 3
    )

    $history = Get-SuccessHistory

    if ($history.Count -eq 0) {
        return @()
    }

    # Auto-detect category if not provided
    if (-not $Category) {
        $Category = Get-ContentCategory -Text $Query
    }

    # Extract query keywords
    $queryKeywords = Get-ContentKeywords -Text $Query

    # Score each history entry
    $scored = @()
    foreach ($entry in $history) {
        $score = 0

        # Category match (highest weight)
        if ($entry.category -eq $Category) {
            $score += 50
        }

        # Language match
        if ($Language -and $entry.language -eq $Language) {
            $score += 30
        }

        # Keyword overlap
        foreach ($keyword in $queryKeywords) {
            if ($entry.keywords -contains $keyword) {
                $score += 10
            }
            # Also check prompt text
            if ($entry.prompt -match [regex]::Escape($keyword)) {
                $score += 5
            }
        }

        # Rating bonus
        $score += ($entry.rating * 2)

        # Use count bonus (popular examples are likely good)
        $score += [math]::Min($entry.useCount, 10)

        if ($score -gt 0) {
            $scored += @{
                entry = $entry
                score = $score
            }
        }
    }

    # Sort by score and return top matches
    $best = $scored | Sort-Object { $_.score } -Descending | Select-Object -First $MaxExamples

    if ($best.Count -gt 0) {
        # Update use counts
        $history = Get-SuccessHistory
        foreach ($match in $best) {
            $historyEntry = $history | Where-Object { $_.id -eq $match.entry.id }
            if ($historyEntry) {
                $historyEntry.useCount++
            }
        }
        # Save updated counts
        $data = Get-Content $script:SuccessHistoryFile -Raw | ConvertFrom-Json
        $data.entries = $history
        $data | ConvertTo-Json -Depth 10 | Set-Content $script:SuccessHistoryFile -Encoding UTF8
    }

    return $best | ForEach-Object { $_.entry }
}

function Build-FewShotPrompt {
    <#
    .SYNOPSIS
        Build a prompt with few-shot examples prepended
    .DESCRIPTION
        Creates an enhanced prompt with relevant historical examples
        to guide the model toward better outputs.
    .PARAMETER UserPrompt
        The user's original prompt
    .PARAMETER Examples
        Array of example entries (from Get-SuccessfulExamples)
    .PARAMETER Style
        Prompt style: "inline" (examples in prompt) or "chat" (as separate messages)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$UserPrompt,

        [array]$Examples,

        [ValidateSet("inline", "chat")]
        [string]$Style = "inline"
    )

    if (-not $Examples -or $Examples.Count -eq 0) {
        return @{
            prompt = $UserPrompt
            messages = @(@{ role = "user"; content = $UserPrompt })
        }
    }

    if ($Style -eq "inline") {
        # Build inline prompt with examples
        $exampleText = "Here are some examples of successful solutions in your style:`n`n"

        foreach ($i in 0..($Examples.Count - 1)) {
            $ex = $Examples[$i]
            $exampleText += "=== Example $($i + 1) ===`n"
            $exampleText += "Request: $($ex.prompt)`n"
            $exampleText += "Solution:`n$($ex.response)`n`n"
        }

        $exampleText += "=== Your Task ===`n$UserPrompt"

        return @{
            prompt = $exampleText
            messages = @(@{ role = "user"; content = $exampleText })
            examplesUsed = $Examples.Count
        }

    } else {
        # Build chat-style messages
        $messages = @()

        foreach ($ex in $Examples) {
            $messages += @{ role = "user"; content = $ex.prompt }
            $messages += @{ role = "assistant"; content = $ex.response }
        }

        $messages += @{ role = "user"; content = $UserPrompt }

        return @{
            prompt = $UserPrompt
            messages = $messages
            examplesUsed = $Examples.Count
        }
    }
}

#endregion

#region Integration Functions

function Invoke-AIWithFewShot {
    <#
    .SYNOPSIS
        Invoke AI request with automatic few-shot learning
    .DESCRIPTION
        Automatically retrieves relevant examples from history and
        includes them in the request to improve output quality.
    .PARAMETER Prompt
        User's prompt
    .PARAMETER Model
        Model to use
    .PARAMETER Provider
        Provider (ollama, anthropic, openai)
    .PARAMETER SaveSuccess
        Whether to prompt user to save successful responses
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [string]$Model = "llama3.2:3b",

        [string]$Provider = "ollama",

        [switch]$SaveSuccess,

        [int]$MaxTokens = 2048,

        [string]$SystemPrompt
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    # Initialize cache
    Initialize-FewShotCache

    # Get relevant examples
    $examples = Get-SuccessfulExamples -Query $Prompt

    if ($examples.Count -gt 0) {
        Write-Host "[FewShot] Found $($examples.Count) relevant example(s) from history" -ForegroundColor Cyan
    }

    # Build enhanced prompt
    $enhanced = Build-FewShotPrompt -UserPrompt $Prompt -Examples $examples -Style "chat"

    # Prepare messages
    $messages = @()
    if ($SystemPrompt) {
        $messages += @{ role = "system"; content = $SystemPrompt }
    }
    $messages += $enhanced.messages

    # Execute request
    try {
        $startTime = Get-Date
        $response = Invoke-AIRequest -Provider $Provider -Model $Model -Messages $messages -MaxTokens $MaxTokens

        $elapsed = ((Get-Date) - $startTime).TotalSeconds

        Write-Host "[FewShot] Response generated in $([math]::Round($elapsed, 2))s" -ForegroundColor Gray

        # Return result
        $result = @{
            Content = $response.content
            ExamplesUsed = $examples.Count
            ElapsedSeconds = $elapsed
            Model = $Model
            Provider = $Provider
        }

        return $result

    } catch {
        Write-Error "[FewShot] Request failed: $($_.Exception.Message)"
        throw
    }
}

function Add-ToSuccessHistory {
    <#
    .SYNOPSIS
        Manually add a prompt/response pair to success history
    .DESCRIPTION
        Use this to mark a response as successful and add it to
        the few-shot learning history for future reference.
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$Prompt,

        [Parameter(Mandatory)]
        [string]$Response,

        [int]$Rating = 4
    )

    $id = Save-SuccessfulResponse -Prompt $Prompt -Response $Response -Rating $Rating
    Write-Host "[FewShot] Added to history (ID: $id)" -ForegroundColor Green
    return $id
}

function Get-FewShotStats {
    <#
    .SYNOPSIS
        Get statistics about the few-shot learning cache
    #>
    [CmdletBinding()]
    param()

    $history = Get-SuccessHistory

    $stats = @{
        TotalEntries = $history.Count
        Categories = @{}
        Languages = @{}
        AverageRating = 0
        TotalUses = 0
    }

    foreach ($entry in $history) {
        # Count categories
        $cat = $entry.category
        if (-not $stats.Categories[$cat]) {
            $stats.Categories[$cat] = 0
        }
        $stats.Categories[$cat]++

        # Count languages
        $lang = $entry.language
        if ($lang -and -not $stats.Languages[$lang]) {
            $stats.Languages[$lang] = 0
        }
        if ($lang) {
            $stats.Languages[$lang]++
        }

        # Sum ratings and uses
        $stats.AverageRating += $entry.rating
        $stats.TotalUses += $entry.useCount
    }

    if ($history.Count -gt 0) {
        $stats.AverageRating = [math]::Round($stats.AverageRating / $history.Count, 2)
    }

    return $stats
}

function Clear-FewShotHistory {
    <#
    .SYNOPSIS
        Clear all few-shot learning history
    #>
    [CmdletBinding()]
    param([switch]$Force)

    if (-not $Force) {
        $confirm = Read-Host "Clear all few-shot history? This cannot be undone. (y/N)"
        if ($confirm -ne "y") {
            Write-Host "Cancelled" -ForegroundColor Yellow
            return
        }
    }

    @{
        version = "1.0"
        entries = @()
        lastUpdated = (Get-Date).ToString("o")
    } | ConvertTo-Json -Depth 10 | Set-Content $script:SuccessHistoryFile -Encoding UTF8

    Write-Host "[FewShot] History cleared" -ForegroundColor Green
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Initialize-FewShotCache',
    'Save-SuccessfulResponse',
    'Get-SuccessfulExamples',
    'Build-FewShotPrompt',
    'Invoke-AIWithFewShot',
    'Add-ToSuccessHistory',
    'Get-FewShotStats',
    'Clear-FewShotHistory',
    'Get-SuccessHistory'
)

#endregion
