#!/usr/bin/env node

const binaryManager = require('./lib/services/binary-manager');
const storageNodeManager = require('./lib/services/storage-node-manager');
const config = require('./lib/services/config');

(async () => {
  try {
    await config.init();
    await binaryManager.init();
    await storageNodeManager.init();
  } catch (err) {
    process.exit(1);
  }

  await storageNodeManager.start();
})();