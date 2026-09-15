import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Checkbox,
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
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
const base = `${config.apiPrefix}runtime/node`;
export default function NodeRuntime({
  onOperation,
}: {
  onOperation: (id: number) => void;
}) {
  const [runtimes, setRuntimes] = useState<any[]>([]),
    [tools, setTools] = useState<any[]>([]),
    [catalog, setCatalog] = useState<any[]>([]),
    [envs, setEnvs] = useState<any[]>([]),
    [operations, setOperations] = useState<any[]>([]);
  const [tab, setTab] = useState('versions'),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState<any>(),
    [revisions, setRevisions] = useState<any[]>([]),
    [builds, setBuilds] = useState<any[]>([]),
    [detailTab, setDetailTab] = useState('overview'),
    [editing, setEditing] = useState(false),
    [busy, setBusy] = useState(false),
    [lts, setLts] = useState(true),
    [filter, setFilter] = useState('NODE'),
    [diff, setDiff] = useState<any[] | undefined>(),
    [from, setFrom] = useState<number>(),
    [to, setTo] = useState<number>(),
    [exported, setExported] = useState<any>(),
    [error, setError] = useState('');
  const [form] = Form.useForm(),
    runtimeId = Form.useWatch('runtime_id', form);
  async function load() {
    const results = await Promise.all(
      ['installations', 'toolchains', 'catalog', 'environments'].map((x) =>
        request.get(base + '/' + x),
      ),
    );
    if (results.some((x) => x.code !== 200)) throw Error('NODE_READ_FAILED');
    setRuntimes(results[0].data);
    setTools(results[1].data);
    setCatalog(results[2].data.versions);
    setEnvs(results[3].data);
    const ops = await request.get(`${config.apiPrefix}runtime/operations`);
    setOperations(ops.data ?? []);
    setError('');
    if (selected) {
      const [e, r, b] = await Promise.all(
        ['', '/revisions', '/builds'].map((x) =>
          request.get(`${base}/environments/${selected.id}${x}`),
        ),
      );
      if (e.code === 200) {
        setSelected(e.data);
        setRevisions(r.data);
        setBuilds(b.data);
      }
    }
  }
  useEffect(() => {
    void load().catch(() => setError('无法读取 Node.js 资源'));
    const timer = setInterval(() => void load().catch(() => {}), 2000);
    return () => clearInterval(timer);
  }, [selected?.id]);
  async function perform(url: string, data: any = {}, remove = false) {
    setBusy(true);
    try {
      const result = remove
        ? await request.delete(base + '/' + url, { data })
        : await request.post(base + '/' + url, data);
      if (result.code !== 200) return false;
      if (result.data?.operation_type) onOperation(result.data.id);
      await load();
      return result.data;
    } catch {
      message.error('请求失败，请查看错误与资源状态');
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function openEnvironment(env: any) {
    setSelected(env);
    setDetailTab('overview');
    setDiff(undefined);
    const [r, b] = await Promise.all(
      ['revisions', 'builds'].map((x) =>
        request.get(`${base}/environments/${env.id}/${x}`),
      ),
    );
    setRevisions(r.data);
    setBuilds(b.data);
  }
  function begin(mode: string) {
    form.resetFields();
    setModal(mode);
    if (mode === 'environment') {
      setEditing(false);
      form.setFieldsValue({
        install_scripts_policy: 'ALLOW',
        production_only: false,
        dependencies: [],
      });
    }
    if (mode === 'toolchain')
      form.setFieldsValue({ manager_type: 'PNPM', version: '10.17.1' });
  }
  async function edit() {
    const rev = revisions.find((x) => x.id === selected.current_revision_id);
    form.resetFields();
    form.setFieldsValue({
      ...selected,
      ...rev,
      name: selected.name,
      description: selected.description,
    });
    setEditing(true);
    setModal('environment');
  }
  const envAction = async (action: string, build?: number, remove = false) =>
    perform(
      `environments/${selected.id}${build ? '/builds/' + build : ''}${
        action ? '/' + action : ''
      }`,
      { expected_version: selected.version },
      remove,
    );
  const columns = [
    { title: 'Package', dataIndex: 'name' },
    { title: 'Specifier', dataIndex: 'specifier' },
    { title: 'Type', dataIndex: 'type' },
  ];
  const current = builds.find((x) => x.id === selected?.current_build_id),
    desired = revisions.find((x) => x.id === selected?.current_revision_id);
  const download = (name: string, text: string) => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' })),
      a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div
      style={{
        maxHeight: 'calc(100vh - 200px)',
        overflowY: 'auto',
        paddingBottom: 24,
      }}
    >
      {error && <Alert type="error" message={error} />}
      <Tabs
        activeKey={tab}
        onChange={setTab}
        items={[
          {
            key: 'versions',
            label: 'Versions',
            children: (
              <>
                <Space wrap style={{ marginBottom: 16 }}>
                  <Button onClick={() => perform('catalog')}>
                    刷新 Node Catalog
                  </Button>
                  <Button type="primary" onClick={() => begin('runtime')}>
                    安装 Node.js
                  </Button>
                  <Button onClick={() => begin('toolchain')}>
                    安装 Package Manager
                  </Button>
                </Space>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={runtimes}
                  pagination={{ pageSize: 8 }}
                  scroll={{ x: 1050 }}
                  columns={[
                    { title: 'Node Version', dataIndex: 'version' },
                    {
                      title: 'LTS',
                      render: (_, r) =>
                        catalog.find((x) => x.version === r.version)?.lts ||
                        '—',
                    },
                    { title: 'Status', dataIndex: 'state' },
                    { title: 'Health', dataIndex: 'health' },
                    {
                      title: 'Platform',
                      render: (_, r) =>
                        `${r.metadata.platform ?? '—'} / ${
                          r.metadata.architecture ?? '—'
                        }`,
                    },
                    { title: 'Installed', dataIndex: 'installed_at' },
                    {
                      title: '操作',
                      render: (_, r) => (
                        <Space>
                          <Button
                            onClick={() =>
                              perform(`installations/${r.id}/verify`)
                            }
                          >
                            验证
                          </Button>
                          <Button
                            onClick={async () => {
                              const x = await request.get(
                                `${base}/installations/${r.id}/references`,
                              );
                              setExported({
                                title: 'Runtime References',
                                text: JSON.stringify(x.data, null, 2),
                              });
                            }}
                          >
                            引用
                          </Button>
                          <Popconfirm
                            title="重新下载精确版本并隔离旧目录？有引用时拒绝。"
                            onConfirm={() =>
                              perform(`installations/${r.id}/repair`)
                            }
                          >
                            <Button>修复</Button>
                          </Popconfirm>
                          <Popconfirm
                            title="删除此 Node Runtime？"
                            onConfirm={() =>
                              perform(`installations/${r.id}`, {}, true)
                            }
                          >
                            <Button danger>删除</Button>
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]}
                />
                <Card
                  title="Package Manager Toolchains"
                  style={{ marginTop: 16 }}
                >
                  <Table
                    rowKey="id"
                    size="small"
                    dataSource={tools}
                    pagination={{ pageSize: 8 }}
                    columns={[
                      { title: 'ID', dataIndex: 'id' },
                      {
                        title: 'Node',
                        render: (_, r) =>
                          runtimes.find((x) => x.id === r.runtime_id)?.version,
                      },
                      { title: 'Manager', dataIndex: 'manager_type' },
                      { title: 'Exact Version', dataIndex: 'version' },
                      { title: 'State', dataIndex: 'state' },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Space>
                            <Button
                              onClick={() =>
                                perform(`toolchains/${r.id}/verify`)
                              }
                            >
                              验证工具链
                            </Button>
                            <Popconfirm
                              title="删除未引用工具链？"
                              onConfirm={() =>
                                perform(`toolchains/${r.id}`, {}, true)
                              }
                            >
                              <Button danger>删除工具链</Button>
                            </Popconfirm>
                          </Space>
                        ),
                      },
                    ]}
                  />
                </Card>
              </>
            ),
          },
          {
            key: 'environments',
            label: 'Environments',
            children: (
              <>
                <Button
                  type="primary"
                  onClick={() => begin('environment')}
                  style={{ marginBottom: 16 }}
                >
                  创建 Node Environment
                </Button>
                <Table
                  rowKey="id"
                  size="small"
                  dataSource={envs}
                  scroll={{ x: 1000 }}
                  columns={[
                    {
                      title: 'Name',
                      dataIndex: 'name',
                      render: (text, r) => (
                        <Button type="link" onClick={() => openEnvironment(r)}>
                          {text}
                        </Button>
                      ),
                    },
                    {
                      title: 'Node',
                      render: (_, r) =>
                        runtimes.find((x) => x.id === r.runtime_id)?.version,
                    },
                    {
                      title: 'Package Manager',
                      render: (_, r) => {
                        const t = tools.find((x) => x.id === r.toolchain_id);
                        return `${t?.manager_type ?? '—'} ${t?.version ?? ''}`;
                      },
                    },
                    { title: 'Current Build', dataIndex: 'current_build_id' },
                    { title: 'Status', dataIndex: 'state' },
                    { title: 'Health', dataIndex: 'health' },
                    {
                      title: '操作',
                      render: (_, r) => (
                        <Button onClick={() => openEnvironment(r)}>
                          查看环境
                        </Button>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Card
        title="Runtime Operations"
        style={{ marginTop: 16 }}
        extra={
          <Select
            aria-label="Operation language"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'ALL', label: 'All' },
              { value: 'PYTHON', label: 'Python' },
              { value: 'NODE', label: 'Node.js' },
            ]}
          />
        }
      >
        <Table
          rowKey="id"
          size="small"
          pagination={{ pageSize: 6 }}
          dataSource={operations.filter(
            (x) => filter === 'ALL' || x.language === filter,
          )}
          columns={[
            { title: 'ID', dataIndex: 'id' },
            { title: 'Operation', dataIndex: 'operation_type' },
            { title: 'Status', dataIndex: 'status' },
            { title: 'Stage', dataIndex: 'stage' },
            { title: 'Error', dataIndex: 'error_code' },
            {
              title: '操作',
              render: (_, r) => (
                <Button onClick={() => onOperation(r.id)}>日志</Button>
              ),
            },
          ]}
        />
      </Card>
      <Modal
        title={
          modal === 'runtime'
            ? '安装 Node.js'
            : modal === 'toolchain'
            ? '安装 Package Manager'
            : editing
            ? '编辑 Node Dependencies'
            : '创建 Node Environment'
        }
        open={!!modal}
        width={760}
        destroyOnClose
        confirmLoading={busy}
        onCancel={() => setModal('')}
        okText={modal === 'environment' ? '保存 Revision 并构建' : '安装'}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            if (modal === 'runtime') {
              if (await perform('installations', values)) setModal('');
            } else if (modal === 'toolchain') {
              if (await perform('toolchains', values)) setModal('');
            } else {
              const env = await perform(
                editing
                  ? `environments/${selected.id}/revisions`
                  : 'environments',
                {
                  ...values,
                  ...(editing ? { expected_version: selected.version } : {}),
                },
              );
              if (env) {
                setModal('');
                setSelected(env);
                await perform(`environments/${env.id}/build`, {
                  expected_version: env.version,
                });
              }
            }
          } catch {}
        }}
      >
        <Form form={form} layout="vertical">
          {modal === 'runtime' ? (
            <>
              <Checkbox
                checked={lts}
                onChange={(e) => setLts(e.target.checked)}
              >
                LTS only
              </Checkbox>
              <Form.Item
                name="version"
                label="Exact Node Version"
                rules={[{ required: true }]}
              >
                <Select
                  showSearch
                  options={catalog
                    .filter((x) => !lts || x.lts)
                    .map((x) => ({
                      value: x.version,
                      label: `${x.version}${x.lts ? ' · LTS ' + x.lts : ''}`,
                      disabled: runtimes.some((r) => r.version === x.version),
                    }))}
                />
              </Form.Item>
            </>
          ) : (
            <>
              {modal === 'environment' && (
                <>
                  <Form.Item
                    name="name"
                    label="Name"
                    rules={[{ required: true, max: 100 }]}
                  >
                    <Input />
                  </Form.Item>
                  <Form.Item name="description" label="Description">
                    <Input />
                  </Form.Item>
                </>
              )}
              <Form.Item
                name="runtime_id"
                label="Node.js Runtime"
                rules={[{ required: true }]}
              >
                <Select
                  onChange={() => form.setFieldValue('toolchain_id', undefined)}
                  options={runtimes
                    .filter((x) => x.state === 'READY')
                    .map((x) => ({ value: x.id, label: x.version }))}
                />
              </Form.Item>
              {modal === 'toolchain' ? (
                <>
                  <Form.Item
                    name="manager_type"
                    label="Package Manager"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        { value: 'PNPM', label: 'pnpm' },
                        { value: 'NPM', label: 'Bundled npm' },
                      ]}
                    />
                  </Form.Item>
                  <Form.Item
                    name="version"
                    label="Exact pnpm Version (10.9+)"
                    extra="Bundled npm 使用所选 Runtime 自带的精确版本。"
                  >
                    <Input placeholder="10.17.1" />
                  </Form.Item>
                </>
              ) : (
                <>
                  <Form.Item
                    name="toolchain_id"
                    label="Package Manager Toolchain"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={tools
                        .filter(
                          (x) =>
                            x.state === 'READY' && x.runtime_id === runtimeId,
                        )
                        .map((x) => ({
                          value: x.id,
                          label: `${x.manager_type} ${x.version}`,
                        }))}
                    />
                  </Form.Item>
                  <Form.Item
                    name="install_scripts_policy"
                    label="Install Scripts"
                    rules={[{ required: true }]}
                  >
                    <Select
                      options={[
                        { value: 'ALLOW', label: 'Allow' },
                        { value: 'IGNORE', label: 'Ignore' },
                      ]}
                    />
                  </Form.Item>
                  <Alert
                    type="warning"
                    showIcon
                    message="安装 Node 依赖可能以平台进程的 OS 权限执行第三方生命周期脚本。此功能不是沙箱。"
                  />
                  <Form.Item name="production_only" valuePropName="checked">
                    <Checkbox>
                      Production only（不安装 devDependencies）
                    </Checkbox>
                  </Form.Item>
                  <Form.List name="dependencies">
                    {(fields, { add, remove }) => (
                      <>
                        <p>
                          Desired Dependencies · 推荐精确版本，也支持 semver
                          range
                        </p>
                        {fields.map((field) => (
                          <Space key={field.key} align="baseline">
                            <Form.Item
                              name={[field.name, 'name']}
                              rules={[{ required: true }]}
                            >
                              <Input
                                placeholder="@scope/package"
                                aria-label="Package name"
                              />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, 'specifier']}
                              rules={[{ required: true }]}
                            >
                              <Input
                                placeholder="1.0.0"
                                aria-label="Package specifier"
                              />
                            </Form.Item>
                            <Form.Item
                              name={[field.name, 'type']}
                              rules={[{ required: true }]}
                            >
                              <Select
                                style={{ width: 160 }}
                                options={[
                                  { value: 'DEPENDENCY', label: 'dependency' },
                                  {
                                    value: 'DEV_DEPENDENCY',
                                    label: 'devDependency',
                                  },
                                ]}
                              />
                            </Form.Item>
                            <Button onClick={() => remove(field.name)}>
                              移除
                            </Button>
                          </Space>
                        ))}
                        <Button
                          onClick={() =>
                            add({ name: '', specifier: '', type: 'DEPENDENCY' })
                          }
                        >
                          添加依赖
                        </Button>
                      </>
                    )}
                  </Form.List>
                </>
              )}
            </>
          )}
        </Form>
      </Modal>
      <Modal
        title={`Node Environment · ${selected?.name ?? ''}`}
        open={!!selected}
        width="92vw"
        footer={null}
        onCancel={() => setSelected(undefined)}
      >
        {selected && (
          <Tabs
            activeKey={detailTab}
            onChange={setDetailTab}
            items={[
              {
                key: 'overview',
                label: 'Overview',
                children: (
                  <>
                    <Descriptions bordered size="small">
                      <Descriptions.Item label="ID">
                        {selected.id}
                      </Descriptions.Item>
                      <Descriptions.Item label="State">
                        {selected.state}
                      </Descriptions.Item>
                      <Descriptions.Item label="Current Build">
                        {selected.current_build_id ?? '—'}
                      </Descriptions.Item>
                      <Descriptions.Item label="Desired Revision">
                        {selected.current_revision_id}
                      </Descriptions.Item>
                      <Descriptions.Item label="Install Scripts">
                        {selected.install_scripts_policy}
                      </Descriptions.Item>
                      <Descriptions.Item label="Last Error">
                        {selected.last_error ?? '—'}
                      </Descriptions.Item>
                    </Descriptions>
                    <Space wrap style={{ marginTop: 16 }}>
                      <Button onClick={() => envAction('build')}>
                        构建 Desired
                      </Button>
                      <Button
                        onClick={() => envAction('rebuild')}
                        disabled={!current}
                      >
                        Frozen Rebuild
                      </Button>
                      <Button onClick={() => envAction('resolve')}>
                        Resolve New Build
                      </Button>
                      <Button
                        onClick={() => {
                          form.resetFields();
                          form.setFieldsValue({
                            name: selected.name,
                            description: selected.description,
                          });
                          setExported({
                            mode: 'metadata',
                            title: '编辑环境信息',
                          });
                        }}
                      >
                        编辑信息
                      </Button>
                      <Button
                        onClick={() => {
                          form.resetFields();
                          form.setFieldsValue({
                            name: selected.name + '-copy',
                          });
                          setExported({
                            mode: 'clone',
                            title: 'Clone Environment',
                          });
                        }}
                      >
                        Clone
                      </Button>
                      <Popconfirm
                        title="删除环境及其 Builds？Runtime、Toolchain 和缓存保留。"
                        onConfirm={async () => {
                          if (await envAction('', undefined, true))
                            setSelected(undefined);
                        }}
                      >
                        <Button danger>删除环境</Button>
                      </Popconfirm>
                    </Space>
                  </>
                ),
              },
              {
                key: 'dependencies',
                label: 'Dependencies',
                children: (
                  <>
                    <Button onClick={edit}>编辑依赖</Button>
                    <h4>Desired Dependencies</h4>
                    <Table
                      rowKey="name"
                      size="small"
                      dataSource={desired?.dependencies ?? []}
                      columns={columns}
                    />
                    <h4>Resolved Packages · Current Build</h4>
                    <Table
                      rowKey={(r) => r.name + '@' + r.version}
                      size="small"
                      dataSource={current?.resolved ?? []}
                      columns={[
                        { title: 'Package', dataIndex: 'name' },
                        { title: 'Version', dataIndex: 'version' },
                        {
                          title: 'Direct / Transitive',
                          render: (_, r) =>
                            r.direct ? 'Direct' : 'Transitive',
                        },
                        { title: 'Type', dataIndex: 'dependency_type' },
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
                    <Space wrap>
                      <Select
                        placeholder="Before Build"
                        dropdownStyle={{ zIndex: 1400 }}
                        style={{ width: 180 }}
                        value={from}
                        onChange={setFrom}
                        options={builds
                          .filter((x) => x.state === 'READY')
                          .map((x) => ({
                            value: x.id,
                            label: `Build #${x.id}`,
                          }))}
                      />
                      <Select
                        placeholder="After Build"
                        dropdownStyle={{ zIndex: 1400 }}
                        style={{ width: 180 }}
                        value={to}
                        onChange={setTo}
                        options={builds
                          .filter((x) => x.state === 'READY')
                          .map((x) => ({
                            value: x.id,
                            label: `Build #${x.id}`,
                          }))}
                      />
                      <Button
                        disabled={!from || !to}
                        onClick={async () => {
                          const r = await request.get(
                            `${base}/environments/${selected.id}/diff?from=${from}&to=${to}`,
                          );
                          setDiff(r.data);
                        }}
                      >
                        Build Diff
                      </Button>
                    </Space>
                    {diff && (
                      <Table
                        rowKey="name"
                        size="small"
                        scroll={{ y: 160 }}
                        dataSource={diff}
                        columns={[
                          { title: 'Package', dataIndex: 'name' },
                          {
                            title: 'Before',
                            dataIndex: 'before',
                            render: (v) => v.join(', '),
                          },
                          {
                            title: 'After',
                            dataIndex: 'after',
                            render: (v) => v.join(', '),
                          },
                          { title: 'Change', dataIndex: 'change' },
                        ]}
                      />
                    )}
                    <Table
                      rowKey="id"
                      size="small"
                      dataSource={builds}
                      scroll={{ x: 1100, y: 330 }}
                      columns={[
                        { title: 'Build', dataIndex: 'id' },
                        { title: 'Revision', dataIndex: 'revision_id' },
                        {
                          title: 'Node / Manager',
                          render: (_, r) =>
                            `${r.metadata.node_version ?? ''} / ${
                              r.metadata.manager_type ?? ''
                            } ${r.metadata.manager_version ?? ''}`,
                        },
                        {
                          title: 'Lock Hash',
                          dataIndex: 'lock_hash',
                          render: (v) => v?.slice(0, 12),
                        },
                        { title: 'Status', dataIndex: 'state' },
                        { title: 'Health', dataIndex: 'health' },
                        { title: 'Created', dataIndex: 'createdAt' },
                        {
                          title: '操作',
                          render: (_, r) => (
                            <Space>
                              <Button
                                disabled={r.state !== 'READY'}
                                onClick={() => envAction('verify', r.id)}
                              >
                                验证 Build
                              </Button>
                              <Button
                                disabled={
                                  r.state !== 'READY' ||
                                  r.id === selected.current_build_id
                                }
                                onClick={() => envAction('promote', r.id)}
                              >
                                Promote
                              </Button>
                              <Button
                                disabled={!r.lock_hash}
                                onClick={() =>
                                  setExported({
                                    title: `Build #${r.id} snapshots`,
                                    build: r,
                                  })
                                }
                              >
                                导出
                              </Button>
                              <Popconfirm
                                title="删除未引用 Build？"
                                onConfirm={() => envAction('', r.id, true)}
                              >
                                <Button
                                  danger
                                  disabled={r.id === selected.current_build_id}
                                >
                                  删除 Build
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
                    size="small"
                    dataSource={operations.filter(
                      (x) =>
                        x.language === 'NODE' &&
                        x.environment_id === selected.id,
                    )}
                    columns={[
                      { title: 'ID', dataIndex: 'id' },
                      { title: 'Type', dataIndex: 'operation_type' },
                      { title: 'Status', dataIndex: 'status' },
                      { title: 'Error', dataIndex: 'error_code' },
                      {
                        title: '操作',
                        render: (_, r) => (
                          <Button onClick={() => onOperation(r.id)}>
                            日志
                          </Button>
                        ),
                      },
                    ]}
                  />
                ),
              },
            ]}
          />
        )}
      </Modal>
      <Modal
        title={exported?.title}
        open={!!exported}
        width={800}
        onCancel={() => setExported(undefined)}
        footer={exported?.mode ? undefined : null}
        onOk={async () => {
          try {
            const values = await form.validateFields();
            if (exported.mode === 'clone') {
              const env = await perform(
                `environments/${selected.id}/clone`,
                values,
              );
              if (env)
                await perform(`environments/${env.id}/build`, {
                  expected_version: env.version,
                });
            } else {
              await request.patch(`${base}/environments/${selected.id}`, {
                ...values,
                expected_version: selected.version,
              });
              await load();
            }
            setExported(undefined);
          } catch {}
        }}
      >
        {exported?.mode ? (
          <Form form={form} layout="vertical">
            <Form.Item name="name" label="Name" rules={[{ required: true }]}>
              <Input />
            </Form.Item>
            {exported.mode === 'metadata' && (
              <Form.Item name="description" label="Description">
                <Input />
              </Form.Item>
            )}
          </Form>
        ) : exported?.build ? (
          <>
            <Space>
              <Button
                onClick={() =>
                  download('package.json', exported.build.package_json)
                }
              >
                下载 package.json
              </Button>
              <Button
                onClick={() =>
                  download(
                    exported.build.metadata.manager_type === 'PNPM'
                      ? 'pnpm-lock.yaml'
                      : 'package-lock.json',
                    exported.build.lockfile,
                  )
                }
              >
                下载 Lockfile
              </Button>
            </Space>
            <pre style={{ maxHeight: '55vh', overflow: 'auto' }}>
              {exported.build.package_json + '\n' + exported.build.lockfile}
            </pre>
          </>
        ) : (
          <pre style={{ maxHeight: '55vh', overflow: 'auto' }}>
            {exported?.text}
          </pre>
        )}
      </Modal>
    </div>
  );
}
