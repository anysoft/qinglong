import React from 'react';
import config from '@/utils/config';
export default function RetiredScriptPage() {
  return (
    <p>
      脚本编辑已迁移到 <a href={`${config.baseUrl}workspace`}>Code Workspace</a>
      。原有文件保留于磁盘。
    </p>
  );
}
