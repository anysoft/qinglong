import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  InputNumber,
  Select,
  Switch,
  message,
} from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import { obsGet } from './index';
export function TaskHealth({ id }: { id: number }) {
  const [health, setHealth] = useState<any>();
  useEffect(() => {
    const load = () => obsGet(`tasks/${id}/health`).then(setHealth);
    void load();
    const t = setInterval(() => void load(), 2000);
    return () => clearInterval(t);
  }, [id]);
  return (
    <>
      <Alert message="Health describes completed executions; readiness describes whether a task can execute." />
      <Descriptions column={1}>
        {Object.entries(health ?? {}).map(([key, value]) => (
          <Descriptions.Item key={key} label={key}>
            {String(value ?? '—')}
          </Descriptions.Item>
        ))}
      </Descriptions>
    </>
  );
}
const flags = [
  'enabled',
  'notify_success',
  'notify_failure',
  'notify_timeout',
  'notify_interrupted',
  'notify_cancelled',
  'notify_recovery',
];
export default function TaskPolicy({ id }: { id: number }) {
  const [policy, setPolicy] = useState<any>(),
    [channels, setChannels] = useState<any[]>([]);
  const [form] = Form.useForm();
  const load = async () => {
    const p = await obsGet(`tasks/${id}/notification-policy`);
    setPolicy(p);
    form.setFieldsValue({
      ...p,
      ...Object.fromEntries(flags.map((k) => [k, !!p[k]])),
    });
    setChannels(await obsGet('notification-channels'));
  };
  useEffect(() => {
    void load();
  }, [id]);
  return (
    <Form form={form} layout="vertical">
      <Form.Item label="Preset">
        <Select
          placeholder="CUSTOM"
          options={['NONE', 'FAILURE', 'SUCCESS', 'ALWAYS', 'CUSTOM'].map(
            (value) => ({ value, label: value }),
          )}
          onChange={(mode) => {
            if (mode === 'CUSTOM') return;
            form.setFieldsValue({
              enabled: mode !== 'NONE',
              notify_success: ['SUCCESS', 'ALWAYS'].includes(mode),
              notify_failure: ['FAILURE', 'ALWAYS'].includes(mode),
              notify_timeout: ['FAILURE', 'ALWAYS'].includes(mode),
              notify_interrupted: ['FAILURE', 'ALWAYS'].includes(mode),
              notify_cancelled: false,
              notify_recovery: true,
              failure_threshold: 1,
              repeat_every_failures: 0,
            });
          }}
        />
      </Form.Item>
      {flags.map((k) => (
        <Form.Item
          key={k}
          label={k.replaceAll('_', ' ')}
          name={k}
          valuePropName="checked"
        >
          <Switch />
        </Form.Item>
      ))}
      <Form.Item name="failure_threshold" label="Failure threshold">
        <InputNumber min={1} max={1000} />
      </Form.Item>
      <Form.Item
        name="repeat_every_failures"
        label="Repeat every failures (0 = once per incident)"
      >
        <InputNumber min={0} max={1000} />
      </Form.Item>
      <Form.Item name="channel_mode" label="Channel mode">
        <Select
          options={['DEFAULT', 'EXPLICIT', 'NONE'].map((value) => ({
            value,
            label: value,
          }))}
        />
      </Form.Item>
      <Form.Item name="channels" label="Explicit channels">
        <Select
          mode="multiple"
          options={channels
            .filter((c) => !c.archived)
            .map((c) => ({ value: c.id, label: c.name }))}
        />
      </Form.Item>
      <Button
        type="primary"
        onClick={async () => {
          const v = await form.validateFields();
          const r = await request.patch<any, any>(
            config.apiPrefix + `tasks/${id}/notification-policy`,
            { ...v, expected_version: policy.version },
          );
          if (r.code === 200) {
            message.success('Notification policy saved');
            await load();
          } else message.error(r.error_code);
        }}
      >
        Save notification policy
      </Button>
    </Form>
  );
}
