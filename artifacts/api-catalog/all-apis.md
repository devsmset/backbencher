# API Catalog From Recordings

Generated: 2026-07-27T15:16:46.627Z

- Recording files scanned: 75
- Recording files with API calls: 20
- Unique APIs: 284
- Dedupe rule: method + origin + pathname (query values ignored)

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/account
- Query params: count, limit, offset, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/account?timeStamp=1774357569199&offset=0&limit=0&count=true

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/account/177091416
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/account/177091416?timeStamp=1774357581432

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/configuration/audit/getAuditPageUrl
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/configuration/audit/getAuditPageUrl

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/configuration/common/onlineDocumentBaseurl
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/configuration/common/onlineDocumentBaseurl

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/configuration/common/suiteVersion
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/configuration/common/suiteVersion

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/features
- Query params: feature
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/features?feature=GREY_OUT_DELETE_TENANT

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/licenseActivity
- Query params: filter, limit, offset, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/licenseActivity?timeStamp=1774357585232&filter=((tenantId%2Beq%2B%22177091416%22)%2Band%2B(revoked%2Beq%2B%22false%22)%2Band%2B(activityType%2Beq%2B%221%22))&offset=0&limit=250

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/tenant
- Query params: count, limit, offset, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/tenant?timeStamp=1774357569198&offset=0&limit=0&count=true

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/tenant/177091416
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/tenant/177091416?timeStamp=1774357580962

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/user
- Query params: count, filter, limit, offset, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/user?timeStamp=1774357569200&offset=0&limit=0&count=true&filter=((name%2Bnin%2B%22bo-integration%40dummy.com%2Csaw-integration-internal%40dummy.com%2Csaw-integration-external%40dummy.com%22)%2Bor%2B(idmOrganization%2Bneq%2B%22sysbo%22))

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/user/1000006
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/user/1000006?timeStamp=1774357581443

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/entities/user/1000019
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/entities/user/1000019?timeStamp=1774357581440

## GET https://maple-aio-2-m1.otxlab.net/bo/rest/info
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/rest/info?timeStamp=1774357569192

## GET https://maple-aio-2-m1.otxlab.net/bo/userProfile
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/bo/userProfile?timeStamp=1774357550154

## POST https://maple-aio-2-m1.otxlab.net/http-bind/
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/http-bind/

## POST https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate
- Query params: code
- Seen in files: 11
- Sample URL: https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate?code=9a26825c-e71c-469f-bf6d-4368cce97523

## POST https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate/localUser
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate/localUser

## GET https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/return_url
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/return_url

## GET https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/tenant
- Query params: id
- Seen in files: 11
- Sample URL: https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/tenant?id=669062255

## GET https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/token
- Query params: code
- Seen in files: 11
- Sample URL: https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/api/public/token?code=9a26825c-e71c-469f-bf6d-4368cce97523

