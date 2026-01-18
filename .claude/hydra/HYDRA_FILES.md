# HYDRA FILES: Drag & Drop, ZIP, Images (10.6.1)

## 🧲 1. DRAG & DROP CONTRACT

### Detection Protocol

When files are dropped into the session:

```
┌─────────────────────────────────────────────────────────────────┐
│  FILE DETECTION PROTOCOL                                        │
├─────────────────────────────────────────────────────────────────┤
│  1. Detect file type (extension + magic bytes)                  │
│  2. Acknowledge each file:                                      │
│     - filename                                                  │
│     - type (code/doc/image/archive/other)                       │
│     - size                                                      │
│  3. Choose safest pipeline (read-only first)                    │
│  4. No mutations unless explicitly requested                    │
└─────────────────────────────────────────────────────────────────┘
```

### File Classification

| Type | Extensions | Default Action |
|------|------------|----------------|
| **Code** | `.ts .tsx .js .jsx .py .rs .go` | Parse → Lint → Propose diffs |
| **Config** | `.json .yaml .toml .env.example` | Validate → Show structure |
| **Docs** | `.md .txt .pdf .docx` | Summarize → Extract key sections |
| **Images** | `.png .jpg .jpeg .webp .svg` | Describe → Check dimensions → Ask goals |
| **Archives** | `.zip .tar.gz .7z` | List contents → Extract on request |
| **Data** | `.csv .xlsx .parquet` | Preview schema → Show sample rows |

### Acknowledgment Format

```markdown
## 📁 Files Received

| File | Type | Size | Status |
|------|------|------|--------|
| `auth.ts` | TypeScript | 4.2 KB | ✅ Parsed |
| `design.png` | Image | 156 KB | ✅ Analyzed |
| `data.zip` | Archive | 2.1 MB | ⏳ Awaiting action |

**Ready for:** analysis, review, modification (specify action)
```

---

## 📦 2. ZIP HANDLING

### Safe Extraction Workflow

```
┌─────────────────────────────────────────────────────────────────┐
│  ZIP SAFETY PROTOCOL                                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Step 1: LIST CONTENTS                                          │
│  ├─ Tree view of archive                                        │
│  ├─ File count & total size                                     │
│  └─ Flag suspicious patterns                                    │
│                                                                 │
│  Step 2: RISK ASSESSMENT                                        │
│  ├─ ⚠️ Executables (.exe, .sh, .bat)                            │
│  ├─ ⚠️ Large files (>100MB each)                                │
│  ├─ ⚠️ Nested archives (zip bombs)                              │
│  └─ ⚠️ Excessive file count (>10,000)                           │
│                                                                 │
│  Step 3: ASK TARGET ACTION                                      │
│  ├─ inspect  → View specific files                              │
│  ├─ extract  → Full extraction                                  │
│  ├─ scan     → Security scan only                               │
│  └─ build    → Extract + identify entry point                   │
│                                                                 │
│  Step 4: EXTRACT (if requested)                                 │
│  ├─ Dedicated folder: ./extracted/{archive_name}/               │
│  ├─ Preserve paths                                              │
│  └─ NEVER auto-run binaries                                     │
│                                                                 │
│  Step 5: POST-EXTRACT MANIFEST                                  │
│  ├─ File list with sizes                                        │
│  ├─ Entry points (package.json, main.py, etc.)                  │
│  └─ Recommendations                                             │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Edge Cases

| Scenario | Handling |
|----------|----------|
| **Password-protected** | Report, request password (never brute-force) |
| **Zip bomb detected** | Abort, report with details |
| **Corrupted archive** | Report corruption, suggest repair tools |
| **Nested zips** | Warn, extract only outer level by default |

### Manifest Format

```markdown
## 📦 Extraction Complete: project.zip

**Extracted to:** `./extracted/project/`
**Files:** 47 | **Size:** 2.3 MB

### Entry Points Detected
- `package.json` → Node.js project
- `tsconfig.json` → TypeScript config
- `src/index.ts` → Main entry

### Structure
```
project/
├── src/
│   ├── index.ts
│   ├── components/
│   └── utils/
├── tests/
├── package.json
└── README.md
```

### Recommended Next Steps
1. **[Install deps]** - `pnpm install`
2. **[Run dev]** - `pnpm dev`
3. **[Review structure]** - Analyze architecture
```

---

## 🖼️ 3. IMAGE HANDLING

### Default Checks

For every image received:

| Check | Details |
|-------|---------|
| **Dimensions** | Width × Height in pixels |
| **Format** | PNG/JPG/WEBP/SVG |
| **Color space** | RGB/RGBA/Grayscale |
| **Transparency** | Alpha channel presence |
| **File size** | Actual vs optimal |
| **Text/Logo** | Check legibility at 100% and scaled |

### Analysis Output

```markdown
## 🖼️ Image Analysis: logo.png

| Property | Value |
|----------|-------|
| Dimensions | 1200 × 800 px |
| Format | PNG-24 |
| Color depth | 8-bit |
| Transparency | Yes (alpha) |
| File size | 156 KB |
| Optimized | ~85 KB possible |

**Content:** Company logo with text "HYDRA"
**Legibility:** ✅ Clear at 100%, ⚠️ Text blurry below 50%
```

### Common Operations

| Operation | Parameters | Output |
|-----------|------------|--------|
| **Background removal** | Preserve edges, keep alpha | `name__bg-removed.png` |
| **Convert to WEBP** | Quality target (80-95%) | `name__optimized.webp` |
| **Resize** | Target dimensions, maintain aspect | `name__768x1004.webp` |
| **Batch process** | Operations list | Manifest + outputs |

### Output Naming Scheme

```
{original_name}__{operation}.{format}

Examples:
- logo__bg-removed.png
- hero__optimized.webp
- banner__768x400.webp
- icon__32x32.png
```

### Batch Processing

```markdown
## 🖼️ Batch Processing: 5 images

| Input | Operations | Output | Status |
|-------|------------|--------|--------|
| hero.jpg | resize, webp | hero__1920x1080.webp | ✅ |
| logo.png | bg-remove | logo__bg-removed.png | ✅ |
| icon.png | resize | icon__64x64.png | ✅ |
| banner.jpg | webp | banner__optimized.webp | ✅ |
| photo.jpg | resize, webp | photo__800x600.webp | ✅ |

**Outputs saved to:** `./processed/`
**Total size reduction:** 2.4 MB → 890 KB (63% smaller)
```

---

## 🔐 4. SECURITY NOTES

### Universal Rules (ZIP + Images + All Files)

```
┌─────────────────────────────────────────────────────────────────┐
│  FILE SECURITY RULES                                            │
├─────────────────────────────────────────────────────────────────┤
│  ❌ NEVER embed secrets in generated files                      │
│  ❌ NEVER execute extracted binaries                            │
│  ❌ NEVER auto-process without user consent                     │
│  ❌ NEVER trust file extensions alone (check magic bytes)       │
│                                                                 │
│  ✅ ALWAYS describe modifications before applying               │
│  ✅ ALWAYS preserve originals (non-destructive)                 │
│  ✅ ALWAYS sanitize file names                                  │
│  ✅ ALWAYS respect size limits                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Size Limits

| Type | Max Size | Action if Exceeded |
|------|----------|-------------------|
| Single file | 100 MB | Warn, require confirmation |
| Archive | 500 MB | Warn, partial extraction option |
| Image | 50 MB | Suggest optimization first |
| Batch total | 1 GB | Process in chunks |
