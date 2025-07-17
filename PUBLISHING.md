# TotemOTP Publishing Guide

This guide covers how to build, test, and publish TotemOTP packages to npm.

## Prerequisites

1. **npm Account**: Ensure you have access to publish to the `totem-otp` organization on npm
2. **npm Login**: Run `npm login` to authenticate with npm registry
3. **Git Clean State**: Ensure your working directory is clean and all changes are committed

## Package Structure

The monorepo contains the following publishable packages:

- `totem-otp` - Core OTP generation and validation logic
- `totem-otp-storage-redis` - Redis storage implementation
- `totem-otp-delivery-webhook` - Webhook delivery agent

## Publishing Commands

### Quick Commands

```bash
# Dry run - see what would be published without actually publishing
npm run publish:dry

# Publish all packages to latest tag
npm run publish:packages

# Publish all packages to beta tag
npm run publish:beta
```

### Step-by-Step Process

```bash
# 1. Clean all build artifacts
npm run clean

# 2. Build all packages
npm run build

# 3. Run all tests
npm run test:all

# 4. Lint code (optional)
npm run lint

# 5. Dry run to verify everything looks correct
npm run publish:dry

# 6. Publish to npm
npm run publish:packages
```

## Version Management

### Updating Versions

```bash
# Patch version (0.0.1 -> 0.0.2)
npm run version:patch

# Minor version (0.0.1 -> 0.1.0)
npm run version:minor

# Major version (0.0.1 -> 1.0.0)
npm run version:major
```

### Manual Version Updates

You can also manually update versions in each package's `package.json`:

1. `packages/core/package.json`
2. `packages/storage-redis/package.json`
3. `packages/delivery-webhook/package.json`

**Important**: Keep peer dependency versions in sync when updating.

## Publishing Script Features

The custom publishing script (`scripts/publish.js`) provides:

1. **Dependency Order**: Publishes packages in correct order (core first, then dependent packages)
2. **Duplicate Check**: Skips packages that are already published with the same version
3. **Build Validation**: Ensures all packages build and test successfully before publishing
4. **Dry Run Mode**: Allows testing the publishing process without actually publishing
5. **Tag Support**: Supports publishing to different npm tags (latest, beta, etc.)

## Environment Variables

```bash
# Optional: specify custom npm registry
export NPM_REGISTRY=https://registry.npmjs.org/

# Required for publishing (or use npm login)
export NPM_TOKEN=your_npm_token
```

## Common Scenarios

### Publishing a New Version

```bash
# 1. Update versions
npm run version:patch

# 2. Commit version changes
git add -A
git commit -m "chore: bump version to v0.0.2"

# 3. Build and test
npm run clean && npm run build && npm run test:all

# 4. Publish
npm run publish:packages

# 5. Create git tag
git tag v0.0.2
git push origin main --tags
```

### Publishing Beta Version

```bash
# 1. Update to beta version (e.g., 0.1.0-beta.1)
# Edit package.json files manually or use npm version

# 2. Publish to beta tag
npm run publish:beta

# 3. Test installation
npm install totem-otp@beta
```

### Republishing After Failure

If publishing fails partway through:

```bash
# Check which packages were published
npm view totem-otp
npm view totem-otp-storage-redis  
npm view totem-otp-delivery-webhook

# Run publish again - script will skip already published packages
npm run publish:packages
```

## Package Dependencies

The packages have these dependencies:

- `totem-otp-storage-redis` depends on `totem-otp`
- `totem-otp-delivery-webhook` depends on `totem-otp`

The publishing script ensures `totem-otp` is always published first.

## Troubleshooting

### Permission Errors

```bash
# Ensure you're logged in
npm whoami

# Check organization access
npm org ls totem-otp

# Login if needed
npm login
```

### Build Failures

```bash
# Clean and rebuild
npm run clean
npm install
npm run build

# Check TypeScript errors
npx tsc --noEmit --project packages/core/tsconfig.json
```

### Version Conflicts

If you get version conflicts:

1. Check existing published versions: `npm view totem-otp versions --json`
2. Update to a new version number
3. Ensure peer dependencies are compatible

### Registry Issues

```bash
# Check current registry
npm config get registry

# Use npm public registry
npm config set registry https://registry.npmjs.org/

# Or set for single command
npm publish --registry https://registry.npmjs.org/
```

## Post-Publishing Checklist

After successful publishing:

1. ✅ Verify packages are available: `npm view totem-otp`
2. ✅ Test installation: `npm install totem-otp`
3. ✅ Update documentation if needed
4. ✅ Create GitHub release with changelog
5. ✅ Announce new version (Discord, Slack, etc.)

## Security Notes

- Never commit npm tokens to git
- Use npm two-factor authentication when possible
- Review what files are included in published packages (check .npmignore)
- Test packages in a clean environment before publishing