## GET https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/assets/i18n/en.json
- Query params: none
- Seen in files: 11
- Sample URL: https://maple-aio-2-m1.otxlab.net/idm-service/idm/v0/assets/i18n/en.json

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/authorization/permissions/10018
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/authorization/permissions/10018

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/bo-integration/originalTenantUrl
- Query params: domain
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/bo-integration/originalTenantUrl?domain=maple-aio-2-m1.otxlab.net

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/customized-tab-config/getDateFormatConfigs
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/customized-tab-config/getDateFormatConfigs

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/encryption/config
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/encryption/config

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/encryption/domains-thin
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/encryption/domains-thin

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/encryption/key_chain/10018/status
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/encryption/key_chain/10018/status

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/backend/tenant
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/backend/tenant

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/cartItem
- Query params: additionalLayout
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/cartItem?additionalLayout=RequestsOffering.PriceVisibleToESS,RequestsOffering.OfferingType,RequestsOffering.IsBundle

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/catalog/category-list
- Query params: requestOnBehalf
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/catalog/category-list?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/customizedSettings/sawCustomizedAction/list
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/customizedSettings/sawCustomizedAction/list

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/idea/hotOnesInCache
- Query params: topN
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/idea/hotOnesInCache?topN=3

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/idea/list
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/idea/list

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/loadingPage/loadingPageData
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/loadingPage/loadingPageData

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/news/topNews
- Query params: maxRelatedNews, requestOnBehalf
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/news/topNews?maxRelatedNews=3&requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/questions/your-questions
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/questions/your-questions

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/request/allRequestsWithBundles
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/request/allRequestsWithBundles

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/request/pendingChatRequests2
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/request/pendingChatRequests2

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/ribbon/essRibbonConfig
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/ribbon/essRibbonConfig

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/defaultTheme
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/defaultTheme

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/getAllThemeSettings
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/getAllThemeSettings

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/layout
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/layout

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/user-style-with-widget
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/theme/user-style-with-widget

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/user-entitlement/Entitlement
- Query params: includeInactive, withPermission
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/user-entitlement/Entitlement?withPermission=VIEW&includeInactive=false

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/getLoggedInUser
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/getLoggedInUser

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/APPROVAL
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/APPROVAL

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/FEEDBACK_REQUEST
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/FEEDBACK_REQUEST

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/REQUEST
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/REQUEST

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/SURVEY
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/ess/users/userRelatedData/SURVEY

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/forms/sharedResource
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/forms/sharedResource

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/frs/management/TenantAttachmentConfig
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/frs/management/TenantAttachmentConfig

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/l10n/bundles/ess/en
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/l10n/bundles/ess/en

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/metadata/ui/entity-descriptors/
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/metadata/ui/entity-descriptors/

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/metadata/ui/enumeration-descriptors/
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/metadata/ui/enumeration-descriptors/

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/personalization/10018/profile/recalculateEntitlementRules
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/personalization/10018/profile/recalculateEntitlementRules

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/personalization/person/me
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/personalization/person/me

## POST https://maple-aio-2-m1.otxlab.net/rest/211650513/push/presence
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/push/presence

## POST https://maple-aio-2-m1.otxlab.net/rest/211650513/push/register/483005f5-ed3c-43b7-8917-82247fb8f284
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/push/register/483005f5-ed3c-43b7-8917-82247fb8f284

## POST https://maple-aio-2-m1.otxlab.net/rest/211650513/push/register/66c6e679-e066-44c1-8437-e24f43767806
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/push/register/66c6e679-e066-44c1-8437-e24f43767806

## POST https://maple-aio-2-m1.otxlab.net/rest/211650513/push/register/9a3855c5-f322-472a-b774-38da5df40c03
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/push/register/9a3855c5-f322-472a-b774-38da5df40c03

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/push/xmppSubdomain
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/push/xmppSubdomain

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/saw-authentication/person/privateKey
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/saw-authentication/person/privateKey

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/TenantManagement/tenant/211650513
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/TenantManagement/tenant/211650513

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/TenantSettings/domain/ui
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/TenantSettings/domain/ui

