import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Row,
  Select,
  Space,
  Statistic,
  Table,
} from 'antd';
import { obsGet, RunDetail } from '@/components/observability';
import config from '@/utils/config';
export default function Dashboard() {
  const [range, setRange] = useState('24h'),
    [data, setData] = useState<any>(),
    [run, setRun] = useState<number>();
  const load = () =>
    obsGet('observability/summary?range=' + range).then(setData);
  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [range]);
  const count = (s: string) =>
    data?.counts.find((x: any) => x.status === s)?.count ?? 0;
  return (
    <Card title="Observability">
      <Space>
        <Select
          value={range}
          onChange={setRange}
          options={['24h', '7d', '30d'].map((value) => ({
            value,
            label: value,
          }))}
        />
        <Button onClick={load}>Refresh</Button>
        <a href={config.baseUrl + 'runs'}>All runs</a>
      </Space>
      <Row gutter={16} style={{ margin: '20px 0' }}>
        {[
          ['Tasks', data?.tasks.total ?? 0],
          ['Enabled', data?.tasks.enabled ?? 0],
          ['Ready', data?.tasks.ready ?? 0],
          ['Success', count('SUCCESS')],
          ['Failure', count('FAILED')],
          ['Timeout', count('TIMEOUT')],
          [
            'Success rate',
            data?.success_rate === null
              ? '—'
              : ((data?.success_rate ?? 0) * 100).toFixed(1) + '%',
          ],
        ].map(([title, value]) => (
          <Col key={title} span={3}>
            <Statistic title={title} value={value} />
          </Col>
        ))}
      </Row>
      <Space>
        {data?.queue.map((r: any) => (
          <a key={r.status} href={`${config.baseUrl}runs?status=${r.status}`}>
            {r.status}: {r.count}
          </a>
        ))}
      </Space>
      {['failures', 'recent', 'longest', 'unhealthy'].map((key) => (
        <Card
          key={key}
          title={
            {
              failures: 'Recent failures',
              recent: 'Recent runs',
              longest: 'Longest runs',
              unhealthy: 'Unhealthy tasks',
            }[key]
          }
          style={{ marginTop: 16 }}
        >
          <Table
            rowKey={key === 'unhealthy' ? 'task_id' : 'id'}
            pagination={false}
            dataSource={data?.[key] ?? []}
            columns={
              key === 'unhealthy'
                ? [
                    { title: 'Task', dataIndex: 'name' },
                    { title: 'Health', dataIndex: 'health_state' },
                    {
                      title: 'Consecutive failures',
                      dataIndex: 'consecutive_failures',
                    },
                    {
                      title: 'Last run',
                      dataIndex: 'last_run_id',
                      render: (id) => (
                        <Button type="link" onClick={() => setRun(id)}>
                          {id}
                        </Button>
                      ),
                    },
                  ]
                : [
                    {
                      title: 'Run',
                      dataIndex: 'id',
                      render: (id) => (
                        <Button type="link" onClick={() => setRun(id)}>
                          {id}
                        </Button>
                      ),
                    },
                    { title: 'Task', dataIndex: 'task_id' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Finished', dataIndex: 'finished_at' },
                    { title: 'Error', dataIndex: 'error_code' },
                    { title: 'Duration ms', dataIndex: 'duration_ms' },
                  ]
            }
          />
        </Card>
      ))}
      <Alert
        style={{ marginTop: 16 }}
        message={`Storage: ${data?.storage.run_count ?? 0} runs · ${
          data?.storage.log_bytes ?? 0
        } log bytes · ${
          data?.storage.delivery_count ?? 0
        } delivery attempts. Automatic history deletion is OFF.`}
      />
      <RunDetail id={run} onClose={() => setRun(undefined)} />
    </Card>
  );
}
