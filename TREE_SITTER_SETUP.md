# Tree-sitter Setup Guide

This guide explains how to set up Tree-sitter for the architecture diagram analyzer.

## Overview

The architecture diagram analyzer uses Tree-sitter for accurate code parsing and dependency analysis. Tree-sitter provides AST-based parsing that is much more reliable than regex for understanding code structure.

## Current Setup

The analyzer is currently configured with:
- **Web-tree-sitter** for browser-compatible parsing
- **Hybrid approach**: Tree-sitter when available, regex fallback when not
- **12 supported languages**: JavaScript, TypeScript, Python, Java, Go, Rust, C++, C#, PHP, Ruby

## Setup Steps

### 1. Download WASM Files

Run the setup script to download Tree-sitter language WASM files:

```bash
node setup-tree-sitter.js
```

This will download WASM files for all supported languages to `frontend/public/tree-sitter/`.

### 2. Alternative: Manual Download

If the script fails, you can download WASM files manually from GitHub releases:

```bash
# Create directory
mkdir -p frontend/public/tree-sitter

# Download each language (example for JavaScript)
curl -L -o frontend/public/tree-sitter/tree-sitter-javascript.wasm \
  https://github.com/tree-sitter/tree-sitter-javascript/releases/download/v0.21.0/tree-sitter-javascript.wasm
```

Repeat for all languages listed in `setup-tree-sitter.js`.

### 3. Restart Development Server

After downloading WASM files, restart your Next.js development server:

```bash
npm run dev
```

## How It Works

### Tree-sitter First, Regex Fallback

The analyzer tries Tree-sitter parsing first:

```typescript
try {
  // Try Tree-sitter AST parsing
  const tree = parser.parse(file.content);
  const imports = extractImports(tree, language);
  // Success!
} catch (error) {
  // Fall back to regex parsing
  const imports = extractImportsWithRegex(file.content, language);
}
```

### Language Support

| Language | Tree-sitter Parser | Regex Fallback |
|----------|-------------------|----------------|
| JavaScript | ✅ AST-based | ✅ Advanced regex |
| TypeScript | ✅ AST-based | ✅ Advanced regex |
| Python | ✅ AST-based | ✅ Advanced regex |
| Java | ✅ AST-based | ✅ Advanced regex |
| Go | ✅ AST-based | ✅ Advanced regex |
| Rust | ✅ AST-based | ✅ Advanced regex |
| C/C++ | ✅ AST-based | ✅ Advanced regex |
| C# | ✅ AST-based | ✅ Advanced regex |
| PHP | ✅ AST-based | ✅ Advanced regex |
| Ruby | ✅ AST-based | ✅ Advanced regex |

## Benefits of Tree-sitter

### Accuracy
- **AST parsing** understands code structure, not just text patterns
- **Handles complex syntax** correctly (nested imports, conditional exports, etc.)
- **Language-aware** parsing respects each language's grammar rules

### Performance
- **Incremental parsing** for large codebases
- **Memory efficient** AST representation
- **Fast queries** on parsed trees

### Reliability
- **Deterministic results** - same code always produces same AST
- **No false positives** from regex pattern matching
- **Handles edge cases** that regex would miss

## Example: Import Detection

### Regex Approach (Limited):
```javascript
// This regex might work for simple cases:
import { User } from './models/user';

// But fails with complex patterns:
import React, { useState, useEffect as useSideEffect } from 'react';
import * as utils from '../utils/helpers';
import config from '../../config';
```

### Tree-sitter Approach (Accurate):
```javascript
// Tree-sitter AST parsing handles all cases correctly:
// - Named imports: { User }
// - Default imports: config
// - Namespace imports: * as utils
// - Aliases: useEffect as useSideEffect
// - Relative vs absolute paths
```

## Testing

After setup, test the architecture analyzer:

1. Navigate to `/architecture-diagrams`
2. Select a repository that has been set up
3. Click "Generate Architecture Diagram"
4. Check console logs for:
   - `✅ Parsed [file] with Tree-sitter ([language])` - Success!
   - `⚠️ Used regex fallback for [file]` - WASM not loaded

## Troubleshooting

### WASM Files Not Loading
- Ensure files are in `frontend/public/tree-sitter/`
- Check file permissions
- Verify WASM file integrity

### Parser Initialization Errors
- Check that web-tree-sitter is properly installed
- Verify WASM file URLs are accessible
- Check browser console for CORS errors

### Fallback Behavior
- If Tree-sitter fails, the system automatically uses regex
- Check logs to see which parsing method was used
- Regex fallback is still deterministic and accurate

## Advanced Configuration

### Custom Language Support
Add new languages by:

1. Finding/creating Tree-sitter grammar
2. Building WASM file
3. Adding to `languageConfigs` array
4. Implementing AST extraction methods

### Performance Tuning
- Adjust parser timeout settings
- Configure memory limits for large files
- Enable/disable languages as needed

## Architecture Impact

Tree-sitter enables:
- **Accurate dependency graphs** from real code relationships
- **Language-specific analysis** (e.g., Go's export rules by capitalization)
- **Complex pattern recognition** (inheritance, interfaces, mixins)
- **Future extensibility** for advanced code analysis features

The hybrid approach ensures the system works immediately while providing a path to full Tree-sitter accuracy.
