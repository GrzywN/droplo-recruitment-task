const fs = require('fs');
const path = require('path');
const { parse } = require('csv-parse');
const { default: axios } = require('axios');
const sharp = require('sharp');
const mongoose = require('mongoose');
const { string, integer, assert } = require('superstruct');

assert(process.env.MONGO_URI, string());
assert(parseFloat(process.env.DEFAULT_BATCH_SIZE), integer());

const STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
};

mongoose.connect(process.env.MONGO_URI);

const ImageSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true },
    index: { type: Number, required: true, index: true },
    thumbnail: { type: Buffer, required: true },
    processedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      required: true,
      enum: Object.values(STATUS),
      index: true,
    },
    errorMessage: { type: String },
  },
  { timestamps: true, _id: false },
);

const ImageModel = mongoose.model('Image', ImageSchema);

const CONFIG = {
  HTTP_TIMEOUT: 30000,
  MAX_FILE_SIZE: 120 * 1024 * 1024, // 120MB
  DEFAULT_BATCH_SIZE: parseInt(process.env.DEFAULT_BATCH_SIZE, 10),
  THUMBNAIL_WIDTH: 100,
  THUMBNAIL_HEIGHT: 100,
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000,
};

class ImageProcessor {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.processedCount = 0;
    this.errorCount = 0;

    this.axiosInstance = axios.create({
      timeout: CONFIG.HTTP_TIMEOUT,
      maxContentLength: CONFIG.MAX_FILE_SIZE,
    });
  }

  async start() {
    await this.validateConnection();

    const batchSize = CONFIG.DEFAULT_BATCH_SIZE;
    const filePath = path.join(__dirname, `data/data.csv`);

    this.logger.info(`Batch size: ${batchSize}`);

    let currentBatch = [];

    const parser = fs.createReadStream(filePath).pipe(
      parse({
        columns: true,
        skip_empty_lines: true,
        trim: true,
      }),
    );

    for await (const record of parser) {
      if (!(await this.validateRecord(record))) {
        this.logger.warn({
          message: 'Invalid record skipped',
          record,
          reason: 'Validation failed',
        });

        continue;
      }

      currentBatch.push({
        index: parseInt(record.index, 10),
        _id: record.id,
        url: record.url,
        thumbnail: null,
      });

      if (currentBatch.length >= batchSize) {
        await this.processBatch(currentBatch);
        currentBatch = [];
      }
    }

    // Process any remaining records
    if (currentBatch.length > 0) {
      await this.processBatch(currentBatch);
    }

    this.logger.info(
      `Processing completed. Total processed: ${this.processedCount}`,
    );
  }

  async validateConnection() {
    return new Promise((resolve, reject) => {
      mongoose.connection.on('connected', resolve);
      mongoose.connection.on('error', reject);
    });
  }

  async validateRecord(record) {
    try {
      assert(parseInt(record.index, 10), integer());
      assert(record.id, string());
      assert(record.url, string());
      new URL(record.url);
    } catch {
      return false;
    }

    return true;
  }

  async processBatch(batch) {
    try {
      const images = await this.processChunk(batch);
      const operations = images.map((image) => ({
        updateOne: {
          filter: { _id: image._id },
          update: { $set: image },
          upsert: true,
        },
      }));

      const result = await ImageModel.bulkWrite(operations);

      this.processedCount += result.insertedCount + result.modifiedCount;
      this.logger.info({
        message: 'Batch processed',
        batchSize: batch.length,
        successful: result.insertedCount + result.modifiedCount,
        lastProcessedIndex: batch[batch.length - 1].index,
        lastProcessedId: batch[batch.length - 1]._id,
        totalProcessed: this.processedCount,
        totalErrors: this.errorCount,
      });

      // Periodically trigger garbage collection
      if (this.processedCount % 1000 === 0 && global.gc) {
        global.gc();
      }
    } catch (error) {
      this.logger.error({
        message: 'Batch processing failed',
        error: error.message,
        stack: error.stack,
        batchSize: batch.length,
        firstId: batch[0]._id,
        lastId: batch[batch.length - 1]._id,
      });
    }
  }

  async processChunk(rawEntities) {
    const tasks = rawEntities.map((rawEntity) =>
      this.createThumbnail(rawEntity),
    );
    return Promise.all(tasks);
  }

  async createThumbnail(rawEntity, retries = CONFIG.RETRY_ATTEMPTS || 3) {
    try {
      const response = await this.axiosInstance.get(rawEntity.url, {
        responseType: 'arraybuffer',
      });
      const buffer = await sharp(response.data)
        .resize(CONFIG.THUMBNAIL_WIDTH, CONFIG.THUMBNAIL_HEIGHT)
        .toBuffer();

      return {
        _id: rawEntity._id,
        index: rawEntity.index,
        thumbnail: buffer,
        status: 'success',
        processedAt: new Date(),
      };
    } catch (error) {
      if (retries > 0) {
        this.logger.warn(
          `Retrying thumbnail creation for ID ${rawEntity.id}. Retries left: ${retries - 1}`,
        );

        await new Promise((resolve) =>
          setTimeout(resolve, CONFIG.RETRY_DELAY || 1000),
        );

        return this.createThumbnail(rawEntity, retries - 1);
      }

      this.logger.error(
        `Error creating thumbnail for ID ${rawEntity.id}: ${error.message}`,
      );
      this.errorCount++;

      return {
        _id: rawEntity._id,
        index: rawEntity.index,
        thumbnail: Buffer.from([]),
        status: 'error',
        processedAt: new Date(),
        errorMessage: error.message,
      };
    }
  }
}

module.exports = ImageProcessor;
