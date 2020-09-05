const spawn = require('cross-spawn');
const YAML = require('js-yaml');
const { dirname, basename } = require('path');
const { promises: fs } = require('fs');
const { flatten } = require('lodash');

const binaryManager = require('./services/binary-manager');
const logger = require('./services/logger');

class StorageNode {
  constructor({ name, version, configPath }) {
    this.name = name;
    this.version = version;
    this.configPath = configPath;
    this.stopped = true;

    this.timestampRegex = /(([0-9]+-[0-9]+-[0-9]+)T([0-9]+:[0-9]+:[0-9]+)(\.[0-9]+)?)\+([0-9]+)/;
  }

  async init() {
    try {
      this.config = await this.readConfig();
    } catch (err) {
      logger.log({ level: 'error', msg: `Storage-Node | ${this.name} | Invalid config path or config.yaml malformed!`});

      throw err;
    }
  }

  async start() {
    logger.log({ level: 'info', msg: `Storage-Node | ${this.name} | Starting ..`});
    const binPath = await binaryManager.getForVersion(this.version);
    const args = [
      'run',
      '--config-dir',
      dirname(this.configPath),
    ];
    this.storageNodeRef = spawn(`./${basename(binPath)}`, args, {
      cwd: dirname(binPath),
      stdio: 'pipe',
    });
    this.stopped = false;
    this.storageNodeRef.on('error', () => {});
    this.storageNodeRef.stdout.on('data', (data) => {
      const lines = this._getOutputLines(data);
      lines.forEach(line => logger.log({ level: 'info', msg: `Storage-Node | ${this.name} | ${line}`}));
    });
    this.storageNodeRef.stderr.on('data', (data) => {
      const lines = this._getOutputLines(data);
      lines.forEach(line => logger.log({ level: 'error', msg: `Storage-Node | ${this.name} | ${line}`}));
    });
    this.storageNodeRef.on('close', async () => {
      if (this.stopped) {
        return;
      }
      logger.log({ level: 'error', msg: `Storage-Node | ${this.name} | Exited unexpectedly, restarting after 2 sec ..`});
      await new Promise(resolve => setTimeout(resolve, 2 * 1000));
      await this.start();
    });
    logger.log({ level: 'debug', msg: `Storage-Node | ${this.name} | Started`});
  }

  stop() {
    logger.log({ level: 'info', msg: `Storage-Node | ${this.name} | Stopping ..`});
    this.stopped = true;
    if (!this.storageNodeRef) {
      return;
    }
    this.storageNodeRef.kill();
    this.storageNodeRef = null;
    logger.log({ level: 'debug', msg: `Storage-Node | ${this.name} | Stopped`});
  }

  get apiAddress() {
    return this.config['console.address'];
  }

  async readConfig() {
    const file = await fs.readFile(this.configPath);

    return YAML.safeLoad(file);
  }

  _getOutputLines(data) {
    return flatten(
      data.toString().trim().split('\n').map(line => line.trim().split('\r'))
    ).map(line => line.replace(this.timestampRegex, '').trim());
  }
}

module.exports = StorageNode;