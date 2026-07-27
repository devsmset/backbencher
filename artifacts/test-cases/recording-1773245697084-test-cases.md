# Test Cases - Recorded Workflow
**Generated from**: recording-1773245697084-final.json
**Date**: March 11, 2026
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
1. Click on TENANTS (div.boHomeCatalog > div.boSquare.boSquareTenant > div.boSquareContent > div.boSquareTable > div.boSquareCell > span.boHomeCategory)
2. Click on 201816390 (div.fixedDataTableRowLayout_body > div.fixedDataTableCellGroupLayout_cellGroupWrapper > div.fixedDataTableCellGroupLayout_cellGroup > div.fixedDataTableCellLayout_main.public_fixedDataTableCell_main > div.entityGridCell > a)
3. Click on Capability settings (div.entityDetailPage > div.entityDetailPageBody > div.entityDetailPageSidePanel > ul.entityDetailPageSideNavList > li > a.entityDetailPageSideNavLink)
4. Click on TEST CONNECTION (div.entityDetailPageSection > div.entityDetailPageSectionInner > div > div.entitySectionFieldSet.capabilitySettingsForm > div.entitySectionFooter > button.boNormalButton)
5. Click on Deploy new capability (button > span.entityToolbarButtonText)

### Expected Results
- Interaction completes without errors

---

## TC-003: Recorded Interaction 3
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.entityFormSelect > div.Select.selectorWrapper.is-clearable.is-focused.is-open.is-searchable.Select--single > div.Select-control > span.Select-arrow-zone (div.entityFormSelect > div.Select.selectorWrapper.is-clearable.is-focused.is-open.is-searchable.Select--single > div.Select-control > span.Select-arrow-zone)
2. Enter "https://maple-aio-m1.otxlab.net:38090/cms-gateway" in #TENANT_201816390_CAPABILITY_NEW-cmsGatewayUrl (#TENANT_201816390_CAPABILITY_NEW-cmsGatewayUrl)
3. Enter "https://maple-aio-m1.otxlab.net:38090/cms-gateway" in #TENANT_201816390_CAPABILITY_NEW-cmsGlobalUser (#TENANT_201816390_CAPABILITY_NEW-cmsGlobalUser)
4. Click on #TENANT_201816390_CAPABILITY_NEW-cmsGlobalUserPassword (#TENANT_201816390_CAPABILITY_NEW-cmsGlobalUserPassword)
5. Enter " suite-admin" in #TENANT_201816390_CAPABILITY_NEW-cmsGlobalUser (#TENANT_201816390_CAPABILITY_NEW-cmsGlobalUser)

### Expected Results
- Interaction completes without errors

### Test Data
- TENANT_201816390_CAPABILITY_NEW-cmsGatewayUrl: https://maple-aio-m1.otxlab.net:38090/cms-gateway
- TENANT_201816390_CAPABILITY_NEW-cmsGlobalUser: https://maple-aio-m1.otxlab.net:38090/cms-gateway

---

## TC-004: User Login
**Priority**: Critical
**Type**: Functional

### Objective
Verify that a user can successfully log in to the application with valid credentials.

### Preconditions
- Application is accessible
- User account exists with valid credentials

### Test Steps
1. Enter "Admin_1234" in #TENANT_201816390_CAPABILITY_NEW-cmsGlobalUserPassword (#TENANT_201816390_CAPABILITY_NEW-cmsGlobalUserPassword)
2. Click on div.entityModalBody.modal-body > form > div > div.entityFormBigField > div.entityFormControl > div.desc (div.entityModalBody.modal-body > form > div > div.entityFormBigField > div.entityFormControl > div.desc)
3. Click on Loading... (div.Select-multi-value-wrapper > div.Select-placeholder)
4. Click on CANCEL (div > div.fade.deployNewCapabilityModal.in.modal > div.modal-dialog > div.modal-content > div.entityModalFooter.modal-footer > button.boNormalButton)
5. Click on #boUtilsUserMenu (#boUtilsUserMenu)
6. Click on Logout (li > a)

### Expected Results
- User is successfully authenticated
- User is redirected to the main dashboard

### Test Data
- TENANT_201816390_CAPABILITY_NEW-cmsGlobalUserPassword: Admin_1234

---

## Test Execution Summary

### Total Test Cases: 4

### Priority Breakdown
- Critical: 2
- Medium: 2

### Test Category Breakdown
- Functional: 4

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