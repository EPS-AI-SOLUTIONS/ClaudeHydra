#Requires -Version 5.1
<#
.SYNOPSIS
    Semantic File Mapping Module - Deep RAG with Relationship Analysis
.DESCRIPTION
    Implements intelligent file relationship mapping that goes beyond
    keyword search. Analyzes imports, dependencies, function calls,
    and semantic connections between files.

    Key Features:
    - Import/dependency graph building
    - Cross-language relationship detection
    - Semantic clustering of related files
    - Automatic context expansion for AI queries
    - Project structure understanding
.VERSION
    1.0.0
.AUTHOR
    HYDRA System
#>

$script:ModulePath = Split-Path -Parent $PSScriptRoot
$script:CachePath = Join-Path (Split-Path -Parent $PSScriptRoot) "cache"
$script:GraphCacheFile = Join-Path $script:CachePath "file_graph.json"

# Supported languages and their import patterns
$script:LanguagePatterns = @{
    "python" = @{
        Extensions = @(".py")
        ImportPatterns = @(
            'import\s+(\w+)',
            'from\s+(\w+(?:\.\w+)*)\s+import',
            'from\s+\.(\w+)\s+import'
        )
        FunctionPatterns = @(
            'def\s+(\w+)\s*\(',
            'class\s+(\w+)\s*[:\(]'
        )
        CommentPattern = '#.*$'
    }
    "javascript" = @{
        Extensions = @(".js", ".jsx", ".mjs")
        ImportPatterns = @(
            'import\s+.*\s+from\s+[''"]([^''"]+)[''"]',
            'require\s*\(\s*[''"]([^''"]+)[''"]\s*\)',
            'import\s*\(\s*[''"]([^''"]+)[''"]\s*\)'
        )
        FunctionPatterns = @(
            'function\s+(\w+)\s*\(',
            '(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?\(',
            '(\w+)\s*:\s*(?:async\s+)?function'
        )
        CommentPattern = '//.*$|/\*[\s\S]*?\*/'
    }
    "typescript" = @{
        Extensions = @(".ts", ".tsx")
        ImportPatterns = @(
            'import\s+.*\s+from\s+[''"]([^''"]+)[''"]',
            'import\s+type\s+.*\s+from\s+[''"]([^''"]+)[''"]',
            'require\s*\(\s*[''"]([^''"]+)[''"]\s*\)'
        )
        FunctionPatterns = @(
            'function\s+(\w+)\s*[<\(]',
            '(?:const|let|var)\s+(\w+)\s*(?::\s*\w+)?\s*=\s*(?:async\s+)?\(',
            'interface\s+(\w+)',
            'type\s+(\w+)\s*='
        )
        CommentPattern = '//.*$|/\*[\s\S]*?\*/'
    }
    "powershell" = @{
        Extensions = @(".ps1", ".psm1", ".psd1")
        ImportPatterns = @(
            'Import-Module\s+[''"]?([^\s''"]+)[''"]?',
            '\.\s+[''"]?([^\s''"]+\.ps1)[''"]?',
            'using\s+module\s+[''"]?([^\s''"]+)[''"]?'
        )
        FunctionPatterns = @(
            'function\s+(\w+[-\w]*)',
            'filter\s+(\w+[-\w]*)'
        )
        CommentPattern = '#.*$|<#[\s\S]*?#>'
    }
    "rust" = @{
        Extensions = @(".rs")
        ImportPatterns = @(
            'use\s+(\w+(?:::\w+)*)',
            'mod\s+(\w+)',
            'extern\s+crate\s+(\w+)'
        )
        FunctionPatterns = @(
            'fn\s+(\w+)\s*[<\(]',
            'struct\s+(\w+)',
            'enum\s+(\w+)',
            'impl\s+(\w+)'
        )
        CommentPattern = '//.*$|/\*[\s\S]*?\*/'
    }
    "go" = @{
        Extensions = @(".go")
        ImportPatterns = @(
            'import\s+[''"]([^''"]+)[''"]',
            'import\s+\w+\s+[''"]([^''"]+)[''"]'
        )
        FunctionPatterns = @(
            'func\s+(\w+)\s*\(',
            'func\s+\([^)]+\)\s+(\w+)\s*\(',
            'type\s+(\w+)\s+struct'
        )
        CommentPattern = '//.*$|/\*[\s\S]*?\*/'
    }
    "sql" = @{
        Extensions = @(".sql")
        ImportPatterns = @()  # SQL doesn't have imports
        FunctionPatterns = @(
            'CREATE\s+(?:OR\s+REPLACE\s+)?(?:FUNCTION|PROCEDURE)\s+(\w+)',
            'CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\w+)',
            'CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(\w+)'
        )
        TablePatterns = @(
            'FROM\s+(\w+)',
            'JOIN\s+(\w+)',
            'INTO\s+(\w+)',
            'UPDATE\s+(\w+)'
        )
        CommentPattern = '--.*$|/\*[\s\S]*?\*/'
    }
    "csharp" = @{
        Extensions = @(".cs")
        ImportPatterns = @(
            'using\s+(\w+(?:\.\w+)*)\s*;'
        )
        FunctionPatterns = @(
            '(?:public|private|protected|internal)\s+(?:static\s+)?(?:async\s+)?\w+\s+(\w+)\s*\(',
            'class\s+(\w+)',
            'interface\s+(\w+)',
            'struct\s+(\w+)'
        )
        CommentPattern = '//.*$|/\*[\s\S]*?\*/'
    }
}

