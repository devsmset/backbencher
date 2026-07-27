# Test Cases - Recorded Workflow
**Generated from**: recording-1774411875543-final.json
**Date**: March 25, 2026
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
2. Click on Next (#next)
3. Click on #password (#password)
4. Press key in #password (#password)
5. Enter "Admin_1234" in #password (#password)
6. Click on Sign in (#submit)

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

### Expected Results
- Interaction completes without errors

---

## TC-004: Navigate to Service Catalog
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to Service Catalog.

### Preconditions
- User is logged in

### Test Steps
1. Click on Service Catalog (li.pl-color-badge-category.hovered > a)

### Expected Results
- Service Catalog page loads successfully

---

## TC-005: Recorded Interaction 5
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Phone and Mobile (div.pl-columns-list-li-wrapper > div.pl-columns-list-item.active > div.pl-columns-list-item-string > div.pl-columns-list-item-string-container > div.pl-columns-list-item-description > div.pl-columns-list-item-description-preview)
2. Click on Calling Card (div > div.pl-columns-list-item.active > div.pl-columns-list-item-string.pl-columns-list-item-string-muti-lines > div.pl-columns-list-item-string-container > div.pl-columns-list-item-description > div.pl-columns-list-item-description-preview)

### Expected Results
- Interaction completes without errors

---

## TC-006: Create Service Offering 1
**Priority**: High
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering.

### Preconditions
- User has permission to create offerings

### Test Steps
1. Click on Add (div.pl-columns-header > div > div.pl-columns-header-custom-view > div.pl-columns-header-customization > div > div.pl-columns-header-add-text)
2. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
3. Click on div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu.cke_editable.cke_editable_themed.cke_contents_ltr (div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu.cke_editable.cke_editable_themed.cke_contents_ltr)
4. Click on SAVE (#dialog-button-0)

### Expected Results
- Create form opens successfully
- Offering is saved successfully

### Test Data
- new_DisplayLabel: test

---

## TC-007: View Offering Details
**Priority**: Medium
**Type**: Functional - Read

### Objective
Verify that user can view details of a created offering.

### Preconditions
- At least one offering exists with label "test"

### Test Steps
1. Click on test (div.pl-columns-list-item.active > div.pl-columns-list-item-string.pl-columns-list-item-string-muti-lines > div.pl-columns-list-item-string-container > div.pl-columns-list-item-description > div.pl-columns-list-item-description-preview > a)

### Expected Results
- Offering details page opens

---

## TC-008: Recorded Interaction 8
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Rules (div.pl-tab-panel-navigation-item-link.pl-tab-panel-navigation-item > div.tab-panel-navigation-item-tab-text)
2. Click on div.entity-editor-tabs-margin.standard-container > div.rules-sections-margin > div.accordion-heading.top-bordered > div.accordion-toggle > span > i.icon-12.icon-arrow-med-right (div.entity-editor-tabs-margin.standard-container > div.rules-sections-margin > div.accordion-heading.top-bordered > div.accordion-toggle > span > i.icon-12.icon-arrow-med-right)

### Expected Results
- Interaction completes without errors

---

## TC-009: Initiate Service Request
**Priority**: Critical
**Type**: Functional - Request

### Objective
Verify that user can initiate a service request for an offering.

### Preconditions
- Offering is selected

### Test Steps
1. Click on Add a rule to run before request record rules (div.entity-editor-tabs-margin.standard-container > div.rules-sections-margin > div.accordion-body.in.collapse.rules-top-border > div.entity-rule-list > div.dropdown > div.rule-add-button)

### Expected Results
- Request form opens successfully

---

## TC-010: Recorded Interaction 10
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on "If...Then" rule (ul.dropdown-menu.rules-tab-panel-menu > li > a)
2. Click on Set fields (div > div > div.add-rule-rules-area > div.accordion-body.in.collapse > ul.rule-text-lines > li.rule-text-line)
3. Click on OK (#dialog-button-0)
4. Click on expression (span.control-template-placeholder.editor-template-placeholder > pl-editor-popover > span.editor-popover-wrapper > a > span > span)
5. Click on ​ (div.editor-template-placeholder > div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-pristine.ng-untouched.ng-empty.ng-invalid.ng-invalid-required.ng-valid-dsl > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div.CodeMirror-scroll)

### Expected Results
- Interaction completes without errors

---

## TC-011: Recorded Interaction 11
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter "oup.Name==null" in div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-untouched.ng-valid-dsl.ng-not-empty.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div > textarea (div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-untouched.ng-valid-dsl.ng-not-empty.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div > textarea)
2. Click on OK (html.no-js > body.placement-bottom > div.popover.am-fade.bottom.editor-popover > div.popover-content > div.ng-valid-dsl.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > button.btn.min-width.btn-primary.ok-button)
3. Click on field values (span.control-template-placeholder.editor-template-placeholder > pl-editor-popover > span.editor-popover-wrapper > a > span > span)
4. Click on Add Item (div.entity-fields-editor-area > table > tbody > tr > td > span.add-row.btn-icon)
5. Enter "ass" in #s2id_autogen51_search (#s2id_autogen51_search)

### Expected Results
- Interaction completes without errors

### Test Data
- field: oup.Name==null
- s2id_autogen51_search: ass

---

## TC-012: Recorded Interaction 12
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on OK (html.no-js > body.placement-bottom > div.popover.am-fade.bottom.editor-popover > div.popover-content > div.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > button.btn.min-width.btn-primary.ok-button)
2. Click on Save (span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-save.entity-page-toolbar-save > span > span)
3. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)
4. Click on div.menu-category.admin-menu-category.section-title-in-lower-size > h3.nav-header.admin-menu-category-title.category-title > i.open-section-icon.icon-arrow-med-right (div.menu-category.admin-menu-category.section-title-in-lower-size > h3.nav-header.admin-menu-category-title.category-title > i.open-section-icon.icon-arrow-med-right)
5. Click on Studio (li.hovered > a)

### Expected Results
- Interaction completes without errors

---

## TC-013: Recorded Interaction 13
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Processes and Rules (li > a)
2. Click on Support (41) (div.fixed-container > div > div.main-navigation > ul.nav > li > div.process)
3. Click on Support (41) (div > div.main-navigation > ul.nav > li > div.process > span.clickable)
4. Click on div.fixed-header-wrap > div.fixed-header > div.accordion-heading.top-bordered > div.accordion-toggle > span > i.icon-12.icon-arrow-med-right (div.fixed-header-wrap > div.fixed-header > div.accordion-heading.top-bordered > div.accordion-toggle > span > i.icon-12.icon-arrow-med-right)
5. Click on Add (div.fixed-header-wrap > div.fixed-header > div.accordion-heading.top-bordered.selected > div.accordion-toggle > div.ui-rfloat.dropdown > div.clickable)

### Expected Results
- Interaction completes without errors

---

## TC-014: Recorded Interaction 14
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on "If...Then" rule (ul.dropdown-menu.rules-panel-menu > li > a)
2. Click on Set fields (div > div > div.add-rule-rules-area > div.accordion-body.in.collapse > ul.rule-text-lines > li.rule-text-line)
3. Click on OK (#dialog-button-0)
4. Click on expression (span.control-template-placeholder.editor-template-placeholder > pl-editor-popover > span.editor-popover-wrapper > a > span > span)
5. Click on ​ (div.editor-template-placeholder > div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-pristine.ng-untouched.ng-empty.ng-invalid.ng-invalid-required.ng-valid-dsl > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div.CodeMirror-scroll)

### Expected Results
- Interaction completes without errors

---

## TC-015: Recorded Interaction 15
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter value in div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-untouched.ng-valid-dsl.ng-not-empty.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div > textarea (div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-untouched.ng-valid-dsl.ng-not-empty.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div > textarea)
2. Enter "entity.AssignedToGroup.HomeLocation=='Ask'" in div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-untouched.ng-valid-dsl.ng-dirty.ng-valid-parse.ng-not-empty.ng-valid.ng-valid-required > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div > textarea (div.dsl-expression-hint-editor.condition-expression-ltr.extended-size > div.dsl-editor > div.ng-untouched.ng-valid-dsl.ng-dirty.ng-valid-parse.ng-not-empty.ng-valid.ng-valid-required > div.CodeMirror.cm-s-default.CodeMirror-wrap.CodeMirror-focused > div > textarea)
3. Click on OK (html.no-js > body.placement-bottom > div.popover.am-fade.bottom.editor-popover > div.popover-content > div.ng-valid-dsl.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > button.btn.min-width.btn-primary.ok-button)
4. Click on field values (span.control-template-placeholder.editor-template-placeholder > pl-editor-popover > span.editor-popover-wrapper > a > span > span)
5. Click on Add Item (div.entity-fields-editor-area > table > tbody > tr > td > span.add-row.btn-icon)

### Expected Results
- Interaction completes without errors

### Test Data
- field: entity.AssignedToGroup.HomeLocation=='Ask'

---

## TC-016: Recorded Interaction 16
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter "OLA" in #s2id_autogen318_search (#s2id_autogen318_search)
2. Enter "premi" in #s2id_autogen520_search (#s2id_autogen520_search)
3. Click on Add Item (div.entity-fields-editor-area > table > tbody > tr > td > span.add-row.btn-icon)
4. Enter "Sla" in #s2id_autogen546_search (#s2id_autogen546_search)
5. Press key in #s2id_autogen546_search (#s2id_autogen546_search)

### Expected Results
- Interaction completes without errors

### Test Data
- s2id_autogen318_search: OLA
- s2id_autogen520_search: premi
- s2id_autogen546_search: Sla

---

## TC-017: Recorded Interaction 17
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter "pre" in #s2id_autogen756_search (#s2id_autogen756_search)
2. Click on OK (html.no-js > body.placement-bottom > div.popover.am-fade.editor-popover.top > div.popover-content > div.ng-dirty.ng-valid-parse.ng-valid.ng-valid-required > button.btn.min-width.btn-primary.ok-button)
3. Click on Save (span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-save > span > span)
4. Enter "gro" in #s2id_autogen312_search (#s2id_autogen312_search)
5. Press key in #s2id_autogen312_search (#s2id_autogen312_search)

### Expected Results
- Interaction completes without errors

### Test Data
- s2id_autogen756_search: pre
- s2id_autogen312_search: gro

---

## TC-018: Recorded Interaction 18
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Forms (li > a)
2. Click on Add field (span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-add-field > span > span)
3. Enter "home" in #field-filter (#field-filter)
4. Click on Home location (li > a)

### Expected Results
- Interaction completes without errors

### Test Data
- field-filter: home

---

## TC-019: Create Service Offering 2
**Priority**: High
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering.

### Preconditions
- User has permission to create offerings

### Test Steps
1. Click on ADD (#dialog-button-0)
2. Click on DONE (#dialog-button-1)

### Expected Results
- Create form opens successfully
- Offering is saved successfully

---

## TC-020: Recorded Interaction 20
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Save (span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-save > span > span)
2. Click on #application-menu-main-button (#application-menu-main-button)
3. Click on People (li.hovered > a)
4. Click on Groups (div.subitem-link > a.item-text)
5. Click on 10245 (div.slickgrid_117976.ui-widget.platform-grid > div.slick-viewport > div.grid-canvas > div.ui-widget-content.slick-row.even.item-id-10245 > div.slick-cell.l1.r1 > a.entity-link-id)

### Expected Results
- Interaction completes without errors

---

## TC-021: Recorded Interaction 21
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter "Ask" in #full_HomeLocation (#full_HomeLocation)
2. Click on Save (div.tool-bar > div.toolbar-spacing > span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-save.entity-page-toolbar-save)
3. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)
4. Click on Home (li.hovered > a > span.menu-home-section-item-text)
5. Click on Phone and Mobile (div > ul.ess-home-category-ul > li.ess-category-tile.ng-star-inserted > div.ess-category-item-widget.ess-new-catalog.widget > div.ess-category-item-content.widget-content > div.media)

### Expected Results
- Interaction completes without errors

### Test Data
- full_HomeLocation: Ask

---

## TC-022: Recorded Interaction 22
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter "test" in #mat-input-55 (#mat-input-55)
2. Click on navigate_before
Phone and Mobile
Suggested results (#navigation-bar)
3. Enter "test" in #mat-input-55 (#mat-input-55)
4. Click on mat-paginator.mat-mdc-paginator.ng-tns-c1744466871-7.ng-star-inserted > div.mat-mdc-paginator-outer-container > div.mat-mdc-paginator-container > div.mat-mdc-paginator-range-actions > button.mdc-icon-button.mat-mdc-icon-button.mat-mdc-button-base.mat-mdc-tooltip-trigger.mat-mdc-paginator-navigation-next.mat-mdc-button-disabled-interactive.mat-unthemed.cdk-focused.cdk-mouse-focused > span.mat-mdc-button-touch-target (mat-paginator.mat-mdc-paginator.ng-tns-c1744466871-7.ng-star-inserted > div.mat-mdc-paginator-outer-container > div.mat-mdc-paginator-container > div.mat-mdc-paginator-range-actions > button.mdc-icon-button.mat-mdc-icon-button.mat-mdc-button-base.mat-mdc-tooltip-trigger.mat-mdc-paginator-navigation-next.mat-mdc-button-disabled-interactive.mat-unthemed.cdk-focused.cdk-mouse-focused > span.mat-mdc-button-touch-target)

### Expected Results
- Interaction completes without errors

### Test Data
- mat-input-55: test

---

## TC-023: Navigate to Agent Interface
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

## TC-024: Recorded Interaction 24
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

## TC-025: Navigate to Service Catalog
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to Service Catalog.

### Preconditions
- User is logged in

### Test Steps
1. Click on Service Catalog (li.pl-color-badge-category.hovered > a)

### Expected Results
- Service Catalog page loads successfully

---

## TC-026: Recorded Interaction 26
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Phone and Mobile (div > div.pl-columns-list-panel > ul > li.pl-columns-list-li > div.pl-columns-list-li-wrapper > div.pl-columns-list-item.active)
2. Click on Operation (li.pl-columns-list-li > div > div.pl-columns-list-item.active > div.pl-columns-list-item-string.pl-columns-list-item-string-muti-lines > div.pl-columns-list-item-string-container > div.pl-columns-list-item-type)
3. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)
4. Click on li.hovered > a.open-in-new-tab-icon.icon-open-new-tab (li.hovered > a.open-in-new-tab-icon.icon-open-new-tab)
5. Click on Phone and Mobile (div > ul.ess-home-category-ul > li.ess-category-tile.ng-star-inserted > div.ess-category-item-widget.ess-new-catalog.widget > div.ess-category-item-content.widget-content > div.media)

### Expected Results
- Interaction completes without errors

---

## TC-027: Recorded Interaction 27
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on Cancel my Calling Card (ess-tab-item.ess-tab-item.ng-tns-c1744466871-7 > div.tab-item > div.tab-item-main > div.tab-item-content > div.tab-item-title > a.mat-mdc-tooltip-trigger.tab-item-link.text-ellipsis.ess-focus-link.cdk-focused.cdk-mouse-focused)
2. Enter "calling card" in #mat-input-64 (#mat-input-64)
3. Enter "test" in #mat-input-64 (#mat-input-64)
4. Click on navigate_before
Phone and Mobile
More (ess-category-page.ng-star-inserted > ess-page.ess-category-page.content-panel-no-padding.content-panel-background-transparent.ng-tns-c3708041968-10.ng-star-inserted > div.ess-container.ng-tns-c3708041968-10 > div.ng-tns-c3708041968-10 > div.ess-content.ess-main-content.ng-tns-c3708041968-10 > div.ess-navigation-bar.ng-tns-c3708041968-10)

### Expected Results
- Interaction completes without errors

### Test Data
- mat-input-64: calling card

---

## TC-028: Navigate to Service Portal
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to Service Portal.

### Preconditions
- User is logged in

### Test Steps
1. Click on Service Portal (div.header.oob-theme > div.ess-header-right.header-right > a.mat-mdc-tooltip-trigger.ess-header-company-logo-link.ess-focus-masthead.cdk-focused.cdk-mouse-focused > span.service-portal.ng-star-inserted)

### Expected Results
- Service Portal page loads successfully

---

## TC-029: Recorded Interaction 29
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on #mat-input-66 (#mat-input-66)
2. Press key in #mat-input-66 (#mat-input-66)
3. Enter "test " in #mat-input-66 (#mat-input-66)
4. Enter "on" in #mat-mdc-checkbox-25-input (#mat-mdc-checkbox-25-input)
5. Click on test
Service Offering (div > div.pl-columns-tab.active > ul > li.pl-columns-list-li.ServiceOffering > div.ServiceOffering > div.pl-columns-list-item.active)

### Expected Results
- Interaction completes without errors

### Test Data
- mat-input-66: test 
- mat-mdc-checkbox-25-input: on

---

## TC-030: Create Service Offering 3
**Priority**: High
**Type**: Functional - Create

### Objective
Verify that user can create a new service offering.

### Preconditions
- User has permission to create offerings

### Test Steps
1. Click on Add (div.pl-columns-header > div > div.pl-columns-header-custom-view > div.pl-columns-header-customization > div > div.pl-columns-header-add-text)
2. Enter "test" in #new_DisplayLabel (#new_DisplayLabel)
3. Click on SAVE (#dialog-button-0)

### Expected Results
- Create form opens successfully
- Offering is saved successfully

### Test Data
- new_DisplayLabel: test

---

## TC-031: View Offering Details
**Priority**: Medium
**Type**: Functional - Read

### Objective
Verify that user can view details of a created offering.

### Preconditions
- At least one offering exists with label "test"

### Test Steps
1. Click on test (div.pl-columns-list-item.active > div.pl-columns-list-item-string.pl-columns-list-item-string-muti-lines > div.pl-columns-list-item-string-container > div.pl-columns-list-item-description > div.pl-columns-list-item-description-preview > a)

### Expected Results
- Offering details page opens

---

## TC-032: Recorded Interaction 32
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on BUILD (button.btn.transition-button.phase-button-no-overflow > span)
2. Click on Save (div.manual-actions-div > button.btn.min-width.btn-primary)
3. Click on OPERATE (div.btn-group > button.btn.actions-dropdown.transition-button.phase-button-no-overflow > span)
4. Click on Save (div.manual-actions-div > button.btn.min-width.btn-primary)
5. Click on Back (span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-back > span > span)

### Expected Results
- Interaction completes without errors

---

## TC-033: Recorded Interaction 33
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.pl-columns-page > div > div.pl-columns-panel.panel2 > div.pl-columns-pagination > div.pl-columns-pagination-body > div.pl-columns-pagination-left-triangle.pl-columns-pagination-default-cursor (div.pl-columns-page > div > div.pl-columns-panel.panel2 > div.pl-columns-pagination > div.pl-columns-pagination-body > div.pl-columns-pagination-left-triangle.pl-columns-pagination-default-cursor)
2. Click on Calling Card
Operation (div > div.pl-columns-tab.active > ul > li.pl-columns-list-li > div > div.pl-columns-list-item.active)

### Expected Results
- Interaction completes without errors

---

## TC-034: View Offering Details
**Priority**: Medium
**Type**: Functional - Read

### Objective
Verify that user can view details of a created offering.

### Preconditions
- At least one offering exists with label "test"

### Test Steps
1. Click on test (div.pl-columns-list-item.active > div.pl-columns-list-item-string.pl-columns-list-item-string-muti-lines > div.pl-columns-list-item-string-container > div.pl-columns-list-item-description > div.pl-columns-list-item-description-preview > a)

### Expected Results
- Offering details page opens

---

## TC-035: Recorded Interaction 35
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Enter "test" in #s2id_autogen42_search (#s2id_autogen42_search)
2. Click on Save (div.tool-bar > div.toolbar-spacing > span.tool-bar-item > span > span > button.btn.btn-icon.plToolbarItem.tool-bar-btn-save.entity-page-toolbar-save)

### Expected Results
- Interaction completes without errors

### Test Data
- s2id_autogen42_search: test

---

## TC-036: Navigate to Service Catalog
**Priority**: High
**Type**: Navigation

### Objective
Verify that user can navigate to Service Catalog.

### Preconditions
- User is logged in

### Test Steps
1. Click on Service Management
Service Catalog Management
Cata (html.no-js > body.placement-bottom)

### Expected Results
- Service Catalog page loads successfully

---

## TC-037: Recorded Interaction 37
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.application-menu-main-button.inline-block > span.main-menu-button-icon (div.application-menu-main-button.inline-block > span.main-menu-button-icon)
2. Click on Home (li.hovered > a > span.menu-home-section-item-text)
3. Click on ul.ess-home-category-ul > li.ess-category-tile.ng-star-inserted > div.ess-category-item-widget.ess-new-catalog.widget > div.ess-category-item-content.widget-content > div.media > div.ess-home-category-icon-placeholder.ng-star-inserted (ul.ess-home-category-ul > li.ess-category-tile.ng-star-inserted > div.ess-category-item-widget.ess-new-catalog.widget > div.ess-category-item-content.widget-content > div.media > div.ess-home-category-icon-placeholder.ng-star-inserted)
4. Click on mat-paginator.mat-mdc-paginator.ng-tns-c1744466871-7.ng-star-inserted > div.mat-mdc-paginator-outer-container > div.mat-mdc-paginator-container > div.mat-mdc-paginator-range-actions > button.mdc-icon-button.mat-mdc-icon-button.mat-mdc-button-base.mat-mdc-tooltip-trigger.mat-mdc-paginator-navigation-next.mat-mdc-button-disabled-interactive.mat-unthemed.cdk-focused.cdk-mouse-focused > span.mat-mdc-button-touch-target (mat-paginator.mat-mdc-paginator.ng-tns-c1744466871-7.ng-star-inserted > div.mat-mdc-paginator-outer-container > div.mat-mdc-paginator-container > div.mat-mdc-paginator-range-actions > button.mdc-icon-button.mat-mdc-icon-button.mat-mdc-button-base.mat-mdc-tooltip-trigger.mat-mdc-paginator-navigation-next.mat-mdc-button-disabled-interactive.mat-unthemed.cdk-focused.cdk-mouse-focused > span.mat-mdc-button-touch-target)

### Expected Results
- Interaction completes without errors

---

## TC-038: Initiate Service Request
**Priority**: Critical
**Type**: Functional - Request

### Objective
Verify that user can initiate a service request for an offering.

### Preconditions
- Offering is selected

### Test Steps
1. Click on Request (div.tab-item-btn-wrapper > div.tab-item-btn-content > div.tab-item-btn-middle > div.tab-item-btn-navigate > button.mdc-button.mat-mdc-button-base.mdc-button--unelevated.mat-mdc-unelevated-button.mat-unthemed.cdk-focused.cdk-mouse-focused > span.mdc-button__label)

### Expected Results
- Request form opens successfully

---

## TC-039: Recorded Interaction 39
**Priority**: Medium
**Type**: Functional

### Objective
Verify that the recorded interaction can be completed successfully.

### Preconditions
- Application is accessible

### Test Steps
1. Click on div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu.cke_editable.cke_editable_themed.cke_contents_ltr (div.cke_contents.cke_reset > div.cke_wysiwyg_div.cke_reset.cke_enable_context_menu.cke_editable.cke_editable_themed.cke_contents_ltr)
2. Click on Loading...
Service Offering
test
thumb_up
Recommen (main.ess-content-area.ng-tns-c3708041968-8 > div.ng-tns-c3708041968-8 > ess-loader > div.ess-loader-wrapper)

### Expected Results
- Interaction completes without errors

---

## Test Execution Summary

### Total Test Cases: 39

### Priority Breakdown
- Critical: 3
- High: 9
- Medium: 27

### Test Category Breakdown
- Functional: 33
- Navigation: 6

### Key Workflows Covered
1. Authentication Flow
2. Service Catalog Management
3. Service Request Flow
4. Navigation Flow

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