## GET https://maple-aio-2-m1.otxlab.net/rest/211650513/workflow/Request
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/211650513/workflow/Request

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/authorization/permissions/10018
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/authorization/permissions/10018

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/bo-integration/originalTenantUrl
- Query params: domain
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/bo-integration/originalTenantUrl?domain=maple-aio-2-m1.otxlab.net

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/customized-tab-config/getDateFormatConfigs
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/customized-tab-config/getDateFormatConfigs

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ems/Company
- Query params: layout, meta, order, size
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ems/Company?layout=Name,Id,DisplayLabel,CompanyLogo,Tenant,Code,ManagedCustomer,IsDeleted&meta=totalCount&order=DisplayLabel%20asc&size=30

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ems/Person/10018/associations/PersonToGroup
- Query params: layout
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ems/Person/10018/associations/PersonToGroup?layout=Id

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ems/PersonGroup
- Query params: filter, layout, meta, order, size
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ems/PersonGroup?filter=(GroupFullAccessToRequestRelatedSubscription[Id%20=%200])&layout=Id&meta=totalCount&order=Id&size=250

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/encryption/config
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/encryption/config

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/encryption/domains-thin
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/encryption/domains-thin

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/encryption/key_chain/10018/status
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/encryption/key_chain/10018/status

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/backend/tenant
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/backend/tenant

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/cartItem
- Query params: additionalLayout
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/cartItem?additionalLayout=RequestsOffering.PriceVisibleToESS,RequestsOffering.OfferingType,RequestsOffering.IsBundle

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category-list
- Query params: requestOnBehalf
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category-list?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10129
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10129?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10129/service-list
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10129/service-list?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10183
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10183?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10183/service-list
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10183/service-list?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10188
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10188?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10188/service-list
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10188/service-list?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10228
- Query params: requestOnBehalf
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10228?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10228/service-list
- Query params: requestOnBehalf
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/10228/service-list?requestOnBehalf=

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/article-list
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/article-list

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/news-list
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/news-list

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/offering-list
- Query params: none
- Seen in files: 4
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/category/offering-list

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offering/10190/voteCount
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offering/10190/voteCount

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offering/10227/voteCount
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offering/10227/voteCount

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offeringWithBundles/10190
- Query params: requestOnBehalf
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offeringWithBundles/10190?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offeringWithBundles/10227
- Query params: requestOnBehalf
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/offeringWithBundles/10227?requestOnBehalf=

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/service/offering-list
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/catalog/service/offering-list

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/customizedSettings/sawCustomizedAction/list
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/customizedSettings/sawCustomizedAction/list

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/idea/hotOnesInCache
- Query params: topN
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/idea/hotOnesInCache?topN=3

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/idea/list
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/idea/list

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/loadingPage/loadingPageData
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/loadingPage/loadingPageData

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/news/filterNews
- Query params: category, maxRelatedNews, offering, requestOnBehalf
- Seen in files: 4
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/news/filterNews?maxRelatedNews=8&category=10129&requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/news/topNews
- Query params: maxRelatedNews, requestOnBehalf
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/news/topNews?maxRelatedNews=3&requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/questions/your-questions
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/questions/your-questions

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/allRequestsWithBundles
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/allRequestsWithBundles

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/chatAvailable/10192
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/chatAvailable/10192

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/chatAvailable/10252
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/chatAvailable/10252

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/chatAvailable/10254
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/chatAvailable/10254

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/createRequest
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/createRequest

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/pendingChatRequests2
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/pendingChatRequests2

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/platform-proxy/Offering/10190/getComments
- Query params: customTabId
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/platform-proxy/Offering/10190/getComments?customTabId=null

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/platform-proxy/Offering/10227/getComments
- Query params: customTabId
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/request/platform-proxy/Offering/10227/getComments?customTabId=null

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/ribbon/essRibbonConfig
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/ribbon/essRibbonConfig

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/search/relatedQuestions
- Query params: link, maxRelatedQuestions
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/search/relatedQuestions?link=10227&maxRelatedQuestions=3

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/search/textRelatedQuestions
- Query params: onlyUnanswered
- Seen in files: 4
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/search/textRelatedQuestions?onlyUnanswered=false

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/search/userSearches
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/search/userSearches

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/defaultTheme
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/defaultTheme

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/getAllThemeSettings
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/getAllThemeSettings

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/layout
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/layout

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/user-style-with-widget
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/theme/user-style-with-widget

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/user-entitlement/Entitlement
- Query params: includeInactive, withPermission
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/user-entitlement/Entitlement?withPermission=VIEW&includeInactive=false

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/getLoggedInUser
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/getLoggedInUser

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/APPROVAL
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/APPROVAL

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/FEEDBACK_REQUEST
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/FEEDBACK_REQUEST

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/REQUEST
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/REQUEST

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/SURVEY
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/users/userRelatedData/SURVEY

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/workflow/simulator/Request
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/ess/workflow/simulator/Request

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/forms/Request
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/forms/Request

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/forms/sharedResource
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/forms/sharedResource

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/frs/management/TenantAttachmentConfig
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/frs/management/TenantAttachmentConfig

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/index/progress
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/index/progress

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/l10n/bundles/ess/en
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/l10n/bundles/ess/en

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/metadata/ui/entity-descriptors/
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/metadata/ui/entity-descriptors/

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/metadata/ui/enumeration-descriptors/
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/metadata/ui/enumeration-descriptors/

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/personalization/10018/profile/recalculateEntitlementRules
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/personalization/10018/profile/recalculateEntitlementRules

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/personalization/person/me
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/personalization/person/me

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/push/presence
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/presence

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/209cd506-4ee1-48ab-a7d0-cbf085652a8c
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/209cd506-4ee1-48ab-a7d0-cbf085652a8c

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/30ec68a7-1326-4472-aa4b-7c475796e78e
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/30ec68a7-1326-4472-aa4b-7c475796e78e

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/593012b9-ff3c-49f3-ae63-8d29d92a7fff
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/593012b9-ff3c-49f3-ae63-8d29d92a7fff

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/bc5c586a-f2e5-4cbe-a58d-e63dcba1fae0
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/bc5c586a-f2e5-4cbe-a58d-e63dcba1fae0

