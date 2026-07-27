# Test Cases - Recorded Workflow
**Generated from**: recording-1774358274915-final.json
**Date**: March 24, 2026
**Base URL**: https://maple-aio-2-m1.otxlab.net:443/saw/ess?TENANTID=211650513

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
1. Enter "t10_admin" in #username (#username)
2. Click on Next (button.uxa-large.uxa-primary.cdk-focused.cdk-mouse-focused > span)
3. Enter "Admin_1234" in #password (#password)
4. Click on Sign in (button.uxa-large.uxa-primary.cdk-focused.cdk-mouse-focused > span)

### Expected Results
- User is successfully authenticated
- User is redirected to the main dashboard

### Test Data
- username: t10_admin
- password: Admin_1234

---

## TC-002: Navigate to Agent Interface
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to the Agent Interface.

### Preconditions
- User is logged in

### Test Steps
1. Click on Agent Interface (mat-list-item.mat-mdc-list-item.mdc-list-item.user-summary-item.mat-mdc-list-item-single-line.mdc-list-item--with-one-line.ng-star-inserted > span.mdc-list-item__content > span.mat-mdc-list-item-unscoped-content.mdc-list-item__primary-text > ess-header-user-profile-item > a.mat-mdc-tooltip-trigger.ess-header-item-link.ess-focus-btn.ng-star-inserted.cdk-focused.cdk-mouse-focused > div.ess-header-menu-item-label.without-total-count.ng-star-inserted)

### Expected Results
- Agent Interface opens successfully

---

## TC-003: Recorded Interaction 3
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)
2. Click on div.menu-category.admin-menu-category.section-title-in-lower-size > h3.nav-header.admin-menu-category-title.category-title > i.open-section-icon.icon-arrow-med-right (div.menu-category.admin-menu-category.section-title-in-lower-size > h3.nav-header.admin-menu-category-title.category-title > i.open-section-icon.icon-arrow-med-right)
3. Click on AI Studio (li.hovered > a)
4. Click on div.inline-block > div.sub-menu-items-dropdown.show-dropdown > div.dropdown > a.dropdown-toggle.ng-scope > span.main-menu-button__caret (div.inline-block > div.sub-menu-items-dropdown.show-dropdown > div.dropdown > a.dropdown-toggle.ng-scope > span.main-menu-button__caret)
5. Click on Virtual Agent (div.inline-block > div.sub-menu-items-dropdown.show-dropdown > div.dropdown.open > ul.dropdown-menu > li.dropdown-menu-subitem > a)

### Expected Results
- Interaction completes without errors

---

## TC-004: Recorded Interaction 4
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div > img.smax-header-user-avatar (div > img.smax-header-user-avatar)

### Expected Results
- Interaction completes without errors

---

## TC-005: User Logout
**Priority**: High
**Type**: Functional

### Objective
Verify that user can successfully log out from the application.

### Preconditions
- User is logged in

### Test Steps
1. Click on Logout (div.smax-header-toolbar > span.smax-header-more-features > div.smax-header-popover > ul.smax-header-list > li > a)

### Expected Results
- User is logged out successfully

---

## Test Execution Summary

### Total Test Cases: 5

### Priority Breakdown
- Critical: 1
- High: 2
- Medium: 2

### Test Category Breakdown
- Functional: 4
- Navigation: 1

### Key Workflows Covered
1. Authentication Flow

---

## Test Environment Details
- **Application**: maple-aio-2-m1.otxlab.net
- **Test Tenant**: 211650513
- **Test User**: t10_admin

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