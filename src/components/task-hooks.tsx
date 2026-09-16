import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  message,
} from 'antd';
import config from '@/utils/config';
import { request } from '@/utils/http';
const phases = ['BEFORE', 'AFTER_SUCCESS', 'AFTER_FAILURE', 'FINALLY'];
export function TaskHooks({ id }: { id: number }) {
  const [rows, setRows] = useState<any[]>([]),
    [editing, setEditing] = useState<any>();
  const [form] = Form.useForm();
  const endpoint = `${config.apiPrefix}tasks/${id}/hooks`;
  const load = async () => {
    const r = await request.get(endpoint);
    if (r.code === 200) setRows(r.data);
  };
  useEffect(() => {
    load().catch(() => {});
  }, [id]);
  const open = (phase: string, row: any = {}) => {
    setEditing(row);
    form.resetFields();
    form.setFieldsValue({
      phase,
      name: '',
      command: '',
      cwd_base: 'TASK_CWD',
      position:
        10 +
        Math.max(
          0,
          ...rows.filter((x) => x.phase === phase).map((x) => x.position),
        ),
      timeout_seconds: 60,
      failure_policy: phase === 'AFTER_FAILURE' ? 'CONTINUE' : 'FAIL_EXECUTION',
      enabled: true,
      ...row,
    });
  };
  const save = async () => {
    try {
      const values = await form.validateFields();
      const r = await request[editing.id ? 'put' : 'post'](
        editing.id ? `${endpoint}/${editing.id}` : endpoint,
        { ...values, expected_version: editing.version },
      );
      if (r.code === 200) {
        setEditing(undefined);
        await load();
        message.success('Hook 已保存');
      }
    } catch {}
  };
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert
        type="info"
        message="Secrets 请通过 Environment 或 Config Assets 传递。BEFORE 可使用 PLATFORM_HOOK_OUTPUT 返回本次执行的 ENV patch。"
      />
      <Tabs
        items={phases.map((phase) => ({
          key: phase,
          label: phase,
          children: (
            <>
              <Button onClick={() => open(phase)}>添加 {phase} Hook</Button>
              <Table
                rowKey="id"
                size="small"
                pagination={false}
                dataSource={rows
                  .filter((x) => x.phase === phase)
                  .sort((a, b) => a.position - b.position)}
                columns={[
                  { title: 'Name', dataIndex: 'name' },
                  { title: 'Order', dataIndex: 'position' },
                  { title: 'Timeout (s)', dataIndex: 'timeout_seconds' },
                  { title: 'Failure Policy', dataIndex: 'failure_policy' },
                  {
                    title: 'Enabled',
                    render: (_, row) => (row.enabled ? 'Yes' : 'No'),
                  },
                  {
                    title: '操作',
                    render: (_, row) => (
                      <Space>
                        <Button size="small" onClick={() => open(phase, row)}>
                          编辑
                        </Button>
                        <Popconfirm
                          title="删除此 Hook？"
                          onConfirm={async () => {
                            await request.delete(
                              `${endpoint}/${row.id}?version=${row.version}`,
                            );
                            await load();
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
              />
            </>
          ),
        }))}
      />
      <Modal
        title="Task Hook"
        open={!!editing}
        onCancel={() => setEditing(undefined)}
        onOk={save}
        destroyOnClose
      >
        <Form name={`task-hook-${id}`} form={form} layout="vertical" preserve={false}>
          <Form.Item name="name" label="Hook 名称" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="phase" label="Phase">
            <Select
              options={phases.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item
            name="command"
            label="Command"
            rules={[{ required: true }]}
          >
            <Input.TextArea rows={5} autoComplete="off" />
          </Form.Item>
          <Form.Item name="cwd_base" label="Working Directory">
            <Select
              options={['TASK_CWD', 'WORKSPACE_ROOT'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="position" label="Order" rules={[{ required: true }]}>
            <InputNumber min={0} />
          </Form.Item>
          <Form.Item
            name="timeout_seconds"
            label="Timeout Seconds"
            rules={[{ required: true }]}
          >
            <InputNumber min={1} max={3600} />
          </Form.Item>
          <Form.Item name="failure_policy" label="Failure Policy">
            <Select
              options={['FAIL_EXECUTION', 'CONTINUE'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