#region File Analysis

function Get-FileLanguage {
    <#
    .SYNOPSIS
        Detect programming language from file extension
    #>
    param([string]$FilePath)

    $ext = [System.IO.Path]::GetExtension($FilePath).ToLower()

    foreach ($lang in $script:LanguagePatterns.Keys) {
        if ($ext -in $script:LanguagePatterns[$lang].Extensions) {
            return $lang
        }
    }

    return "unknown"
}

function Get-FileImports {
    <#
    .SYNOPSIS
        Extract imports/dependencies from a source file
    .PARAMETER FilePath
        Path to the file to analyze
    .RETURNS
        Array of imported module/file names
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )

    if (-not (Test-Path $FilePath)) {
        Write-Warning "[SemanticMap] File not found: $FilePath"
        return @()
    }

    $language = Get-FileLanguage -FilePath $FilePath
    if ($language -eq "unknown") {
        return @()
    }

    $patterns = $script:LanguagePatterns[$language]
    if (-not $patterns.ImportPatterns -or $patterns.ImportPatterns.Count -eq 0) {
        return @()
    }

    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return @() }

    # Remove comments first
    if ($patterns.CommentPattern) {
        $content = $content -replace $patterns.CommentPattern, ''
    }

    $imports = @()

    foreach ($pattern in $patterns.ImportPatterns) {
        $matches = [regex]::Matches($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
        foreach ($match in $matches) {
            $importName = $match.Groups[1].Value
            if ($importName -and $importName -notin $imports) {
                $imports += $importName
            }
        }
    }

    return $imports
}

function Get-FileFunctions {
    <#
    .SYNOPSIS
        Extract function/class definitions from a source file
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )

    if (-not (Test-Path $FilePath)) { return @() }

    $language = Get-FileLanguage -FilePath $FilePath
    if ($language -eq "unknown") { return @() }

    $patterns = $script:LanguagePatterns[$language]
    if (-not $patterns.FunctionPatterns) { return @() }

    $content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
    if (-not $content) { return @() }

    # Remove comments
    if ($patterns.CommentPattern) {
        $content = $content -replace $patterns.CommentPattern, ''
    }

    $functions = @()

    foreach ($pattern in $patterns.FunctionPatterns) {
        $matches = [regex]::Matches($content, $pattern, [System.Text.RegularExpressions.RegexOptions]::Multiline)
        foreach ($match in $matches) {
            $funcName = $match.Groups[1].Value
            if ($funcName -and $funcName -notin $functions) {
                $functions += $funcName
            }
        }
    }

    return $functions
}

