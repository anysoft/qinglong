import React, { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Timeline,
  Typography,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import WebSocketManager from '@/utils/websocket';
export async function obsGet(path: string) {
  const r = await request.get<any>(config.apiPrefix + path);
  if (r.code !== 200) throw Error(r.error_code ?? 'Request failed');
  return r.data;
}
export function DeliveryTable({ runId }: { runId?: number }) {
  const [rows, setRows] = useState<any[]>([]),
    [attempts, setAttempts] = useState<any[]>(),
    [cursor, setCursor] = useState<number>();
  const load = () =>
    obsGet(
      'notification-deliveries?' +
        new URLSearchParams({
          ...(runId ? { run_id: String(runId) } : {}),
          ...(cursor ? { cursor: String(cursor) } : {}),
        }),
    ).then(setRows);
  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), 3000);
    return () => clearInterval(timer);
  }, [runId, cursor]);
  return (
    <>
      <Button onClick={load}>Refresh deliveries</Button>
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: 'Delivery', dataIndex: 'id' },
          { title: 'Event', dataIndex: 'event_type' },
          { title: 'Channel', dataIndex: 'channel_name' },
          {
            title: 'Run',
            dataIndex: 'task_run_id',
            render: (id) =>
              id ? (
                <a href={`${config.baseUrl}runs?run=${id}`}>{id}</a>
              ) : (
                'Test'
              ),
          },
          {
            title: 'Status',
            dataIndex: 'status',
            render: (s) => <Tag>{s}</Tag>,
          },
          { title: 'Attempts', dataIndex: 'attempt_count' },
          { title: 'Error', dataIndex: 'last_error_code' },
          {
            title: 'Actions',
            render: (_, r) => (
              <Space>
                <Button
                  onClick={async () =>
                    setAttempts(
                      await obsGet(`notification-deliveries/${r.id}/attempts`),
                    )
                  }
                >
                  History
                </Button>
                {['DEAD', 'RETRY'].includes(r.status) && (
                  <Button
                    onClick={async () => {
                      await request.post(
                        config.apiPrefix +
                          `notification-deliveries/${r.id}/retry`,
                      );
                      await load();
                    }}
                  >
                    Retry notification
                  </Button>
                )}
              </Space>
            ),
          },
        ]}
        pagination={false}
      />
      <Space>
        <Button onClick={() => setCursor(undefined)}>Newest deliveries</Button>
        <Button
          disabled={rows.length < 100}
          onClick={() => setCursor(rows[rows.length - 1].id)}
        >
          Older deliveries
        </Button>
      </Space>
      <Modal
        open={!!attempts}
        onCancel={() => setAttempts(undefined)}
        footer={null}
        title="Delivery attempts"
      >
        <Table
          rowKey="attempt"
          dataSource={attempts}
          columns={[
            'attempt',
            'started_at',
            'finished_at',
            'result',
            'error_code',
          ].map((dataIndex) => ({ title: dataIndex, dataIndex }))}
        />
      </Modal>
    </>
  );
}
export function RunLogs({ id }: { id: number }) {
  const [content, setContent] = useState(''),
    [error, setError] = useState('');
  const cursor = useRef<string | null>(null);
  useEffect(() => {
    let disposed = false,
      busy = false,
      ticks = 0;
    cursor.current = null;
    setContent('');
    setError('');
    const socket = WebSocketManager.getInstance();
    const pull = async () => {
      if (busy || disposed) return;
      busy = true;
      try {
        const result = await obsGet(
          `task-runs/${id}/log?tail=false${
            cursor.current
              ? '&cursor=' + encodeURIComponent(cursor.current)
              : ''
          }`,
        );
        if (disposed) return;
        cursor.current = result.cursor;
        setContent((v) => (v + result.content).slice(-2 * 1024 * 1024));
        if (ticks++ % 5 === 0)
          socket.send({
            type: 'RUN_LOG_SUBSCRIBE',
            runId: id,
            cursor: cursor.current,
          });
      } catch {
        if (!disposed)
          setError('Log follow interrupted; retrying from the last cursor.');
      } finally {
        busy = false;
      }
    };
    const receive = (data: any) => {
      if (data.runId === id) void pull();
    };
    socket.subscribe('runLog', receive);
    void pull();
    const timer = setInterval(() => void pull(), 1000);
    return () => {
      disposed = true;
      clearInterval(timer);
      socket.unsubscribe('runLog', receive);
      socket.send({ type: 'RUN_LOG_UNSUBSCRIBE' });
    };
  }, [id]);
  return (
    <>
      {error && <Alert message={error} />}
      <Typography.Text type="secondary">
        Redacted run log · live following · display keeps the latest 2 MiB
      </Typography.Text>
      <pre
        data-testid="run-log"
        style={{
          whiteSpace: 'pre-wrap',
          maxHeight: 480,
          overflow: 'auto',
          background: '#111827',
          color: '#e5e7eb',
          padding: 16,
        }}
      >
        {content}
      </pre>
    </>
  );
}
export function RunDetail({
  id,
  onClose,
}: {
  id?: number;
  onClose: () => void;
}) {
  const [run, setRun] = useState<any>(),
    [attempts, setAttempts] = useState<any[]>([]),
    [events, setEvents] = useState<any[]>([]),
    [trigger, setTrigger] = useState<any>(),
    [after, setAfter] = useState(0);
  useEffect(() => {
    if (!id) return;
    let disposed = false;
    const load = async () => {
      const [r, a, e] = await Promise.all([
        obsGet(`task-runs/${id}`),
        obsGet(`task-runs/${id}/attempts`),
        obsGet(`task-runs/${id}/events?after=${after}`),
      ]);
      if (!disposed) {
        setRun(r);
        setAttempts(a);
        setEvents(e);
      }
    };
    void load();
    const t = setInterval(() => void load(), 2000);
    return () => {
      disposed = true;
      clearInterval(t);
    };
  }, [id, after]);
  useEffect(() => setAfter(0), [id]);
  return (
    <>
      <Modal
        title={`Run ${id ?? ''}`}
        open={!!id}
        onCancel={onClose}
        footer={null}
        width={1100}
        destroyOnClose
      >
        <Tabs
          items={[
            {
              key: 'overview',
              label: 'Overview',
              children: run && (
                <>
                  <Descriptions bordered column={2}>
                    {[
                      'id',
                      'task_id',
                      'trigger_type',
                      'trigger_id',
                      'event_id',
                      'status',
                      'submitted_at',
                      'started_at',
                      'finished_at',
                      'duration_ms',
                      'attempt_count',
                      'exit_code',
                      'signal',
                      'error_code',
                      'log_size',
                      'last_log_at',
                      'log_truncated',
                    ].map((k) => (
                      <Descriptions.Item key={k} label={k}>
                        {String(run[k] ?? '—')}
                      </Descriptions.Item>
                    ))}
                  </Descriptions>
                  <pre>{JSON.stringify(run.result, null, 2)}</pre>
                  {run.event_id && (
                    <Button
                      onClick={async () =>
                        setTrigger(
                          await obsGet(`trigger-events/${run.event_id}`),
                        )
                      }
                    >
                      View Trigger Event
                    </Button>
                  )}
                </>
              ),
            },
            {
              key: 'attempts',
              label: 'Attempts',
              children: (
                <Table
                  rowKey="id"
                  dataSource={attempts}
                  expandable={{
                    expandedRowRender: (r) => (
                      <pre>{JSON.stringify(r.result, null, 2)}</pre>
                    ),
                  }}
                  columns={[
                    'attempt_number',
                    'status',
                    'started_at',
                    'finished_at',
                    'duration_ms',
                    'exit_code',
                    'signal',
                    'error_code',
                    'retry_decision',
                    'retry_delay',
                  ].map((dataIndex) => ({ title: dataIndex, dataIndex }))}
                  scroll={{ x: 950 }}
                />
              ),
            },
            {
              key: 'timeline',
              label: 'Timeline',
              children: (
                <>
                  <Timeline>
                    {events.map((e) => (
                      <Timeline.Item key={e.sequence}>
                        <strong>
                          {e.sequence}. {e.type}
                        </strong>{' '}
                        · {e.created_at}
                        <div>{JSON.stringify(e.metadata)}</div>
                      </Timeline.Item>
                    ))}
                  </Timeline>
                  <Button
                    disabled={events.length < 200}
                    onClick={() => setAfter(events[events.length - 1].sequence)}
                  >
                    Next events
                  </Button>
                  <Button onClick={() => setAfter(0)}>First events</Button>
                </>
              ),
            },
            {
              key: 'resources',
              label: 'Resources',
              children: (
                <>
                  <Alert message="Resource identities and immutable revisions only. Secret values are never included." />
                  <pre>{JSON.stringify(run?.snapshot_metadata, null, 2)}</pre>
                </>
              ),
            },
            { key: 'logs', label: 'Logs', children: id && <RunLogs id={id} /> },
            {
              key: 'notifications',
              label: 'Notifications',
              children: <DeliveryTable runId={id} />,
            },
          ]}
        />
      </Modal>
      <Modal
        open={!!trigger}
        title="Trigger Event"
        footer={null}
        onCancel={() => setTrigger(undefined)}
      >
        <pre>{JSON.stringify(trigger, null, 2)}</pre>
      </Modal>
    </>
  );
}
export function RunsTable({ taskId }: { taskId?: number }) {
  const [rows, setRows] = useState<any[]>([]),
    [next, setNext] = useState<string | null>(),
    [selected, setSelected] = useState<number>(),
    [filters, setFilters] = useState<Record<string, string>>(() => ({
      status: new URLSearchParams(window.location.search).get('status') ?? '',
    }));
  const load = async (cursor?: string) => {
    const params = new URLSearchParams({
      ...filters,
      ...(taskId ? { task_id: String(taskId) } : {}),
      ...(cursor ? { cursor } : {}),
    });
    const r = await obsGet('task-runs?' + params);
    setRows(r.data);
    setNext(r.next_cursor);
  };
  useEffect(() => {
    void load();
  }, [taskId, filters]);
  return (
    <>
      <Space wrap style={{ marginBottom: 16 }}>
        {!taskId && (
          <Input
            aria-label="Task filter"
            placeholder="Task ID"
            onChange={(e) =>
              setFilters((v) => ({ ...v, task_id: e.target.value }))
            }
            style={{ width: 120 }}
          />
        )}
        <Select
          value={filters.status || undefined}
          aria-label="Run status filter"
          placeholder="Status"
          allowClear
          style={{ width: 170 }}
          options={[
            'QUEUED',
            'RUNNING',
            'SUCCESS',
            'FAILED',
            'TIMEOUT',
            'INTERRUPTED',
            'CANCELLED',
            'SKIPPED',
            'RECOVERY_REQUIRED',
          ].map((value) => ({ value, label: value }))}
          onChange={(v) => setFilters((f) => ({ ...f, status: v ?? '' }))}
        />
        <Select
          aria-label="Trigger filter"
          placeholder="Trigger"
          allowClear
          style={{ width: 150 }}
          options={['MANUAL', 'API', 'CRON', 'WEBHOOK', 'GIT_UPDATE'].map(
            (value) => ({ value, label: value }),
          )}
          onChange={(v) => setFilters((f) => ({ ...f, trigger_type: v ?? '' }))}
        />
        <Input
          type="datetime-local"
          aria-label="From"
          onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
        />
        <Input
          type="datetime-local"
          aria-label="To"
          onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
        />
        <Button onClick={() => load()}>Refresh runs</Button>
      </Space>
      <Table
        rowKey="id"
        pagination={false}
        dataSource={rows}
        columns={[
          'id',
          'task_id',
          'trigger_type',
          'status',
          'submitted_at',
          'finished_at',
          'attempt_count',
        ].map((dataIndex) => ({
          title: dataIndex,
          dataIndex,
          ...(dataIndex === 'id'
            ? {
                render: (id: number) => (
                  <Button type="link" onClick={() => setSelected(id)}>
                    {id}
                  </Button>
                ),
              }
            : {}),
        }))}
      />
      <Button disabled={!next} onClick={() => load(next!)}>
        Next page
      </Button>
      <RunDetail id={selected} onClose={() => setSelected(undefined)} />
    </>
  );
}