## POST https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/fbd5dae2-9555-4c10-97bb-9795cac1532d
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/register/fbd5dae2-9555-4c10-97bb-9795cac1532d

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/push/xmppSubdomain
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/push/xmppSubdomain

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/rms/Favorites
- Query params: filter
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/rms/Favorites?filter=(IsPublic%20!=%20true%20and%20Owner%20=%20%2710018%27%20and%20FavoriteName%20=%20%27grid_persistence_view%27%20and%20GridId%20=%20%27saw-m2mPicker-PersonGroup-RelatedSubscriptionFullAccessByGroup%27)

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/saw-authentication/person/privateKey
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/saw-authentication/person/privateKey

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/TenantManagement/tenant/223791286
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/TenantManagement/tenant/223791286

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/TenantSettings/domain/ui
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/TenantSettings/domain/ui

## GET https://maple-aio-2-m1.otxlab.net/rest/223791286/workflow/Request
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/223791286/workflow/Request

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/authorization/permissions/10018
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/authorization/permissions/10018

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/bo-integration/originalTenantUrl
- Query params: domain
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/bo-integration/originalTenantUrl?domain=maple-aio-2-m1.otxlab.net

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/customized-tab-config/getDateFormatConfigs
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/customized-tab-config/getDateFormatConfigs

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/encryption/config
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/encryption/config

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/encryption/domains-thin
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/encryption/domains-thin

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/encryption/key_chain/10018/status
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/encryption/key_chain/10018/status

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/backend/tenant
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/backend/tenant

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/cartItem
- Query params: additionalLayout
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/cartItem?additionalLayout=RequestsOffering.PriceVisibleToESS,RequestsOffering.OfferingType,RequestsOffering.IsBundle

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/catalog/category-list
- Query params: requestOnBehalf
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/catalog/category-list?requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/customizedSettings/sawCustomizedAction/list
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/customizedSettings/sawCustomizedAction/list

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/idea/hotOnesInCache
- Query params: topN
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/idea/hotOnesInCache?topN=3

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/idea/list
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/idea/list

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/loadingPage/loadingPageData
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/loadingPage/loadingPageData

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/news/topNews
- Query params: maxRelatedNews, requestOnBehalf
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/news/topNews?maxRelatedNews=3&requestOnBehalf=

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/questions/your-questions
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/questions/your-questions

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/request/allRequestsWithBundles
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/request/allRequestsWithBundles

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/request/pendingChatRequests2
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/request/pendingChatRequests2

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/ribbon/essRibbonConfig
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/ribbon/essRibbonConfig

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/defaultTheme
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/defaultTheme

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/getAllThemeSettings
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/getAllThemeSettings

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/layout
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/layout

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/user-style-with-widget
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/theme/user-style-with-widget

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/user-entitlement/Entitlement
- Query params: includeInactive, withPermission
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/user-entitlement/Entitlement?withPermission=VIEW&includeInactive=false

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/getLoggedInUser
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/getLoggedInUser

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/APPROVAL
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/APPROVAL

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/FEEDBACK_REQUEST
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/FEEDBACK_REQUEST

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/REQUEST
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/REQUEST

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/SURVEY
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/ess/users/userRelatedData/SURVEY

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/forms/sharedResource
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/forms/sharedResource

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/frs/management/TenantAttachmentConfig
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/frs/management/TenantAttachmentConfig

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/l10n/bundles/ess/en
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/l10n/bundles/ess/en

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/metadata/ui/entity-descriptors/
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/metadata/ui/entity-descriptors/

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/metadata/ui/enumeration-descriptors/
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/metadata/ui/enumeration-descriptors/

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/personalization/10018/profile/recalculateEntitlementRules
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/personalization/10018/profile/recalculateEntitlementRules

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/personalization/person/me
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/personalization/person/me

