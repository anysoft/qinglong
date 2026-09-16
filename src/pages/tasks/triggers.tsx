import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';

export default function TaskTriggers({ taskId }: { taskId?: number }) {
  const [rows, setRows] = useState<any[]>([]),
    [events, setEvents] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(),
    [secret, setSecret] = useState<string>();
  const [form] = Form.useForm(),
    type = Form.useWatch('type', form);
  const api = `${config.apiPrefix}tasks/${taskId}`;
  const load = async () => {
    const [triggers, recent] = await Promise.all([
      request.get(api + '/triggers'),
      request.get(api + '/trigger-events'),
    ]);
    if (triggers.code === 200) setRows(triggers.data);
    if (recent.code === 200) setEvents(recent.data);
  };
  useEffect(() => {
    setSecret(undefined);
    if (taskId) void load();
  }, [taskId]);
  if (!taskId)
    return <Alert message="Save this task before adding triggers." />;
  const edit = (row?: any) => {
    const value = row ?? {
      type: 'CRON',
      enabled: true,
      config: { misfire_policy: 'SKIP' },
    };
    setEditing(value);
    form.setFieldsValue({
      ...value,
      ...value.config,
      path_filters: value.config?.path_filters?.join('\n') ?? '',
    });
  };
  const save = async () => {
    const value = await form.validateFields();
    const payload = {
      type: value.type,
      enabled: value.enabled,
      expected_version: editing?.version,
      config:
        value.type === 'CRON'
          ? {
              expression: value.expression,
              timezone: value.timezone,
              misfire_policy: value.misfire_policy,
            }
          : value.type === 'WEBHOOK'
          ? {}
          : {
              mode: value.mode,
              path_filters: (value.path_filters ?? '')
                .split('\n')
                .map((x: string) => x.trim())
                .filter(Boolean),
              fire_on_initial: !!value.fire_on_initial,
            },
    };
    const result = await request[editing?.id ? 'put' : 'post'](
      api + '/triggers' + (editing?.id ? '/' + editing.id : ''),
      payload,
    );
    if (result.code === 200) {
      setEditing(undefined);
      setSecret(result.data.secret);
      await load();
    } else message.error(result.message ?? 'Unable to save trigger');
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert message="Triggers submit runs using this task’s saved resources and execution settings." />
      <Space>
        <Button onClick={() => edit()}>Add trigger</Button>
        <Button onClick={() => void load()}>Refresh triggers</Button>
      </Space>
      {secret && (
        <Alert
          type="warning"
          closable
          onClose={() => setSecret(undefined)}
          message="Copy this webhook secret now. It is shown only once."
          description={
            <Typography.Text copyable code>
              {secret}
            </Typography.Text>
          }
        />
      )}
      <Table
        size="small"
        rowKey="id"
        dataSource={rows}
        pagination={false}
        columns={[
          { title: 'Type', dataIndex: 'type' },
          {
            title: 'Origin',
            render: (_: unknown, row: any) => <Tag>{row.origin}</Tag>,
          },
          {
            title: 'Enabled',
            render: (_: unknown, row: any) => (row.enabled ? 'Yes' : 'No'),
          },
          {
            title: 'Configuration',
            render: (_: unknown, row: any) =>
              row.type === 'CRON' ? (
                <>
                  {row.config.expression} · {row.config.timezone} ·{' '}
                  {row.config.misfire_policy}
                  <br />
                  Next: {row.enabled ? row.config.next_fire_at : '— (disabled)'}
                  <br />
                  Last: {row.config.last_fire_at ?? '—'}
                </>
              ) : row.type === 'WEBHOOK' ? (
                <Typography.Text copyable>
                  {window.location.origin +
                    config.baseUrl.replace(/\/$/, '') +
                    '/hooks/' +
                    row.config.public_id}
                </Typography.Text>
              ) : (
                <>
                  {row.config.mode} ·{' '}
                  {(row.config.path_filters ?? []).join(', ')} · Initial:{' '}
                  {row.config.fire_on_initial ? 'Yes' : 'No'}
                </>
              ),
          },
          {
            title: 'Actions',
            render: (_: unknown, row: any) => (
              <Space wrap>
                <Button onClick={() => edit(row)}>Edit</Button>
                {row.type === 'WEBHOOK' && (
                  <Button
                    onClick={async () => {
                      const result = await request.post(
                        api + `/triggers/${row.id}/rotate-secret`,
                        { expected_version: row.version },
                      );
                      if (result.code === 200) {
                        setSecret(result.data.secret);
                        await load();
                      }
                    }}
                  >
                    Rotate secret
                  </Button>
                )}
                <Button
                  danger
                  onClick={async () => {
                    const result = await request.delete(
                      api + `/triggers/${row.id}`,
                      { data: { expected_version: row.version } },
                    );
                    if (result.code === 200) await load();
                  }}
                >
                  Remove
                </Button>
              </Space>
            ),
          },
        ]}
      />
      <Typography.Title level={5}>Recent trigger events</Typography.Title>
      <Table
        size="small"
        rowKey="id"
        dataSource={events}
        pagination={false}
        columns={[
          { title: 'Event', dataIndex: 'id' },
          { title: 'Type', dataIndex: 'trigger_type' },
          { title: 'Status', dataIndex: 'status' },
          { title: 'Diagnostic', dataIndex: 'error_code' },
          {
            title: 'Run',
            render: (_: unknown, row: any) =>
              row.task_run_id ? (
                <Button
                  type="link"
                  href={`${config.baseUrl}runs?run=${row.task_run_id}`}
                >
                  #{row.task_run_id}
                </Button>
              ) : (
                '—'
              ),
          },
        ]}
      />
      <Modal
        open={!!editing}
        title={editing?.id ? 'Edit trigger' : 'Add trigger'}
        onCancel={() => setEditing(undefined)}
        onOk={() => void save()}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="type"
            label="Trigger type"
            rules={[{ required: true }]}
          >
            <Select
              disabled={!!editing?.id}
              options={['CRON', 'WEBHOOK', 'GIT_UPDATE'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          {type === 'CRON' && (
            <>
              <Form.Item
                name="expression"
                label="Cron expression"
                rules={[{ required: true }]}
              >
                <Input placeholder="0 8 * * *" />
              </Form.Item>
              <Form.Item name="timezone" label="Timezone">
                <Input placeholder="Platform configured timezone" />
              </Form.Item>
              <Form.Item
                name="misfire_policy"
                label="Missed schedules"
                initialValue="SKIP"
              >
                <Select
                  options={[
                    { value: 'SKIP', label: 'Skip missed schedules' },
                    {
                      value: 'FIRE_ONCE',
                      label: 'Run once after a missed schedule',
                    },
                  ]}
                />
              </Form.Item>
            </>
          )}
          {type === 'WEBHOOK' && (
            <Alert message="POST JSON or an empty body to the endpoint with Authorization: Bearer <secret>. The body does not change task execution." />
          )}
          {type === 'GIT_UPDATE' && (
            <>
              <Form.Item
                name="mode"
                label="Change mode"
                initialValue="ANY_CHANGE"
              >
                <Select
                  options={['ANY_CHANGE', 'SOURCE_CHANGE', 'PATH_FILTER'].map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Form.Item>
              <Form.Item
                name="path_filters"
                label="Relative path globs (one per line)"
              >
                <Input.TextArea placeholder="src/**/*.py" />
              </Form.Item>
              <Form.Item
                name="fire_on_initial"
                label="Run on initial sync"
                valuePropName="checked"
              >
                <Switch />
              </Form.Item>
            </>
          )}
        </Form>
      </Modal>
    </Space>
  );
}
