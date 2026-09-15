import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
const api = config.apiPrefix;
export function ConfigBindings({
  scope,
  id,
}: {
  scope: 'repository' | 'task';
  id: number;
}) {
  const [rows, setRows] = useState<any[]>([]),
    [assets, setAssets] = useState<any[]>([]),
    [inherited, setInherited] = useState<any[]>([]),
    [preview, setPreview] = useState<any[]>(),
    [editing, setEditing] = useState<any>();
  const [form] = Form.useForm();
  const operation = Form.useWatch('operation', form);
  const endpoint = `${api}${
    scope === 'repository' ? 'repositories' : 'tasks'
  }/${id}/config-bindings`;
  const load = async () => {
    const [bindings, library] = await Promise.all([
      request.get(endpoint),
      request.get(`${api}config-assets`),
    ]);
    if (bindings.code === 200) setRows(bindings.data);
    if (library.code === 200) setAssets(library.data);
    if (scope === 'task') {
      const context = await request.get(`${api}tasks/${id}/config-context`);
      if (context.code === 200) setInherited(context.data.inherited);
    }
  };
  useEffect(() => {
    load().catch(() => {});
    setPreview(undefined);
  }, [scope, id]);
  const open = (row: any = {}) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      operation: 'ATTACH',
      target_base: 'TASK_DIR',
      materialization_mode: 'COPY',
      conflict_policy: 'FAIL_IF_EXISTS',
      writable: false,
      enabled: true,
      ...row,
    });
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        asset_id: values.operation === 'MASK' ? null : values.asset_id,
        expected_version: editing.version,
      };
      const r = await request[editing.id ? 'put' : 'post'](
        editing.id ? `${endpoint}/${editing.id}` : endpoint,
        payload,
      );
      if (r.code === 200) {
        setEditing(undefined);
        await load();
        setPreview(undefined);
        message.success('Config binding 已保存');
      }
    } catch {}
  };
  const columns: any[] = [
    {
      title: 'Target',
      render: (_: any, row: any) => `${row.target_base}/${row.target_path}`,
    },
    { title: '操作', dataIndex: 'operation' },
    {
      title: 'Asset',
      render: (_: any, row: any) =>
        assets.find((x) => x.id === row.asset_id)?.name ?? '—',
    },
    { title: 'Mode', dataIndex: 'materialization_mode' },
    { title: 'Conflict Policy', dataIndex: 'conflict_policy' },
    {
      title: 'Writable',
      render: (_: any, row: any) => (row.writable ? 'Yes' : 'Read-only'),
    },
    {
      title: 'Enabled',
      render: (_: any, row: any) => (row.enabled ? 'Yes' : 'No'),
    },
  ];
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {scope === 'task' && inherited.length > 0 && (
        <>
          <strong>Inherited Repository Bindings</strong>
          <Table
            rowKey="id"
            size="small"
            dataSource={inherited}
            columns={columns}
            pagination={false}
          />
        </>
      )}
      <strong>
        {scope === 'task'
          ? 'Task Overrides / Masks'
          : 'Repository Config Bindings'}
      </strong>
      <Button onClick={() => open()}>添加 Config Binding</Button>
      <Table
        rowKey="id"
        size="small"
        dataSource={rows}
        columns={[
          ...columns,
          {
            title: '操作',
            render: (_: any, row: any) => (
              <Space>
                <Button size="small" onClick={() => open(row)}>
                  编辑
                </Button>
                <Popconfirm
                  title="删除此绑定？"
                  onConfirm={async () => {
                    await request.delete(
                      `${endpoint}/${row.id}?version=${row.version}`,
                    );
                    await load();
                    setPreview(undefined);
                  }}
                >
                  <Button size="small" danger>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
        pagination={false}
      />
      {scope === 'task' && (
        <Button
          onClick={async () => {
            const r = await request.get(`${api}tasks/${id}/config-preview`);
            if (r.code === 200) setPreview(r.data);
          }}
        >
          预览有效 Config
        </Button>
      )}
      {preview && (
        <>
          <Alert
            type="info"
            message="Effective Config — 当前解析结果；执行开始时冻结 Revision"
          />
          <Table
            rowKey={(row) =>
              `${row.binding.target_base}:${row.binding.target_path}`
            }
            size="small"
            dataSource={preview}
            pagination={false}
            columns={[
              {
                title: 'Target',
                render: (_, row) =>
                  `${row.binding.target_base}/${row.binding.target_path}`,
              },
              { title: 'Asset', dataIndex: 'asset_name' },
              {
                title: 'Revision',
                render: (_, row) => row.revision.revision_number,
              },
              { title: 'Source', dataIndex: 'source' },
              {
                title: 'Mode',
                render: (_, row) => row.binding.materialization_mode,
              },
              {
                title: 'Conflict Policy',
                render: (_, row) => row.binding.conflict_policy,
              },
              {
                title: 'Secret',
                render: (_, row) => (row.is_secret ? <Tag>Secret</Tag> : 'No'),
              },
            ]}
          />
        </>
      )}
      <Modal
        title="Config Binding"
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={save}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item name="operation" label="绑定操作">
            <Select
              options={(scope === 'task' ? ['ATTACH', 'MASK'] : ['ATTACH']).map(
                (value) => ({ value, label: value }),
              )}
            />
          </Form.Item>
          <Form.Item
            name="asset_id"
            label="Config Asset"
            rules={operation === 'MASK' ? [] : [{ required: true }]}
          >
            <Select
              disabled={operation === 'MASK'}
              options={assets.map((asset) => ({
                value: asset.id,
                label: `${asset.name}${asset.is_secret ? ' (Secret)' : ''}`,
              }))}
            />
          </Form.Item>
          <Form.Item name="target_base" label="Target Base">
            <Select
              options={['WORKSPACE_ROOT', 'TASK_DIR'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="target_path"
            label="Target Path"
            rules={[{ required: true }]}
          >
            <Input placeholder="config.yaml" />
          </Form.Item>
          <Form.Item name="materialization_mode" label="Materialization Mode">
            <Select
              options={['COPY', 'SYMLINK'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="conflict_policy" label="Conflict Policy">
            <Select
              options={['FAIL_IF_EXISTS', 'REPLACE_RESTORE'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="writable"
            label="Writable — 仅本次执行副本"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