## POST https://maple-aio-2-m1.otxlab.net/rest/669062255/push/presence
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/push/presence

## POST https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/50adf47b-ef39-404c-b8ec-c8e9b7d8ccbd
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/50adf47b-ef39-404c-b8ec-c8e9b7d8ccbd

## POST https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/f148b784-9dfa-4bea-9937-53497f26a2b1
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/f148b784-9dfa-4bea-9937-53497f26a2b1

## POST https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/fd3f26f4-068c-4331-b9a9-5f776ab61920
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/fd3f26f4-068c-4331-b9a9-5f776ab61920

## POST https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/ff5a5e38-d333-4762-b862-80934a9d5d3f
- Query params: none
- Seen in files: 1
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/push/register/ff5a5e38-d333-4762-b862-80934a9d5d3f

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/push/xmppSubdomain
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/push/xmppSubdomain

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/saw-authentication/person/privateKey
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/saw-authentication/person/privateKey

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/TenantManagement/tenant/669062255
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/TenantManagement/tenant/669062255

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/TenantSettings/domain/ui
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/TenantSettings/domain/ui

## GET https://maple-aio-2-m1.otxlab.net/rest/669062255/workflow/Request
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/rest/669062255/workflow/Request

## GET https://maple-aio-2-m1.otxlab.net/smax/js/modules/admin/resources/locales/en/i18n-resource-propel.json
- Query params: 2026-Jan-12-14:13:07, 2026-Jan-12-15:44:19, 2026-Jan-12-20:24:55, 2026-Jan-15-14:58:13, 2026-Jan-15-15:34:34, 2026-Jan-19-09:59:18, 2026-Jan-19-11:54:09, 2026-Jan-19-14:49:41, 2026-Mar-24-18:46:08, 2026-Mar-25-09:27:22
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/js/modules/admin/resources/locales/en/i18n-resource-propel.json?2026-Jan-12-14:13:07

## GET https://maple-aio-2-m1.otxlab.net/smax/js/modules/admin/resources/locales/en/i18n-resource.json
- Query params: 2026-Jan-12-14:13:07, 2026-Jan-12-15:44:19, 2026-Jan-12-20:24:55, 2026-Jan-15-14:58:13, 2026-Jan-15-15:34:34, 2026-Jan-19-09:59:18, 2026-Jan-19-11:54:09, 2026-Jan-19-14:49:41, 2026-Mar-24-18:46:08, 2026-Mar-25-09:27:22
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/js/modules/admin/resources/locales/en/i18n-resource.json?2026-Jan-12-14:13:07

## GET https://maple-aio-2-m1.otxlab.net/smax/js/modules/ess/resources/locales/en/i18n-resource.json
- Query params: 2026-Jan-12-14:13:07, 2026-Jan-12-15:44:19, 2026-Jan-12-20:24:55, 2026-Jan-15-14:58:13, 2026-Jan-15-15:34:34, 2026-Jan-19-09:59:18, 2026-Jan-19-11:54:09, 2026-Jan-19-14:49:41, 2026-Mar-24-18:46:08, 2026-Mar-25-09:27:22
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/js/modules/ess/resources/locales/en/i18n-resource.json?2026-Jan-12-14:13:07

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/access.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/access.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/add-filter.svg
- Query params: none
- Seen in files: 4
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/add-filter.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/agent.svg
- Query params: none
- Seen in files: 8
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/agent.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/approvals.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/approvals.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ask-friends.svg
- Query params: none
- Seen in files: 7
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ask-friends.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/attachment.svg
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/attachment.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/delegations.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/delegations.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-action-collapse-search.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-action-collapse-search.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-action-expand-menu.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-action-expand-menu.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-action-propose-idea.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-action-propose-idea.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-agent.svg
- Query params: none
- Seen in files: 2
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-agent.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-arrow-med-down.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-arrow-med-down.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-cart.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-cart.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-hamburger.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-hamburger.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-to-do.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ess-to-do.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ideas.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/ideas.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/live-support.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/live-support.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/log-out.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/log-out.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/mega-request-on-behalf.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/mega-request-on-behalf.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/mobile.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/mobile.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/no-results.svg
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/no-results.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/preferences.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/preferences.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/questions.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/questions.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/request.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/request.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/service-and-assets.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/service-and-assets.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/settings.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/settings.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/skills.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/skills.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/your-requests.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/your-requests.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/your-services.svg
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/icons/your-services.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/loader.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/loader.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/logo_corp_brand_ess.svg
- Query params: none
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/portal/assets/images/logo_corp_brand_ess.svg

## GET https://maple-aio-2-m1.otxlab.net/smax/resources/locales/en/i18n-resource-propel.json
- Query params: 2026-Jan-12-14:13:07, 2026-Jan-12-15:44:19, 2026-Jan-12-20:24:55, 2026-Jan-15-14:58:13, 2026-Jan-15-15:34:34, 2026-Jan-19-09:59:18, 2026-Jan-19-11:54:09, 2026-Jan-19-14:49:41, 2026-Mar-24-18:46:08, 2026-Mar-25-09:27:22
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/resources/locales/en/i18n-resource-propel.json?2026-Jan-12-14:13:07

## GET https://maple-aio-2-m1.otxlab.net/smax/resources/locales/en/i18n-resource.json
- Query params: 2026-Jan-12-14:13:07, 2026-Jan-12-15:44:19, 2026-Jan-12-20:24:55, 2026-Jan-15-14:58:13, 2026-Jan-15-15:34:34, 2026-Jan-19-09:59:18, 2026-Jan-19-11:54:09, 2026-Jan-19-14:49:41, 2026-Mar-24-18:46:08, 2026-Mar-25-09:27:22
- Seen in files: 10
- Sample URL: https://maple-aio-2-m1.otxlab.net/smax/resources/locales/en/i18n-resource.json?2026-Jan-12-14:13:07

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/account
- Query params: count, limit, offset, timeStamp
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/account?timeStamp=1774357321231&offset=0&limit=0&count=true

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/account/103019578
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/account/103019578?timeStamp=1780891692574

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/configuration/audit/getAuditPageUrl
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/configuration/audit/getAuditPageUrl

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/configuration/common/onlineDocumentBaseurl
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/configuration/common/onlineDocumentBaseurl

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/configuration/common/suiteVersion
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/configuration/common/suiteVersion

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/customer
- Query params: limit, offset, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/customer?timeStamp=1781151330858&offset=0&limit=250

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/features
- Query params: feature
- Seen in files: 2
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/features?feature=GREY_OUT_DELETE_TENANT

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/tenant
- Query params: count, limit, offset, timeStamp
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/tenant?timeStamp=1774357321230&offset=0&limit=0&count=true

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/tenant/103019578
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/tenant/103019578?timeStamp=1780891692268

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/user
- Query params: count, filter, limit, offset, timeStamp
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/user?timeStamp=1774357321232&offset=0&limit=0&count=true&filter=((name%2Bnin%2B%22bo-integration%40dummy.com%2Csaw-integration-internal%40dummy.com%2Csaw-integration-external%40dummy.com%22)%2Bor%2B(idmOrganization%2Bneq%2B%22sysbo%22))

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/user/1000008
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/user/1000008?timeStamp=1780891692579

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/entities/user/1000050
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/entities/user/1000050?timeStamp=1780891692578

## GET https://maple-aio-3-m1.otxlab.net/bo/rest/info
- Query params: timeStamp
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/rest/info?timeStamp=1774357321224

## GET https://maple-aio-3-m1.otxlab.net/bo/userProfile
- Query params: timeStamp
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/bo/userProfile?timeStamp=1774357299728

## POST https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate
- Query params: code
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate?code=15d35928-0ad7-4f46-8da9-f360301fdf33

## GET https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/return_url
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/return_url

## GET https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/tenant
- Query params: id
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/tenant?id=sysbo

## GET https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/token
- Query params: code
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/api/public/token?code=15d35928-0ad7-4f46-8da9-f360301fdf33

