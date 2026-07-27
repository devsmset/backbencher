# Test Cases - Service Catalog Workflow
**Generated from**: recording-1769678516099-final.json  
**Date**: January 30, 2026  
**Base URL**: https://maple-aio-3-m1.otxlab.net:443/saw/ess?TENANTID=220584576

---

## Test Suite Overview
This test suite covers the complete workflow of creating service catalog offerings, building them through different phases, and submitting a request through the Service Portal.

---

## TC-001: User Login
**Priority**: Critical  
**Type**: Functional

### Objective
Verify that a user can successfully log in to the application with valid credentials.

### Preconditions
- Application is accessible
- User account exists with username "test-tenant" and password "Admin_1234"

### Test Steps
1. Navigate to the login page
2. Enter username "test-tenant" in the username field (#username)
3. Click the "Next" button
4. Click on the password field (#password)
5. Enter password "Admin_1234"
6. Press Enter or click the "Sign in" button (#submit)

### Expected Results
- User is successfully authenticated
- User is redirected to the main dashboard
- Header menu is visible with user profile options

### Test Data
- Username: test-tenant
- Password: Admin_1234

---

## TC-002: Navigate to Agent Interface
**Priority**: High  
**Type**: Navigation

### Objective
Verify that user can navigate to the Agent Interface from the main menu.

### Preconditions
- User is logged in
- User has access to Agent Interface

### Test Steps
1. Click on the mega menu icon (header menu button)
2. Wait for the menu to expand
3. Locate and click on "Agent Interface" menu item

### Expected Results
- Menu opens successfully
- Agent Interface option is visible and clickable
- User is navigated to Agent Interface in a new context

---

## TC-003: Navigate to Service Catalog
**Priority**: High  
**Type**: Navigation

### Objective
Verify that user can navigate to Service Catalog from Agent Interface.

### Preconditions
- User is logged in to Agent Interface

### Test Steps
1. Click on the application menu main button
2. Wait for menu to display
3. Click on "Service Catalog" link

### Expected Results
- Service Catalog page loads successfully
- Catalog management interface is displayed

---

## TC-004: Create First Service Offering (Category)
**Priority**: Critical  
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering with display label and description.

### Preconditions
- User is in Service Catalog page
- User has permission to create offerings

### Test Steps
1. Click on "Add" button in the columns header
2. Enter "abcd" in the Display Label field (#new_DisplayLabel)
3. Click on the Description field (#new_Description)
4. Enter "abcd" in the Description textarea
5. Click the "SAVE" button (#dialog-button-0)

### Expected Results
- Create form opens successfully
- All fields accept input correctly
- Offering is saved successfully
- New offering appears in the catalog list

### Test Data
- Display Label: abcd
- Description: abcd

---

## TC-005: Create Second Service Offering
**Priority**: High  
**Type**: Functional - Create

### Objective
Verify that user can create multiple service offerings sequentially.

### Preconditions
- At least one service offering already exists
- User is in Service Catalog page

### Test Steps
1. Click on "Add" button again
2. Enter "abcd" in the Display Label field (#new_DisplayLabel)
3. Click the "SAVE" button (#dialog-button-0)

### Expected Results
- Create form opens successfully
- Second offering is saved successfully
- Both offerings are visible in the catalog

### Test Data
- Display Label: abcd

---

## TC-006: Create Third Service Offering with Rich Text
**Priority**: High  
**Type**: Functional - Create

### Objective
Verify that user can create a service offering with rich text description.

### Preconditions
- User is in Service Catalog page

### Test Steps
1. Click on the add icon button
2. Click on "Add" text
3. Enter "abcd" in the Display Label field (#new_DisplayLabel)
4. Click on the rich text editor area (pl-text-editor)
5. Add content in the rich text editor
6. Click the "SAVE" button (#dialog-button-0)

### Expected Results
- Rich text editor is functional
- Offering with rich text description is saved
- Content is preserved correctly

### Test Data
- Display Label: abcd
- Description: (Rich text content)

---

## TC-007: View Offering Details
**Priority**: Medium  
**Type**: Functional - Read

### Objective
Verify that user can view details of a created offering.

### Preconditions
- At least one offering exists with label "abcd"

### Test Steps
1. Locate the offering with description "abcd" in the list
2. Click on the offering link

### Expected Results
- Offering details page opens
- All offering information is displayed correctly

---

## TC-008: Build Phase of Offering
**Priority**: Critical  
**Type**: Functional - Workflow

### Objective
Verify that user can move an offering to BUILD phase.

### Preconditions
- Offering is created and in initial state
- User has permission to modify offerings

### Test Steps
1. Click on the "BUILD" button (phase-button)
2. Observe the phase transition
3. Click the "Save" button to confirm

### Expected Results
- Offering transitions to BUILD phase successfully
- Phase indicator updates correctly
- Save operation completes without errors

---

## TC-009: Operate Phase of Offering
**Priority**: Critical  
**Type**: Functional - Workflow

### Objective
Verify that user can move an offering to OPERATE phase.

### Preconditions
- Offering is in BUILD phase
- All required configurations are complete

### Test Steps
1. Click on the "OPERATE" dropdown button
2. Observe phase change options
3. Click the "Save" button to confirm the transition

### Expected Results
- Offering transitions to OPERATE phase successfully
- Phase dropdown shows OPERATE options
- Save operation completes successfully
- Offering becomes available for requesting

---

## TC-010: Navigate to Service Portal
**Priority**: High  
**Type**: Navigation

### Objective
Verify that user can navigate from Agent Interface to Service Portal.

### Preconditions
- User is in Agent Interface
- Service Portal is accessible

### Test Steps
1. Click on the application menu main button
2. Locate "Service Portal" option in the menu
3. Click on "Service Portal"

### Expected Results
- Menu displays Service Portal option
- User is navigated to Service Portal successfully
- Service Portal home page loads with available offerings

---

## TC-011: View Service Offering in Portal
**Priority**: High  
**Type**: Functional - End User

### Objective
Verify that created offerings are visible in Service Portal.

### Preconditions
- Offering "abcd" is in OPERATE phase
- User is in Service Portal

### Test Steps
1. Browse the service catalog in Service Portal
2. Locate the offering with title "abcd"
3. Click on the offering

### Expected Results
- Offering is visible in the portal
- Offering title and description display correctly
- Clicking opens the offering details page

---

## TC-012: Initiate Service Request
**Priority**: Critical  
**Type**: Functional - Request

### Objective
Verify that user can initiate a service request for an offering.

### Preconditions
- Offering "abcd" is selected
- User is on offering details page

### Test Steps
1. Click the "Request" button
2. Wait for request form to load

### Expected Results
- Request form opens successfully
- Form displays offering details (name: "abcd", description: "abcd")
- Request details section is visible

---

## TC-013: Fill Service Request Form
**Priority**: Critical  
**Type**: Functional - Request

### Objective
Verify that user can interact with service request form fields.

### Preconditions
- Request form is open
- Required fields are displayed

### Test Steps
1. Click on the Description field (#smax-basic-form-0-Description)
2. Observe form validation
3. Click on the loader wrapper area to validate form state

### Expected Results
- Description field accepts focus
- Form validation works correctly
- All required fields are accessible

---

## TC-014: User Logout
**Priority**: High  
**Type**: Functional

### Objective
Verify that user can successfully log out from the application.

### Preconditions
- User is logged in
- Any page is displayed

### Test Steps
1. Click on the user profile icon (person-avatar) in the header
2. Wait for profile menu to open
3. Locate "Log out" option
4. Click on "Log out"

### Expected Results
- Profile menu opens successfully
- Log out option is visible
- User is logged out successfully
- User is redirected to login page
- Session is terminated

---

## Test Execution Summary

### Total Test Cases: 14

### Priority Breakdown
- Critical: 6
- High: 7
- Medium: 1

### Test Category Breakdown
- Functional: 10
- Navigation: 4

### Key Workflows Covered
1. **Authentication Flow**: Login → Logout
2. **Service Catalog Management**: Create offerings → Build phase → Operate phase
3. **Service Request Flow**: Portal navigation → Offering selection → Request initiation

---

## Test Environment Details
- **Application**: SMAX (Service Management Automation X)
- **Test Tenant**: 220584576
- **Test User**: test-tenant
- **Browser**: Chrome 143.0.0.0
- **OS**: Windows NT 10.0

---

## Notes
- All test cases are based on actual recorded user interactions
- XPath, CSS selectors, and element IDs are provided for automation
- Test data uses "abcd" as a placeholder and should be replaced with meaningful values in production
- Some offerings were created multiple times with the same name; consider unique naming in actual tests
- Rich text editor functionality was tested in TC-006
- Phase transitions (BUILD → OPERATE) are critical for offering availability

---

## Automation Guidelines
- All UI interactions include multiple locator strategies (xpath, css, id)
- Element positions are recorded for visual validation if needed
- Page type indicators help identify context switches (main, popup1)
- Timestamps show the actual flow timing for performance baseline
- Consider adding explicit waits for phase transitions and page loads
