import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Select,
  Space,
  Switch,
  Table,
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
export default function DiscoveryPolicy({
  subscriptionId,
}: {
  subscriptionId: number;
}) {
  const [policy, setPolicy] = useState<any>(),
    [preview, setPreview] = useState<any>();
  const [form] = Form.useForm();
  const api = `${config.apiPrefix}subscriptions/${subscriptionId}/discovery`;
  const load = async () => {
    const result = await request.get(api);
    if (result.code === 200) {
      setPolicy(result.data);
      form.setFieldsValue({
        ...result.data,
        includes: result.data.includes.join('\n'),
        excludes: result.data.excludes.join('\n'),
      });
    }
  };
  useEffect(() => {
    void load();
  }, [subscriptionId]);
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      <Alert
        message="Discovery policy"
        description="Preview reads the saved policy. Apply discovers task sources and their cron metadata; user overrides are preserved."
      />
      <Form form={form} layout="vertical">
        <Form.Item
          name="enabled"
          label="Discovery enabled"
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
        <Form.Item name="includes" label="Include globs (one per line)">
          <Input.TextArea />
        </Form.Item>
        <Form.Item name="excludes" label="Exclude globs (one per line)">
          <Input.TextArea />
        </Form.Item>
        <Form.Item name="languages" label="Languages">
          <Select
            mode="multiple"
            options={['PYTHON', 'JAVASCRIPT', 'TYPESCRIPT', 'SHELL'].map(
              (value) => ({ value, label: value }),
            )}
          />
        </Form.Item>
      </Form>
      <Space wrap>
        <Button
          onClick={async () => {
            const value = await form.validateFields();
            const result = await request.put(api, {
              ...value,
              includes: value.includes
                .split('\n')
                .map((x: string) => x.trim())
                .filter(Boolean),
              excludes: value.excludes
                .split('\n')
                .map((x: string) => x.trim())
                .filter(Boolean),
              expected_version: policy.version,
            });
            if (result.code === 200) {
              message.success('Discovery policy saved');
              await load();
            }
          }}
        >
          Save discovery policy
        </Button>
        <Button
          onClick={async () => {
            const result = await request.post(api + '/preview', {});
            if (result.code === 200) setPreview(result.data);
          }}
        >
          Preview discovery
        </Button>
        <Button
          onClick={async () => {
            const result = await request.post(api + '/apply', {});
            if (result.code === 200) {
              message.success('Discovery applied');
              await load();
              setPreview(undefined);
            }
          }}
        >
          Apply discovery
        </Button>
      </Space>
      {policy?.last_reconciled_at && (
        <Alert
          message={`Last reconcile: ${policy.last_reconciled_at}`}
          description={JSON.stringify(policy.last_result)}
        />
      )}
      {preview && (
        <Table
          size="small"
          rowKey={(row: any) => row.file?.key ?? row.task_id}
          dataSource={preview.changes}
          columns={[
            { title: 'Action', dataIndex: 'action' },
            {
              title: 'Source',
              render: (_: unknown, row: any) =>
                row.file?.relative_path ?? `Task #${row.task_id}`,
            },
          ]}
          pagination={{ pageSize: 10 }}
        />
      )}
    </Space>
  );
}
