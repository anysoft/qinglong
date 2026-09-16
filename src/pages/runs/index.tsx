import React, { useState } from 'react';
import { Card } from 'antd';
import { RunsTable, RunDetail } from '@/components/observability';
export default function RunsPage() {
  const [id, setId] = useState<number | undefined>(() => {
    const n = Number(new URLSearchParams(location.search).get('run'));
    return n > 0 ? n : undefined;
  });
  return (
    <Card title="Runs">
      <RunsTable />
      <RunDetail id={id} onClose={() => setId(undefined)} />
    </Card>
  );
}
