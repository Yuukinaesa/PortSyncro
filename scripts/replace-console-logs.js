#!/usr/bin/env node

// scripts/replace-console-logs.js
// Script to replace console.log statements with secureLogger

const fs = require('fs');
const path = require('path');

// Directories to process
const directories = ['pages', 'components', 'lib'];

// Files to skip
const skipFiles = [
  'security.js',
  'middleware.js',
  'encryption.js',
  'csrf.js',
  'securityMonitoring.js'
];

function processFile(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    let modified = false;
    let newContent = content;

    // Replace console.log with secureLogger.log
    if (content.includes('console.log(')) {
      newContent = newContent.replace(
        /console\.log\(/g,
        'secureLogger.log('
      );
      modified = true;
    }

    // Replace console.error with secureLogger.error
    if (content.includes('console.error(')) {
      newContent = newContent.replace(
        /console\.error\(/g,
        'secureLogger.error('
      );
      modified = true;
    }

    // Replace console.warn with secureLogger.warn
    if (content.includes('console.warn(')) {
      newContent = newContent.replace(
        /console\.warn\(/g,
        'secureLogger.warn('
      );
      modified = true;
    }

    // Add import statement if needed
    if (modified && !content.includes('import.*secureLogger')) {
      const importStatement = "import { secureLogger } from '../lib/security';";
      const relativePath = path.relative(path.dirname(filePath), 'lib/security').replace(/\\/g, '/');
      const adjustedImport = importStatement.replace('../lib/security', `./${relativePath}`);
      
      // Find the last import statement
      const lines = newContent.split('\n');
      let lastImportIndex = -1;
      
      for (let i = 0; i < lines.length; i++) {
        if (lines[i].trim().startsWith('import ')) {
          lastImportIndex = i;
        }
      }
      
      if (lastImportIndex >= 0) {
        lines.splice(lastImportIndex + 1, 0, adjustedImport);
        newContent = lines.join('\n');
      } else {
        // No imports found, add at the top
        newContent = adjustedImport + '\n' + newContent;
      }
    }

    if (modified) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ Updated: ${filePath}`);
      return true;
    }

    return false;
  } catch (error) {
    console.error(`❌ Error processing ${filePath}:`, error.message);
    return false;
  }
}

function processDirectory(dirPath) {
  try {
    const files = fs.readdirSync(dirPath, { withFileTypes: true });
    
    for (const file of files) {
      const fullPath = path.join(dirPath, file.name);
      
      if (file.isDirectory()) {
        processDirectory(fullPath);
      } else if (file.name.endsWith('.js') || file.name.endsWith('.jsx')) {
        if (!skipFiles.includes(file.name)) {
          processFile(fullPath);
        }
      }
    }
  } catch (error) {
    console.error(`❌ Error processing directory ${dirPath}:`, error.message);
  }
}

function main() {
  console.log('🔄 Replacing console.log statements with secureLogger...');
  
  let totalFiles = 0;
  let updatedFiles = 0;
  
  for (const dir of directories) {
    const dirPath = path.join(process.cwd(), dir);
    if (fs.existsSync(dirPath)) {
      console.log(`\n📁 Processing directory: ${dir}`);
      processDirectory(dirPath);
    }
  }
  
  console.log('\n✅ Console.log replacement completed!');
  console.log('📝 Remember to test the application after these changes.');
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { processFile, processDirectory }; 