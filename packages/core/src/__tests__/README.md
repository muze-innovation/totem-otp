# TotemOTP Test Suite

This directory contains comprehensive tests for the TotemOTP engine implementation.

## Test Files

### 1. `totem-otp.test.ts` - Unit Tests
**33 tests covering:**

#### Constructor Tests
- ✅ Creates TotemOTP instance with configuration

#### Request Method Tests
**Success Cases:**
- ✅ Successfully request OTP without parent reference
- ✅ Successfully request OTP with valid parent reference
- ✅ Handle missing markAsSent implementation gracefully

**Error Cases:**
- ✅ Throws `UnknownReferenceError` when parent reference does not exist
- ✅ Throws `ResendBlockedError` when resend is not allowed yet
- ✅ Throws `NoSchemaMatchedTargetConfigError` when no schema matches
- ✅ Throws `NoDeliveryAgentMatchedConfigError` when no delivery agent matches
- ✅ Handles delivery agent failure
- ✅ Handles storage failure

#### Validate Method Tests
**Success Cases:**
- ✅ Successfully validate OTP
- ✅ Handle multiple validation attempts within limit

**Error Cases:**
- ✅ Throws `UnknownReferenceError` when reference does not exist
- ✅ Throws `OTPMismatchedError` when OTP value does not match
- ✅ Throws `OTPUsedError` when OTP has been used too many times
- ✅ Handles storage fetch failure
- ✅ Handles storage markAsUsed failure

#### Private Method Tests
- ✅ matchSchema returns first schema when no match function provided
- ✅ matchSchema returns matching schema when multiple schemas exist
- ✅ matchDeliveryAgent returns first agent when no match function provided
- ✅ matchDeliveryAgent returns matching agent when multiple agents exist

#### Edge Cases
- ✅ Handles concurrent requests
- ✅ Handles storage lazy initialization

### 2. `totem-otp.integration.test.ts` - Integration Tests
**9 tests covering:**

#### Complete OTP Flow
- ✅ Complete full OTP lifecycle for email
- ✅ Complete full OTP lifecycle for msisdn with multiple validations
- ✅ Handle resend scenario correctly

#### Error Scenarios with Realistic Timing
- ✅ Handle expired OTP validation attempt
- ✅ Handle race condition in concurrent validations
- ✅ Handle validation with wrong OTP after successful request

#### Schema and Agent Matching
- ✅ Use correct schema based on target type

#### Storage Interaction Patterns
- ✅ Call storage methods in correct order
- ✅ Handle storage operations that take time

## Test Coverage Summary

### Methods Tested
- ✅ `constructor()` - Configuration handling
- ✅ `request()` - OTP generation and delivery
- ✅ `validate()` - OTP validation
- ✅ `matchSchema()` - Schema matching logic
- ✅ `matchDeliveryAgent()` - Delivery agent matching logic

### Error Scenarios Tested
- ✅ `UnknownReferenceError` - Invalid OTP reference
- ✅ `ResendBlockedError` - Resend too early
- ✅ `NoSchemaMatchedTargetConfigError` - No matching schema
- ✅ `NoDeliveryAgentMatchedConfigError` - No matching delivery agent
- ✅ `OTPMismatchedError` - Wrong OTP value
- ✅ `OTPUsedError` - OTP used too many times
- ✅ Storage failures
- ✅ Delivery agent failures

### Edge Cases Tested
- ✅ Concurrent requests
- ✅ Storage lazy initialization
- ✅ Race conditions in validation
- ✅ Multiple schema/agent matching
- ✅ Optional interface methods (markAsSent)
- ✅ Timing-based scenarios
- ✅ Different target types (email/msisdn)

## Running Tests

```bash
npm test --workspace=packages/core
```

## Test Statistics
- **Total Tests**: 42
- **Test Files**: 3
- **Coverage**: All public methods and error scenarios
- **Test Types**: Unit tests, Integration tests, Edge cases