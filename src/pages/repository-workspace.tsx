import { ConfigBindings } from '@/components/config-bindings';
import { TaskResourceReferences } from '@/components/task-resource-references';
import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
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
  Typography,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import RepositoryEnvironment from '@/components/repository-environment';
const explanations: Record<string, string> = {
  WORKTREE_DIRTY:
    '工作区包含未提交、未跟踪或忽略文件，操作已停止。请先自行保存或提交。',
  WORKTREE_CONFLICT: '工作区存在冲突，操作已停止。',
  WORKTREE_DIVERGED: '本地分支与远端已分叉，不会自动 merge、rebase 或 reset。',
  WORKTREE_LOCAL_COMMITS: '工作区包含本地提交，删除已被阻止。',
  WORKTREE_IN_USE:
    '工作区仍被订阅引用，请先修改或删除订阅绑定。',
  WORKTREE_BUSY: '工作区正被其他操作占用，请稍后刷新。',
  REPOSITORY_BUSY: '仓库正在执行其他操作，请稍后刷新。',
  WORKTREE_STALE:
    '工作区元数据失配。目录缺失时，先 Prune，再选择 Repair 或移除记录。',
  REF_NOT_FOUND: '指定的引用不存在，请先 Fetch 并检查分支。',
  DETACHED_HEAD: '此工作区固定在 commit/tag，不执行分支更新。',
};
export default function RepositoryWorkspacePage() {
  const id = Number(new URLSearchParams(window.location.search).get('id'));
  const [repo, setRepo] = useState<any>(),
    [diagnostics, setDiagnostics] = useState<any>(),
    [refs, setRefs] = useState<any[]>([]),
    [trees, setTrees] = useState<any[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [detail, setDetail] = useState<any>(),
    [creating, setCreating] = useState(false),
    [refType, setRefType] = useState<'branch' | 'tag' | 'commit'>('branch'),
    [activities, setActivities] = useState<any[]>([]),
    [remoteEdit, setRemoteEdit] = useState(false),
    [remote, setRemote] = useState('');
  const [form] = Form.useForm();
  const reload = async () => {
    const [metadata, status, worktrees] = await Promise.all([
      request.get(`${config.apiPrefix}repositories/${id}`),
      request.get(`${config.apiPrefix}repositories/${id}/status`),
      request.get(`${config.apiPrefix}repositories/${id}/worktrees`),
    ]);
    if (metadata.code === 200) setRepo(metadata.data);
    if (status.code === 200) {
      setDiagnostics(status.data);
      if (status.data.repository)
        setRepo({ ...metadata.data, ...status.data.repository });
    }
    if (worktrees.code === 200) setTrees(worktrees.data);
    if (
      status.data?.repository?.storage_state === 'READY' &&
      !status.data?.lock?.busy
    ) {
      const r = await request.get(`${config.apiPrefix}repositories/${id}/refs`);
      if (r.code === 200) setRefs(r.data);
    } else setRefs([]);
  };
  useEffect(() => {
    reload().catch(() => {});
  }, [id]);
  const perform = async (
    label: string,
    url: string,
    method: 'post' | 'delete' | 'put' = 'post',
    body: any = {},
  ) => {
    setBusy(true);
    setError('');
    try {
      const endpoint = `${config.apiPrefix}${url}`;
      const result =
        method === 'delete'
          ? await request.delete(endpoint)
          : await request[method](endpoint, body, { timeout: 330000 });
      if (result.code === 200) {
        setActivities((a) => [
          { at: new Date().toLocaleString(), action: label, result: '完成' },
          ...a,
        ]);
        await reload();
        message.success(`${label}完成`);
        return result.data;
      }
    } catch (e: any) {
      const code = e.response?.data?.error_code;
      setError(
        explanations[code] ||
          e.response?.data?.message ||
          '操作失败，请刷新诊断。',
      );
      setActivities((a) => [
        {
          at: new Date().toLocaleString(),
          action: label,
          result: code || '失败',
        },
        ...a,
      ]);
      await reload().catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  const openTree = async (treeId: number) => {
    try {
      const result = await request.get(
        `${config.apiPrefix}worktrees/${treeId}`,
      );
      if (result.code === 200) {
        setDetail(result.data);
        await reload();
      }
    } catch {}
  };
  const startCreate = (
    type: 'branch' | 'tag' | 'commit' = 'branch',
    ref = repo?.default_branch || '',
  ) => {
    setRefType(type);
    form.setFieldsValue({ name: ref, ref_name: ref });
    setCreating(true);
  };
  const create = async () => {
    try {
      const values = await form.validateFields();
      const result = await perform('创建 Worktree', 'worktrees', 'post', {
        ...values,
        repository_id: id,
        ref_type: refType,
      });
      if (result) setCreating(false);
    } catch {}
  };
  const git = detail?.git || detail?.status_snapshot;
  return (
    <div style={{ padding: 24 }}>
      <Space>
        <a href={`${config.baseUrl}repository`}>← 仓库管理</a>
        <Typography.Title level={3} style={{ margin: 0 }}>
          {repo?.name || 'Repository Workspace'}
        </Typography.Title>
        <Tag>{repo?.storage_state || '加载中'}</Tag>
      </Space>
      <p style={{ marginTop: 12 }}>
        持久 Git 工作区。Fetch 更新远端引用，Update Worktree
        才快进本地分支；现有订阅和任务仍使用原执行路径。
      </p>
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          closable
          onClose={() => setError('')}
          style={{ marginBottom: 16 }}
        />
      )}
      {diagnostics?.lock?.busy && (
        <Alert
          type="info"
          message={`仓库占用中：${
            diagnostics.lock.owner?.operation || 'operation'
          }`}
          description={`PID ${diagnostics.lock.owner?.pid || '—'}`}
        />
      )}
      {id > 0 && <TaskResourceReferences kind="repository" id={id} />}
      <Tabs
        defaultActiveKey="overview"
        items={[
          { key: 'config', label: 'Config', children: <ConfigBindings scope="repository" id={id} /> },
          { key: 'environment', label: 'Environment', children: <RepositoryEnvironment id={id} /> },
          {
            key: 'overview',
            label: 'Overview',
            children: (
              <>
                <Descriptions bordered column={2} size="small">
                  <Descriptions.Item label="Remote" span={2}>
                    {repo?.remote_url}
                  </Descriptions.Item>
                  <Descriptions.Item label="默认凭证">
                    {repo?.default_credential_id || 'Anonymous'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Storage State">
                    {repo?.storage_state}
                  </Descriptions.Item>
                  <Descriptions.Item label="Local Storage" span={2}>
                    <Typography.Text copyable={!!repo?.storage_path}>
                      {repo?.storage_path || '尚未初始化'}
                    </Typography.Text>
                  </Descriptions.Item>
                  <Descriptions.Item label="Default Branch">
                    {repo?.default_branch || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Fetch">
                    {repo?.last_fetch_at
                      ? new Date(repo.last_fetch_at).toLocaleString()
                      : '—'}{' '}
                    · {repo?.last_fetch_status || '—'}
                  </Descriptions.Item>
                  <Descriptions.Item label="Last Error" span={2}>
                    {repo?.last_error || '—'}
                  </Descriptions.Item>
                </Descriptions>
                <Space wrap style={{ marginTop: 16 }}>
                  <Button
                    loading={busy}
                    onClick={() =>
                      perform('Initialize', `repositories/${id}/initialize`)
                    }
                  >
                    Initialize
                  </Button>
                  <Button
                    loading={busy}
                    disabled={!repo?.storage_path}
                    onClick={() => perform('Fetch', `repositories/${id}/fetch`)}
                  >
                    Fetch
                  </Button>
                  <Button
                    loading={busy}
                    onClick={() => {
                      setBusy(true);
                      reload()
                        .catch(() => {})
                        .finally(() => setBusy(false));
                    }}
                  >
                    Diagnostics
                  </Button>
                  <Button
                    loading={busy}
                    disabled={!repo?.storage_path}
                    onClick={() =>
                      perform('Repair Metadata', `repositories/${id}/repair`)
                    }
                  >
                    Repair Metadata
                  </Button>
                  <Popconfirm
                    title="仅清理已丢失目录的 Git 工作区记录。存在占用时将停止。"
                    onConfirm={() =>
                      perform('Prune', `repositories/${id}/prune`)
                    }
                  >
                    <Button disabled={busy || !repo?.storage_path}>
                      Prune
                    </Button>
                  </Popconfirm>
                  <Button
                    disabled={busy || !!repo?.subscriptions_count}
                    onClick={() => {
                      setRemote(repo.remote_url);
                      setRemoteEdit(true);
                    }}
                  >
                    修改 Remote 访问地址
                  </Button>
                </Space>
                {!!repo?.subscriptions_count && (
                  <p>
                    有旧订阅引用时，Remote 地址保持固定，以保护原 clone
                    路径；凭证可在仓库管理页修改。
                  </p>
                )}
                {!!diagnostics?.orphans?.length && (
                  <Alert
                    style={{ marginTop: 16 }}
                    type="warning"
                    message="发现未登记到数据库的 Git Worktree"
                    description={diagnostics.orphans.map((o: any) => (
                      <div key={o.path}>{o.path}</div>
                    ))}
                  />
                )}
              </>
            ),
          },
          {
            key: 'refs',
            label: 'Refs / Branches',
            children: (
              <>
                <Button
                  onClick={() => startCreate('commit', '')}
                  disabled={busy || repo?.storage_state !== 'READY'}
                >
                  从 Commit 创建 Worktree
                </Button>
                <Table
                  rowKey="ref"
                  dataSource={refs}
                  columns={[
                    { title: '类型', dataIndex: 'type' },
                    { title: 'Branch / Tag', dataIndex: 'name' },
                    {
                      title: 'Commit',
                      dataIndex: 'commit',
                      render: (v: string) => (
                        <Typography.Text copyable>
                          {v?.slice(0, 12)}
                        </Typography.Text>
                      ),
                    },
                    { title: 'Updated', dataIndex: 'updated' },
                    {
                      title: '操作',
                      render: (_: any, r: any) => (
                        <Button
                          disabled={busy}
                          onClick={() => startCreate(r.type, r.name)}
                        >
                          Create Worktree
                        </Button>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'worktrees',
            label: 'Worktrees',
            children: (
              <>
                <Button
                  type="primary"
                  disabled={busy || repo?.storage_state !== 'READY'}
                  onClick={() => startCreate()}
                >
                  创建 Worktree
                </Button>
                <Table
                  rowKey="id"
                  dataSource={trees}
                  scroll={{ x: 1200 }}
                  columns={[
                    { title: '名称', dataIndex: 'name' },
                    {
                      title: '创建用途',
                      dataIndex: 'purpose',
                      render: (value: string) =>
                        value === 'SUBSCRIPTION' ? '订阅工作区' : '用户工作区',
                    },
                    {
                      title: '订阅引用',
                      render: (_: any, row: any) =>
                        row.subscriptions?.length
                          ? row.subscriptions
                              .map(
                                (sub: any) =>
                                  `${sub.name || 'Subscription'} #${sub.id}`,
                              )
                              .join(', ')
                          : '未绑定（保留工作区）',
                    },
                    {
                      title: 'Branch / Ref',
                      render: (_: any, r: any) =>
                        `${r.ref_type}: ${r.ref_name}`,
                    },
                    {
                      title: 'HEAD',
                      dataIndex: 'commit',
                      render: (v: string) => v?.slice(0, 10) || '—',
                    },
                    { title: '状态', dataIndex: 'lifecycle_state' },
                    { title: 'Dirty', dataIndex: 'dirty_state' },
                    {
                      title: 'Busy',
                      render: (_: any, r: any) =>
                        r.lease?.busy
                          ? r.lease.owner?.operation || 'BUSY'
                          : '—',
                    },
                    {
                      title: 'Ahead / Behind',
                      render: (_: any, r: any) =>
                        `${r.status_snapshot?.ahead ?? '—'} / ${
                          r.status_snapshot?.behind ?? '—'
                        }`,
                    },
                    { title: 'Path', dataIndex: 'local_path', ellipsis: true },
                    {
                      title: 'Last Updated',
                      dataIndex: 'last_update_at',
                      render: (v: string) =>
                        v ? new Date(v).toLocaleString() : '—',
                    },
                    {
                      title: '操作',
                      fixed: 'right' as const,
                      render: (_: any, r: any) => (
                        <Space wrap>
                          <Button size="small" onClick={() => openTree(r.id)}>
                            Open
                          </Button>
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={async () => {
                              const result = await perform(
                                'Refresh',
                                `worktrees/${r.id}/refresh`,
                              );
                              if (result) setDetail(result);
                            }}
                          >
                            Refresh
                          </Button>
                          <Button
                            size="small"
                            disabled={busy}
                            onClick={() =>
                              perform(
                                'Update Worktree',
                                `worktrees/${r.id}/update`,
                              )
                            }
                          >
                            Update
                          </Button>
                          <Popconfirm
                            title="删除工作区？有本地改动、提交或占用时将拒绝。"
                            onConfirm={() =>
                              perform(
                                'Delete Worktree',
                                `worktrees/${r.id}`,
                                'delete',
                              )
                            }
                          >
                            <Button danger size="small" disabled={busy}>
                              Delete
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
            key: 'activity',
            label: 'Activity',
            children: (
              <>
                <p>当前页面会话的操作结果；后端系统日志保留资源操作记录。</p>
                <Table
                  rowKey={(_, i) => String(i)}
                  dataSource={activities}
                  columns={[
                    { title: '时间', dataIndex: 'at' },
                    { title: '操作', dataIndex: 'action' },
                    { title: '结果', dataIndex: 'result' },
                  ]}
                />
              </>
            ),
          },
        ]}
      />
      <Modal
        open={creating}
        title="创建 Worktree"
        onCancel={() => setCreating(false)}
        onOk={create}
        confirmLoading={busy}
        forceRender
      >
        <Form form={form} layout="vertical">
          <Form.Item label="Ref Type">
            <Radio.Group
              value={refType}
              onChange={(e) => {
                setRefType(e.target.value);
                form.setFieldsValue({ ref_name: '' });
              }}
            >
              <Radio value="branch">Branch</Radio>
              <Radio value="tag">Tag</Radio>
              <Radio value="commit">Commit</Radio>
            </Radio.Group>
          </Form.Item>
          <Form.Item label="名称" name="name" rules={[{ required: true }]}>
            <Input maxLength={255} />
          </Form.Item>
          <Form.Item label="Ref" name="ref_name" rules={[{ required: true }]}>
            {refType === 'commit' ? (
              <Input placeholder="完整 Commit SHA" />
            ) : (
              <Select
                showSearch
                options={refs
                  .filter((r) => r.type === refType)
                  .map((r) => ({ value: r.name, label: r.name }))}
              />
            )}
          </Form.Item>
          <p>
            路径由系统生成。每个远端分支默认只有一个 managed
            Worktree；Commit/Tag 使用 Detached HEAD。
          </p>
        </Form>
      </Modal>
      <Modal
        width={880}
        open={!!detail}
        title={`Worktree：${detail?.name || ''}`}
        onCancel={() => setDetail(undefined)}
        footer={
          <Space>
            <Button onClick={() => openTree(detail.id)}>Refresh</Button>
            <Button
              disabled={busy}
              onClick={async () => {
                const result = await perform(
                  'Repair Worktree',
                  `worktrees/${detail.id}/repair`,
                );
                if (result) setDetail(result);
              }}
            >
              Repair
            </Button>
            {detail?.lifecycle_state === 'MISSING' && (
              <Popconfirm
                title="目录缺失且 Git 注册已清理时可移除记录；本地提交仍受保护。"
                onConfirm={async () => {
                  await perform(
                    'Remove Record',
                    `worktrees/${detail.id}/remove-record`,
                  );
                  setDetail(undefined);
                }}
              >
                <Button danger>Remove Record</Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        {detail?.id && <TaskResourceReferences kind="worktree" id={detail.id} />}
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="Repository">{repo?.name}</Descriptions.Item>
          <Descriptions.Item label="Ref">
            {detail?.ref_type}: {detail?.ref_name}
          </Descriptions.Item>
          <Descriptions.Item label="Branch">
            {git?.branch || 'Detached'}
          </Descriptions.Item>
          <Descriptions.Item label="HEAD">
            {git?.head || detail?.commit}
          </Descriptions.Item>
          <Descriptions.Item label="Local Path" span={2}>
            {detail?.local_path}
          </Descriptions.Item>
          <Descriptions.Item label="状态">
            {detail?.lifecycle_state} / {detail?.dirty_state}
          </Descriptions.Item>
          <Descriptions.Item label="Ahead / Behind">
            {git?.ahead ?? '—'} / {git?.behind ?? '—'}
          </Descriptions.Item>
          <Descriptions.Item label="Active Lease" span={2}>
            {detail?.lease?.busy
              ? `${detail.lease.owner?.operation} · ${detail.lease.owner?.owner_type}/${detail.lease.owner?.owner_id} · PID ${detail.lease.owner?.pid}`
              : '无占用'}
          </Descriptions.Item>
        </Descriptions>
        <h4>Changed Files</h4>
        <Table
          size="small"
          rowKey="path"
          dataSource={git?.changed_files || []}
          columns={[
            { title: '文件', dataIndex: 'path' },
            { title: 'Index', dataIndex: 'index' },
            { title: 'Worktree', dataIndex: 'worktree' },
          ]}
        />
      </Modal>
      <Modal
        title="修改同一仓库的 Remote 访问地址"
        open={remoteEdit}
        onCancel={() => setRemoteEdit(false)}
        onOk={async () => {
          const result = await perform(
            'Change Remote',
            `repositories/${id}/remote`,
            'post',
            { remote_url: remote },
          );
          if (result) setRemoteEdit(false);
        }}
        confirmLoading={busy}
      >
        <Input value={remote} onChange={(e) => setRemote(e.target.value)} />
        <p>
          只接受归一化后身份相同的安全 URL。更换 Credential 不需要修改 URL
          或重新 clone。
        </p>
      </Modal>
    </div>
  );
}
