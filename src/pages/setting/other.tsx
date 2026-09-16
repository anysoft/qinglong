import intl from 'react-intl-universal';
import React, { useState, useEffect, useRef } from 'react';
import {
  Button,
  Checkbox,
  InputNumber,
  Form,
  Radio,
  message,
  Input,
  Modal,
  Select,
} from 'antd';
import * as DarkReader from '@umijs/ssr-darkreader';
import config from '@/utils/config';
import { request } from '@/utils/http';
import CheckUpdate from './checkUpdate';
import { SharedContext } from '@/layouts';
import './index.less';
import pick from 'lodash/pick';
import { TIMEZONES } from '@/utils/const';

const dataMap = {
  'panel-title': 'panelTitle',
  'log-remove-frequency': 'logRemoveFrequency',
  'cron-concurrency': 'cronConcurrency',
  timezone: 'timezone',
};


const Other = ({
  systemInfo,
  reloadSystemConfig,
  reloadTheme,
}: Pick<
  SharedContext,
  'reloadSystemConfig' | 'reloadTheme' | 'systemInfo'
>) => {
  const defaultTheme = localStorage.getItem('qinglong_dark_theme') || 'auto';
  const [systemConfig, setSystemConfig] = useState<{
    panelTitle?: string | null;
    logRemoveFrequency?: number | null;
    cronConcurrency?: number | null;
    timezone?: string | null;
    runningInstanceRetentionDays?: number | null;
    cronStatRetentionDays?: number | null;
  }>();
  const [form] = Form.useForm();
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [dependenceCacheTypes, setDependenceCacheTypes] = useState<string[]>(
    [],
  );
  const [compactDatabase, setCompactDatabase] = useState(false);

  const {
    enable: enableDarkMode,
    disable: disableDarkMode,
    exportGeneratedCSS: collectCSS,
    setFetchMethod,
    auto: followSystemColorScheme,
  } = DarkReader || {};

  const themeChange = (e: any) => {
    const _theme = e.target.value;
    localStorage.setItem('qinglong_dark_theme', e.target.value);
    setFetchMethod(fetch);

    if (_theme === 'dark') {
      enableDarkMode({});
    } else if (_theme === 'light') {
      disableDarkMode();
    } else {
      followSystemColorScheme({});
    }
    reloadTheme();
  };

  const handleLangChange = (v: string) => {
    localStorage.setItem('lang', v);
    const backendLang = v || navigator.language?.slice(0, 2) || 'zh';
    request
      .put(`${config.apiPrefix}system/config/lang`, { lang: backendLang })
      .catch(() => {});
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  const getSystemConfig = () => {
    request
      .get(`${config.apiPrefix}system/config`)
      .then(({ code, data }) => {
        if (code === 200 && data.info) {
          setSystemConfig(data.info);
        }
      })
      .catch((error: any) => {
        console.log(error);
      });
  };

  const updateSystemConfig = (path: keyof typeof dataMap) => {
    request
      .put(
        `${config.apiPrefix}system/config/${path}`,
        pick(systemConfig, dataMap[path]),
      )
      .then(({ code, data }) => {
        if (code === 200) {
          message.success(intl.get('更新成功'));
          if (path === 'panel-title') {
            reloadSystemConfig();
          }
        }
      })
      .catch((error: any) => {
        console.log(error);
      });
  };

  const retentionPayload = () => ({
    runningInstanceRetentionDays:
      systemConfig?.runningInstanceRetentionDays || 0,
    cronStatRetentionDays: systemConfig?.cronStatRetentionDays || 0,
  });

  const saveRetentionPolicy = () => {
    request
      .put(
        `${config.apiPrefix}system/storage-retention/config`,
        retentionPayload(),
      )
      .then(({ code }) => {
        if (code === 200) {
          message.success(intl.get('更新成功'));
        }
      });
  };

  const formatBytes = (bytes: number) => {
    if (!bytes) return '0 B';
    const units = ['B', 'KiB', 'MiB', 'GiB'];
    const unit = Math.min(
      Math.floor(Math.log(bytes) / Math.log(1024)),
      units.length - 1,
    );
    return `${(bytes / 1024 ** unit).toFixed(unit ? 1 : 0)} ${units[unit]}`;
  };

  const previewStorageCleanup = () => {
    setCleanupLoading(true);
    const payload = {
      ...retentionPayload(),
      dependenceCacheTypes,
      compactDatabase,
    };
    request
      .post(`${config.apiPrefix}system/storage-retention/preview`, payload)
      .then(({ code, data }) => {
        if (code !== 200) return;
        Modal.confirm({
          width: 560,
          centered: true,
          title: intl.get('确认清理存储数据'),
          okText: intl.get('确认清理'),
          cancelText: intl.get('取消'),
          okButtonProps: { danger: true },
          content: (
            <div>
              <p>
                {intl.get('将删除历史运行实例')}: {data.runningInstances}
              </p>
              <p>
                {intl.get('将删除任务统计')}: {data.cronStats}
              </p>
              <p>
                {intl.get('将清除依赖缓存')}: {data.dependenceCaches.length} (
                {formatBytes(data.dependenceCacheBytes)})
              </p>
              {data.dependenceCaches.length > 0 && (
                <p>{intl.get('清理依赖缓存后相关依赖需要重新安装')}</p>
              )}
              {compactDatabase && (
                <p>{intl.get('数据库压缩期间可能暂时阻塞请求')}</p>
              )}
              <p>{intl.get('此操作不可恢复，请确认已完成必要备份')}</p>
            </div>
          ),
          onOk: () => {
            setCleanupLoading(true);
            return request
              .post(`${config.apiPrefix}system/storage-retention/cleanup`, {
                ...payload,
                confirmation: 'CLEAN',
              })
              .then(({ code }) => {
                if (code === 200) {
                  message.success(intl.get('清理完成'));
                }
              })
              .finally(() => setCleanupLoading(false));
          },
        });
      })
      .finally(() => setCleanupLoading(false));
  };

  useEffect(() => {
    getSystemConfig();
  }, []);

  return (
    <>
      <Form layout="vertical" form={form}>
        <Form.Item
          label={intl.get('主题')}
          name="theme"
          initialValue={defaultTheme}
        >
          <Radio.Group
            onChange={themeChange}
            value={defaultTheme}
            optionType="button"
            buttonStyle="solid"
          >
            <Radio.Button
              value="light"
              style={{ width: 70, textAlign: 'center' }}
            >
              {intl.get('亮色')}
            </Radio.Button>
            <Radio.Button
              value="dark"
              style={{ width: 66, textAlign: 'center' }}
            >
              {intl.get('暗色')}
            </Radio.Button>
            <Radio.Button
              value="auto"
              style={{ width: 129, textAlign: 'center' }}
            >
              {intl.get('跟随系统')}
            </Radio.Button>
          </Radio.Group>
        </Form.Item>
        <Form.Item
          label={intl.get('面板标题')}
          name="panelTitle"
          tooltip={intl.get('自定义面板的站点标题，留空使用默认值“青龙”')}
        >
          <Input.Group compact>
            <Input
              style={{ width: 180 }}
              maxLength={100}
              value={systemConfig?.panelTitle || ''}
              placeholder={intl.get('留空使用默认值“青龙”')}
              onChange={(e) => {
                setSystemConfig({
                  ...systemConfig,
                  panelTitle: e.target.value,
                });
              }}
            />
            <Button
              type="primary"
              onClick={() => {
                updateSystemConfig('panel-title');
              }}
              style={{ width: 84 }}
            >
              {intl.get('确认')}
            </Button>
          </Input.Group>
        </Form.Item>
        <Form.Item
          label={intl.get('日志删除频率')}
          name="frequency"
          tooltip={intl.get('每x天自动删除x天以前的日志')}
        >
          <Input.Group compact>
            <InputNumber
              addonBefore={intl.get('每')}
              addonAfter={intl.get('天')}
              style={{ width: 180 }}
              placeholder={intl.get('未启用')}
              min={0}
              value={systemConfig?.logRemoveFrequency}
              onChange={(value) => {
                setSystemConfig({ ...systemConfig, logRemoveFrequency: value });
              }}
            />
            <Button
              type="primary"
              onClick={() => {
                updateSystemConfig('log-remove-frequency');
              }}
              style={{ width: 84 }}
            >
              {intl.get('确认')}
            </Button>
          </Input.Group>
        </Form.Item>
        <Form.Item
          label={intl.get('历史数据保留与手动清理')}
          tooltip={intl.get('保留天数为0时禁用对应清理，预览不会删除数据')}
        >
          <div style={{ marginBottom: 8 }}>
            <InputNumber
              addonBefore={intl.get('运行实例')}
              addonAfter={intl.get('天')}
              min={0}
              max={3650}
              value={systemConfig?.runningInstanceRetentionDays || 0}
              onChange={(value) => {
                setSystemConfig({
                  ...systemConfig,
                  runningInstanceRetentionDays: value,
                });
              }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <InputNumber
              addonBefore={intl.get('任务统计')}
              addonAfter={intl.get('天')}
              min={0}
              max={3650}
              value={systemConfig?.cronStatRetentionDays || 0}
              onChange={(value) => {
                setSystemConfig({
                  ...systemConfig,
                  cronStatRetentionDays: value,
                });
              }}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <Checkbox.Group
              value={dependenceCacheTypes}
              options={[
                { label: intl.get('清除 Node 依赖缓存'), value: 'node' },
                { label: intl.get('清除 Python 依赖缓存'), value: 'python3' },
              ]}
              onChange={(value) => setDependenceCacheTypes(value as string[])}
            />
          </div>
          <div style={{ marginBottom: 8 }}>
            <Checkbox
              checked={compactDatabase}
              onChange={(event) => setCompactDatabase(event.target.checked)}
            >
              {intl.get('清理后压缩数据库')}
            </Checkbox>
          </div>
          <Button onClick={saveRetentionPolicy} style={{ marginRight: 8 }}>
            {intl.get('保存设置')}
          </Button>
          <Button
            danger
            loading={cleanupLoading}
            onClick={previewStorageCleanup}
          >
            {intl.get('预览清理')}
          </Button>
        </Form.Item>
        <Form.Item label={intl.get('定时任务并发数')} name="frequency">
          <Input.Group compact>
            <InputNumber
              style={{ width: 180 }}
              min={4}
              value={systemConfig?.cronConcurrency}
              placeholder={intl.get('默认为 CPU 个数')}
              onChange={(value) => {
                setSystemConfig({ ...systemConfig, cronConcurrency: value });
              }}
            />
            <Button
              type="primary"
              onClick={() => {
                updateSystemConfig('cron-concurrency');
              }}
              style={{ width: 84 }}
            >
              {intl.get('确认')}
            </Button>
          </Input.Group>
        </Form.Item>
        <Form.Item label={intl.get('时区')} name="timezone">
          <Input.Group compact>
            <Select
              value={systemConfig?.timezone}
              style={{ width: 180 }}
              onChange={(value) => {
                setSystemConfig({ ...systemConfig, timezone: value });
              }}
              options={TIMEZONES.map((timezone) => ({
                value: timezone,
                label: timezone,
              }))}
              showSearch
              filterOption={(input, option) =>
                (option?.value || '').toLowerCase().includes(input.toLowerCase())
              }
            />
            <Button
              type="primary"
              onClick={() => {
                updateSystemConfig('timezone');
              }}
              style={{ width: 84 }}
            >
              {intl.get('确认')}
            </Button>
          </Input.Group>
        </Form.Item>

        <Form.Item label={intl.get('语言')} name="lang">
          <Select
            defaultValue={localStorage.getItem('lang') || ''}
            style={{ width: 264 }}
            onChange={handleLangChange}
            options={[
              { value: '', label: intl.get('跟随系统') },
              { value: 'zh', label: '简体中文' },
              { value: 'en', label: 'English' },
            ]}
          />
        </Form.Item>
        <Form.Item label={intl.get('检查更新')} name="update">
          <CheckUpdate systemInfo={systemInfo} />
        </Form.Item>
      </Form>

    </>
  );
};

export default Other;
