# Test Cases - Recorded Workflow
**Generated from**: recording-1774357330408-final.json
**Date**: March 24, 2026
**Base URL**: https://maple-aio-3-m1.otxlab.net/bo

---

## Test Suite Overview
This test suite is auto-generated from recorded user interactions.

---

## TC-001: User Login
**Priority**: Critical
**Type**: Functional

### Objective
Verify that a user can successfully log in to the application with valid credentials.

### Preconditions
- Application is accessible
- User account exists with valid credentials

### Test Steps
1. Enter "suite-admin" in #username (#username)
2. Enter value in #password (#password)
3. Enter "Admin_1234" in #password (#password)
4. Click on Sign in (#submit)

### Expected Results
- User is successfully authenticated
- User is redirected to the main dashboard

### Test Data
- username: suite-admin
- password: Admin_1234

---

## Test Execution Summary

### Total Test Cases: 1

### Priority Breakdown
- Critical: 1

### Test Category Breakdown
- Functional: 1

### Key Workflows Covered
1. Authentication Flow

---

## Test Environment Details
- **Application**: maple-aio-3-m1.otxlab.net
- **Test User**: suite-admin

---

## Notes
- All test cases are based on recorded user interactions
- XPath, CSS selectors, and element IDs are provided for automation
- Test data values are captured from the recording
- Consider replacing placeholder values with meaningful test data

---

## Automation Guidelines
- UI interactions include multiple locator strategies where available
- Page type indicators help identify context switches (main, popup)
- Timestamps show the actual flow timing for performance baseline
- Consider adding explicit waits for page loads and transitions