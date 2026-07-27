# Manual Test Case - Maple ESS Login (No Recording)

## Document Info
- Test Case ID: MNL-ESS-001
- Title: Validate ESS Login Entry and Next-Step Authentication Flow
- Module: ESS / Service Portal Authentication
- Application URL: https://maple-aio-3-m1.otxlab.net:443/saw/ess?TENANTID=914765860
- Priority: Critical
- Type: Functional / Smoke
- Created On: 2026-06-15

## Objective
Validate that an ESS user can:
1. Launch the provided URL.
2. Reach the Service Portal sign-in page.
3. Enter username and proceed using Next.
4. Continue to the password/authentication stage.
5. Complete sign-in with valid credentials and land in ESS home.

## Scope
This test case is newly authored from a fresh run against the target URL and does not use any recording file.

## Preconditions
- URL is reachable from test network/VPN.
- Browser can access HTTPS sites with organizational certificates.
- A valid ESS test user is available.
- Tester has valid credentials for the tenant `914765860`.

## Test Data
- Tenant ID: `914765860`
- Username: `<provide-valid-username>`
- Password: `<provide-valid-password>`

## Postconditions
- Active session is logged out at test end.
- No test data corruption introduced during login.

## Detailed Manual Steps

| Step | Action | Input / Locator | Expected Result |
|---|---|---|---|
| 1 | Open a fresh browser session (incognito/private recommended). | Browser: Chrome/Edge latest | Clean session starts with no previous auth cookies. |
| 2 | Navigate to the target URL. | `https://maple-aio-3-m1.otxlab.net:443/saw/ess?TENANTID=914765860` | Page redirects to tenant login endpoint under `idm-service` without HTTP errors. |
| 3 | Verify page branding and title. | Visible text: `Service Portal`; page title: `Sign In` | Login landing page is fully rendered with expected branding/version text. |
| 4 | Verify username input is visible and enabled. | Field locator: `#username`; placeholder: `Username` | Username field accepts focus and cursor appears. |
| 5 | Verify Next button is visible and enabled state is logical. | Button locator: `#next`; label: `Next` | Button is visible; state aligns with form validation behavior. |
| 6 | Negative validation check: click Next without username. | Click `#next` with empty field | Validation message or blocked progression is shown; page does not proceed to password stage. |
| 7 | Enter valid username. | In `#username`, type `<provide-valid-username>` | Username is accepted and shown exactly as entered. |
| 8 | Click Next to proceed. | Click `#next` | User transitions to next authentication step (password page/prompt or identity verification view). |
| 9 | Verify password/authentication control appears. | Password field or auth challenge appears | Page clearly requests second-factor input (password or configured auth step). |
| 10 | Enter valid password (or complete configured auth prompt). | `<provide-valid-password>` | Credential is accepted (masked) and submit control becomes available. |
| 11 | Submit authentication. | Click Sign In/Continue/Submit on auth step | Login request is processed; no blocking authentication error appears. |
| 12 | Verify successful ESS landing. | Check ESS dashboard/home widgets or header | Authenticated user lands on ESS home/start page for tenant `914765860`. |
| 13 | Verify session usability after login. | Open one standard ESS menu/module | Navigation works and content loads without unauthorized errors. |
| 14 | Perform logout. | Use profile/user menu -> Logout/Sign Out | Session is terminated and browser returns to sign-in page. |
| 15 | Security check after logout. | Press browser Back once/twice | Protected page is not accessible without re-authentication. |

## Expected Overall Result
- User can complete login flow from URL launch to authenticated ESS landing.
- Logout works and secured pages remain protected after session end.

## Pass/Fail Criteria
- Pass: All expected results in steps 1-15 are met.
- Fail: Any mismatch occurs (redirect issue, validation failure, auth failure, missing landing page, logout/session issue).

## Defect Logging Notes
If any step fails, capture:
- Actual behavior and exact step number.
- Screenshot with timestamp.
- Browser/version and environment details.
- Any visible error message text and request correlation ID (if shown).

## Execution Notes Template
- Tester Name:
- Execution Date:
- Browser/Version:
- Environment:
- Username Used:
- Status (Pass/Fail):
- Defect IDs (if any):
- Comments:
