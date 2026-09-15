# API / UI consolidation

Removed Subscription mode/convert/URL/credential override fields; removed Crontab import and deprecated filename 410 routes, old ENV HTTP CRUD/import surface, duplicate metadata-only Repository DELETE. Workspace storage deletion remains the sole repository deletion path. Environment panel uses Global/Repository/Task tabs with one variable editor and explicit secret semantics; SDK ENV methods remain B13 against the same masked Global store. Authentication now rejects obsolete single-token/string session shapes.

/open task status, stats, token, notification and operations are INTERNAL EXECUTION BRIDGE (B08/B12/B13), not public compatibility promises. Modern detail/file-access security and all Git workspace protections remain.

Real browser acceptance: fresh initialize/login → SSH Credential → Repository → initialize/fetch → Subscription branch/prepare/sync → Worktree → Global/Profile/default/Task overrides/effective preview → Python/Node/Shell execution/logs → disable/enable → restart/relogin/repeat execution. Full actual backend/gRPC and read-only local SSH Git server, no mocked HTTP responses. Evidence: platform-e2e.json and browser-subscription.png.

E2E found and fixed: Subscription save callback expected an object; standalone publication needed existing mTLS credentials; empty Subscription cron must remain manual; Base runtime needs explicit backend/gRPC ports. Test fixture supplies the application dependency and protobuf bundle used by preload.
