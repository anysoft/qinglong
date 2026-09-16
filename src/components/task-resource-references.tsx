import React, { useEffect, useState } from 'react';
import { Alert, Button, Card, Space, Typography } from 'antd';
import { request } from '@/utils/http';
import config from '@/utils/config';
export function TaskResourceReferences({
  kind,
  id,
  onBlocked,
}: {
  kind: 'python' | 'node' | 'worktree' | 'repository';
  id: number;
  onBlocked?: (blocked: boolean) => void;
}) {
  const [references, setReferences] = useState<any>();
  const load = async () => {
    const response = await request.get(
      `${config.apiPrefix}task-resources/${kind}/${id}/references`,
    );
    if (response.code === 200) {
      setReferences(response.data);
      onBlocked?.(response.data.tasks_count + response.data.defaults_count > 0);
    }
  };
  useEffect(() => {
    setReferences(undefined);
    onBlocked?.(true);
    load().catch(() => {});
  }, [kind, id]);
  return (
    <Card
      size="small"
      title={`Used by Tasks: ${references?.tasks_count ?? '…'}`}
      extra={
        <Button size="small" onClick={load}>
          Refresh references
        </Button>
      }
    >
      <Space direction="vertical">
        {references?.tasks.map((task: any) => (
          <Typography.Link
            key={task.id}
            href={`${config.baseUrl}tasks?task_id=${task.id}`}
          >
            {task.name} · Task {task.id}
          </Typography.Link>
        ))}
        {references?.defaults.map((binding: any) => (
          <span key={binding.id}>
            {binding.repository_id
              ? `Repository ${binding.repository_id}`
              : `Subscription ${binding.subscription_id}`}{' '}
            Runtime Default · {binding.kind}
          </span>
        ))}
        {references &&
          references.tasks_count + references.defaults_count > 0 && (
            <Alert
              type="info"
              message="删除受保护：请先解除 Task 和 Runtime Default 引用。"
            />
          )}
      </Space>
    </Card>
  );
}
