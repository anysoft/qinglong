import React, { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Descriptions,
  Form,
  Input,
  Modal,
  Popconfirm,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { saveAs } from 'file-saver';
import { request } from '@/utils/http';
import config from '@/utils/config';
const base = config.apiPrefix;
export default function BackupSettings() {
  const [rows, setRows] = useState<any[]>([]),
    [restore, setRestore] = useState<any>(),
    [operation, setOperation] = useState<any>();
  const [dialog, setDialog] = useState<{ kind: string; id?: string } | null>(
      null,
    ),
    [detail, setDetail] = useState<any>(),
    [importId, setImportId] = useState('');
  const [form] = Form.useForm(),
    [file, setFile] = useState<File>(),
    [busy, setBusy] = useState(false);
  const refresh = async () => {
    const [backups, status] = await Promise.all([
      request.get(base + 'backups'),
      request.get(base + 'restore/status'),
    ]);
    setRows(backups.data);
    setRestore(status.data);
  };
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!operation || !['QUEUED', 'RUNNING'].includes(operation.status)) return;
    let stopped = false;
    const timer = setInterval(async () => {
      try {
        const response = await request.get(
          base + 'backups/operations/' + operation.id,
        );
        if (stopped) return;
        const value = response.data;
        setOperation(value);
        if (value.status === 'SUCCESS') {
          if (value.kind === 'IMPORT') setImportId(value.result);
          await refresh();
        }
      } catch {
        clearInterval(timer);
      }
    }, 1000);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [operation?.id, operation?.status]);
  const active =
    busy || (!!operation && ['QUEUED', 'RUNNING'].includes(operation.status));
  const start = async (url: string, data?: any) => {
    setBusy(true);
    try {
      const response = await request.post(base + url, data);
      setOperation(response.data);
    } finally {
      setBusy(false);
    }
  };
  const close = () => {
    setDialog(null);
    form.resetFields();
    setFile(undefined);
  };
  const submit = async () => {
    const values = await form.validateFields();
    if (!dialog) return;
    if (dialog.kind === 'import') {
      if (!file) {
        message.error('请选择加密备份文件');
        return;
      }
      const data = new FormData();
      data.append('passphrase', values.passphrase);
      data.append('file', file);
      await start('restores/import', data);
    } else if (dialog.kind === 'export')
      await start(`backups/${dialog.id}/export`, {
        passphrase: values.passphrase,
      });
    else
      await start(`restores/${dialog.id}/stage`, {
        confirmation: values.confirmation,
        source: 'imports',
      });
    close();
  };
  return (
    <Space
      direction="vertical"
      size="middle"
      style={{
        width: '100%',
        padding: 16,
        overflow: 'auto',
        maxHeight: 'calc(100vh - 200px)',
      }}
    >
      <Typography.Title level={4}>
        Backup &amp; Restore / 备份与恢复
      </Typography.Title>
      <Typography.Paragraph>
        备份包含
        Git、本地工作区、配置和运行历史。便携文件使用口令加密；托管运行时和依赖环境需在恢复后显式重建。
      </Typography.Paragraph>
      {restore?.stage === 'PENDING' && (
        <Alert
          type="warning"
          showIcon
          message="RESTORE_PENDING — 等待重启恢复"
          description="新的写入已暂停。请重启后端以离线应用恢复，或取消待恢复请求。"
          action={
            <Button
              onClick={async () => {
                await request.delete(base + `restores/${restore.id}/stage`);
                setImportId('');
                await refresh();
              }}
            >
              取消待恢复请求
            </Button>
          }
        />
      )}
      {restore && (
        <Alert
          type={restore.stage === 'COMPLETE' ? 'success' : 'info'}
          message={'Restore: ' + restore.stage}
        />
      )}
      <Space wrap>
        <Button
          type="primary"
          disabled={active || restore?.stage === 'PENDING'}
          onClick={() => start('backups')}
        >
          创建备份
        </Button>
        <Button disabled={active} onClick={() => setDialog({ kind: 'import' })}>
          导入加密备份
        </Button>
        <Button onClick={refresh}>刷新</Button>
      </Space>
      {operation && (
        <Alert
          type={
            operation.status === 'FAILED'
              ? 'error'
              : operation.status === 'SUCCESS'
              ? 'success'
              : 'info'
          }
          message={`${operation.kind || 'Operation'}: ${operation.status}`}
          description={
            <Space direction="vertical">
              <span>
                {operation.error_code || operation.phase} ·{' '}
                {operation.processed_files || 0} files ·{' '}
                {operation.processed_bytes || 0} bytes
              </span>
              {operation.kind === 'EXPORT' &&
                operation.status === 'SUCCESS' && (
                  <Button
                    onClick={async () => {
                      const blob = await request.get<Blob>(
                        base + `backups/exports/${operation.result}/download`,
                        { responseType: 'blob' },
                      );
                      saveAs(blob, operation.result + '.platform-backup');
                    }}
                  >
                    下载加密备份
                  </Button>
                )}
            </Space>
          }
        />
      )}
      <Table
        rowKey="id"
        dataSource={rows}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 950 }}
        columns={[
          { title: '创建时间', dataIndex: 'created_at' },
          {
            title: '状态',
            dataIndex: 'status',
            render: (value) => <Tag color="green">{value}</Tag>,
          },
          { title: 'Schema', dataIndex: 'schema' },
          { title: 'Bytes', dataIndex: 'size' },
          {
            title: '操作',
            render: (_, row) => (
              <Space wrap>
                <Button
                  size="small"
                  onClick={async () =>
                    setDetail(
                      (await request.get(base + 'backups/' + row.id)).data,
                    )
                  }
                >
                  详情
                </Button>
                <Button
                  size="small"
                  disabled={active}
                  onClick={() => start(`backups/${row.id}/validate`)}
                >
                  验证
                </Button>
                <Button
                  size="small"
                  disabled={active}
                  onClick={() => setDialog({ kind: 'export', id: row.id })}
                >
                  加密导出
                </Button>
                <Popconfirm
                  title="删除此本地备份？"
                  onConfirm={async () => {
                    await request.delete(base + 'backups/' + row.id);
                    await refresh();
                  }}
                >
                  <Button size="small" danger disabled={active}>
                    删除
                  </Button>
                </Popconfirm>
              </Space>
            ),
          },
        ]}
      />
      {importId && (
        <Alert
          type="success"
          message="导入文件已验证"
          description={
            <Space>
              <Typography.Text code>{importId}</Typography.Text>
              <Button
                disabled={active}
                onClick={() => start(`restores/${importId}/validate`)}
              >
                验证导入
              </Button>
              <Button
                danger
                disabled={active || restore?.stage === 'PENDING'}
                onClick={() => setDialog({ kind: 'stage', id: importId })}
              >
                暂存恢复
              </Button>
            </Space>
          }
        />
      )}
      {restore?.rebuild_plan && (
        <>
          <Typography.Title level={5}>
            Missing Managed Resources / 待重建资源
          </Typography.Title>
          <Descriptions bordered size="small" column={1}>
            {Object.entries(restore.rebuild_plan).map(([key, items]) => (
              <Descriptions.Item key={key} label={key}>
                {(items as any[])
                  .map(
                    (item) =>
                      `${item.id}${
                        item.version ? ' (' + item.version + ')' : ''
                      }`,
                  )
                  .join(', ') || '—'}
              </Descriptions.Item>
            ))}
          </Descriptions>
          <Button
            disabled={active || restore.stage !== 'COMPLETE'}
            onClick={() => start('restore/rebuild')}
          >
            重建缺失的托管资源
          </Button>
        </>
      )}
      <Modal
        title={
          dialog?.kind === 'import'
            ? '导入加密备份'
            : dialog?.kind === 'export'
            ? '加密导出'
            : '确认恢复'
        }
        open={!!dialog}
        onCancel={close}
        onOk={submit}
        confirmLoading={busy}
        destroyOnClose
      >
        <Form form={form} layout="vertical" preserve={false}>
          {dialog?.kind === 'import' && (
            <Form.Item label="备份文件">
              <input
                aria-label="备份文件"
                type="file"
                accept=".platform-backup"
                onChange={(e) => setFile(e.target.files?.[0])}
              />
            </Form.Item>
          )}
          {dialog?.kind === 'stage' ? (
            <>
              <Alert
                type="warning"
                message="重启后将切换数据目录，现有数据保留在隔离目录。"
              />
              <Form.Item
                name="confirmation"
                label="输入 RESTORE"
                rules={[
                  {
                    validator: (_, value) =>
                      value === 'RESTORE'
                        ? Promise.resolve()
                        : Promise.reject(new Error('请输入 RESTORE')),
                  },
                ]}
              >
                <Input autoComplete="off" />
              </Form.Item>
            </>
          ) : (
            <>
              <Form.Item
                name="passphrase"
                label="加密口令"
                rules={[{ required: true, min: 12 }]}
              >
                <Input.Password autoComplete="new-password" />
              </Form.Item>
              {dialog?.kind === 'export' && (
                <Form.Item
                  name="confirm"
                  label="确认口令"
                  dependencies={['passphrase']}
                  rules={[
                    { required: true },
                    {
                      validator: (_, value) =>
                        value === form.getFieldValue('passphrase')
                          ? Promise.resolve()
                          : Promise.reject(new Error('两次口令不一致')),
                    },
                  ]}
                >
                  <Input.Password autoComplete="new-password" />
                </Form.Item>
              )}
            </>
          )}
        </Form>
      </Modal>
      <Modal
        title="备份详情"
        open={!!detail}
        onCancel={() => setDetail(null)}
        footer={null}
      >
        <Descriptions column={1}>
          {detail &&
            Object.entries(detail).map(([key, value]) => (
              <Descriptions.Item key={key} label={key}>
                {typeof value === 'object'
                  ? JSON.stringify(value)
                  : String(value)}
              </Descriptions.Item>
            ))}
        </Descriptions>
      </Modal>
    </Space>
  );
}