function Get-RelatedFiles {
    <#
    .SYNOPSIS
        Find files related to the given file through imports
    .DESCRIPTION
        Searches the project directory for files that match import statements
        found in the source file. Also finds files that import this file.
    .PARAMETER FilePath
        Path to the source file
    .PARAMETER ProjectRoot
        Root directory to search for related files
    .PARAMETER Depth
        How deep to follow relationships (default: 2)
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [string]$ProjectRoot,

        [int]$Depth = 2
    )

    if (-not $ProjectRoot) {
        $ProjectRoot = Split-Path $FilePath -Parent
    }

    $imports = Get-FileImports -FilePath $FilePath
    $language = Get-FileLanguage -FilePath $FilePath
    $fileName = [System.IO.Path]::GetFileNameWithoutExtension($FilePath)

    Write-Host "[SemanticMap] Analyzing: $FilePath" -ForegroundColor Cyan
    Write-Host "[SemanticMap] Found $($imports.Count) imports" -ForegroundColor Gray

    $related = @{
        ImportsFrom = @()      # Files this file imports
        ImportedBy = @()       # Files that import this file
        SameModule = @()       # Files in same module/directory
        SemanticSimilar = @()  # Files with similar names/purpose
    }

    # Get all source files in project
    $extensions = @()
    foreach ($lang in $script:LanguagePatterns.Values) {
        $extensions += $lang.Extensions
    }
    $extPattern = $extensions | ForEach-Object { "*$_" }

    $allFiles = Get-ChildItem -Path $ProjectRoot -Recurse -File -Include $extPattern -ErrorAction SilentlyContinue |
                Where-Object { $_.FullName -ne $FilePath }

    # Find files matching imports
    foreach ($import in $imports) {
        # Normalize import name (handle relative paths, module.submodule, etc.)
        $searchName = $import -replace '\.', '[\\/]'  # Convert dots to path separators
        $searchName = $searchName -replace '^\.', ''  # Remove leading dot

        foreach ($file in $allFiles) {
            $fileBaseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
            $relativePath = $file.FullName.Replace($ProjectRoot, '').TrimStart('\', '/')

            if ($fileBaseName -eq $import -or
                $relativePath -match $searchName -or
                $file.Name -match "^$import\." ) {

                $related.ImportsFrom += @{
                    Path = $file.FullName
                    Name = $file.Name
                    Import = $import
                    Type = "direct_import"
                }
            }
        }
    }

    # Find files that import this file
    foreach ($file in $allFiles) {
        $fileImports = Get-FileImports -FilePath $file.FullName
        foreach ($imp in $fileImports) {
            if ($imp -eq $fileName -or $imp -match $fileName) {
                $related.ImportedBy += @{
                    Path = $file.FullName
                    Name = $file.Name
                    Import = $imp
                    Type = "imports_this"
                }
            }
        }
    }

    # Find files in same directory (same module)
    $sameDir = Get-ChildItem -Path (Split-Path $FilePath -Parent) -File -Include $extPattern -ErrorAction SilentlyContinue |
               Where-Object { $_.FullName -ne $FilePath }

    foreach ($file in $sameDir) {
        $related.SameModule += @{
            Path = $file.FullName
            Name = $file.Name
            Type = "same_module"
        }
    }

    # Find semantically similar files (name-based)
    $keywords = $fileName -split '[-_]' | Where-Object { $_.Length -gt 2 }
    foreach ($file in $allFiles) {
        $fileBaseName = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        $matchCount = 0

        foreach ($keyword in $keywords) {
            if ($fileBaseName -match $keyword) {
                $matchCount++
            }
        }

        if ($matchCount -gt 0 -and $file.FullName -notin ($related.ImportsFrom.Path + $related.ImportedBy.Path + $related.SameModule.Path)) {
            $related.SemanticSimilar += @{
                Path = $file.FullName
                Name = $file.Name
                Keywords = $keywords
                MatchCount = $matchCount
                Type = "semantic_similar"
            }
        }
    }

    return $related
}

