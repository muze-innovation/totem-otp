# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **TotemOTP** project - a TypeScript OTP (One-Time Password) generation and validation library. It provides a configurable framework for OTP handling with pluggable storage, delivery agents, and schema configurations.

## Development Setup

This is a monorepo with npm workspaces:

- Root: Contains workspace configuration and Jest testing
- `packages/core/`: Main library implementation
- `packages/storage-redis/`: Redis storage implementation
- `packages/delivery-webhook/`: Webhook delivery agent implementation
- `examples/express/`: Example Express.js integration

### Commands

- `npm test` - Run Jest tests from root (all packages)
- `npm run test:all` - Run tests across all workspaces
- `npm run build` - Build all packages
- `npm run clean` - Clean build artifacts from all packages
- `npm run lint` - Check code formatting with Prettier
- `npm run lint:fix` - Fix code formatting with Prettier
- `npm test` (in packages/core/) - Run tests for core package only
- `npm run build` (in packages/core/) - Build core package only

### Build Configuration

- Uses TypeScript with dual builds: CommonJS (`tsconfig.json`) and ESM (`tsconfig.esm.json`)
- Outputs to `lib/cjs/` and `lib/esm/` directories
- Main entry: `lib/cjs/src/index.js`
- Module entry: `lib/esm/src/index.js`
- Uses Zod for schema validation

## Key Architecture

TotemOTP is built around four core configurable components:

1. **Storage** (`IOTPStorage`): Handles OTP persistence and retrieval
2. **Delivery Agents** (`IDeliveryAgent`): Handles message delivery to targets 
3. **Schema Configuration**: Defines OTP format, aging policies, and validation rules
4. **ValidationReceipt** (`IValidationReceiptGenerator`): Optional component for generating validation receipts

The main entry point is the `TotemOTP` class which orchestrates these components through:
- `request(target, parentReference)` - Generate and send OTP
- `validate(reference, otpValue)` - Validate received OTP
- `validate(reference, otpValue, purpose)` - Validate OTP and generate validation receipt
- `validateReceipt(reference, receipt, purpose)` - Validate a previously generated receipt

## Code Structure

```
packages/core/src/
├── index.ts              # Main exports
├── totem-otp.ts         # Main TotemOTP class implementation
├── interfaces/index.ts   # Core interfaces and types
├── errors/              # Custom error classes
│   ├── DeliveryFailedError.ts
│   ├── NoDeliveryAgentMatchedConfigError.ts
│   ├── NoSchemaMatchedTargetConfigError.ts
│   ├── OTPMismatchedError.ts
│   ├── OTPUsedError.ts
│   ├── ResendBlockedError.ts
│   └── index.ts
├── utils/               # Utility functions
│   ├── generator.ts     # OTP and reference generation utilities
│   └── index.ts
└── __tests__/           # Test files
    ├── totem-otp.test.ts
    └── totem-otp.integration.test.ts

packages/storage-redis/src/
├── index.ts
├── RedisOTPStorage.ts   # Redis implementation of IOTPStorage
└── __tests__/

packages/delivery-webhook/src/
├── index.ts
├── WebhookDeliveryAgent.ts  # Webhook implementation of IDeliveryAgent
└── __tests__/
```

## Key Interfaces

- `IOTPTarget`: Defines delivery targets (msisdn/email)
- `IOTPValue`: Core OTP data structure
- `IValidationReceipt`: Receipt structure for validated OTPs
- `IDeliveryAgent`: Message delivery interface
- `IOTPStorage`: Storage persistence interface
- `IValidationReceiptGenerator`: Optional validation receipt generation interface
- `ITotemOTP`: Main library interface

## Configuration Structure

The library uses a configuration object with four main sections:
- `delivery_agents[]`: Array of delivery agents with match functions
- `schemas[]`: Array of OTP schemas with aging policies
- `storage`: Storage implementation instance
- `validationReceipt`: Optional validation receipt generator implementation

## Error Handling

The library throws specific error types:
- `ResendBlockedError`: When resend is blocked by aging policy
- `DeliveryFailedError`: When delivery agent fails
- `NoSchemaMatchedTargetConfigError`: No matching schema found
- `NoDeliveryAgentMatchedConfigError`: No matching delivery agent
- `UnknownReferenceError`: Invalid OTP reference
- `OTPUsedError`: OTP already validated
- `OTPMismatchedError`: OTP value mismatch
- `ValidationReceiptError`: Invalid or expired validation receipt
- `UnmatchedValidationReceipt`: No validation receipt generator available

## Testing

- Uses Jest with TypeScript support (`ts-jest`)
- Test files follow the pattern `**/__tests__/**/*.test.ts`
- Tests are located alongside source files in `__tests__/` directories
- Coverage collection excludes test files and type definitions
- Run individual package tests by navigating to the package directory and running `npm test`

## Package Publishing

- `npm run publish:dry` - Dry run of package publishing
- `npm run publish:packages` - Publish packages to npm
- `npm run publish:beta` - Publish with beta tag
- Version management commands available for patch/minor/major bumps
- Pre-publish hook runs clean, build, and test:all

## Development Memories

- We are using npm workspace hence dependencies reference should be using "*" not "workspace:*"
- Each package has dual build outputs (CommonJS and ESM) in `lib/cjs/` and `lib/esm/` directories
- The project follows interface-driven design with pluggable components