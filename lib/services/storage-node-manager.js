const { join } = require('path');

const config = require('./config');
const binaryManager = require('./binary-manager');
const logger = require('./logger');
const StorageNode = require('../storage-node');

class StorageNodeManager {
  async init() {
    this.storageNodes = config.nodes
      .filter(nodeConfig => !nodeConfig.disabled)
      .map(nodeConfig => {
        const configPath = join(nodeConfig.configDir, 'config.yaml');

        return new StorageNode({
          ...nodeConfig,
          configPath,
          version: config.version,
        });
      });
    await Promise.all(this.storageNodes.map(node => node.init()));

    if (config.automaticUpdates) {
      binaryManager.on('update', async (newVersion) => {
        await Promise.all(this.storageNodes.map(async storageNode => {
          logger.log({ level: 'info', msg: `Storage-Node-Manager | Restarting ${storageNode.name} to update to ${newVersion}`});
          storageNode.stop();
          storageNode.version = newVersion;
          await storageNode.start();
        }));

        await config.updateVersion(newVersion);
      });
    }
  }

  async start() {
    await Promise.all(this.storageNodes.filter(storageNode => storageNode.isInitialized).map(storageNode => storageNode.start()));
    logger.log({ level: 'info', msg: `Storage-Node-Manager | All nodes have been started`});
  }
}

module.exports = new StorageNodeManager();