#!/usr/bin/env node

/**
 * Tree-sitter WASM Setup Script
 *
 * This script downloads Tree-sitter language WASM files for the architecture analyzer.
 * Run this after installing dependencies to enable full Tree-sitter parsing.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const TREE_SITTER_DIR = path.join(__dirname, 'frontend', 'public', 'tree-sitter');

// Language configurations with their WASM file URLs from tree-sitter.github.io
const languages = [
    {
        name: 'javascript',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-javascript.wasm'
    },
    {
        name: 'typescript',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-typescript.wasm'
    },
    {
        name: 'python',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-python.wasm'
    },
    {
        name: 'java',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-java.wasm'
    },
    {
        name: 'go',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-go.wasm'
    },
    {
        name: 'rust',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-rust.wasm'
    },
    {
        name: 'cpp',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-cpp.wasm'
    },
    {
        name: 'c',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-c.wasm'
    },
    {
        name: 'c-sharp',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-c-sharp.wasm'
    },
    {
        name: 'php',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-php.wasm'
    },
    {
        name: 'ruby',
        url: 'https://raw.githubusercontent.com/tree-sitter/tree-sitter.github.io/master/tree-sitter-ruby.wasm'
    }
];

function downloadFile(url, destPath) {
    return new Promise((resolve, reject) => {
        const file = fs.createWriteStream(destPath);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download ${url}: ${response.statusCode}`));
                return;
            }

            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(destPath, () => { }); // Delete the file on error
            reject(err);
        });
    });
}

async function setupTreeSitter() {
    console.log('🚀 Setting up Tree-sitter WASM files...\n');

    // Create directory if it doesn't exist
    if (!fs.existsSync(TREE_SITTER_DIR)) {
        fs.mkdirSync(TREE_SITTER_DIR, { recursive: true });
        console.log(`📁 Created directory: ${TREE_SITTER_DIR}`);
    }

    // Download each language WASM file
    for (const lang of languages) {
        const fileName = `tree-sitter-${lang.name}.wasm`;
        const filePath = path.join(TREE_SITTER_DIR, fileName);

        try {
            console.log(`⬇️ Downloading ${lang.name}...`);
            await downloadFile(lang.url, filePath);
            console.log(`✅ ${lang.name} downloaded successfully`);
        } catch (error) {
            console.warn(`❌ Failed to download ${lang.name}:`, error.message);
            // Continue with other languages
        }
    }

    console.log('\n🎉 Tree-sitter setup complete!');
    console.log('📍 WASM files are located in:', TREE_SITTER_DIR);
    console.log('🔄 Restart your development server to use the new Tree-sitter parsers.');
}

// Run the setup
setupTreeSitter().catch(console.error);