#endregion

#region Dependency Graph

function Build-DependencyGraph {
    <#
    .SYNOPSIS
        Build a complete dependency graph for a project
    .DESCRIPTION
        Analyzes all source files and builds a graph of import relationships.
        Caches results for faster subsequent queries.
    .PARAMETER ProjectRoot
        Root directory of the project
    .PARAMETER Force
        Rebuild graph even if cached
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ProjectRoot,

        [switch]$Force
    )

    # Check cache
    if (-not $Force -and (Test-Path $script:GraphCacheFile)) {
        $cached = Get-Content $script:GraphCacheFile -Raw | ConvertFrom-Json
        if ($cached.ProjectRoot -eq $ProjectRoot -and
            ((Get-Date) - [DateTime]::Parse($cached.Timestamp)).TotalHours -lt 24) {
            Write-Host "[SemanticMap] Using cached dependency graph" -ForegroundColor Gray
            return $cached
        }
    }

    Write-Host "[SemanticMap] Building dependency graph for: $ProjectRoot" -ForegroundColor Cyan

    # Get all source files
    $extensions = @()
    foreach ($lang in $script:LanguagePatterns.Values) {
        $extensions += $lang.Extensions
    }
    $extPattern = $extensions | ForEach-Object { "*$_" }

    $files = Get-ChildItem -Path $ProjectRoot -Recurse -File -Include $extPattern -ErrorAction SilentlyContinue

    Write-Host "[SemanticMap] Analyzing $($files.Count) files..." -ForegroundColor Gray

    $graph = @{
        ProjectRoot = $ProjectRoot
        Timestamp = (Get-Date).ToString("o")
        Files = @{}
        Edges = @()
        Stats = @{
            TotalFiles = $files.Count
            TotalImports = 0
            TotalFunctions = 0
            Languages = @{}
        }
    }

    foreach ($file in $files) {
        $relativePath = $file.FullName.Replace($ProjectRoot, '').TrimStart('\', '/')
        $language = Get-FileLanguage -FilePath $file.FullName
        $imports = Get-FileImports -FilePath $file.FullName
        $functions = Get-FileFunctions -FilePath $file.FullName

        $graph.Files[$relativePath] = @{
            Path = $file.FullName
            Name = $file.Name
            Language = $language
            Imports = $imports
            Functions = $functions
            ImportCount = $imports.Count
            FunctionCount = $functions.Count
        }

        $graph.Stats.TotalImports += $imports.Count
        $graph.Stats.TotalFunctions += $functions.Count

        if (-not $graph.Stats.Languages[$language]) {
            $graph.Stats.Languages[$language] = 0
        }
        $graph.Stats.Languages[$language]++

        # Create edges for imports
        foreach ($import in $imports) {
            $graph.Edges += @{
                From = $relativePath
                To = $import
                Type = "imports"
            }
        }
    }

    # Save to cache
    if (-not (Test-Path $script:CachePath)) {
        New-Item -ItemType Directory -Path $script:CachePath -Force | Out-Null
    }
    $graph | ConvertTo-Json -Depth 10 | Set-Content $script:GraphCacheFile -Encoding UTF8

    Write-Host "[SemanticMap] Graph built: $($graph.Stats.TotalFiles) files, $($graph.Stats.TotalImports) imports" -ForegroundColor Green

    return $graph
}

