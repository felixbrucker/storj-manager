const YAML = require('js-yaml');
const { homedir } = require('os');
const { join } = require('path');
const { promises: fs } = require('fs');

const logger = require('./logger');

class Config {
  async init({ configPath = 'storj-manager.yaml'} = {}) {
    this.configPath = configPath;
    await this.load();
  }

  get nodes() {
    return this.config.nodes;
  }

  get version() {
    return this.config.version;
  }

  get binaryDirectory() {
    return this.config.binaryDirectory;
  }

  get automaticUpdates() {
    return this.config.automaticUpdates;
  }

  async updateVersion(version) {
    if (this.config.version === version) {
      return;
    }
    this.config.version = version;
    await this.save();
    logger.log({ level: 'info', msg: `Config | Updated version to ${version}`});
  }

  async load() {
    let file;
    try {
      file = await fs.readFile(this.configPath);
    } catch (err) {
      this.config = this.defaultConfig;
      await this.save();
      logger.log({ level: 'info', msg: `Config | Default config written, exiting ..`});
      process.exit();
    }
    this.config = YAML.safeLoad(file);
  }

  async save() {
    const yaml = YAML.safeDump(this.config, {
      lineWidth: 140,
    });
    await fs.writeFile(this.configPath, yaml);
  }

  get defaultConfig() {
    return {
      binaryDirectory: join(homedir(), '.config', 'storj-manager', 'binaries'),
      version: null,
      automaticUpdates: true,
      nodes: [{
        name: 'Node 01',
        configPath: 'C:\\Program Files\\Storj\\Storage Node',
      }],
    };
  }
}

module.exports = new Config();
