import DiscoveryPolicy from './discovery';
import intl from 'react-intl-universal';
import React, { useEffect, useState } from 'react';
import { Modal, message, InputNumber, Form, Radio, Select, Input, Switch, Button, Alert } from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
import { TaskEnvironment } from '@/components/scoped-environment';
import CronExpressionParser from 'cron-parser';

const SubscriptionModal = ({ subscription, handleCancel }: { subscription?: any; handleCancel: (updated?: any) => void }) => {
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [repositories, setRepositories] = useState<any[]>([]);
  const [refs, setRefs] = useState<string[]>([]);
  const scheduleType = Form.useWatch('schedule_type', form);
  const repositoryId = Form.useWatch('repository_id', form);
  useEffect(() => { request.get(`${config.apiPrefix}repositories`).then(r => { if (r.code === 200) setRepositories(r.data); }).catch(() => {}); }, []);
  useEffect(() => {
    setRefs([]);
    if (repositoryId) request.get(`${config.apiPrefix}repositories/${repositoryId}/refs`).then(r => {
      if (r.code === 200) setRefs((Array.isArray(r.data) ? r.data : []).filter((x: any) => x.type === 'branch').map((x: any) => x.name));
    }).catch(() => {});
  }, [repositoryId]);
  const handleOk = async () => {
    const values = await form.validateFields();
    setLoading(true);
    try {
      const payload = { ...values, ...(subscription ? { id: subscription.id } : {}), is_disabled: values.is_disabled ? 1 : 0 };
      if (payload.schedule_type === 'crontab') delete payload.interval_schedule;
      else delete payload.schedule;
      const result = await request[subscription ? 'put' : 'post'](`${config.apiPrefix}subscriptions`, payload);
      if (result.code === 200) { message.success(intl.get(subscription ? '更新订阅成功' : '创建订阅成功')); handleCancel(result.data); }
    } finally { setLoading(false); }
  };
  return <Modal title={intl.get(subscription ? '编辑订阅' : '创建订阅')} open centered maskClosable={false} onOk={() => handleOk().catch(() => {})} onCancel={() => handleCancel()} confirmLoading={loading}>
    <Form form={form} layout="vertical" initialValues={{ schedule_type: 'crontab', ...subscription, is_disabled: !!subscription?.is_disabled }}>
      <Form.Item name="name" label={intl.get('名称')} rules={[{ required: true }]}><Input /></Form.Item>
      <Form.Item name="repository_id" label="Repository" rules={[{ required: true }]} extra={<a href={`${config.baseUrl}repository`}>管理仓库与凭据</a>}><Select showSearch optionFilterProp="label" options={repositories.map(r => ({ value: r.id, label: r.name + ' · ' + r.remote_url }))} /></Form.Item>
      <Form.Item name="branch" label="Branch" extra="仅支持分支；留空使用仓库默认分支。"><Input list="subscription-branches" /></Form.Item><datalist id="subscription-branches">{refs.map(ref => <option key={ref} value={ref} />)}</datalist>
      <Form.Item name="schedule_type" label={intl.get('定时类型')}><Radio.Group><Radio value="crontab">Cron</Radio><Radio value="interval">Interval</Radio></Radio.Group></Form.Item>
      {scheduleType === 'interval' ? <Input.Group compact><Form.Item name={['interval_schedule', 'value']} label="每" rules={[{ required: true }]}><InputNumber min={1} precision={0} /></Form.Item><Form.Item name={['interval_schedule', 'type']} label="单位" rules={[{ required: true }]}><Select style={{ width: 120 }} options={['days', 'hours', 'minutes', 'seconds'].map(value => ({ value, label: value }))} /></Form.Item></Input.Group> : <Form.Item name="schedule" label="Cron" rules={[{ validator: async (_, value) => { if (value) CronExpressionParser.parse(value); } }]} extra="留空时手动运行。"><Input /></Form.Item>}
      <Form.Item name="is_disabled" label="禁用" valuePropName="checked"><Switch /></Form.Item>
    </Form>
    {subscription?.id && <><Button loading={loading} onClick={async () => { setLoading(true); try { const r = await request.post(`${config.apiPrefix}subscriptions/${subscription.id}/prepare`, {}); if (r.code === 200) message.success(`Worktree #${r.data.worktree_id} 已准备`); } finally { setLoading(false); } }}>准备已保存的订阅</Button>{subscription.worktree_id && <Alert message={`Worktree #${subscription.worktree_id} · ${subscription.last_sync_state || '未同步'}`} />}<TaskEnvironment id={subscription.id} subscription /><DiscoveryPolicy subscriptionId={subscription.id} /></>}
  </Modal>;
};
export default SubscriptionModal;