function Get-DependencyChain {
    <#
    .SYNOPSIS
        Get the full dependency chain for a file
    .DESCRIPTION
        Follows imports recursively to find all transitive dependencies.
    .PARAMETER FilePath
        File to analyze
    .PARAMETER Graph
        Pre-built dependency graph
    .PARAMETER MaxDepth
        Maximum recursion depth
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [hashtable]$Graph,

        [int]$MaxDepth = 5
    )

    $projectRoot = Split-Path $FilePath -Parent
    if (-not $Graph) {
        $Graph = Build-DependencyGraph -ProjectRoot $projectRoot
    }

    $relativePath = $FilePath.Replace($Graph.ProjectRoot, '').TrimStart('\', '/')
    $visited = @{}
    $chain = @()

    function Traverse {
        param([string]$Path, [int]$Depth)

        if ($Depth -gt $MaxDepth -or $visited[$Path]) { return }
        $visited[$Path] = $true

        $fileInfo = $Graph.Files[$Path]
        if (-not $fileInfo) { return }

        foreach ($import in $fileInfo.Imports) {
            # Find matching file in graph
            $matchingFile = $Graph.Files.Keys | Where-Object {
                $_ -match $import -or
                [System.IO.Path]::GetFileNameWithoutExtension($_) -eq $import
            } | Select-Object -First 1

            if ($matchingFile) {
                $chain += @{
                    From = $Path
                    To = $matchingFile
                    Import = $import
                    Depth = $Depth
                }
                Traverse -Path $matchingFile -Depth ($Depth + 1)
            }
        }
    }

    Traverse -Path $relativePath -Depth 0

    return $chain
}

#endregion

#region Context Expansion for AI

function Get-ExpandedContext {
    <#
    .SYNOPSIS
        Get expanded context for an AI query about a file
    .DESCRIPTION
        Analyzes a file and automatically includes related files'
        content to provide comprehensive context for AI queries.
    .PARAMETER FilePath
        Primary file being queried
    .PARAMETER Query
        The user's query (used for relevance scoring)
    .PARAMETER MaxFiles
        Maximum number of related files to include
    .PARAMETER MaxTokens
        Approximate token limit for context
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [string]$Query,

        [int]$MaxFiles = 5,

        [int]$MaxTokens = 8000
    )

    Write-Host "[SemanticMap] Building expanded context for: $FilePath" -ForegroundColor Cyan

    # Get related files
    $related = Get-RelatedFiles -FilePath $FilePath

    # Score and rank related files
    $scored = @()

    # Direct imports are most relevant
    foreach ($f in $related.ImportsFrom) {
        $scored += @{ File = $f; Score = 100; Reason = "direct_import" }
    }

    # Files that import this are very relevant
    foreach ($f in $related.ImportedBy) {
        $scored += @{ File = $f; Score = 80; Reason = "imports_this" }
    }

    # Same module files
    foreach ($f in $related.SameModule) {
        $scored += @{ File = $f; Score = 50; Reason = "same_module" }
    }

    # Semantic similar
    foreach ($f in $related.SemanticSimilar) {
        $score = 20 + ($f.MatchCount * 10)
        $scored += @{ File = $f; Score = $score; Reason = "semantic_similar" }
    }

    # If query provided, boost scores for keyword matches
    if ($Query) {
        $queryWords = $Query.ToLower() -split '\W+' | Where-Object { $_.Length -gt 3 }

        foreach ($item in $scored) {
            $fileName = $item.File.Name.ToLower()
            foreach ($word in $queryWords) {
                if ($fileName -match $word) {
                    $item.Score += 30
                }
            }
        }
    }

    # Sort and select top files
    $topFiles = $scored | Sort-Object { $_.Score } -Descending | Select-Object -First $MaxFiles

    # Build context
    $context = @{
        PrimaryFile = @{
            Path = $FilePath
            Content = Get-Content $FilePath -Raw -ErrorAction SilentlyContinue
            Language = Get-FileLanguage -FilePath $FilePath
        }
        RelatedFiles = @()
        TotalCharacters = 0
        Summary = ""
    }

    $context.TotalCharacters = $context.PrimaryFile.Content.Length

    # Estimate tokens (rough: 4 chars = 1 token)
    $maxChars = $MaxTokens * 4
    $remainingChars = $maxChars - $context.TotalCharacters

    foreach ($item in $topFiles) {
        if ($remainingChars -le 0) { break }

        $filePath = $item.File.Path
        $content = Get-Content $filePath -Raw -ErrorAction SilentlyContinue

        if ($content -and $content.Length -lt $remainingChars) {
            $context.RelatedFiles += @{
                Path = $filePath
                Name = $item.File.Name
                Content = $content
                Reason = $item.Reason
                Score = $item.Score
                Language = Get-FileLanguage -FilePath $filePath
            }
            $remainingChars -= $content.Length
            $context.TotalCharacters += $content.Length
        }
    }

    $context.Summary = "Primary file + $($context.RelatedFiles.Count) related files (~$([math]::Round($context.TotalCharacters / 4)) tokens)"

    Write-Host "[SemanticMap] Context: $($context.Summary)" -ForegroundColor Green

    return $context
}

