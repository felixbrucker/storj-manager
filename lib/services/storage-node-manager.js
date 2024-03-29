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
        const initializeStorageNodes = this.storageNodes.filter(storageNode => storageNode.isInitialized);
        for (let i = 0; i < initializeStorageNodes.length; i += 1) {
          const storageNode = initializeStorageNodes[i];
          logger.log({ level: 'info', msg: `Storage-Node-Manager | Restarting ${storageNode.name} to update to ${newVersion}`});
          storageNode.stop();
          storageNode.version = newVersion;
          await new Promise(resolve => setTimeout(resolve, 1000));
          await storageNode.start();
          if (config.staggeredStartDelayInSeconds && i < initializeStorageNodes.length - 1) {
            await new Promise(resolve => setTimeout(resolve, config.staggeredStartDelayInSeconds * 1000));
          }
        }

        await config.updateVersion(newVersion);
      });
    }
  }

  async start() {
    const initializeStorageNodes = this.storageNodes.filter(storageNode => storageNode.isInitialized);
    for (let i = 0; i < initializeStorageNodes.length; i += 1) {
      const storageNode = initializeStorageNodes[i];
      await storageNode.start();
      if (config.staggeredStartDelayInSeconds && i < initializeStorageNodes.length - 1) {
        await new Promise(resolve => setTimeout(resolve, config.staggeredStartDelayInSeconds * 1000));
      }
    }
    logger.log({ level: 'info', msg: `Storage-Node-Manager | All nodes have been started`});
  }
}

module.exports = new StorageNodeManager();
