import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Descriptions,
  Form,
  Input,
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
import { request } from '@/utils/http';
import config from '@/utils/config';
const base = `${config.apiPrefix}runtime/python/environments`;
interface Props {
  runtimes: any[];
  busy: boolean;
  onOperation: (id: number) => void;
}
export default function PythonEnvironments({
  runtimes,
  busy,
  onOperation,
}: Props) {
  const [rows, setRows] = useState<any[]>([]),
    [selected, setSelected] = useState<number>(),
    [environment, setEnvironment] = useState<any>(),
    [revisions, setRevisions] = useState<any[]>([]),
    [builds, setBuilds] = useState<any[]>([]),
    [operations, setOperations] = useState<any[]>([]);
  const [editor, setEditor] = useState<
      'create' | 'dependencies' | 'metadata' | 'clone'
    >(),
    [submitting, setSubmitting] = useState(false),
    [error, setError] = useState(''),
    [comparison, setComparison] = useState<any>(),
    [pair, setPair] = useState<number[]>([]);
  const [form] = Form.useForm();
  const call = async (
    method: 'get' | 'post' | 'patch' | 'delete',
    url: string,
    data?: any,
  ) => {
    const result =
      method === 'get'
        ? await request.get(base + url)
        : method === 'delete'
        ? await request.delete(base + url, { data })
        : method === 'patch'
        ? await request.patch<
            unknown,
            { code: number; data: any; message?: string }
          >(base + url, data)
        : await request.post(base + url, data);
    if (result.code !== 200)
      throw Error(result.message ?? 'PYTHON_ENV_REQUEST_FAILED');
    return result.data;
  };
  const load = async () => {
    setRows(await call('get', ''));
    if (selected) {
      const values = await Promise.all(
        ['', '/revisions', '/builds', '/operations'].map((s) =>
          call('get', `/${selected}${s}`),
        ),
      );
      setEnvironment(values[0]);
      setRevisions(values[1]);
      setBuilds(values[2]);
      setOperations(values[3]);
    }
    setError('');
  };
  useEffect(() => {
    load().catch(() => setError('无法读取 Python Environment，请重试。'));
    const timer = setInterval(() => load().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [selected]);
  const act = async (url: string, remove = false) => {
    setSubmitting(true);
    try {
      const op = await call(remove ? 'delete' : 'post', url, {
        expected_version: environment.version,
      });
      onOperation(op.id);
      await load();
    } catch {
      message.error('操作失败，请刷新状态后重试。');
    } finally {
      setSubmitting(false);
    }
  };
  const edit = (mode: typeof editor) => {
    setEditor(mode);
    form.resetFields();
    const revision = revisions.find(
      (x) => x.id === environment?.current_revision_id,
    );
    form.setFieldsValue({
      name: mode === 'clone' ? `${environment.name}-copy` : environment?.name,
      description: environment?.description ?? '',
      runtime_id:
        revision?.runtime_id ??
        runtimes.find((x) => x.state === 'READY' && x.health === 'HEALTHY')?.id,
      requirements:
        revision?.dependencies.map((x: any) => x.requirement).join('\n') ?? '',
    });
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      setSubmitting(true);
      let env = environment;
      if (editor === 'metadata') {
        await call('patch', `/${selected}`, {
          name: values.name,
          description: values.description ?? '',
          expected_version: environment.version,
        });
      } else {
        if (editor === 'clone') {
          env = await call('post', `/${selected}/clone`, { name: values.name });
        } else {
          const specs = {
            runtime_id: values.runtime_id,
            requirements: values.requirements
              .split(/\r?\n/)
              .map((x: string) => x.trim())
              .filter(Boolean),
          };
          if (editor === 'create')
            env = await call('post', '', {
              name: values.name,
              description: values.description ?? '',
              ...specs,
            });
          else {
            await call('post', `/${selected}/revisions`, {
              ...specs,
              expected_version: environment.version,
            });
            env = await call('get', `/${selected}`);
          }
        }
        setSelected(env.id);
        setEnvironment(env);
        // Definition is retained even if the later build request encounters a busy provider.
        const operation = await call('post', `/${env.id}/build`, {
          expected_version: env.version,
        });
        onOperation(operation.id);
      }
      setEditor(undefined);
      await load();
    } catch {
      message.error(
        '保存或构建失败；请检查输入并刷新，已保存的定义可重新构建。',
      );
    } finally {
      setSubmitting(false);
    }
  };
  const current = builds.find((x) => x.id === environment?.current_build_id),
    desired = revisions.find((x) => x.id === environment?.current_revision_id),
    disabled = busy || submitting;
  return (
    <div
      style={{
        maxHeight: 'calc(100vh - 190px)',
        overflowY: 'auto',
        paddingRight: 8,
      }}
    >
      {error && (
        <Alert
          type="error"
          message={error}
          action={<Button onClick={() => load()}>重试</Button>}
        />
      )}
      <Card
        title="Python Environments"
        extra={
          <Button
            type="primary"
            onClick={() => edit('create')}
            disabled={
              disabled ||
              !runtimes.some(
                (x) => x.state === 'READY' && x.health === 'HEALTHY',
              )
            }
          >
            创建环境
          </Button>
        }
      >
        <Table
          rowKey="id"
          dataSource={rows}
          pagination={{ pageSize: 10 }}
          scroll={{ x: 900 }}
          columns={[
            {
              title: 'Name',
              dataIndex: 'name',
              render: (name: string, row: any) => (
                <Button
                  type="link"
                  onClick={() => {
                    setEnvironment(row);
                    setSelected(row.id);
                  }}
                >
                  {name}
                </Button>
              ),
            },
            { title: 'Python', dataIndex: 'runtime_version' },
            {
              title: 'Status',
              render: (_: any, row: any) => (
                <Tag>
                  {row.state} / {row.health}
                </Tag>
              ),
            },
            {
              title: 'Current Build',
              dataIndex: 'current_build_id',
              render: (x: number) => (x ? `#${x}` : '—'),
            },
            {
              title: 'Direct / Resolved',
              render: (_: any, row: any) =>
                `${row.direct_packages} / ${row.resolved_packages}`,
            },
            { title: 'Updated', dataIndex: 'updatedAt' },
          ]}
        />
      </Card>
      {environment && (
        <Card
          title={`Environment: ${environment.name}`}
          style={{ marginTop: 16 }}
          extra={
            <Space>
              <Button disabled={disabled} onClick={() => edit('metadata')}>
                编辑信息
              </Button>
              <Button disabled={disabled} onClick={() => edit('clone')}>
                克隆
              </Button>
              <Popconfirm
                title="删除此环境及其未被占用的构建？"
                onConfirm={async () => {
                  await act(`/${environment.id}`, true);
                  setSelected(undefined);
                  setEnvironment(undefined);
                }}
              >
                <Button danger disabled={disabled}>
                  删除环境
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          <Tabs
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <>
                    <Descriptions column={2}>
                      <Descriptions.Item label="Environment ID">
                        {environment.id}
                      </Descriptions.Item>
                      <Descriptions.Item label="Runtime ID">
                        {environment.runtime_id}
                      </Descriptions.Item>
                      <Descriptions.Item label="State">
                        {environment.state}
                      </Descriptions.Item>
                      <Descriptions.Item label="Current Build">
                        {environment.current_build_id ?? '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Desired Revision">
                        {environment.current_revision_id}
                      </Descriptions.Item>
                      <Descriptions.Item label="Build Health">
                        {current?.health ?? 'UNVERIFIED'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Disk Usage">
                        {current?.metadata.disk_bytes ?? 0} bytes
                      </Descriptions.Item>
                      <Descriptions.Item label="Python executable">
                        {current?.health === 'HEALTHY'
                          ? 'Verified'
                          : 'Unverified'}
                      </Descriptions.Item>
                    </Descriptions>
                    {environment.last_error && (
                      <Alert type="warning" message={environment.last_error} />
                    )}
                    <Button
                      disabled={disabled}
                      onClick={() => act(`/${environment.id}/rebuild`)}
                    >
                      重新构建
                    </Button>
                  </>
                ),
              },
              {
                key: 'dependencies',
                label: 'Dependencies',
                children: (
                  <>
                    <Space>
                      <Button
                        disabled={disabled}
                        onClick={() => edit('dependencies')}
                      >
                        编辑依赖并构建
                      </Button>
                      <Button
                        disabled={!current}
                        onClick={async () => {
                          const result = await call(
                            'get',
                            `/${environment.id}/builds/${current.id}/freeze`,
                          );
                          Modal.info({
                            title: 'Resolved Requirements',
                            width: 700,
                            content: (
                              <Typography.Paragraph
                                copyable={{ text: result.text }}
                              >
                                <pre>{result.text}</pre>
                              </Typography.Paragraph>
                            ),
                          });
                        }}
                      >
                        导出 Resolved Requirements
                      </Button>
                    </Space>
                    <Typography.Paragraph>
                      依赖变更会创建新的 Revision 和 Build；已发布构建保持完整。
                    </Typography.Paragraph>
                    <Table
                      size="small"
                      rowKey="normalized_name"
                      pagination={false}
                      dataSource={desired?.dependencies ?? []}
                      columns={[
                        {
                          title: 'Direct Package',
                          dataIndex: 'normalized_name',
                        },
                        {
                          title: 'Desired Requirement',
                          dataIndex: 'requirement',
                        },
                      ]}
                    />
                    <Table
                      size="small"
                      rowKey="name"
                      pagination={false}
                      dataSource={current?.resolved ?? []}
                      columns={[
                        { title: 'Resolved Package', dataIndex: 'name' },
                        { title: 'Version', dataIndex: 'version' },
                        {
                          title: 'Relation',
                          dataIndex: 'direct',
                          render: (x: boolean) =>
                            x ? 'Direct' : 'Transitive / Toolchain',
                        },
                        { title: 'Index Policy', dataIndex: 'source_index' },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'builds',
                label: 'Builds',
                children: (
                  <>
                    <Space>
                      <Select
                        mode="multiple"
                        placeholder="选择两个 Build 比较"
                        style={{ minWidth: 250 }}
                        value={pair}
                        onChange={(x) => setPair(x.slice(-2))}
                        options={builds.map((x) => ({
                          value: x.id,
                          label: `Build #${x.id}`,
                        }))}
                      />
                      <Button
                        disabled={pair.length !== 2}
                        onClick={async () =>
                          setComparison(
                            await call(
                              'get',
                              `/${environment.id}/diff?from=${pair[0]}&to=${pair[1]}`,
                            ),
                          )
                        }
                      >
                        比较构建
                      </Button>
                    </Space>
                    {comparison && (
                      <div
                        aria-label="Build dependency diff"
                        style={{ margin: '12px 0' }}
                      >
                        <Typography.Text>
                          Build #{comparison.from} → #{comparison.to}
                        </Typography.Text>
                        <Table
                          size="small"
                          rowKey="name"
                          pagination={false}
                          scroll={{ y: 180 }}
                          dataSource={[
                            ...comparison.added.map((x: any) => ({
                              name: x.name,
                              from: '—',
                              to: x.version,
                              change: 'Added',
                            })),
                            ...comparison.removed.map((x: any) => ({
                              name: x.name,
                              from: x.version,
                              to: '—',
                              change: 'Removed',
                            })),
                            ...comparison.changed.map((x: any) => ({
                              ...x,
                              change: 'Changed',
                            })),
                          ]}
                          columns={[
                            { title: 'Package', dataIndex: 'name' },
                            { title: 'Before', dataIndex: 'from' },
                            { title: 'After', dataIndex: 'to' },
                            { title: 'Change', dataIndex: 'change' },
                          ]}
                        />
                      </div>
                    )}
                    <Table
                      rowKey="id"
                      dataSource={builds}
                      pagination={false}
                      scroll={{ x: 1000, y: 300 }}
                      columns={[
                        {
                          title: 'Build',
                          dataIndex: 'id',
                          render: (x: number) => (
                            <span>
                              #{x}{' '}
                              {x === environment.current_build_id && (
                                <Tag color="green">Current</Tag>
                              )}
                            </span>
                          ),
                        },
                        { title: 'Revision', dataIndex: 'revision_id' },
                        { title: 'Runtime', dataIndex: 'runtime_id' },
                        {
                          title: 'Status',
                          render: (_: any, x: any) =>
                            `${x.state} / ${x.health}`,
                        },
                        {
                          title: 'Packages',
                          dataIndex: 'resolved',
                          render: (x: any[]) => x.length,
                        },
                        { title: 'Created', dataIndex: 'createdAt' },
                        {
                          title: 'Actions',
                          render: (_: any, x: any) => (
                            <Space>
                              <Button
                                disabled={disabled || x.state !== 'READY'}
                                onClick={() =>
                                  act(
                                    `/${environment.id}/builds/${x.id}/verify`,
                                  )
                                }
                              >
                                验证构建
                              </Button>
                              <Button
                                disabled={
                                  disabled ||
                                  x.state !== 'READY' ||
                                  x.id === environment.current_build_id
                                }
                                onClick={() =>
                                  act(
                                    `/${environment.id}/builds/${x.id}/promote`,
                                  )
                                }
                              >
                                设为 Current
                              </Button>
                              <Popconfirm
                                title="删除未使用的构建？"
                                onConfirm={() =>
                                  act(`/${environment.id}/builds/${x.id}`, true)
                                }
                              >
                                <Button
                                  danger
                                  disabled={
                                    disabled ||
                                    x.id === environment.current_build_id
                                  }
                                >
                                  删除构建
                                </Button>
                              </Popconfirm>
                            </Space>
                          ),
                        },
                      ]}
                    />
                  </>
                ),
              },
              {
                key: 'operations',
                label: 'Operations',
                children: (
                  <Table
                    rowKey="id"
                    dataSource={operations}
                    pagination={false}
                    columns={[
                      { title: 'ID', dataIndex: 'id' },
                      { title: 'Operation', dataIndex: 'operation_type' },
                      { title: 'Status', dataIndex: 'status' },
                      { title: 'Stage', dataIndex: 'stage' },
                      {
                        title: 'Log',
                        render: (_: any, x: any) => (
                          <Button onClick={() => onOperation(x.id)}>
                            查看操作日志
                          </Button>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        </Card>
      )}
      <Modal
        title={
          editor === 'create'
            ? '创建 Python Environment'
            : editor === 'dependencies'
            ? '编辑依赖并构建'
            : editor === 'clone'
            ? '克隆 Environment'
            : '编辑 Environment'
        }
        open={!!editor}
        onCancel={() => setEditor(undefined)}
        onOk={save}
        confirmLoading={submitting}
        okText={editor === 'metadata' ? '保存' : '保存并构建'}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          {editor !== 'dependencies' && (
            <Form.Item
              name="name"
              label="Environment Name"
              rules={[{ required: true, max: 100 }]}
            >
              <Input />
            </Form.Item>
          )}
          {(editor === 'create' || editor === 'metadata') && (
            <Form.Item name="description" label="Description">
              <Input.TextArea maxLength={1000} />
            </Form.Item>
          )}
          {(editor === 'create' || editor === 'dependencies') && (
            <>
              <Form.Item
                name="runtime_id"
                label="Python Runtime"
                rules={[{ required: true }]}
              >
                <Select
                  options={runtimes
                    .filter(
                      (x) => x.state === 'READY' && x.health === 'HEALTHY',
                    )
                    .map((x) => ({
                      value: x.id,
                      label: `CPython ${x.version} (#${x.id})`,
                    }))}
                />
              </Form.Item>
              <Form.Item
                name="requirements"
                label="Dependencies — 每行一个 PEP 508 requirement"
              >
                <Input.TextArea
                  rows={6}
                  placeholder={'requests==2.32.3\nhttpx[http2]>=0.27,<0.29'}
                />
              </Form.Item>
              <Alert
                type="info"
                message="默认使用公开 PyPI；暂不支持私有认证源、URL、VCS 或本地路径。"
              />
            </>
          )}
        </Form>
      </Modal>
    </div>
  );
}