function Format-ContextForAI {
    <#
    .SYNOPSIS
        Format expanded context as a prompt for AI
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [hashtable]$Context,

        [string]$UserQuery
    )

    $sb = [System.Text.StringBuilder]::new()

    [void]$sb.AppendLine("=== PRIMARY FILE: $($Context.PrimaryFile.Path) ===")
    [void]$sb.AppendLine("Language: $($Context.PrimaryFile.Language)")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine($Context.PrimaryFile.Content)
    [void]$sb.AppendLine("")

    if ($Context.RelatedFiles.Count -gt 0) {
        [void]$sb.AppendLine("=== RELATED FILES (for context) ===")
        [void]$sb.AppendLine("")

        foreach ($file in $Context.RelatedFiles) {
            [void]$sb.AppendLine("--- $($file.Name) ($($file.Reason)) ---")
            [void]$sb.AppendLine($file.Content)
            [void]$sb.AppendLine("")
        }
    }

    if ($UserQuery) {
        [void]$sb.AppendLine("=== USER QUERY ===")
        [void]$sb.AppendLine($UserQuery)
    }

    return $sb.ToString()
}

#endregion

#region Query with Semantic Context

function Invoke-SemanticQuery {
    <#
    .SYNOPSIS
        Execute an AI query with automatically expanded semantic context
    .DESCRIPTION
        Analyzes the file, finds related files, builds context, and
        sends to AI with full relationship awareness.
    .PARAMETER FilePath
        File to query about
    .PARAMETER Query
        The user's question
    .PARAMETER Model
        AI model to use
    .PARAMETER IncludeRelated
        Include related files in context
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath,

        [Parameter(Mandatory)]
        [string]$Query,

        [string]$Model = "llama3.2:3b",

        [string]$Provider = "ollama",

        [switch]$IncludeRelated,

        [int]$MaxTokens = 2048
    )

    # Import main module
    $mainModule = Join-Path $script:ModulePath "AIModelHandler.psm1"
    if (-not (Get-Module AIModelHandler)) {
        Import-Module $mainModule -Force
    }

    Write-Host "[SemanticQuery] Processing query about: $FilePath" -ForegroundColor Cyan

    if ($IncludeRelated) {
        $context = Get-ExpandedContext -FilePath $FilePath -Query $Query -MaxFiles 5
        $prompt = Format-ContextForAI -Context $context -UserQuery $Query
    } else {
        $content = Get-Content $FilePath -Raw
        $prompt = @"
=== FILE: $FilePath ===
$content

=== QUERY ===
$Query
"@
    }

    $systemPrompt = @"
You are a code analysis expert. You have been given a file and potentially related files from the same project.
Analyze the code and answer the user's question thoroughly.
Consider relationships between files, imports, and how the code connects together.
"@

    $messages = @(
        @{ role = "system"; content = $systemPrompt }
        @{ role = "user"; content = $prompt }
    )

    try {
        $response = Invoke-AIRequest -Provider $Provider -Model $Model -Messages $messages -MaxTokens $MaxTokens

        return @{
            Answer = $response.content
            Context = if ($IncludeRelated) { $context } else { $null }
            FilePath = $FilePath
            Query = $Query
            TokensUsed = $response.usage
        }

    } catch {
        Write-Error "[SemanticQuery] Failed: $($_.Exception.Message)"
        throw
    }
}

