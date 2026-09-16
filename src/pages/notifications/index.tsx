import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Switch,
  Table,
  Tabs,
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import { obsGet, DeliveryTable } from '@/components/observability';
export default function NotificationChannelsPage() {
  const [rows, setRows] = useState<any[]>([]),
    [providers, setProviders] = useState<string[]>([]),
    [editing, setEditing] = useState<any>();
  const [form] = Form.useForm();
  const action = Form.useWatch('secret_action', form);
  const load = () => obsGet('notification-channels').then(setRows);
  useEffect(() => {
    void load();
    void obsGet('notification-providers').then(setProviders);
  }, []);
  const edit = (r?: any) => {
    setEditing(r ?? {});
    form.resetFields();
    form.setFieldsValue(
      r
        ? {
            ...r,
            enabled: !!r.enabled,
            is_default: !!r.is_default,
            secret_action: 'KEEP',
          }
        : {
            type: 'WEBHOOK',
            enabled: true,
            is_default: true,
            secret_action: 'REPLACE',
          },
    );
  };
  const save = async () => {
    try {
      const v = await form.validateFields();
      const body = {
        ...v,
        ...(v.secret_action === 'REPLACE'
          ? { secret: JSON.parse(v.secret) }
          : { secret: undefined }),
        expected_version: editing.version,
      };
      const r = editing.id
        ? await request.patch<any, any>(
            config.apiPrefix + `notification-channels/${editing.id}`,
            body,
          )
        : await request.post<any>(
            config.apiPrefix + 'notification-channels',
            body,
          );
      if (r.code === 200) {
        setEditing(undefined);
        form.resetFields();
        await load();
      } else message.error(r.error_code);
    } catch {
      message.error('Check the channel fields and secret JSON.');
    }
  };
  return (
    <Card title="Notifications">
      <Tabs
        items={[
          {
            key: 'channels',
            label: 'Channels',
            children: (
              <>
                <Button type="primary" onClick={() => edit()}>
                  Add channel
                </Button>
                <Table
                  rowKey="id"
                  dataSource={rows}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Provider', dataIndex: 'type' },
                    {
                      title: 'Enabled',
                      dataIndex: 'enabled',
                      render: (v) => (v ? 'Yes' : 'No'),
                    },
                    {
                      title: 'Default',
                      dataIndex: 'is_default',
                      render: (v) => (v ? 'Yes' : 'No'),
                    },
                    {
                      title: 'Secret',
                      dataIndex: 'secret_configured',
                      render: (v) => (v ? 'Configured' : 'Missing'),
                    },
                    {
                      title: 'Actions',
                      render: (_, r) => (
                        <Space>
                          <Button
                            disabled={!!r.archived}
                            onClick={() => edit(r)}
                          >
                            Edit
                          </Button>
                          <Button
                            disabled={!r.enabled}
                            onClick={async () => {
                              await request.post(
                                config.apiPrefix +
                                  `notification-channels/${r.id}/test`,
                              );
                              message.info(
                                'Test notification queued; see Deliveries.',
                              );
                            }}
                          >
                            Test
                          </Button>
                          <Button
                            disabled={!!r.archived}
                            danger
                            onClick={() =>
                              Modal.confirm({
                                title: 'Archive channel?',
                                content:
                                  'Delivery history is retained. Pending deliveries will fail with CHANNEL_DISABLED.',
                                onOk: async () => {
                                  await request.delete(
                                    config.apiPrefix +
                                      `notification-channels/${r.id}`,
                                    { data: { expected_version: r.version } },
                                  );
                                  await load();
                                },
                              })
                            }
                          >
                            Archive
                          </Button>
                        </Space>
                      ),
                    },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'deliveries',
            label: 'Deliveries',
            children: <DeliveryTable />,
          },
        ]}
      />
      <Modal
        open={!!editing}
        title="Notification channel"
        onCancel={() => {
          setEditing(undefined);
          form.resetFields();
        }}
        onOk={save}
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="type" label="Provider" rules={[{ required: true }]}>
            <Select
              options={providers.map((value) => ({ value, label: value }))}
            />
          </Form.Item>
          <Form.Item name="enabled" label="Enabled" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item
            name="is_default"
            label="Default channel"
            valuePropName="checked"
          >
            <Switch />
          </Form.Item>
          <Form.Item name="secret_action" label="Secret action">
            <Select
              options={['KEEP', 'REPLACE', 'DELETE'].map((value) => ({
                value,
                label: value,
              }))}
            />
          </Form.Item>
          <Alert
            message={
              'WEBHOOK: {"url":"https://…","authorization":"Bearer …"}. Other providers use their existing named fields. All connection fields are protected and never returned. Webhooks can access your platform network.'
            }
          />
          {action === 'REPLACE' && (
            <Form.Item
              name="secret"
              label="Secret configuration JSON"
              rules={[{ required: true }]}
            >
              <Input.TextArea autoComplete="off" rows={5} />
            </Form.Item>
          )}
        </Form>
      </Modal>
    </Card>
  );
}
