import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Switch,
  Table,
  Tag,
  message,
} from 'antd';
import { PageContainer } from '@ant-design/pro-layout';
import { request } from '@/utils/http';
import config from '@/utils/config';

export default function ConfigAssetsPage() {
  const [rows, setRows] = useState<any[]>([]),
    [editing, setEditing] = useState<any>(),
    [replace, setReplace] = useState(false),
    [detail, setDetail] = useState<any>();
  const [form] = Form.useForm();
  const load = async () => {
    const result = await request.get(`${config.apiPrefix}config-assets`);
    if (result.code === 200) setRows(result.data);
  };
  useEffect(() => {
    load().catch(() => {});
  }, []);
  const open = async (row: any = {}) => {
    form.resetFields();
    setReplace(!row.id || !row.is_secret);
    const values: any = { name: '', description: '', is_secret: false, ...row };
    if (row.id && !row.is_secret) {
      const result = await request.get(
        `${config.apiPrefix}config-assets/${row.id}/content`,
      );
      if (result.code !== 200) return;
      values.content = result.data;
    }
    form.setFieldsValue(values);
    setEditing(row);
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      const payload = {
        ...values,
        content_type: 'TEXT',
        expected_version: editing.version,
      };
      if (!replace) delete payload.content;
      const result = await request[editing.id ? 'put' : 'post'](
        `${config.apiPrefix}config-assets${editing.id ? `/${editing.id}` : ''}`,
        payload,
      );
      if (result.code === 200) {
        setEditing(undefined);
        form.resetFields();
        await load();
        message.success(replace ? '新 Revision 已保存' : '元数据已保存');
      }
    } catch {}
  };
  return (
    <PageContainer
      title="Config Assets"
      extra={
        <Button type="primary" onClick={() => open()}>
          创建 Config Asset
        </Button>
      }
    >
      <Alert
        type="info"
        showIcon
        message="配置资产独立于 Git；每次内容修改创建不可变 Revision。Secret 内容仅可替换，不会返回浏览器。"
        style={{ marginBottom: 16 }}
      />
      <Table
        rowKey="id"
        dataSource={rows}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Type', dataIndex: 'content_type' },
          {
            title: 'Secret',
            render: (_, row) =>
              row.is_secret ? <Tag>Secret · Set</Tag> : 'No',
          },
          {
            title: 'Current Revision',
            render: (_, row) => row.current_revision?.revision_number,
          },
          {
            title: 'Size',
            render: (_, row) => `${row.current_revision?.size ?? 0} bytes`,
          },
          { title: 'Usage Count', dataIndex: 'usage_count' },
          { title: 'Updated At', dataIndex: 'updatedAt' },
          {
            title: '操作',
            render: (_, row) => (
              <Space>
                <Button onClick={() => open(row)}>编辑</Button>
                <Button
                  onClick={async () => {
                    const [revisions, usage] = await Promise.all([
                      request.get(
                        `${config.apiPrefix}config-assets/${row.id}/revisions`,
                      ),
                      request.get(
                        `${config.apiPrefix}config-assets/${row.id}/usage`,
                      ),
                    ]);
                    if (revisions.code === 200 && usage.code === 200)
                      setDetail({
                        asset: row,
                        revisions: revisions.data,
                        usage: usage.data,
                      });
                  }}
                >
                  详情
                </Button>
                <Popconfirm
                  title="删除资产？有绑定时不能删除。"
                  onConfirm={async () => {
                    const r = await request.delete(
                      `${config.apiPrefix}config-assets/${row.id}?version=${row.version}`,
                    );
                    if (r.code === 200) await load();
                  }}
                >
                  <Button danger>删除</Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      <Modal
        title={editing?.id ? '编辑 Config Asset' : '创建 Config Asset'}
        open={!!editing}
        onCancel={() => {
          setEditing(undefined);
          form.resetFields();
        }}
        onOk={save}
        width={720}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, max: 255 }]}
          >
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea maxLength={4096} />
          </Form.Item>
          <Form.Item name="is_secret" label="Secret" valuePropName="checked">
            <Switch disabled={editing?.is_secret} />
          </Form.Item>
          {editing?.id && editing.is_secret && (
            <Space direction="vertical">
              <Alert message="Secret Content: Set — Keep Existing" />
              <Button onClick={() => setReplace(!replace)}>
                {replace ? 'Keep Existing' : 'Replace'}
              </Button>
            </Space>
          )}
          {replace && (
            <Form.Item
              name="content"
              label="Content (UTF-8 TEXT, ≤ 1 MiB)"
              rules={[
                {
                  validator: (_, value) =>
                    typeof value === 'string'
                      ? Promise.resolve()
                      : Promise.reject(new Error('请输入内容，可为空字符串')),
                },
              ]}
              initialValue=""
            >
              <Input.TextArea rows={12} spellCheck={false} />
            </Form.Item>
          )}
        </Form>
      </Modal>
      <Modal
        title={detail?.asset.name}
        open={!!detail}
        onCancel={() => setDetail(undefined)}
        footer={null}
        width={850}
      >
        <h3>Immutable Revisions</h3>
        <Table
          rowKey="id"
          size="small"
          dataSource={detail?.revisions}
          columns={[
            { title: 'Revision', dataIndex: 'revision_number' },
            { title: 'Size', dataIndex: 'size' },
            { title: 'SHA-256', dataIndex: 'checksum' },
            { title: 'Created', dataIndex: 'createdAt' },
          ]}
        />
        <h3>Repository Bindings</h3>
        <Table
          rowKey="id"
          size="small"
          dataSource={detail?.usage.repositories}
          columns={[
            { title: 'Repository', dataIndex: 'repository_id' },
            { title: 'Target Base', dataIndex: 'target_base' },
            { title: 'Target Path', dataIndex: 'target_path' },
          ]}
        />
        <h3>Task Bindings</h3>
        <Table
          rowKey="id"
          size="small"
          dataSource={detail?.usage.tasks}
          columns={[
            { title: 'Task', dataIndex: 'task_id' },
            { title: 'Target Base', dataIndex: 'target_base' },
            { title: 'Target Path', dataIndex: 'target_path' },
          ]}
        />
      </Modal>
    </PageContainer>
  );
}