#endregion

#region Statistics and Visualization

function Get-ProjectStructure {
    <#
    .SYNOPSIS
        Get a summary of project structure and dependencies
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$ProjectRoot
    )

    $graph = Build-DependencyGraph -ProjectRoot $ProjectRoot

    Write-Host "`n=== Project Structure ===" -ForegroundColor Cyan
    Write-Host "Root: $ProjectRoot" -ForegroundColor White

    Write-Host "`nLanguages:" -ForegroundColor White
    foreach ($lang in $graph.Stats.Languages.Keys | Sort-Object { $graph.Stats.Languages[$_] } -Descending) {
        $count = $graph.Stats.Languages[$lang]
        $bar = "█" * [math]::Min($count, 20)
        Write-Host "  $($lang.PadRight(12)) $bar $count files" -ForegroundColor Gray
    }

    Write-Host "`nStatistics:" -ForegroundColor White
    Write-Host "  Total Files: $($graph.Stats.TotalFiles)"
    Write-Host "  Total Imports: $($graph.Stats.TotalImports)"
    Write-Host "  Total Functions: $($graph.Stats.TotalFunctions)"

    # Find most connected files
    $connections = @{}
    foreach ($edge in $graph.Edges) {
        if (-not $connections[$edge.From]) { $connections[$edge.From] = 0 }
        $connections[$edge.From]++
    }

    $topConnected = $connections.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 5

    if ($topConnected) {
        Write-Host "`nMost Connected Files:" -ForegroundColor White
        foreach ($item in $topConnected) {
            Write-Host "  $($item.Key): $($item.Value) imports" -ForegroundColor Gray
        }
    }

    return $graph
}

function Show-FileRelationships {
    <#
    .SYNOPSIS
        Display relationships for a specific file
    #>
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )

    $related = Get-RelatedFiles -FilePath $FilePath

    Write-Host "`n=== File Relationships ===" -ForegroundColor Cyan
    Write-Host "File: $FilePath" -ForegroundColor White

    if ($related.ImportsFrom.Count -gt 0) {
        Write-Host "`nImports From:" -ForegroundColor Green
        foreach ($f in $related.ImportsFrom) {
            Write-Host "  → $($f.Name) (import: $($f.Import))" -ForegroundColor Gray
        }
    }

    if ($related.ImportedBy.Count -gt 0) {
        Write-Host "`nImported By:" -ForegroundColor Yellow
        foreach ($f in $related.ImportedBy) {
            Write-Host "  ← $($f.Name)" -ForegroundColor Gray
        }
    }

    if ($related.SameModule.Count -gt 0) {
        Write-Host "`nSame Module:" -ForegroundColor Cyan
        foreach ($f in $related.SameModule) {
            Write-Host "  ○ $($f.Name)" -ForegroundColor Gray
        }
    }

    if ($related.SemanticSimilar.Count -gt 0) {
        Write-Host "`nSemantically Similar:" -ForegroundColor Magenta
        foreach ($f in $related.SemanticSimilar) {
            Write-Host "  ~ $($f.Name) (matches: $($f.MatchCount))" -ForegroundColor Gray
        }
    }

    return $related
}

#endregion

#region Exports

Export-ModuleMember -Function @(
    'Get-FileLanguage',
    'Get-FileImports',
    'Get-FileFunctions',
    'Get-RelatedFiles',
    'Build-DependencyGraph',
    'Get-DependencyChain',
    'Get-ExpandedContext',
    'Format-ContextForAI',
    'Invoke-SemanticQuery',
    'Get-ProjectStructure',
    'Show-FileRelationships'
)

#endregion
