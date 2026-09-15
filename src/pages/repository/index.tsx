import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  message,
  Modal,
  Popconfirm,
  Radio,
  Select,
  Space,
  Table,
  Tabs,
  Tag,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';

export default function RepositoryPage() {
  const [repositories, setRepositories] = useState<any[]>([]);
  const [credentials, setCredentials] = useState<any[]>([]);
  const [editor, setEditor] = useState<{
    kind: 'repositories' | 'git-credentials';
    row: any;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [parsed, setParsed] = useState<any>();
  const [testTarget, setTestTarget] = useState<any>();
  const [testUrl, setTestUrl] = useState('');
  const [form] = Form.useForm();
  const auth = Form.useWatch('auth_type', form);
  const replace = Form.useWatch('replace_secret', form);
  const load = async () => {
    const [r, c] = await Promise.all([
      request.get(`${config.apiPrefix}repositories`),
      request.get(`${config.apiPrefix}git-credentials`),
    ]);
    if (r.code === 200) setRepositories(r.data);
    if (c.code === 200) setCredentials(c.data);
  };
  useEffect(() => {
    load().catch(() => {});
  }, []);
  const open = (kind: 'repositories' | 'git-credentials', row: any = {}) => {
    setEditor({ kind, row });
    setParsed(undefined);
    form.resetFields();
    // API metadata only. Secret fields are never populated from existing records.
    form.setFieldsValue(
      kind === 'repositories'
        ? {
            name: row.name,
            remote_url: row.remote_url,
            default_credential_id: row.default_credential_id ?? null,
          }
        : {
            name: row.name,
            provider: row.provider || 'generic',
            auth_type: row.auth_type || 'anonymous',
            username: row.username,
            known_hosts: row.known_hosts,
            capability: row.capability || 'READ',
            status: row.status || 'enabled',
            replace_secret: !row.id,
          },
    );
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      if (!editor) return;
      setBusy(true);
      if (editor.kind === 'git-credentials') {
        if (values.auth_type === 'anonymous' || !values.replace_secret) {
          delete values.token;
          delete values.private_key;
          delete values.passphrase;
        } else if (values.auth_type === 'https_token') {
          delete values.private_key;
          delete values.passphrase;
        } else delete values.token;
      }
      const result = await request[editor.row.id ? 'put' : 'post'](
        `${config.apiPrefix}${editor.kind}`,
        { ...values, ...(editor.row.id ? { id: editor.row.id } : {}) },
      );
      if (result.code === 200) {
        setEditor(null);
        form.resetFields();
        await load();
        message.success('已保存');
      }
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const remove = async (kind: string, id: number) => {
    try {
      await request.delete(`${config.apiPrefix}${kind}/${id}`);
      await load();
    } catch {}
  };
  const test = async (kind: string, id: number, remote_url?: string) => {
    setBusy(true);
    try {
      const r = await request.post(
        `${config.apiPrefix}${kind}/${id}/test`,
        remote_url ? { remote_url } : {},
      );
      if (r.code === 200) {
        (r.data.status === 'available' ? message.success : message.warning)(
          r.data.message,
        );
        setTestTarget(null);
        await load();
      }
    } catch {
    } finally {
      setBusy(false);
    }
  };
  const credentialOptions = [
    { value: null, label: 'Anonymous / 无凭证' },
    ...credentials.map((c) => ({
      value: c.id,
      label: `${c.name} (${c.auth_type}, ${c.status})`,
    })),
  ];
  const actions = (kind: 'repositories' | 'git-credentials', row: any) => (
    <Space wrap>
      {kind === 'repositories' && <Button size="small" href={`${config.baseUrl}repository-workspace?id=${row.id}`}>工作区</Button>}
      <Button size="small" onClick={() => open(kind, row)}>
        编辑
      </Button>
      <Button
        size="small"
        loading={busy}
        onClick={() =>
          kind === 'repositories'
            ? test(kind, row.id)
            : (setTestTarget(row), setTestUrl(''))
        }
      >
        测试访问
      </Button>
      <Popconfirm
        title="删除此资源？被引用的资源不能删除。"
        onConfirm={() => remove(kind, row.id)}
      >
        <Button
          size="small"
          danger
          disabled={
            kind === 'repositories'
              ? row.subscriptions_count > 0
              : row.used_by?.total > 0
          }
        >
          删除
        </Button>
      </Popconfirm>
    </Space>
  );
  return (
    <div style={{ padding: 24 }}>
      <h2>仓库管理</h2>
      <Tabs
        items={[
          {
            key: 'repositories',
            label: 'Repositories / 仓库',
            children: (
              <>
                <Button type="primary" onClick={() => open('repositories')}>
                  创建仓库
                </Button>
                <Table
                  rowKey="id"
                  dataSource={repositories}
                  scroll={{ x: 1000 }}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    { title: 'Provider', dataIndex: 'provider' },
                    { title: 'Remote', dataIndex: 'remote_url' },
                    {
                      title: '默认凭证',
                      render: (_, r) =>
                        credentials.find(
                          (c) => c.id === r.default_credential_id,
                        )?.name || 'Anonymous',
                    },
                    { title: '订阅数', dataIndex: 'subscriptions_count' },
                    { title: '状态', dataIndex: 'status' },
                    {
                      title: '操作',
                      render: (_, r) => actions('repositories', r),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'credentials',
            label: 'Credentials / 凭证',
            children: (
              <>
                <Button type="primary" onClick={() => open('git-credentials')}>
                  创建凭证
                </Button>
                <Table
                  rowKey="id"
                  dataSource={credentials}
                  scroll={{ x: 1200 }}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    { title: 'Provider', dataIndex: 'provider' },
                    { title: '认证类型', dataIndex: 'auth_type' },
                    { title: '用户名', dataIndex: 'username' },
                    {
                      title: '能力',
                      dataIndex: 'capability',
                      render: (v) => <Tag>{v}</Tag>,
                    },
                    {
                      title: 'Secret',
                      render: (_, r) => (r.has_secret ? '••••••••' : '—'),
                    },
                    {
                      title: '引用',
                      render: (_, r) =>
                        `${r.used_by.repositories} 仓库 / ${r.used_by.subscriptions} 订阅`,
                    },
                    { title: '状态', dataIndex: 'status' },
                    {
                      title: '最近测试',
                      render: (_, r) =>
                        r.last_test_at
                          ? `${r.last_test_result} · ${new Date(
                              r.last_test_at,
                            ).toLocaleString()}`
                          : '未测试',
                    },
                    {
                      title: '操作',
                      render: (_, r) => actions('git-credentials', r),
                    },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Modal
        open={!!editor}
        title={editor?.kind === 'repositories' ? '仓库信息' : 'Git 凭证'}
        onCancel={() => {
          setEditor(null);
          form.resetFields();
        }}
        onOk={save}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="名称" rules={[{ required: true }]}>
            <Input maxLength={255} />
          </Form.Item>
          {editor?.kind === 'repositories' ? (
            <>
              <Form.Item
                name="remote_url"
                label="Remote URL"
                rules={[{ required: true }]}
                extra="支持 HTTPS、SSH 和 Generic Git；URL 中不可包含 Token 或密码。保存后 Remote 固定。"
              >
                <Input
                  disabled={!!editor.row.id}
                  onBlur={async (e) => {
                    try {
                      const r = await request.post(
                        `${config.apiPrefix}repositories/normalize`,
                        { remote_url: e.target.value },
                      );
                      if (r.code === 200) setParsed(r.data);
                    } catch {
                      setParsed(undefined);
                    }
                  }}
                />
              </Form.Item>
              {parsed && (
                <Alert
                  type="info"
                  message={`${parsed.provider} · ${parsed.host}`}
                  description={`Owner: ${parsed.owner || '—'} / Repository: ${
                    parsed.repository_name
                  } / Path: ${parsed.path}`}
                  style={{ marginBottom: 16 }}
                />
              )}
              <Form.Item name="default_credential_id" label="默认凭证">
                <Select options={credentialOptions} />
              </Form.Item>
              {editor.row.id && (
                <Button
                  loading={busy}
                  onClick={() => test('repositories', editor.row.id)}
                >
                  测试已保存的仓库
                </Button>
              )}
              {!editor.row.id && <p>保存后可测试访问。</p>}
            </>
          ) : (
            <>
              <Form.Item
                name="provider"
                label="Provider"
                rules={[{ required: true }]}
              >
                <Select
                  options={['github', 'gitlab', 'gitee', 'generic'].map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Form.Item>
              <Form.Item name="auth_type" label="认证方式">
                <Select
                  disabled={!!editor?.row.id}
                  options={['anonymous', 'https_token', 'ssh_key'].map(
                    (value) => ({ value, label: value }),
                  )}
                />
              </Form.Item>
              <Form.Item name="username" label="用户名">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name="capability" label="能力">
                <Select
                  options={[
                    { value: 'READ', label: 'READ' },
                    { value: 'WRITE', label: 'WRITE' },
                  ]}
                />
              </Form.Item>
              <Form.Item name="status" label="状态">
                <Select
                  options={[
                    { value: 'enabled', label: '启用' },
                    { value: 'disabled', label: '停用' },
                  ]}
                />
              </Form.Item>
              {auth !== 'anonymous' && (
                <Form.Item
                  name="replace_secret"
                  label="Secret"
                  initialValue={!editor?.row.id}
                >
                  <Radio.Group>
                    <Radio value={false} disabled={!editor?.row.id}>
                      保持现有 Secret
                    </Radio>
                    <Radio value={true}>替换 Secret</Radio>
                  </Radio.Group>
                </Form.Item>
              )}
              {replace && auth === 'https_token' && (
                <Form.Item
                  name="token"
                  label="Token"
                  rules={[{ required: true }]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              )}
              {replace && auth === 'ssh_key' && (
                <>
                  <Form.Item
                    name="private_key"
                    label="SSH Private Key"
                    rules={[{ required: true }]}
                  >
                    <Input.TextArea rows={5} autoComplete="off" />
                  </Form.Item>
                  <Form.Item name="passphrase" label="Passphrase（可选）">
                    <Input.Password autoComplete="new-password" />
                  </Form.Item>
                </>
              )}
              {(auth === 'ssh_key' || auth === 'anonymous') && (
                <Form.Item
                  name="known_hosts"
                  label="已验证的 known_hosts"
                  rules={[{ required: auth === 'ssh_key' }]}
                  extra="请通过可信渠道核对主机公钥。SSH 连接强制校验主机身份。"
                >
                  <Input.TextArea rows={3} />
                </Form.Item>
              )}
              {editor?.row.public_key && (
                <Form.Item label="公钥">
                  <Input.TextArea readOnly value={editor.row.public_key} />
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </Modal>
      <Modal
        open={!!testTarget}
        title={`测试凭证：${testTarget?.name || ''}`}
        confirmLoading={busy}
        onCancel={() => setTestTarget(null)}
        onOk={() => test('git-credentials', testTarget.id, testUrl)}
      >
        <p>请输入使用此凭证访问的仓库 URL。测试只读取远端引用。</p>
        <Input
          value={testUrl}
          onChange={(e) => setTestUrl(e.target.value)}
          placeholder="https://host/team/repo.git"
        />
      </Modal>
    </div>
  );
}
