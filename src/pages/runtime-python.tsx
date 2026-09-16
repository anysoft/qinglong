import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import { PageContainer } from '@ant-design/pro-layout';
import { request } from '@/utils/http';
import config from '@/utils/config';
import PythonEnvironments from '@/components/PythonEnvironments';
import NodeRuntime from '@/components/NodeRuntime';
const base = `${config.apiPrefix}runtime/python`;
const active = (row: any) => ['QUEUED', 'RUNNING'].includes(row.status);
const bytes = (value?: number) =>
  value === undefined ? '—' : `${(value / 1024 / 1024).toFixed(1)} MiB`;
export default function PythonRuntimePage() {
  const [provider, setProvider] = useState<any>(),
    [catalog, setCatalog] = useState<string[]>([]),
    [rows, setRows] = useState<any[]>([]),
    [operations, setOperations] = useState<any[]>([]),
    [diagnostics, setDiagnostics] = useState<any>();
  const [install, setInstall] = useState(false),
    [selected, setSelected] = useState<number>(),
    [operation, setOperation] = useState<any>(),
    [log, setLog] = useState<any>(),
    [detail, setDetail] = useState<any>(),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState('');
  const [language, setLanguage] = useState('PYTHON');
  const [form] = Form.useForm();
  const load = async () => {
    const responses = await Promise.all(
      ['provider', 'catalog', 'installations', 'operations', 'diagnostics'].map(
        (x) => request.get(`${base}/${x}`),
      ),
    );
    if (responses.some((x) => x.code !== 200))
      throw Error('RUNTIME_READ_FAILED');
    setProvider(responses[0].data);
    setCatalog(responses[1].data.versions);
    setRows(responses[2].data);
    setOperations(responses[3].data.filter((x:any)=>!x.operation_type.startsWith('NODE_')));
    setDiagnostics(responses[4].data);
    setError('');
  };
  useEffect(() => {
    let live = true;
    const poll = () =>
      load().catch(() => {
        if (live) setError('无法读取 Runtime 状态，请重试。');
      });
    poll();
    const timer = setInterval(poll, 2000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (!selected) return;
    let live = true;
    const poll = async () => {
      try {
        const [op, output] = await Promise.all([
          request.get(`${base}/operations/${selected}`),
          request.get(`${base}/operations/${selected}/log`),
        ]);
        if (live && op.code === 200 && output.code === 200) {
          setOperation(op.data);
          setLog(output.data);
        }
      } catch {}
    };
    setOperation(undefined);
    setLog(undefined);
    poll();
    const timer = setInterval(poll, 1000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [selected]);
  const perform = async (url: string, payload: any = {}, remove = false) => {
    setSubmitting(true);
    try {
      const result = await request[remove ? 'delete' : 'post'](
        `${base}/${url}`,
        payload,
      );
      if (result.code !== 200) return false;
      if (!url.endsWith('/cancel')) setSelected(result.data.id);
      await load();
      return true;
    } catch {
      message.error('操作请求失败，请查看状态后重试。');
      return false;
    } finally {
      setSubmitting(false);
    }
  };
  const busy = submitting || operations.some(active);
  return (
    <PageContainer
      title="Runtime"
      extra={language === 'PYTHON' &&
        <Button
          type="primary"
          disabled={busy || provider?.state !== 'READY'}
          onClick={() => {
            form.resetFields();
            setInstall(true);
          }}
        >
          安装 Python
        </Button>
      }
    >
      {error && (
        <Alert
          type="error"
          message={error}
          action={<Button onClick={() => load().catch(() => {})}>重试</Button>}
        />
      )}
      <Tabs activeKey={language} onChange={setLanguage} items={[{key:'PYTHON',label:'Python'},{key:'NODE',label:'Node.js'}]} />
      {language === 'NODE' && <NodeRuntime onOperation={setSelected} />}
      <div style={{display:language === 'PYTHON' ? undefined : 'none'}}>
      <Tabs
        defaultActiveKey="versions"
        items={[
          {
            key: 'versions',
            label: 'Versions',
            children: (
              <>
                <Card
                  title="Python Provider"
                  style={{ marginBottom: 16 }}
                  extra={
                    <Tag>
                      {provider?.state ?? 'LOADING'} · {provider?.health}
                    </Tag>
                  }
                >
                  <Descriptions size="small" column={2}>
                    <Descriptions.Item label="Provider">
                      pyenv · {provider?.provider_version ?? '尚未安装'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Revision">
                      <Typography.Text copyable={!!provider?.provider_revision}>
                        {provider?.provider_revision ?? '—'}
                      </Typography.Text>
                    </Descriptions.Item>
                    <Descriptions.Item label="Catalog Updated">
                      {provider?.last_refresh_at ?? '—'}
                    </Descriptions.Item>
                    <Descriptions.Item label="Last Error">
                      {provider?.last_error ?? '—'}
                    </Descriptions.Item>
                  </Descriptions>
                  <Space wrap>
                    <Button
                      disabled={busy || provider?.state === 'READY'}
                      onClick={() => perform('provider/setup')}
                    >
                      设置 Provider
                    </Button>
                    <Button
                      disabled={busy || !provider?.provider_revision}
                      onClick={() => perform('provider/update')}
                    >
                      更新 Provider
                    </Button>
                    <Button
                      disabled={busy || !provider?.provider_revision}
                      onClick={() => perform('provider/verify')}
                    >
                      验证 Provider
                    </Button>
                    <Button
                      disabled={busy || !provider?.provider_revision}
                      onClick={() => perform('provider/catalog')}
                    >
                      刷新版本列表
                    </Button>
                    <Popconfirm
                      title="重新获取 Provider？已安装 Python 会保留。"
                      onConfirm={() => perform('provider/repair')}
                    >
                      <Button disabled={busy}>修复 Provider</Button>
                    </Popconfirm>
                  </Space>
                </Card>
                <Table
                  rowKey="id"
                  dataSource={rows}
                  pagination={{ pageSize: 10 }}
                  scroll={{ x: 1050 }}
                  columns={[
                    { title: 'Python Version', dataIndex: 'version' },
                    {
                      title: 'State',
                      dataIndex: 'state',
                      render: (value) => <Tag>{value}</Tag>,
                    },
                    { title: 'Health', dataIndex: 'health' },
                    { title: 'Provider', render: () => 'pyenv' },
                    { title: 'Installed At', dataIndex: 'installed_at' },
                    {
                      title: 'Disk Usage',
                      render: (_, row) => bytes(row.metadata?.disk_usage_bytes),
                    },
                    {
                      title: '操作',
                      render: (_, row) => (
                        <Space wrap>
                          <Button
                            disabled={busy}
                            onClick={() =>
                              perform(`installations/${row.id}/verify`)
                            }
                          >
                            验证 / Test
                          </Button>
                          <Button
                            onClick={async () => {
                              const r = await request.get(
                                `${base}/installations/${row.id}/references`,
                              );
                              if (r.code === 200)
                                setDetail({ ...row, references: r.data });
                            }}
                          >
                            详情
                          </Button>
                          <Popconfirm
                            title={`修复 Python ${row.version}？当前目录会保留到隔离区，再重新安装。`}
                            onConfirm={() =>
                              perform(`installations/${row.id}/repair`)
                            }
                          >
                            <Button
                              disabled={busy || provider?.state !== 'READY'}
                            >
                              修复
                            </Button>
                          </Popconfirm>
                          <Popconfirm
                            title={`删除 Python ${row.version}？该安装目录将被删除；有引用时会拒绝。`}
                            onConfirm={() =>
                              perform(`installations/${row.id}`, {}, true)
                            }
                          >
                            <Button danger disabled={busy}>
                              删除
                            </Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
                <Card title="Runtime Operations" style={{ marginTop: 16 }}>
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={operations}
                    pagination={{ pageSize: 8 }}
                    scroll={{ x: 750 }}
                    columns={[
                      { title: 'ID', dataIndex: 'id' },
                      { title: 'Operation', dataIndex: 'operation_type' },
                      { title: 'Status', dataIndex: 'status' },
                      { title: 'Stage', dataIndex: 'stage' },
                      { title: 'Error', dataIndex: 'error_code' },
                      {
                        title: '操作',
                        render: (_, row) => (
                          <Space>
                            <Button onClick={() => setSelected(row.id)}>
                              日志
                            </Button>
                            {active(row) && (
                              <Button
                                disabled={row.cancel_requested}
                                onClick={() =>
                                  perform(`operations/${row.id}/cancel`)
                                }
                              >
                                取消
                              </Button>
                            )}
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
                <Card title="Build Diagnostics" style={{ marginTop: 16 }}>
                  <Alert
                    type={
                      diagnostics?.state === 'READY' ? 'success' : 'warning'
                    }
                    message={diagnostics?.state ?? 'LOADING'}
                    description={`Host: ${diagnostics?.host_os ?? '—'} / ${
                      diagnostics?.architecture ?? '—'
                    } · 可用空间: ${bytes(
                      diagnostics?.available_disk_bytes ?? undefined,
                    )}`}
                  />
                  <p>
                    {diagnostics?.tools?.map((x: any) => (
                      <Tag
                        color={x.available ? 'green' : 'orange'}
                        key={x.name}
                      >
                        {x.name}: {x.available ? 'available' : 'missing'}
                      </Tag>
                    ))}
                  </p>
                  <p>
                    Runtime 可写:{' '}
                    {String(diagnostics?.runtime_root_writable ?? false)} ·
                    Cache 可写: {String(diagnostics?.cache_writable ?? false)}
                  </p>
                  {diagnostics?.missing_requirements?.length > 0 && (
                    <Alert
                      type="warning"
                      message={diagnostics.missing_requirements.join(', ')}
                    />
                  )}
                  {diagnostics?.filesystem?.orphans?.length > 0 && (
                    <Alert
                      type="warning"
                      message="发现未登记目录；需要人工核对，平台未接管。"
                      description={diagnostics.filesystem.orphans
                        .map((x: any) => x.version ?? 'unknown entry')
                        .join(', ')}
                    />
                  )}
                  <Typography.Paragraph type="secondary">
                    编译需要本机工具和开发库；具体缺失项请查看构建日志。平台不会自动安装系统软件包。
                  </Typography.Paragraph>
                </Card>
              </>
            ),
          },
          {
            key: 'environments',
            label: 'Environments',
            children: (
              <PythonEnvironments
                runtimes={rows}
                busy={busy}
                onOperation={setSelected}
              />
            ),
          },
        ]}
      />
      </div>
      <Modal
        title="安装 Python"
        open={install}
        confirmLoading={submitting}
        onCancel={() => setInstall(false)}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            if (await perform('installations', values)) setInstall(false);
          } catch {}
        }}
        destroyOnClose
      >
        <Form
          form={form}
          layout="vertical"
          initialValues={{ jobs: 4, timeout_seconds: 3600 }}
        >
          <Form.Item
            name="version"
            label="Exact Python Version"
            rules={[{ required: true }]}
          >
            <Select
              showSearch
              options={catalog.map((value) => ({
                value,
                label: value,
                disabled: rows.some((x) => x.version === value),
              }))}
            />
          </Form.Item>
          <Form.Item
            name="jobs"
            label="Build Jobs"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={16} />
          </Form.Item>
          <Form.Item
            name="timeout_seconds"
            label="Timeout (seconds)"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={7200} />
          </Form.Item>
        </Form>
      </Modal>
      <Modal
        title={`Runtime Operation #${selected ?? ''}`}
        zIndex={1200}
        open={!!selected}
        onCancel={() => setSelected(undefined)}
        footer={null}
        width={900}
      >
        <p>
          {operation?.operation_type} · {operation?.status} · {operation?.stage}{' '}
          · Exit: {operation?.exit_code ?? '—'}
        </p>
        {operation?.error_code && (
          <Alert type="warning" message={operation.error_code} />
        )}
        {operation && active(operation) && (
          <Button
            disabled={operation.cancel_requested}
            onClick={() => perform(`operations/${operation.id}/cancel`)}
          >
            取消操作
          </Button>
        )}
        {log?.truncated && (
          <Alert
            type="info"
            message="显示日志末尾 64 KiB；完整日志由平台保存。"
          />
        )}
        <pre
          aria-label="Runtime operation log"
          style={{
            maxHeight: '55vh',
            overflow: 'auto',
            whiteSpace: 'pre-wrap',
            overflowWrap: 'anywhere',
            padding: 12,
            background: '#111',
            color: '#ddd',
          }}
        >
          {log?.text ?? '读取日志中…'}
        </pre>
      </Modal>
      <Modal
        title={`Python ${detail?.version ?? ''}`}
        open={!!detail}
        onCancel={() => setDetail(undefined)}
        footer={null}
        width={760}
      >
        <Descriptions column={1} bordered>
          <Descriptions.Item label="State / Health">
            {detail?.state} / {detail?.health}
          </Descriptions.Item>
          <Descriptions.Item label="Verified At">
            {detail?.verified_at}
          </Descriptions.Item>
          <Descriptions.Item label="Provider Revision">
            {detail?.metadata?.provider_revision}
          </Descriptions.Item>
          <Descriptions.Item label="Build Timestamp">
            {detail?.metadata?.build_timestamp}
          </Descriptions.Item>
          <Descriptions.Item label="Platform / Architecture">
            {detail?.metadata?.platform} / {detail?.metadata?.architecture}
          </Descriptions.Item>
          <Descriptions.Item label="References">
            {detail?.references?.count ?? 0}
          </Descriptions.Item>
          <Descriptions.Item label="Last Error">
            {detail?.last_error ?? '—'}
          </Descriptions.Item>
        </Descriptions>
      </Modal>
    </PageContainer>
  );
}
