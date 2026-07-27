# Test Cases - Recorded Workflow
**Generated from**: recording-1772616187122-final.json
**Date**: March 4, 2026
**Base URL**: https://maple-aio-m1.otxlab.net/bo/

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
2. Press key in #password (#password)
3. Enter "Admin_1234" in #password (#password)
4. Click on Sign in (#submit)

### Expected Results
- User is successfully authenticated
- User is redirected to the main dashboard

### Test Data
- username: suite-admin
- password: Admin_1234

---

## TC-002: Recorded Interaction 2
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on TENANTS (#nav-link-tenant)
2. Click on AUDIT (#nav-link-audit)

### Expected Results
- Interaction completes without errors

---

## TC-003: User Logout
**Priority**: High
**Type**: Functional

### Objective
Verify that user can successfully log out from the application.

### Preconditions
- User is logged in

### Test Steps
1. Click on Logout (nav > div.audit-header-wrapper > div.audit-header-fixed > div.audit-header-flex-box > div.audit-header-toolbar > button.logout-button)

### Expected Results
- User is logged out successfully

---

## Test Execution Summary

### Total Test Cases: 3

### Priority Breakdown
- Critical: 1
- Medium: 1
- High: 1

### Test Category Breakdown
- Functional: 3

### Key Workflows Covered
1. Authentication Flow

---

## Test Environment Details
- **Application**: maple-aio-m1.otxlab.net
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