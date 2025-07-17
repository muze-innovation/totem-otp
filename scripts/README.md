# Publishing Scripts

This directory contains scripts for building and publishing TotemOTP packages.

## Files

- `publish.js` - Main publishing script that handles building and publishing all packages in dependency order

## Features

The publishing script provides:

1. **Dependency-Aware Publishing**: Publishes `@totem-otp/core` first, then dependent packages
2. **Build & Test Validation**: Ensures all packages build and test successfully before publishing
3. **Duplicate Prevention**: Skips packages already published with the same version
4. **Dry Run Support**: Test publishing without actually uploading packages
5. **Tag Support**: Publish to different npm tags (latest, beta, etc.)
6. **Detailed Logging**: Clear progress indication with timestamps
7. **Error Handling**: Stops on first failure to prevent partial publishes

## Usage Examples

```bash
# Dry run - see what would happen
npm run publish:dry

# Publish all packages
npm run publish:packages

# Publish to beta tag
npm run publish:beta
```

## Environment Variables

- `NPM_REGISTRY` - Override npm registry URL (default: https://registry.npmjs.org/)
- `NPM_TOKEN` - npm authentication token (alternative to `npm login`)

## Script Arguments

- `--dry-run` - Preview what would be published without actually publishing
- `--tag=<tagname>` - Publish to specific npm tag (default: latest)

## Package Publishing Order

1. `@totem-otp/core` - Core functionality
2. `@totem-otp/storage-redis` - Redis storage (depends on core)
3. `@totem-otp/delivery-webhook` - Webhook delivery (depends on core)

This order ensures dependencies are available before dependent packages are published.