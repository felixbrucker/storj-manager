const spawn = require('cross-spawn');
const YAML = require('js-yaml');
const mkdirp = require('mkdirp');
const { dirname, basename, join } = require('path');
const { promises: fs, existsSync } = require('fs');
const { flatten } = require('lodash');

const binaryManager = require('./services/binary-manager');
const logger = require('./services/logger');

class StorageNode {
  constructor({ name, version, configPath, configDir }) {
    this.name = name;
    this.version = version;
    this.configPath = configPath;
    this.configDir = configDir;
    this.stopped = true;
    this.isInitialized = false;

    this.timestampRegexes = [
      /(([0-9]+-[0-9]+-[0-9]+)T([0-9]+:[0-9]+:[0-9]+)(\.[0-9]+)?)\+([0-9]+)/,
      /(([0-9]+-[0-9]+-[0-9]+)T([0-9]+:[0-9]+:[0-9]+)\.([0-9]+)Z)/
    ];
  }

  async init() {
    if (!existsSync(this.configPath)) {
      await this.setup();

      return;
    }
    try {
      this.config = await this.readConfig();
    } catch (err) {
      logger.log({ level: 'error', msg: `Storage-Node | ${this.name} | Invalid config path or config.yaml malformed!`});

      throw err;
    }
    this.isInitialized = true;
  }

  async setup() {
    logger.log({ level: 'info', msg: `Storage-Node | ${this.name} | Setting up new node ..`});
    const binPath = await binaryManager.getForVersion(this.version);
    mkdirp.sync(this.configDir, { mode: 0o770 });
    const args = [
      'setup',
      '--config-dir',
      this.configDir,
      '--identity-dir',
      join(this.configDir, 'identity'),
    ];
    this.storageNodeSetupRef = spawn(`./${basename(binPath)}`, args, {
      cwd: dirname(binPath),
      stdio: 'pipe',
    });
    this.storageNodeSetupRef.on('error', () => {});
    this.storageNodeSetupRef.stdout.on('data', (data) => {
      const lines = this._getOutputLines(data);
      lines.forEach(line => logger.log({ level: 'info', msg: `Storage-Node | ${this.name} | ${line}`}));
    });
    this.storageNodeSetupRef.stderr.on('data', (data) => {
      const lines = this._getOutputLines(data);
      lines.forEach(line => logger.log({ level: 'error', msg: `Storage-Node | ${this.name} | ${line}`}));
    });
    await new Promise(resolve => this.storageNodeSetupRef.once('close', resolve));
    this.storageNodeSetupRef = null;
    logger.log({ level: 'debug', msg: `Storage-Node | ${this.name} | Done setting up`});
  }

  async start() {
    logger.log({ level: 'info', msg: `Storage-Node | ${this.name} | Starting ..`});
    const binPath = await binaryManager.getForVersion(this.version);
    const args = [
      'run',
      '--config-dir',
      this.configDir,
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
    ).map(line => this.timestampRegexes.reduce((acc, timestampRegex) => acc.replace(timestampRegex, '').trim(), line));
  }
}

module.exports = StorageNode;