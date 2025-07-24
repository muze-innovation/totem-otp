#!/usr/bin/env node

/**
 * Publishing script for TotemOTP monorepo
 * Handles building and publishing packages in correct dependency order
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Package publishing order (core first, then dependent packages)
const PUBLISH_ORDER = [
  'packages/core',
  'packages/storage-redis', 
  'packages/delivery-webhook',
  'packages/validation-receipt-jose'
];

const REGISTRY_URL = process.env.NPM_REGISTRY || 'https://registry.npmjs.org/';
const DRY_RUN = process.argv.includes('--dry-run');
const TAG = process.argv.find(arg => arg.startsWith('--tag='))?.split('=')[1] || 'latest';

function log(message, level = 'info') {
  const timestamp = new Date().toISOString();
  const prefix = level === 'error' ? '❌' : level === 'warn' ? '⚠️' : '✅';
  console.log(`${prefix} [${timestamp}] ${message}`);
}

function executeCommand(command, cwd = process.cwd()) {
  log(`Executing: ${command}`, 'info');
  try {
    const result = execSync(command, { 
      cwd, 
      stdio: 'inherit',
      encoding: 'utf8'
    });
    return result;
  } catch (error) {
    log(`Command failed: ${command}`, 'error');
    log(`Error: ${error.message}`, 'error');
    process.exit(1);
  }
}

function getPackageInfo(packagePath) {
  const packageJsonPath = path.join(packagePath, 'package.json');
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found in ${packagePath}`);
  }
  
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  return {
    name: packageJson.name,
    version: packageJson.version,
    private: packageJson.private || false,
    path: packagePath
  };
}

function checkPackageExists(packageName, version) {
  try {
    const result = execSync(`npm view ${packageName}@${version} version --registry=${REGISTRY_URL}`, {
      stdio: 'pipe',
      encoding: 'utf8'
    });
    return result.trim() === version;
  } catch {
    return false;
  }
}

function buildPackage(packagePath) {
  log(`Building package: ${packagePath}`);
  
  // Clean first
  executeCommand('npm run clean', packagePath);
  
  // Build
  executeCommand('npm run build', packagePath);
  
  log(`✅ Built package: ${packagePath}`);
}

function testPackage(packagePath) {
  log(`Testing package: ${packagePath}`);
  executeCommand('npm test', packagePath);
  log(`✅ Tests passed: ${packagePath}`);
}

function publishPackage(packageInfo) {
  const { name, version, path: packagePath } = packageInfo;
  
  if (packageInfo.private) {
    log(`Skipping private package: ${name}`, 'warn');
    return;
  }
  
  // Check if version already exists
  if (checkPackageExists(name, version)) {
    log(`Version ${version} of ${name} already exists, skipping`, 'warn');
    return;
  }
  
  log(`Publishing package: ${name}@${version}`);
  
  const publishCmd = [
    'npm publish',
    '--access public',
    `--tag ${TAG}`,
    `--registry=${REGISTRY_URL}`,
    DRY_RUN ? '--dry-run' : ''
  ].filter(Boolean).join(' ');
  
  executeCommand(publishCmd, packagePath);
  
  if (!DRY_RUN) {
    log(`✅ Published: ${name}@${version}`);
  } else {
    log(`✅ Dry run completed: ${name}@${version}`);
  }
}

async function main() {
  log('🚀 Starting TotemOTP publishing process');
  
  if (DRY_RUN) {
    log('🔍 Running in DRY RUN mode - no packages will be actually published', 'warn');
  }
  
  log(`📦 Publishing to registry: ${REGISTRY_URL}`);
  log(`🏷️  Using tag: ${TAG}`);
  
  // Validate all packages exist
  const packages = PUBLISH_ORDER.map(packagePath => {
    try {
      return getPackageInfo(packagePath);
    } catch (error) {
      log(`Failed to read package info for ${packagePath}: ${error.message}`, 'error');
      process.exit(1);
    }
  });
  
  log(`📋 Found ${packages.length} packages to process:`);
  packages.forEach(pkg => {
    log(`   - ${pkg.name}@${pkg.version} (${pkg.path})`);
  });
  
  // Build and test all packages
  log('\n🔨 Building and testing packages...');
  for (const packageInfo of packages) {
    if (packageInfo.private) {
      log(`Skipping private package build: ${packageInfo.name}`, 'warn');
      continue;
    }
    
    buildPackage(packageInfo.path);
    testPackage(packageInfo.path);
  }
  
  // Publish packages in dependency order
  log('\n📤 Publishing packages...');
  for (const packageInfo of packages) {
    publishPackage(packageInfo);
  }
  
  log('\n🎉 Publishing process completed successfully!');
  
  if (!DRY_RUN) {
    log('\n📋 Published packages:');
    packages
      .filter(pkg => !pkg.private)
      .forEach(pkg => {
        log(`   - ${pkg.name}@${pkg.version}`);
        log(`     npm install ${pkg.name}`);
      });
  }
}

// Run the script
main().catch(error => {
  log(`Fatal error: ${error.message}`, 'error');
  process.exit(1);
});