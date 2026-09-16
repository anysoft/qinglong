// Frozen Phase 11 schema. Never regenerate from later models.
export default {
  "source_commit": "de01f425f3f3bc737d15bb476d68c08d4a841da0",
  "metadata": {
    "platform_schema_version": 8,
    "model_signature": "76a163a1db237f866c831e7deb1cea881ffd5b99045ccaeaef6c9d244ac3bbb4",
    "schema_signature": "0b5518b2ebc83fa8bcd53b9c298cb7e2a3cd487f2ba8bd67a2681ce7ee319899"
  },
  "objects": [
    {
      "name": "config_asset_revisions_asset_id_revision_number",
      "sql": "CREATE UNIQUE INDEX `config_asset_revisions_asset_id_revision_number` ON `ConfigAssetRevisions` (`asset_id`, `revision_number`)"
    },
    {
      "name": "cron_triggers_next_fire_at_trigger_id",
      "sql": "CREATE INDEX `cron_triggers_next_fire_at_trigger_id` ON `CronTriggers` (`next_fire_at`, `trigger_id`)"
    },
    {
      "name": "python_environment_builds_runtime",
      "sql": "CREATE INDEX python_environment_builds_runtime ON PythonEnvironmentBuilds(runtime_id)"
    },
    {
      "name": "python_environment_revisions_runtime",
      "sql": "CREATE INDEX python_environment_revisions_runtime ON PythonEnvironmentRevisions(runtime_id)"
    },
    {
      "name": "repository_config_bindings_repository_id_target_base_target_path",
      "sql": "CREATE UNIQUE INDEX `repository_config_bindings_repository_id_target_base_target_path` ON `RepositoryConfigBindings` (`repository_id`, `target_base`, `target_path`)"
    },
    {
      "name": "repository_env_variables_profile_id_name",
      "sql": "CREATE UNIQUE INDEX `repository_env_variables_profile_id_name` ON `RepositoryEnvVariables` (`profile_id`, `name`)"
    },
    {
      "name": "runtime_defaults_repository_id_kind",
      "sql": "CREATE UNIQUE INDEX `runtime_defaults_repository_id_kind` ON `RuntimeDefaults` (`repository_id`, `kind`)"
    },
    {
      "name": "runtime_defaults_subscription_id_kind",
      "sql": "CREATE UNIQUE INDEX `runtime_defaults_subscription_id_kind` ON `RuntimeDefaults` (`subscription_id`, `kind`)"
    },
    {
      "name": "runtime_installations_provider_id_implementation_version",
      "sql": "CREATE UNIQUE INDEX runtime_installations_provider_id_implementation_version ON RuntimeInstallations(provider_id,implementation,version)"
    },
    {
      "name": "runtime_operations_provider_id_status",
      "sql": "CREATE INDEX runtime_operations_provider_id_status ON RuntimeOperations(provider_id,status)"
    },
    {
      "name": "runtime_providers_language_provider_type",
      "sql": "CREATE UNIQUE INDEX runtime_providers_language_provider_type ON RuntimeProviders (language,provider_type)"
    },
    {
      "name": "task_config_bindings_task_id_target_base_target_path",
      "sql": "CREATE UNIQUE INDEX `task_config_bindings_task_id_target_base_target_path` ON `TaskConfigBindings` (`task_id`, `target_base`, `target_path`)"
    },
    {
      "name": "task_env_variables_task_id_name",
      "sql": "CREATE UNIQUE INDEX `task_env_variables_task_id_name` ON `TaskEnvVariables` (`task_id`, `name`)"
    },
    {
      "name": "task_hooks_task_id_phase_position",
      "sql": "CREATE UNIQUE INDEX `task_hooks_task_id_phase_position` ON `TaskHooks` (`task_id`, `phase`, `position`)"
    },
    {
      "name": "task_run_attempts_task_run_id_attempt_number",
      "sql": "CREATE UNIQUE INDEX `task_run_attempts_task_run_id_attempt_number` ON `TaskRunAttempts` (`task_run_id`, `attempt_number`)"
    },
    {
      "name": "task_runs_status_id",
      "sql": "CREATE INDEX `task_runs_status_id` ON `TaskRuns` (`status`, `id`)"
    },
    {
      "name": "task_runs_submission_key",
      "sql": "CREATE UNIQUE INDEX task_runs_submission_key ON TaskRuns(submission_key)"
    },
    {
      "name": "task_runs_task_id_status_id",
      "sql": "CREATE INDEX `task_runs_task_id_status_id` ON `TaskRuns` (`task_id`, `status`, `id`)"
    },
    {
      "name": "task_sources_worktree_id",
      "sql": "CREATE INDEX `task_sources_worktree_id` ON `TaskSources` (`worktree_id`)"
    },
    {
      "name": "task_stats_date",
      "sql": "CREATE INDEX `task_stats_date` ON `TaskStats` (`date`)"
    },
    {
      "name": "task_stats_ref_id_date",
      "sql": "CREATE UNIQUE INDEX `task_stats_ref_id_date` ON `TaskStats` (`ref_id`, `date`)"
    },
    {
      "name": "task_triggers_task_id_discovery_key",
      "sql": "CREATE UNIQUE INDEX `task_triggers_task_id_discovery_key` ON `TaskTriggers` (`task_id`, `discovery_key`)"
    },
    {
      "name": "task_triggers_task_id_type",
      "sql": "CREATE INDEX `task_triggers_task_id_type` ON `TaskTriggers` (`task_id`, `type`)"
    },
    {
      "name": "tasks_subscription_id_discovery_key",
      "sql": "CREATE UNIQUE INDEX `tasks_subscription_id_discovery_key` ON `Tasks` (`subscription_id`, `discovery_key`)"
    },
    {
      "name": "trigger_events_status_id",
      "sql": "CREATE INDEX `trigger_events_status_id` ON `TriggerEvents` (`status`, `id`)"
    },
    {
      "name": "trigger_events_task_id_id",
      "sql": "CREATE INDEX `trigger_events_task_id_id` ON `TriggerEvents` (`task_id`, `id`)"
    },
    {
      "name": "trigger_events_trigger_id_event_key",
      "sql": "CREATE UNIQUE INDEX `trigger_events_trigger_id_event_key` ON `TriggerEvents` (`trigger_id`, `event_key`)"
    },
    {
      "name": "Apps",
      "sql": "CREATE TABLE `Apps` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255), `scopes` JSON, `client_id` VARCHAR(255), `client_secret` VARCHAR(255), `tokens` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, UNIQUE (`name`))"
    },
    {
      "name": "Auths",
      "sql": "CREATE TABLE `Auths` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `ip` VARCHAR(255), `type` VARCHAR(255), `info` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "ConfigAssetRevisions",
      "sql": "CREATE TABLE `ConfigAssetRevisions` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `asset_id` INTEGER NOT NULL REFERENCES `ConfigAssets` (`id`) ON DELETE RESTRICT, `revision_number` INTEGER NOT NULL, `checksum` VARCHAR(255) NOT NULL, `size` INTEGER NOT NULL, `storage_key` VARCHAR(255) NOT NULL UNIQUE, `createdAt` DATETIME NOT NULL)"
    },
    {
      "name": "ConfigAssets",
      "sql": "CREATE TABLE `ConfigAssets` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL UNIQUE, `description` TEXT NOT NULL DEFAULT '', `content_type` VARCHAR(255) NOT NULL DEFAULT 'TEXT', `is_secret` TINYINT(1) NOT NULL DEFAULT 0, `current_revision_id` INTEGER REFERENCES `ConfigAssetRevisions` (`id`) ON DELETE RESTRICT, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "CronTriggers",
      "sql": "CREATE TABLE `CronTriggers` (`trigger_id` INTEGER PRIMARY KEY REFERENCES `TaskTriggers` (`id`) ON DELETE CASCADE, `expression` VARCHAR(255) NOT NULL, `timezone` VARCHAR(255) NOT NULL, `misfire_policy` VARCHAR(255) NOT NULL, `next_fire_at` DATETIME NOT NULL, `last_fire_at` DATETIME, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "Dependences",
      "sql": "CREATE TABLE `Dependences` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255), `type` NUMBER, `timestamp` VARCHAR(255), `status` NUMBER, `log` JSON, `remark` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "DiscoveryPolicies",
      "sql": "CREATE TABLE `DiscoveryPolicies` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `subscription_id` INTEGER NOT NULL UNIQUE REFERENCES `Subscriptions` (`id`) ON DELETE CASCADE, `enabled` TINYINT(1) NOT NULL DEFAULT 1, `includes` JSON NOT NULL DEFAULT '[\"**/*\"]', `excludes` JSON NOT NULL DEFAULT '[]', `languages` JSON NOT NULL DEFAULT '[\"PYTHON\",\"JAVASCRIPT\",\"TYPESCRIPT\",\"SHELL\"]', `version` INTEGER NOT NULL DEFAULT 1, `last_reconciled_at` DATETIME, `last_result` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "EnvironmentProfiles",
      "sql": "CREATE TABLE `EnvironmentProfiles` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `repository_id` INTEGER NOT NULL REFERENCES `Repositories` (`id`) ON DELETE RESTRICT, `name` VARCHAR(255) NOT NULL, `description` TEXT DEFAULT '', `status` VARCHAR(255) NOT NULL DEFAULT 'enabled', `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, UNIQUE (`repository_id`, `name`))"
    },
    {
      "name": "Envs",
      "sql": "CREATE TABLE `Envs` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `value` TEXT, `operation` VARCHAR(255) NOT NULL DEFAULT 'SET', `is_secret` TINYINT(1) NOT NULL DEFAULT 0, `timestamp` VARCHAR(255), `status` INTEGER NOT NULL DEFAULT 0, `position` NUMBER, `name` VARCHAR(255) NOT NULL UNIQUE, `remarks` VARCHAR(255), `isPinned` NUMBER, `labels` JSON, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "GitCredentials",
      "sql": "CREATE TABLE `GitCredentials` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL UNIQUE, `provider` VARCHAR(255) NOT NULL, `auth_type` VARCHAR(255) NOT NULL, `username` VARCHAR(255), `secret` TEXT, `public_key` TEXT, `known_hosts` TEXT, `capability` VARCHAR(255) NOT NULL DEFAULT 'READ', `status` VARCHAR(255) NOT NULL DEFAULT 'enabled', `last_test_at` DATETIME, `last_test_result` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "GitUpdateTriggers",
      "sql": "CREATE TABLE `GitUpdateTriggers` (`trigger_id` INTEGER PRIMARY KEY REFERENCES `TaskTriggers` (`id`) ON DELETE CASCADE, `mode` VARCHAR(255) NOT NULL, `path_filters` JSON NOT NULL DEFAULT '[]', `fire_on_initial` TINYINT(1) NOT NULL DEFAULT 0, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "NodeEnvironmentBuilds",
      "sql": "CREATE TABLE NodeEnvironmentBuilds (\n id INTEGER PRIMARY KEY AUTOINCREMENT,environment_id INTEGER NOT NULL REFERENCES NodeEnvironments(id) ON DELETE RESTRICT,revision_id INTEGER NOT NULL,\n runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,toolchain_id INTEGER NOT NULL REFERENCES NodePackageManagerToolchains(id) ON DELETE RESTRICT,\n state VARCHAR(255) NOT NULL CHECK(state IN ('QUEUED','INSTALLING','VERIFYING','READY','FAILED','CANCELLED','INTERRUPTED','DELETING')),\n health VARCHAR(255) NOT NULL DEFAULT 'UNVERIFIED' CHECK(health IN ('UNVERIFIED','HEALTHY','INVALID','MISSING')),\n package_json TEXT NOT NULL DEFAULT '',lockfile TEXT NOT NULL DEFAULT '',lock_hash VARCHAR(255),resolved JSON NOT NULL DEFAULT '[]',resolved_hash VARCHAR(255),metadata JSON NOT NULL DEFAULT '{}',verified_at DATETIME,last_error VARCHAR(255),\n createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,UNIQUE(environment_id,id),\n FOREIGN KEY(environment_id,revision_id,runtime_id,toolchain_id) REFERENCES NodeEnvironmentRevisions(environment_id,id,runtime_id,toolchain_id) ON DELETE RESTRICT)"
    },
    {
      "name": "NodeEnvironmentRevisions",
      "sql": "CREATE TABLE NodeEnvironmentRevisions (\n id INTEGER PRIMARY KEY AUTOINCREMENT,environment_id INTEGER NOT NULL REFERENCES NodeEnvironments(id) ON DELETE RESTRICT,\n runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,toolchain_id INTEGER NOT NULL REFERENCES NodePackageManagerToolchains(id) ON DELETE RESTRICT,\n dependencies JSON NOT NULL DEFAULT '[]' CHECK(json_valid(dependencies)),spec_hash VARCHAR(255) NOT NULL,\n production_only TINYINT(1) NOT NULL DEFAULT 0 CHECK(production_only IN (0,1)),install_scripts_policy VARCHAR(255) NOT NULL DEFAULT 'ALLOW' CHECK(install_scripts_policy IN ('ALLOW','IGNORE')),\n createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,UNIQUE(environment_id,id),UNIQUE(environment_id,id,runtime_id,toolchain_id),\n FOREIGN KEY(toolchain_id,runtime_id) REFERENCES NodePackageManagerToolchains(id,runtime_id) ON DELETE RESTRICT)"
    },
    {
      "name": "NodeEnvironments",
      "sql": "CREATE TABLE NodeEnvironments (\n id INTEGER PRIMARY KEY AUTOINCREMENT,name VARCHAR(255) NOT NULL UNIQUE,description VARCHAR(255) NOT NULL DEFAULT '',\n runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,toolchain_id INTEGER NOT NULL REFERENCES NodePackageManagerToolchains(id) ON DELETE RESTRICT,\n state VARCHAR(255) NOT NULL CHECK(state IN ('EMPTY','BUILDING','READY','ERROR','DELETING')),current_revision_id INTEGER,current_build_id INTEGER,version INTEGER NOT NULL DEFAULT 1 CHECK(version>0),last_error VARCHAR(255),\n production_only TINYINT(1) NOT NULL DEFAULT 0 CHECK(production_only IN (0,1)),install_scripts_policy VARCHAR(255) NOT NULL DEFAULT 'ALLOW' CHECK(install_scripts_policy IN ('ALLOW','IGNORE')),\n createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,\n FOREIGN KEY(toolchain_id,runtime_id) REFERENCES NodePackageManagerToolchains(id,runtime_id) ON DELETE RESTRICT,\n FOREIGN KEY(id,current_revision_id) REFERENCES NodeEnvironmentRevisions(environment_id,id) DEFERRABLE INITIALLY DEFERRED,\n FOREIGN KEY(id,current_build_id) REFERENCES NodeEnvironmentBuilds(environment_id,id) DEFERRABLE INITIALLY DEFERRED)"
    },
    {
      "name": "NodePackageManagerToolchains",
      "sql": "CREATE TABLE NodePackageManagerToolchains (\n id INTEGER PRIMARY KEY AUTOINCREMENT, runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,\n manager_type VARCHAR(255) NOT NULL CHECK(manager_type IN ('PNPM','NPM')), version VARCHAR(255) NOT NULL,\n state VARCHAR(255) NOT NULL CHECK(state IN ('INSTALLING','READY','ERROR','REMOVED')), metadata JSON NOT NULL DEFAULT '{}', verified_at DATETIME,last_error VARCHAR(255),\n createdAt DATETIME NOT NULL,updatedAt DATETIME NOT NULL,UNIQUE(runtime_id,manager_type,version),UNIQUE(id,runtime_id))"
    },
    {
      "name": "PlatformMetadata",
      "sql": "CREATE TABLE PlatformMetadata (platform_schema_version INTEGER NOT NULL PRIMARY KEY CHECK(platform_schema_version = 8), model_signature TEXT NOT NULL, schema_signature TEXT NOT NULL)"
    },
    {
      "name": "PythonEnvironmentBuilds",
      "sql": "CREATE TABLE PythonEnvironmentBuilds (\n id INTEGER PRIMARY KEY AUTOINCREMENT, environment_id INTEGER NOT NULL REFERENCES PythonEnvironments(id) ON DELETE CASCADE,\n revision_id INTEGER NOT NULL, runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,\n state VARCHAR(255) NOT NULL CHECK(state IN ('QUEUED','CREATING','INSTALLING','VERIFYING','READY','FAILED','CANCELLED','INTERRUPTED','DELETING')),\n health VARCHAR(255) NOT NULL DEFAULT 'UNVERIFIED' CHECK(health IN ('UNVERIFIED','HEALTHY','INVALID','MISSING')),\n resolved JSON NOT NULL DEFAULT '[]', resolved_hash VARCHAR(255), freeze TEXT NOT NULL DEFAULT '', metadata JSON NOT NULL DEFAULT '{}',\n last_error VARCHAR(255), verified_at DATETIME, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, UNIQUE(environment_id,id),\n FOREIGN KEY(environment_id,revision_id,runtime_id) REFERENCES PythonEnvironmentRevisions(environment_id,id,runtime_id) ON DELETE RESTRICT)"
    },
    {
      "name": "PythonEnvironmentRevisions",
      "sql": "CREATE TABLE PythonEnvironmentRevisions (\n id INTEGER PRIMARY KEY AUTOINCREMENT, environment_id INTEGER NOT NULL REFERENCES PythonEnvironments(id) ON DELETE CASCADE,\n runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,\n dependencies JSON NOT NULL DEFAULT '[]', spec_hash VARCHAR(255) NOT NULL,\n createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL, UNIQUE(environment_id,id), UNIQUE(environment_id,id,runtime_id))"
    },
    {
      "name": "PythonEnvironments",
      "sql": "CREATE TABLE PythonEnvironments (\n id INTEGER PRIMARY KEY AUTOINCREMENT, name VARCHAR(255) NOT NULL UNIQUE, description VARCHAR(255) NOT NULL DEFAULT '',\n runtime_id INTEGER NOT NULL REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,\n state VARCHAR(255) NOT NULL CHECK(state IN ('EMPTY','BUILDING','READY','ERROR','DELETING')),\n current_revision_id INTEGER, current_build_id INTEGER, version INTEGER NOT NULL DEFAULT 1 CHECK(version>0), last_error VARCHAR(255),\n createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL,\n FOREIGN KEY(id,current_revision_id) REFERENCES PythonEnvironmentRevisions(environment_id,id) DEFERRABLE INITIALLY DEFERRED,\n FOREIGN KEY(id,current_build_id) REFERENCES PythonEnvironmentBuilds(environment_id,id) DEFERRABLE INITIALLY DEFERRED)"
    },
    {
      "name": "Repositories",
      "sql": "CREATE TABLE `Repositories` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL, `provider` VARCHAR(255) NOT NULL, `remote_url` TEXT NOT NULL, `normalized_url` VARCHAR(255) NOT NULL UNIQUE, `host` VARCHAR(255), `path` TEXT, `owner` VARCHAR(255), `repository_name` VARCHAR(255), `default_credential_id` INTEGER REFERENCES `GitCredentials` (`id`) ON DELETE RESTRICT, `default_env_profile_id` INTEGER REFERENCES `EnvironmentProfiles` (`id`) ON DELETE RESTRICT, `status` VARCHAR(255) DEFAULT 'unknown', `storage_state` VARCHAR(255) NOT NULL DEFAULT 'UNINITIALIZED', `storage_path` TEXT, `last_fetch_at` DATETIME, `last_fetch_status` VARCHAR(255), `last_error` TEXT, `default_branch` VARCHAR(255), `last_known_remote_head` VARCHAR(255), `remote_refs_count` INTEGER DEFAULT 0, `tags_count` INTEGER DEFAULT 0, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "RepositoryConfigBindings",
      "sql": "CREATE TABLE `RepositoryConfigBindings` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `repository_id` INTEGER NOT NULL REFERENCES `Repositories` (`id`) ON DELETE RESTRICT, `asset_id` INTEGER REFERENCES `ConfigAssets` (`id`) ON DELETE RESTRICT, `operation` VARCHAR(255) NOT NULL DEFAULT 'ATTACH', `target_base` VARCHAR(255) NOT NULL, `target_path` VARCHAR(255) NOT NULL, `materialization_mode` VARCHAR(255) NOT NULL DEFAULT 'COPY', `conflict_policy` VARCHAR(255) NOT NULL DEFAULT 'FAIL_IF_EXISTS', `writable` TINYINT(1) NOT NULL DEFAULT 0, `enabled` TINYINT(1) NOT NULL DEFAULT 1, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "RepositoryEnvVariables",
      "sql": "CREATE TABLE `RepositoryEnvVariables` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL, `value` TEXT, `status` VARCHAR(255) NOT NULL DEFAULT 'enabled', `operation` VARCHAR(255) NOT NULL DEFAULT 'SET', `is_secret` TINYINT(1) NOT NULL DEFAULT 0, `position` FLOAT DEFAULT '0', `labels` JSON DEFAULT '[]', `profile_id` INTEGER NOT NULL REFERENCES `EnvironmentProfiles` (`id`) ON DELETE CASCADE, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "RunningInstances",
      "sql": "CREATE TABLE \"RunningInstances\" (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` NUMBER NOT NULL, `pid` NUMBER, `log_path` VARCHAR(255), `started_at` NUMBER NOT NULL, `finished_at` NUMBER, `status` NUMBER NOT NULL DEFAULT 0, `exit_code` NUMBER, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeDefaults",
      "sql": "CREATE TABLE `RuntimeDefaults` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `repository_id` INTEGER REFERENCES `Repositories` (`id`) ON DELETE CASCADE, `subscription_id` INTEGER REFERENCES `Subscriptions` (`id`) ON DELETE CASCADE, `kind` VARCHAR(255) NOT NULL, `python_environment_id` INTEGER REFERENCES `PythonEnvironments` (`id`) ON DELETE RESTRICT, `node_environment_id` INTEGER REFERENCES `NodeEnvironments` (`id`) ON DELETE RESTRICT, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeInstallations",
      "sql": "CREATE TABLE \"RuntimeInstallations\" (\n id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES RuntimeProviders(id) ON DELETE RESTRICT,\n language VARCHAR(255) NOT NULL CHECK(language IN ('PYTHON','NODE')), implementation VARCHAR(255) NOT NULL CHECK(implementation IN ('CPYTHON','NODEJS')),\n version VARCHAR(255) NOT NULL, state VARCHAR(255) NOT NULL CHECK(state IN ('INSTALLING','READY','VERIFYING','ERROR','REMOVING','MISSING','REMOVED')),\n executable_relative_path VARCHAR(255) NOT NULL, installed_at DATETIME, verified_at DATETIME, metadata JSON NOT NULL DEFAULT '{}',\n last_error VARCHAR(255), createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeOperations",
      "sql": "CREATE TABLE \"RuntimeOperations\" (\n id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES RuntimeProviders(id) ON DELETE RESTRICT,\n runtime_id INTEGER REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,\n operation_type VARCHAR(255) NOT NULL CHECK(operation_type IN ('PROVIDER_INSTALL','PROVIDER_UPDATE','PROVIDER_VERIFY','PROVIDER_REPAIR','CATALOG_REFRESH','RUNTIME_INSTALL','RUNTIME_VERIFY','RUNTIME_REMOVE','RUNTIME_REPAIR','PYTHON_ENV_BUILD','PYTHON_ENV_REBUILD','PYTHON_ENV_VERIFY','PYTHON_ENV_PROMOTE','PYTHON_ENV_DELETE','PYTHON_ENV_DELETE_BUILD','NODE_CATALOG_REFRESH','NODE_RUNTIME_INSTALL','NODE_RUNTIME_VERIFY','NODE_RUNTIME_REPAIR','NODE_RUNTIME_REMOVE','NODE_PACKAGE_MANAGER_INSTALL','NODE_PACKAGE_MANAGER_VERIFY','NODE_PACKAGE_MANAGER_REMOVE','NODE_ENV_BUILD','NODE_ENV_REBUILD','NODE_ENV_RESOLVE','NODE_ENV_VERIFY','NODE_ENV_PROMOTE','NODE_ENV_DELETE','NODE_ENV_DELETE_BUILD')),\n status VARCHAR(255) NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCESS','FAILED','CANCELLED','INTERRUPTED')),\n stage VARCHAR(255) NOT NULL, owner_token VARCHAR(255) NOT NULL, owner_pid INTEGER NOT NULL,\n cancel_requested TINYINT(1) NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)), started_at DATETIME, finished_at DATETIME, exit_code INTEGER,\n log_identity VARCHAR(255) NOT NULL UNIQUE, error_code VARCHAR(255), error_summary VARCHAR(255), metadata JSON NOT NULL DEFAULT '{}',\n createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeProviders",
      "sql": "CREATE TABLE \"RuntimeProviders\" (\n id INTEGER PRIMARY KEY AUTOINCREMENT, language VARCHAR(255) NOT NULL CHECK(language IN ('PYTHON','NODE')),\n provider_type VARCHAR(255) NOT NULL CHECK(provider_type IN ('PYENV','NODE_DISTRIBUTION')),\n state VARCHAR(255) NOT NULL CHECK(state IN ('UNINITIALIZED','INSTALLING','READY','UPDATING','ERROR','MISSING')),\n provider_version VARCHAR(255), provider_revision VARCHAR(255), install_root VARCHAR(255) NOT NULL,\n catalog JSON NOT NULL DEFAULT '[]', last_refresh_at DATETIME, last_verified_at DATETIME, last_error VARCHAR(255),\n version INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    },
    {
      "name": "SchedulerProjections",
      "sql": "CREATE TABLE \"SchedulerProjections\" (`id` INTEGER PRIMARY KEY REFERENCES Tasks(id) ON DELETE CASCADE, `name` VARCHAR(255), `command` VARCHAR(255), `schedule` VARCHAR(255), `timestamp` VARCHAR(255), `saved` TINYINT(1), `status` NUMBER, `isSystem` NUMBER, `pid` NUMBER, `isDisabled` NUMBER, `isPinned` NUMBER, `log_path` VARCHAR(255), `queued_token` VARCHAR(255), `labels` JSON, `last_running_time` NUMBER, `last_execution_time` NUMBER, `sub_id` NUMBER, `discovery_key` VARCHAR(255), `source_relative_path` VARCHAR(255), `discovery_definition` JSON, `env_profile_id` INTEGER REFERENCES `EnvironmentProfiles` (`id`) ON DELETE RESTRICT, `extra_schedules` JSON, `log_name` VARCHAR(255), `allow_multiple_instances` NUMBER, `work_dir` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, UNIQUE (`sub_id`, `discovery_key`))"
    },
    {
      "name": "Subscriptions",
      "sql": "CREATE TABLE `Subscriptions` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `env_profile_id` INTEGER REFERENCES `EnvironmentProfiles` (`id`) ON DELETE RESTRICT, `repository_id` INTEGER NOT NULL REFERENCES `Repositories` (`id`) ON DELETE RESTRICT, `worktree_id` INTEGER REFERENCES `Worktrees` (`id`) ON DELETE RESTRICT, `last_synced_commit` VARCHAR(255), `last_sync_at` DATETIME, `last_sync_state` VARCHAR(255), `last_sync_phase` VARCHAR(255), `last_sync_error` TEXT, `name` VARCHAR(255), `schedule` VARCHAR(255), `interval_schedule` JSON, `status` NUMBER, `branch` VARCHAR(255), `pid` NUMBER, `is_disabled` NUMBER, `log_path` VARCHAR(255), `schedule_type` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskConfigBindings",
      "sql": "CREATE TABLE \"TaskConfigBindings\" (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` INTEGER NOT NULL REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `asset_id` INTEGER REFERENCES `ConfigAssets` (`id`) ON DELETE RESTRICT, `operation` VARCHAR(255) NOT NULL DEFAULT 'ATTACH', `target_base` VARCHAR(255) NOT NULL, `target_path` VARCHAR(255) NOT NULL, `materialization_mode` VARCHAR(255) NOT NULL DEFAULT 'COPY', `conflict_policy` VARCHAR(255) NOT NULL DEFAULT 'FAIL_IF_EXISTS', `writable` TINYINT(1) NOT NULL DEFAULT 0, `enabled` TINYINT(1) NOT NULL DEFAULT 1, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskEnvVariables",
      "sql": "CREATE TABLE \"TaskEnvVariables\" (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL, `value` TEXT, `status` VARCHAR(255) NOT NULL DEFAULT 'enabled', `operation` VARCHAR(255) NOT NULL DEFAULT 'SET', `is_secret` TINYINT(1) NOT NULL DEFAULT 0, `position` FLOAT DEFAULT '0', `labels` JSON DEFAULT '[]', `task_id` INTEGER NOT NULL REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskExecutionSettings",
      "sql": "CREATE TABLE `TaskExecutionSettings` (`task_id` INTEGER PRIMARY KEY REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `timeout_seconds` INTEGER, `max_attempts` INTEGER NOT NULL DEFAULT 1, `initial_delay_seconds` INTEGER NOT NULL DEFAULT 0, `backoff` VARCHAR(255) NOT NULL DEFAULT 'FIXED', `concurrency` VARCHAR(255) NOT NULL DEFAULT 'FORBID', `notification` VARCHAR(255) NOT NULL DEFAULT 'NONE', `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskHooks",
      "sql": "CREATE TABLE \"TaskHooks\" (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` INTEGER NOT NULL REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `name` VARCHAR(255) NOT NULL, `phase` VARCHAR(255) NOT NULL, `command` TEXT NOT NULL, `cwd_base` VARCHAR(255) NOT NULL DEFAULT 'TASK_CWD', `position` INTEGER NOT NULL, `timeout_seconds` INTEGER NOT NULL DEFAULT 60, `failure_policy` VARCHAR(255) NOT NULL, `enabled` TINYINT(1) NOT NULL DEFAULT 1, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskRunAttempts",
      "sql": "CREATE TABLE `TaskRunAttempts` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_run_id` INTEGER NOT NULL REFERENCES `TaskRuns` (`id`) ON DELETE CASCADE, `attempt_number` INTEGER NOT NULL, `status` VARCHAR(255) NOT NULL, `started_at` DATETIME NOT NULL, `finished_at` DATETIME, `exit_code` INTEGER, `signal` VARCHAR(255), `error_code` VARCHAR(255), `error_summary` VARCHAR(255), `duration_ms` INTEGER, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskRuns",
      "sql": "CREATE TABLE `TaskRuns` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` INTEGER REFERENCES `Tasks` (`id`) ON DELETE SET NULL, `worktree_id` INTEGER REFERENCES `Worktrees` (`id`) ON DELETE RESTRICT, `result` JSON, `task_definition_version` INTEGER, `trigger_type` VARCHAR(255) NOT NULL, `status` VARCHAR(255) NOT NULL DEFAULT 'QUEUED', `submitted_at` DATETIME NOT NULL, `started_at` DATETIME, `finished_at` DATETIME, `attempt_count` INTEGER NOT NULL DEFAULT 0, `cancel_requested` TINYINT(1) NOT NULL DEFAULT 0, `log_identity` VARCHAR(255) NOT NULL UNIQUE, `result_code` VARCHAR(255), `exit_code` INTEGER, `signal` VARCHAR(255), `error_code` VARCHAR(255), `error_summary` VARCHAR(255), `snapshot_metadata` JSON, `concurrency_policy` VARCHAR(255) NOT NULL, `owner_token` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, trigger_id INTEGER REFERENCES TaskTriggers(id) ON DELETE SET NULL, event_id INTEGER REFERENCES TriggerEvents(id) ON DELETE SET NULL, submission_key VARCHAR(255))"
    },
    {
      "name": "TaskRuntimeBindings",
      "sql": "CREATE TABLE `TaskRuntimeBindings` (`task_id` INTEGER PRIMARY KEY REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `kind` VARCHAR(255) NOT NULL, `python_environment_id` INTEGER REFERENCES `PythonEnvironments` (`id`) ON DELETE RESTRICT, `node_environment_id` INTEGER REFERENCES `NodeEnvironments` (`id`) ON DELETE RESTRICT, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskSources",
      "sql": "CREATE TABLE `TaskSources` (`task_id` INTEGER PRIMARY KEY REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `type` VARCHAR(255) NOT NULL DEFAULT 'WORKTREE_ENTRYPOINT', `worktree_id` INTEGER NOT NULL REFERENCES `Worktrees` (`id`) ON DELETE RESTRICT, `relative_entrypoint` VARCHAR(255) NOT NULL, `language` VARCHAR(255) NOT NULL, `cwd_mode` VARCHAR(255) NOT NULL DEFAULT 'ENTRYPOINT_DIR', `cwd_relative_path` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskStats",
      "sql": "CREATE TABLE \"TaskStats\" (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `ref_id` NUMBER NOT NULL, `date` VARCHAR(255) NOT NULL, `run_count` NUMBER DEFAULT 0, `success_count` NUMBER DEFAULT 0, `fail_count` NUMBER DEFAULT 0, `total_time` NUMBER DEFAULT 0, `max_time` NUMBER DEFAULT 0, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskTriggers",
      "sql": "CREATE TABLE `TaskTriggers` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` INTEGER NOT NULL REFERENCES `Tasks` (`id`) ON DELETE CASCADE, `type` VARCHAR(255) NOT NULL, `origin` VARCHAR(255) NOT NULL DEFAULT 'USER', `enabled` TINYINT(1) NOT NULL DEFAULT 1, `version` INTEGER NOT NULL DEFAULT 1, `discovery_key` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskViews",
      "sql": "CREATE TABLE \"TaskViews\" (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255), `position` NUMBER, `isDisabled` NUMBER, `filters` JSON, `sorts` JSON, `filterRelation` VARCHAR(255), `type` NUMBER, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, UNIQUE (`name`))"
    },
    {
      "name": "Tasks",
      "sql": "CREATE TABLE `Tasks` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL, `description` TEXT NOT NULL DEFAULT '', `enabled` TINYINT(1) NOT NULL DEFAULT 0, `origin` VARCHAR(255) NOT NULL DEFAULT 'MANUAL', `subscription_id` INTEGER REFERENCES `Subscriptions` (`id`) ON DELETE RESTRICT, `discovery_key` VARCHAR(255), `discovery_definition` JSON, `env_profile_id` INTEGER REFERENCES `EnvironmentProfiles` (`id`) ON DELETE RESTRICT, `arguments` JSON NOT NULL DEFAULT '[]', `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TriggerEvents",
      "sql": "CREATE TABLE `TriggerEvents` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `trigger_id` INTEGER REFERENCES `TaskTriggers` (`id`) ON DELETE SET NULL, `task_id` INTEGER REFERENCES `Tasks` (`id`) ON DELETE SET NULL, `event_key` VARCHAR(255) NOT NULL, `trigger_type` VARCHAR(255) NOT NULL, `status` VARCHAR(255) NOT NULL DEFAULT 'RECEIVED', `task_run_id` INTEGER UNIQUE REFERENCES `TaskRuns` (`id`) ON DELETE SET NULL, `error_code` VARCHAR(255), `metadata` JSON NOT NULL DEFAULT '{}', `received_at` DATETIME NOT NULL, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "WebhookTriggers",
      "sql": "CREATE TABLE `WebhookTriggers` (`trigger_id` INTEGER PRIMARY KEY REFERENCES `TaskTriggers` (`id`) ON DELETE CASCADE, `public_id` VARCHAR(255) NOT NULL UNIQUE, `secret_hash` VARCHAR(255) NOT NULL, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "Worktrees",
      "sql": "CREATE TABLE `Worktrees` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `repository_id` INTEGER NOT NULL REFERENCES `Repositories` (`id`) ON DELETE RESTRICT, `name` VARCHAR(255) NOT NULL, `ref_type` VARCHAR(255) NOT NULL, `ref_name` VARCHAR(255) NOT NULL, `branch` VARCHAR(255), `branch_key` VARCHAR(255) UNIQUE, `commit` VARCHAR(255), `target_commit` VARCHAR(255), `local_path` TEXT, `lifecycle_state` VARCHAR(255) DEFAULT 'CREATING', `dirty_state` VARCHAR(255) DEFAULT 'UNKNOWN', `purpose` VARCHAR(255) NOT NULL DEFAULT 'USER', `managed` TINYINT(1) DEFAULT 1, `status_snapshot` JSON, `last_update_at` DATETIME, `last_error` TEXT, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "CronTriggers_kind_insert",
      "sql": "CREATE TRIGGER CronTriggers_kind_insert BEFORE INSERT ON CronTriggers WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='CRON') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END"
    },
    {
      "name": "CronTriggers_kind_update",
      "sql": "CREATE TRIGGER CronTriggers_kind_update BEFORE UPDATE ON CronTriggers WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='CRON') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END"
    },
    {
      "name": "GitUpdateTriggers_kind_insert",
      "sql": "CREATE TRIGGER GitUpdateTriggers_kind_insert BEFORE INSERT ON GitUpdateTriggers WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='GIT_UPDATE') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END"
    },
    {
      "name": "GitUpdateTriggers_kind_update",
      "sql": "CREATE TRIGGER GitUpdateTriggers_kind_update BEFORE UPDATE ON GitUpdateTriggers WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='GIT_UPDATE') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END"
    },
    {
      "name": "NodeEnvironments_task_reference_guard",
      "sql": "CREATE TRIGGER NodeEnvironments_task_reference_guard BEFORE UPDATE OF state ON NodeEnvironments WHEN NEW.state='DELETING' AND (EXISTS(SELECT 1 FROM TaskRuntimeBindings WHERE node_environment_id=NEW.id) OR EXISTS(SELECT 1 FROM RuntimeDefaults WHERE node_environment_id=NEW.id)) BEGIN SELECT RAISE(ABORT,'ENVIRONMENT_TASK_REFERENCED'); END"
    },
    {
      "name": "PythonEnvironments_task_reference_guard",
      "sql": "CREATE TRIGGER PythonEnvironments_task_reference_guard BEFORE UPDATE OF state ON PythonEnvironments WHEN NEW.state='DELETING' AND (EXISTS(SELECT 1 FROM TaskRuntimeBindings WHERE python_environment_id=NEW.id) OR EXISTS(SELECT 1 FROM RuntimeDefaults WHERE python_environment_id=NEW.id)) BEGIN SELECT RAISE(ABORT,'ENVIRONMENT_TASK_REFERENCED'); END"
    },
    {
      "name": "RuntimeDefaults_runtime_insert",
      "sql": "CREATE TRIGGER RuntimeDefaults_runtime_insert BEFORE INSERT ON RuntimeDefaults WHEN NEW.kind NOT IN ('SHELL','PYTHON','NODE') OR (NEW.kind<>'PYTHON' AND NEW.python_environment_id IS NOT NULL) OR (NEW.kind<>'NODE' AND NEW.node_environment_id IS NOT NULL) OR EXISTS(SELECT 1 FROM PythonEnvironments WHERE id=NEW.python_environment_id AND state='DELETING') OR EXISTS(SELECT 1 FROM NodeEnvironments WHERE id=NEW.node_environment_id AND state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_RUNTIME_BINDING_INVALID'); END"
    },
    {
      "name": "RuntimeDefaults_runtime_update",
      "sql": "CREATE TRIGGER RuntimeDefaults_runtime_update BEFORE UPDATE ON RuntimeDefaults WHEN NEW.kind NOT IN ('SHELL','PYTHON','NODE') OR (NEW.kind<>'PYTHON' AND NEW.python_environment_id IS NOT NULL) OR (NEW.kind<>'NODE' AND NEW.node_environment_id IS NOT NULL) OR EXISTS(SELECT 1 FROM PythonEnvironments WHERE id=NEW.python_environment_id AND state='DELETING') OR EXISTS(SELECT 1 FROM NodeEnvironments WHERE id=NEW.node_environment_id AND state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_RUNTIME_BINDING_INVALID'); END"
    },
    {
      "name": "TaskRunAttempts_status_insert",
      "sql": "CREATE TRIGGER TaskRunAttempts_status_insert BEFORE INSERT ON TaskRunAttempts WHEN NEW.status NOT IN ('QUEUED','RESOLVING','RUNNING','SUCCESS','FAILED','TIMEOUT','CANCELLED','INTERRUPTED','SKIPPED','RECOVERY_REQUIRED') BEGIN SELECT RAISE(ABORT,'TASK_RUN_STATUS_INVALID'); END"
    },
    {
      "name": "TaskRunAttempts_status_update",
      "sql": "CREATE TRIGGER TaskRunAttempts_status_update BEFORE UPDATE ON TaskRunAttempts WHEN NEW.status NOT IN ('QUEUED','RESOLVING','RUNNING','SUCCESS','FAILED','TIMEOUT','CANCELLED','INTERRUPTED','SKIPPED','RECOVERY_REQUIRED') BEGIN SELECT RAISE(ABORT,'TASK_RUN_STATUS_INVALID'); END"
    },
    {
      "name": "TaskRuns_status_insert",
      "sql": "CREATE TRIGGER TaskRuns_status_insert BEFORE INSERT ON TaskRuns WHEN NEW.status NOT IN ('QUEUED','RESOLVING','RUNNING','SUCCESS','FAILED','TIMEOUT','CANCELLED','INTERRUPTED','SKIPPED','RECOVERY_REQUIRED') BEGIN SELECT RAISE(ABORT,'TASK_RUN_STATUS_INVALID'); END"
    },
    {
      "name": "TaskRuns_status_update",
      "sql": "CREATE TRIGGER TaskRuns_status_update BEFORE UPDATE ON TaskRuns WHEN NEW.status NOT IN ('QUEUED','RESOLVING','RUNNING','SUCCESS','FAILED','TIMEOUT','CANCELLED','INTERRUPTED','SKIPPED','RECOVERY_REQUIRED') BEGIN SELECT RAISE(ABORT,'TASK_RUN_STATUS_INVALID'); END"
    },
    {
      "name": "TaskRuntimeBindings_runtime_insert",
      "sql": "CREATE TRIGGER TaskRuntimeBindings_runtime_insert BEFORE INSERT ON TaskRuntimeBindings WHEN NEW.kind NOT IN ('SHELL','PYTHON','NODE') OR (NEW.kind<>'PYTHON' AND NEW.python_environment_id IS NOT NULL) OR (NEW.kind<>'NODE' AND NEW.node_environment_id IS NOT NULL) OR EXISTS(SELECT 1 FROM PythonEnvironments WHERE id=NEW.python_environment_id AND state='DELETING') OR EXISTS(SELECT 1 FROM NodeEnvironments WHERE id=NEW.node_environment_id AND state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_RUNTIME_BINDING_INVALID'); END"
    },
    {
      "name": "TaskRuntimeBindings_runtime_update",
      "sql": "CREATE TRIGGER TaskRuntimeBindings_runtime_update BEFORE UPDATE ON TaskRuntimeBindings WHEN NEW.kind NOT IN ('SHELL','PYTHON','NODE') OR (NEW.kind<>'PYTHON' AND NEW.python_environment_id IS NOT NULL) OR (NEW.kind<>'NODE' AND NEW.node_environment_id IS NOT NULL) OR EXISTS(SELECT 1 FROM PythonEnvironments WHERE id=NEW.python_environment_id AND state='DELETING') OR EXISTS(SELECT 1 FROM NodeEnvironments WHERE id=NEW.node_environment_id AND state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_RUNTIME_BINDING_INVALID'); END"
    },
    {
      "name": "WebhookTriggers_kind_insert",
      "sql": "CREATE TRIGGER WebhookTriggers_kind_insert BEFORE INSERT ON WebhookTriggers WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='WEBHOOK') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END"
    },
    {
      "name": "WebhookTriggers_kind_update",
      "sql": "CREATE TRIGGER WebhookTriggers_kind_update BEFORE UPDATE ON WebhookTriggers WHEN NOT EXISTS(SELECT 1 FROM TaskTriggers WHERE id=NEW.trigger_id AND type='WEBHOOK') BEGIN SELECT RAISE(ABORT,'TRIGGER_CONFIG_KIND_INVALID'); END"
    },
    {
      "name": "cron_trigger_fields_insert",
      "sql": "CREATE TRIGGER cron_trigger_fields_insert BEFORE INSERT ON CronTriggers WHEN NEW.misfire_policy NOT IN ('SKIP','FIRE_ONCE') OR length(NEW.expression)<1 OR length(NEW.expression)>255 OR length(NEW.timezone)<1 OR NEW.next_fire_at IS NULL BEGIN SELECT RAISE(ABORT,'CRON_FIELDS_INVALID'); END"
    },
    {
      "name": "cron_trigger_fields_update",
      "sql": "CREATE TRIGGER cron_trigger_fields_update BEFORE UPDATE ON CronTriggers WHEN NEW.misfire_policy NOT IN ('SKIP','FIRE_ONCE') OR length(NEW.expression)<1 OR length(NEW.expression)>255 OR length(NEW.timezone)<1 OR NEW.next_fire_at IS NULL BEGIN SELECT RAISE(ABORT,'CRON_FIELDS_INVALID'); END"
    },
    {
      "name": "git_trigger_fields_insert",
      "sql": "CREATE TRIGGER git_trigger_fields_insert BEFORE INSERT ON GitUpdateTriggers WHEN NEW.mode NOT IN ('ANY_CHANGE','SOURCE_CHANGE','PATH_FILTER') OR NEW.fire_on_initial NOT IN (0,1) OR NOT json_valid(NEW.path_filters) OR json_type(NEW.path_filters)<>'array' BEGIN SELECT RAISE(ABORT,'GIT_TRIGGER_FIELDS_INVALID'); END"
    },
    {
      "name": "git_trigger_fields_update",
      "sql": "CREATE TRIGGER git_trigger_fields_update BEFORE UPDATE ON GitUpdateTriggers WHEN NEW.mode NOT IN ('ANY_CHANGE','SOURCE_CHANGE','PATH_FILTER') OR NEW.fire_on_initial NOT IN (0,1) OR NOT json_valid(NEW.path_filters) OR json_type(NEW.path_filters)<>'array' BEGIN SELECT RAISE(ABORT,'GIT_TRIGGER_FIELDS_INVALID'); END"
    },
    {
      "name": "node_build_identity_immutable",
      "sql": "CREATE TRIGGER node_build_identity_immutable BEFORE UPDATE OF environment_id,revision_id,runtime_id,toolchain_id ON NodeEnvironmentBuilds BEGIN SELECT RAISE(ABORT,'NODE_BUILD_IMMUTABLE'); END"
    },
    {
      "name": "node_build_ready_state",
      "sql": "CREATE TRIGGER node_build_ready_state BEFORE UPDATE OF state ON NodeEnvironmentBuilds WHEN OLD.state='READY' AND NEW.state NOT IN ('READY','DELETING') BEGIN SELECT RAISE(ABORT,'NODE_BUILD_IMMUTABLE'); END"
    },
    {
      "name": "node_build_snapshot_immutable",
      "sql": "CREATE TRIGGER node_build_snapshot_immutable BEFORE UPDATE OF package_json,lockfile,lock_hash,resolved,resolved_hash,metadata ON NodeEnvironmentBuilds WHEN OLD.lock_hash IS NOT NULL BEGIN SELECT RAISE(ABORT,'NODE_BUILD_IMMUTABLE'); END"
    },
    {
      "name": "node_revision_dependencies_unique",
      "sql": "CREATE TRIGGER node_revision_dependencies_unique BEFORE INSERT ON NodeEnvironmentRevisions WHEN EXISTS(SELECT 1 FROM json_each(NEW.dependencies) GROUP BY json_extract(value,'$.name') HAVING count(*)>1) BEGIN SELECT RAISE(ABORT,'NODE_DEPENDENCY_DUPLICATE'); END"
    },
    {
      "name": "node_revision_immutable",
      "sql": "CREATE TRIGGER node_revision_immutable BEFORE UPDATE ON NodeEnvironmentRevisions BEGIN SELECT RAISE(ABORT,'NODE_REVISION_IMMUTABLE'); END"
    },
    {
      "name": "node_toolchain_identity_immutable",
      "sql": "CREATE TRIGGER node_toolchain_identity_immutable BEFORE UPDATE OF runtime_id,manager_type,version ON NodePackageManagerToolchains BEGIN SELECT RAISE(ABORT,'NODE_TOOLCHAIN_IMMUTABLE'); END"
    },
    {
      "name": "node_toolchain_runtime_insert",
      "sql": "CREATE TRIGGER node_toolchain_runtime_insert BEFORE INSERT ON NodePackageManagerToolchains WHEN NOT EXISTS(SELECT 1 FROM RuntimeInstallations WHERE id=NEW.runtime_id AND language='NODE' AND implementation='NODEJS') BEGIN SELECT RAISE(ABORT,'NODE_RUNTIME_REQUIRED'); END"
    },
    {
      "name": "python_environment_build_identity_immutable",
      "sql": "CREATE TRIGGER python_environment_build_identity_immutable BEFORE UPDATE OF environment_id,revision_id,runtime_id ON PythonEnvironmentBuilds BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_BUILD_IMMUTABLE'); END"
    },
    {
      "name": "python_environment_build_ready_immutable",
      "sql": "CREATE TRIGGER python_environment_build_ready_immutable BEFORE UPDATE OF resolved,resolved_hash,freeze,metadata ON PythonEnvironmentBuilds WHEN OLD.resolved_hash IS NOT NULL BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_BUILD_IMMUTABLE'); END"
    },
    {
      "name": "python_environment_build_ready_state",
      "sql": "CREATE TRIGGER python_environment_build_ready_state BEFORE UPDATE OF state ON PythonEnvironmentBuilds WHEN OLD.state='READY' AND NEW.state NOT IN ('READY','DELETING') BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_BUILD_IMMUTABLE'); END"
    },
    {
      "name": "python_environment_revision_immutable",
      "sql": "CREATE TRIGGER python_environment_revision_immutable BEFORE UPDATE ON PythonEnvironmentRevisions BEGIN SELECT RAISE(ABORT,'PYTHON_ENV_REVISION_IMMUTABLE'); END"
    },
    {
      "name": "runtime_default_owner_insert",
      "sql": "CREATE TRIGGER runtime_default_owner_insert BEFORE INSERT ON RuntimeDefaults WHEN (NEW.repository_id IS NULL)=(NEW.subscription_id IS NULL) OR NEW.kind NOT IN ('PYTHON','NODE') OR (NEW.kind='PYTHON' AND NEW.python_environment_id IS NULL) OR (NEW.kind='NODE' AND NEW.node_environment_id IS NULL) BEGIN SELECT RAISE(ABORT,'RUNTIME_DEFAULT_INVALID'); END"
    },
    {
      "name": "runtime_default_owner_update",
      "sql": "CREATE TRIGGER runtime_default_owner_update BEFORE UPDATE ON RuntimeDefaults WHEN (NEW.repository_id IS NULL)=(NEW.subscription_id IS NULL) OR NEW.kind NOT IN ('PYTHON','NODE') OR (NEW.kind='PYTHON' AND NEW.python_environment_id IS NULL) OR (NEW.kind='NODE' AND NEW.node_environment_id IS NULL) BEGIN SELECT RAISE(ABORT,'RUNTIME_DEFAULT_INVALID'); END"
    },
    {
      "name": "runtime_installation_identity_immutable",
      "sql": "CREATE TRIGGER runtime_installation_identity_immutable BEFORE UPDATE OF provider_id,language,implementation,version ON RuntimeInstallations BEGIN SELECT RAISE(ABORT,'RUNTIME_IDENTITY_IMMUTABLE'); END"
    },
    {
      "name": "runtime_installation_language_insert",
      "sql": "CREATE TRIGGER runtime_installation_language_insert BEFORE INSERT ON RuntimeInstallations WHEN NOT EXISTS(SELECT 1 FROM RuntimeProviders WHERE id=NEW.provider_id AND language=NEW.language) OR NOT ((NEW.language='PYTHON' AND NEW.implementation='CPYTHON') OR (NEW.language='NODE' AND NEW.implementation='NODEJS')) BEGIN SELECT RAISE(ABORT,'RUNTIME_PROVIDER_INVALID'); END"
    },
    {
      "name": "runtime_provider_identity_immutable",
      "sql": "CREATE TRIGGER runtime_provider_identity_immutable BEFORE UPDATE OF language,provider_type ON RuntimeProviders BEGIN SELECT RAISE(ABORT,'RUNTIME_IDENTITY_IMMUTABLE'); END"
    },
    {
      "name": "runtime_provider_language_pair_insert",
      "sql": "CREATE TRIGGER runtime_provider_language_pair_insert BEFORE INSERT ON RuntimeProviders WHEN NOT ((NEW.language='PYTHON' AND NEW.provider_type='PYENV') OR (NEW.language='NODE' AND NEW.provider_type='NODE_DISTRIBUTION')) BEGIN SELECT RAISE(ABORT,'RUNTIME_PROVIDER_INVALID'); END"
    },
    {
      "name": "task_active_run_delete_guard",
      "sql": "CREATE TRIGGER task_active_run_delete_guard BEFORE DELETE ON Tasks WHEN EXISTS(SELECT 1 FROM TaskRuns WHERE task_id=OLD.id AND status IN ('QUEUED','RESOLVING','RUNNING','RECOVERY_REQUIRED')) BEGIN SELECT RAISE(ABORT,'TASK_ACTIVE_RUN'); END"
    },
    {
      "name": "task_attempt_number_insert",
      "sql": "CREATE TRIGGER task_attempt_number_insert BEFORE INSERT ON TaskRunAttempts WHEN NEW.attempt_number<1 OR NEW.duration_ms<0 BEGIN SELECT RAISE(ABORT,'TASK_ATTEMPT_FIELDS_INVALID'); END"
    },
    {
      "name": "task_attempt_number_update",
      "sql": "CREATE TRIGGER task_attempt_number_update BEFORE UPDATE ON TaskRunAttempts WHEN NEW.attempt_number<1 OR NEW.duration_ms<0 BEGIN SELECT RAISE(ABORT,'TASK_ATTEMPT_FIELDS_INVALID'); END"
    },
    {
      "name": "task_identity_insert",
      "sql": "CREATE TRIGGER task_identity_insert BEFORE INSERT ON Tasks WHEN NEW.origin NOT IN ('MANUAL','DISCOVERED') OR (NEW.origin='MANUAL' AND (NEW.subscription_id IS NOT NULL OR NEW.discovery_key IS NOT NULL)) OR (NEW.origin='DISCOVERED' AND (NEW.subscription_id IS NULL OR NEW.discovery_key IS NULL)) BEGIN SELECT RAISE(ABORT,'TASK_IDENTITY_INVALID'); END"
    },
    {
      "name": "task_identity_update",
      "sql": "CREATE TRIGGER task_identity_update BEFORE UPDATE OF origin,subscription_id,discovery_key ON Tasks WHEN NEW.origin IS NOT OLD.origin OR NEW.subscription_id IS NOT OLD.subscription_id OR NEW.discovery_key IS NOT OLD.discovery_key BEGIN SELECT RAISE(ABORT,'TASK_IDENTITY_IMMUTABLE'); END"
    },
    {
      "name": "task_run_event_identity_insert",
      "sql": "CREATE TRIGGER task_run_event_identity_insert BEFORE INSERT ON TaskRuns WHEN NEW.event_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM TriggerEvents e WHERE e.id=NEW.event_id AND e.task_id=NEW.task_id AND e.trigger_id IS NEW.trigger_id AND e.trigger_type=NEW.trigger_type AND NEW.submission_key='event:'||e.id) BEGIN SELECT RAISE(ABORT,'TASK_RUN_EVENT_IDENTITY_INVALID'); END"
    },
    {
      "name": "task_run_fields_insert",
      "sql": "CREATE TRIGGER task_run_fields_insert BEFORE INSERT ON TaskRuns WHEN NEW.attempt_count<0 OR NEW.cancel_requested NOT IN (0,1) OR NEW.trigger_type NOT IN ('MANUAL','SCHEDULE','API','INTERNAL','CRON','WEBHOOK','GIT_UPDATE') OR NEW.concurrency_policy NOT IN ('FORBID','QUEUE','ALLOW') OR (NEW.task_id IS NULL AND NEW.status IN ('QUEUED','RESOLVING','RUNNING')) BEGIN SELECT RAISE(ABORT,'TASK_RUN_FIELDS_INVALID'); END"
    },
    {
      "name": "task_run_fields_update",
      "sql": "CREATE TRIGGER task_run_fields_update BEFORE UPDATE ON TaskRuns WHEN NEW.attempt_count<0 OR NEW.cancel_requested NOT IN (0,1) OR NEW.trigger_type NOT IN ('MANUAL','SCHEDULE','API','INTERNAL','CRON','WEBHOOK','GIT_UPDATE') OR NEW.concurrency_policy NOT IN ('FORBID','QUEUE','ALLOW') OR (NEW.task_id IS NULL AND NEW.status IN ('QUEUED','RESOLVING','RUNNING')) BEGIN SELECT RAISE(ABORT,'TASK_RUN_FIELDS_INVALID'); END"
    },
    {
      "name": "task_source_available_insert",
      "sql": "CREATE TRIGGER task_source_available_insert BEFORE INSERT ON TaskSources WHEN EXISTS(SELECT 1 FROM Worktrees WHERE id=NEW.worktree_id AND lifecycle_state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_DELETING'); END"
    },
    {
      "name": "task_source_available_update",
      "sql": "CREATE TRIGGER task_source_available_update BEFORE UPDATE ON TaskSources WHEN EXISTS(SELECT 1 FROM Worktrees WHERE id=NEW.worktree_id AND lifecycle_state='DELETING') BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_DELETING'); END"
    },
    {
      "name": "task_source_owner_insert",
      "sql": "CREATE TRIGGER task_source_owner_insert BEFORE INSERT ON TaskSources WHEN EXISTS(SELECT 1 FROM Tasks t JOIN Subscriptions s ON s.id=t.subscription_id WHERE t.id=NEW.task_id AND s.worktree_id IS NOT NEW.worktree_id) BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_OWNER_MISMATCH'); END"
    },
    {
      "name": "task_source_owner_update",
      "sql": "CREATE TRIGGER task_source_owner_update BEFORE UPDATE ON TaskSources WHEN EXISTS(SELECT 1 FROM Tasks t JOIN Subscriptions s ON s.id=t.subscription_id WHERE t.id=NEW.task_id AND s.worktree_id IS NOT NEW.worktree_id) BEGIN SELECT RAISE(ABORT,'TASK_WORKTREE_OWNER_MISMATCH'); END"
    },
    {
      "name": "task_trigger_fields_insert",
      "sql": "CREATE TRIGGER task_trigger_fields_insert BEFORE INSERT ON TaskTriggers WHEN NEW.type NOT IN ('CRON','WEBHOOK','GIT_UPDATE') OR NEW.origin NOT IN ('USER','DISCOVERY') OR NEW.enabled NOT IN (0,1) OR NEW.version<1 BEGIN SELECT RAISE(ABORT,'TRIGGER_FIELDS_INVALID'); END"
    },
    {
      "name": "task_trigger_fields_update",
      "sql": "CREATE TRIGGER task_trigger_fields_update BEFORE UPDATE ON TaskTriggers WHEN NEW.type NOT IN ('CRON','WEBHOOK','GIT_UPDATE') OR NEW.origin NOT IN ('USER','DISCOVERY') OR NEW.enabled NOT IN (0,1) OR NEW.version<1 BEGIN SELECT RAISE(ABORT,'TRIGGER_FIELDS_INVALID'); END"
    },
    {
      "name": "task_trigger_identity_update",
      "sql": "CREATE TRIGGER task_trigger_identity_update BEFORE UPDATE ON TaskTriggers WHEN NEW.task_id IS NOT OLD.task_id OR NEW.type IS NOT OLD.type OR NEW.discovery_key IS NOT OLD.discovery_key OR (OLD.origin='USER' AND NEW.origin<>'USER') BEGIN SELECT RAISE(ABORT,'TRIGGER_IDENTITY_IMMUTABLE'); END"
    },
    {
      "name": "trigger_event_fields_insert",
      "sql": "CREATE TRIGGER trigger_event_fields_insert BEFORE INSERT ON TriggerEvents WHEN NEW.status NOT IN ('RECEIVED','PROCESSING','SUBMITTED','SKIPPED','FAILED') OR NEW.trigger_type NOT IN ('CRON','WEBHOOK','GIT_UPDATE') BEGIN SELECT RAISE(ABORT,'TRIGGER_EVENT_INVALID'); END"
    },
    {
      "name": "trigger_event_fields_update",
      "sql": "CREATE TRIGGER trigger_event_fields_update BEFORE UPDATE ON TriggerEvents WHEN NEW.status NOT IN ('RECEIVED','PROCESSING','SUBMITTED','SKIPPED','FAILED') OR NEW.trigger_type NOT IN ('CRON','WEBHOOK','GIT_UPDATE') BEGIN SELECT RAISE(ABORT,'TRIGGER_EVENT_INVALID'); END"
    },
    {
      "name": "webhook_trigger_fields_insert",
      "sql": "CREATE TRIGGER webhook_trigger_fields_insert BEFORE INSERT ON WebhookTriggers WHEN length(NEW.secret_hash)<>64 OR NEW.secret_hash GLOB '*[^0-9a-f]*' OR length(NEW.public_id)<>36 BEGIN SELECT RAISE(ABORT,'WEBHOOK_FIELDS_INVALID'); END"
    },
    {
      "name": "webhook_trigger_fields_update",
      "sql": "CREATE TRIGGER webhook_trigger_fields_update BEFORE UPDATE ON WebhookTriggers WHEN length(NEW.secret_hash)<>64 OR NEW.secret_hash GLOB '*[^0-9a-f]*' OR length(NEW.public_id)<>36 BEGIN SELECT RAISE(ABORT,'WEBHOOK_FIELDS_INVALID'); END"
    },
    {
      "name": "worktree_execution_reference_guard",
      "sql": "CREATE TRIGGER worktree_execution_reference_guard BEFORE UPDATE OF lifecycle_state ON Worktrees WHEN NEW.lifecycle_state='DELETING' AND EXISTS(SELECT 1 FROM TaskRuns WHERE worktree_id=NEW.id AND status IN ('RESOLVING','RUNNING','RECOVERY_REQUIRED')) BEGIN SELECT RAISE(ABORT,'WORKTREE_EXECUTION_REFERENCED'); END"
    },
    {
      "name": "worktree_task_reference_guard",
      "sql": "CREATE TRIGGER worktree_task_reference_guard BEFORE UPDATE OF lifecycle_state ON Worktrees WHEN NEW.lifecycle_state='DELETING' AND EXISTS(SELECT 1 FROM TaskSources WHERE worktree_id=NEW.id) BEGIN SELECT RAISE(ABORT,'WORKTREE_TASK_REFERENCED'); END"
    }
  ]
};
