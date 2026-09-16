// Frozen Phase 6 schema. Never regenerate from later models.
export default {
  "source_commit": "1eafedc7cb5cb48df0ccb9969293d668155c0169",
  "metadata": {
    "platform_schema_version": 3,
    "model_signature": "c83d072e7f1bbff93669dfa1114ac6ad8b0cd4bd0b5a9c61256b6432ba263204",
    "schema_signature": "52f0f56ac70877e35d69af0c104e3ac38e4fd3a3cc3819976ad89e3c58cd55b1"
  },
  "objects": [
    {
      "name": "config_asset_revisions_asset_id_revision_number",
      "sql": "CREATE UNIQUE INDEX `config_asset_revisions_asset_id_revision_number` ON `ConfigAssetRevisions` (`asset_id`, `revision_number`)"
    },
    {
      "name": "crontab_stats_date",
      "sql": "CREATE INDEX `crontab_stats_date` ON `CrontabStats` (`date`)"
    },
    {
      "name": "crontab_stats_ref_id_date",
      "sql": "CREATE UNIQUE INDEX `crontab_stats_ref_id_date` ON `CrontabStats` (`ref_id`, `date`)"
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
      "name": "task_env_variables_cron_id_name",
      "sql": "CREATE UNIQUE INDEX `task_env_variables_cron_id_name` ON `TaskEnvVariables` (`cron_id`, `name`)"
    },
    {
      "name": "task_hooks_task_id_phase_position",
      "sql": "CREATE UNIQUE INDEX `task_hooks_task_id_phase_position` ON `TaskHooks` (`task_id`, `phase`, `position`)"
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
      "name": "CrontabStats",
      "sql": "CREATE TABLE `CrontabStats` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `ref_id` NUMBER NOT NULL, `date` VARCHAR(255) NOT NULL, `run_count` NUMBER DEFAULT 0, `success_count` NUMBER DEFAULT 0, `fail_count` NUMBER DEFAULT 0, `total_time` NUMBER DEFAULT 0, `max_time` NUMBER DEFAULT 0, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "CrontabViews",
      "sql": "CREATE TABLE `CrontabViews` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255), `position` NUMBER, `isDisabled` NUMBER, `filters` JSON, `sorts` JSON, `filterRelation` VARCHAR(255), `type` NUMBER, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, UNIQUE (`name`))"
    },
    {
      "name": "Crontabs",
      "sql": "CREATE TABLE `Crontabs` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255), `command` VARCHAR(255), `schedule` VARCHAR(255), `timestamp` VARCHAR(255), `saved` TINYINT(1), `status` NUMBER, `isSystem` NUMBER, `pid` NUMBER, `isDisabled` NUMBER, `isPinned` NUMBER, `log_path` VARCHAR(255), `queued_token` VARCHAR(255), `labels` JSON, `last_running_time` NUMBER, `last_execution_time` NUMBER, `sub_id` NUMBER, `discovery_key` VARCHAR(255), `source_relative_path` VARCHAR(255), `discovery_definition` JSON, `env_profile_id` INTEGER REFERENCES `EnvironmentProfiles` (`id`) ON DELETE RESTRICT, `extra_schedules` JSON, `log_name` VARCHAR(255), `allow_multiple_instances` NUMBER, `work_dir` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL, UNIQUE (`sub_id`, `discovery_key`))"
    },
    {
      "name": "Dependences",
      "sql": "CREATE TABLE `Dependences` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255), `type` NUMBER, `timestamp` VARCHAR(255), `status` NUMBER, `log` JSON, `remark` VARCHAR(255), `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
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
      "name": "PlatformMetadata",
      "sql": "CREATE TABLE PlatformMetadata (platform_schema_version INTEGER NOT NULL PRIMARY KEY CHECK(platform_schema_version = 3), model_signature TEXT NOT NULL, schema_signature TEXT NOT NULL)"
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
      "sql": "CREATE TABLE `RunningInstances` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `cron_id` NUMBER NOT NULL, `pid` NUMBER, `log_path` VARCHAR(255), `started_at` NUMBER NOT NULL, `finished_at` NUMBER, `status` NUMBER NOT NULL DEFAULT 0, `exit_code` NUMBER, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeInstallations",
      "sql": "CREATE TABLE RuntimeInstallations (\n id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES RuntimeProviders(id) ON DELETE RESTRICT,\n language VARCHAR(255) NOT NULL CHECK(language='PYTHON'), implementation VARCHAR(255) NOT NULL CHECK(implementation='CPYTHON'),\n version VARCHAR(255) NOT NULL, state VARCHAR(255) NOT NULL CHECK(state IN ('INSTALLING','READY','VERIFYING','ERROR','REMOVING','MISSING','REMOVED')),\n executable_relative_path VARCHAR(255) NOT NULL, installed_at DATETIME, verified_at DATETIME, metadata JSON NOT NULL DEFAULT '{}',\n last_error VARCHAR(255), createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeOperations",
      "sql": "CREATE TABLE RuntimeOperations (\n id INTEGER PRIMARY KEY AUTOINCREMENT, provider_id INTEGER NOT NULL REFERENCES RuntimeProviders(id) ON DELETE RESTRICT,\n runtime_id INTEGER REFERENCES RuntimeInstallations(id) ON DELETE RESTRICT,\n operation_type VARCHAR(255) NOT NULL CHECK(operation_type IN ('PROVIDER_INSTALL','PROVIDER_UPDATE','PROVIDER_VERIFY','PROVIDER_REPAIR','CATALOG_REFRESH','RUNTIME_INSTALL','RUNTIME_VERIFY','RUNTIME_REMOVE','RUNTIME_REPAIR')),\n status VARCHAR(255) NOT NULL CHECK(status IN ('QUEUED','RUNNING','SUCCESS','FAILED','CANCELLED','INTERRUPTED')),\n stage VARCHAR(255) NOT NULL, owner_token VARCHAR(255) NOT NULL, owner_pid INTEGER NOT NULL,\n cancel_requested TINYINT(1) NOT NULL DEFAULT 0 CHECK(cancel_requested IN (0,1)), started_at DATETIME, finished_at DATETIME, exit_code INTEGER,\n log_identity VARCHAR(255) NOT NULL UNIQUE, error_code VARCHAR(255), error_summary VARCHAR(255), metadata JSON NOT NULL DEFAULT '{}',\n createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    },
    {
      "name": "RuntimeProviders",
      "sql": "CREATE TABLE RuntimeProviders (\n id INTEGER PRIMARY KEY AUTOINCREMENT, language VARCHAR(255) NOT NULL CHECK(language='PYTHON'),\n provider_type VARCHAR(255) NOT NULL CHECK(provider_type='PYENV'),\n state VARCHAR(255) NOT NULL CHECK(state IN ('UNINITIALIZED','INSTALLING','READY','UPDATING','ERROR','MISSING')),\n provider_version VARCHAR(255), provider_revision VARCHAR(255), install_root VARCHAR(255) NOT NULL,\n catalog JSON NOT NULL DEFAULT '[]', last_refresh_at DATETIME, last_verified_at DATETIME, last_error VARCHAR(255),\n version INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL, updatedAt DATETIME NOT NULL)"
    },
    {
      "name": "Subscriptions",
      "sql": "CREATE TABLE `Subscriptions` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `env_profile_id` INTEGER REFERENCES `EnvironmentProfiles` (`id`) ON DELETE RESTRICT, `repository_id` INTEGER NOT NULL REFERENCES `Repositories` (`id`) ON DELETE RESTRICT, `worktree_id` INTEGER REFERENCES `Worktrees` (`id`) ON DELETE RESTRICT, `last_synced_commit` VARCHAR(255), `last_sync_at` DATETIME, `last_sync_state` VARCHAR(255), `last_sync_phase` VARCHAR(255), `last_sync_error` TEXT, `name` VARCHAR(255), `schedule` VARCHAR(255), `interval_schedule` JSON, `whitelist` VARCHAR(255), `blacklist` VARCHAR(255), `status` NUMBER, `dependences` VARCHAR(255), `extensions` VARCHAR(255), `branch` VARCHAR(255), `pid` NUMBER, `is_disabled` NUMBER, `log_path` VARCHAR(255), `schedule_type` VARCHAR(255), `autoAddCron` NUMBER, `autoDelCron` NUMBER, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskConfigBindings",
      "sql": "CREATE TABLE `TaskConfigBindings` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` INTEGER NOT NULL REFERENCES `Crontabs` (`id`) ON DELETE CASCADE, `asset_id` INTEGER REFERENCES `ConfigAssets` (`id`) ON DELETE RESTRICT, `operation` VARCHAR(255) NOT NULL DEFAULT 'ATTACH', `target_base` VARCHAR(255) NOT NULL, `target_path` VARCHAR(255) NOT NULL, `materialization_mode` VARCHAR(255) NOT NULL DEFAULT 'COPY', `conflict_policy` VARCHAR(255) NOT NULL DEFAULT 'FAIL_IF_EXISTS', `writable` TINYINT(1) NOT NULL DEFAULT 0, `enabled` TINYINT(1) NOT NULL DEFAULT 1, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskEnvVariables",
      "sql": "CREATE TABLE `TaskEnvVariables` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `name` VARCHAR(255) NOT NULL, `value` TEXT, `status` VARCHAR(255) NOT NULL DEFAULT 'enabled', `operation` VARCHAR(255) NOT NULL DEFAULT 'SET', `is_secret` TINYINT(1) NOT NULL DEFAULT 0, `position` FLOAT DEFAULT '0', `labels` JSON DEFAULT '[]', `cron_id` INTEGER NOT NULL REFERENCES `Crontabs` (`id`) ON DELETE CASCADE, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "TaskHooks",
      "sql": "CREATE TABLE `TaskHooks` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `task_id` INTEGER NOT NULL REFERENCES `Crontabs` (`id`) ON DELETE CASCADE, `name` VARCHAR(255) NOT NULL, `phase` VARCHAR(255) NOT NULL, `command` TEXT NOT NULL, `cwd_base` VARCHAR(255) NOT NULL DEFAULT 'TASK_CWD', `position` INTEGER NOT NULL, `timeout_seconds` INTEGER NOT NULL DEFAULT 60, `failure_policy` VARCHAR(255) NOT NULL, `enabled` TINYINT(1) NOT NULL DEFAULT 1, `version` INTEGER NOT NULL DEFAULT 1, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    },
    {
      "name": "Worktrees",
      "sql": "CREATE TABLE `Worktrees` (`id` INTEGER PRIMARY KEY AUTOINCREMENT, `repository_id` INTEGER NOT NULL REFERENCES `Repositories` (`id`) ON DELETE RESTRICT, `name` VARCHAR(255) NOT NULL, `ref_type` VARCHAR(255) NOT NULL, `ref_name` VARCHAR(255) NOT NULL, `branch` VARCHAR(255), `branch_key` VARCHAR(255) UNIQUE, `commit` VARCHAR(255), `target_commit` VARCHAR(255), `local_path` TEXT, `lifecycle_state` VARCHAR(255) DEFAULT 'CREATING', `dirty_state` VARCHAR(255) DEFAULT 'UNKNOWN', `purpose` VARCHAR(255) NOT NULL DEFAULT 'USER', `managed` TINYINT(1) DEFAULT 1, `status_snapshot` JSON, `last_update_at` DATETIME, `last_error` TEXT, `createdAt` DATETIME NOT NULL, `updatedAt` DATETIME NOT NULL)"
    }
  ]
};
