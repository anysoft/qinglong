import React, { useEffect, useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tag, message } from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
const api = `${config.apiPrefix}scoped-env/`;

export function ScopedVariables({ resource, id }: { resource: 'global' | 'profiles' | 'tasks'; id: number }) {
  const endpoint = `${api}${resource === 'global' ? 'global' : `${resource}/${id}`}/variables`;
  const [rows, setRows] = useState<any[]>([]);
  const [editing, setEditing] = useState<any>();
  const [form] = Form.useForm();
  const secret = Form.useWatch('is_secret', form), operation = Form.useWatch('operation', form), replace = Form.useWatch('replace_secret', form);
  const load = async () => { const r = await request.get(endpoint); if (r.code === 200) setRows(r.data); };
  useEffect(() => { load().catch(() => {}); }, [resource, id]);
  const open = (row: any = {}) => {
    setEditing(row); form.resetFields();
    form.setFieldsValue({ name: row.name, value: row.is_secret ? undefined : row.value, is_secret: !!row.is_secret, operation: row.operation || 'SET', status: row.status || 'enabled', replace_secret: false });
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      if (values.operation === 'UNSET' || (editing?.is_secret && !values.replace_secret)) delete values.value;
      const r = await request.put(endpoint, [values]);
      if (r.code === 200) { setEditing(undefined); form.resetFields(); await load(); message.success('环境变量已保存'); }
    } catch {}
  };
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Button onClick={() => open()}>添加变量</Button>
    <Table rowKey="name" size="small" dataSource={rows} pagination={false} columns={[
      { title: '变量名', dataIndex: 'name' }, { title: '值', render: (_: any, r: any) => r.operation === 'UNSET' ? <Tag>UNSET</Tag> : r.is_secret ? '••••••••' : <span style={{ whiteSpace: 'pre-wrap' }}>{r.value}</span> },
      { title: '状态', dataIndex: 'status' }, { title: 'Secret', render: (_: any, r: any) => r.is_secret ? 'Secret' : 'Plain' },
      { title: '操作', render: (_: any, r: any) => <Space><Button type="link" onClick={() => open(r)}>编辑变量</Button><Popconfirm title="删除这个变量？" onConfirm={async () => { await request.put(endpoint, [{ name: r.name, clear: true }]); await load(); }}><Button type="link" danger>删除变量</Button></Popconfirm></Space> },
    ]} />
    <Modal title="编辑环境变量" open={editing !== undefined} onCancel={() => { setEditing(undefined); form.resetFields(); }} onOk={save} destroyOnClose>
      <Form form={form} layout="vertical" preserve={false}>
        <Form.Item name="name" label="变量名" rules={[{ required: true, pattern: /^[A-Za-z_][A-Za-z0-9_]*$/ }]}><Input disabled={!!editing?.name} /></Form.Item>
        <Form.Item name="operation" label="操作"><Select options={[{ value: 'SET', label: 'SET — 设置值' }, { value: 'UNSET', label: 'UNSET — 从环境删除' }]} /></Form.Item>
        <Form.Item name="status" label="状态"><Select options={[{ value: 'enabled', label: 'Enabled' }, { value: 'disabled', label: 'Disabled — 不参与覆盖' }]} /></Form.Item>
        <Form.Item name="is_secret" label="Secret" valuePropName="checked"><Switch disabled={!!editing?.is_secret} /></Form.Item>
        {editing?.is_secret && operation === 'SET' && <Form.Item name="replace_secret" label="Secret 更新"><Select options={[{ value: false, label: 'Keep Existing — 保留现有值' }, { value: true, label: 'Replace — 替换值' }]} /></Form.Item>}
        {operation === 'SET' && (!editing?.is_secret || replace) && <Form.Item name="value" label={secret ? '新 Secret 值' : '值（允许空字符串）'} initialValue=""><Input.TextArea rows={4} autoComplete="off" /></Form.Item>}
      </Form>
    </Modal>
  </Space>;
}

export function TaskEnvironment({ id, subscription = false }: { id: number; subscription?: boolean }) {
  const [context, setContext] = useState<any>();
  const [preview, setPreview] = useState<any>();
  const resource = subscription ? 'subscriptions' : 'tasks';
  const load = async () => { const r = await request.get(`${api}${resource}/${id}/context`); if (r.code === 200) setContext(r.data); };
  useEffect(() => { load().catch(() => {}); setPreview(undefined); }, [id, subscription]);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <strong>Environment</strong>
    {context && <><span>Repository Profile</span><Select aria-label="Repository Profile" style={{ width: '100%' }} disabled={!context.repository_id} value={context.env_profile_id ?? null} options={[{ value: null, label: context.repository_id ? 'Inherit — Subscription / Repository Default' : 'Unavailable — 无仓库上下文' }, ...context.profiles.map((p: any) => ({ value: p.id, label: `${p.name}${p.is_default ? ' (Default)' : ''}${p.status === 'disabled' ? ' (Disabled)' : ''}` }))]} onChange={async value => { const r = await request.put(`${api}${resource}/${id}/profile`, { env_profile_id: value }); if (r.code === 200) { await load(); setPreview(undefined); message.success('Profile 绑定已保存'); } }} /></>}
    {!subscription && <><ScopedVariables resource="tasks" id={id} /><Button onClick={async () => { const r = await request.get(`${api}tasks/${id}/preview`); if (r.code === 200) setPreview(r.data); }}>预览有效环境</Button></>}
    {preview && <><Alert type="info" message={`Profile: ${preview.profile?.name || 'none'} · 选择来源: ${preview.metadata.selected_by}`} /><Table rowKey="name" size="small" dataSource={preview.variables} columns={[{ title: '变量', dataIndex: 'name' }, { title: '来源', dataIndex: 'origin' }, { title: '操作', dataIndex: 'operation' }, { title: '有效值', dataIndex: 'display' }]} /></>}
  </Space>;
}