## GET https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/assets/i18n/en.json
- Query params: none
- Seen in files: 3
- Sample URL: https://maple-aio-3-m1.otxlab.net/idm-service/idm/v0/assets/i18n/en.json

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/account
- Query params: count, filter, limit, offset, orderBy, timeStamp
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/account?timeStamp=1772470656716&offset=0&limit=0&count=true

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/account/201816390
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/account/201816390?timeStamp=1773245622423

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/account/433469027
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/account/433469027?timeStamp=1772470677335

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/configuration/audit/getAuditPageUrl
- Query params: none
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/configuration/audit/getAuditPageUrl

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/configuration/common/onlineDocumentBaseurl
- Query params: none
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/configuration/common/onlineDocumentBaseurl

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/configuration/common/suiteVersion
- Query params: none
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/configuration/common/suiteVersion

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/customer
- Query params: limit, offset, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/customer?timeStamp=1772618554523&offset=0&limit=250

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/features
- Query params: feature
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/features?feature=GREY_OUT_DELETE_TENANT

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/idmCredential/10133
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/idmCredential/10133?timeStamp=1772560188924

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/idmCredential/10134
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/idmCredential/10134?timeStamp=1772560188925

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10005
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10005?timeStamp=1772470680050

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10007
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10007?timeStamp=1772470680052

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10009
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10009?timeStamp=1772470680055

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10011
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10011?timeStamp=1772470680059

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10029
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10029?timeStamp=1772470680061

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10100
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10100?timeStamp=1773245624811

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10135
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/operationHistory/10135?timeStamp=1772560188922

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant
- Query params: count, limit, offset, timeStamp
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant?timeStamp=1772470656713&offset=0&limit=0&count=true

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390?timeStamp=1773245621978

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/capabilities
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/capabilities?timeStamp=1773245624423

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/capabilities/configs
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/capabilities/configs?timeStamp=1773245636517

## POST https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/capabilities/testConnection
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/capabilities/testConnection?timeStamp=1773245626783

## POST https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/cmsCustomer
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/201816390/cmsCustomer?timeStamp=1773245676063

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/433469027
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/433469027?timeStamp=1772470676939

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/433469027/capabilities
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/433469027/capabilities?timeStamp=1772470679681

## POST https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/433469027/capabilities/testConnection
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/tenant/433469027/capabilities/testConnection?timeStamp=1772470684788

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user
- Query params: count, filter, limit, offset, timeStamp
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user?timeStamp=1772470656717&offset=0&limit=0&count=true&filter=((name%2Bnin%2B%22bo-integration%40dummy.com%2Csaw-integration-internal%40dummy.com%2Csaw-integration-external%40dummy.com%22)%2Bor%2B(idmOrganization%2Bneq%2B%22sysbo%22))

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000008
- Query params: timeStamp
- Seen in files: 3
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000008?timeStamp=1772470677320

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000012
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000012?timeStamp=1772470677336

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000015
- Query params: timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000015?timeStamp=1772470680054

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000086
- Query params: timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user/1000086?timeStamp=1773245622425

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user/account/201816390
- Query params: filter, limit, offset, orderBy, timeStamp
- Seen in files: 1
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user/account/201816390?timeStamp=1773245622430&orderBy=id%3ADESC&limit=50&offset=0&filter=(userType%2Bneq%2B%22INTEGRATIONUSER%22)

## GET https://maple-aio-m1.otxlab.net/bo/rest/entities/user/account/433469027
- Query params: filter, limit, offset, orderBy, timeStamp
- Seen in files: 2
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/entities/user/account/433469027?timeStamp=1772470677339&orderBy=id%3ADESC&limit=50&offset=0

## GET https://maple-aio-m1.otxlab.net/bo/rest/info
- Query params: timeStamp
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/rest/info?timeStamp=1772470656719

## GET https://maple-aio-m1.otxlab.net/bo/userProfile
- Query params: timeStamp
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/bo/userProfile?timeStamp=1772470642351

## POST https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate
- Query params: code
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/authenticate?code=e4010f76-cddb-4362-a0f0-703bf9a68509

## GET https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/return_url
- Query params: none
- Seen in files: 5
- Sample URL: https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/return_url

## GET https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/tenant
- Query params: id
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/tenant?id=sysbo

## GET https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/token
- Query params: code
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/idm-service/idm/v0/api/public/token?code=e4010f76-cddb-4362-a0f0-703bf9a68509

## GET https://maple-aio-m1.otxlab.net/idm-service/idm/v0/assets/i18n/en.json
- Query params: none
- Seen in files: 6
- Sample URL: https://maple-aio-m1.otxlab.net/idm-service/idm/v0/assets/i18n/en.json
