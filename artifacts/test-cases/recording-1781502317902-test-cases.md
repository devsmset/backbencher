# Test Cases - Recorded Workflow
**Generated from**: recording-1781502317902.json
**Date**: June 15, 2026
**Base URL**: https://maple-aio-3-m1.otxlab.net:443/saw/ess?TENANTID=914765860

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
1. Enter "esm" in #username (#username)
2. Enter "t9_admin" in #username (#username)
3. Click on Next (#next)
4. Click on #password (#password)
5. Press Enter in #password (#password)
6. Enter "Admin_1234" in #password (#password)
7. Click on Sign in (#submit)

### Expected Results
- User is successfully authenticated
- User is redirected to the main dashboard

### Test Data
- username: esm
- password: Admin_1234

---

## TC-002: Navigate to Service Portal
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to Service Portal.

### Preconditions
- User is logged in

### Test Steps
1. Click on Service Portal
todo (#ess-header)

### Expected Results
- Service Portal page loads successfully

---

## TC-003: Recorded Interaction 3
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on uxa-masthead.oob-theme uxa-masthead uxa-primary > div.ng-star-inserted:nth-of-type(1) > button.ess-main-menu-navbar ess-focus-masthead cdk-focused cdk-mouse-focused > uxa-icon > svg (uxa-masthead.oob-theme uxa-masthead uxa-primary > div.ng-star-inserted:nth-of-type(1) > button.ess-main-menu-navbar ess-focus-masthead cdk-focused cdk-mouse-focused > uxa-icon > svg)
2. Click on Theme Settings (div.uxa-drawer-wrapper > div.uxa-drawer-content ng-star-inserted > mat-nav-list.mat-mdc-nav-list mat-mdc-list-base mdc-list uxa-navigation-items ng-star-inserted > div.ng-star-inserted:nth-of-type(3) > mat-list-item.mat-mdc-list-item mdc-list-item hamburger-nav-item ess-focus-btn mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-list-item-single-line mdc-list-item--with-one-line ng-star-inserted:nth-of-type(4))
3. Click on Cancel (div > div.ess-theme-settings-actions container:nth-of-type(2) > div.action-buttons-left:nth-of-type(1) > button.uxa-secondary cdk-focused cdk-mouse-focused:nth-of-type(3) > span)
4. Click on uxa-masthead.oob-theme uxa-masthead uxa-primary > div.ng-star-inserted:nth-of-type(1) > button.ess-main-menu-navbar ess-focus-masthead cdk-focused cdk-program-focused > uxa-icon > svg (uxa-masthead.oob-theme uxa-masthead uxa-primary > div.ng-star-inserted:nth-of-type(1) > button.ess-main-menu-navbar ess-focus-masthead cdk-focused cdk-program-focused > uxa-icon > svg)

### Expected Results
- Interaction completes without errors

---

## TC-004: Navigate to Agent Interface
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to the Agent Interface.

### Preconditions
- User is logged in

### Test Steps
1. Click on Agent Interface (div.uxa-drawer-content ng-star-inserted > mat-nav-list.mat-mdc-nav-list mat-mdc-list-base mdc-list uxa-navigation-items ng-star-inserted > div.ng-star-inserted:nth-of-type(3) > mat-list-item.mat-mdc-list-item mdc-list-item hamburger-nav-item ess-focus-btn mat-mdc-list-item-interactive mdc-list-item--with-leading-icon mat-mdc-list-item-single-line mdc-list-item--with-one-line ng-star-inserted:nth-of-type(5) > span.mdc-list-item__content)

### Expected Results
- Agent Interface opens successfully

---

## TC-005: Recorded Interaction 5
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)

### Expected Results
- Interaction completes without errors

---

## TC-006: Navigate to Service Catalog
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to Service Catalog.

### Preconditions
- User is logged in

### Test Steps
1. Click on Service Catalog (li.pl-color-badge-category.hovered:nth-of-type(2) > a:nth-of-type(1))

### Expected Results
- Service Catalog page loads successfully

---

## TC-007: Create Service Offering 1
**Priority**: High
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering.

### Preconditions
- User has permission to create offerings

### Test Steps
1. Click on Add (div > div.pl-columns-header-custom-view:nth-of-type(4) > div.pl-columns-header-customization > div > div.pl-columns-header-add-text:nth-of-type(2))
2. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
3. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
4. Click on #new_Description (#new_Description)
5. Enter "test" in #new_Description (#new_Description)
6. Enter "test" in #new_Description (#new_Description)
7. Click on SAVE (#dialog-button-0)

### Expected Results
- Create form opens successfully
- Offering is saved successfully

### Test Data
- new_DisplayLabel: test
- new_Description: test

---

## TC-008: Create Service Offering 2
**Priority**: High
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering.

### Preconditions
- User has permission to create offerings

### Test Steps
1. Click on Add (div > div.pl-columns-header-custom-view:nth-of-type(4) > div.pl-columns-header-customization > div > div.pl-columns-header-add-text:nth-of-type(2))
2. Click on #new_DisplayLabel (#new_DisplayLabel)
3. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
4. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
5. Click on SAVE (#dialog-button-0)

### Expected Results
- Create form opens successfully
- Offering is saved successfully

### Test Data
- new_DisplayLabel: test

---

## TC-009: Create Service Offering 3
**Priority**: High
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering.

### Preconditions
- User has permission to create offerings

### Test Steps
1. Click on Add (div.pl-columns-header > div > div.pl-columns-header-custom-view:nth-of-type(4) > div.pl-columns-header-customization > div)
2. Click on Add (div > div.pl-columns-header-custom-view:nth-of-type(4) > div.pl-columns-header-customization > div > div.pl-columns-header-add-text:nth-of-type(2))
3. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
4. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
5. Click on div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu > p (div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu > p)
6. Click on SAVE (#dialog-button-0)

### Expected Results
- Create form opens successfully
- Offering is saved successfully

### Test Data
- new_DisplayLabel: test

---

## TC-010: View Offering Details
**Priority**: Medium
**Type**: Functional - Read

### Objective
Verify that user can view details of a created offering.

### Preconditions
- At least one offering exists with label "test"

### Test Steps
1. Click on test (div.pl-columns-list-item-string.pl-columns-list-item-string-muti-lines:nth-of-type(3) > div.pl-columns-list-item-string-container > div.pl-columns-list-item-description:nth-of-type(1) > div.pl-columns-list-item-description-preview > a)

### Expected Results
- Offering details page opens

---

## TC-011: Build Phase of Offering
**Priority**: Critical
**Type**: Functional - Workflow

### Objective
Verify that user can move an offering to BUILD phase.

### Preconditions
- Offering is created and in initial state

### Test Steps
1. Click on BUILD (button.btn.transition-button.phase-button-no-overflow > span)
2. Click on Save (div.manual-actions-div:nth-of-type(1) > button.btn.min-width.btn-primary)

### Expected Results
- Offering transitions to BUILD phase successfully

---

## TC-012: Operate Phase of Offering
**Priority**: Critical
**Type**: Functional - Workflow

### Objective
Verify that user can move an offering to OPERATE phase.

### Preconditions
- Offering is in BUILD phase

### Test Steps
1. Click on OPERATE (div.btn-group > button.btn.actions-dropdown.transition-button:nth-of-type(1) > span)
2. Click on Save (div.manual-actions-div:nth-of-type(1) > button.btn.min-width.btn-primary)

### Expected Results
- Offering transitions to OPERATE phase successfully

---

## TC-013: Recorded Interaction 13
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)
2. Click on li.hovered:nth-of-type(6) > a.open-in-new-tab-icon.icon-open-new-tab:nth-of-type(2) (li.hovered:nth-of-type(6) > a.open-in-new-tab-icon.icon-open-new-tab:nth-of-type(2))
3. Click on test
test
Learn more (div.ess-category-item-content.widget-content:nth-of-type(1) > div.media > div.media-body:nth-of-type(2) > div.media-heading.ng-star-inserted > div.ess-category-text-block)

### Expected Results
- Interaction completes without errors

---

## TC-014: Initiate Service Request
**Priority**: Critical
**Type**: Functional - Request

### Objective
Verify that user can initiate a service request for an offering.

### Preconditions
- Offering is selected

### Test Steps
1. Click on Request (div.tab-item-btn-content > div.tab-item-btn-middle:nth-of-type(2) > div.tab-item-btn-navigate > button.uxa-primary.cdk-focused.cdk-mouse-focused > span)

### Expected Results
- Request form opens successfully

---

## TC-015: Recorded Interaction 15
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu (div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu)
2. Click on Drag and drop a file (div.loaded-content:nth-of-type(2) > div.ess-attachments:nth-of-type(2) > div.ess-attachments-button-container.ng-tns-c1086652672-8 > span.drag-tip.ng-tns-c1086652672-8 > span.ng-tns-c1086652672-8:nth-of-type(2))
3. Click on Loading...
test
Support Offering
Content
About off (main.ess-content-area.ng-tns-c351232512-7 > div.ng-tns-c351232512-7 > ess-loader > div.ess-loader-wrapper)

### Expected Results
- Interaction completes without errors

---

## Test Execution Summary

### Total Test Cases: 15

### Priority Breakdown
- Critical: 4
- High: 6
- Medium: 5

### Test Category Breakdown
- Functional: 12
- Navigation: 3

### Key Workflows Covered
1. Authentication Flow
2. Service Catalog Management
3. Service Request Flow
4. Navigation Flow

---

## Test Environment Details
- **Application**: maple-aio-3-m1.otxlab.net
- **Test Tenant**: 914765860
- **Test User**: t9_admin
- **Browser**: Chrome 143.0.0.0
- **OS**: Windows NT 10.0

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