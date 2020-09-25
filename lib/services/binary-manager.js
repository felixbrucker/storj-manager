const axios = require('axios');
const EventEmitter = require('events');
const mkdirp = require('mkdirp');
const decompress = require('decompress');
const { createWriteStream, existsSync, promises: fs } = require('fs');
const { join } = require('path');
const { tmpdir, platform } = require('os');

const config = require('./config');
const logger = require('./logger');

class BinaryManager extends EventEmitter {
  async init() {
    mkdirp.sync(config.binaryDirectory, { mode: 0o770 });

    let suggestedVersion = null;
    try {
      suggestedVersion = await this.retrieveSuggestedVersion();
      await this.getForVersion(suggestedVersion);
      this.latestVersion = suggestedVersion;
      if (config.automaticUpdates) {
        await config.updateVersion(this.latestVersion);
      }
    } catch (err) {
      logger.log({ level: 'error', msg: `Binary-Manager | Failed to update to ${suggestedVersion}`});
    }

    setInterval(async () => {
      const suggestedVersion = await this.retrieveSuggestedVersion();
      if (this.latestVersion === suggestedVersion) {
        return;
      }
      logger.log({ level: 'info', msg: `Binary-Manager | New version detected: ${suggestedVersion}`});
      try {
        await this.getForVersion(suggestedVersion);
        this.emit('update', suggestedVersion);
        this.latestVersion = suggestedVersion;
      } catch (err) {
        logger.log({ level: 'error', msg: `Binary-Manager | Failed to update to ${suggestedVersion}`});
      }
    }, 5 * 60 * 1000);
  }

  async getForVersion(version = this.latestVersion) {
    const binPath = this.getVersionBinPath(version);
    if (existsSync(binPath)) {
      return binPath;
    }
    await this.downloadBinary({ version });

    return binPath;
  }

  getVersionBinPath(version) {
    const binaryName = this.getBinaryName(version);

    return join(config.binaryDirectory, binaryName);
  }

  getBinaryName(version) {
    switch (platform()) {
      case 'win32': return `storagenode-${version}.exe`;
      case 'linux': return `storagenode-${version}`;
      default: throw new Error(`Unsupported platform: ${platform()}`);
    }
  }

  getDownloadUrl(version) {
    switch (platform()) {
      case 'win32': return `https://github.com/storj/storj/releases/download/v${version}/storagenode_windows_amd64.exe.zip`;
      case 'linux': return `https://github.com/storj/storj/releases/download/v${version}/storagenode_linux_amd64.zip`;
      default: throw new Error(`Unsupported platform: ${platform()}`);
    }
  }

  getDownloadBinaryName() {
    switch (platform()) {
      case 'win32': return 'storagenode.exe';
      case 'linux': return 'storagenode';
      default: throw new Error(`Unsupported platform: ${platform()}`);
    }
  }

  async downloadBinary({ version }) {
    logger.log({ level: 'info', msg: `Binary-Manager | Downloading version ${version} ..`});

    const tempDir = join(tmpdir(), 'storj-manager');
    mkdirp.sync(tempDir, { mode: 0o770 });
    const zipFilePath = join(tempDir, `storagenode-${version}.zip`);

    const res = await axios.get(this.getDownloadUrl(version), { responseType: 'stream' });
    const writer = createWriteStream(zipFilePath);
    res.data.pipe(writer);

    try {
      await new Promise((resolve, reject) => {
        writer.on('finish', resolve);
        writer.on('error', reject);
      });
    } catch (err) {
      logger.log({level: 'debug', msg: `Binary-Manager | Failed downloading version ${version}`});

      throw err;
    }

    try {
      await decompress(
        zipFilePath,
        config.binaryDirectory, {
          filter: file => file.path === this.getDownloadBinaryName(),
          map: file => {
            file.path = this.getBinaryName(version);

            return file;
          }
        },
      );
    } catch (err) {
      logger.log({level: 'debug', msg: `Binary-Manager | Failed to extract binary for version ${version}`});

      throw err;
    }

    await fs.unlink(zipFilePath);

    logger.log({ level: 'debug', msg: `Binary-Manager | Finished downloading version ${version}`});
  }

  async retrieveSuggestedVersion() {
    const { data } = await axios.get('https://version.storj.io');

    return data.processes.storagenode.suggested.version;
  }
}

module.exports = new BinaryManager();
