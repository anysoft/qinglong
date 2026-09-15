import fs from 'fs/promises';
import path from 'path';
import { createHash } from 'crypto';
import { TextDecoder } from 'util';
import { Service } from 'typedi';
import { Transaction } from 'sequelize';
import config from '../config';
import { sequelize } from '../data';
import {
  ConfigAssetModel,
  ConfigAssetRevisionModel,
  RepositoryConfigBindingModel,
  TaskConfigBindingModel,
  ConfigAsset,
  ConfigRevision,
} from '../data/configAsset';
import {
  ConfigAssetError,
  configId,
  TEXT_ASSET_LIMIT,
  privateDirectory,
  safeParents,
  atomicPrivateWrite,
  syncDirectory,
} from '../shared/configAssets';

@Service()
export default class ConfigAssetService {
  readonly root = path.join(config.dataPath, 'config-assets');
  async revisions(assetId: number, transaction?: Transaction) {
    return ConfigAssetRevisionModel.findAll({
      where: { asset_id: configId(assetId) },
      order: [['revision_number', 'DESC']],
      transaction,
    });
  }
  async usage(assetId: number, transaction?: Transaction) {
    return {
      repositories: await RepositoryConfigBindingModel.findAll({
        where: { asset_id: configId(assetId) },
        transaction,
      }),
      tasks: await TaskConfigBindingModel.findAll({
        where: { asset_id: assetId },
        transaction,
      }),
    };
  }
  async list() {
    const assets = await ConfigAssetModel.findAll({ order: [['id', 'ASC']] });
    return Promise.all(
      assets.map(async (row) => {
        const asset = row.get({ plain: true });
        const revision = asset.current_revision_id
          ? await ConfigAssetRevisionModel.findByPk(asset.current_revision_id)
          : null;
        const usage = await this.usage(asset.id);
        return {
          ...asset,
          current_revision: revision?.get({ plain: true }) ?? null,
          has_content: !!revision,
          usage_count: usage.repositories.length + usage.tasks.length,
        };
      }),
    );
  }
  async readRevision(revision: ConfigRevision) {
    await privateDirectory(this.root);
    const expected = `asset-${configId(revision.asset_id)}/revisions/${configId(
      revision.revision_number,
    )}/content`;
    if (revision.storage_key !== expected)
      throw new ConfigAssetError('CONFIG_REVISION_CORRUPT');
    const file = await safeParents(this.root, expected);
    const stat = await fs.lstat(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== revision.size ||
      stat.size > TEXT_ASSET_LIMIT
    )
      throw new ConfigAssetError('CONFIG_REVISION_CORRUPT');
    const handle = await fs.open(
      file,
      require('fs').constants.O_RDONLY | require('fs').constants.O_NOFOLLOW,
    );
    let content: Buffer;
    try {
      content = await handle.readFile();
    } finally {
      await handle.close();
    }
    if (
      createHash('sha256').update(content).digest('hex') !== revision.checksum
    )
      throw new ConfigAssetError('CONFIG_REVISION_CORRUPT');
    return content;
  }
  async content(assetId: number) {
    const asset = await ConfigAssetModel.findByPk(configId(assetId));
    if (!asset) throw new ConfigAssetError('CONFIG_ASSET_NOT_FOUND', 404);
    if (asset.getDataValue('is_secret'))
      throw new ConfigAssetError('SECRET_CONTENT_UNAVAILABLE', 403);
    const revision = await ConfigAssetRevisionModel.findByPk(
      asset.getDataValue('current_revision_id')!,
    );
    if (!revision) throw new ConfigAssetError('CONFIG_REVISION_NOT_FOUND', 404);
    return (await this.readRevision(revision.get({ plain: true }))).toString(
      'utf8',
    );
  }
  async save(input: {
    id?: number;
    name: string;
    description?: string;
    content_type?: string;
    is_secret: boolean;
    content?: string;
    expected_version?: number;
  }) {
    if (
      typeof input.name !== 'string' ||
      !input.name.trim() ||
      input.name.length > 255 ||
      typeof input.is_secret !== 'boolean' ||
      (input.description?.length ?? 0) > 4096
    )
      throw new ConfigAssetError('CONFIG_ASSET_INVALID');
    if ((input.content_type ?? 'TEXT') !== 'TEXT')
      throw new ConfigAssetError('CONFIG_BINARY_NOT_SUPPORTED');
    let bytes: Buffer | undefined;
    if (input.content !== undefined) {
      if (typeof input.content !== 'string')
        throw new ConfigAssetError('CONFIG_CONTENT_INVALID');
      bytes = Buffer.from(input.content, 'utf8');
      if (
        bytes.length > TEXT_ASSET_LIMIT ||
        new TextDecoder('utf-8', { fatal: true }).decode(bytes) !==
          input.content
      )
        throw new ConfigAssetError('CONFIG_CONTENT_INVALID');
    }
    let createdDirectory: string | undefined;
    try {
      return await sequelize.transaction(
        { type: Transaction.TYPES.IMMEDIATE },
        async (transaction) => {
          let row = input.id
            ? await ConfigAssetModel.findByPk(configId(input.id), {
                transaction,
              })
            : null;
          if (input.id && !row)
            throw new ConfigAssetError('CONFIG_ASSET_NOT_FOUND', 404);
          if (row && row.getDataValue('version') !== input.expected_version)
            throw new ConfigAssetError('CONFIG_EDIT_CONFLICT', 409);
          // Once secret, an asset cannot be declassified to reveal its historical revisions.
          if (row?.getDataValue('is_secret') && !input.is_secret)
            throw new ConfigAssetError('CONFIG_SECRET_DOWNGRADE_FORBIDDEN');
          if (!row) {
            if (!bytes) throw new ConfigAssetError('CONFIG_CONTENT_REQUIRED');
            row = await ConfigAssetModel.create(
              {
                name: input.name.trim(),
                description: input.description ?? '',
                content_type: 'TEXT',
                is_secret: input.is_secret,
              },
              { transaction },
            );
          }
          const asset = row.get({ plain: true });
          if (bytes) {
            const latest = (await this.revisions(asset.id, transaction))[0];
            let number = (latest?.getDataValue('revision_number') ?? 0) + 1;
            await privateDirectory(this.root);
            const parent = await safeParents(
              this.root,
              `asset-${asset.id}/revisions/placeholder`,
              true,
            );
            // A process crash may leave an uncommitted immutable directory. Never
            // overwrite/delete it; allocate a new revision number above occupied paths.
            let revisionDirectory: string;
            for (;;) {
              revisionDirectory = path.join(
                path.dirname(parent),
                String(configId(number)),
              );
              try {
                await fs.mkdir(revisionDirectory, { mode: 0o700 });
                break;
              } catch (error) {
                if ((error as NodeJS.ErrnoException).code !== 'EEXIST')
                  throw error;
                number++;
              }
            }
            const storageKey = `asset-${asset.id}/revisions/${number}/content`;
            createdDirectory = revisionDirectory;
            await syncDirectory(path.dirname(revisionDirectory));
            const file = path.join(revisionDirectory, 'content');
            if (
              await fs.lstat(file).then(
                () => true,
                (error) => {
                  if (error.code === 'ENOENT') return false;
                  throw error;
                },
              )
            )
              throw new ConfigAssetError('CONFIG_REVISION_STORAGE_CONFLICT');
            await atomicPrivateWrite(file, bytes, 0o400);
            const revision = await ConfigAssetRevisionModel.create(
              {
                asset_id: asset.id,
                revision_number: number,
                storage_key: storageKey,
                size: bytes.length,
                checksum: createHash('sha256').update(bytes).digest('hex'),
              },
              { transaction },
            );
            row.set('current_revision_id', revision.getDataValue('id'));
          }
          row.set({
            name: input.name.trim(),
            description: input.description ?? '',
            is_secret: input.is_secret,
            version: asset.version + (input.id ? 1 : 0),
          });
          await row.save({ transaction });
          return row.get({ plain: true });
        },
      );
    } catch (error) {
      if (createdDirectory)
        await fs.rm(createdDirectory, { recursive: true, force: true });
      if (error instanceof ConfigAssetError) throw error;
      throw new ConfigAssetError('CONFIG_SAVE_FAILED', 409);
    }
  }
  async remove(assetId: number, expectedVersion: number) {
    await sequelize.transaction(
      { type: Transaction.TYPES.IMMEDIATE },
      async (transaction) => {
        const row = await ConfigAssetModel.findByPk(configId(assetId), {
          transaction,
        });
        if (!row) throw new ConfigAssetError('CONFIG_ASSET_NOT_FOUND', 404);
        if (row.getDataValue('version') !== expectedVersion)
          throw new ConfigAssetError('CONFIG_EDIT_CONFLICT', 409);
        const usage = await this.usage(assetId, transaction);
        if (usage.repositories.length || usage.tasks.length)
          throw new ConfigAssetError('CONFIG_ASSET_IN_USE', 409);
        await row.update({ current_revision_id: null }, { transaction });
        await ConfigAssetRevisionModel.destroy({
          where: { asset_id: assetId },
          transaction,
        });
        await row.destroy({ transaction });
      },
    );
    // Preserve unreferenced immutable storage for future explicit GC/backup policy.
  }
}
