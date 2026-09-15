import React, { useEffect, useState } from 'react';
import { Button, Space, Table, Tag } from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';

export default function RepositoryEnvironment({ id }: { id: number }) {
  const [profiles, setProfiles] = useState<any[]>([]);
  useEffect(() => { request.get(`${config.apiPrefix}scoped-env/repositories/${id}/profiles`).then(r => { if (r.code === 200) setProfiles(r.data); }).catch(() => {}); }, [id]);
  return <Space direction="vertical" style={{ width: '100%' }}>
    <Button href={`${config.baseUrl}scoped-env?repository=${id}`}>管理 Environment Profiles</Button>
    <Table rowKey="id" dataSource={profiles} columns={[
      { title: 'Profile', dataIndex: 'name' }, { title: 'Default', render: (_: any, row: any) => row.is_default && <Tag>Default</Tag> },
      { title: '状态', dataIndex: 'status' }, { title: 'Variables', dataIndex: 'variables_count' },
      { title: 'Used by', render: (_: any, row: any) => `Subscriptions ${row.used_by.subscriptions} / Tasks ${row.used_by.tasks}` },
    ]} />
  </Space>;
}
