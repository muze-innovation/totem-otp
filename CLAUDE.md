# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is the **TotemOTP** project - a TypeScript OTP (One-Time Password) generation and validation library. It provides a configurable framework for OTP handling with pluggable storage, delivery agents, and schema configurations.

## Development Setup

This is a monorepo with npm workspaces:

- Root: Contains workspace configuration and Jest testing
- `packages/core/`: Main library implementation

### Commands

- `npm test` - Run Jest tests from root
- `npm run build` - Build the library (run from packages/core/)
- `npm run clean` - Clean build artifacts (run from packages/core/)

### Build Configuration

- Uses TypeScript with dual builds: CommonJS (`tsconfig.json`) and ESM (`tsconfig.esm.json`)
- Outputs to `lib/cjs/` and `lib/esm/` directories
- Main entry: `lib/cjs/src/index.js`
- Module entry: `lib/esm/src/index.js`
- Uses Zod for schema validation

## Key Architecture

TotemOTP is built around three core configurable components:

1. **Storage** (`IOTPStorage`): Handles OTP persistence and retrieval
2. **Delivery Agents** (`IDeliveryAgent`): Handles message delivery to targets 
3. **Schema Configuration**: Defines OTP format, aging policies, and validation rules

The main entry point is the `TotemOTP` class which orchestrates these components through:
- `request(target, parentReference)` - Generate and send OTP
- `validate(reference, otpValue)` - Validate received OTP

## Code Structure

```
packages/core/src/
├── index.ts              # Main exports
├── interfaces/index.ts   # Core interfaces and types
└── validations/schema.ts # Zod schemas (currently minimal)
```

## Key Interfaces

- `IOTPTarget`: Defines delivery targets (msisdn/email)
- `IOTPValue`: Core OTP data structure
- `IDeliveryAgent`: Message delivery interface
- `IOTPStorage`: Storage persistence interface
- `ITotemOTP`: Main library interface

## Configuration Structure

The library uses a configuration object with three main sections:
- `delivery_agents[]`: Array of delivery agents with match functions
- `schemas[]`: Array of OTP schemas with aging policies
- `storage`: Storage implementation instance

## Error Handling

The library throws specific error types:
- `ResendBlockedError`: When resend is blocked by aging policy
- `DeliveryFailedError`: When delivery agent fails
- `NoSchemaMatchedTargetConfigError`: No matching schema found
- `NoDeliveryAgentMatchedConfigError`: No matching delivery agent
- `UnknownReferenceError`: Invalid OTP reference
- `OTPUsedError`: OTP already validated
- `OTPMismatchedError`: OTP value mismatch

## Development Memories

- We are using npm workspace hence dependencies reference should be using "*" not "workspace:*"