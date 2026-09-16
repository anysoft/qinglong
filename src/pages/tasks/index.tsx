import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import { TaskEnvironment } from '@/components/scoped-environment';
import { ConfigBindings } from '@/components/config-bindings';
import { TaskHooks } from '@/components/task-hooks';
const api = config.apiPrefix;
const kindOf = (language: string) =>
  language === 'PYTHON' ? 'PYTHON' : language === 'SHELL' ? 'SHELL' : 'NODE';
const languageOf = (entry: string) =>
  entry.endsWith('.py')
    ? 'PYTHON'
    : entry.endsWith('.sh')
    ? 'SHELL'
    : entry.endsWith('.ts')
    ? 'TYPESCRIPT'
    : 'JAVASCRIPT';
async function get(resource: string) {
  const response = await request.get(api + resource);
  if (response.code !== 200) throw Error(response.message);
  return response.data;
}
function RuntimeDefaults({
  repositoryId,
  subscriptionId,
  kind,
  environments,
  onChange,
}: {
  repositoryId?: number;
  subscriptionId?: number;
  kind: string;
  environments: any[];
  onChange: () => void;
}) {
  const [rows, setRows] = useState<Record<string, any>>({}),
    [values, setValues] = useState<Record<string, number | null>>({});
  const scopes = [
    { name: 'Repository', resource: 'repositories', id: repositoryId },
    ...(subscriptionId
      ? [
          {
            name: 'Subscription',
            resource: 'subscriptions',
            id: subscriptionId,
          },
        ]
      : []),
  ];
  const load = async () => {
    const result: Record<string, any> = {};
    for (const scope of scopes)
      if (scope.id)
        result[scope.name] = (
          await get(`${scope.resource}/${scope.id}/runtime-defaults`)
        ).find((row: any) => row.kind === kind);
    setRows(result);
    setValues(
      Object.fromEntries(
        Object.entries(result).map(([key, row]) => [
          key,
          (kind === 'PYTHON'
            ? row?.python_environment_id
            : row?.node_environment_id) ?? null,
        ]),
      ),
    );
  };
  useEffect(() => {
    load().catch(() => {});
  }, [repositoryId, subscriptionId, kind]);
  if (kind === 'SHELL') return null;
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {scopes
        .filter((s) => s.id)
        .map((scope) => (
          <Card
            size="small"
            key={scope.name}
            title={`${scope.name} Runtime Default`}
          >
            <Space>
              <Select
                aria-label={`${scope.name} Runtime Default`}
                style={{ minWidth: 220 }}
                value={values[scope.name] ?? null}
                onChange={(value) =>
                  setValues((old) => ({ ...old, [scope.name]: value }))
                }
                options={[
                  { value: null, label: 'Unset / inherit' },
                  ...environments.map((env) => ({
                    value: env.id,
                    label: env.name,
                  })),
                ]}
              />
              <Button
                onClick={async () => {
                  const response = await request.put(
                    api + `${scope.resource}/${scope.id}/runtime-defaults`,
                    {
                      kind,
                      environment_id: values[scope.name] ?? null,
                      expected_version: rows[scope.name]?.version ?? 0,
                    },
                  );
                  if (response.code === 200) {
                    await load();
                    onChange();
                    message.success('Runtime default saved');
                  }
                }}
              >
                Save {scope.name} Default
              </Button>
            </Space>
          </Card>
        ))}
    </Space>
  );
}
export default function TasksPage() {
  const [rows, setRows] = useState<any[]>([]),
    [worktrees, setWorktrees] = useState<any[]>([]),
    [python, setPython] = useState<any[]>([]),
    [node, setNode] = useState<any[]>([]),
    [entries, setEntries] = useState<string[]>([]);
  const [selected, setSelected] = useState<any>(),
    [open, setOpen] = useState(false),
    [busy, setBusy] = useState(false),
    [tab, setTab] = useState('general'),
    [preview, setPreview] = useState<any>(),
    [log, setLog] = useState<string>(),
    [runs, setRuns] = useState<any[]>(),
    [runTask, setRunTask] = useState<number>();
  const [form] = Form.useForm();
  const worktreeId = Form.useWatch('worktree_id', form),
    language = Form.useWatch('language', form) ?? 'SHELL',
    cwdMode = Form.useWatch('cwd_mode', form),
    environmentId = Form.useWatch('environment_id', form);
  const kind = kindOf(language),
    environments = kind === 'PYTHON' ? python : node,
    worktree = worktrees.find((row) => row.id === worktreeId);
  const load = async () => {
    const [tasks, trees, py, js] = await Promise.all([
      get('tasks?size=1000'),
      get('worktrees'),
      get('runtime/python/environments'),
      get('runtime/node/environments'),
    ]);
    setRows(tasks.data);
    setWorktrees(trees);
    setPython(py);
    setNode(js);
  };
  useEffect(() => {
    load()
      .then(() => {
        const id = Number(
          new URLSearchParams(window.location.search).get('task_id'),
        );
        if (id > 0) return edit(id);
      })
      .catch(() => {});
  }, []);
  useEffect(() => {
    if (worktreeId)
      get(`task-sources/${worktreeId}/entries`)
        .then(setEntries)
        .catch(() => setEntries([]));
    else setEntries([]);
  }, [worktreeId]);
  const edit = async (id?: number) => {
    const task = id ? await get(`tasks/${id}`) : null;
    setSelected(task);
    setPreview(task?.resources);
    setTab('general');
    form.resetFields();
    form.setFieldsValue({
      name: task?.name,
      description: task?.description ?? '',
      enabled: task?.enabled ?? false,
      worktree_id: task?.source?.worktree_id,
      relative_entrypoint: task?.source?.relative_entrypoint,
      language: task?.source?.language ?? 'SHELL',
      cwd_mode: task?.source?.cwd_mode ?? 'ENTRYPOINT_DIR',
      cwd_relative_path: task?.source?.cwd_relative_path,
      environment_id:
        task?.runtime?.python_environment_id ??
        task?.runtime?.node_environment_id ??
        null,
      arguments_json: JSON.stringify(task?.arguments ?? [], null, 2),
      schedule: task?.schedule ?? '',
      timeout_seconds: task?.settings?.timeout_seconds ?? null,
      max_attempts: task?.settings?.max_attempts ?? 1,
      initial_delay_seconds: task?.settings?.initial_delay_seconds ?? 0,
      backoff: task?.settings?.backoff ?? 'FIXED',
      concurrency: task?.settings?.concurrency ?? 'FORBID',
      notification: task?.settings?.notification ?? 'NONE',
    });
    setOpen(true);
  };
  const save = async () => {
    setBusy(true);
    try {
      const value = await form.validateFields();
      let args;
      try {
        args = JSON.parse(value.arguments_json);
        if (
          !Array.isArray(args) ||
          args.some((arg: unknown) => typeof arg !== 'string')
        )
          throw Error();
      } catch {
        message.error('Arguments must be a JSON array of strings');
        return;
      }
      const body = {
        name: value.name,
        description: value.description,
        enabled: value.enabled,
        arguments: args,
        schedule: value.schedule || null,
        expected_version: selected?.version,
        source: {
          type: 'WORKTREE_ENTRYPOINT',
          worktree_id: value.worktree_id,
          relative_entrypoint: value.relative_entrypoint,
          language: value.language,
          cwd_mode: value.cwd_mode,
          cwd_relative_path:
            value.cwd_mode === 'CUSTOM_RELATIVE'
              ? value.cwd_relative_path
              : null,
        },
        runtime: {
          kind,
          python_environment_id:
            kind === 'PYTHON' ? value.environment_id ?? null : null,
          node_environment_id:
            kind === 'NODE' ? value.environment_id ?? null : null,
        },
        settings: {
          timeout_seconds: value.timeout_seconds ?? null,
          max_attempts: value.max_attempts,
          initial_delay_seconds: value.initial_delay_seconds,
          backoff: value.backoff,
          concurrency: value.concurrency,
          notification: value.notification,
        },
      };
      const response = selected
        ? await request.put(api + `tasks/${selected.id}`, body)
        : await request.post(api + 'tasks', body);
      if (response.code === 200) {
        setSelected(response.data);
        setPreview(response.data.resources);
        await load();
        message.success('Task saved');
      }
    } finally {
      setBusy(false);
    }
  };
  const validate = async (id: number) => {
    const response = await request.post(api + `tasks/${id}/validate`);
    if (response.code === 200) {
      setPreview(response.data);
      if (!open)
        Modal.info({
          title: 'Task readiness',
          content: (
            <pre style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(response.data.readiness, null, 2)}
            </pre>
          ),
        });
      await load();
    }
  };
  const inherited = () =>
    selected && get(`tasks/${selected.id}/resources`).then(setPreview);
  const resourceTabs = selected
    ? [
        {
          key: 'environment',
          label: 'ENV',
          children: <TaskEnvironment id={selected.id} />,
        },
        {
          key: 'config',
          label: 'Config',
          children: <ConfigBindings scope="task" id={selected.id} />,
        },
        {
          key: 'hooks',
          label: 'Hooks',
          children: <TaskHooks id={selected.id} />,
        },
      ]
    : ['ENV', 'Config', 'Hooks'].map((label) => ({
        key: label.toLowerCase(),
        label,
        children: <Alert message="先保存 Task，再配置这些独立提交的资源。" />,
      }));
  return (
    <div style={{ padding: 24 }}>
      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Space>
          <Typography.Title level={2} style={{ margin: 0 }}>
            Tasks
          </Typography.Title>
          <Button type="primary" onClick={() => edit()}>
            Create Task
          </Button>
          <Button onClick={load}>Refresh</Button>
        </Space>
        <Alert
          type="info"
          showIcon
          message="Configured Resources"
          description="任务直接执行 Worktree 中的文件。每次运行固定所选 Environment Build、环境变量、Config 和 Hooks；Arguments 按独立参数传入。"
        />
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 20 }}
          scroll={{ x: 1100 }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              render: (name: string, task: any) => (
                <Button type="link" onClick={() => edit(task.id)}>
                  {name}
                </Button>
              ),
            },
            {
              title: 'Source',
              render: (_: unknown, task: any) =>
                task.resources?.source?.relative_entrypoint ??
                'Source required',
            },
            {
              title: 'Runtime',
              render: (_: unknown, task: any) => (
                <span>
                  {task.resources?.runtime?.kind ?? 'Unbound'} ·{' '}
                  {task.resources?.runtime?.environment_id ?? '—'}
                  <br />
                  {task.resources?.runtime?.selected_by}
                </span>
              ),
            },
            { title: 'Schedule', dataIndex: 'schedule' },
            {
              title: 'Last run',
              render: (_: unknown, task: any) =>
                task.last_run
                  ? `${task.last_run.status} · #${task.last_run.id} · ${task.last_run.attempt_count} attempt(s)`
                  : 'No runs',
            },
            {
              title: 'Readiness',
              render: (_: unknown, task: any) => (
                <Tag
                  color={
                    task.resources?.readiness?.status === 'READY'
                      ? 'green'
                      : 'orange'
                  }
                >
                  {task.resources?.readiness?.status}
                </Tag>
              ),
            },
            {
              title: 'Enabled',
              render: (_: unknown, task: any) => (
                <Switch
                  checked={task.enabled}
                  onChange={async (enabled) => {
                    const response = await request.put(
                      api + `tasks/${task.id}/enabled`,
                      { enabled, expected_version: task.version },
                    );
                    if (response.code === 200) await load();
                  }}
                />
              ),
            },
            {
              title: 'Actions',
              render: (_: unknown, task: any) => (
                <Space wrap>
                  <Button onClick={() => validate(task.id)}>Validate</Button>
                  <Button
                    onClick={async () => {
                      const response = await request.post(
                        api + `tasks/${task.id}/clone`,
                        { name: task.name + ' copy' },
                      );
                      if (response.code === 200) {
                        await load();
                        await edit(response.data.id);
                      }
                    }}
                  >
                    Clone
                  </Button>
                  <Button
                    onClick={async () => {
                      await request.post(api + `tasks/${task.id}/run`);
                      await load();
                    }}
                  >
                    Run
                  </Button>
                  <Button
                    onClick={async () => {
                      setRunTask(task.id);
                      setRuns(await get(`tasks/${task.id}/runs`));
                    }}
                  >
                    Runs
                  </Button>
                  <Button
                    onClick={async () => {
                      await request.post(api + `tasks/${task.id}/stop`);
                      await load();
                    }}
                  >
                    Stop
                  </Button>
                  <Button
                    onClick={async () => {
                      const response = await request.get(
                        api + `tasks/${task.id}/log`,
                      );
                      if (response.code === 200) setLog(response.data.content);
                    }}
                  >
                    Log
                  </Button>
                  <Popconfirm
                    title="Delete Task and its owned bindings? Historical logs are retained."
                    onConfirm={async () => {
                      const response = await request.delete(
                        api + `tasks/${task.id}`,
                        { data: { expected_version: task.version } },
                      );
                      if (response.code === 200) await load();
                    }}
                  >
                    <Button danger>Delete</Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
        <Modal
          title={selected ? `Task: ${selected.name}` : 'Create Task'}
          open={open}
          width={960}
          onCancel={() => setOpen(false)}
          footer={
            <Space>
              {selected && (
                <Button onClick={() => validate(selected.id)}>
                  Validate Task
                </Button>
              )}
              <Button onClick={() => setOpen(false)}>Close</Button>
              <Button type="primary" loading={busy} onClick={save}>
                Save Task
              </Button>
            </Space>
          }
          destroyOnClose
        >
          <Form name="task-definition" form={form} layout="vertical" preserve>
            <Tabs
              activeKey={tab}
              onChange={setTab}
              items={[
                {
                  key: 'general',
                  label: 'General',
                  forceRender: true,
                  children: (
                    <>
                      <Form.Item
                        name="name"
                        label="Name"
                        rules={[{ required: true }]}
                      >
                        <Input maxLength={255} />
                      </Form.Item>
                      <Form.Item name="description" label="Description">
                        <Input.TextArea />
                      </Form.Item>
                      <Form.Item
                        name="enabled"
                        label="Enabled"
                        valuePropName="checked"
                      >
                        <Switch />
                      </Form.Item>
                      <Form.Item
                        name="arguments_json"
                        label="Arguments — JSON array"
                        rules={[{ required: true }]}
                      >
                        <Input.TextArea rows={4} />
                      </Form.Item>
                      <Alert message="Do not put secrets in arguments. Use Environment or Config Assets. Arguments can appear in process listings; $TOKEN is a literal string." />
                    </>
                  ),
                },
                {
                  key: 'source',
                  label: 'Source',
                  forceRender: true,
                  children: (
                    <>
                      <Form.Item
                        name="worktree_id"
                        label="Worktree"
                        rules={[{ required: true }]}
                      >
                        <Select
                          showSearch
                          optionFilterProp="label"
                          disabled={selected?.origin === 'DISCOVERED'}
                          options={worktrees.map((tree) => ({
                            value: tree.id,
                            label: `${tree.name} · Repository ${tree.repository_id} · ${tree.ref_name}`,
                          }))}
                          onChange={() =>
                            form.setFieldValue('relative_entrypoint', undefined)
                          }
                        />
                      </Form.Item>
                      <Form.Item
                        name="relative_entrypoint"
                        label="Entrypoint"
                        rules={[{ required: true }]}
                      >
                        <Select
                          showSearch
                          disabled={selected?.origin === 'DISCOVERED'}
                          options={entries.map((entry) => ({
                            value: entry,
                            label: entry,
                          }))}
                          onChange={(entry) => {
                            const next = languageOf(entry);
                            if (kindOf(next) !== kind)
                              form.setFieldValue('environment_id', null);
                            form.setFieldValue('language', next);
                          }}
                        />
                      </Form.Item>
                      <Form.Item name="language" label="Language">
                        <Input readOnly />
                      </Form.Item>
                      <Form.Item name="cwd_mode" label="Working directory">
                        <Select
                          options={[
                            'WORKTREE_ROOT',
                            'ENTRYPOINT_DIR',
                            'CUSTOM_RELATIVE',
                          ].map((value) => ({ value, label: value }))}
                        />
                      </Form.Item>
                      {cwdMode === 'CUSTOM_RELATIVE' && (
                        <Form.Item
                          name="cwd_relative_path"
                          label="Relative working directory"
                          rules={[{ required: true }]}
                        >
                          <Input />
                        </Form.Item>
                      )}
                    </>
                  ),
                },
                {
                  key: 'runtime',
                  label: 'Runtime',
                  forceRender: true,
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Alert
                        message={`${kind} · Configured Resources`}
                        description="Environment 是逻辑绑定；每次运行固定当时的 Current Build。TypeScript 需要该 Build 安装 tsx 4.x。"
                      />
                      {kind !== 'SHELL' && (
                        <Form.Item
                          name="environment_id"
                          label={`${
                            kind === 'PYTHON' ? 'Python' : 'Node'
                          } Environment`}
                        >
                          <Select
                            options={[
                              {
                                value: null,
                                label:
                                  'Inherit — Subscription / Repository Default',
                              },
                              ...environments.map((env) => ({
                                value: env.id,
                                label: `${env.name} · ${
                                  env.state
                                } · Current Build ${
                                  env.current_build_id ?? 'none'
                                }`,
                              })),
                            ]}
                          />
                        </Form.Item>
                      )}
                      <Typography.Text>
                        Selection:{' '}
                        {environmentId
                          ? 'TASK'
                          : preview?.runtime?.selected_by ?? 'UNBOUND'}
                      </Typography.Text>
                      <RuntimeDefaults
                        repositoryId={worktree?.repository_id}
                        subscriptionId={selected?.subscription_id}
                        kind={kind}
                        environments={environments}
                        onChange={inherited}
                      />
                    </Space>
                  ),
                },
                ...resourceTabs,
                {
                  key: 'schedule',
                  label: 'Schedule',
                  forceRender: true,
                  children: (
                    <>
                      <Alert message="Schedule — cron expression" />
                      <Form.Item name="schedule" label="Schedule">
                        <Input placeholder="0 8 * * *" />
                      </Form.Item>
                    </>
                  ),
                },
                {
                  key: 'settings',
                  label: 'Execution Settings',
                  forceRender: true,
                  children: (
                    <>
                      <Alert message="Retry and concurrency policies apply to each run. Failure notifications are sent after the final failed attempt." />
                      <Form.Item
                        name="timeout_seconds"
                        label="Timeout seconds (empty = platform default)"
                      >
                        <InputNumber min={1} max={86400} />
                      </Form.Item>
                      <Form.Item name="max_attempts" label="Maximum attempts">
                        <InputNumber min={1} max={10} />
                      </Form.Item>
                      <Form.Item
                        name="initial_delay_seconds"
                        label="Initial delay seconds"
                      >
                        <InputNumber min={0} max={3600} />
                      </Form.Item>
                      {[
                        ['backoff', 'Backoff', ['FIXED', 'EXPONENTIAL']],
                        [
                          'concurrency',
                          'Concurrency',
                          ['FORBID', 'QUEUE', 'ALLOW'],
                        ],
                        [
                          'notification',
                          'Notification',
                          ['NONE', 'FAILURE', 'SUCCESS', 'ALWAYS'],
                        ],
                      ].map(([name, label, values]) => (
                        <Form.Item
                          key={name as string}
                          name={name as string}
                          label={label as string}
                        >
                          <Select
                            options={(values as string[]).map((value) => ({
                              value,
                              label: value,
                            }))}
                          />
                        </Form.Item>
                      ))}
                    </>
                  ),
                },
                {
                  key: 'resources',
                  label: 'Resource Preview',
                  children: preview ? (
                    <>
                      <Tag>{preview.readiness.status}</Tag>
                      <pre style={{ whiteSpace: 'pre-wrap' }}>
                        {JSON.stringify(preview, null, 2)}
                      </pre>
                    </>
                  ) : (
                    <Alert message="Save Task to preview resources" />
                  ),
                },
              ]}
            />
          </Form>
        </Modal>
        <Modal
          open={runs !== undefined}
          title="Task runs"
          width={850}
          footer={null}
          onCancel={() => setRuns(undefined)}
        >
          <Button
            onClick={async () => setRuns(await get(`tasks/${runTask}/runs`))}
          >
            Refresh runs
          </Button>
          <Table
            rowKey="id"
            dataSource={runs}
            pagination={{ pageSize: 10 }}
            columns={[
              { title: 'Run', dataIndex: 'id' },
              { title: 'Status', dataIndex: 'status' },
              { title: 'Attempts', dataIndex: 'attempt_count' },
              { title: 'Result', dataIndex: 'error_code' },
              {
                title: 'Actions',
                render: (_: unknown, run: any) => (
                  <Space>
                    <Button
                      onClick={async () =>
                        setLog((await get(`task-runs/${run.id}/log`)).content)
                      }
                    >
                      Run log
                    </Button>
                    <Button
                      disabled={
                        !['QUEUED', 'RESOLVING', 'RUNNING'].includes(run.status)
                      }
                      onClick={async () => {
                        await request.post(api + `task-runs/${run.id}/cancel`);
                        setRuns(await get(`tasks/${runTask}/runs`));
                        await load();
                      }}
                    >
                      Cancel run
                    </Button>
                  </Space>
                ),
              },
            ]}
          />
        </Modal>
        <Modal
          open={log !== undefined}
          title="Run log"
          width={900}
          onCancel={() => setLog(undefined)}
          footer={null}
        >
          <pre style={{ whiteSpace: 'pre-wrap' }}>{log}</pre>
        </Modal>
      </Space>
    </div>
  );
}
