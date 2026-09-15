import React, { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Popconfirm, Select, Space, Table, Tabs, Tag } from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import { ScopedVariables, TaskEnvironment } from '@/components/scoped-environment';
const api = `${config.apiPrefix}scoped-env/`;

export default function ScopedEnvironmentPage() {
  const params = new URLSearchParams(window.location.search);
  const [repositories, setRepositories] = useState<any[]>([]), [tasks, setTasks] = useState<any[]>([]), [profiles, setProfiles] = useState<any[]>([]);
  const [repository, setRepository] = useState<number | undefined>(Number(params.get('repository')) || undefined);
  const [task, setTask] = useState<number | undefined>(Number(params.get('task')) || undefined);
  const [selected, setSelected] = useState<any>(), [editor, setEditor] = useState<any>(), [clone, setClone] = useState<any>();
  const [form] = Form.useForm(), [cloneName, setCloneName] = useState('');
  const load = async () => { const [r, t] = await Promise.all([request.get(`${api}repositories`), request.get(`${api}tasks`)]); if (r.code === 200) setRepositories(r.data); if (t.code === 200) setTasks(t.data); };
  const loadProfiles = async () => { if (repository) { const r = await request.get(`${api}repositories/${repository}/profiles`); if (r.code === 200) setProfiles(r.data); } };
  useEffect(() => { load().catch(() => {}); }, []);
  useEffect(() => { setSelected(undefined); loadProfiles().catch(() => {}); }, [repository]);
  const edit = (row: any = {}) => { setEditor(row); form.resetFields(); form.setFieldsValue({ name: row.name, description: row.description || '', status: row.status || 'enabled' }); };
  const refresh = async () => { await load(); await loadProfiles(); };
  return <div style={{ padding: 24 }}><h2>环境变量</h2><Tabs defaultActiveKey={task ? 'tasks' : repository ? 'repositories' : 'global'} items={[
    { key: 'global', label: 'Global', children: <ScopedVariables resource="global" id={0} /> },
    { key: 'repositories', label: 'Repository', children: <Space direction="vertical" style={{ width: '100%' }}>
      <Select aria-label="Repository" placeholder="选择 Repository" style={{ width: 420 }} value={repository} onChange={setRepository} options={repositories.map(r => ({ value: r.id, label: `${r.name} (${r.profiles_count} Profiles)` }))} />
      <Button disabled={!repository} onClick={() => edit()}>创建 Profile</Button>
      <Table rowKey="id" dataSource={profiles} columns={[{ title: 'Profile', dataIndex: 'name' }, { title: 'Description', dataIndex: 'description' }, { title: '状态', dataIndex: 'status' }, { title: 'Default', render: (_: any, r: any) => r.is_default && <Tag>Default</Tag> }, { title: 'Variables', dataIndex: 'variables_count' }, { title: 'Used by', render: (_: any, r: any) => `Subscriptions ${r.used_by.subscriptions} / Tasks ${r.used_by.tasks}` }, { title: '操作', render: (_: any, r: any) => <Space wrap>
        <Button type="link" onClick={() => setSelected(r)}>变量</Button><Button type="link" onClick={() => edit(r)}>编辑 Profile</Button><Button type="link" onClick={() => { setClone(r); setCloneName(`${r.name}-copy`); }}>Clone</Button>
        <Button type="link" onClick={async () => { await request.put(`${api}profiles`, { id: r.id, is_default: !r.is_default }); await refresh(); }}>{r.is_default ? '清除 Default' : '设为 Default'}</Button>
        <Popconfirm title="删除未被引用的 Profile？" onConfirm={async () => { await request.delete(`${api}profiles/${r.id}`); setSelected(undefined); await refresh(); }}><Button type="link" danger>删除 Profile</Button></Popconfirm>
      </Space> }]} />
      {selected && <><h3>{selected.name} · Variables</h3><ScopedVariables key={selected.id} resource="profiles" id={selected.id} /></>}
    </Space> },
    { key: 'tasks', label: 'Task', children: <Space direction="vertical" style={{ width: '100%' }}><Select aria-label="Task" placeholder="选择 Task" style={{ width: 420 }} value={task} onChange={setTask} options={tasks.map(t => ({ value: t.id, label: `${t.name || t.id} (${t.variables_count} Overrides)` }))} />{task && <TaskEnvironment id={task} />}</Space> },
  ]} />
  <Modal title="Profile" open={editor !== undefined} destroyOnClose onCancel={() => setEditor(undefined)} onOk={async () => { try { const values = await form.validateFields(); const r = await request[editor.id ? 'put' : 'post'](`${api}profiles`, { ...values, ...(editor.id ? { id: editor.id } : { repository_id: repository }) }); if (r.code === 200) { setEditor(undefined); await refresh(); } } catch {} }}>
    <Form form={form} layout="vertical"><Form.Item name="name" label="Profile 名称" rules={[{ required: true }]}><Input /></Form.Item><Form.Item name="description" label="Description"><Input.TextArea /></Form.Item><Form.Item name="status" label="状态"><Select options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled' }]} /></Form.Item></Form>
  </Modal>
  <Modal title="Clone Profile" open={!!clone} onCancel={() => setClone(undefined)} onOk={async () => { const r = await request.post(`${api}profiles/${clone.id}/clone`, { name: cloneName }); if (r.code === 200) { setClone(undefined); await refresh(); } }}><Input aria-label="Clone 名称" value={cloneName} onChange={e => setCloneName(e.target.value)} /></Modal>
  </div>;
}
